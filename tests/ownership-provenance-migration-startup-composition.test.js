const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const unions = require("../data/unions.json");
const season1Servers = require("../data/season1-servers.json");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { createAuthorizationPolicyService } = require("../src/services/authorization-policy-service.js");
const { createSeasonAdministrationService } = require("../src/services/season-administration-service.js");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const { createStrategicDomainModuleRegistry } = require("../src/app/strategic-domain-module-registry.js");
const { createStrategicDomainRuntime } = require("../src/app/strategic-domain-runtime.js");
const { createEvidenceDomainModuleRegistry } = require("../src/app/evidence-domain-module-registry.js");
const { createEvidenceDomainRuntime } = require("../src/app/evidence-domain-runtime.js");
const { createServerStateService } = require("../src/services/server-state-service.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");
const { createOwnershipHistoryProvenanceStateService } = require("../src/services/ownership-history-provenance-state-service.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../src/services/ownership-history-provenance-document-serializer.js");
const { createApplicationDocumentCodec } = require("../src/services/application-document-codec.js");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createOwnershipProvenanceMigrationStartupComposition } = require("../src/main/ownership-provenance-migration-startup-composition.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { serializeServerState, deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };
const targetCatalog = { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }], structures: [] };
const strategicNames = ["union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service", "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator", "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator", "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator", "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service", "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service", "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service", "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"];
function strategicModules() { return createStrategicDomainModuleRegistry(strategicNames.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {})); }
function evidenceModules() { return createEvidenceDomainModuleRegistry({ ...require("../src/services/evidence-asset-validator.js"), ...require("../src/services/evidence-asset-service.js"), ...require("../src/services/evidence-record-validator.js"), ...require("../src/services/evidence-record-service.js") }); }
function fsAdapter() { return { mkdir: (p) => fs.promises.mkdir(p, { recursive: true }), readFile: fs.promises.readFile, writeFile: fs.promises.writeFile, rename: fs.promises.rename, unlink: fs.promises.unlink, readdir: fs.promises.readdir, access: fs.promises.access, flush: async () => {} }; }
function freshServices() {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules: strategicModules(), unionRegistryService, initialState: { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: [{ ownershipRecordId: "territory-1", serverId: "server-366", seasonId: context.seasonId, territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-0001", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "local", reviewerId: "local", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null }, { ownershipRecordId: "territory-2", serverId: "server-366", seasonId: context.seasonId, territoryRef: { type: "normal_map_cell", row: 1, col: 2 }, ownerUnionId: "union-0001", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "local", reviewerId: "local", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null }], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] } });
  const evidenceDomainRuntime = createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } });
  const servers = season1Servers.servers.map((server) => server.id === "server-366" ? { ...server, ownership: { "1-1": "union-0001", "1-2": "union-0001" } } : server);
  const serverStateService = createServerStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, servers });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenanceState = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer: provenanceSerializer });
  const seasonAdministrationService = createSeasonAdministrationService({ preparedPackages: [SEASON_1_PACKAGE], validateSeasonPackage, authorizationPolicyService: createAuthorizationPolicyService(), persistenceCoordinator: { execute: async (mutation) => mutation() }, initialState: { schemaVersion: 2, activeSeason: { schemaVersion: 1, seasonId: context.seasonId, packageVersion: SEASON_1_PACKAGE.packageIdentity.packageVersion, serverIds: ["server-366"], confirmations: { mapAndStructures: true, resourcesAndValues: true }, activatedAt: "2026-08-01T00:00:00.000Z", activatedBy: "local" }, completedSeasons: [] }, clock: () => new Date("2026-08-13T00:00:00.000Z") });
  const applicationAuditRecordService = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "audit", clock: () => new Date("2026-08-13T00:00:00.000Z") });
  return { services: { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService, seasonAdministrationService, applicationAuditRecordService, ownershipHistoryProvenanceStateService: provenanceState }, provenanceSerializer };
}
function codecOptionsFactory(fresh, provenanceSerializer) {
  const evidenceModulesValue = evidenceModules();
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModulesValue.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModulesValue.validateEvidenceRecordHistory });
  return { seasonId: context.seasonId, baseMapId: context.baseMapId, provenanceSerializer, deserializeUnionRegistryEnvelope, deserializeStrategicDomainEnvelope, deserializeEvidenceEnvelope: evidenceSerializer.deserializeEnvelope.bind(evidenceSerializer), deserializeServerState: deserializePersistenceEnvelope, deserializeApplicationAuditEnvelope: require("../src/services/application-audit-record-serializer.js").createApplicationAuditRecordSerializer({ validateAuditHistory }).deserializeEnvelope };
}
async function createInitialGeneration(directory) {
  const store = createGenerationStore({ baseDirectory: directory, fileSystem: fsAdapter() });
  const initial = freshServices();
  await initial.services.seasonAdministrationService.initialize();
  const savedAt = "2026-08-13T00:00:00.000Z";
  const evidenceModulesValue = evidenceModules();
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModulesValue.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModulesValue.validateEvidenceRecordHistory });
  await store.commit({ expectedGeneration: 0, transactionId: "initial", createdAt: savedAt, documents: [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", value: serializeUnionRegistry(initial.services.unionRegistryService, savedAt) },
    { documentId: "strategic-season-1", scope: context.seasonId, type: "strategic-domain", value: serializeStrategicDomainRuntime(initial.services.strategicDomainRuntime, context.seasonId, savedAt) },
    { documentId: "evidence-season-1", scope: context.seasonId, type: "evidence-domain", value: evidenceSerializer.serializeRuntime(initial.services.evidenceDomainRuntime, savedAt) },
    { documentId: "projection-season-1-season1-map", scope: `${context.seasonId}/${context.baseMapId}`, type: "server-state", value: serializeServerState(initial.services.serverStateService, savedAt) },
    { documentId: "season-administration", scope: "global", type: "season-administration", value: initial.services.seasonAdministrationService.captureTransactionState() },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", value: { schemaVersion: 1, records: [] } }
  ] });
  return store;
}
function compositionOptions(store, options = {}) {
  let targetCalls = 0;
  return {
    generationStore: store,
    seasonId: context.seasonId,
    baseMapId: context.baseMapId,
    resolveSeasonPackage: async () => SEASON_1_PACKAGE,
    createTargetCatalog: () => options.refuseOnVerify && ++targetCalls > 1 ? { territoryKeys: [], structures: [] } : targetCatalog,
    createFreshServices: async () => freshServices(),
    createApplicationDocumentCodec,
    codecOptionsFactory,
    clock: () => new Date("2026-08-13T00:00:00.000Z"),
    createTransactionId: () => "composition-transaction"
  };
}
async function withDirectory(callback) { const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-startup-composition-")); try { await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); } }

(async () => {
  await withDirectory(async (directory) => {
    const store = await createInitialGeneration(directory);
    const startup = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store));
    const result = await startup.resolve();
    assert.strictEqual(result.status, "published");
    assert.strictEqual(result.persistenceMode, "generation");
    assert.strictEqual(result.generation.generation, 2);
    const reopened = await store.loadCommittedGeneration();
    assert.ok(reopened.documents.some((document) => document.type === "ownership-history-provenance"));
    console.log("PASS composed real chain migrates, publishes, and reloads provenance");
  });
  await withDirectory(async (directory) => {
    const store = await createInitialGeneration(directory);
    const first = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store));
    assert.strictEqual((await first.resolve()).status, "published");
    const second = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store));
    const result = await second.resolve();
    assert.deepStrictEqual({ status: result.status, persistenceMode: result.persistenceMode, generation: result.generation.generation }, { status: "already_proven", persistenceMode: "generation", generation: 2 });
    console.log("PASS composed already-proven generation returns deterministic no-write result");
  });
  await withDirectory(async (directory) => {
    const store = createGenerationStore({ baseDirectory: directory, fileSystem: fsAdapter() });
    const startup = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store));
    const result = await startup.resolve();
    assert.deepStrictEqual(result, { status: "legacy_required", persistenceMode: "legacy", generation: null, reason: "no_committed_generation", diagnostics: [] });
    console.log("PASS composed missing generation skips migration");
  });
  await withDirectory(async (directory) => {
    const store = await createInitialGeneration(directory);
    const startup = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store, { refuseOnVerify: true }));
    const result = await startup.resolve();
    assert.strictEqual(result.status, "verification_failed");
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
    console.log("PASS composed real verifier refusal prevents publication");
  });
  assert.throws(() => createOwnershipProvenanceMigrationStartupComposition({}), /options\.generationStore/);
  assert.throws(() => createOwnershipProvenanceMigrationStartupComposition({ generationStore: { loadCommittedGeneration() {}, prepare() {}, publish() {} } }), /options\.resolveSeasonPackage/);
  assert.throws(() => createOwnershipProvenanceMigrationStartupComposition({ generationStore: { loadCommittedGeneration() {}, prepare() {}, publish() {} }, seasonId: context.seasonId, baseMapId: context.baseMapId }), /options\.resolveSeasonPackage/);
  console.log("PASS composition validates missing trusted dependencies immediately");

  await withDirectory(async (directory) => {
    const store = await createInitialGeneration(directory);
    const startup = createOwnershipProvenanceMigrationStartupComposition(compositionOptions(store));
    assert.deepStrictEqual(Object.keys(startup), ["resolve"]);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(startup, "generationStore"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(startup, "executionCoordinator"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(startup, "publish"), false);
    console.log("PASS composed facade exposes no lower-level capabilities");
  });
  console.log("6 ownership provenance migration startup composition scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
