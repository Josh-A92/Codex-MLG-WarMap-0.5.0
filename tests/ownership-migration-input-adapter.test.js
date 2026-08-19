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
const { createServerStateService } = require("../src/services/server-state-service.js");
const { createOwnershipHistoryProvenanceStateService } = require("../src/services/ownership-history-provenance-state-service.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../src/services/ownership-history-provenance-document-serializer.js");
const { serializeServerState } = require("../src/services/persistence-state-serializer.js");
const { createOwnershipMigrationInputAdapter, OwnershipMigrationInputAdapterError } = require("../src/services/ownership-migration-input-adapter.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };
const strategicFiles = [
  "union-matching-service", "union-server-season-relation-service", "native-union-assignment-validator", "native-union-assignment-service",
  "active-union-status-validator", "active-union-status-evaluator", "active-union-status-service", "combat-strength-observation-validator",
  "combat-strength-observation-service", "server-observation-validator", "server-observation-service", "ownership-record-validator",
  "ownership-record-service", "ownership-retraction-validator", "ownership-retraction-service", "target-verification-validator", "target-verification-service", "confirmed-server-snapshot-validator",
  "confirmed-server-snapshot-service", "confirmed-server-snapshot-coordinator", "snapshot-activity-fact-resolver", "activity-fact-history-service",
  "active-union-status-update-coordinator", "active-union-status-projection-service", "union-server-season-view-service",
  "union-server-season-intelligence-view-service", "server-intelligence-view-service", "server-data-completeness-service",
  "confirmed-snapshot-change-service", "server-history-service", "union-registry-service"
];
const modules = createStrategicDomainModuleRegistry(strategicFiles.reduce((all, name) => Object.assign(all, require(`../src/services/${name}.js`)), {}));
const emptyState = { relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [], serverObservations: [], territoryOwnershipRecords: [], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] };

async function createRealSnapshot() {
  const unionRegistryService = createUnionRegistryService(unions.unions);
  const strategicDomainRuntime = createStrategicDomainRuntime({ modules, unionRegistryService, initialState: emptyState });
  const serverStateService = createServerStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, servers: season1Servers.servers });
  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenanceState = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer: provenanceSerializer });
  const seasonAdministrationService = createSeasonAdministrationService({
    preparedPackages: [SEASON_1_PACKAGE], validateSeasonPackage, authorizationPolicyService: createAuthorizationPolicyService(),
    persistenceCoordinator: { execute: async (mutation) => mutation() },
    initialState: {
      schemaVersion: 2,
      activeSeason: {
        schemaVersion: 1, seasonId: context.seasonId, packageVersion: SEASON_1_PACKAGE.packageIdentity.packageVersion,
        serverIds: ["server-366"], confirmations: { mapAndStructures: true, resourcesAndValues: true },
        activatedAt: "2026-08-01T00:00:00.000Z", activatedBy: "local-operator"
      },
      completedSeasons: []
    },
    clock: () => new Date("2026-08-13T00:00:00.000Z")
  });
  await seasonAdministrationService.initialize();
  return {
    status: "loaded",
    state: {
      unionRegistry: unionRegistryService.captureTransactionState(),
      strategicDomain: {
        ownershipRecordService: strategicDomainRuntime.ownershipRecordService.captureTransactionState()
      },
      serverState: serverStateService.captureTransactionState(),
      serverStateDocument: serializeServerState(serverStateService, "2026-08-13T00:00:00.000Z"),
      seasonAdministration: seasonAdministrationService.captureTransactionState(),
      ownershipHistoryProvenance: provenanceState.captureTransactionState()
    }
  };
}

function adapter(overrides = {}) {
  return createOwnershipMigrationInputAdapter({
    resolveSeasonPackage: async (seasonId) => seasonId === context.seasonId ? SEASON_1_PACKAGE : null,
    createTargetCatalog: (preparedPackage) => ({
      territoryKeys: [{ row: 1, col: 1 }, { row: preparedPackage.rulesDefinition.mapDefinition.dimensions.rows, col: preparedPackage.rulesDefinition.mapDefinition.dimensions.columns }],
      structures: preparedPackage.rulesDefinition.structureCatalog.map((entry) => ({ structureId: entry.structureTypeId, footprint: [{ row: 1, col: 1 }] }))
    }),
    ...overrides
  });
}

function sourceDocumentIds() { return { strategic: "strategic-season-1", projection: "projection-season-1-season1-map" }; }
function assertCode(callback, code) { return assert.rejects(callback, (error) => error instanceof OwnershipMigrationInputAdapterError && error.code === code); }

(async () => {
  const snapshot = await createRealSnapshot();
  const result = await adapter().adapt({ snapshot, sourceDocumentIds: sourceDocumentIds() });
  assert.deepStrictEqual(result.activeSeason, { seasonId: context.seasonId, baseMapId: context.baseMapId, serverIds: ["server-366"] });
  assert.deepStrictEqual(result.sourceDocumentIds, sourceDocumentIds());
  assert.strictEqual(result.provenanceState.status, "unknown_provenance");
  assert.strictEqual(result.persistedProjection.schemaVersion, 1);
  assert.strictEqual(result.persistedProjection.savedAt, "2026-08-13T00:00:00.000Z");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.targetCatalog));
  console.log("PASS real isolated snapshot derives migration input and target catalog");

  await assertCode(() => adapter().adapt({ snapshot: { ...snapshot, state: { ...snapshot.state, seasonAdministration: { activeSeason: null } } }, sourceDocumentIds: sourceDocumentIds() }), "active_season_unavailable");
  await assertCode(() => adapter({ resolveSeasonPackage: async () => null }).adapt({ snapshot, sourceDocumentIds: sourceDocumentIds() }), "season_package_unavailable");
  await assertCode(() => adapter().adapt({ snapshot, sourceDocumentIds: { strategic: "same", projection: "same" } }), "invalid_source_documents");
  console.log("PASS missing package and source IDs fail closed");

  const unresolved = JSON.parse(JSON.stringify(snapshot));
  unresolved.state.serverState["server-366"]["1-1"] = "missing-union";
  await assertCode(() => adapter().adapt({ snapshot: unresolved, sourceDocumentIds: sourceDocumentIds() }), "unresolved_union");
  const outOfScope = JSON.parse(JSON.stringify(snapshot));
  outOfScope.state.seasonAdministration.activeSeason.serverIds = ["server-999"];
  await assertCode(() => adapter().adapt({ snapshot: outOfScope, sourceDocumentIds: sourceDocumentIds() }), "server_scope_mismatch");
  console.log("PASS union and active-server scope checks fail closed");

  const before = JSON.stringify(snapshot);
  result.targetCatalog.structures[0].structureId = "changed";
  assert.strictEqual(JSON.stringify(snapshot), before);
  assert.strictEqual(typeof adapter().load, "undefined");
  console.log("PASS adapter returns immutable safe input only");
  console.log("4 ownership migration input adapter scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
