const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");
const { createStrategicDomainRuntime } = require("../src/app/strategic-domain-runtime.js");
const {
  serializeStrategicDomainRuntime,
  deserializeStrategicDomainEnvelope
} = require("../src/services/strategic-domain-state-serializer.js");

const modulePaths = [
  "union-matching-service.js",
  "union-server-season-relation-service.js",
  "native-union-assignment-validator.js",
  "native-union-assignment-service.js",
  "active-union-status-validator.js",
  "active-union-status-evaluator.js",
  "active-union-status-service.js",
  "combat-strength-observation-validator.js",
  "combat-strength-observation-service.js",
  "server-observation-validator.js",
  "server-observation-service.js",
  "ownership-record-validator.js",
  "ownership-record-service.js",
  "target-verification-validator.js",
  "target-verification-service.js",
  "confirmed-server-snapshot-validator.js",
  "confirmed-server-snapshot-service.js",
  "confirmed-server-snapshot-coordinator.js",
  "snapshot-activity-fact-resolver.js",
  "activity-fact-history-service.js",
  "active-union-status-update-coordinator.js",
  "active-union-status-projection-service.js",
  "union-server-season-view-service.js",
  "union-server-season-intelligence-view-service.js",
  "server-intelligence-view-service.js",
  "server-data-completeness-service.js",
  "confirmed-snapshot-change-service.js",
  "server-history-service.js"
];

function createModules() {
  return modulePaths.reduce((modules, fileName) => (
    Object.assign(modules, require(`../src/services/${fileName}`))
  ), {});
}

function createInitialState() {
  return {
    relations: [],
    nativeAssignments: [],
    activeStatuses: [],
    combatStrengthObservations: [],
    serverObservations: [],
    territoryOwnershipRecords: [],
    structureOwnershipRecords: [],
    targetVerifications: [],
    confirmedSnapshots: [],
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  };
}

function createRegistry() {
  return createUnionRegistryService([
    {
      unionId: "union-0001",
      displayName: "Moonlight Guillotine",
      tag: "MLG",
      aliases: [],
      defaultColor: "#8FCEFF",
      presentationMetadata: {},
      registryStatus: "current"
    }
  ]);
}

const modules = createModules();
const initialState = createInitialState();
const unionRegistryService = createRegistry();
const runtime = createStrategicDomainRuntime({
  modules,
  unionRegistryService,
  initialState
});

assert.strictEqual(Object.isFrozen(runtime), true);
assert.strictEqual(runtime.unionRegistryService, unionRegistryService);
[
  ["unionMatchingService", "match"],
  ["relationService", "listRelations"],
  ["nativeAssignmentService", "listAssignments"],
  ["activeStatusEvaluator", "evaluate"],
  ["activeStatusService", "listStatuses"],
  ["combatStrengthObservationService", "listObservations"],
  ["serverObservationService", "listObservations"],
  ["ownershipRecordService", "listTerritoryRecords"],
  ["targetVerificationService", "listVerifications"],
  ["confirmedSnapshotValidator", "validateConfirmedServerSnapshot"],
  ["confirmedSnapshotService", "listSnapshots"],
  ["confirmedSnapshotCoordinator", "confirmSnapshot"],
  ["snapshotActivityFactResolver", "resolve"],
  ["activityFactHistoryService", "getAllFacts"],
  ["activeStatusUpdateCoordinator", "processSnapshot"],
  ["activeStatusProjectionService", "getProjection"],
  ["unionServerSeasonViewService", "listViews"],
  ["unionServerSeasonIntelligenceViewService", "listViews"],
  ["serverIntelligenceViewService", "getView"],
  ["serverDataCompletenessService", "evaluate"],
  ["confirmedSnapshotChangeService", "compare"],
  ["serverHistoryService", "getTimeline"]
].forEach(([serviceName, methodName]) => {
  assert.strictEqual(typeof runtime[serviceName][methodName], "function", `${serviceName}.${methodName}`);
});

assert.deepStrictEqual(runtime.relationService.listRelations(), []);
assert.deepStrictEqual(runtime.nativeAssignmentService.listAssignments(), []);
assert.deepStrictEqual(runtime.activeStatusService.listStatuses(), []);
assert.deepStrictEqual(runtime.combatStrengthObservationService.listObservations(), []);
assert.deepStrictEqual(runtime.serverObservationService.listObservations(), []);
assert.deepStrictEqual(runtime.ownershipRecordService.listTerritoryRecords(), []);
assert.deepStrictEqual(runtime.ownershipRecordService.listStructureRecords(), []);
assert.deepStrictEqual(runtime.targetVerificationService.listVerifications(), []);
assert.deepStrictEqual(runtime.confirmedSnapshotService.listSnapshots(), []);
assert.deepStrictEqual(runtime.activityFactHistoryService.getAllFacts(), {
  confirmedPresenceFacts: [],
  qualifyingFullMapConfirmations: []
});
assert.deepStrictEqual(initialState, createInitialState());

const match = runtime.unionMatchingService.match({ value: "MLG" });
assert.strictEqual(match.matchType, "exact_tag");
assert.strictEqual(match.matchedUnion.unionId, "union-0001");

const serializedRuntime = serializeStrategicDomainRuntime(
  runtime,
  "season-1",
  "2026-07-30T22:30:00.000Z"
);
const restoredEnvelope = deserializeStrategicDomainEnvelope(serializedRuntime);
const restoredRuntime = createStrategicDomainRuntime({
  modules,
  unionRegistryService,
  initialState: restoredEnvelope.state
});
assert.notStrictEqual(restoredRuntime, runtime);
assert.deepStrictEqual(restoredRuntime.relationService.listRelations(), []);
assert.deepStrictEqual(restoredRuntime.activityFactHistoryService.getAllFacts(), {
  confirmedPresenceFacts: [],
  qualifyingFullMapConfirmations: []
});

const populatedState = createInitialState();
populatedState.combatStrengthObservations.push({
  observationId: "combat-1",
  unionId: "union-0001",
  serverId: "server-366",
  seasonId: "season-1",
  value: 128450,
  unit: "combat strength",
  displayFormat: "number",
  observedAt: "2026-07-25T09:15:00Z",
  sourceType: "manual_entry",
  evidenceId: null,
  extractionMethod: null,
  rawExtractedValue: null,
  normalizedValue: 128450,
  confidence: null,
  reviewState: "confirmed",
  actorId: "user-1",
  reviewerId: "user-1",
  reviewedAt: "2026-07-25T09:16:00Z",
  supersededBy: null
});
populatedState.serverObservations.push({
  observationId: "server-note-1",
  serverId: "server-366",
  seasonId: "season-1",
  text: "Eastern territory was obscured in the source.",
  observedAt: "2026-07-25T09:15:00Z",
  sourceType: "manual_entry",
  evidenceIds: [],
  actorId: "user-1",
  reviewState: "confirmed",
  reviewerId: "user-1",
  reviewedAt: "2026-07-25T09:16:00Z",
  supersededBy: null
});
const populatedRuntime = createStrategicDomainRuntime({
  modules,
  unionRegistryService,
  initialState: populatedState
});
const populatedEnvelope = serializeStrategicDomainRuntime(
  populatedRuntime,
  "season-1",
  "2026-07-30T22:31:00.000Z"
);
const roundTrippedRuntime = createStrategicDomainRuntime({
  modules,
  unionRegistryService,
  initialState: deserializeStrategicDomainEnvelope(populatedEnvelope).state
});
assert.strictEqual(
  roundTrippedRuntime.combatStrengthObservationService
    .getObservation("combat-1").value,
  128450
);
assert.strictEqual(
  roundTrippedRuntime.serverObservationService
    .getObservation("server-note-1").text,
  "Eastern territory was obscured in the source."
);

assert.throws(
  () => createStrategicDomainRuntime({
    modules,
    unionRegistryService,
    initialState: { ...createInitialState(), extra: [] }
  }),
  /initialState\.extra/
);
assert.throws(
  () => createStrategicDomainRuntime({
    modules: { ...modules, createActiveUnionStatusService: null },
    unionRegistryService,
    initialState: createInitialState()
  }),
  /modules\.createActiveUnionStatusService/
);
assert.throws(
  () => createStrategicDomainRuntime({
    modules,
    unionRegistryService: {},
    initialState: createInitialState()
  }),
  /unionRegistryService\.listUnionIdentities/
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "strategic-domain-runtime.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createStrategicDomainRuntime, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));

console.log("ok - strategic domain runtime");
console.log("\n1 test passed");
