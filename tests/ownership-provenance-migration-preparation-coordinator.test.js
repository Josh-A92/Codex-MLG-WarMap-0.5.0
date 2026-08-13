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
const { createIsolatedApplicationGraphLoader } = require("../src/services/isolated-application-graph-loader.js");
const { createCommittedGenerationMigrationSnapshotAdapter } = require("../src/services/committed-generation-migration-snapshot-adapter.js");
const { createOwnershipMigrationInputAdapter } = require("../src/services/ownership-migration-input-adapter.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipProjectionComparator } = require("../src/services/ownership-projection-comparator.js");
const { createOwnershipHistoryCompletenessEvaluator } = require("../src/services/ownership-history-completeness-evaluator.js");
const { createOwnershipHistoryProvenanceEvidenceFactory } = require("../src/services/ownership-history-provenance-evidence-factory.js");
const { createOwnershipProvenanceMigrationDecisionService } = require("../src/services/ownership-provenance-migration-decision-service.js");
const { createOwnershipProvenanceCandidateDocumentBuilder } = require("../src/services/ownership-provenance-candidate-document-builder.js");
const { createOwnershipProvenanceMigrationPreparationCoordinator } = require("../src/services/ownership-provenance-migration-preparation-coordinator.js");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { serializeServerState, deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };
function territoryRecord(id, row, col) { return { ownershipRecordId: id, serverId: "server-366", seasonId: context.seasonId, territoryRef: { type: "normal_map_cell", row, col }, ownerUnionId: "union-0001", ownershipState: "owned", reviewState: "confirmed", effectiveAt: "2026-08-01T00:00:00Z", sourceType: "manual_entry", evidenceIds: [], actorId: "local", reviewerId: "local", reviewedAt: "2026-08-01T00:10:00Z", supersededBy: null }; }
const eligibleTerritoryRecords = [territoryRecord("territory-1", 1, 1), territoryRecord("territory-2", 1, 2)];
const emptyStrategicState = { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: eligibleTerritoryRecords, structureOwnershipRecords: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] };
const strategicNames = ["union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service", "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator", "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator", "ownership-record-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator", "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service", "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service", "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service", "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"];
function strategicModules() { return createStrategicDomainModuleRegistry(strategicNames.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {})); }
function evidenceModules() { return createEvidenceDomainModuleRegistry({ ...require("../src/services/evidence-asset-validator.js"), ...require("../src/services/evidence-asset-service.js"), ...require("../src/services/evidence-record-validator.js"), ...require("../src/services/evidence-record-service.js") }); }
function fsAdapter() { return { mkdir: (p) => fs.promises.mkdir(p, { recursive: true }), readFile: fs.promises.readFile, writeFile: fs.promises.writeFile, rename: fs.promises.rename, unlink: fs.promises.unlink, readdir: fs.promises.readdir, access: fs.promises.access, flush: async () => {} }; }

function freshServices() {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules: strategicModules(), unionRegistryService, initialState: emptyStrategicState });
  const evidenceDomainRuntime = createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } });
  const servers = season1Servers.servers.map((server) => server.id === "server-366" ? { ...server, ownership: { "1-1": "union-0001", "1-2": "union-0001" } } : server);
  const serverStateService = createServerStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, servers });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenanceState = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer: provenanceSerializer });
  const seasonAdministrationService = createSeasonAdministrationService({ preparedPackages: [SEASON_1_PACKAGE], validateSeasonPackage, authorizationPolicyService: createAuthorizationPolicyService(), persistenceCoordinator: { execute: async (mutation) => mutation() }, initialState: { schemaVersion: 2, activeSeason: { schemaVersion: 1, seasonId: context.seasonId, packageVersion: SEASON_1_PACKAGE.packageIdentity.packageVersion, serverIds: ["server-366"], confirmations: { mapAndStructures: true, resourcesAndValues: true }, activatedAt: "2026-08-01T00:00:00.000Z", activatedBy: "local" }, completedSeasons: [] }, clock: () => new Date("2026-08-13T00:00:00.000Z") });
  const applicationAuditRecordService = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "audit", clock: () => new Date("2026-08-13T00:00:00.000Z") });
  return { services: { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService, seasonAdministrationService, applicationAuditRecordService, ownershipHistoryProvenanceStateService: provenanceState }, provenanceSerializer };
}

function codecOptions(provenanceSerializer) {
  const evidenceStateSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModules().validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModules().validateEvidenceRecordHistory });
  return { seasonId: context.seasonId, baseMapId: context.baseMapId, provenanceSerializer, deserializeUnionRegistryEnvelope, deserializeStrategicDomainEnvelope, deserializeEvidenceEnvelope: evidenceStateSerializer.deserializeEnvelope.bind(evidenceStateSerializer), deserializeServerState: deserializePersistenceEnvelope, deserializeApplicationAuditEnvelope: require("../src/services/application-audit-record-serializer.js").createApplicationAuditRecordSerializer({ validateAuditHistory }).deserializeEnvelope };
}

async function createGeneration(directory) {
  const store = createGenerationStore({ baseDirectory: directory, fileSystem: fsAdapter() });
  const initial = freshServices();
  await initial.services.seasonAdministrationService.initialize();
  const savedAt = "2026-08-13T00:00:00.000Z";
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModules().validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModules().validateEvidenceRecordHistory });
  const documents = [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", value: serializeUnionRegistry(initial.services.unionRegistryService, savedAt) },
    { documentId: "strategic-season-1", scope: context.seasonId, type: "strategic-domain", value: serializeStrategicDomainRuntime(initial.services.strategicDomainRuntime, context.seasonId, savedAt) },
    { documentId: "evidence-season-1", scope: context.seasonId, type: "evidence-domain", value: evidenceSerializer.serializeRuntime(initial.services.evidenceDomainRuntime, savedAt) },
    { documentId: "projection-season-1-season1-map", scope: `${context.seasonId}/${context.baseMapId}`, type: "server-state", value: serializeServerState(initial.services.serverStateService, savedAt) },
    { documentId: "season-administration", scope: "global", type: "season-administration", value: initial.services.seasonAdministrationService.captureTransactionState() },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", value: { schemaVersion: 1, records: [] } }
  ];
  await store.commit({ expectedGeneration: 0, transactionId: "initial", createdAt: savedAt, documents });
  return { store, expectedCurrent: (await store.loadCommittedGeneration()).pointer, initialServices: initial.services };
}

async function createCoordinator(directory, decision, useRealDecision = false) {
  const generation = await createGeneration(directory);
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const freshFactory = { createFreshServices: () => { const next = freshServices(); return { services: next.services, codecOptions: codecOptions(next.provenanceSerializer) }; } };
  const targetCatalog = { territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }], structures: [] };
  const realDecisionService = createOwnershipProvenanceMigrationDecisionService({
    createCompletenessEvaluator: (options) => createOwnershipHistoryCompletenessEvaluator({
      ...options,
      ownershipHistoryResolver: createOwnershipHistoryResolver(options),
      ownershipProjectionComparator: createOwnershipProjectionComparator()
    })
  });
  const coordinator = createOwnershipProvenanceMigrationPreparationCoordinator({
    generationStore: generation.store,
    snapshotAdapter: createCommittedGenerationMigrationSnapshotAdapter({ generationStore: generation.store, seasonId: context.seasonId, baseMapId: context.baseMapId }),
    isolatedGraphLoader: createIsolatedApplicationGraphLoader({ ...freshFactory, createApplicationDocumentCodec }),
    migrationInputAdapter: createOwnershipMigrationInputAdapter({ resolveSeasonPackage: async () => SEASON_1_PACKAGE, createTargetCatalog: () => targetCatalog }),
    migrationDecisionService: useRealDecision ? realDecisionService : { decide: () => decision },
    provenanceSerializer,
    candidateDocumentBuilder: createOwnershipProvenanceCandidateDocumentBuilder(),
    clock: () => new Date("2026-08-13T00:00:00.000Z"),
    createTransactionId: () => "migration-transaction"
  });
  return { coordinator, generation, targetCatalog };
}

async function withDirectory(callback) { const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-migration-preparation-")); try { await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); } }
async function fileBytes(directory, name) { const filePath = path.join(directory, name); try { return (await fs.promises.readFile(filePath)).toString("base64"); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
function liveSnapshot(services) { return { union: services.unionRegistryService.captureTransactionState(), territory: services.strategicDomainRuntime.ownershipRecordService.captureTransactionState(), projection: services.serverStateService.captureTransactionState(), administration: services.seasonAdministrationService.captureTransactionState(), provenance: services.ownershipHistoryProvenanceStateService.captureTransactionState() }; }

(async () => {
  await withDirectory(async (directory) => {
    const { coordinator, generation } = await createCoordinator(directory, null, true);
    const before = await generation.store.loadCommittedGeneration();
    const beforeCurrent = await fileBytes(directory, "CURRENT");
    const beforePrevious = await fileBytes(directory, "PREVIOUS");
    const beforeLive = liveSnapshot(generation.initialServices);
    const result = await coordinator.prepare({ expectedCurrent: generation.expectedCurrent });
    assert.strictEqual(result.status, "prepared");
    assert.strictEqual(result.candidate.generation, 2);
    assert.strictEqual((await generation.store.loadCommittedGeneration()).manifest.generation, before.manifest.generation);
    const reopened = await generation.store.loadCandidate(result.candidate);
    const provenance = reopened.documents.find((document) => document.type === "ownership-history-provenance");
    assert.strictEqual(provenance.value.documentId, "ownership-provenance:season-1:season1-map");
    assert.deepStrictEqual(provenance.value.records[0].sourceDocumentIds, ["projection-season-1-season1-map", "strategic-season-1"]);
    assert.strictEqual(provenance.value.records[0].territoryCoverage.classification, "complete");
    const references = result.candidate.documents.filter((document) => document.storage === "reference");
    assert.strictEqual(references.length, before.manifest.documents.length);
    before.manifest.documents.forEach((document) => { const reference = references.find((candidate) => candidate.documentId === document.documentId); assert.deepStrictEqual({ fileName: reference.fileName, sha256: reference.sha256 }, { fileName: document.fileName, sha256: document.sha256 }); });
    assert.strictEqual(await fileBytes(directory, "CURRENT"), beforeCurrent);
    assert.strictEqual(await fileBytes(directory, "PREVIOUS"), beforePrevious);
    assert.deepStrictEqual(liveSnapshot(generation.initialServices), beforeLive);
    console.log("PASS eligible preparation derives real evidence and preserves generation/live state");
  });
  await withDirectory(async (directory) => {
    const { coordinator, generation } = await createCoordinator(directory, { decision: "already_proven" });
    const result = await coordinator.prepare({ expectedCurrent: generation.expectedCurrent });
    assert.deepStrictEqual(result, { status: "already_proven", expectedCurrent: { generation: generation.expectedCurrent.generation, manifestFile: generation.expectedCurrent.manifestFile, manifestSha256: generation.expectedCurrent.manifestSha256 } });
    console.log("PASS already-proven is a deterministic no-op");
  });
  await withDirectory(async (directory) => {
    const { coordinator, generation } = await createCoordinator(directory, { decision: "migration_with_projection_repair", serverReasons: [{ serverId: "server-366" }] });
    const result = await coordinator.prepare({ expectedCurrent: generation.expectedCurrent });
    assert.strictEqual(result.status, "refused");
    assert.strictEqual((await generation.store.loadCommittedGeneration()).manifest.generation, 1);
    console.log("PASS repair-required decisions are refused without preparation");
  });
  console.log("3 migration preparation integration scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); if (error.cause) console.error(error.cause.stack || error.cause.message); process.exitCode = 1; });
