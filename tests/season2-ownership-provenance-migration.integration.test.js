const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const unions = require("../data/unions.json");
const season2Map = require("../data/season2-map.json");
const { SEASON_2_PACKAGE } = require("../src/seasons/season2-package.js");
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
const { createWarmapElectronStartup } = require("../src/main/warmap-electron-startup.js");
const { validateTerritoryOwnershipRecord } = require("../src/services/ownership-record-validator.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipProjectionSerializer } = require("../src/services/ownership-projection-serializer.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { deserializePersistenceEnvelope, serializeServerState } = require("../src/services/persistence-state-serializer.js");
const { createApplicationAuditRecordSerializer } = require("../src/services/application-audit-record-serializer.js");

const SEASON_ID = "season-2";
const BASE_MAP_ID = "season2-strategic-node-network";
const ACTIVE_SERVER_ID = "server-201";
const INACTIVE_SERVER_ID = "server-202";
const SAVED_AT = "2026-08-19T00:00:00.000Z";
const UNION_ID = "union-0001";
const TARGET_KEYS = season2Map.nodes.map((node) => ({ type: "strategic_node", nodeId: node.nodeId }));
const SERVER_RECORDS = season2Map.nodes.map((node, index) => ({
  ownershipRecordId: `season2-${ACTIVE_SERVER_ID}-${index + 1}`,
  serverId: ACTIVE_SERVER_ID,
  seasonId: SEASON_ID,
  territoryRef: { type: "strategic_node", nodeId: node.nodeId },
  ownerUnionId: UNION_ID,
  ownershipState: "owned",
  reviewState: "confirmed",
  effectiveAt: "2026-08-01T00:00:00Z",
  eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" },
  observedAt: "2026-08-01T00:01:00Z",
  recordedAt: "2026-08-01T00:02:00Z",
  recordedAtLegacyUnknown: false,
  ruleVersionRef: { seasonId: SEASON_ID, packageVersion: SEASON_2_PACKAGE.packageIdentity.packageVersion, rulesVersion: "season-2-foundation" },
  sourceType: "manual_entry",
  evidenceIds: [],
  actorId: "test-actor",
  reviewerId: "test-reviewer",
  reviewedAt: "2026-08-01T00:03:00Z",
  supersededBy: null
}));

const centerRecord = SERVER_RECORDS.find((record) => record.territoryRef.nodeId === "s2-center-metropolis");
assert.strictEqual(validateTerritoryOwnershipRecord(centerRecord).valid, true);
assert.strictEqual(validateTerritoryOwnershipRecord({ ...centerRecord, territoryRef: { type: "normal_map_cell", row: 6.5, col: 6.5 } }).valid, false);
const strategicResolver = createOwnershipHistoryResolver({ targetCatalog: { territoryKeys: [{ type: "strategic_node", nodeId: "s2-center-metropolis" }], structures: [] } });
const resolvedStrategic = strategicResolver.resolve({ seasonId: SEASON_ID, serverId: ACTIVE_SERVER_ID, territoryRecords: [centerRecord], structureRecords: [] });
assert.strictEqual(resolvedStrategic.territories[0].targetKey, JSON.stringify(["strategic_node", "s2-center-metropolis"]));
const projectionSerializer = createOwnershipProjectionSerializer({ hashSha256: () => "0".repeat(64) });
const serializedStrategic = projectionSerializer.serialize({ seasonId: SEASON_ID, serverId: ACTIVE_SERVER_ID, territories: resolvedStrategic.territories, structures: [], uncertainty: [], excludedRecords: [], consistencyDiagnostics: [] });
assert.deepStrictEqual(serializedStrategic.payload.territories[0].target, { type: "strategic_node", nodeId: "s2-center-metropolis" });

function fsAdapter() {
  return {
    mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }),
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
    rename: fs.promises.rename,
    unlink: fs.promises.unlink,
    readdir: fs.promises.readdir,
    access: fs.promises.access,
    flush: async () => {}
  };
}

const strategicNames = ["union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service", "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator", "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator", "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator", "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service", "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service", "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service", "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"];
function strategicModules() { return createStrategicDomainModuleRegistry(strategicNames.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {})); }
function evidenceModules() { return createEvidenceDomainModuleRegistry({ ...require("../src/services/evidence-asset-validator.js"), ...require("../src/services/evidence-asset-service.js"), ...require("../src/services/evidence-record-validator.js"), ...require("../src/services/evidence-record-service.js") }); }
function createServices() {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules: strategicModules(), unionRegistryService, initialState: { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: SERVER_RECORDS, structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] } });
  const evidenceDomainRuntime = createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } });
  const serverStateService = createServerStateService({ seasonId: SEASON_ID, baseMapId: BASE_MAP_ID, servers: [
    { id: ACTIVE_SERVER_ID, label: "Season 2 Active Server", ownership: Object.fromEntries(TARGET_KEYS.map((target) => [JSON.stringify(["strategic_node", target.nodeId]), UNION_ID])) },
    { id: INACTIVE_SERVER_ID, label: "Season 2 Inactive Server", ownership: {} }
  ] });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenanceState = createOwnershipHistoryProvenanceStateService({ seasonId: SEASON_ID, baseMapId: BASE_MAP_ID, serializer: provenanceSerializer });
  const seasonAdministrationService = createSeasonAdministrationService({
    preparedPackages: [SEASON_2_PACKAGE],
    validateSeasonPackage,
    authorizationPolicyService: createAuthorizationPolicyService(),
    persistenceCoordinator: { execute: async (mutation) => mutation() },
    initialState: {
      schemaVersion: 2,
      activeSeason: {
        schemaVersion: 1,
        seasonId: SEASON_ID,
        packageVersion: SEASON_2_PACKAGE.packageIdentity.packageVersion,
        serverIds: [ACTIVE_SERVER_ID],
        confirmations: { mapAndStructures: true, resourcesAndValues: true },
        activatedAt: SAVED_AT,
        activatedBy: "test"
      },
      completedSeasons: []
    },
    clock: () => new Date(SAVED_AT)
  });
  const applicationAuditRecordService = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "season2-audit", clock: () => new Date(SAVED_AT) });
  return { services: { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService, seasonAdministrationService, applicationAuditRecordService, ownershipHistoryProvenanceStateService: provenanceState }, provenanceSerializer };
}
function codecOptionsFactory(_fresh, provenanceSerializer) {
  const evidence = evidenceModules();
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidence.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidence.validateEvidenceRecordHistory });
  const auditSerializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
  return { seasonId: SEASON_ID, baseMapId: BASE_MAP_ID, provenanceSerializer, deserializeUnionRegistryEnvelope, deserializeStrategicDomainEnvelope, deserializeEvidenceEnvelope: evidenceSerializer.deserializeEnvelope.bind(evidenceSerializer), deserializeServerState: deserializePersistenceEnvelope, deserializeApplicationAuditEnvelope: auditSerializer.deserializeEnvelope };
}
function committedDocuments(initial) {
  const evidence = evidenceModules();
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidence.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidence.validateEvidenceRecordHistory });
  const auditSerializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
  const documents = [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", value: serializeUnionRegistry(initial.services.unionRegistryService, SAVED_AT) },
    { documentId: `strategic-${SEASON_ID}`, scope: SEASON_ID, type: "strategic-domain", value: serializeStrategicDomainRuntime(initial.services.strategicDomainRuntime, SEASON_ID, SAVED_AT) },
    { documentId: `evidence-${SEASON_ID}`, scope: SEASON_ID, type: "evidence-domain", value: evidenceSerializer.serializeRuntime(initial.services.evidenceDomainRuntime, SAVED_AT) },
    { documentId: `projection-${SEASON_ID}-${BASE_MAP_ID}`, scope: `${SEASON_ID}/${BASE_MAP_ID}`, type: "server-state", value: serializeServerState(initial.services.serverStateService, SAVED_AT) },
    { documentId: "season-administration", scope: "global", type: "season-administration", value: initial.services.seasonAdministrationService.captureTransactionState() },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", value: auditSerializer.serializeRecords(initial.services.applicationAuditRecordService.listRecords()) }
  ];
  return documents;
}
async function createCommittedStore(directory) {
  const store = createGenerationStore({ baseDirectory: directory, fileSystem: fsAdapter() });
  const initial = createServices();
  await initial.services.seasonAdministrationService.initialize();
  await store.commit({ expectedGeneration: 0, transactionId: "season2-initial", createdAt: SAVED_AT, documents: committedDocuments(initial) });
  return { store, initial };
}
async function withDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-season2-provenance-"));
  try { await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}

(async () => {
  const packageBefore = JSON.stringify(SEASON_2_PACKAGE);
  const mapBefore = JSON.stringify(season2Map);
  const recordsBefore = JSON.stringify(SERVER_RECORDS);
  await withDirectory(async (directory) => {
    const fileStore = { async loadEnvelope() { return null; } };
    const { store } = await createCommittedStore(directory);
    const before = await store.loadCommittedGeneration();
    assert.strictEqual(before.status, "committed");
    assert.strictEqual(before.documents.some((document) => document.type === "ownership-history-provenance"), false);
    const startup = createWarmapElectronStartup({ generationStore: store, fileStore });
    const result = await startup.resolve();
    assert.strictEqual(result.status, "published");
    assert.strictEqual(result.persistenceMode, "generation");

    const published = await store.loadCommittedGeneration();
    assert.strictEqual(published.status, "committed");
    assert.strictEqual(published.source, "current");
    assert.strictEqual(published.manifest.generation, before.manifest.generation + 1);
    assert.deepStrictEqual(published.pointer, {
      schemaVersion: 1,
      generation: published.pointer.generation,
      manifestFile: published.pointer.manifestFile,
      manifestSha256: published.pointer.manifestSha256
    });
    const provenance = published.documents.find((document) => document.type === "ownership-history-provenance");
    assert.ok(provenance);
    assert.strictEqual(provenance.value.seasonId, SEASON_ID);
    assert.strictEqual(provenance.value.baseMapId, BASE_MAP_ID);
    assert.deepStrictEqual(provenance.value.records.map((record) => record.serverId), [ACTIVE_SERVER_ID]);
    assert.deepStrictEqual(provenance.value.records[0].sourceDocumentIds.sort(), [
      `projection-${SEASON_ID}-${BASE_MAP_ID}`,
      `strategic-${SEASON_ID}`
    ].sort());

    const initialById = Object.fromEntries(before.documents.map((document) => [document.documentId, document]));
    const publishedById = Object.fromEntries(published.documents.map((document) => [document.documentId, document]));
    Object.keys(initialById).forEach((documentId) => {
      assert.ok(publishedById[documentId]);
      assert.strictEqual(publishedById[documentId].fileName, initialById[documentId].fileName, documentId);
      assert.strictEqual(publishedById[documentId].sha256, initialById[documentId].sha256, documentId);
    });
    assert.strictEqual(publishedById[`strategic-${SEASON_ID}`].scope, SEASON_ID);
    assert.strictEqual(publishedById[`projection-${SEASON_ID}-${BASE_MAP_ID}`].scope, `${SEASON_ID}/${BASE_MAP_ID}`);

    const reopenedStore = createGenerationStore({ baseDirectory: directory, fileSystem: fsAdapter() });
    const reopened = await reopenedStore.loadCommittedGeneration();
    assert.deepStrictEqual(reopened.pointer, published.pointer);
    assert.deepStrictEqual(reopened.manifest, published.manifest);
    assert.deepStrictEqual(reopened.documents, published.documents);
    assert.strictEqual(reopened.documents.some((document) => document.documentId.includes("season-1") || document.scope.includes("season-1")), false);
    assert.strictEqual(reopened.documents.some((document) => document.value && document.value.baseMapId === "season1-map"), false);
  });
  assert.strictEqual(JSON.stringify(SEASON_2_PACKAGE), packageBefore);
  assert.strictEqual(JSON.stringify(season2Map), mapBefore);
  assert.strictEqual(JSON.stringify(SERVER_RECORDS), recordsBefore);
  assert.strictEqual(SEASON_2_PACKAGE.rulesDefinition.mapDefinition.baseMapId, BASE_MAP_ID);
  assert.strictEqual(season2Map.baseMapId, BASE_MAP_ID);
  console.log("PASS Season 2 ownership provenance migration publishes, reopens, and preserves source fixtures");
  console.log("1 Season 2 ownership provenance migration integration test passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
