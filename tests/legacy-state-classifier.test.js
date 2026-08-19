const assert = require("assert");
const { createLegacyStateClassifier } = require("../src/services/legacy-state-classifier.js");

const classifier = createLegacyStateClassifier({
  deserializeDataManagementEnvelope(value) {
    if (value && value.corrupt) throw new Error("bad data management envelope");
    return structuredClone(value);
  },
  deserializeServerStateEnvelope(value) {
    if (value && value.corrupt) throw new Error("bad server state envelope");
    return structuredClone(value);
  }
});

function strategicState(owner = "union-0001") {
  return {
    relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [],
    serverObservations: [], structureOwnershipRecords: [], ownershipRetractions: [], targetVerifications: [],
    confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [],
    territoryOwnershipRecords: owner === undefined ? [] : [{
      ownershipRecordId: "ownership-1",
      seasonId: "season-1",
      serverId: "server-366",
      territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
      ownerUnionId: owner,
      ownershipState: owner === null ? "unclaimed" : "owned",
      reviewState: "confirmed",
      supersededBy: null
    }]
  };
}

function dataEnvelope(state = strategicState()) {
  return {
    schemaVersion: 1,
    seasonId: "season-1",
    savedAt: "2026-08-12T12:00:00.000Z",
    unionRegistry: { schemaVersion: 1, savedAt: "2026-08-12T12:00:00.000Z", identities: [] },
    strategicDomain: { schemaVersion: 1, seasonId: "season-1", savedAt: "2026-08-12T12:00:00.000Z", state },
    evidenceDomain: { schemaVersion: 1, savedAt: "2026-08-12T12:00:00.000Z", assets: [], evidenceRecords: [] }
  };
}

function serverEnvelope(ownership = { "1-1": "union-0001" }, overrides = {}) {
  return {
    schemaVersion: 1,
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-08-12T12:00:00.000Z",
    servers: [{ id: "server-366", ownership }],
    ...overrides
  };
}

const base = {
  seasonId: "season-1",
  baseMapId: "season1-map",
  dataManagementEnvelope: dataEnvelope(),
  serverStateEnvelope: serverEnvelope()
};

assert.deepStrictEqual(classifier.classify({ ...base, dataManagementEnvelope: null, serverStateEnvelope: null }), { status: "first_run" });
assert.strictEqual(classifier.classify({ ...base }).status, "aligned");
assert.strictEqual(classifier.classify({ ...base, serverStateEnvelope: null }).status, "recovery_required");
assert.strictEqual(classifier.classify({ ...base, dataManagementEnvelope: { corrupt: true } }).status, "corrupt");
assert.strictEqual(classifier.classify({ ...base, unionRegistryEnvelopes: [base.dataManagementEnvelope.unionRegistry, { ...base.dataManagementEnvelope.unionRegistry, identities: [{ unionId: "other" }] }] }).status, "recovery_required");
assert.strictEqual(classifier.classify({ ...base, serverStateEnvelope: serverEnvelope({ "1-1": "union-9999" }) }).status, "rebuildable_projection");
const emptyAuthoritativeState = strategicState();
emptyAuthoritativeState.territoryOwnershipRecords = [];
assert.strictEqual(classifier.classify({ ...base, dataManagementEnvelope: dataEnvelope(emptyAuthoritativeState) }).status, "recovery_required");
assert.strictEqual(classifier.classify({ ...base, serverStateEnvelope: serverEnvelope({}, { seasonId: "season-2" }) }).status, "corrupt");
assert.strictEqual(classifier.classify({ ...base, serverStateEnvelope: serverEnvelope({ "1-1": null }) }).status, "rebuildable_projection");

console.log("8 legacy classification scenarios passed");
console.log("1 test passed");
