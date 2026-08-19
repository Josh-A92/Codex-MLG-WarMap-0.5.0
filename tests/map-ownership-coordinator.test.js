const assert = require("assert");
const {
  createMapOwnershipCoordinator,
  MapOwnershipCoordinatorError
} = require("../src/services/map-ownership-coordinator.js");
const {
  createAtomicOperationExecutor
} = require("../src/services/atomic-operation-executor.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function participant(initialValue) {
  return {
    value: structuredClone(initialValue),
    captureTransactionState() { return structuredClone(this.value); },
    restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); }
  };
}

function targetKey(ref) {
  return ref.type === "strategic_node"
    ? JSON.stringify(["strategic_node", ref.nodeId])
    : `${ref.row}-${ref.col}`;
}

function setup(overrides = {}) {
  const calls = [];
  const relationState = participant([]);
  relationState.hasRelation = function hasRelation(seasonId, serverId, unionId) {
    return this.value.some((entry) => (
      entry.seasonId === seasonId
      && entry.serverId === serverId
      && entry.unionId === unionId
    ));
  };

  const ownershipState = participant({ territory: [], structures: [] });
  ownershipState.listTerritoryRecords = function listTerritoryRecords(filter) {
    return this.value.territory.filter((record) => {
      if (filter.seasonId && record.seasonId !== filter.seasonId) return false;
      if (filter.serverId && record.serverId !== filter.serverId) return false;
      if (filter.reviewState && record.reviewState !== filter.reviewState) return false;
      return true;
    }).map((record) => structuredClone(record));
  };
  ownershipState.listStructureRecords = function listStructureRecords(filter) {
    return this.value.structures.filter((record) => {
      if (filter.seasonId && record.seasonId !== filter.seasonId) return false;
      if (filter.serverId && record.serverId !== filter.serverId) return false;
      if (filter.reviewState && record.reviewState !== filter.reviewState) return false;
      return true;
    }).map((record) => structuredClone(record));
  };

  const verificationState = participant([]);
  verificationState.addConfirmedVerification = function addConfirmedVerification(record) {
    this.value.push(structuredClone(record));
    calls.push(["verification", record]);
    return structuredClone(record);
  };

  const projectionState = participant({
    "server-366": { "1-1": "union-old", "2-2": null },
    "server-367": {}
  });
  projectionState.replaceTerritoryOwnership = function replaceTerritoryOwnership(ownershipByServerId) {
    if (overrides.failProjection) {
      throw new Error("projection failed");
    }
    this.value = structuredClone(ownershipByServerId);
    calls.push(["replaceProjection", ownershipByServerId]);
  };

  const evidenceById = new Map();
  const evidenceState = participant({ evidenceById: {} });
    const retractionState = participant([]);
    retractionState.listRetractions = function listRetractions(filter) {
      return this.value.filter((record) => {
        if (filter && filter.seasonId && record.seasonId !== filter.seasonId) return false;
        if (filter && filter.serverId && record.serverId !== filter.serverId) return false;
        return true;
      }).map((record) => structuredClone(record));
    };
    retractionState.addManualRetraction = function addManualRetraction(record) {
      this.value.push(structuredClone(record));
      calls.push(["retraction", record]);
      return structuredClone(record);
    };

  evidenceState.getEvidenceRecord = function getEvidenceRecord(evidenceId) {
    return evidenceById.has(evidenceId) ? structuredClone(evidenceById.get(evidenceId)) : null;
  };

  function addEvidence(id, seasonId = "season-1", serverId = "server-366") {
    evidenceById.set(id, { evidenceId: id, scope: { seasonId, serverId } });
  }

  addEvidence("evidence-1");
  addEvidence("evidence-2");

  let territoryCounter = 0;
  let structureCounter = 0;

  function supersedeCurrentTerritory(nextRecord) {
    const next = ownershipState.value.territory.map((record) => {
      if (nextRecord.eventAt && nextRecord.eventAt.precision === "exact"
          && (!record.eventAt || record.eventAt.precision === "exact")
          && record.reviewState === "confirmed"
          && record.supersededBy === null
          && record.serverId === nextRecord.serverId
          && record.seasonId === nextRecord.seasonId
          && JSON.stringify(record.territoryRef) === JSON.stringify(nextRecord.territoryRef)) {
        return { ...record, reviewState: "superseded", supersededBy: nextRecord.ownershipRecordId };
      }
      return record;
    });
    next.push(nextRecord);
    ownershipState.value.territory = next;
  }

  function supersedeCurrentStructure(nextRecord) {
    const next = ownershipState.value.structures.map((record) => {
      if (nextRecord.eventAt && nextRecord.eventAt.precision === "exact"
          && (!record.eventAt || record.eventAt.precision === "exact")
          && record.reviewState === "confirmed"
          && record.supersededBy === null
          && record.serverId === nextRecord.serverId
          && record.seasonId === nextRecord.seasonId
          && record.structureId === nextRecord.structureId) {
        return { ...record, reviewState: "superseded", supersededBy: nextRecord.structureOwnershipId };
      }
      return record;
    });
    next.push(nextRecord);
    ownershipState.value.structures = next;
  }

  const management = {
    addKnownUnion(actor, input) {
      calls.push(["known", actor, input]);
      relationState.value.push(structuredClone(input));
      return structuredClone(input);
    },
    recordManualTerritoryOwnership(actor, input) {
      territoryCounter += 1;
      const record = {
        ownershipRecordId: `territory-${territoryCounter}`,
        ...structuredClone(input),
        ...(input.eventAt && input.eventAt.precision === "exact" ? { effectiveAt: input.eventAt.at } : {}),
        sourceType: "manual_entry",
        reviewState: "confirmed",
        actorId: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: "2026-08-19T10:00:00.000Z",
        supersededBy: null
      };
      supersedeCurrentTerritory(record);
      calls.push(["territory", record]);
      return structuredClone(record);
    },
    recordManualStructureOwnership(actor, input) {
      structureCounter += 1;
      const record = {
        structureOwnershipId: `structure-${structureCounter}`,
        ...structuredClone(input),
        ...(input.eventAt && input.eventAt.precision === "exact" ? { effectiveAt: input.eventAt.at } : {}),
        sourceType: "manual_entry",
        reviewState: "confirmed",
        actorId: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: "2026-08-19T10:00:00.000Z",
        supersededBy: null
      };
      supersedeCurrentStructure(record);
      calls.push(["structure", record]);
      return structuredClone(record);
    }
  };

  if (Array.isArray(overrides.initialTerritoryRecords)) {
    ownershipState.value.territory = overrides.initialTerritoryRecords.map((record) => structuredClone(record));
  }
  if (Array.isArray(overrides.initialStructureRecords)) {
    ownershipState.value.structures = overrides.initialStructureRecords.map((record) => structuredClone(record));
  }

  const seasonAdministrationService = {
    captureTransactionState() { return null; },
    restoreTransactionState() {},
    getActiveSeason() {
      if (overrides.archivedSeason) {
        return { seasonId: "season-2", serverIds: ["server-999"] };
      }
      return { seasonId: "season-1", serverIds: ["server-366", "server-367"] };
    }
  };

  const atomic = createAtomicOperationExecutor({
    participants: [relationState, ownershipState, retractionState, verificationState, projectionState, evidenceState]
  });

  const coordinator = createMapOwnershipCoordinator({
    relationService: relationState,
    serverIntelligenceManagementService: management,
    targetVerificationService: verificationState,
    ownershipRecordService: ownershipState,
    ownershipRetractionService: retractionState,
    evidenceRecordService: evidenceState,
    resolveEvidenceScope(record) {
      return structuredClone(record.scope);
    },
    seasonAdministrationService,
    serverStateService: projectionState,
    targetCatalog: {
      territoryKeys: [
        { row: 1, col: 1 },
        { row: 2, col: 2 },
        { row: 4, col: 4 },
        { row: 4, col: 5 },
        { type: "strategic_node", nodeId: "node-a" }
      ],
      structures: [
        {
          structureId: "town-1",
          footprint: [{ row: 4, col: 4 }, { row: 4, col: 5 }]
        }
      ]
    },
    executeAtomically: atomic.executeAtomically,
    createId() {
      return `verification-${verificationState.value.length + 1}`;
    },
    clock() {
      return overrides.clock
        ? overrides.clock()
        : new Date("2026-08-19T10:00:00.000Z");
    }
  });

  return {
    calls,
    relationState,
    ownershipState,
    verificationState,
    projectionState,
    evidenceById,
    coordinator
  };
}

const actor = { actorId: "desktop-user" };

async function captureTerritory(context, input) {
  return context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    ...input,
    evidenceIds: []
  });
}

async function captureStructure(context, input) {
  return context.coordinator.setStructureOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    ...input,
    evidenceIds: []
  });
}

test("production coordinator unwinds A to B to C retractions and omits unclaimed targets", async () => {
  const context = setup();
  const a = await captureTerritory(context, { row: 1, col: 1, ownerUnionId: "union-a", eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" } });
  const b = await captureTerritory(context, { row: 1, col: 1, ownerUnionId: "union-b", eventAt: { precision: "exact", at: "2026-08-19T09:01:00.000Z" } });
  const c = await captureTerritory(context, { row: 1, col: 1, ownerUnionId: "union-c", eventAt: { precision: "exact", at: "2026-08-19T09:02:00.000Z" } });
  assert.strictEqual(context.projectionState.value["server-366"]["1-1"], "union-c");

  await context.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", row: 1, col: 1, retractedRecordId: c.record.ownershipRecordId, reason: "undo c", transactionId: "tx-c" });
  assert.strictEqual(context.projectionState.value["server-366"]["1-1"], "union-b");
  await context.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", row: 1, col: 1, retractedRecordId: b.record.ownershipRecordId, reason: "undo b", transactionId: "tx-b" });
  assert.strictEqual(context.projectionState.value["server-366"]["1-1"], "union-a");
  await context.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", row: 1, col: 1, retractedRecordId: a.record.ownershipRecordId, reason: "undo a", transactionId: "tx-a" });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(context.projectionState.value["server-366"], "1-1"), false);
  assert.strictEqual(context.calls.find((entry) => entry[0] === "retraction")[1].recordedAt, "2026-08-19T10:00:00.000Z");
});

test("coordinator rejects a clock that does not return a valid Date", async () => {
  const context = setup({ clock: () => "2026-08-19T10:00:00.000Z" });
  const capture = await captureTerritory(context, { row: 1, col: 1, ownerUnionId: "union-a", eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" } });
  await assert.rejects(
    () => context.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", row: 1, col: 1, retractedRecordId: capture.record.ownershipRecordId, reason: "undo", transactionId: "tx" }),
    (error) => error instanceof MapOwnershipCoordinatorError && error.code === "invalid_clock"
  );
});

test("production coordinator unwinds strategic nodes and retains structure-underlying territory facts", async () => {
  const strategic = setup();
  const a = await captureTerritory(strategic, { territoryRef: { type: "strategic_node", nodeId: "node-a" }, ownerUnionId: "union-a", eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" } });
  const b = await captureTerritory(strategic, { territoryRef: { type: "strategic_node", nodeId: "node-a" }, ownerUnionId: "union-b", eventAt: { precision: "exact", at: "2026-08-19T09:01:00.000Z" } });
  const c = await captureTerritory(strategic, { territoryRef: { type: "strategic_node", nodeId: "node-a" }, ownerUnionId: "union-c", eventAt: { precision: "exact", at: "2026-08-19T09:02:00.000Z" } });
  await strategic.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", territoryRef: { type: "strategic_node", nodeId: "node-a" }, retractedRecordId: c.record.ownershipRecordId, reason: "undo c", transactionId: "tx-c" });
  assert.strictEqual(strategic.projectionState.value["server-366"][JSON.stringify(["strategic_node", "node-a"])], "union-b");
  await strategic.coordinator.retractTerritoryOwnership(actor, { seasonId: "season-1", serverId: "server-366", territoryRef: { type: "strategic_node", nodeId: "node-a" }, retractedRecordId: b.record.ownershipRecordId, reason: "undo b", transactionId: "tx-b" });
  assert.strictEqual(strategic.projectionState.value["server-366"][JSON.stringify(["strategic_node", "node-a"])], "union-a");

  const structure = setup();
  const territory = await captureTerritory(structure, { row: 4, col: 4, ownerUnionId: "union-base", eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" } });
  const captured = await captureStructure(structure, { structureId: "town-1", ownerUnionId: "union-structure", eventAt: { precision: "exact", at: "2026-08-19T09:01:00.000Z" } });
  assert.strictEqual(structure.projectionState.value["server-366"]["4-4"], "union-structure");
  await structure.coordinator.retractStructureOwnership(actor, { seasonId: "season-1", serverId: "server-366", structureId: "town-1", retractedRecordId: captured.record.structureOwnershipId, reason: "undo structure", transactionId: "tx-structure" });
  assert.strictEqual(structure.projectionState.value["server-366"]["4-4"], "union-base");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(structure.projectionState.value["server-366"], "4-5"), false);
  assert.ok(territory.record.ownershipRecordId);
});

test("captures normal_map_cell ownership with evidence-backed exact event time", async () => {
  const context = setup();
  const result = await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 1,
    col: 1,
    ownerUnionId: "union-1",
    eventAt: { precision: "exact", at: "2026-08-19T09:55:00.000Z" },
    evidenceIds: ["evidence-1", "evidence-2"]
  });

  assert.strictEqual(result.targetType, "normal_map_cell");
  assert.deepStrictEqual(result.projectedTerritoryKeys, ["1-1"]);
  assert.strictEqual(context.ownershipState.value.territory.length, 1);
  assert.deepStrictEqual(context.ownershipState.value.territory[0].eventAt, {
    precision: "exact",
    at: "2026-08-19T09:55:00.000Z"
  });
  assert.deepStrictEqual(context.verificationState.value[0].evidenceIds, ["evidence-1", "evidence-2"]);
  assert.strictEqual(context.projectionState.value["server-366"]["1-1"], "union-1");
});

test("captures strategic_node ownership targets", async () => {
  const context = setup();
  const result = await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    territoryRef: { type: "strategic_node", nodeId: "node-a" },
    ownerUnionId: "union-2",
    eventAt: {
      precision: "bounded",
      earliestAt: "2026-08-19T09:00:00.000Z",
      latestAt: "2026-08-19T10:00:00.000Z"
    },
    evidenceIds: ["evidence-1"]
  });

  assert.strictEqual(result.targetType, "strategic_node");
  assert.deepStrictEqual(result.projectedTerritoryKeys, [JSON.stringify(["strategic_node", "node-a"])]);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      context.projectionState.value["server-366"],
      JSON.stringify(["strategic_node", "node-a"])
    ),
    false
  );
});

test("rejects evidence outside season/server scope", async () => {
  const context = setup();
  context.evidenceById.set("evidence-out", {
    evidenceId: "evidence-out",
    scope: { seasonId: "season-2", serverId: "server-999" }
  });

  await assert.rejects(
    context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      row: 1,
      col: 1,
      ownerUnionId: "union-1",
      evidenceIds: ["evidence-out"],
      eventAt: { precision: "exact", at: "2026-08-19T09:55:00.000Z" }
    }),
    (error) => error instanceof MapOwnershipCoordinatorError
      && error.code === "evidence_scope_mismatch"
  );
  assert.deepStrictEqual(context.ownershipState.value.territory, []);
  assert.deepStrictEqual(context.verificationState.value, []);
});

test("rejects ambiguous or over-specified territory references", async () => {
  const context = setup();
  assert.throws(
    () => context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      row: 1,
      col: 1,
      territoryRef: { type: "strategic_node", nodeId: "node-a" },
      ownerUnionId: "union-1"
    }),
    (error) => error instanceof MapOwnershipCoordinatorError && error.code === "invalid_input"
  );
  assert.throws(
    () => context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      territoryRef: { type: "strategic_node", nodeId: "node-a", row: 1 },
      ownerUnionId: "union-1"
    }),
    (error) => error instanceof MapOwnershipCoordinatorError && error.code === "invalid_input"
  );
});

test("rejects capture against archived or inactive seasons", async () => {
  const context = setup({ archivedSeason: true });

  await assert.rejects(
    context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      row: 1,
      col: 1,
      ownerUnionId: "union-1",
      eventAt: { precision: "exact", at: "2026-08-19T09:55:00.000Z" }
    }),
    (error) => error instanceof MapOwnershipCoordinatorError
      && error.code === "archived_season"
  );
  assert.deepStrictEqual(context.ownershipState.value.territory, []);
});

test("rebuilds projection from authoritative structure history", async () => {
  const context = setup({
    initialStructureRecords: [{
      structureOwnershipId: "structure-existing",
      seasonId: "season-1",
      serverId: "server-366",
      structureId: "town-1",
      ownerUnionId: "union-1",
      ownershipState: "owned",
      sourceType: "manual_entry",
      eventAt: { precision: "exact", at: "2026-08-19T09:00:00.000Z" },
      effectiveAt: "2026-08-19T09:00:00.000Z",
      evidenceIds: [],
      actorId: "desktop-user",
      reviewerId: "desktop-user",
      reviewState: "confirmed",
      reviewedAt: "2026-08-19T09:05:00.000Z",
      supersededBy: null
    }]
  });

  await context.coordinator.setStructureOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    structureId: "town-1",
    ownerUnionId: null,
    eventAt: { precision: "exact", at: "2026-08-19T10:00:00.000Z" },
    evidenceIds: ["evidence-1"]
  });

  assert.strictEqual(context.projectionState.value["server-366"]["4-4"], null);
  assert.strictEqual(context.projectionState.value["server-366"]["4-5"], null);
  const oldRecord = context.ownershipState.value.structures.find((record) => record.structureOwnershipId === "structure-existing");
  const replacement = context.ownershipState.value.structures.find((record) => record.structureOwnershipId !== "structure-existing");
  assert.strictEqual(oldRecord.reviewState, "superseded");
  assert.strictEqual(oldRecord.supersededBy, replacement.structureOwnershipId);
  assert.strictEqual(replacement.reviewState, "confirmed");
});

test("rolls back history and projection changes when projection replacement fails", async () => {
  const context = setup({ failProjection: true });
  const beforeProjection = structuredClone(context.projectionState.value);

  await assert.rejects(
    context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      row: 1,
      col: 1,
      ownerUnionId: "union-1",
      eventAt: { precision: "exact", at: "2026-08-19T09:55:00.000Z" }
    }),
    /projection failed/
  );

  assert.deepStrictEqual(context.relationState.value, []);
  assert.deepStrictEqual(context.ownershipState.value, { territory: [], structures: [] });
  assert.deepStrictEqual(context.verificationState.value, []);
  assert.deepStrictEqual(context.projectionState.value, beforeProjection);
});

let passed = 0;
(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
