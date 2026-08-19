const unions = require("../../data/unions.json");
const season1Servers = require("../../data/season1-servers.json");
const season1Map = require("../../data/season1-map.json");
const season2Servers = require("../../data/season2-servers.json");
const season2Map = require("../../data/season2-map.json");
const { SEASON_1_PACKAGE } = require("../seasons/season1-package.js");
const { SEASON_2_PACKAGE } = require("../seasons/season2-package.js");
const { validateSeasonPackage } = require("../services/season-package-validator.js");
const { createAuthorizationPolicyService } = require("../services/authorization-policy-service.js");
const { createSeasonAdministrationService } = require("../services/season-administration-service.js");
const { createUnionRegistryService } = require("../services/union-registry-service.js");
const { createStrategicDomainModuleRegistry } = require("../app/strategic-domain-module-registry.js");
const { createStrategicDomainRuntime } = require("../app/strategic-domain-runtime.js");
const { createEvidenceDomainModuleRegistry } = require("../app/evidence-domain-module-registry.js");
const { createEvidenceDomainRuntime } = require("../app/evidence-domain-runtime.js");
const { createServerStateService } = require("../services/server-state-service.js");
const { createApplicationAuditRecordService } = require("../services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../services/application-audit-record-validator.js");
const { createOwnershipHistoryProvenanceStateService } = require("../services/ownership-history-provenance-state-service.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../services/ownership-history-provenance-document-serializer.js");
const { createApplicationDocumentCodec } = require("../services/application-document-codec.js");
const { createOwnershipProvenanceMigrationStartupComposition } = require("./ownership-provenance-migration-startup-composition.js");
const { createLegacyStateClassifier } = require("../services/legacy-state-classifier.js");
const { createWarMapStartupReadiness } = require("./warmap-startup-readiness.js");
const { deserializeUnionRegistryEnvelope } = require("../services/union-registry-state-serializer.js");
const { deserializeStrategicDomainEnvelope } = require("../services/strategic-domain-state-serializer.js");
const { createEvidenceDomainStateSerializer } = require("../services/evidence-domain-state-serializer.js");
const { deserializePersistenceEnvelope } = require("../services/persistence-state-serializer.js");
const { createApplicationAuditRecordSerializer } = require("../services/application-audit-record-serializer.js");

const strategicNames = ["union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service", "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator", "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator", "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator", "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service", "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service", "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service", "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"];
const packages = Object.freeze([SEASON_1_PACKAGE, SEASON_2_PACKAGE]);
const packageBySeason = new Map(packages.map((candidate) => [candidate.packageIdentity.seasonId, candidate]));
const serverDataBySeason = new Map([["season-1", season1Servers], ["season-2", season2Servers]]);
const mapDataBySeason = new Map([["season-1", season1Map], ["season-2", season2Map]]);

function strategicModules() { return createStrategicDomainModuleRegistry(strategicNames.reduce((all, name) => Object.assign(all, require(`../services/${name}.js`)), {})); }
function evidenceModules() { return createEvidenceDomainModuleRegistry({ ...require("../services/evidence-asset-validator.js"), ...require("../services/evidence-asset-service.js"), ...require("../services/evidence-record-validator.js"), ...require("../services/evidence-record-service.js") }); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return structuredClone(value); }
function freeze(value) { if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value; Object.keys(value).forEach((key) => freeze(value[key])); return Object.freeze(value); }
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function packageContext(seasonId) {
  const packageValue = packageBySeason.get(seasonId);
  if (!isRecord(packageValue) || packageValue.packageIdentity.seasonId !== seasonId) fail("season_package_mismatch", `No package matches active season '${seasonId}'.`);
  const mapDefinition = packageValue.rulesDefinition && packageValue.rulesDefinition.mapDefinition;
  if (!isRecord(mapDefinition) || typeof mapDefinition.baseMapId !== "string") fail("season_package_invalid", `Package '${seasonId}' has no valid base map.`);
  const map = mapDataBySeason.get(seasonId);
  const servers = serverDataBySeason.get(seasonId);
  if (!map || !servers) fail("season_data_unavailable", `No registered map/server data exists for '${seasonId}'.`);
  return { seasonId, baseMapId: mapDefinition.baseMapId, packageValue: clone(packageValue), map: clone(map), servers: clone(servers) };
}
function targetCatalog(context) {
  const points = context.map.topologyType === "strategic_node_network"
    ? context.map.nodes.map((node) => ({ type: "strategic_node", nodeId: node.nodeId }))
    : context.map.tiles.flat().map((tile) => ({ type: "normal_map_cell", row: tile.row, col: tile.col }));
  const structures = Array.isArray(context.map.structures)
    ? context.map.structures.map((structure) => ({ structureId: structure.id, footprint: [{ row: structure.row, col: structure.col }] }))
    : [];
  if (points.length === 0) fail("target_catalog_missing", `No target catalog points exist for '${context.seasonId}'.`);
  return { territoryKeys: points, structures };
}
function freshServices(context) {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules: strategicModules(), unionRegistryService, initialState: { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: [], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] } });
  const evidenceDomainRuntime = createEvidenceDomainRuntime({ modules: evidenceModules(), initialState: { assets: [], evidenceRecords: [] } });
  const serverStateService = createServerStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, servers: context.servers.servers });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenanceState = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer: provenanceSerializer });
  const seasonAdministrationService = createSeasonAdministrationService({ preparedPackages: packages, validateSeasonPackage, authorizationPolicyService: createAuthorizationPolicyService(), persistenceCoordinator: { execute: async (mutation) => mutation() }, initialState: { schemaVersion: 2, activeSeason: null, completedSeasons: [] }, clock: () => new Date() });
  const applicationAuditRecordService = createApplicationAuditRecordService({ initialRecords: [], validateAuditRecord, validateAuditHistory, createAuditId: () => "startup-audit", clock: () => new Date() });
  return { services: { unionRegistryService, strategicDomainRuntime, evidenceDomainRuntime, serverStateService, seasonAdministrationService, applicationAuditRecordService, ownershipHistoryProvenanceStateService: provenanceState }, provenanceSerializer };
}
function codecOptionsFactory(context, _fresh, provenanceSerializer) {
  const evidence = evidenceModules();
  const evidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidence.validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidence.validateEvidenceRecordHistory });
  const auditSerializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
  return { seasonId: context.seasonId, baseMapId: context.baseMapId, provenanceSerializer, deserializeUnionRegistryEnvelope, deserializeStrategicDomainEnvelope, deserializeEvidenceEnvelope: evidenceSerializer.deserializeEnvelope.bind(evidenceSerializer), deserializeServerState: deserializePersistenceEnvelope, deserializeApplicationAuditEnvelope: auditSerializer.deserializeEnvelope };
}
function contextFromCommitted(loaded) {
  if (!isRecord(loaded) || loaded.status !== "committed" || loaded.source !== "current" || !Array.isArray(loaded.documents)) fail("unsafe_generation", "Committed startup context is not current and unambiguous.");
  const administration = loaded.documents.find((document) => document.documentId === "season-administration");
  const strategic = loaded.documents.filter((document) => document.type === "strategic-domain");
  const projections = loaded.documents.filter((document) => document.type === "server-state");
  const active = administration && administration.value && administration.value.activeSeason;
  if (!isRecord(active) || typeof active.seasonId !== "string" || !Array.isArray(active.serverIds) || active.serverIds.length === 0) fail("active_season_missing", "Committed application graph has no coherent active season.");
  if (strategic.length !== 1 || projections.length !== 1 || strategic[0].scope !== active.seasonId) fail("generation_scope_mismatch", "Committed application graph scopes are inconsistent.");
  const projectionParts = typeof projections[0].scope === "string" ? projections[0].scope.split("/") : [];
  if (projectionParts.length !== 2 || projectionParts[0] !== active.seasonId) fail("generation_scope_mismatch", "Committed projection scope is inconsistent.");
  const context = packageContext(active.seasonId);
  if (context.baseMapId !== projectionParts[1]) fail("generation_scope_mismatch", "Committed package and projection base maps differ.");
  const serverIds = new Set(active.serverIds);
  const projectionValue = projections[0].value;
  if (!isRecord(projectionValue) || !Array.isArray(projectionValue.servers)) fail("server_scope_mismatch", "Committed projection has no coherent server list.");
  const projectedIds = new Set(projectionValue.servers.map((server) => server && server.id));
  if (projectedIds.size !== projectionValue.servers.length || active.serverIds.some((serverId) => !projectedIds.has(serverId))) fail("server_scope_mismatch", "Committed projection is missing an active server.");
  return freeze({ ...context, servers: { ...context.servers, seasonId: active.seasonId, baseMapId: context.baseMapId, servers: clone(projectionValue.servers) }, serverIds: active.serverIds.slice() });
}
function createComposition(generationStore, context) {
  return createOwnershipProvenanceMigrationStartupComposition({ generationStore, seasonId: context.seasonId, baseMapId: context.baseMapId, resolveSeasonPackage: async (seasonId) => packageBySeason.get(seasonId) || null, createTargetCatalog: async () => targetCatalog(context), createFreshServices: async () => freshServices(context), createApplicationDocumentCodec, codecOptionsFactory: (fresh, serializer) => codecOptionsFactory(context, fresh, serializer), clock: () => new Date(), createTransactionId: () => `migration-${Date.now()}` });
}
function createWarmapElectronStartup({ generationStore, fileStore }) {
  if (!generationStore || !fileStore) throw new TypeError("generationStore and fileStore are required.");
  let contextPromise;
  const getContext = async () => {
    if (!contextPromise) {
      contextPromise = (async () => {
        const loaded = await generationStore.loadCommittedGeneration();
        if (loaded && loaded.status === "missing") {
          const activation = await fileStore.loadEnvelope({ scope: "season_activation" });
          const activeSeason = activation && activation.activeSeason;
          return activeSeason && typeof activeSeason.seasonId === "string" ? packageContext(activeSeason.seasonId) : null;
        }
        return contextFromCommitted(loaded);
      })();
    }
    return contextPromise;
  };
  const migrationStartup = { async resolve() { const context = await getContext(); return context ? createComposition(generationStore, context).resolve() : { status: "legacy_required", persistenceMode: "legacy", generation: null, reason: "no_committed_generation", diagnostics: [] }; } };
  const legacyStateLoader = { async load() { const context = await getContext(); if (!context) return { seasonId: "first-run", baseMapId: "first-run", dataManagementEnvelope: null, serverStateEnvelope: null, unionRegistryEnvelopes: [] }; const dataManagementEnvelope = await fileStore.loadEnvelope({ scope: "data_management", seasonId: context.seasonId }); const serverStateEnvelope = await fileStore.loadEnvelope({ seasonId: context.seasonId, baseMapId: context.baseMapId }); return { seasonId: context.seasonId, baseMapId: context.baseMapId, dataManagementEnvelope, serverStateEnvelope, unionRegistryEnvelopes: dataManagementEnvelope ? [dataManagementEnvelope.unionRegistry] : [] }; } };
  const legacyEvidenceSerializer = createEvidenceDomainStateSerializer({ validateEvidenceAssetHistory: evidenceModules().validateEvidenceAssetHistory, validateEvidenceRecordHistory: evidenceModules().validateEvidenceRecordHistory });
  const legacyStateClassifier = createLegacyStateClassifier({ deserializeDataManagementEnvelope: (envelope) => ({ seasonId: envelope.seasonId, unionRegistry: deserializeUnionRegistryEnvelope(envelope.unionRegistry), strategicDomain: deserializeStrategicDomainEnvelope(envelope.strategicDomain), evidenceDomain: legacyEvidenceSerializer.deserializeEnvelope(envelope.evidenceDomain) }), deserializeServerStateEnvelope: deserializePersistenceEnvelope });
  return createWarMapStartupReadiness({ migrationStartup, legacyStateLoader, legacyStateClassifier });
}
module.exports = { createWarmapElectronStartup, contextFromCommitted };
