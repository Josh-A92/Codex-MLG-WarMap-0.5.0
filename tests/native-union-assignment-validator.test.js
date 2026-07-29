const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

function createValidManualConfirmedRecord(overrides) {
  return Object.assign({
    assignmentId: "native-assign-1001",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    nativeState: "native",
    reviewState: "confirmed",
    sourceType: "manual_entry",
    rawExtractedValue: null,
    normalizedValue: "union-0001",
    confidence: null,
    evidenceId: null,
    observedAt: "2026-07-10T18:42:00Z",
    effectiveFrom: "2026-07-10T18:42:00Z",
    effectiveTo: null,
    reviewer: "user-01",
    reviewedAt: "2026-07-10T19:05:00Z",
    supersededBy: null
  }, overrides || {});
}

function createValidScreenshotProposal(overrides) {
  return createValidManualConfirmedRecord(Object.assign({
    assignmentId: "native-assign-2001",
    reviewState: "proposed",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    confidence: 0.91,
    evidenceId: "evidence-1001",
    effectiveFrom: null,
    effectiveTo: null,
    reviewer: null,
    reviewedAt: null,
    supersededBy: null
  }, overrides || {}));
}

function createValidRejectedProposal(overrides) {
  return createValidScreenshotProposal(Object.assign({
    assignmentId: "native-assign-2002",
    reviewState: "rejected",
    reviewer: "user-02",
    reviewedAt: "2026-07-11T10:00:00Z"
  }, overrides || {}));
}

function assertError(result, code, path) {
  assert.ok(result.errors.some((error) => error.code === code && error.path === path), `Expected ${code} at ${path}`);
}

runTest("valid manual confirmed record", () => {
  const candidate = createValidManualConfirmedRecord();
  const result = validateNativeUnionAssignment(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("valid screenshot proposal", () => {
  const candidate = createValidScreenshotProposal();
  const result = validateNativeUnionAssignment(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid rejected proposal", () => {
  const candidate = createValidRejectedProposal();
  const result = validateNativeUnionAssignment(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid superseded-to-confirmed history", () => {
  const records = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-3001",
      reviewState: "superseded",
      nativeState: "unknown",
      effectiveFrom: "2026-07-01T10:00:00Z",
      effectiveTo: "2026-07-10T18:42:00Z",
      reviewedAt: "2026-07-10T18:42:00Z",
      supersededBy: "native-assign-3002"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-3002",
      effectiveFrom: "2026-07-10T18:42:00Z",
      reviewedAt: "2026-07-10T19:05:00Z"
    })
  ];

  const result = validateNativeUnionAssignmentHistory(records);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("multiple independent relationship groups are valid", () => {
  const records = [
    createValidManualConfirmedRecord({ assignmentId: "native-assign-g1" }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-g2",
      unionId: "union-0002",
      serverId: "server-367",
      seasonId: "season-2",
      normalizedValue: "union-0002"
    }),
    createValidScreenshotProposal({
      assignmentId: "native-assign-g3",
      unionId: "union-0009",
      serverId: "server-999",
      seasonId: "season-9",
      normalizedValue: "union-0009"
    })
  ];

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, true);
});

runTest("null-prototype record is accepted", () => {
  const source = createValidManualConfirmedRecord();
  const candidate = Object.create(null);
  Object.keys(source).forEach((key) => {
    candidate[key] = source[key];
  });

  const result = validateNativeUnionAssignment(candidate);
  assert.strictEqual(result.valid, true);
});

runTest("invalid object types are rejected", () => {
  class AssignmentRecord {}

  const invalidValues = [
    [],
    new Date(),
    new Map(),
    new Set(),
    () => ({}),
    new AssignmentRecord()
  ];

  invalidValues.forEach((invalidValue) => {
    const result = validateNativeUnionAssignment(invalidValue);
    assert.strictEqual(result.valid, false);
    assertError(result, "INVALID_OBJECT", "record");
  });

  const historyResult = validateNativeUnionAssignmentHistory({});
  assert.strictEqual(historyResult.valid, false);
  assertError(historyResult, "INVALID_OBJECT", "records");
});

runTest("missing and unknown fields are rejected", () => {
  const candidate = createValidManualConfirmedRecord();
  delete candidate.assignmentId;
  candidate.extraField = true;

  const result = validateNativeUnionAssignment(candidate);
  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "assignmentId");
  assertError(result, "UNKNOWN_FIELD", "extraField");
});

runTest("history paths use records[index] prefix", () => {
  const records = [createValidManualConfirmedRecord()];
  delete records[0].nativeState;

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "records[0].nativeState");
});

runTest("normalized union mismatch is rejected", () => {
  const candidate = createValidManualConfirmedRecord({ normalizedValue: "union-9999" });
  const result = validateNativeUnionAssignment(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "normalizedValue");
});

runTest("confidence boundaries are enforced", () => {
  const low = validateNativeUnionAssignment(createValidScreenshotProposal({ confidence: -0.01 }));
  const high = validateNativeUnionAssignment(createValidScreenshotProposal({ confidence: 1.01 }));
  const edgeLow = validateNativeUnionAssignment(createValidScreenshotProposal({ confidence: 0 }));
  const edgeHigh = validateNativeUnionAssignment(createValidScreenshotProposal({ confidence: 1 }));

  assert.strictEqual(low.valid, false);
  assert.strictEqual(high.valid, false);
  assertError(low, "INVALID_NUMBER", "confidence");
  assertError(high, "INVALID_NUMBER", "confidence");
  assert.strictEqual(edgeLow.valid, true);
  assert.strictEqual(edgeHigh.valid, true);
});

runTest("evidence and source rules are enforced", () => {
  const proposedManual = validateNativeUnionAssignment(createValidScreenshotProposal({ sourceType: "manual_entry", confidence: null, evidenceId: null }));
  const nonManualMissingEvidence = validateNativeUnionAssignment(createValidScreenshotProposal({ evidenceId: null }));
  const manualWithConfidence = validateNativeUnionAssignment(createValidManualConfirmedRecord({ confidence: 0.5 }));

  assert.strictEqual(proposedManual.valid, false);
  assert.strictEqual(nonManualMissingEvidence.valid, false);
  assert.strictEqual(manualWithConfidence.valid, false);
  assertError(proposedManual, "INVALID_LIFECYCLE", "sourceType");
  assertError(nonManualMissingEvidence, "INVALID_LIFECYCLE", "evidenceId");
  assertError(manualWithConfidence, "INVALID_LIFECYCLE", "confidence");
});

runTest("invalid and impossible timestamps are rejected", () => {
  const badObserved = validateNativeUnionAssignment(createValidManualConfirmedRecord({ observedAt: "not-a-time" }));
  const impossibleObserved = validateNativeUnionAssignment(createValidManualConfirmedRecord({ observedAt: "2026-02-30T12:00:00Z" }));
  const nonUtc = validateNativeUnionAssignment(createValidManualConfirmedRecord({ observedAt: "2026-07-10T18:42:00+01:00" }));
  const tooManyFractionDigits = validateNativeUnionAssignment(createValidManualConfirmedRecord({ observedAt: "2026-07-10T18:42:00.1234Z" }));
  const missingZulu = validateNativeUnionAssignment(createValidManualConfirmedRecord({ observedAt: "2026-07-10T18:42:00.123" }));

  assert.strictEqual(badObserved.valid, false);
  assert.strictEqual(impossibleObserved.valid, false);
  assert.strictEqual(nonUtc.valid, false);
  assert.strictEqual(tooManyFractionDigits.valid, false);
  assert.strictEqual(missingZulu.valid, false);
  assertError(badObserved, "INVALID_TIMESTAMP", "observedAt");
  assertError(impossibleObserved, "INVALID_TIMESTAMP", "observedAt");
  assertError(nonUtc, "INVALID_TIMESTAMP", "observedAt");
  assertError(tooManyFractionDigits, "INVALID_TIMESTAMP", "observedAt");
  assertError(missingZulu, "INVALID_TIMESTAMP", "observedAt");
});

runTest("timestamps accept zero to three fractional digits", () => {
  const noFraction = validateNativeUnionAssignment(createValidManualConfirmedRecord({
    observedAt: "2026-07-10T18:42:00Z",
    effectiveFrom: "2026-07-10T18:42:00.1Z",
    reviewedAt: "2026-07-10T19:05:00.12Z"
  }));

  const threeDigits = validateNativeUnionAssignment(createValidManualConfirmedRecord({
    observedAt: "2026-07-10T18:42:00.123Z",
    effectiveFrom: "2026-07-10T18:42:00.123Z",
    reviewedAt: "2026-07-10T19:05:00.123Z"
  }));

  assert.strictEqual(noFraction.valid, true);
  assert.strictEqual(threeDigits.valid, true);
});

runTest("reviewedAt cannot precede observedAt", () => {
  const candidate = createValidManualConfirmedRecord({ reviewedAt: "2026-07-10T18:41:59Z" });
  const result = validateNativeUnionAssignment(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "reviewedAt");
});

runTest("lifecycle constraints are enforced for each reviewState", () => {
  const proposed = validateNativeUnionAssignment(createValidScreenshotProposal({ effectiveFrom: "2026-07-10T18:42:00Z" }));
  const rejected = validateNativeUnionAssignment(createValidRejectedProposal({ reviewer: null }));
  const confirmed = validateNativeUnionAssignment(createValidManualConfirmedRecord({ effectiveTo: "2026-07-11T00:00:00Z" }));
  const superseded = validateNativeUnionAssignment(createValidManualConfirmedRecord({
    reviewState: "superseded",
    effectiveTo: null,
    supersededBy: null
  }));

  assert.strictEqual(proposed.valid, false);
  assert.strictEqual(rejected.valid, false);
  assert.strictEqual(confirmed.valid, false);
  assert.strictEqual(superseded.valid, false);
  assertError(proposed, "INVALID_LIFECYCLE", "effectiveFrom");
  assertError(rejected, "INVALID_LIFECYCLE", "reviewer");
  assertError(confirmed, "INVALID_LIFECYCLE", "effectiveTo");
  assertError(superseded, "INVALID_LIFECYCLE", "effectiveTo");
  assertError(superseded, "INVALID_LIFECYCLE", "supersededBy");
});

runTest("effectiveTo cannot precede effectiveFrom", () => {
  const candidate = createValidManualConfirmedRecord({
    reviewState: "superseded",
    effectiveFrom: "2026-07-10T18:42:00Z",
    effectiveTo: "2026-07-10T18:41:59Z",
    supersededBy: "native-assign-next"
  });

  const result = validateNativeUnionAssignment(candidate);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "effectiveTo");
});

runTest("assignmentId must be unique across history", () => {
  const records = [
    createValidManualConfirmedRecord({ assignmentId: "dup-1" }),
    createValidRejectedProposal({ assignmentId: "dup-1" })
  ];

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_ASSIGNMENT_ID", "records[1].assignmentId");
});

runTest("multiple current confirmed assignments are rejected per group", () => {
  const records = [
    createValidManualConfirmedRecord({ assignmentId: "native-assign-c1" }),
    createValidManualConfirmedRecord({ assignmentId: "native-assign-c2" })
  ];

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, false);
  assertError(result, "MULTIPLE_CURRENT_ASSIGNMENTS", "records[1].reviewState");
});

runTest("overlapping effective periods are rejected and adjacent periods are valid", () => {
  const adjacent = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-a1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-05T00:00:00Z",
      supersededBy: "native-assign-a2"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-a2",
      effectiveFrom: "2026-07-05T00:00:00Z"
    })
  ];

  const overlapping = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-o1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-10T00:00:00Z",
      supersededBy: "native-assign-o2"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-o2",
      effectiveFrom: "2026-07-05T00:00:00Z"
    })
  ];

  const adjacentResult = validateNativeUnionAssignmentHistory(adjacent);
  const overlapResult = validateNativeUnionAssignmentHistory(overlapping);

  assert.strictEqual(adjacentResult.valid, true);
  assert.strictEqual(overlapResult.valid, false);
  assertError(overlapResult, "OVERLAPPING_EFFECTIVE_PERIOD", "records[1].effectiveFrom");
});

runTest("supersession references must exist in the same relationship and match boundaries", () => {
  const missingReference = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-s1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-05T00:00:00Z",
      supersededBy: "native-assign-missing"
    })
  ];

  const crossRelationshipReference = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-s2",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-05T00:00:00Z",
      supersededBy: "native-assign-other"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-other",
      unionId: "union-other",
      normalizedValue: "union-other"
    })
  ];

  const mismatchedBoundary = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-s3",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-05T00:00:00Z",
      supersededBy: "native-assign-s4"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-s4",
      effectiveFrom: "2026-07-06T00:00:00Z"
    })
  ];

  const missingResult = validateNativeUnionAssignmentHistory(missingReference);
  const crossResult = validateNativeUnionAssignmentHistory(crossRelationshipReference);
  const mismatchResult = validateNativeUnionAssignmentHistory(mismatchedBoundary);

  assert.strictEqual(missingResult.valid, false);
  assert.strictEqual(crossResult.valid, false);
  assert.strictEqual(mismatchResult.valid, false);
  assertError(missingResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(crossResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(mismatchResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("supersession boundary uses parsed timestamp equivalence", () => {
  const oneDigitFraction = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-frac-1",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-05T00:00:00.1Z",
      supersededBy: "native-assign-frac-2"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-frac-2",
      effectiveFrom: "2026-07-05T00:00:00.100Z"
    })
  ];

  const twoDigitFraction = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-frac-3",
      reviewState: "superseded",
      effectiveFrom: "2026-07-06T00:00:00Z",
      effectiveTo: "2026-07-07T00:00:00.12Z",
      supersededBy: "native-assign-frac-4"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-frac-4",
      effectiveFrom: "2026-07-07T00:00:00.120Z"
    })
  ];

  const resultOneDigit = validateNativeUnionAssignmentHistory(oneDigitFraction);
  const resultTwoDigit = validateNativeUnionAssignmentHistory(twoDigitFraction);

  assert.strictEqual(resultOneDigit.valid, true);
  assert.strictEqual(resultTwoDigit.valid, true);
});

runTest("supersession cycles are rejected", () => {
  const records = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-cycle-a",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-01T00:00:00Z",
      supersededBy: "native-assign-cycle-b"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-cycle-b",
      reviewState: "superseded",
      effectiveFrom: "2026-07-01T00:00:00Z",
      effectiveTo: "2026-07-01T00:00:00Z",
      supersededBy: "native-assign-cycle-a"
    })
  ];

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, false);
  assertError(result, "SUPERSESSION_CYCLE", "records[0].supersededBy");
  assertError(result, "SUPERSESSION_CYCLE", "records[1].supersededBy");
});

runTest("collision-safe grouping handles IDs containing null characters", () => {
  const records = [
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-null-a",
      seasonId: "a",
      serverId: "b",
      unionId: "c\u0000d",
      normalizedValue: "c\u0000d"
    }),
    createValidManualConfirmedRecord({
      assignmentId: "native-assign-null-b",
      seasonId: "a\u0000b",
      serverId: "c",
      unionId: "d",
      normalizedValue: "d"
    })
  ];

  const result = validateNativeUnionAssignmentHistory(records);
  assert.strictEqual(result.valid, true);
});

runTest("input immutability and pure behavior", () => {
  const record = createValidManualConfirmedRecord();
  const before = clone(record);

  const result = validateNativeUnionAssignment(record);
  assert.deepStrictEqual(record, before);
  assert.strictEqual(result.valid, true);

  const first = validateNativeUnionAssignmentHistory([createValidManualConfirmedRecord({ assignmentId: "immutable-1" })]);
  const second = validateNativeUnionAssignmentHistory([createValidManualConfirmedRecord({ assignmentId: "immutable-1" })]);

  first.errors.push({ code: "MUTATED", path: "x", message: "x" });
  assert.strictEqual(second.errors.length, 0);
  assert.deepStrictEqual(second.warnings, []);
});

runTest("never throws on invalid candidate data", () => {
  assert.doesNotThrow(() => validateNativeUnionAssignment(undefined));
  assert.doesNotThrow(() => validateNativeUnionAssignment(null));
  assert.doesNotThrow(() => validateNativeUnionAssignmentHistory(undefined));
});

runTest("deterministic error order", () => {
  const candidate = createValidManualConfirmedRecord({
    assignmentId: "   ",
    nativeState: "bad",
    observedAt: "bad-ts",
    extraB: true,
    extraA: true
  });

  const result = validateNativeUnionAssignment(candidate);

  const unknownFieldCodes = result.errors.filter((error) => error.code === "UNKNOWN_FIELD").map((error) => error.path);
  assert.deepStrictEqual(unknownFieldCodes, ["extraA", "extraB"]);
  assert.strictEqual(result.errors[0].code, "UNKNOWN_FIELD");
  assert.strictEqual(result.errors[0].path, "extraA");
  assert.ok(result.errors.find((error) => error.code === "INVALID_STRING" && error.path === "assignmentId"));
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof validateNativeUnionAssignment, "function");
  assert.strictEqual(typeof validateNativeUnionAssignmentHistory, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "native-union-assignment-validator.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.validateNativeUnionAssignment, "function");
  assert.strictEqual(typeof sandbox.globalThis.validateNativeUnionAssignmentHistory, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "native-union-assignment-validator.js");
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
