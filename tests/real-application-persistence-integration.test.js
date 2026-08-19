const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const unions = require("../data/unions.json");
const season1Servers = require("../data/season1-servers.json");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const { createStrategicDomainRuntime } = require("../src/app/strategic-domain-runtime.js");
const { createEvidenceDomainRuntime } = require("../src/app/evidence-domain-runtime.js");
const { createServerStateService } = require("../src/services/server-state-service.js");
const { validateEvidenceAsset, validateEvidenceAssetHistory } = require("../src/services/evidence-asset-validator.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");
const { validateEvidenceRecord, validateEvidenceRecordHistory } = require("../src/services/evidence-record-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { serializeServerState, deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");

const strategicFiles = [
  "union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service",
  "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator",
  "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator",
  "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator",
  "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service",
  "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service",
  "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service",
  "confirmed-snapshot-change-service", "server-history-service"
];
function modules() { return strategicFiles.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {}); }
function emptyState() { return { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: [], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] }; }
function evidenceModules() { return { validateEvidenceAsset, validateEvidenceAssetHistory, createEvidenceAssetService, validateEvidenceRecord, validateEvidenceRecordHistory, createEvidenceRecordService }; }
function createEvidence() { return createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } }); }
function createStrategic() { return createStrategicDomainRuntime({ modules: modules(), unionRegistryService: createUnionRegistryService(unions.unions), initialState: emptyState() }); }
function createServer() { return createServerStateService(season1Servers); }
function createFs(failReadAt) {
  const base = { mkdir: (p) => fs.promises.mkdir(p, { recursive: true }), readFile: fs.promises.readFile, writeFile: fs.promises.writeFile, unlink: fs.promises.unlink, readdir: fs.promises.readdir, access: fs.promises.access, flush: async () => {} };
  let reads = 0;
  return { ...base, async readFile(file) { reads += 1; if (failReadAt && reads === failReadAt) throw new Error("apply-state failure"); return base.readFile(file); }, rename: fs.promises.rename };
}
function buildContext(directory, fileSystem, failApply = false) {
  const generationStore = createGenerationStore({ baseDirectory: directory, fileSystem });
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategic();
  const evidenceDomainRuntime = createEvidence();
  const serverStateService = createServer();
  const participants = [unionRegistryService, strategicDomainRuntime.relationService, strategicDomainRuntime.nativeAssignmentService, strategicDomainRuntime.activeStatusService, strategicDomainRuntime.combatStrengthObservationService, strategicDomainRuntime.serverObservationService, strategicDomainRuntime.ownershipRecordService, strategicDomainRuntime.ownershipRetractionService, strategicDomainRuntime.targetVerificationService, strategicDomainRuntime.confirmedSnapshotService, strategicDomainRuntime.activityFactHistoryService, evidenceDomainRuntime.evidenceAssetService, evidenceDomainRuntime.evidenceRecordService, serverStateService];
  const mutationCoordinator = createApplicationMutationCoordinator({ participants });
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory, validateEvidenceRecordHistory });
  const state = { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService };
  const serializeDocuments = async () => {
    const savedAt = "2026-08-12T12:00:00.000Z";
    return [
      { documentId: "union", scope: "global", type: "union", value: serializeUnionRegistry(unionRegistryService, savedAt) },
      { documentId: "strategic", scope: "season-1", type: "strategic", value: serializeStrategicDomainRuntime(strategicDomainRuntime, "season-1", savedAt) },
      { documentId: "evidence", scope: "season-1", type: "evidence", value: evidenceSerializer.serializeRuntime(evidenceDomainRuntime, savedAt) },
      { documentId: "server", scope: "season-1/season1-map", type: "server", value: serializeServerState(serverStateService, savedAt) }
    ];
  };
  const applyState = async (documents) => {
    unionRegistryService.restoreTransactionState(documents.union.identities);
    strategicDomainRuntime.relationService.restoreTransactionState(documents.strategic.state.relations);
    strategicDomainRuntime.nativeAssignmentService.restoreTransactionState(documents.strategic.state.nativeAssignments);
    strategicDomainRuntime.activeStatusService.restoreTransactionState(documents.strategic.state.activeStatuses);
    strategicDomainRuntime.combatStrengthObservationService.restoreTransactionState(documents.strategic.state.combatStrengthObservations);
    strategicDomainRuntime.serverObservationService.restoreTransactionState(documents.strategic.state.serverObservations);
    strategicDomainRuntime.ownershipRecordService.restoreTransactionState({ territoryRecords: documents.strategic.state.territoryOwnershipRecords, structureRecords: documents.strategic.state.structureOwnershipRecords });
    strategicDomainRuntime.ownershipRetractionService.restoreTransactionState(documents.strategic.state.ownershipRetractions);
    strategicDomainRuntime.targetVerificationService.restoreTransactionState(documents.strategic.state.targetVerifications);
    strategicDomainRuntime.confirmedSnapshotService.restoreTransactionState(documents.strategic.state.confirmedSnapshots);
    strategicDomainRuntime.activityFactHistoryService.restoreTransactionState({ confirmedPresenceFacts: documents.strategic.state.confirmedPresenceFacts, qualifyingFullMapConfirmations: documents.strategic.state.qualifyingFullMapConfirmations });
    evidenceDomainRuntime.evidenceAssetService.restoreTransactionState(documents.evidence.assets);
    evidenceDomainRuntime.evidenceRecordService.restoreTransactionState(documents.evidence.evidenceRecords);
    serverStateService.replaceTerritoryOwnership(Object.fromEntries(documents.server.servers.map((server) => [server.id, server.ownership])));
    if (failApply) throw new Error("apply-state failure");
  };
  const coordinator = createApplicationPersistenceCoordinator({ generationStore, mutationCoordinator, legacyStateClassifier: { classify: () => ({ status: "first_run" }) }, serializeDocuments, deserializeDocuments: async (documents) => ({ union: deserializeUnionRegistryEnvelope(documents.find((d) => d.documentId === "union").value), strategic: deserializeStrategicDomainEnvelope(documents.find((d) => d.documentId === "strategic").value), evidence: evidenceSerializer.deserializeEnvelope(documents.find((d) => d.documentId === "evidence").value), server: deserializePersistenceEnvelope(documents.find((d) => d.documentId === "server").value) }), applyState, clock: () => new Date("2026-08-12T12:00:00.000Z"), createTransactionId: () => "real-integration" });
  return { coordinator, state, mutationCoordinator, serializeDocuments };
}

(async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-real-persistence-"));
  try {
    const context = buildContext(directory, createFs());
    await context.coordinator.load({});
    await context.coordinator.execute(() => {
      context.state.unionRegistryService.updateUnionIdentity("union-0001", { displayName: "Updated Union" });
      context.state.strategicDomainRuntime.relationService.addKnownUnion({ seasonId: "season-1", serverId: "server-366", unionId: "union-0001" });
      context.state.evidenceDomainRuntime.evidenceAssetService.restoreTransactionState([]);
      context.state.serverStateService.setTerritoryOwner("server-366", "3-4", "union-0001");
    });
    const reopened = buildContext(directory, createFs());
    await reopened.coordinator.load({});
    assert.strictEqual(reopened.state.unionRegistryService.getUnionIdentity("union-0001").displayName, "Updated Union");
    assert.strictEqual(reopened.state.strategicDomainRuntime.relationService.hasRelation("season-1", "server-366", "union-0001"), true);
    assert.deepStrictEqual(reopened.state.evidenceDomainRuntime.evidenceAssetService.listAssets(), []);
    assert.strictEqual(reopened.state.serverStateService.getTerritoryOwner("server-366", "3-4", null), "union-0001");
    console.log("PASS real four-domain commit/reopen assertions");

    const failing = buildContext(directory, createFs(), true);
    await assert.rejects(() => failing.coordinator.load({}), /apply-state failure/);
    assert.strictEqual(failing.state.unionRegistryService.getUnionIdentity("union-0001").displayName, "Moonlight Guillotine");
    assert.strictEqual(failing.state.strategicDomainRuntime.relationService.hasRelation("season-1", "server-366", "union-0001"), false);
    assert.strictEqual(failing.state.serverStateService.getTerritoryOwner("server-366", "3-4", null), null);
    console.log("PASS partial apply rolls back real services");
    console.log("2 real integration scenarios passed");
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
