const assert = require("assert");
require("../src/services/ownership-history-provenance-evidence-factory.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipProjectionComparator } = require("../src/services/ownership-projection-comparator.js");
const { createOwnershipHistoryCompletenessEvaluator } = require("../src/services/ownership-history-completeness-evaluator.js");
const { createOwnershipProvenanceMigrationDecisionService } = require("../src/services/ownership-provenance-migration-decision-service.js");

const context = {
  seasonId: "season-1",
  baseMapId: "season1-map",
  activeSeason: { seasonId: "season-1", baseMapId: "season1-map", serverIds: ["server-367", "server-366"] },
  sourceDocumentIds: { strategic: "strategic-season-1", projection: "projection-season-1-season1-map" }
};
const catalog = {
  territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
  structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }] }]
};

function territory(serverId, key, owner = "union-1") {
  const [row, col] = key.split("-").map(Number);
  return {
    ownershipRecordId: `${serverId}-${key}`,
    serverId,
    seasonId: context.seasonId,
    territoryRef: { type: "normal_map_cell", row, col },
    ownerUnionId: owner,
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-08-01T00:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-08-01T00:10:00Z",
    supersededBy: null
  };
}

function structure(serverId, ownershipState = "unknown") {
  return {
    structureOwnershipId: `${serverId}-fort-1`,
    serverId,
    seasonId: context.seasonId,
    structureId: "fort-1",
    ownerUnionId: ownershipState === "owned" ? "union-1" : null,
    ownershipState,
    reviewState: "confirmed",
    effectiveAt: "2026-08-01T00:00:00Z",
    eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" },
    observedAt: null,
    recordedAt: null,
    recordedAtLegacyUnknown: false,
    ruleVersionRef: null,
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-08-01T00:10:00Z",
    supersededBy: null
  };
}

function projection(servers) {
  return {
    schemaVersion: 1,
    seasonId: context.seasonId,
    baseMapId: context.baseMapId,
    savedAt: "2026-08-01T00:00:00.000Z",
    servers: context.activeSeason.serverIds.map((id) => ({ id, ownership: servers[id] || {} }))
  };
}

function createService() {
  return createOwnershipProvenanceMigrationDecisionService({
    createCompletenessEvaluator: (options) => createOwnershipHistoryCompletenessEvaluator({
      ...options,
      ownershipHistoryResolver: createOwnershipHistoryResolver(options),
      ownershipProjectionComparator: createOwnershipProjectionComparator()
    })
  });
}

function input(overrides = {}) {
  return {
    activeSeason: context.activeSeason,
    sourceDocumentIds: context.sourceDocumentIds,
    territoryRecords: [territory("server-366", "1-1"), territory("server-366", "1-2"), territory("server-367", "1-1"), territory("server-367", "1-2")],
    structureRecords: [],
    targetCatalog: catalog,
    persistedProjection: projection({
      "server-366": { "1-1": "union-1", "1-2": "union-1" },
      "server-367": { "1-1": "union-1", "1-2": "union-1" }
    }),
    provenanceState: { status: "unknown_provenance" },
    ...overrides
  };
}

function evidenceFor(serverId, overrides = {}) {
  const result = createService().decide(input({
    activeSeason: { ...context.activeSeason, serverIds: [serverId] },
    territoryRecords: [territory(serverId, "1-1"), territory(serverId, "1-2")],
    persistedProjection: {
      schemaVersion: 1,
      seasonId: context.seasonId,
      baseMapId: context.baseMapId,
      savedAt: "2026-08-01T00:00:00.000Z",
      servers: [{ id: serverId, ownership: { "1-1": "union-1", "1-2": "union-1" } }]
    },
    ...overrides
  }));
  assert.notStrictEqual(result.decision, "migration_blocked");
  return result.candidateProvenanceRecords[0];
}

function test(name, callback) {
  callback();
  console.log(`PASS ${name}`);
}

test("returns migration_eligible with fresh deterministic candidate records", () => {
  const result = createService().decide(input());
  assert.strictEqual(result.decision, "migration_eligible");
  assert.deepStrictEqual(result.repairServerIds, []);
  assert.deepStrictEqual(result.candidateProvenanceRecords.map((record) => record.serverId), ["server-366", "server-367"]);
  assert.deepStrictEqual(result.candidateProvenanceRecords[0].sourceDocumentIds, ["projection-season-1-season1-map", "strategic-season-1"]);
});

test("returns already_proven and preserves matching existing provenance", () => {
  const first = createService().decide(input({ activeSeason: { ...context.activeSeason, serverIds: ["server-366"] } }));
  const existing = first.candidateProvenanceRecords[0];
  const result = createService().decide(input({ activeSeason: { ...context.activeSeason, serverIds: ["server-366"] }, provenanceState: { status: "present", document: { seasonId: context.seasonId, baseMapId: context.baseMapId, records: [existing] } } }));
  assert.strictEqual(result.decision, "already_proven");
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "candidateProvenanceRecords"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "repairServerIds"));
});

test("returns migration_with_projection_repair for deterministic drift", () => {
  const result = createService().decide(input({ persistedProjection: projection({ "server-366": { "1-1": "union-1" }, "server-367": { "1-1": "union-1", "1-2": "union-1", "9-9": "union-1" } }) }));
  assert.strictEqual(result.decision, "migration_with_projection_repair");
  assert.deepStrictEqual(result.repairServerIds, ["server-366", "server-367"]);
});

test("blocks every server and returns no plan when one server is unsafe", () => {
  const result = createService().decide(input({ territoryRecords: input().territoryRecords.filter((record) => record.serverId !== "server-367") }));
  assert.strictEqual(result.decision, "migration_blocked");
  assert.deepStrictEqual(result.serverReasons.map((entry) => entry.serverId), ["server-366", "server-367"]);
  assert.strictEqual(result.serverReasons.find((entry) => entry.serverId === "server-367").reason, "partial_territory_history");
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "candidateProvenanceRecords"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "repairServerIds"));
});

test("blocks projection-only ownership without inventing history", () => {
  const result = createService().decide(input({ territoryRecords: [], structureRecords: [], persistedProjection: projection({ "server-366": { "1-1": "union-1" }, "server-367": {} }) }));
  assert.strictEqual(result.decision, "migration_blocked");
  assert.strictEqual(result.serverReasons.find((entry) => entry.serverId === "server-366").reason, "projection_only");
});

test("keeps structure coverage separate from territory eligibility", () => {
  const result = createService().decide(input({ structureRecords: [structure("server-366")] }));
  assert.strictEqual(result.decision, "migration_eligible");
  assert.deepStrictEqual(result.candidateProvenanceRecords.map((record) => record.serverId), ["server-366", "server-367"]);
});

test("preserves inactive records and blocks conflicting active provenance", () => {
  const inactive = evidenceFor("server-999");
  const active = evidenceFor("server-366");
  const conflict = { ...active, safetyDiagnosticCodes: ["forged"] };
  const result = createService().decide(input({
    activeSeason: { ...context.activeSeason, serverIds: ["server-366"] },
    provenanceState: { status: "present", document: { seasonId: context.seasonId, baseMapId: context.baseMapId, records: [inactive, conflict] } }
  }));
  assert.strictEqual(result.decision, "migration_blocked");
  assert.strictEqual(result.serverReasons[0].reason, "conflicting_existing_provenance");
  const eligible = createService().decide(input({
    activeSeason: { ...context.activeSeason, serverIds: ["server-366"] },
    provenanceState: { status: "present", document: { seasonId: context.seasonId, baseMapId: context.baseMapId, records: [inactive] } }
  }));
  assert.strictEqual(eligible.decision, "migration_eligible");
  assert.deepStrictEqual(eligible.candidateProvenanceRecords.map((record) => record.serverId), ["server-366", "server-999"]);
});

test("validates source documents, ordering, and immutability", () => {
  const candidate = input();
  const before = JSON.stringify(candidate);
  const result = createService().decide(candidate);
  assert.strictEqual(JSON.stringify(candidate), before);
  assert.deepStrictEqual(result.serverReasons.map((entry) => entry.serverId), ["server-366", "server-367"]);
  assert.throws(() => createService().decide(input({ sourceDocumentIds: { strategic: "same", projection: "same" } })), /distinct strategic and projection/);
  assert.throws(() => createService().decide(input({ sourceDocumentIds: { strategic: "", projection: "projection" } })), /non-empty string/);
});

console.log("8 ownership provenance migration decision scenarios passed");