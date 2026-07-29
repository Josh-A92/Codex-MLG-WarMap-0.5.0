const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

function createKnownRelationWithoutOwnership(overrides) {
  return Object.assign({
    statusId: "active-status-0001",
    unionId: "union-0001",
    serverId: "server-366",
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

function createConfirmedOwnership(overrides) {
  return Object.assign({
    statusId: "active-status-0002",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    activityState: "active",
    reviewState: "confirmed",
    derivedFrom: "confirmed_ownership",
    firstConfirmedPresenceAt: "2026-07-10T18:42:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00Z",
    zeroTerritorySince: null,
    verificationWindowStartedAt: null,
    verificationThrough: "2026-07-25T09:15:00Z",
    verificationSnapshotIds: ["snapshot-366-2026-07-25"],
    effectiveFrom: "2026-07-10T18:42:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function createVerifiedZeroTerritoryMonitoring(overrides) {
  return Object.assign({
    statusId: "active-status-0003",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    activityState: "active",
    reviewState: "confirmed",
    derivedFrom: "verified_zero_territory_period",
    firstConfirmedPresenceAt: "2026-07-10T18:42:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-30T09:00:00Z",
    zeroTerritorySince: "2026-07-30T09:00:00Z",
    verificationWindowStartedAt: "2026-07-30T09:00:00Z",
    verificationThrough: "2026-08-02T09:00:00Z",
    verificationSnapshotIds: ["snapshot-366-2026-07-30", "snapshot-366-2026-08-02"],
    effectiveFrom: "2026-07-30T09:00:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function createVerifiedZeroTerritoryInactive(overrides) {
  return Object.assign({
    statusId: "active-status-0004",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    activityState: "inactive",
    reviewState: "confirmed",
    derivedFrom: "verified_zero_territory_period",
    firstConfirmedPresenceAt: "2026-07-10T18:42:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-30T09:00:00Z",
    zeroTerritorySince: "2026-07-30T09:00:00Z",
    verificationWindowStartedAt: "2026-07-30T09:00:00Z",
    verificationThrough: "2026-08-13T10:00:00Z",
    verificationSnapshotIds: [
      "snapshot-366-2026-07-30",
      "snapshot-366-2026-08-02",
      "snapshot-366-2026-08-05",
      "snapshot-366-2026-08-09",
      "snapshot-366-2026-08-13"
    ],
    effectiveFrom: "2026-08-13T10:00:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function assertError(result, code, path) {
  assert.ok(result.errors.some((error) => error.code === code && error.path === path), `Expected ${code} at ${path}`);
}

runTest("valid examples for all four state derivation combinations", () => {
  const records = [
    createKnownRelationWithoutOwnership({ statusId: "case-1", unionId: "u1" }),
    createConfirmedOwnership({ statusId: "case-2", unionId: "u2", verificationSnapshotIds: ["snap-a"] }),
    createVerifiedZeroTerritoryMonitoring({ statusId: "case-3", unionId: "u3", verificationSnapshotIds: ["snap-b"] }),
    createVerifiedZeroTerritoryInactive({ statusId: "case-4", unionId: "u4" })
  ];

  records.forEach((record) => {
    const result = validateActiveUnionStatus(record);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.warnings, []);
  });
});

runTest("plain and null-prototype records are accepted", () => {
  const plain = createConfirmedOwnership({ statusId: "plain-1" });
  const nullPrototype = Object.create(null);
  Object.keys(plain).forEach((key) => {
    nullPrototype[key] = plain[key];
  });

  const plainResult = validateActiveUnionStatus(plain);
  const nullResult = validateActiveUnionStatus(nullPrototype);

  assert.strictEqual(plainResult.valid, true);
  assert.strictEqual(nullResult.valid, true);
});

runTest("malformed object types are rejected", () => {
  class StatusRecord {}
  const values = [[], new Date(), new Map(), new Set(), () => ({}), new StatusRecord()];

  values.forEach((value) => {
    const result = validateActiveUnionStatus(value);
    assert.strictEqual(result.valid, false);
    assertError(result, "INVALID_OBJECT", "record");
  });
});

runTest("missing and unknown fields are rejected", () => {
  const candidate = createConfirmedOwnership({ statusId: "missing-unknown" });
  delete candidate.statusId;
  candidate.extraField = true;

  const result = validateActiveUnionStatus(candidate);
  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "statusId");
  assertError(result, "UNKNOWN_FIELD", "extraField");
});

runTest("enum validation rejects unsupported values", () => {
  const badActivity = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "enum-1", activityState: "stale" }));
  const badReview = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "enum-2", reviewState: "proposed" }));
  const badDerived = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "enum-3", derivedFrom: "other" }));

  assert.strictEqual(badActivity.valid, false);
  assert.strictEqual(badReview.valid, false);
  assert.strictEqual(badDerived.valid, false);
  assertError(badActivity, "INVALID_ENUM", "activityState");
  assertError(badReview, "INVALID_ENUM", "reviewState");
  assertError(badDerived, "INVALID_ENUM", "derivedFrom");
});

runTest("timestamp format impossible date and precision handling", () => {
  const badOffset = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-1", effectiveFrom: "2026-07-10T18:42:00+01:00" }));
  const missingZulu = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-2", effectiveFrom: "2026-07-10T18:42:00" }));
  const tooManyFractionDigits = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-3", effectiveFrom: "2026-07-10T18:42:00.1234Z" }));
  const impossibleDate = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-4", effectiveFrom: "2026-02-30T18:42:00Z" }));
  const oneDigit = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-5", effectiveFrom: "2026-07-10T18:42:00.1Z" }));
  const twoDigit = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-6", effectiveFrom: "2026-07-10T18:42:00.12Z" }));
  const threeDigit = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "time-7", effectiveFrom: "2026-07-10T18:42:00.123Z" }));

  assert.strictEqual(badOffset.valid, false);
  assert.strictEqual(missingZulu.valid, false);
  assert.strictEqual(tooManyFractionDigits.valid, false);
  assert.strictEqual(impossibleDate.valid, false);
  assertError(badOffset, "INVALID_TIMESTAMP", "effectiveFrom");
  assertError(missingZulu, "INVALID_TIMESTAMP", "effectiveFrom");
  assertError(tooManyFractionDigits, "INVALID_TIMESTAMP", "effectiveFrom");
  assertError(impossibleDate, "INVALID_TIMESTAMP", "effectiveFrom");
  assert.strictEqual(oneDigit.valid, true);
  assert.strictEqual(twoDigit.valid, true);
  assert.strictEqual(threeDigit.valid, true);
});

runTest("presence and verification timestamp ordering rules", () => {
  const presenceOrder = validateActiveUnionStatus(createConfirmedOwnership({
    statusId: "order-1",
    firstConfirmedPresenceAt: "2026-07-26T09:15:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00Z"
  }));

  const mostVsZero = validateActiveUnionStatus(createVerifiedZeroTerritoryMonitoring({
    statusId: "order-2",
    mostRecentConfirmedPresenceAt: "2026-07-31T00:00:00Z",
    zeroTerritorySince: "2026-07-30T09:00:00Z"
  }));

  const zeroVsWindow = validateActiveUnionStatus(createVerifiedZeroTerritoryMonitoring({
    statusId: "order-3",
    zeroTerritorySince: "2026-07-30T10:00:00Z",
    verificationWindowStartedAt: "2026-07-30T09:00:00Z"
  }));

  const windowVsThrough = validateActiveUnionStatus(createVerifiedZeroTerritoryMonitoring({
    statusId: "order-4",
    verificationWindowStartedAt: "2026-07-31T09:00:00Z",
    verificationThrough: "2026-07-30T09:00:00Z"
  }));

  const effectiveOrder = validateActiveUnionStatus(createVerifiedZeroTerritoryInactive({
    statusId: "order-5",
    reviewState: "superseded",
    effectiveTo: "2026-08-13T09:59:59Z",
    supersededBy: "next"
  }));

  assert.strictEqual(presenceOrder.valid, false);
  assert.strictEqual(mostVsZero.valid, false);
  assert.strictEqual(zeroVsWindow.valid, false);
  assert.strictEqual(windowVsThrough.valid, false);
  assert.strictEqual(effectiveOrder.valid, false);
  assertError(presenceOrder, "INVALID_LIFECYCLE", "mostRecentConfirmedPresenceAt");
  assertError(mostVsZero, "INVALID_LIFECYCLE", "zeroTerritorySince");
  assertError(zeroVsWindow, "INVALID_LIFECYCLE", "verificationWindowStartedAt");
  assertError(windowVsThrough, "INVALID_LIFECYCLE", "verificationThrough");
  assertError(effectiveOrder, "INVALID_LIFECYCLE", "effectiveTo");
});

runTest("snapshot ID type uniqueness and minimum counts", () => {
  const notArray = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "snap-1", verificationSnapshotIds: null }));
  const badEntry = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "snap-2", verificationSnapshotIds: ["ok", ""] }));
  const duplicateEntry = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "snap-3", verificationSnapshotIds: ["dup", "dup"] }));
  const confirmedMissing = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "snap-4", verificationSnapshotIds: [] }));
  const inactiveTooFew = validateActiveUnionStatus(createVerifiedZeroTerritoryInactive({ statusId: "snap-5", verificationSnapshotIds: ["a", "b", "c", "d"] }));

  assert.strictEqual(notArray.valid, false);
  assert.strictEqual(badEntry.valid, false);
  assert.strictEqual(duplicateEntry.valid, false);
  assert.strictEqual(confirmedMissing.valid, false);
  assert.strictEqual(inactiveTooFew.valid, false);
  assertError(notArray, "INVALID_LIFECYCLE", "verificationSnapshotIds");
  assertError(badEntry, "INVALID_STRING", "verificationSnapshotIds[1]");
  assertError(duplicateEntry, "INVALID_LIFECYCLE", "verificationSnapshotIds[1]");
  assertError(confirmedMissing, "INVALID_LIFECYCLE", "verificationSnapshotIds");
  assertError(inactiveTooFew, "INVALID_LIFECYCLE", "verificationSnapshotIds");
});

runTest("invalid state derivation combinations are rejected", () => {
  const knownWrong = validateActiveUnionStatus(createKnownRelationWithoutOwnership({ statusId: "matrix-1", activityState: "active" }));
  const confirmedWrong = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "matrix-2", verificationThrough: null }));
  const verifiedActiveWrong = validateActiveUnionStatus(createVerifiedZeroTerritoryMonitoring({ statusId: "matrix-3", zeroTerritorySince: null }));
  const verifiedInactiveWrong = validateActiveUnionStatus(createVerifiedZeroTerritoryInactive({ statusId: "matrix-4", activityState: "active", verificationSnapshotIds: [] }));

  assert.strictEqual(knownWrong.valid, false);
  assert.strictEqual(confirmedWrong.valid, false);
  assert.strictEqual(verifiedActiveWrong.valid, false);
  assert.strictEqual(verifiedInactiveWrong.valid, false);
  assertError(knownWrong, "INVALID_LIFECYCLE", "activityState");
  assertError(confirmedWrong, "INVALID_LIFECYCLE", "verificationThrough");
  assertError(verifiedActiveWrong, "INVALID_LIFECYCLE", "zeroTerritorySince");
  assertError(verifiedInactiveWrong, "INVALID_LIFECYCLE", "verificationSnapshotIds");
});

runTest("confirmed and superseded lifecycle rules", () => {
  const confirmedBad = validateActiveUnionStatus(createConfirmedOwnership({ statusId: "life-1", effectiveTo: "2026-08-01T00:00:00Z" }));
  const supersededBad = validateActiveUnionStatus(createVerifiedZeroTerritoryInactive({
    statusId: "life-2",
    reviewState: "superseded",
    effectiveTo: null,
    supersededBy: null
  }));

  const supersededGood = validateActiveUnionStatus(createVerifiedZeroTerritoryInactive({
    statusId: "life-3",
    reviewState: "superseded",
    effectiveTo: "2026-08-14T00:00:00Z",
    supersededBy: "life-4"
  }));

  assert.strictEqual(confirmedBad.valid, false);
  assert.strictEqual(supersededBad.valid, false);
  assert.strictEqual(supersededGood.valid, true);
  assertError(confirmedBad, "INVALID_LIFECYCLE", "effectiveTo");
  assertError(supersededBad, "INVALID_LIFECYCLE", "effectiveTo");
  assertError(supersededBad, "INVALID_LIFECYCLE", "supersededBy");
});

runTest("valid history and empty history", () => {
  const history = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "hist-1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-30T09:00:00Z",
      effectiveTo: "2026-08-13T10:00:00Z",
      supersededBy: "hist-2"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "hist-2",
      effectiveFrom: "2026-08-13T10:00:00Z"
    })
  ];

  const historyResult = validateActiveUnionStatusHistory(history);
  const emptyResult = validateActiveUnionStatusHistory([]);

  assert.strictEqual(historyResult.valid, true);
  assert.strictEqual(emptyResult.valid, true);
  assert.deepStrictEqual(historyResult.warnings, []);
  assert.deepStrictEqual(emptyResult.warnings, []);
});

runTest("history error paths are prefixed with records[index]", () => {
  const history = [createConfirmedOwnership({ statusId: "path-1" })];
  delete history[0].activityState;

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "records[0].activityState");
});

runTest("duplicate IDs are rejected", () => {
  const history = [
    createConfirmedOwnership({ statusId: "dup" }),
    createVerifiedZeroTerritoryInactive({ statusId: "dup", unionId: "union-0002", serverId: "server-367", seasonId: "season-1" })
  ];

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_STATUS_ID", "records[1].statusId");
});

runTest("missing and multiple current statuses are rejected", () => {
  const missingCurrent = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "mc-1",
      reviewState: "superseded",
      effectiveTo: "2026-08-13T10:00:00Z",
      supersededBy: "mc-2"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "mc-2",
      reviewState: "superseded",
      effectiveTo: "2026-08-20T10:00:00Z",
      supersededBy: "mc-3"
    })
  ];

  const multipleCurrent = [
    createConfirmedOwnership({ statusId: "multi-1" }),
    createVerifiedZeroTerritoryInactive({ statusId: "multi-2" })
  ];

  const missingResult = validateActiveUnionStatusHistory(missingCurrent);
  const multiResult = validateActiveUnionStatusHistory(multipleCurrent);

  assert.strictEqual(missingResult.valid, false);
  assert.strictEqual(multiResult.valid, false);
  assertError(missingResult, "MISSING_CURRENT_STATUS", "records[0].reviewState");
  assertError(multiResult, "MULTIPLE_CURRENT_STATUSES", "records[1].reviewState");
});

runTest("cross-server and cross-season isolation", () => {
  const history = [
    createConfirmedOwnership({ statusId: "iso-1", serverId: "server-366", seasonId: "season-1" }),
    createConfirmedOwnership({ statusId: "iso-2", serverId: "server-367", seasonId: "season-1" }),
    createConfirmedOwnership({ statusId: "iso-3", serverId: "server-366", seasonId: "season-2" })
  ];

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("null-character tuple grouping is collision-safe", () => {
  const history = [
    createConfirmedOwnership({ statusId: "tuple-1", seasonId: "a", serverId: "b", unionId: "c\u0000d" }),
    createConfirmedOwnership({ statusId: "tuple-2", seasonId: "a\u0000b", serverId: "c", unionId: "d" })
  ];

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("overlapping effective periods are rejected", () => {
  const history = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "ov-1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-30T09:00:00Z",
      effectiveTo: "2026-08-10T09:00:00Z",
      supersededBy: "ov-2"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "ov-2",
      effectiveFrom: "2026-08-05T09:00:00Z"
    })
  ];

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "OVERLAPPING_EFFECTIVE_PERIOD", "records[1].effectiveFrom");
});

runTest("invalid supersession references missing cross-group and self are rejected", () => {
  const missing = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "ref-1",
      reviewState: "superseded",
      effectiveTo: "2026-08-13T10:00:00Z",
      supersededBy: "missing"
    })
  ];

  const crossGroup = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "ref-2",
      reviewState: "superseded",
      supersededBy: "target-other",
      effectiveTo: "2026-08-13T10:00:00Z"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "target-other",
      unionId: "other-union",
      effectiveFrom: "2026-08-13T10:00:00Z"
    })
  ];

  const selfRef = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "self-1",
      reviewState: "superseded",
      supersededBy: "self-1",
      effectiveTo: "2026-08-13T10:00:00Z"
    })
  ];

  const missingResult = validateActiveUnionStatusHistory(missing);
  const crossResult = validateActiveUnionStatusHistory(crossGroup);
  const selfResult = validateActiveUnionStatusHistory(selfRef);

  assert.strictEqual(missingResult.valid, false);
  assert.strictEqual(crossResult.valid, false);
  assert.strictEqual(selfResult.valid, false);
  assertError(missingResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(crossResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(selfResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("supersession boundary mismatch and parsed-time equivalence", () => {
  const mismatch = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "bound-1",
      reviewState: "superseded",
      effectiveTo: "2026-08-13T10:00:00.12Z",
      supersededBy: "bound-2"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "bound-2",
      effectiveFrom: "2026-08-13T10:00:00.130Z"
    })
  ];

  const equivalent = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "bound-3",
      reviewState: "superseded",
      effectiveTo: "2026-08-13T10:00:00.1Z",
      supersededBy: "bound-4"
    }),
    createVerifiedZeroTerritoryInactive({
      statusId: "bound-4",
      effectiveFrom: "2026-08-13T10:00:00.100Z"
    })
  ];

  const mismatchResult = validateActiveUnionStatusHistory(mismatch);
  const equivalentResult = validateActiveUnionStatusHistory(equivalent);

  assert.strictEqual(mismatchResult.valid, false);
  assertError(mismatchResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assert.strictEqual(equivalentResult.valid, true);
});

runTest("supersession cycles are rejected", () => {
  const history = [
    createVerifiedZeroTerritoryMonitoring({
      statusId: "cycle-a",
      reviewState: "superseded",
      effectiveFrom: "2026-08-13T10:00:00Z",
      effectiveTo: "2026-08-13T10:00:00Z",
      supersededBy: "cycle-b"
    }),
    createVerifiedZeroTerritoryMonitoring({
      statusId: "cycle-b",
      reviewState: "superseded",
      effectiveFrom: "2026-08-13T10:00:00Z",
      effectiveTo: "2026-08-13T10:00:00Z",
      supersededBy: "cycle-a"
    })
  ];

  const result = validateActiveUnionStatusHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "SUPERSESSION_CYCLE", "records[0].supersededBy");
  assertError(result, "SUPERSESSION_CYCLE", "records[1].supersededBy");
});

runTest("input immutability and no retained references", () => {
  const record = createConfirmedOwnership({ statusId: "immut-1" });
  const before = clone(record);

  const result = validateActiveUnionStatus(record);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(record, before);

  const first = validateActiveUnionStatusHistory([createConfirmedOwnership({ statusId: "immut-h1" })]);
  const second = validateActiveUnionStatusHistory([createConfirmedOwnership({ statusId: "immut-h1" })]);

  first.errors.push({ code: "MUTATED", path: "x", message: "x" });
  assert.strictEqual(second.errors.length, 0);
  assert.deepStrictEqual(second.warnings, []);
});

runTest("validator never throws for invalid candidate data", () => {
  assert.doesNotThrow(() => validateActiveUnionStatus(undefined));
  assert.doesNotThrow(() => validateActiveUnionStatus(null));
  assert.doesNotThrow(() => validateActiveUnionStatusHistory(undefined));
});

runTest("deterministic error ordering", () => {
  const candidate = createConfirmedOwnership({
    statusId: "   ",
    extraB: true,
    extraA: true
  });

  const result = validateActiveUnionStatus(candidate);
  const unknownFieldPaths = result.errors.filter((error) => error.code === "UNKNOWN_FIELD").map((error) => error.path);

  assert.deepStrictEqual(unknownFieldPaths, ["extraA", "extraB"]);
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof validateActiveUnionStatus, "function");
  assert.strictEqual(typeof validateActiveUnionStatusHistory, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-validator.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.validateActiveUnionStatus, "function");
  assert.strictEqual(typeof sandbox.globalThis.validateActiveUnionStatusHistory, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-validator.js");
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
