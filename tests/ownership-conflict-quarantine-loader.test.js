const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const unions = require("../data/unions.json");
const season1Servers = require("../data/season1-servers.json");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { createStrategicDomainModuleRegistry } = require("../src/app/strategic-domain-module-registry.js");
const { createStrategicDomainRuntime } = require("../src/app/strategic-domain-runtime.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { createEvidenceDomainModuleRegistry } = require("../src/app/evidence-domain-module-registry.js");
const { createEvidenceDomainRuntime } = require("../src/app/evidence-domain-runtime.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");
const { createServerStateService } = require("../src/services/server-state-service.js");
const { serializeServerState } = require("../src/services/persistence-state-serializer.js");
const { createApplicationAuditRecordSerializer } = require("../src/services/application-audit-record-serializer.js");
const { validateAuditHistory } = require("../src/services/application-audit-record-validator.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../src/services/ownership-history-provenance-document-serializer.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipConflictAnalysisService } = require("../src/services/ownership-conflict-analysis-service.js");
const { validateTerritoryOwnershipRecord, validateStructureOwnershipRecord } = require("../src/services/ownership-record-validator.js");
const { validateOwnershipRetractionRecord } = require("../src/services/ownership-retraction-validator.js");
const { createOwnershipConflictQuarantineLoader, OwnershipConflictQuarantineLoaderError } = require("../src/services/ownership-conflict-quarantine-loader.js");
const { createOwnershipConflictRecoveryPlanBuilder } = require("../src/services/ownership-conflict-recovery-plan-builder.js");

const savedAt = "2026-08-20T10:00:00.000Z";
const targetCatalog = {
  territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
  structures: [{ structureId: "fort-1", footprint: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }]
};
const strategicNames = ["union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service", "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator", "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator", "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator", "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service", "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service", "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service", "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"];
const strategicModules = createStrategicDomainModuleRegistry(strategicNames.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {}));
const evidenceModules = createEvidenceDomainModuleRegistry({ ...require("../src/services/evidence-asset-validator.js"), ...require("../src/services/evidence-asset-service.js"), ...require("../src/services/evidence-record-validator.js"), ...require("../src/services/evidence-record-service.js") });
const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModules.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModules.validateEvidenceRecordHistory });
const auditSerializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();

function territory(overrides = {}) {
  return { ownershipRecordId: "territory-1", seasonId: "season-1", serverId: "server-366", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-0001", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-20T09:00:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:00:00Z" }, sourceType: "manual_entry", evidenceIds: [], actorId: "operator", reviewerId: "operator", reviewedAt: "2026-08-20T09:10:00Z", supersededBy: null, ...overrides };
}
function structure(overrides = {}) {
  return { structureOwnershipId: "structure-1", seasonId: "season-1", serverId: "server-366", structureId: "fort-1", ownerUnionId: "union-0001", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-20T09:00:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:00:00Z" }, sourceType: "manual_entry", evidenceIds: [], actorId: "operator", reviewerId: "operator", reviewedAt: "2026-08-20T09:10:00Z", supersededBy: null, ...overrides };
}
function retraction(overrides = {}) {
  return { retractionId: "retraction-1", seasonId: "season-1", serverId: "server-366", targetKind: "territory_ownership_record", retractedRecordId: "territory-1", actorId: "operator", reason: "undo", recordedAt: "2026-08-20T09:20:00Z", transactionId: "transaction-1", sourceType: "manual_retraction", ...overrides };
}
function auditRecord(overrides = {}) {
  return { auditId: "audit-1", transactionId: "transaction-1", sequence: 1, actionType: "ownership_confirmed", targetType: "ownership_record", targetId: "territory-1", seasonId: "season-1", serverId: "server-366", actorId: "operator", recordedAt: "2026-08-20T09:20:00.000Z", outcome: "accepted", details: { source: "fixture" }, ...overrides };
}
function admin(archived = false) {
  const activation = { schemaVersion: 1, seasonId: "season-1", packageVersion: SEASON_1_PACKAGE.packageIdentity.packageVersion, serverIds: ["server-366"], confirmations: { mapAndStructures: true, resourcesAndValues: true }, activatedAt: "2026-08-20T08:00:00Z", activatedBy: "operator" };
  return archived ? { schemaVersion: 2, activeSeason: null, completedSeasons: [{ ...activation, completedAt: "2026-08-20T09:00:00Z", completedBy: "operator" }] } : { schemaVersion: 2, activeSeason: activation, completedSeasons: [] };
}

async function createFixture(directory, options = {}) {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicRuntime = createStrategicDomainRuntime({ modules: strategicModules, unionRegistryService, initialState: { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: [], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] } });
  const evidenceRuntime = createEvidenceDomainRuntime({ modules: evidenceModules, initialState: { assets: [], evidenceRecords: [] } });
  const serverStateService = createServerStateService({ seasonId: "season-1", baseMapId: "season1-map", servers: season1Servers.servers.map((server) => ({ ...server, ownership: server.id === "server-366" ? { "1-1": "union-0001" } : {} })) });
  const strategicValue = serializeStrategicDomainRuntime(strategicRuntime, "season-1", savedAt);
  strategicValue.state.territoryOwnershipRecords = options.territoryRecords || [];
  strategicValue.state.structureOwnershipRecords = options.structureRecords || [];
  strategicValue.state.ownershipRetractions = options.retractionRecords || [];
  const documents = [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", value: serializeUnionRegistry(unionRegistryService, savedAt) },
    { documentId: "strategic-season-1", scope: "season-1", type: "strategic-domain", value: strategicValue },
    { documentId: "evidence-season-1", scope: "season-1", type: "evidence-domain", value: evidenceSerializer.serializeRuntime(evidenceRuntime, savedAt) },
    { documentId: "projection-season-1-season1-map", scope: "season-1/season1-map", type: "server-state", value: serializeServerState(serverStateService, savedAt) },
    { documentId: "season-administration", scope: "global", type: "season-administration", value: admin(options.archived) },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", value: { schemaVersion: 1, records: options.auditRecords || [] } }
  ];
  if (options.includeProvenance) documents.push({ documentId: "ownership-provenance:season-1:season1-map", scope: "season-1/season1-map", type: "ownership-history-provenance", value: provenanceSerializer.serialize({ seasonId: "season-1", baseMapId: "season1-map", activeSeasonId: "season-1", records: [] }) });
  const store = createGenerationStore({ baseDirectory: path.join(directory, "generations") });
  await store.commit({ expectedGeneration: 0, transactionId: "fixture", createdAt: savedAt, documents });
  return { store, documents };
}

function loaderFor(store, overrides = {}) {
  const analyzer = createOwnershipConflictAnalysisService({ ownershipHistoryResolver: createOwnershipHistoryResolver({ targetCatalog }) });
  return createOwnershipConflictQuarantineLoader({
    generationStore: store,
    deserializeUnionRegistryEnvelope: deserializeUnionRegistryEnvelope,
    deserializeStrategicDomainEnvelope: deserializeStrategicDomainEnvelope,
    deserializeEvidenceEnvelope: evidenceSerializer.deserializeEnvelope.bind(evidenceSerializer),
    deserializeServerState: deserializePersistenceEnvelope,
    deserializeApplicationAuditEnvelope: overrides.deserializeApplicationAuditEnvelope || auditSerializer.deserializeEnvelope.bind(auditSerializer),
    deserializeOwnershipHistoryProvenance: provenanceSerializer.deserialize.bind(provenanceSerializer),
    validateTerritoryOwnershipRecord,
    validateStructureOwnershipRecord,
    validateOwnershipRetractionRecord,
    ownershipConflictAnalysis: analyzer,
    resolveSeasonPackage: async () => SEASON_1_PACKAGE,
    createTargetCatalog: async () => targetCatalog
  });
}

function mutatingStore(store, mutate) {
  return {
    async loadCommittedGeneration() {
      const loaded = await store.loadCommittedGeneration();
      return mutate(structuredClone(loaded));
    }
  };
}

async function withDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-quarantine-loader-"));
  try { await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}

async function expected(store) {
  const loaded = await store.loadCommittedGeneration();
  return { generation: loaded.pointer.generation, manifestFile: loaded.pointer.manifestFile, manifestSha256: loaded.pointer.manifestSha256 };
}

(async () => {
  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "territory-a", ownerUnionId: "union-0001" }), territory({ ownershipRecordId: "territory-b", ownerUnionId: "union-0002", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })] });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.strictEqual(result.status, "recovery_ready");
    assert.strictEqual(result.conflict.kind, "territory");
    assert.deepStrictEqual(result.conflict.recordIds, ["territory-a", "territory-b"]);
    assert.deepStrictEqual(result.existingAuditRecords, []);
    assert.strictEqual(Object.isFrozen(result), true);
    assert.strictEqual(Object.isFrozen(result.conflict.records), true);
    assert.strictEqual(Object.isFrozen(result.existingAuditRecords), true);
    assert.deepStrictEqual(result.documents.map((document) => [document.documentId, document.scope, document.type]), [["union-registry-global", "global", "union-registry"], ["strategic-season-1", "season-1", "strategic-domain"], ["evidence-season-1", "season-1", "evidence-domain"], ["projection-season-1-season1-map", "season-1/season1-map", "server-state"], ["season-administration", "global", "season-administration"], ["application-audit-global", "global", "application-audit"]]);
    assert.deepStrictEqual(result.sourceDocumentIds, { strategic: "strategic-season-1", projection: "projection-season-1-season1-map" });
    assert.strictEqual(Object.isFrozen(result.documents), true);
    assert.strictEqual(Object.isFrozen(result.documents[1].value), true);
    const plan = createOwnershipConflictRecoveryPlanBuilder({ validateAuditHistory, deserializeStrategicDomainEnvelope, deserializeApplicationAuditEnvelope: auditSerializer.deserializeEnvelope.bind(auditSerializer), deserializeServerState: deserializePersistenceEnvelope }).build({ snapshot: result, retainedRecordId: "territory-a", reason: "Resolve duplicate terminal." });
    assert.deepStrictEqual(plan.existingAuditRecords, []);
    assert.deepStrictEqual(plan.documents, result.documents);
    console.log("PASS real filesystem admits exact territory conflict as frozen recovery data");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { structureRecords: [structure({ structureOwnershipId: "structure-a" }), structure({ structureOwnershipId: "structure-b", ownerUnionId: "union-0002", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })] });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.strictEqual(result.status, "recovery_ready");
    assert.strictEqual(result.conflict.kind, "structure");
    assert.deepStrictEqual(result.conflict.recordIds, ["structure-a", "structure-b"]);
    console.log("PASS real filesystem admits structure conflict distinctly");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory()] });
    const current = await expected(store);
    await assert.rejects(loaderFor(store).load({ expectedCurrent: { ...current, generation: current.generation + 1 } }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "stale_current");
    assert.strictEqual((await store.loadCommittedGeneration()).source, "current");
    console.log("PASS exact expected identity mismatch is refused without writes");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "territory-a" })] });
    const fallbackStore = mutatingStore(store, (loaded) => ({ ...loaded, source: "previous", recovery: "current_invalid" }));
    await assert.rejects(loaderFor(fallbackStore).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "unsafe_committed_generation");
    console.log("PASS previous/fallback source is refused");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "territory-a" })] });
    const invalidRoleStore = mutatingStore(store, (loaded) => {
      loaded.manifest.documents[0].type = "unsupported-role";
      return loaded;
    });
    await assert.rejects(loaderFor(invalidRoleStore).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && /role|document|manifest|generation/i.test(error.code));
    const invalidDomainStore = mutatingStore(store, (loaded) => {
      const audit = loaded.documents.find((document) => document.documentId === "application-audit-global");
      audit.value.schemaVersion = 99;
      return loaded;
    });
    await assert.rejects(loaderFor(invalidDomainStore).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "non_ownership_validation_failed");
    console.log("PASS invalid manifest role and non-ownership schema are refused");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "invalid-record", reviewState: "invalid" })] });
    await assert.rejects(loaderFor(store).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "invalid_ownership_record");
    const retractionDirectory = path.join(directory, "retraction-case");
    await fs.promises.mkdir(retractionDirectory, { recursive: true });
    const { store: retractionStore } = await createFixture(retractionDirectory, { territoryRecords: [territory({ ownershipRecordId: "territory-a" })], retractionRecords: [retraction({ sourceType: "manual_entry" })] });
    await assert.rejects(loaderFor(retractionStore).load({ expectedCurrent: await expected(retractionStore) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "invalid_ownership_record");
    console.log("PASS invalid ownership records and retractions are refused");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory()] });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.strictEqual(result.status, "recovery_not_required");
    assert.deepStrictEqual(result.existingAuditRecords, []);
    console.log("PASS valid non-conflicting history returns recovery_not_required");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { includeProvenance: true, territoryRecords: [territory({ ownershipRecordId: "territory-a" }), territory({ ownershipRecordId: "territory-b", ownerUnionId: "union-0002", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })] });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.strictEqual(result.documents.length, 7);
    assert.strictEqual(result.documents[6].type, "ownership-history-provenance");
    assert.strictEqual(Object.isFrozen(result.documents[6].value), true);
    console.log("PASS optional provenance source document is preserved in manifest order");
  });

  await withDirectory(async (directory) => {
    const records = [auditRecord(), auditRecord({ auditId: "audit-2", transactionId: "transaction-2", sequence: 2, details: { source: "fixture", nested: { order: 2 } } })];
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "territory-a" }), territory({ ownershipRecordId: "territory-b", ownerUnionId: "union-0002", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })], auditRecords: records });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.deepStrictEqual(result.existingAuditRecords, records);
    assert.notStrictEqual(result.existingAuditRecords, records);
    assert.strictEqual(Object.isFrozen(result.existingAuditRecords), true);
    assert.strictEqual(Object.isFrozen(result.existingAuditRecords[1].details.nested), true);
    records[1].details.nested.order = "changed";
    assert.strictEqual(result.existingAuditRecords[1].details.nested.order, 2);
    console.log("PASS validated audit history preserves order and is isolated");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory()] });
    for (const malformed of [{}, { records: null }, { records: {} }]) {
      await assert.rejects(loaderFor(store, { deserializeApplicationAuditEnvelope: () => malformed }).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "invalid_application_audit");
    }
    console.log("PASS missing or malformed audit deserializer output is refused");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { archived: true, territoryRecords: [territory({ ownershipRecordId: "territory-a" }), territory({ ownershipRecordId: "territory-b", ownerUnionId: "union-0002", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })] });
    const result = await loaderFor(store).load({ expectedCurrent: await expected(store) });
    assert.strictEqual(result.status, "recovery_ready");
    assert.strictEqual(result.scope.archived, true);
    console.log("PASS archived conflict is classified read-only");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "territory-a" })] });
    const before = await expected(store);
    const first = await loaderFor(store).load({ expectedCurrent: before });
    const second = await loaderFor(store).load({ expectedCurrent: before });
    assert.deepStrictEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.deepStrictEqual(await expected(store), before);
    console.log("PASS repeated loads are deterministic, isolated, and read-only");
  });

  await withDirectory(async (directory) => {
    const { store } = await createFixture(directory, { territoryRecords: [territory({ ownershipRecordId: "bad", ownerUnionId: "unknown-union" })] });
    await assert.rejects(loaderFor(store).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "unknown_union");
    console.log("PASS unknown union is refused");
  });

  await withDirectory(async (directory) => {
    const uncertainRecord = territory({ ownershipRecordId: "uncertain-a", eventAt: { precision: "bounded", earliestAt: "2026-08-20T09:00:00Z", latestAt: "2026-08-20T10:00:00Z" } });
    delete uncertainRecord.effectiveAt;
    const { store } = await createFixture(directory, {
      territoryRecords: [
        uncertainRecord,
        territory({ ownershipRecordId: "uncertain-b", effectiveAt: "2026-08-20T09:01:00Z", eventAt: { precision: "exact", at: "2026-08-20T09:01:00Z" }, reviewedAt: "2026-08-20T09:11:00Z" })
      ]
    });
    await assert.rejects(loaderFor(store).load({ expectedCurrent: await expected(store) }), (error) => error instanceof OwnershipConflictQuarantineLoaderError && error.code === "ownership_history_invalid");
    console.log("PASS uncertain ownership does not become recoverable conflict");
  });

  console.log("15 ownership conflict quarantine loader scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
