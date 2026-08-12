const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createConfirmedServerSnapshotService,
  ConfirmedServerSnapshotServiceError
} = require("../src/services/confirmed-server-snapshot-service.js");
const {
  createConfirmedServerSnapshotValidator
} = require("../src/services/confirmed-server-snapshot-validator.js");
const {
  validateTerritoryOwnershipRecord,
  validateTerritoryOwnershipHistory,
  validateStructureOwnershipRecord,
  validateStructureOwnershipHistory
} = require("../src/services/ownership-record-validator.js");
const {
  validateTargetVerificationRecord,
  validateTargetVerificationHistory
} = require("../src/services/target-verification-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function createValidator() {
  return createConfirmedServerSnapshotValidator({
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  });
}

function territoryOwnership(overrides) {
  return Object.assign({
    ownershipRecordId: "own-cell-1",
    serverId: "server-1",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-07-29T00:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-07-29T00:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function verification(overrides) {
  return Object.assign({
    verificationId: "verify-cell-1",
    serverId: "server-1",
    seasonId: "season-1",
    targetRef: { type: "normal_map_cell", row: 1, col: 1 },
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "own-cell-1" },
    observedAt: "2026-07-29T00:30:00Z",
    confirmedAt: "2026-07-29T00:40:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function snapshot(overrides) {
  return Object.assign({
    snapshotId: "snapshot-1",
    serverId: "server-1",
    seasonId: "season-1",
    createdAt: "2026-07-29T01:00:00Z",
    ownershipRecordIds: ["own-cell-1"],
    structureOwnershipRecordIds: [],
    verificationRecordIds: ["verify-cell-1"],
    unionStatusRecordIds: [],
    evidenceIds: [],
    creatorId: "actor-1",
    reviewerId: "reviewer-1",
    completenessRecordIds: [],
    previousConfirmedSnapshotId: null
  }, overrides || {});
}

function evaluationInput(overrides) {
  return Object.assign({
    snapshot: snapshot(),
    territoryOwnershipRecords: [territoryOwnership()],
    structureOwnershipRecords: [],
    verificationRecords: [verification()],
    requiredTargetRefs: [{ type: "normal_map_cell", row: 1, col: 1 }]
  }, overrides || {});
}

function options(overrides) {
  const validator = createValidator();
  return Object.assign({
    initialSnapshots: [],
    validateConfirmedServerSnapshot: validator.validateConfirmedServerSnapshot,
    validateConfirmedServerSnapshotHistory: validator.validateConfirmedServerSnapshotHistory,
    evaluateConfirmedServerSnapshotReferences: validator.evaluateConfirmedServerSnapshotReferences,
    clock: () => new Date("2026-08-12T12:00:00.000Z")
  }, overrides || {});
}

function createService(overrides) {
  return createConfirmedServerSnapshotService(options(overrides));
}

function expectServiceError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ConfirmedServerSnapshotServiceError);
    assert.strictEqual(error.code, code);
    if (pattern) {
      assert.match(error.message, pattern);
    }
    return true;
  });
}

runTest("factory is strict accepts null-prototype options and preserves dependency context", () => {
  expectServiceError(() => createConfirmedServerSnapshotService({}), "invalid_input", /requires options/);
  expectServiceError(() => createConfirmedServerSnapshotService(options({ extra: true })), "invalid_input", /field 'extra'/);
  expectServiceError(() => createConfirmedServerSnapshotService(options({ initialSnapshots: {} })), "invalid_input", /array/);
  expectServiceError(() => createConfirmedServerSnapshotService(options({ validateConfirmedServerSnapshot: null })), "invalid_input", /function/);

  const validator = createValidator();
  const factoryOptions = Object.create(null);
  Object.assign(factoryOptions, {
    initialSnapshots: [],
    validateConfirmedServerSnapshot(value) {
      assert.strictEqual(this, factoryOptions);
      return validator.validateConfirmedServerSnapshot(value);
    },
    validateConfirmedServerSnapshotHistory(value) {
      assert.strictEqual(this, factoryOptions);
      return validator.validateConfirmedServerSnapshotHistory(value);
    },
    evaluateConfirmedServerSnapshotReferences(value) {
      assert.strictEqual(this, factoryOptions);
      return validator.evaluateConfirmedServerSnapshotReferences(value);
    },
    clock: () => new Date("2026-08-12T12:00:00.000Z")
  });

  const service = createConfirmedServerSnapshotService(factoryOptions);
  service.addConfirmedSnapshot(evaluationInput());
});

runTest("initialization list get has filters and current selection work", () => {
  const first = snapshot();
  const second = snapshot({
    snapshotId: "snapshot-2",
    createdAt: "2026-07-30T01:00:00Z",
    previousConfirmedSnapshotId: "snapshot-1"
  });
  const other = snapshot({
    snapshotId: "snapshot-other",
    serverId: "server-2",
    ownershipRecordIds: [],
    verificationRecordIds: []
  });
  const service = createService({ initialSnapshots: [first, second, other] });

  assert.strictEqual(service.listSnapshots().length, 3);
  assert.strictEqual(service.hasSnapshot("snapshot-1"), true);
  assert.strictEqual(service.hasSnapshot("missing"), false);
  assert.strictEqual(service.getSnapshot("snapshot-1").snapshotId, "snapshot-1");
  assert.strictEqual(service.getSnapshot("missing"), null);
  assert.strictEqual(service.getCurrentSnapshot("server-1", "season-1").snapshotId, "snapshot-2");
  assert.strictEqual(service.getCurrentSnapshot("server-2", "season-1").snapshotId, "snapshot-other");
  assert.deepStrictEqual(service.listSnapshots({ serverId: "server-2" }).map((item) => item.snapshotId), ["snapshot-other"]);
  expectServiceError(() => service.listSnapshots({ unknown: true }), "invalid_input");
});

runTest("group identities are isolated and collision-safe", () => {
  const service = createService({
    initialSnapshots: [
      snapshot({ snapshotId: "a", seasonId: "a", serverId: "b\u0000c" }),
      snapshot({ snapshotId: "b", seasonId: "a\u0000b", serverId: "c" })
    ]
  });

  assert.strictEqual(service.getCurrentSnapshot("b\u0000c", "a").snapshotId, "a");
  assert.strictEqual(service.getCurrentSnapshot("c", "a\u0000b").snapshotId, "b");
});

runTest("safe copies isolate initialization input output and __proto__ keys", () => {
  const initial = snapshot();
  const service = createService({ initialSnapshots: [initial] });
  initial.creatorId = "mutated";
  const output = service.getSnapshot("snapshot-1");
  assert.strictEqual(output.creatorId, "actor-1");
  output.creatorId = "output-mutated";
  assert.strictEqual(service.getSnapshot("snapshot-1").creatorId, "actor-1");

  const protoSnapshot = snapshot({ snapshotId: "proto" });
  Object.defineProperty(protoSnapshot, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
    writable: true
  });
  const alwaysValid = () => ({ valid: true, errors: [], warnings: [] });
  const protoService = createConfirmedServerSnapshotService({
    initialSnapshots: [protoSnapshot],
    validateConfirmedServerSnapshot: alwaysValid,
    validateConfirmedServerSnapshotHistory: alwaysValid,
    evaluateConfirmedServerSnapshotReferences() {
      return { valid: true, errors: [], warnings: [], projection: {} };
    },
    clock: () => new Date("2026-08-12T12:00:00.000Z")
  });
  const protoOutput = protoService.getSnapshot("proto");
  assert.strictEqual(Object.getPrototypeOf(protoOutput), Object.prototype);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(protoOutput, "__proto__"), true);
  assert.strictEqual(protoOutput.__proto__.polluted, true);
  assert.strictEqual({}.polluted, undefined);
});

runTest("read-only evaluation returns a safe projection without storing a snapshot", () => {
  const service = createService();
  const input = evaluationInput();
  const result = service.evaluateSnapshot(input);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.completeCoverage, true);
  assert.strictEqual(result.projection.qualifiesAsFullMapConfirmation, true);
  result.projection.completeCoverage = false;
  assert.strictEqual(service.listSnapshots().length, 0);
  assert.strictEqual(input.snapshot.snapshotId, "snapshot-1");
});

runTest("adding a confirmed snapshot evaluates references and returns derived projection", () => {
  const service = createService();
  const result = service.addConfirmedSnapshot(evaluationInput());

  assert.strictEqual(result.snapshot.snapshotId, "snapshot-1");
  assert.strictEqual(result.projection.completeCoverage, true);
  assert.strictEqual(result.projection.qualifiesAsFullMapConfirmation, true);
  assert.strictEqual(result.projection.mapDataConfirmedThrough, "2026-07-29T00:30:00Z");
  assert.strictEqual(service.getCurrentSnapshot("server-1", "season-1").snapshotId, "snapshot-1");
});

runTest("partial but reference-valid snapshot is accepted as non-qualifying", () => {
  const service = createService();
  const result = service.addConfirmedSnapshot(evaluationInput({
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "normal_map_cell", row: 1, col: 2 }
    ]
  }));

  assert.strictEqual(result.projection.completeCoverage, false);
  assert.strictEqual(result.projection.qualifiesAsFullMapConfirmation, false);
  assert.strictEqual(result.projection.mapDataConfirmedThrough, null);
  assert.strictEqual(service.listSnapshots().length, 1);
});

runTest("snapshot recording metadata uses the clock and preserves createdAt ordering", () => {
  const service = createService();
  const result = service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot()
  }));
  assert.strictEqual(result.snapshot.createdAt, "2026-07-29T01:00:00Z");
  assert.strictEqual(result.snapshot.recordedAt, "2026-08-12T12:00:00.000Z");
  assert.throws(() => service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot({ snapshotId: "forged", recordedAt: "2026-07-29T00:31:00Z" })
  })), (error) => error.code === "caller_recorded_at");
  const later = service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot({ snapshotId: "later", createdAt: "2026-07-30T00:30:00Z", previousConfirmedSnapshotId: "snapshot-1" })
  }));
  assert.strictEqual(service.getCurrentSnapshot("server-1", "season-1").snapshotId, "later");
  assert.strictEqual(later.snapshot.createdAt, "2026-07-30T00:30:00Z");
});

runTest("legacy snapshots preserve unknown historical recording metadata", () => {
  const legacy = createService({ initialSnapshots: [snapshot()] }).getSnapshot("snapshot-1");
  assert.strictEqual(legacy.recordedAt, null);
  assert.strictEqual(legacy.recordedAtLegacyUnknown, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(legacy, "eventAt"), false);
});

runTest("a later snapshot must extend the current immutable chain", () => {
  const service = createService({ initialSnapshots: [snapshot()] });
  const laterInput = evaluationInput({
    snapshot: snapshot({
      snapshotId: "snapshot-2",
      createdAt: "2026-07-30T01:00:00Z",
      previousConfirmedSnapshotId: "snapshot-1"
    })
  });
  service.addConfirmedSnapshot(laterInput);
  assert.strictEqual(service.getCurrentSnapshot("server-1", "season-1").snapshotId, "snapshot-2");

  const before = service.listSnapshots();
  expectServiceError(() => service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot({
      snapshotId: "snapshot-fork",
      createdAt: "2026-07-31T01:00:00Z",
      previousConfirmedSnapshotId: "snapshot-1"
    })
  })), "invalid_snapshot");
  assert.deepStrictEqual(service.listSnapshots(), before);
});

runTest("duplicate IDs invalid references and invalid snapshots roll back atomically", () => {
  const service = createService({ initialSnapshots: [snapshot()] });
  const before = service.listSnapshots();

  expectServiceError(() => service.addConfirmedSnapshot(evaluationInput()), "duplicate_snapshot_id");
  expectServiceError(() => service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot({
      snapshotId: "bad-reference",
      ownershipRecordIds: ["missing"]
    })
  })), "invalid_snapshot");
  expectServiceError(() => service.addConfirmedSnapshot(evaluationInput({
    snapshot: snapshot({
      snapshotId: "bad-shape",
      createdAt: "not-a-time"
    })
  })), "invalid_snapshot");
  assert.deepStrictEqual(service.listSnapshots(), before);
});

runTest("malformed or throwing dependencies do not mutate state", () => {
  const throwing = createService({
    evaluateConfirmedServerSnapshotReferences() {
      throw new Error("boom");
    }
  });
  expectServiceError(() => throwing.addConfirmedSnapshot(evaluationInput()), "invalid_snapshot");
  assert.deepStrictEqual(throwing.listSnapshots(), []);

  const malformed = createService({
    evaluateConfirmedServerSnapshotReferences() {
      return { valid: true, errors: [] };
    }
  });
  expectServiceError(() => malformed.addConfirmedSnapshot(evaluationInput()), "invalid_snapshot");
  assert.deepStrictEqual(malformed.listSnapshots(), []);
});

runTest("plain-object boundaries and strict filters reject unsupported values", () => {
  const service = createService();
  expectServiceError(() => service.evaluateSnapshot([]), "invalid_input");
  expectServiceError(() => service.addConfirmedSnapshot(new Date()), "invalid_input");
  expectServiceError(() => service.listSnapshots([]), "invalid_input");
  expectServiceError(() => service.listSnapshots({ serverId: "  " }), "invalid_input");
  expectServiceError(() => service.getCurrentSnapshot(" ", "season"), "invalid_input");
});

runTest("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createConfirmedServerSnapshotService, "function");
  assert.strictEqual(typeof ConfirmedServerSnapshotServiceError, "function");

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "confirmed-server-snapshot-service.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createConfirmedServerSnapshotService, "function");
  assert.strictEqual(typeof sandbox.globalThis.ConfirmedServerSnapshotServiceError, "function");
  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
});

if (require.main === module) {
  let passed = 0;
  runTest.tests.forEach(({ name, fn }) => {
    try {
      fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  });
  console.log(`\n${passed} tests passed`);
}
