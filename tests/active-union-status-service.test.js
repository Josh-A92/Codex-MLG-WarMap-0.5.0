const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createActiveUnionStatusService,
  ActiveUnionStatusServiceError
} = require("../src/services/active-union-status-service.js");
const {
  validateActiveUnionStatus,
  validateActiveUnionStatusHistory
} = require("../src/services/active-union-status-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createKnownInactive(overrides) {
  return Object.assign({
    statusId: "status-0001",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    activityState: "inactive",
    reviewState: "confirmed",
    derivedFrom: "known_relation_without_confirmed_ownership",
    firstConfirmedPresenceAt: null,
    mostRecentConfirmedPresenceAt: null,
    zeroTerritorySince: null,
    verificationWindowStartedAt: null,
    verificationThrough: null,
    verificationSnapshotIds: [],
    effectiveFrom: "2026-07-01T00:00:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function createConfirmedOwnershipStatus(overrides) {
  return Object.assign({
    statusId: "status-0002",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    activityState: "active",
    reviewState: "confirmed",
    derivedFrom: "confirmed_ownership",
    firstConfirmedPresenceAt: "2026-07-10T18:42:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00Z",
    zeroTerritorySince: null,
    verificationWindowStartedAt: null,
    verificationThrough: "2026-07-25T09:15:00Z",
    verificationSnapshotIds: ["snapshot-a"],
    effectiveFrom: "2026-07-10T18:42:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function createService(initialStatuses) {
  return createActiveUnionStatusService({
    initialStatuses: initialStatuses || [],
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory
  });
}

function expectServiceError(fn, code, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ActiveUnionStatusServiceError);
    assert.strictEqual(error.code, code);
    if (messagePattern) {
      assert.match(error.message, messagePattern);
    }
    return true;
  });
}

runTest("factory strictness unknown missing and function requirements", () => {
  expectServiceError(() => createActiveUnionStatusService({}), "invalid_input", /options.initialStatuses/);

  expectServiceError(() => createActiveUnionStatusService({
    initialStatuses: [],
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory,
    extra: true
  }), "invalid_input", /field 'extra'/);

  expectServiceError(() => createActiveUnionStatusService({
    initialStatuses: [],
    validateActiveUnionStatus: null,
    validateActiveUnionStatusHistory
  }), "invalid_input", /validateActiveUnionStatus/);
});

runTest("factory accepts null-prototype options and binds validator this", () => {
  let singleThis = null;
  let historyThis = null;

  const options = Object.create(null);
  options.initialStatuses = [];
  options.validateActiveUnionStatus = function validateSingle(record) {
    singleThis = this;
    return validateActiveUnionStatus(record);
  };
  options.validateActiveUnionStatusHistory = function validateHistory(records) {
    historyThis = this;
    return validateActiveUnionStatusHistory(records);
  };

  const service = createActiveUnionStatusService(options);

  service.appendDerivedStatus(createKnownInactive({ statusId: "ctx-1" }));

  assert.strictEqual(singleThis, options);
  assert.strictEqual(historyThis, options);
});

runTest("initialization validates and clones initialStatuses", () => {
  const initial = [createKnownInactive({ statusId: "init-1" })];
  const snapshot = clone(initial);

  const service = createService(initial);
  initial[0].reviewState = "superseded";

  assert.deepStrictEqual(service.listStatuses(), snapshot);

  expectServiceError(() => createService([
    createKnownInactive({ statusId: "dup" }),
    createKnownInactive({ statusId: "dup" })
  ]), "invalid_history", /history validation failed/);
});

runTest("list get has and current status lookups", () => {
  const service = createService([
    createKnownInactive({ statusId: "lookup-1", unionId: "u1", serverId: "s1", seasonId: "sea1" }),
    createKnownInactive({ statusId: "lookup-2", unionId: "u2", serverId: "s2", seasonId: "sea2" })
  ]);

  assert.strictEqual(service.listStatuses().length, 2);
  assert.strictEqual(service.hasStatus("lookup-1"), true);
  assert.strictEqual(service.hasStatus("missing"), false);
  assert.strictEqual(service.getStatus("missing"), null);
  assert.strictEqual(service.getStatus("lookup-1").statusId, "lookup-1");
  assert.strictEqual(service.getCurrentStatus("sea1", "s1", "u1").statusId, "lookup-1");
  assert.strictEqual(service.getCurrentStatus("none", "none", "none"), null);
});

runTest("filter fields exactness and matching", () => {
  const service = createService([
    createKnownInactive({ statusId: "filter-1", unionId: "u1", serverId: "s1", seasonId: "sea1" }),
    createConfirmedOwnershipStatus({ statusId: "filter-2", unionId: "u1", serverId: "s1", seasonId: "sea2", verificationSnapshotIds: ["snapshot-b"] }),
    createKnownInactive({ statusId: "filter-3", unionId: "u2", serverId: "s2", seasonId: "sea2" })
  ]);

  const filtered = service.listStatuses({
    unionId: "u1",
    serverId: "s1",
    seasonId: "sea1",
    activityState: "inactive",
    reviewState: "confirmed",
    derivedFrom: "known_relation_without_confirmed_ownership"
  });

  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].statusId, "filter-1");

  expectServiceError(() => service.listStatuses({ nope: "x" }), "invalid_input", /filter field 'nope'/);
  expectServiceError(() => service.listStatuses({ statusId: "   " }), "invalid_input", /filter.statusId/);
});

runTest("safe copies and __proto__ safety", () => {
  const base = createKnownInactive({ statusId: "safe-1" });
  const service = createService([base]);

  const listed = service.listStatuses();
  listed[0].reviewState = "mutated";

  const fetched = service.getStatus("safe-1");
  fetched.activityState = "mutated";

  assert.strictEqual(service.getStatus("safe-1").reviewState, "confirmed");
  assert.strictEqual(service.getStatus("safe-1").activityState, "inactive");

  const protoTrap = Object.create(null);
  Object.defineProperty(protoTrap, "__proto__", {
    value: "bad",
    enumerable: true,
    configurable: true,
    writable: true
  });

  expectServiceError(() => service.listStatuses(protoTrap), "invalid_input", /field '__proto__'/);
  assert.strictEqual(Object.prototype.bad, undefined);
});

runTest("object boundary rejections at factory filter and append", () => {
  class BadInput {}

  const badValues = [new Date(), new Map(), new Set(), [], () => {}, new BadInput()];

  badValues.forEach((value) => {
    expectServiceError(() => createActiveUnionStatusService(value), "invalid_input", /options/);
  });

  const service = createService([]);

  badValues.forEach((value) => {
    expectServiceError(() => service.listStatuses(value), "invalid_input", /filter/);
    expectServiceError(() => service.appendDerivedStatus(value), "invalid_input", /record/);
  });
});

runTest("append initial derived status succeeds", () => {
  const service = createService([]);
  const added = service.appendDerivedStatus(createKnownInactive({ statusId: "append-initial" }));

  assert.strictEqual(added.statusId, "append-initial");
  assert.strictEqual(service.getStatus("append-initial").statusId, "append-initial");
  assert.strictEqual(service.getCurrentStatus("season-1", "server-1", "union-0001").statusId, "append-initial");
});

runTest("append replacement supersedes previous current atomically", () => {
  const oldRecord = createKnownInactive({
    statusId: "replace-old",
    effectiveFrom: "2026-07-01T00:00:00Z"
  });

  const replacement = createConfirmedOwnershipStatus({
    statusId: "replace-new",
    effectiveFrom: "2026-07-10T18:42:00Z"
  });

  const service = createService([oldRecord]);
  service.appendDerivedStatus(replacement);

  const superseded = service.getStatus("replace-old");
  const current = service.getCurrentStatus("season-1", "server-1", "union-0001");

  assert.strictEqual(superseded.reviewState, "superseded");
  assert.strictEqual(superseded.effectiveTo, replacement.effectiveFrom);
  assert.strictEqual(superseded.supersededBy, "replace-new");
  assert.strictEqual(superseded.activityState, "inactive");
  assert.strictEqual(current.statusId, "replace-new");
});

runTest("same-instant fractional replacement is accepted", () => {
  const service = createService([
    createKnownInactive({
      statusId: "frac-old",
      effectiveFrom: "2026-07-01T00:00:00.1Z"
    })
  ]);

  service.appendDerivedStatus(createKnownInactive({
    statusId: "frac-new",
    effectiveFrom: "2026-07-01T00:00:00.100Z"
  }));

  assert.strictEqual(service.getCurrentStatus("season-1", "server-1", "union-0001").statusId, "frac-new");
});

runTest("duplicate status IDs and earlier replacement are rejected", () => {
  const service = createService([
    createKnownInactive({
      statusId: "dup-base",
      effectiveFrom: "2026-07-02T00:00:00Z"
    })
  ]);

  expectServiceError(() => service.appendDerivedStatus(createKnownInactive({ statusId: "dup-base" })), "duplicate_status_id", /dup-base/);

  expectServiceError(() => service.appendDerivedStatus(createKnownInactive({
    statusId: "earlier",
    effectiveFrom: "2026-07-01T23:59:59Z"
  })), "invalid_transition", /equal to or later/);
});

runTest("invalid candidate and invalid history failures roll back state", () => {
  const service = createService([createKnownInactive({ statusId: "rollback-base" })]);
  const before = service.listStatuses();

  expectServiceError(() => service.appendDerivedStatus(createKnownInactive({
    statusId: "rollback-invalid-transition",
    reviewState: "superseded",
    effectiveTo: "2026-07-02T00:00:00Z",
    supersededBy: "x"
  })), "invalid_transition", /requires reviewState=confirmed/);

  assert.deepStrictEqual(service.listStatuses(), before);

  const badResultErrors = [{ code: "INVALID", path: "x", message: "bad" }];
  const badHistoryService = createActiveUnionStatusService({
    initialStatuses: [createKnownInactive({ statusId: "rollback-bad-history" })],
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory(records) {
      if (records.length === 1) {
        return validateActiveUnionStatusHistory(records);
      }
      return { valid: false, errors: badResultErrors, warnings: [] };
    }
  });

  const beforeHistoryFailure = badHistoryService.listStatuses();

  assert.throws(() => badHistoryService.appendDerivedStatus(createKnownInactive({ statusId: "new-on-bad-history" })), (error) => {
    assert.ok(error instanceof ActiveUnionStatusServiceError);
    assert.strictEqual(error.code, "invalid_history");
    assert.notStrictEqual(error.validationErrors, badResultErrors);
    return true;
  });

  assert.deepStrictEqual(badHistoryService.listStatuses(), beforeHistoryFailure);
});

runTest("per-server and per-season isolation", () => {
  const service = createService([
    createKnownInactive({ statusId: "iso-1", unionId: "u", serverId: "s1", seasonId: "sea1", effectiveFrom: "2026-07-01T00:00:00Z" }),
    createKnownInactive({ statusId: "iso-2", unionId: "u", serverId: "s2", seasonId: "sea1", effectiveFrom: "2026-07-01T00:00:00Z" }),
    createKnownInactive({ statusId: "iso-3", unionId: "u", serverId: "s1", seasonId: "sea2", effectiveFrom: "2026-07-01T00:00:00Z" })
  ]);

  service.appendDerivedStatus(createKnownInactive({
    statusId: "iso-1-new",
    unionId: "u",
    serverId: "s1",
    seasonId: "sea1",
    effectiveFrom: "2026-07-02T00:00:00Z"
  }));

  assert.strictEqual(service.getCurrentStatus("sea1", "s1", "u").statusId, "iso-1-new");
  assert.strictEqual(service.getCurrentStatus("sea1", "s2", "u").statusId, "iso-2");
  assert.strictEqual(service.getCurrentStatus("sea2", "s1", "u").statusId, "iso-3");
});

runTest("collision-safe tuple grouping with null characters", () => {
  const service = createService([
    createKnownInactive({ statusId: "tuple-1", seasonId: "a", serverId: "b", unionId: "c\u0000d", effectiveFrom: "2026-07-01T00:00:00Z" }),
    createKnownInactive({ statusId: "tuple-2", seasonId: "a\u0000b", serverId: "c", unionId: "d", effectiveFrom: "2026-07-01T00:00:00Z" })
  ]);

  service.appendDerivedStatus(createKnownInactive({
    statusId: "tuple-1-new",
    seasonId: "a",
    serverId: "b",
    unionId: "c\u0000d",
    effectiveFrom: "2026-07-02T00:00:00Z"
  }));

  assert.strictEqual(service.getCurrentStatus("a", "b", "c\u0000d").statusId, "tuple-1-new");
  assert.strictEqual(service.getCurrentStatus("a\u0000b", "c", "d").statusId, "tuple-2");
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createActiveUnionStatusService, "function");
  assert.strictEqual(typeof ActiveUnionStatusServiceError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createActiveUnionStatusService, "function");
  assert.strictEqual(typeof sandbox.globalThis.ActiveUnionStatusServiceError, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB|activeUnionId/.test(source));
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
