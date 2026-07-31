const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createTargetVerificationService,
  TargetVerificationServiceError
} = require("../src/services/target-verification-service.js");
const {
  validateTargetVerificationRecord,
  validateTargetVerificationHistory
} = require("../src/services/target-verification-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function verification(overrides) {
  return Object.assign({
    verificationId: "verification-1",
    serverId: "server-366",
    seasonId: "season-1",
    targetRef: { type: "normal_map_cell", row: 1, col: 1 },
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "ownership-1" },
    observedAt: "2026-07-01T00:00:00Z",
    confirmedAt: "2026-07-01T00:10:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function structureVerification(overrides) {
  return verification(Object.assign({
    verificationId: "structure-verification-1",
    targetRef: { type: "logical_structure", structureId: "structure-town-1" },
    verifiedOwnershipRef: { type: "structure_ownership_record", recordId: "structure-ownership-1" }
  }, overrides || {}));
}

function options(overrides) {
  return Object.assign({
    initialVerifications: [],
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  }, overrides || {});
}

function createService(overrides) {
  return createTargetVerificationService(options(overrides));
}

function expectServiceError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof TargetVerificationServiceError);
    assert.strictEqual(error.code, code);
    if (pattern) {
      assert.match(error.message, pattern);
    }
    return true;
  });
}

runTest("factory is strict accepts null-prototype options and preserves validator context", () => {
  expectServiceError(() => createTargetVerificationService({}), "invalid_input", /requires options/);
  expectServiceError(() => createTargetVerificationService(options({ extra: true })), "invalid_input", /field 'extra'/);
  expectServiceError(() => createTargetVerificationService(options({ initialVerifications: {} })), "invalid_input", /array/);
  expectServiceError(() => createTargetVerificationService(options({ validateTargetVerificationRecord: null })), "invalid_input", /function/);

  const factoryOptions = Object.create(null);
  Object.assign(factoryOptions, options());
  let recordThis = null;
  let historyThis = null;
  factoryOptions.validateTargetVerificationRecord = function boundRecord(record) {
    recordThis = this;
    return validateTargetVerificationRecord(record);
  };
  factoryOptions.validateTargetVerificationHistory = function boundHistory(records) {
    historyThis = this;
    return validateTargetVerificationHistory(records);
  };

  const service = createTargetVerificationService(factoryOptions);
  service.addConfirmedVerification(verification());
  assert.strictEqual(recordThis, factoryOptions);
  assert.strictEqual(historyThis, factoryOptions);
});

runTest("initialization list get has and current selection work", () => {
  const service = createService({
    initialVerifications: [
      verification(),
      verification({
        verificationId: "verification-2",
        observedAt: "2026-07-02T00:00:00Z",
        confirmedAt: "2026-07-02T00:10:00Z"
      }),
      structureVerification()
    ]
  });

  assert.strictEqual(service.listVerifications().length, 3);
  assert.strictEqual(service.hasVerification("verification-1"), true);
  assert.strictEqual(service.hasVerification("missing"), false);
  assert.strictEqual(service.getVerification("verification-1").verificationId, "verification-1");
  assert.strictEqual(service.getVerification("missing"), null);
  assert.strictEqual(
    service.getCurrentVerification("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).verificationId,
    "verification-2"
  );
  assert.strictEqual(
    service.getCurrentVerification("server-366", "season-1", { type: "logical_structure", structureId: "structure-town-1" }).verificationId,
    "structure-verification-1"
  );
});

runTest("current selection uses parsed observed time and ignores superseded corrections", () => {
  const service = createService({
    initialVerifications: [
      verification({ verificationId: "old", observedAt: "2026-07-01T00:00:00.1Z", supersededBy: "correction", reviewState: "superseded" }),
      verification({ verificationId: "correction", observedAt: "2026-07-01T00:00:00.100Z" }),
      verification({ verificationId: "later", observedAt: "2026-07-02T00:00:00Z", confirmedAt: "2026-07-02T00:10:00Z" })
    ]
  });

  assert.strictEqual(
    service.getCurrentVerification("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).verificationId,
    "later"
  );
});

runTest("server season and target identities are isolated with collision-safe keys", () => {
  const service = createService({
    initialVerifications: [
      verification({ verificationId: "a", seasonId: "a", serverId: "b\u0000c" }),
      verification({ verificationId: "b", seasonId: "a\u0000b", serverId: "c" }),
      verification({ verificationId: "c", targetRef: { type: "normal_map_cell", row: 1, col: 2 } }),
      structureVerification({ verificationId: "d", targetRef: { type: "logical_structure", structureId: "x\u0000y" } })
    ]
  });

  assert.strictEqual(service.getCurrentVerification("b\u0000c", "a", { type: "normal_map_cell", row: 1, col: 1 }).verificationId, "a");
  assert.strictEqual(service.getCurrentVerification("c", "a\u0000b", { type: "normal_map_cell", row: 1, col: 1 }).verificationId, "b");
  assert.strictEqual(service.getCurrentVerification("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 2 }).verificationId, "c");
  assert.strictEqual(service.getCurrentVerification("server-366", "season-1", { type: "logical_structure", structureId: "x\u0000y" }).verificationId, "d");
});

runTest("safe copies isolate inputs outputs null-prototype objects and __proto__ keys", () => {
  const targetRef = Object.create(null);
  targetRef.type = "normal_map_cell";
  targetRef.row = 2;
  targetRef.col = 3;
  const initial = verification({ targetRef });
  const service = createService({ initialVerifications: [initial] });

  initial.actorId = "mutated";
  targetRef.row = 99;
  const output = service.getVerification("verification-1");
  assert.strictEqual(output.actorId, "actor-1");
  assert.strictEqual(output.targetRef.row, 2);
  assert.strictEqual(Object.getPrototypeOf(output.targetRef), null);
  output.actorId = "output-mutated";
  assert.strictEqual(service.getVerification("verification-1").actorId, "actor-1");

  const protoRecord = verification({ verificationId: "proto" });
  Object.defineProperty(protoRecord, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
    writable: true
  });
  const alwaysValid = () => ({ valid: true, errors: [], warnings: [] });
  const protoService = createService({
    initialVerifications: [protoRecord],
    validateTargetVerificationRecord: alwaysValid,
    validateTargetVerificationHistory: alwaysValid
  });
  const protoOutput = protoService.getVerification("proto");
  assert.strictEqual(Object.getPrototypeOf(protoOutput), Object.prototype);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(protoOutput, "__proto__"), true);
  assert.strictEqual(protoOutput.__proto__.polluted, true);
  assert.strictEqual({}.polluted, undefined);
});

runTest("strict filters cover target and lifecycle fields", () => {
  const service = createService({
    initialVerifications: [verification(), structureVerification()]
  });

  assert.deepStrictEqual(service.listVerifications({ targetType: "logical_structure" }).map((item) => item.verificationId), ["structure-verification-1"]);
  assert.deepStrictEqual(service.listVerifications({ sourceType: "manual_entry" }).length, 2);
  assert.deepStrictEqual(service.listVerifications({ reviewState: "confirmed" }).length, 2);
  expectServiceError(() => service.listVerifications({ targetType: "other" }), "invalid_input");
  expectServiceError(() => service.listVerifications({ unknown: true }), "invalid_input");
  expectServiceError(() => service.listVerifications([]), "invalid_input");
});

runTest("routine later confirmation preserves history and becomes current", () => {
  const service = createService({ initialVerifications: [verification()] });
  const later = verification({
    verificationId: "verification-2",
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "ownership-2" },
    observedAt: "2026-07-02T00:00:00Z",
    confirmedAt: "2026-07-02T00:10:00Z"
  });

  service.addConfirmedVerification(later);
  assert.strictEqual(service.getVerification("verification-1").reviewState, "confirmed");
  assert.strictEqual(service.listVerifications().length, 2);
  assert.strictEqual(
    service.getCurrentVerification("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).verificationId,
    "verification-2"
  );
});

runTest("adding records rejects invalid lifecycle duplicates and malformed history atomically", () => {
  const service = createService({ initialVerifications: [verification()] });
  const before = service.listVerifications();

  expectServiceError(() => service.addConfirmedVerification(verification()), "duplicate_verification_id");
  expectServiceError(() => service.addConfirmedVerification(verification({
    verificationId: "superseded",
    reviewState: "superseded",
    supersededBy: "replacement"
  })), "invalid_transition");
  expectServiceError(() => service.addConfirmedVerification(verification({
    verificationId: "bad-evidence",
    sourceType: "screenshot_extraction",
    evidenceIds: []
  })), "invalid_history");
  assert.deepStrictEqual(service.listVerifications(), before);
});

runTest("correction supersedes one record atomically and preserves its audit fields", () => {
  const service = createService({ initialVerifications: [verification()] });
  const replacement = verification({
    verificationId: "verification-correction",
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "ownership-corrected" },
    actorId: "actor-2",
    reviewerId: "reviewer-2",
    confirmedAt: "2026-07-01T00:20:00Z"
  });

  service.correctVerification("verification-1", replacement);
  const original = service.getVerification("verification-1");
  assert.strictEqual(original.reviewState, "superseded");
  assert.strictEqual(original.supersededBy, "verification-correction");
  assert.strictEqual(original.reviewerId, "reviewer-1");
  assert.strictEqual(original.confirmedAt, "2026-07-01T00:10:00Z");
  assert.strictEqual(service.getVerification("verification-correction").reviewState, "confirmed");
});

runTest("invalid corrections unknown IDs and repeat transitions do not mutate history", () => {
  const service = createService({ initialVerifications: [verification()] });
  const before = service.listVerifications();

  expectServiceError(() => service.correctVerification("missing", verification({ verificationId: "replacement" })), "unknown_verification");
  expectServiceError(() => service.correctVerification("verification-1", structureVerification({
    verificationId: "wrong-target"
  })), "invalid_history");
  assert.deepStrictEqual(service.listVerifications(), before);

  service.correctVerification("verification-1", verification({ verificationId: "replacement" }));
  const corrected = service.listVerifications();
  expectServiceError(() => service.correctVerification("verification-1", verification({ verificationId: "another" })), "invalid_transition");
  expectServiceError(() => service.correctVerification("replacement", verification({ verificationId: "replacement" })), "duplicate_verification_id");
  assert.deepStrictEqual(service.listVerifications(), corrected);
});

runTest("validator failures and malformed results roll back state", () => {
  const throwing = createService({
    validateTargetVerificationRecord(record) {
      if (record.verificationId === "throw") {
        throw new Error("boom");
      }
      return validateTargetVerificationRecord(record);
    }
  });
  expectServiceError(() => throwing.addConfirmedVerification(verification({ verificationId: "throw" })), "invalid_history");
  assert.deepStrictEqual(throwing.listVerifications(), []);

  const malformed = createService({
    validateTargetVerificationHistory(records) {
      return records.length === 0 ? validateTargetVerificationHistory(records) : {};
    }
  });
  expectServiceError(() => malformed.addConfirmedVerification(verification()), "invalid_history");
  assert.deepStrictEqual(malformed.listVerifications(), []);
});

runTest("transaction snapshots restore verification history and current selection", () => {
  const service = createService({
    initialVerifications: [verification()]
  });
  const snapshot = service.captureTransactionState();

  service.addConfirmedVerification(verification({
    verificationId: "verification-2",
    observedAt: "2026-07-02T00:00:00Z",
    confirmedAt: "2026-07-02T00:10:00Z"
  }));
  service.restoreTransactionState(snapshot);

  assert.strictEqual(service.listVerifications().length, 1);
  assert.strictEqual(
    service.getCurrentVerification(
      "server-366",
      "season-1",
      { type: "normal_map_cell", row: 1, col: 1 }
    ).verificationId,
    "verification-1"
  );
  snapshot[0].observedAt = "mutated";
  assert.strictEqual(service.getVerification("verification-1").observedAt, "2026-07-01T00:00:00Z");
});

runTest("plain-object and target boundaries reject unsupported values", () => {
  class RecordInput {}
  const service = createService();
  expectServiceError(() => service.addConfirmedVerification(new RecordInput()), "invalid_input");
  expectServiceError(() => service.getCurrentVerification("server", "season", new Date()), "invalid_input");
  expectServiceError(() => service.getCurrentVerification("server", "season", { type: "normal_map_cell", row: 0, col: 1 }), "invalid_input");
  expectServiceError(() => service.getCurrentVerification("server", "season", { type: "other" }), "invalid_input");
});

runTest("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createTargetVerificationService, "function");
  assert.strictEqual(typeof TargetVerificationServiceError, "function");

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "target-verification-service.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createTargetVerificationService, "function");
  assert.strictEqual(typeof sandbox.globalThis.TargetVerificationServiceError, "function");
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
