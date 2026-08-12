const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createNativeUnionAssignmentService,
  NativeUnionAssignmentServiceError
} = require("../src/services/native-union-assignment-service.js");
const {
  validateNativeUnionAssignment,
  validateNativeUnionAssignmentHistory
} = require("../src/services/native-union-assignment-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createConfirmedRecord(overrides) {
  return Object.assign({
    assignmentId: "assign-0001",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    reviewState: "confirmed",
    sourceType: "manual_entry",
    rawExtractedValue: null,
    normalizedValue: "union-0001",
    confidence: null,
    evidenceId: null,
    observedAt: "2026-07-10T10:00:00Z",
    effectiveFrom: "2026-07-10T10:00:00Z",
    effectiveTo: null,
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-10T10:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function createProposedRecord(overrides) {
  return createConfirmedRecord(Object.assign({
    assignmentId: "assign-prop-0001",
    reviewState: "proposed",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    confidence: 0.9,
    evidenceId: "evidence-1",
    effectiveFrom: null,
    effectiveTo: null,
    reviewer: null,
    reviewedAt: null,
    supersededBy: null
  }, overrides || {}));
}

function createService(initialAssignments) {
  return createNativeUnionAssignmentService({
    initialAssignments: initialAssignments || [],
    validateNativeUnionAssignment,
    validateNativeUnionAssignmentHistory,
    clock: () => new Date("2026-08-12T12:00:00.000Z")
  });
}

function expectServiceError(fn, code, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof NativeUnionAssignmentServiceError);
    assert.strictEqual(error.code, code);
    if (messagePattern) {
      assert.match(error.message, messagePattern);
    }

    return true;
  });
}

runTest("valid initialization and empty initialization", () => {
  const emptyService = createService([]);
  assert.deepStrictEqual(emptyService.listAssignments(), []);

  const seeded = createService([
    createConfirmedRecord(),
    createProposedRecord({ assignmentId: "assign-prop-0002" })
  ]);

  assert.strictEqual(seeded.hasAssignment("assign-0001"), true);
  assert.strictEqual(seeded.hasAssignment("missing"), false);
});

runTest("transaction snapshots restore assignment history atomically", () => {
  const service = createService([createConfirmedRecord()]);
  const snapshot = service.captureTransactionState();
  service.addConfirmedManualAssignment({
    assignmentId: "assign-transaction",
    unionId: "union-0002",
    serverId: "server-2",
    seasonId: "season-1",
    nativeState: "native",
    evidenceId: null,
    observedAt: "2026-07-11T10:00:00Z",
    effectiveFrom: "2026-07-11T10:00:00Z",
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-11T10:10:00Z"
  });

  service.restoreTransactionState(snapshot);
  assert.strictEqual(service.hasAssignment("assign-transaction"), false);
  assert.strictEqual(service.listAssignments()[0].eventAt.precision, "exact");
  assert.strictEqual(service.listAssignments()[0].recordedAt, null);
  assert.strictEqual(service.listAssignments()[0].recordedAtLegacyUnknown, true);
  assert.strictEqual(service.listAssignments()[0].assignmentId, snapshot[0].assignmentId);

  const before = service.captureTransactionState();
  expectServiceError(
    () => service.restoreTransactionState([before[0], before[0]]),
    "invalid_history"
  );
  assert.deepStrictEqual(service.captureTransactionState(), before);
});

runTest("ordinary valid factory construction still works", () => {
  const service = createNativeUnionAssignmentService({
    initialAssignments: [createConfirmedRecord({ assignmentId: "factory-ok-1" })],
    validateNativeUnionAssignment,
    validateNativeUnionAssignmentHistory
  });

  assert.strictEqual(service.hasAssignment("factory-ok-1"), true);
  assert.strictEqual(service.getCurrentAssignment("season-1", "server-1", "union-0001").assignmentId, "factory-ok-1");
});

runTest("unknown factory field is rejected", () => {
  expectServiceError(() => createNativeUnionAssignmentService({
    initialAssignments: [],
    validateNativeUnionAssignment,
    validateNativeUnionAssignmentHistory,
    extraOption: true
  }), "invalid_input", /field 'extraOption'/);
});

runTest("null-prototype factory options are accepted with only allowed fields", () => {
  const options = Object.create(null);
  options.initialAssignments = [];
  options.validateNativeUnionAssignment = validateNativeUnionAssignment;
  options.validateNativeUnionAssignmentHistory = validateNativeUnionAssignmentHistory;

  const service = createNativeUnionAssignmentService(options);
  assert.deepStrictEqual(service.listAssignments(), []);
});

runTest("invalid initial history is rejected", () => {
  const invalid = [
    createConfirmedRecord({ assignmentId: "dup" }),
    createConfirmedRecord({ assignmentId: "dup" })
  ];

  expectServiceError(() => createService(invalid), "invalid_history", /history validation failed/);
});

runTest("read APIs and combined filters", () => {
  const service = createService([
    createConfirmedRecord(),
    createProposedRecord({ assignmentId: "assign-prop-f1", unionId: "union-0002", normalizedValue: "union-0002", seasonId: "season-2", serverId: "server-2" }),
    createProposedRecord({ assignmentId: "assign-prop-f2", reviewState: "rejected", reviewer: "reviewer-3", reviewedAt: "2026-07-12T10:00:00Z" })
  ]);

  const combined = service.listAssignments({
    seasonId: "season-2",
    serverId: "server-2",
    unionId: "union-0002",
    sourceType: "screenshot_extraction",
    reviewState: "proposed"
  });

  assert.strictEqual(combined.length, 1);
  assert.strictEqual(combined[0].assignmentId, "assign-prop-f1");
  assert.strictEqual(service.getAssignment("missing"), null);
  assert.strictEqual(service.getCurrentAssignment("season-miss", "server-miss", "union-miss"), null);
  assert.strictEqual(service.hasAssignment("missing"), false);

  expectServiceError(() => service.listAssignments({ unknown: "x" }), "invalid_input", /does not recognize filter field/);
  expectServiceError(() => service.listAssignments({ nativeState: "bad" }), "invalid_input", /filter.nativeState/);
});

runTest("proposal creation", () => {
  const service = createService([]);

  const proposed = service.proposeAssignment({
    assignmentId: "assign-prop-new",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-0001",
    confidence: 0.85,
    evidenceId: "evidence-200",
    observedAt: "2026-07-20T09:00:00Z"
  });

  assert.strictEqual(proposed.reviewState, "proposed");
  assert.strictEqual(proposed.effectiveFrom, null);
  assert.strictEqual(proposed.reviewer, null);

  expectServiceError(() => service.proposeAssignment({
    assignmentId: "assign-prop-manual",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    sourceType: "manual_entry",
    rawExtractedValue: null,
    normalizedValue: "union-0001",
    confidence: null,
    evidenceId: null,
    observedAt: "2026-07-20T09:00:00Z"
  }), "invalid_input", /manual_entry proposals/);
});

runTest("direct confirmed manual creation", () => {
  const service = createService([]);

  const created = service.addConfirmedManualAssignment({
    assignmentId: "assign-manual-1",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    evidenceId: null,
    observedAt: "2026-07-21T09:00:00Z",
    effectiveFrom: "2026-07-21T09:00:00Z",
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-21T09:10:00Z"
  });

  assert.strictEqual(created.sourceType, "manual_entry");
  assert.strictEqual(created.normalizedValue, "union-0001");
  assert.strictEqual(created.confidence, null);
  assert.strictEqual(created.reviewState, "confirmed");
  assert.strictEqual(created.effectiveTo, null);
});

runTest("temporal assignment semantics preserve exact compatibility and reject uncertainty on confirmation", () => {
  const service = createService([]);
  const exact = service.addConfirmedManualAssignment({
    assignmentId: "temporal-exact", unionId: "union-0001", serverId: "server-1", seasonId: "season-1",
    nativeState: "native", evidenceId: null, observedAt: "2026-07-21T09:00:00Z",
    effectiveFrom: "2026-07-21T09:00:00Z", eventAt: { precision: "exact", at: "2026-07-21T09:00:00Z" },
    reviewer: "reviewer-1", reviewedAt: "2026-07-21T09:10:00Z"
  });
  assert.strictEqual(exact.recordedAt, "2026-08-12T12:00:00.000Z");
  assert.throws(() => service.addConfirmedManualAssignment({
    assignmentId: "forged", unionId: "union-0001", serverId: "server-1", seasonId: "season-1",
    nativeState: "native", evidenceId: null, observedAt: "2026-07-21T09:00:00Z", effectiveFrom: "2026-07-21T09:00:00Z",
    recordedAt: "2026-07-21T09:01:00Z", reviewer: "reviewer-1", reviewedAt: "2026-07-21T09:10:00Z"
  }), (error) => error.code === "caller_recorded_at");
  const uncertain = service.proposeAssignment({
    assignmentId: "temporal-bounded", unionId: "union-0001", serverId: "server-1", seasonId: "season-1", nativeState: "native",
    sourceType: "screenshot_extraction", rawExtractedValue: "native", normalizedValue: "union-0001", confidence: 0.8, evidenceId: "evidence-1",
    observedAt: "2026-07-22T09:00:00Z", eventAt: { precision: "bounded", earliestAt: "2026-07-22T08:00:00Z", latestAt: "2026-07-22T10:00:00Z" }
  });
  assert.strictEqual(uncertain.effectiveFrom, null);
  assert.strictEqual(service.getCurrentAssignment("season-1", "server-1", "union-0001").assignmentId, "temporal-exact");
  const before = service.captureTransactionState();
  assert.throws(() => service.confirmProposal("temporal-bounded", { reviewer: "reviewer-2", reviewedAt: "2026-07-22T10:00:00Z", effectiveFrom: null }), /bounded|unknown/);
  assert.deepStrictEqual(service.captureTransactionState(), before);
});

runTest("confirmation and rejection", () => {
  const service = createService([
    createProposedRecord({ assignmentId: "assign-prop-approve" }),
    createProposedRecord({ assignmentId: "assign-prop-reject", unionId: "union-0002", normalizedValue: "union-0002", seasonId: "season-2", serverId: "server-2" })
  ]);

  const confirmed = service.confirmProposal("assign-prop-approve", {
    reviewer: "reviewer-9",
    reviewedAt: "2026-07-22T12:00:00Z",
    effectiveFrom: "2026-07-22T12:00:00Z"
  });

  const rejected = service.rejectProposal("assign-prop-reject", {
    reviewer: "reviewer-10",
    reviewedAt: "2026-07-22T12:05:00Z"
  });

  assert.strictEqual(confirmed.reviewState, "confirmed");
  assert.strictEqual(confirmed.effectiveTo, null);
  assert.strictEqual(rejected.reviewState, "rejected");
  assert.strictEqual(rejected.effectiveFrom, null);
  assert.strictEqual(rejected.effectiveTo, null);
});

runTest("duplicate IDs are rejected", () => {
  const service = createService([createConfirmedRecord({ assignmentId: "dup-id" })]);

  expectServiceError(() => service.proposeAssignment({
    assignmentId: "dup-id",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-0001",
    confidence: 0.8,
    evidenceId: "evidence-x",
    observedAt: "2026-07-20T09:00:00Z"
  }), "duplicate_assignment_id", /dup-id/);

  expectServiceError(() => service.addConfirmedManualAssignment({
    assignmentId: "dup-id",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    evidenceId: null,
    observedAt: "2026-07-21T09:00:00Z",
    effectiveFrom: "2026-07-21T09:00:00Z",
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-21T09:10:00Z"
  }), "duplicate_assignment_id", /dup-id/);
});

runTest("unknown assignments are rejected for transitions", () => {
  const service = createService([]);

  expectServiceError(() => service.confirmProposal("unknown", {
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-20T10:00:00Z",
    effectiveFrom: "2026-07-20T10:00:00Z"
  }), "unknown_assignment", /unknown/);

  expectServiceError(() => service.rejectProposal("unknown", {
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-20T10:00:00Z"
  }), "unknown_assignment", /unknown/);
});

runTest("invalid transitions are rejected", () => {
  const service = createService([createConfirmedRecord({ assignmentId: "assign-confirmed-1" })]);

  expectServiceError(() => service.confirmProposal("assign-confirmed-1", {
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-22T12:00:00Z",
    effectiveFrom: "2026-07-22T12:00:00Z"
  }), "invalid_transition", /confirming proposed assignments/);

  expectServiceError(() => service.rejectProposal("assign-confirmed-1", {
    reviewer: "reviewer-2",
    reviewedAt: "2026-07-22T12:05:00Z"
  }), "invalid_transition", /rejecting proposed assignments/);
});

runTest("current-assignment lookup", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "current-1", seasonId: "s1", serverId: "sv1", unionId: "u1", normalizedValue: "u1" }),
    createConfirmedRecord({ assignmentId: "current-2", seasonId: "s2", serverId: "sv2", unionId: "u2", normalizedValue: "u2" })
  ]);

  const current1 = service.getCurrentAssignment("s1", "sv1", "u1");
  const current2 = service.getCurrentAssignment("s2", "sv2", "u2");

  assert.strictEqual(current1.assignmentId, "current-1");
  assert.strictEqual(current2.assignmentId, "current-2");
});

runTest("automatic supersession for manual replacements", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "old-current", effectiveFrom: "2026-07-10T10:00:00Z" })
  ]);

  service.addConfirmedManualAssignment({
    assignmentId: "new-current",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "not_native",
    evidenceId: null,
    observedAt: "2026-07-11T10:00:00Z",
    effectiveFrom: "2026-07-11T10:00:00Z",
    reviewer: "reviewer-2",
    reviewedAt: "2026-07-11T10:10:00Z"
  });

  const oldRecord = service.getAssignment("old-current");
  const currentRecord = service.getCurrentAssignment("season-1", "server-1", "union-0001");

  assert.strictEqual(oldRecord.reviewState, "superseded");
  assert.strictEqual(oldRecord.effectiveTo, "2026-07-11T10:00:00Z");
  assert.strictEqual(oldRecord.supersededBy, "new-current");
  assert.strictEqual(currentRecord.assignmentId, "new-current");
});

runTest("automatic supersession for confirmed proposal replacements", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "old-current-2", effectiveFrom: "2026-07-10T10:00:00Z" }),
    createProposedRecord({ assignmentId: "proposal-next", observedAt: "2026-07-12T10:00:00Z" })
  ]);

  service.confirmProposal("proposal-next", {
    reviewer: "reviewer-6",
    reviewedAt: "2026-07-12T10:10:00Z",
    effectiveFrom: "2026-07-12T10:00:00Z"
  });

  const oldRecord = service.getAssignment("old-current-2");
  const currentRecord = service.getCurrentAssignment("season-1", "server-1", "union-0001");

  assert.strictEqual(oldRecord.reviewState, "superseded");
  assert.strictEqual(oldRecord.effectiveTo, "2026-07-12T10:00:00Z");
  assert.strictEqual(oldRecord.supersededBy, "proposal-next");
  assert.strictEqual(currentRecord.assignmentId, "proposal-next");
});

runTest("preservation of old provenance during supersession", () => {
  const service = createService([
    createConfirmedRecord({
      assignmentId: "prov-old",
      sourceType: "imported_data",
      rawExtractedValue: "OLD",
      normalizedValue: "union-0001",
      confidence: 0.72,
      evidenceId: "evidence-old",
      reviewer: "original-reviewer",
      reviewedAt: "2026-07-10T10:10:00Z",
      effectiveFrom: "2026-07-10T10:00:00Z"
    })
  ]);

  service.addConfirmedManualAssignment({
    assignmentId: "prov-new",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "not_native",
    evidenceId: null,
    observedAt: "2026-07-11T10:00:00Z",
    effectiveFrom: "2026-07-11T10:00:00Z",
    reviewer: "reviewer-new",
    reviewedAt: "2026-07-11T10:10:00Z"
  });

  const oldRecord = service.getAssignment("prov-old");
  assert.strictEqual(oldRecord.sourceType, "imported_data");
  assert.strictEqual(oldRecord.rawExtractedValue, "OLD");
  assert.strictEqual(oldRecord.confidence, 0.72);
  assert.strictEqual(oldRecord.evidenceId, "evidence-old");
  assert.strictEqual(oldRecord.reviewer, "original-reviewer");
  assert.strictEqual(oldRecord.reviewedAt, "2026-07-10T10:10:00Z");
});

runTest("exact half-open boundary alignment on supersession", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "boundary-old", effectiveFrom: "2026-07-10T10:00:00Z" })
  ]);

  service.addConfirmedManualAssignment({
    assignmentId: "boundary-new",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    evidenceId: null,
    observedAt: "2026-07-11T00:00:00Z",
    effectiveFrom: "2026-07-11T00:00:00Z",
    reviewer: "reviewer-3",
    reviewedAt: "2026-07-11T00:05:00Z"
  });

  const oldRecord = service.getAssignment("boundary-old");
  const newRecord = service.getAssignment("boundary-new");

  assert.strictEqual(oldRecord.effectiveTo, newRecord.effectiveFrom);
});

runTest("rejection does not affect current assignment", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "stable-current" }),
    createProposedRecord({ assignmentId: "rejectable", observedAt: "2026-07-12T10:00:00Z" })
  ]);

  service.rejectProposal("rejectable", {
    reviewer: "reviewer-r",
    reviewedAt: "2026-07-12T10:10:00Z"
  });

  const current = service.getCurrentAssignment("season-1", "server-1", "union-0001");
  assert.strictEqual(current.assignmentId, "stable-current");
});

runTest("failed replacement remains atomic", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "atomic-old", effectiveFrom: "2026-07-10T10:00:00Z" })
  ]);

  const before = service.listAssignments();
  expectServiceError(() => service.addConfirmedManualAssignment({
    assignmentId: "atomic-new",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    evidenceId: null,
    observedAt: "2026-07-11T10:00:00Z",
    effectiveFrom: "2026-07-09T10:00:00Z",
    reviewer: "reviewer-x",
    reviewedAt: "2026-07-11T10:10:00Z"
  }), "invalid_transition", /replacement effectiveFrom/);

  assert.deepStrictEqual(service.listAssignments(), before);
});

runTest("different relationships remain isolated", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "iso-a", unionId: "u1", serverId: "s1", seasonId: "sea1", normalizedValue: "u1", effectiveFrom: "2026-07-10T10:00:00Z" }),
    createConfirmedRecord({ assignmentId: "iso-b", unionId: "u2", serverId: "s2", seasonId: "sea2", normalizedValue: "u2", effectiveFrom: "2026-07-10T10:00:00Z" })
  ]);

  service.addConfirmedManualAssignment({
    assignmentId: "iso-a-new",
    unionId: "u1",
    serverId: "s1",
    seasonId: "sea1",
    nativeState: "not_native",
    evidenceId: null,
    observedAt: "2026-07-11T00:00:00Z",
    effectiveFrom: "2026-07-11T00:00:00Z",
    reviewer: "reviewer-z",
    reviewedAt: "2026-07-11T00:05:00Z"
  });

  const unchanged = service.getAssignment("iso-b");
  assert.strictEqual(unchanged.reviewState, "confirmed");
  assert.strictEqual(unchanged.supersededBy, null);
});

runTest("null-character composite IDs remain collision-safe", () => {
  const service = createService([
    createConfirmedRecord({ assignmentId: "c1", seasonId: "a", serverId: "b", unionId: "c\u0000d", normalizedValue: "c\u0000d" }),
    createConfirmedRecord({ assignmentId: "c2", seasonId: "a\u0000b", serverId: "c", unionId: "d", normalizedValue: "d" })
  ]);

  const one = service.getCurrentAssignment("a", "b", "c\u0000d");
  const two = service.getCurrentAssignment("a\u0000b", "c", "d");

  assert.strictEqual(one.assignmentId, "c1");
  assert.strictEqual(two.assignmentId, "c2");
});

runTest("safe-copy and reference isolation", () => {
  const initial = [createConfirmedRecord({ assignmentId: "copy-1" })];
  const snapshot = clone(initial);
  const service = createService(initial);

  initial[0].reviewState = "superseded";
  const listed = service.listAssignments();
  listed[0].reviewState = "changed";

  assert.strictEqual(service.listAssignments()[0].eventAt.precision, "exact");
  assert.strictEqual(service.listAssignments()[0].recordedAt, null);
  assert.strictEqual(service.listAssignments()[0].recordedAtLegacyUnknown, true);
  assert.strictEqual(service.listAssignments()[0].assignmentId, snapshot[0].assignmentId);
});

runTest("null-prototype and __proto__ safety", () => {
  const service = createService([]);
  const input = Object.create(null);
  input.assignmentId = "np-1";
  input.unionId = "union-0001";
  input.serverId = "server-1";
  input.seasonId = "season-1";
  input.nativeState = "native";
  input.sourceType = "screenshot_extraction";
  input.rawExtractedValue = "MLG";
  input.normalizedValue = "union-0001";
  input.confidence = 0.5;
  input.evidenceId = "ev-np-1";
  input.observedAt = "2026-07-20T09:00:00Z";

  service.proposeAssignment(input);

  const protoTrap = Object.create(null);
  Object.defineProperty(protoTrap, "__proto__", {
    value: "bad",
    enumerable: true,
    configurable: true,
    writable: true
  });

  expectServiceError(() => service.proposeAssignment(protoTrap), "invalid_input", /field '__proto__'/);
  assert.strictEqual(Object.prototype.bad, undefined);
});

runTest("class Date Map Set array and function inputs are rejected", () => {
  class BadInput {}
  const service = createService([]);

  expectServiceError(() => createNativeUnionAssignmentService({
    initialAssignments: [],
    validateNativeUnionAssignment: null,
    validateNativeUnionAssignmentHistory
  }), "invalid_input", /validateNativeUnionAssignment/);

  const badValues = [new Date(), new Map(), new Set(), [], () => {}, new BadInput()];
  badValues.forEach((value) => {
    expectServiceError(() => service.proposeAssignment(value), "invalid_input", /input/);
  });
});

runTest("bound validator dependency context", () => {
  let observedSingleThis = null;
  let observedHistoryThis = null;

  const input = {
    initialAssignments: [],
    validateNativeUnionAssignment(record) {
      observedSingleThis = this;
      return validateNativeUnionAssignment(record);
    },
    validateNativeUnionAssignmentHistory(records) {
      observedHistoryThis = this;
      return validateNativeUnionAssignmentHistory(records);
    }
  };

  const service = createNativeUnionAssignmentService(input);

  service.proposeAssignment({
    assignmentId: "ctx-1",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-0001",
    confidence: 0.8,
    evidenceId: "ev-ctx",
    observedAt: "2026-07-20T09:00:00Z"
  });

  assert.ok(service.hasAssignment("ctx-1"));
  assert.strictEqual(observedSingleThis, input);
  assert.strictEqual(observedHistoryThis, input);
});

runTest("validator failures throw invalid_history with copied validationErrors", () => {
  const fakeValidationErrors = [{ code: "INVALID", path: "x", message: "bad" }];
  const service = createNativeUnionAssignmentService({
    initialAssignments: [],
    validateNativeUnionAssignment() {
      return { valid: false, errors: fakeValidationErrors, warnings: [] };
    },
    validateNativeUnionAssignmentHistory(records) {
      return validateNativeUnionAssignmentHistory(records);
    }
  });

  assert.throws(() => service.proposeAssignment({
    assignmentId: "vh-1",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-0001",
    confidence: 0.8,
    evidenceId: "ev-vh",
    observedAt: "2026-07-20T09:00:00Z"
  }), (error) => {
    assert.ok(error instanceof NativeUnionAssignmentServiceError);
    assert.strictEqual(error.code, "invalid_history");
    assert.notStrictEqual(error.validationErrors, fakeValidationErrors);

    error.validationErrors.push({ code: "EXTRA", path: "y", message: "y" });
    assert.strictEqual(fakeValidationErrors.length, 1);
    return true;
  });
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createNativeUnionAssignmentService, "function");
  assert.strictEqual(typeof NativeUnionAssignmentServiceError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "native-union-assignment-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createNativeUnionAssignmentService, "function");
  assert.strictEqual(typeof sandbox.globalThis.NativeUnionAssignmentServiceError, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "native-union-assignment-service.js");
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
