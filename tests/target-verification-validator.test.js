const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateTargetVerificationRecord,
  validateTargetVerificationHistory
} = require("../src/services/target-verification-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createValidCellVerification(overrides) {
  return Object.assign({
    verificationId: "verify-366-0001",
    serverId: "server-366",
    seasonId: "season-1",
    targetRef: {
      type: "normal_map_cell",
      row: 5,
      col: 8
    },
    verifiedOwnershipRef: {
      type: "territory_ownership_record",
      recordId: "own-9001"
    },
    observedAt: "2026-07-29T07:00:00Z",
    confirmedAt: "2026-07-29T07:08:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "user-01",
    reviewerId: "user-01",
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function createValidStructureVerification(overrides) {
  return createValidCellVerification(Object.assign({
    verificationId: "verify-366-1001",
    targetRef: {
      type: "logical_structure",
      structureId: "structure-royal-city-1"
    },
    verifiedOwnershipRef: {
      type: "structure_ownership_record",
      recordId: "structure-own-9001"
    },
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-1001"]
  }, overrides || {}));
}

function assertError(result, code, path) {
  assert.ok(result.errors.some((error) => error.code === code && error.path === path), `Expected ${code} at ${path}`);
}

runTest("valid confirmed cell verification", () => {
  const result = validateTargetVerificationRecord(createValidCellVerification());
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("valid confirmed structure verification", () => {
  const result = validateTargetVerificationRecord(createValidStructureVerification());
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("valid null-prototype record and nested objects", () => {
  const base = createValidCellVerification();
  const record = Object.create(null);
  Object.keys(base).forEach((key) => {
    record[key] = base[key];
  });

  const targetRef = Object.create(null);
  targetRef.type = "normal_map_cell";
  targetRef.row = 9;
  targetRef.col = 11;

  const ownershipRef = Object.create(null);
  ownershipRef.type = "territory_ownership_record";
  ownershipRef.recordId = "own-9010";

  record.targetRef = targetRef;
  record.verifiedOwnershipRef = ownershipRef;
  record.verificationId = "verify-null-proto";

  const result = validateTargetVerificationRecord(record);
  assert.strictEqual(result.valid, true);
});

runTest("rejection of non-record inputs and class instances", () => {
  class RecordClass {}
  const badValues = [[], new Date(), new Map(), new Set(), () => ({}), new RecordClass()];

  badValues.forEach((value) => {
    const result = validateTargetVerificationRecord(value);
    assert.strictEqual(result.valid, false);
    assertError(result, "INVALID_OBJECT", "record");
  });

  const historyResult = validateTargetVerificationHistory({});
  assert.strictEqual(historyResult.valid, false);
  assertError(historyResult, "INVALID_OBJECT", "records");
});

runTest("missing canonical fields", () => {
  const record = createValidCellVerification();
  delete record.verificationId;
  delete record.targetRef;

  const result = validateTargetVerificationRecord(record);
  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "verificationId");
  assertError(result, "MISSING_REQUIRED_FIELD", "targetRef");
});

runTest("unknown top-level and nested fields", () => {
  const record = createValidCellVerification({
    targetRef: {
      type: "normal_map_cell",
      row: 5,
      col: 8,
      extraNested: true
    },
    verifiedOwnershipRef: {
      type: "territory_ownership_record",
      recordId: "own-9001",
      extraOwnershipField: true
    }
  });
  record.extraTop = true;

  const result = validateTargetVerificationRecord(record);
  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "extraTop");
  assertError(result, "UNKNOWN_FIELD", "targetRef.extraNested");
  assertError(result, "UNKNOWN_FIELD", "verifiedOwnershipRef.extraOwnershipField");
});

runTest("invalid IDs and enums", () => {
  const record = createValidCellVerification({
    verificationId: "   ",
    actorId: "",
    reviewerId: "\n",
    sourceType: "other",
    reviewState: "proposed"
  });

  const result = validateTargetVerificationRecord(record);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "verificationId");
  assertError(result, "INVALID_STRING", "actorId");
  assertError(result, "INVALID_STRING", "reviewerId");
  assertError(result, "INVALID_ENUM", "sourceType");
  assertError(result, "INVALID_ENUM", "reviewState");
});

runTest("every valid source type", () => {
  const sourceTypes = [
    { sourceType: "manual_entry", evidenceIds: [] },
    { sourceType: "screenshot_extraction", evidenceIds: ["e1"] },
    { sourceType: "imported_data", evidenceIds: ["e2"] },
    { sourceType: "api_integration", evidenceIds: ["e3"] },
    { sourceType: "bot_integration", evidenceIds: ["e4"] }
  ];

  sourceTypes.forEach((entry, index) => {
    const result = validateTargetVerificationRecord(createValidCellVerification({
      verificationId: `verify-source-${index}`,
      sourceType: entry.sourceType,
      evidenceIds: entry.evidenceIds
    }));

    assert.strictEqual(result.valid, true);
  });
});

runTest("manual evidence may be empty", () => {
  const result = validateTargetVerificationRecord(createValidCellVerification({
    sourceType: "manual_entry",
    evidenceIds: []
  }));

  assert.strictEqual(result.valid, true);
});

runTest("non-manual evidence must be present", () => {
  const result = validateTargetVerificationRecord(createValidCellVerification({
    sourceType: "screenshot_extraction",
    evidenceIds: []
  }));

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "evidenceIds");
});

runTest("duplicate or invalid evidence IDs", () => {
  const notArray = validateTargetVerificationRecord(createValidCellVerification({ evidenceIds: null }));
  const invalidEntry = validateTargetVerificationRecord(createValidCellVerification({ evidenceIds: ["ok", " "] }));
  const duplicateEntry = validateTargetVerificationRecord(createValidCellVerification({ evidenceIds: ["dup", "dup"] }));

  assert.strictEqual(notArray.valid, false);
  assert.strictEqual(invalidEntry.valid, false);
  assert.strictEqual(duplicateEntry.valid, false);
  assertError(notArray, "INVALID_LIFECYCLE", "evidenceIds");
  assertError(invalidEntry, "INVALID_STRING", "evidenceIds[1]");
  assertError(duplicateEntry, "INVALID_LIFECYCLE", "evidenceIds[1]");
});

runTest("valid cell and structure target shapes", () => {
  const cellResult = validateTargetVerificationRecord(createValidCellVerification({ verificationId: "verify-shape-cell" }));
  const structureResult = validateTargetVerificationRecord(createValidStructureVerification({ verificationId: "verify-shape-structure" }));

  assert.strictEqual(cellResult.valid, true);
  assert.strictEqual(structureResult.valid, true);
});

runTest("invalid coordinates and structure IDs", () => {
  const badRowZero = validateTargetVerificationRecord(createValidCellVerification({ targetRef: { type: "normal_map_cell", row: 0, col: 1 } }));
  const badColNegative = validateTargetVerificationRecord(createValidCellVerification({ targetRef: { type: "normal_map_cell", row: 1, col: -1 } }));
  const badFraction = validateTargetVerificationRecord(createValidCellVerification({ targetRef: { type: "normal_map_cell", row: 1.5, col: 2 } }));
  const badNaN = validateTargetVerificationRecord(createValidCellVerification({ targetRef: { type: "normal_map_cell", row: NaN, col: 2 } }));
  const badInfinity = validateTargetVerificationRecord(createValidCellVerification({ targetRef: { type: "normal_map_cell", row: Infinity, col: 2 } }));
  const badStructureId = validateTargetVerificationRecord(createValidStructureVerification({
    targetRef: { type: "logical_structure", structureId: "  " }
  }));

  assert.strictEqual(badRowZero.valid, false);
  assert.strictEqual(badColNegative.valid, false);
  assert.strictEqual(badFraction.valid, false);
  assert.strictEqual(badNaN.valid, false);
  assert.strictEqual(badInfinity.valid, false);
  assert.strictEqual(badStructureId.valid, false);
  assertError(badRowZero, "INVALID_NUMBER", "targetRef.row");
  assertError(badColNegative, "INVALID_NUMBER", "targetRef.col");
  assertError(badFraction, "INVALID_NUMBER", "targetRef.row");
  assertError(badNaN, "INVALID_NUMBER", "targetRef.row");
  assertError(badInfinity, "INVALID_NUMBER", "targetRef.row");
  assertError(badStructureId, "INVALID_STRING", "targetRef.structureId");
});

runTest("invalid ownership-reference shapes", () => {
  const notObject = validateTargetVerificationRecord(createValidCellVerification({ verifiedOwnershipRef: [] }));
  const missingRecordId = validateTargetVerificationRecord(createValidCellVerification({ verifiedOwnershipRef: { type: "territory_ownership_record" } }));
  const badRecordId = validateTargetVerificationRecord(createValidCellVerification({ verifiedOwnershipRef: { type: "territory_ownership_record", recordId: " " } }));
  const badType = validateTargetVerificationRecord(createValidCellVerification({ verifiedOwnershipRef: { type: "something_else", recordId: "x" } }));

  assert.strictEqual(notObject.valid, false);
  assert.strictEqual(missingRecordId.valid, false);
  assert.strictEqual(badRecordId.valid, false);
  assert.strictEqual(badType.valid, false);
  assertError(notObject, "INVALID_OBJECT", "verifiedOwnershipRef");
  assertError(missingRecordId, "MISSING_REQUIRED_FIELD", "verifiedOwnershipRef.recordId");
  assertError(badRecordId, "INVALID_STRING", "verifiedOwnershipRef.recordId");
  assertError(badType, "INVALID_ENUM", "verifiedOwnershipRef.type");
});

runTest("target and ownership type mismatch", () => {
  const cellMismatch = validateTargetVerificationRecord(createValidCellVerification({
    verifiedOwnershipRef: { type: "structure_ownership_record", recordId: "structure-own-1" }
  }));

  const structureMismatch = validateTargetVerificationRecord(createValidStructureVerification({
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "own-9010" }
  }));

  assert.strictEqual(cellMismatch.valid, false);
  assert.strictEqual(structureMismatch.valid, false);
  assertError(cellMismatch, "INVALID_LIFECYCLE", "verifiedOwnershipRef");
  assertError(structureMismatch, "INVALID_LIFECYCLE", "verifiedOwnershipRef");
});

runTest("timestamp precision acceptance and malformed or impossible rejection", () => {
  const noFraction = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00Z" }));
  const oneDigit = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00.1Z" }));
  const twoDigits = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00.12Z" }));
  const threeDigits = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00.123Z" }));
  const offset = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00+01:00" }));
  const missingZulu = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00" }));
  const tooPrecise = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-07-29T07:00:00.1234Z" }));
  const impossible = validateTargetVerificationRecord(createValidCellVerification({ observedAt: "2026-02-30T07:00:00Z" }));

  assert.strictEqual(noFraction.valid, true);
  assert.strictEqual(oneDigit.valid, true);
  assert.strictEqual(twoDigits.valid, true);
  assert.strictEqual(threeDigits.valid, true);
  assert.strictEqual(offset.valid, false);
  assert.strictEqual(missingZulu.valid, false);
  assert.strictEqual(tooPrecise.valid, false);
  assert.strictEqual(impossible.valid, false);
  assertError(offset, "INVALID_TIMESTAMP", "observedAt");
  assertError(missingZulu, "INVALID_TIMESTAMP", "observedAt");
  assertError(tooPrecise, "INVALID_TIMESTAMP", "observedAt");
  assertError(impossible, "INVALID_TIMESTAMP", "observedAt");
});

runTest("confirmedAt earlier than observedAt is rejected", () => {
  const result = validateTargetVerificationRecord(createValidCellVerification({
    observedAt: "2026-07-29T07:08:00Z",
    confirmedAt: "2026-07-29T07:00:00Z"
  }));

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "confirmedAt");
});

runTest("confirmed and superseded lifecycle rules", () => {
  const confirmedBad = validateTargetVerificationRecord(createValidCellVerification({
    reviewState: "confirmed",
    supersededBy: "verify-next"
  }));

  const supersededBad = validateTargetVerificationRecord(createValidCellVerification({
    reviewState: "superseded",
    supersededBy: null
  }));

  const supersededGood = validateTargetVerificationRecord(createValidCellVerification({
    verificationId: "verify-sup-1",
    reviewState: "superseded",
    supersededBy: "verify-sup-2"
  }));

  assert.strictEqual(confirmedBad.valid, false);
  assert.strictEqual(supersededBad.valid, false);
  assert.strictEqual(supersededGood.valid, true);
  assertError(confirmedBad, "INVALID_LIFECYCLE", "supersededBy");
  assertError(supersededBad, "INVALID_LIFECYCLE", "supersededBy");
});

runTest("unique verification IDs", () => {
  const history = [
    createValidCellVerification({ verificationId: "dup-1" }),
    createValidCellVerification({ verificationId: "dup-1", observedAt: "2026-07-29T08:00:00Z", confirmedAt: "2026-07-29T08:05:00Z" })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_VERIFICATION_ID", "records[1].verificationId");
});

runTest("multiple routine confirmations at different observed times", () => {
  const history = [
    createValidCellVerification({ verificationId: "routine-1", observedAt: "2026-07-29T07:00:00Z", confirmedAt: "2026-07-29T07:01:00Z" }),
    createValidCellVerification({ verificationId: "routine-2", observedAt: "2026-07-29T08:00:00Z", confirmedAt: "2026-07-29T08:01:00Z" })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("same-target same-parsed-time conflict rejection", () => {
  const history = [
    createValidCellVerification({ verificationId: "conflict-1", observedAt: "2026-07-29T07:00:00Z", confirmedAt: "2026-07-29T07:01:00Z" }),
    createValidCellVerification({ verificationId: "conflict-2", observedAt: "2026-07-29T07:00:00Z", confirmedAt: "2026-07-29T07:02:00Z" })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_CURRENT_OBSERVED_AT", "records[1].observedAt");
});

runTest("invalid record at same parsed observedAt does not create duplicate-current conflict", () => {
  const history = [
    createValidCellVerification({
      verificationId: "same-time-valid",
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:01:00Z"
    }),
    createValidCellVerification({
      verificationId: "same-time-invalid",
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:02:00Z",
      sourceType: "screenshot_extraction",
      evidenceIds: []
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "records[1].evidenceIds");
  assert.ok(!result.errors.some((error) => error.code === "DUPLICATE_CURRENT_OBSERVED_AT"));
});

runTest(".1Z and .100Z same-instant conflict equivalence", () => {
  const history = [
    createValidCellVerification({ verificationId: "eq-1", observedAt: "2026-07-29T07:00:00.1Z", confirmedAt: "2026-07-29T07:00:01Z" }),
    createValidCellVerification({ verificationId: "eq-2", observedAt: "2026-07-29T07:00:00.100Z", confirmedAt: "2026-07-29T07:00:02Z" })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_CURRENT_OBSERVED_AT", "records[1].observedAt");
});

runTest("superseded record excluded from same-instant conflict", () => {
  const history = [
    createValidCellVerification({
      verificationId: "exc-1",
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:01:00Z",
      reviewState: "superseded",
      supersededBy: "exc-2"
    }),
    createValidCellVerification({
      verificationId: "exc-2",
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:02:00Z"
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("missing supersession reference", () => {
  const history = [
    createValidCellVerification({
      verificationId: "missing-ref-1",
      reviewState: "superseded",
      supersededBy: "missing-ref-2"
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("superseded record referencing correction with invalid timestamp is rejected", () => {
  const history = [
    createValidCellVerification({
      verificationId: "bad-time-a",
      reviewState: "superseded",
      supersededBy: "bad-time-b"
    }),
    createValidCellVerification({
      verificationId: "bad-time-b",
      observedAt: "2026-02-30T07:00:00Z"
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_TIMESTAMP", "records[1].observedAt");
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("superseded record referencing correction with invalid non-manual evidence is rejected", () => {
  const history = [
    createValidCellVerification({
      verificationId: "bad-evidence-a",
      reviewState: "superseded",
      supersededBy: "bad-evidence-b"
    }),
    createValidCellVerification({
      verificationId: "bad-evidence-b",
      sourceType: "imported_data",
      evidenceIds: []
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_LIFECYCLE", "records[1].evidenceIds");
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("cross-server cross-season and cross-target supersession rejection", () => {
  const crossServer = [
    createValidCellVerification({ verificationId: "srv-a", reviewState: "superseded", supersededBy: "srv-b" }),
    createValidCellVerification({ verificationId: "srv-b", serverId: "server-999" })
  ];

  const crossSeason = [
    createValidCellVerification({ verificationId: "ssn-a", reviewState: "superseded", supersededBy: "ssn-b" }),
    createValidCellVerification({ verificationId: "ssn-b", seasonId: "season-2" })
  ];

  const crossTarget = [
    createValidCellVerification({ verificationId: "tgt-a", reviewState: "superseded", supersededBy: "tgt-b" }),
    createValidCellVerification({ verificationId: "tgt-b", targetRef: { type: "normal_map_cell", row: 7, col: 9 } })
  ];

  const crossServerResult = validateTargetVerificationHistory(crossServer);
  const crossSeasonResult = validateTargetVerificationHistory(crossSeason);
  const crossTargetResult = validateTargetVerificationHistory(crossTarget);

  assert.strictEqual(crossServerResult.valid, false);
  assert.strictEqual(crossSeasonResult.valid, false);
  assert.strictEqual(crossTargetResult.valid, false);
  assertError(crossServerResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(crossSeasonResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(crossTargetResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("self-reference and multi-record cycle rejection", () => {
  const selfReference = [
    createValidCellVerification({
      verificationId: "self-1",
      reviewState: "superseded",
      supersededBy: "self-1"
    })
  ];

  const cycle = [
    createValidCellVerification({ verificationId: "cycle-1", reviewState: "superseded", supersededBy: "cycle-2" }),
    createValidCellVerification({ verificationId: "cycle-2", reviewState: "superseded", supersededBy: "cycle-1" })
  ];

  const selfResult = validateTargetVerificationHistory(selfReference);
  const cycleResult = validateTargetVerificationHistory(cycle);

  assert.strictEqual(selfResult.valid, false);
  assert.strictEqual(cycleResult.valid, false);
  assertError(selfResult, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assertError(cycleResult, "SUPERSESSION_CYCLE", "records[0].supersededBy");
  assertError(cycleResult, "SUPERSESSION_CYCLE", "records[1].supersededBy");
});

runTest("individually invalid records cannot create supersession cycles", () => {
  const history = [
    createValidCellVerification({
      verificationId: "cycle-invalid-a",
      reviewState: "superseded",
      supersededBy: "cycle-invalid-b"
    }),
    createValidCellVerification({
      verificationId: "cycle-invalid-b",
      reviewState: "superseded",
      supersededBy: "cycle-invalid-a",
      observedAt: "2026-02-30T07:00:00Z"
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_TIMESTAMP", "records[1].observedAt");
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  assert.ok(!result.errors.some((error) => error.code === "SUPERSESSION_CYCLE"));
});

runTest("fully valid same-time conflicts are still rejected", () => {
  const history = [
    createValidStructureVerification({ verificationId: "valid-conf-1", observedAt: "2026-07-29T09:00:00Z", confirmedAt: "2026-07-29T09:02:00Z" }),
    createValidStructureVerification({ verificationId: "valid-conf-2", observedAt: "2026-07-29T09:00:00Z", confirmedAt: "2026-07-29T09:03:00Z" })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_CURRENT_OBSERVED_AT", "records[1].observedAt");
});

runTest("fully valid supersession chains still pass", () => {
  const history = [
    createValidStructureVerification({
      verificationId: "chain-a",
      reviewState: "superseded",
      supersededBy: "chain-b",
      observedAt: "2026-07-29T06:00:00Z",
      confirmedAt: "2026-07-29T06:05:00Z"
    }),
    createValidStructureVerification({
      verificationId: "chain-b",
      reviewState: "superseded",
      supersededBy: "chain-c",
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:05:00Z"
    }),
    createValidStructureVerification({
      verificationId: "chain-c",
      observedAt: "2026-07-29T08:00:00Z",
      confirmedAt: "2026-07-29T08:05:00Z"
    })
  ];

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("collision-safe grouping with IDs containing null character", () => {
  const history = [
    createValidCellVerification({
      verificationId: "nul-1",
      seasonId: "a",
      serverId: "b",
      targetRef: { type: "normal_map_cell", row: 1, col: 2 },
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:01:00Z"
    }),
    createValidCellVerification({
      verificationId: "nul-2",
      seasonId: "a\u0000b",
      serverId: "",
      targetRef: { type: "normal_map_cell", row: 1, col: 2 },
      observedAt: "2026-07-29T07:00:00Z",
      confirmedAt: "2026-07-29T07:01:00Z"
    })
  ];

  history[1].serverId = "c";

  const result = validateTargetVerificationHistory(history);
  assert.strictEqual(result.valid, true);
});

runTest("deterministic error ordering", () => {
  const record = createValidCellVerification({
    evidenceIds: ["dup", "dup"],
    extraB: true,
    extraA: true
  });

  const result = validateTargetVerificationRecord(record);
  const unknownPaths = result.errors.filter((error) => error.code === "UNKNOWN_FIELD").map((error) => error.path);

  assert.deepStrictEqual(unknownPaths, ["extraA", "extraB"]);
});

runTest("input immutability and no retained references", () => {
  const record = createValidCellVerification({ verificationId: "immut-1" });
  const before = clone(record);

  const result = validateTargetVerificationRecord(record);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(record, before);

  const history = [createValidCellVerification({ verificationId: "immut-h1" })];
  const historyBefore = clone(history);

  const first = validateTargetVerificationHistory(history);
  const second = validateTargetVerificationHistory(history);

  first.errors.push({ code: "MUTATED", path: "x", message: "x" });

  assert.deepStrictEqual(history, historyBefore);
  assert.strictEqual(second.errors.length, 0);
  assert.deepStrictEqual(second.warnings, []);
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof validateTargetVerificationRecord, "function");
  assert.strictEqual(typeof validateTargetVerificationHistory, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "target-verification-validator.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.validateTargetVerificationRecord, "function");
  assert.strictEqual(typeof sandbox.globalThis.validateTargetVerificationHistory, "function");
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
