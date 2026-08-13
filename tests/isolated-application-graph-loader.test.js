const assert = require("assert");
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
const { createIsolatedApplicationGraphLoader, IsolatedApplicationGraphLoaderError } = require("../src/services/isolated-application-graph-loader.js");
const { serializeUnionRegistry, deserializeUnionRegistryEnvelope } = require("../src/services/union-registry-state-serializer.js");
const { serializeStrategicDomainRuntime, deserializeStrategicDomainEnvelope } = require("../src/services/strategic-domain-state-serializer.js");
const { createEvidenceDomainStateSerializer } = require("../src/services/evidence-domain-state-serializer.js");
const { serializeServerState, deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };
const emptyStrategicState = {
  relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [],
  territoryOwnershipRecords: [], structureOwnershipRecords: [], targetVerifications: [], confirmedSnapshots: [],
  confirmedPresenceFacts: [], qualifyingFullMapConfirmations: []
};
const strategicFiles = [
  "union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service",
  "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator",
  "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator",
  "ownership-record-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator",
  "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service",
  "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service",
  "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service",
  "confirmed-snapshot-change-service", "server-history-service"
];
function strategicModules() { return createStrategicDomainModuleRegistry(strategicFiles.concat(["union-registry-service"]).reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {})); }
function evidenceModules() {
  return createEvidenceDomainModuleRegistry({
    ...require("../src/services/evidence-asset-validator.js"),
    ...require("../src/services/evidence-asset-service.js"),
    ...require("../src/services/evidence-record-validator.js"),
    ...require("../src/services/evidence-record-service.js")
  });
}
function freshServices(created, includeProvenance = true) {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules: strategicModules(), unionRegistryService, initialState: emptyStrategicState });
  const evidenceDomainRuntime = createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } });
  const serverStateService = createServerStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, servers: season1Servers.servers });
  const seasonAdministrationService = createSeasonAdministrationService({
    preparedPackages: [SEASON_1_PACKAGE],
    validateSeasonPackage,
    authorizationPolicyService: createAuthorizationPolicyService(),
    persistenceCoordinator: { execute: async (mutation) => mutation() },
    initialState: { schemaVersion: 2, activeSeason: null, completedSeasons: [] },
    clock: () => new Date("2026-08-13T00:00:00.000Z")
  });
  const applicationAuditRecordService = createApplicationAuditRecordService({
    initialRecords: [], validateAuditRecord, validateAuditHistory,
    createAuditId: () => "isolated-audit", clock: () => new Date("2026-08-13T00:00:00.000Z")
  });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const services = { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService, seasonAdministrationService, applicationAuditRecordService };
  if (includeProvenance) services.ownershipHistoryProvenanceStateService = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer: provenanceSerializer });
  created.push(services);
  const evidenceStateSerializer = createEvidenceDomainStateSerializer({
    validateEvidenceAssetHistory: evidenceModules().validateEvidenceAssetHistory,
    validateEvidenceRecordHistory: evidenceModules().validateEvidenceRecordHistory
  });
  return {
    services,
    codecOptions: {
      seasonId: context.seasonId,
      baseMapId: context.baseMapId,
      provenanceSerializer: includeProvenance ? provenanceSerializer : null,
      deserializeUnionRegistryEnvelope,
      deserializeStrategicDomainEnvelope,
      deserializeEvidenceEnvelope: evidenceStateSerializer.deserializeEnvelope.bind(evidenceStateSerializer),
      deserializeServerState: deserializePersistenceEnvelope,
      deserializeApplicationAuditEnvelope: (value) => value
    },
    serializers: { evidenceStateSerializer }
  };
}

function buildDocuments() {
  const created = [];
  const first = freshServices(created);
  const savedAt = "2026-08-13T00:00:00.000Z";
  const documents = [
    { documentId: "union-registry-global", value: serializeUnionRegistry(first.services.unionRegistryService, savedAt) },
    { documentId: "strategic-season-1", value: serializeStrategicDomainRuntime(first.services.strategicDomainRuntime, context.seasonId, savedAt) },
    { documentId: "evidence-season-1", value: first.serializers.evidenceStateSerializer.serializeRuntime(first.services.evidenceDomainRuntime, savedAt) },
    { documentId: "projection-season-1-season1-map", value: serializeServerState(first.services.serverStateService, savedAt) },
    { documentId: "season-administration", value: first.services.seasonAdministrationService.captureTransactionState() },
    { documentId: "application-audit-global", value: { schemaVersion: 1, records: [] } }
  ];
  return { documents, created };
}

function loader(created, includeProvenance = true) {
  return createIsolatedApplicationGraphLoader({
    createFreshServices: () => freshServices(created, includeProvenance),
    createApplicationDocumentCodec
  });
}

(async () => {
  const source = buildDocuments();
  const created = source.created;
  const firstResult = await loader(created).load({ documents: source.documents });
  const secondResult = await loader(created).load({ documents: source.documents });
  assert.ok(Object.isFrozen(firstResult));
  assert.ok(Object.isFrozen(firstResult.state));
  assert.deepStrictEqual(firstResult.state, secondResult.state);
  assert.notStrictEqual(firstResult.state, secondResult.state);
  assert.strictEqual(typeof firstResult.state.serverState.getServer, "undefined");
  assert.strictEqual(typeof firstResult.state.serverState.captureTransactionState, "undefined");
  assert.strictEqual(firstResult.state.serverStateDocument.schemaVersion, 1);
  assert.strictEqual(typeof firstResult.state.serverStateDocument.savedAt, "string");
  created[1].serverStateService.setTerritoryOwner("server-366", "1-1", "union-0001");
  assert.deepStrictEqual(firstResult.state.serverState, secondResult.state.serverState);
  console.log("PASS real fresh participants are isolated and snapshots expose no handles");

  const optional = await loader(created, true).load({ documents: source.documents.filter((document) => !["application-audit-global"].includes(document.documentId)) });
  assert.deepStrictEqual(optional.state.applicationAudit, []);
  assert.strictEqual(optional.state.ownershipHistoryProvenance.status, "unknown_provenance");
  console.log("PASS missing audit and provenance compatibility is preserved");

  await assert.rejects(() => loader(created).load({ documents: source.documents.map((document) => document.documentId === "strategic-season-1" ? { ...document, value: null } : document) }), (error) => error instanceof IsolatedApplicationGraphLoaderError && error.code === "graph_load_failed");
  console.log("PASS malformed restoration fails without exposing a graph");

  const loaderSurface = loader(created);
  assert.strictEqual(typeof loaderSurface.load, "function");
  assert.strictEqual(typeof loaderSurface.commit, "undefined");
  assert.strictEqual(typeof loaderSurface.prepare, "undefined");
  assert.strictEqual(typeof loaderSurface.publish, "undefined");
  console.log("PASS loader exposes only isolated loading");

  console.log("4 isolated application graph loader scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
