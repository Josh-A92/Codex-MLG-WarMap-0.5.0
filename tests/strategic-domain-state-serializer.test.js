const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateStrategicDomainEnvelope,
  serializeStrategicDomainRuntime,
  deserializeStrategicDomainEnvelope
} = require("../src/services/strategic-domain-state-serializer.js");

const COLLECTION_FIELDS = [
  "relations",
  "nativeAssignments",
  "activeStatuses",
  "combatStrengthObservations",
  "serverObservations",
  "territoryOwnershipRecords",
  "structureOwnershipRecords",
  "targetVerifications",
  "confirmedSnapshots",
  "confirmedPresenceFacts",
  "qualifyingFullMapConfirmations"
];

function createState() {
  return COLLECTION_FIELDS.reduce((state, field) => {
    state[field] = [];
    return state;
  }, {});
}

function createEnvelope() {
  return {
    schemaVersion: 1,
    seasonId: "season-1",
    savedAt: "2026-07-30T22:30:00.000Z",
    state: createState()
  };
}

function record(recordId) {
  return {
    seasonId: "season-1",
    recordId,
    metadata: JSON.parse('{"__proto__":{"polluted":true}}')
  };
}

function createRuntime() {
  const state = {
    relations: [record("relation")],
    nativeAssignments: [record("native")],
    activeStatuses: [record("active")],
    combatStrengthObservations: [record("combat")],
    serverObservations: [record("server-observation")],
    territoryOwnershipRecords: [record("territory")],
    structureOwnershipRecords: [record("structure")],
    targetVerifications: [record("verification")],
    confirmedSnapshots: [record("snapshot")],
    confirmedPresenceFacts: [record("presence")],
    qualifyingFullMapConfirmations: [record("confirmation")]
  };
  return {
    state,
    runtime: {
      relationService: { listRelations: () => state.relations },
      nativeAssignmentService: { listAssignments: () => state.nativeAssignments },
      activeStatusService: { listStatuses: () => state.activeStatuses },
      combatStrengthObservationService: {
        listObservations: () => state.combatStrengthObservations
      },
      serverObservationService: {
        listObservations: () => state.serverObservations
      },
      ownershipRecordService: {
        listTerritoryRecords: () => state.territoryOwnershipRecords,
        listStructureRecords: () => state.structureOwnershipRecords
      },
      targetVerificationService: { listVerifications: () => state.targetVerifications },
      confirmedSnapshotService: { listSnapshots: () => state.confirmedSnapshots },
      activityFactHistoryService: {
        getAllFacts: () => ({
          confirmedPresenceFacts: state.confirmedPresenceFacts,
          qualifyingFullMapConfirmations: state.qualifyingFullMapConfirmations
        })
      }
    }
  };
}

assert.deepStrictEqual(validateStrategicDomainEnvelope(createEnvelope()), {
  valid: true,
  errors: [],
  warnings: []
});

const missingStateField = createEnvelope();
delete missingStateField.state.activeStatuses;
assert.strictEqual(validateStrategicDomainEnvelope(missingStateField).valid, false);
assert.ok(validateStrategicDomainEnvelope(missingStateField).errors.some(
  (error) => error.code === "MISSING_REQUIRED_FIELD" && error.path === "state.activeStatuses"
));

const unknownFields = createEnvelope();
unknownFields.extra = true;
unknownFields.state.extra = [];
const unknownResult = validateStrategicDomainEnvelope(unknownFields);
assert.strictEqual(unknownResult.valid, false);
assert.ok(unknownResult.errors.some((error) => error.path === "extra"));
assert.ok(unknownResult.errors.some((error) => error.path === "state.extra"));

const invalidVersion = createEnvelope();
invalidVersion.schemaVersion = 2;
assert.ok(validateStrategicDomainEnvelope(invalidVersion).errors.some(
  (error) => error.code === "UNSUPPORTED_SCHEMA_VERSION"
));

[
  "2026-07-30T22:30:00Z",
  "2026-07-30T22:30:00.00Z",
  "2026-07-30T22:30:00.000+00:00",
  "2026-02-30T22:30:00.000Z"
].forEach((savedAt) => {
  const candidate = createEnvelope();
  candidate.savedAt = savedAt;
  assert.strictEqual(validateStrategicDomainEnvelope(candidate).valid, false, savedAt);
});

const mismatchedRecord = createEnvelope();
mismatchedRecord.state.relations.push({ seasonId: "season-2" });
assert.ok(validateStrategicDomainEnvelope(mismatchedRecord).errors.some(
  (error) => error.code === "SEASON_ID_MISMATCH"
));

const missingRecordSeason = createEnvelope();
missingRecordSeason.state.nativeAssignments.push({});
assert.ok(validateStrategicDomainEnvelope(missingRecordSeason).errors.some(
  (error) => error.code === "MISSING_RECORD_SEASON_ID"
));

const invalidCollection = createEnvelope();
invalidCollection.state.confirmedSnapshots = {};
assert.ok(validateStrategicDomainEnvelope(invalidCollection).errors.some(
  (error) => error.code === "INVALID_ARRAY"
));

const { runtime, state } = createRuntime();
state.territoryOwnershipRecords = [
  {
    seasonId: "season-1",
    recordId: "exact-time",
    eventAt: { precision: "exact", at: "2026-07-30T10:00:00.000Z" },
    effectiveAt: "2026-07-30T10:00:00.000Z",
    recordedAt: "2026-07-30T10:05:00.000Z"
  },
  {
    seasonId: "season-1",
    recordId: "bounded-time",
    eventAt: { precision: "bounded", earliestAt: "2026-07-30T09:00:00.000Z", latestAt: "2026-07-30T11:00:00.000Z" },
    recordedAt: "2026-07-30T11:05:00.000Z"
  },
  {
    seasonId: "season-1",
    recordId: "unknown-time",
    eventAt: { precision: "unknown" },
    recordedAt: null,
    recordedAtLegacyUnknown: true
  }
];
state.serverObservations = [
  { seasonId: "season-1", observationId: "observation-exact", observedAt: "2026-07-30T10:00:00.000Z", eventAt: { precision: "exact", at: "2026-07-30T09:00:00.000Z" }, recordedAt: "2026-07-30T10:05:00.000Z" },
  { seasonId: "season-1", observationId: "observation-bounded", observedAt: "2026-07-30T10:00:00.000Z", eventAt: { precision: "bounded", earliestAt: "2026-07-30T08:00:00.000Z", latestAt: "2026-07-30T09:30:00.000Z" }, recordedAt: "2026-07-30T10:05:00.000Z" },
  { seasonId: "season-1", observationId: "observation-unknown", observedAt: "2026-07-30T10:00:00.000Z", eventAt: { precision: "unknown" }, recordedAt: null, recordedAtLegacyUnknown: true }
];
const serialized = serializeStrategicDomainRuntime(
  runtime,
  "season-1",
  "2026-07-30T22:30:00.000Z"
);
assert.strictEqual(validateStrategicDomainEnvelope(serialized).valid, true);
COLLECTION_FIELDS.forEach((field) => {
  assert.strictEqual(serialized.state[field][0].recordId, state[field][0].recordId);
  assert.notStrictEqual(serialized.state[field], state[field]);
  assert.notStrictEqual(serialized.state[field][0], state[field][0]);
});
assert.strictEqual(Object.getPrototypeOf(serialized.state.relations[0].metadata), Object.prototype);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(serialized.state.relations[0].metadata, "__proto__"),
  true
);
assert.strictEqual({}.polluted, undefined);

serialized.state.relations[0].recordId = "changed";
assert.strictEqual(state.relations[0].recordId, "relation");
state.nativeAssignments[0].recordId = "changed-input";
assert.strictEqual(serialized.state.nativeAssignments[0].recordId, "native");

const deserialized = deserializeStrategicDomainEnvelope(serialized);
assert.deepStrictEqual(deserialized, serialized);
assert.deepStrictEqual(deserialized.state.territoryOwnershipRecords, state.territoryOwnershipRecords);
assert.deepStrictEqual(deserialized.state.serverObservations, state.serverObservations);
assert.notStrictEqual(deserialized, serialized);
assert.notStrictEqual(deserialized.state, serialized.state);
deserialized.state.activeStatuses[0].recordId = "deserialized-change";
assert.strictEqual(serialized.state.activeStatuses[0].recordId, "active");

assert.throws(
  () => deserializeStrategicDomainEnvelope({}),
  (error) => error.code === "INVALID_ENVELOPE" && error.validationErrors.length > 0
);
assert.throws(
  () => serializeStrategicDomainRuntime({}, "season-1", "2026-07-30T22:30:00.000Z"),
  (error) => error.code === "INVALID_RUNTIME"
);

class RelationService {
  constructor(records) {
    this.records = records;
  }
  listRelations() {
    assert.strictEqual(this instanceof RelationService, true);
    return this.records;
  }
}
const classRuntime = createRuntime();
classRuntime.runtime.relationService = new RelationService(classRuntime.state.relations);
assert.strictEqual(
  serializeStrategicDomainRuntime(
    classRuntime.runtime,
    "season-1",
    "2026-07-30T22:30:00.000Z"
  ).state.relations.length,
  1
);

const invalidResultRuntime = createRuntime().runtime;
invalidResultRuntime.activeStatusService.listStatuses = () => ({});
assert.throws(
  () => serializeStrategicDomainRuntime(
    invalidResultRuntime,
    "season-1",
    "2026-07-30T22:30:00.000Z"
  ),
  (error) => error.code === "INVALID_RUNTIME_RESULT"
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "strategic-domain-state-serializer.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateStrategicDomainEnvelope, "function");
assert.strictEqual(typeof sandbox.globalThis.serializeStrategicDomainRuntime, "function");
assert.strictEqual(typeof sandbox.globalThis.deserializeStrategicDomainEnvelope, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - strategic domain state serializer");
console.log("\n1 test passed");
