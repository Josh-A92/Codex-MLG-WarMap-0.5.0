const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertError(result, code, pathValue) {
  assert.ok(
    result.errors.some((error) => error.code === code && (!pathValue || error.path === pathValue)),
    `Expected ${code}${pathValue ? ` at ${pathValue}` : ""}; got ${JSON.stringify(result.errors)}`
  );
}

function createFactoryDependencies() {
  return {
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  };
}

function createValidator() {
  return createConfirmedServerSnapshotValidator(createFactoryDependencies());
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

function structureOwnership(overrides) {
  return Object.assign({
    structureOwnershipId: "own-structure-1",
    serverId: "server-1",
    seasonId: "season-1",
    structureId: "structure-1",
    ownerUnionId: null,
    ownershipState: "unclaimed",
    reviewState: "confirmed",
    effectiveAt: "2026-07-29T00:00:00Z",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-structure-1"],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-07-29T00:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function verificationRecord(overrides) {
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

function structureVerificationRecord(overrides) {
  return verificationRecord(Object.assign({
    verificationId: "verify-structure-1",
    targetRef: { type: "logical_structure", structureId: "structure-1" },
    verifiedOwnershipRef: { type: "structure_ownership_record", recordId: "own-structure-1" },
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-verify-structure-1"],
    observedAt: "2026-07-29T20:30:00Z",
    confirmedAt: "2026-07-29T20:40:00Z"
  }, overrides || {}));
}

function snapshot(overrides) {
  return Object.assign({
    snapshotId: "snapshot-1",
    serverId: "server-1",
    seasonId: "season-1",
    createdAt: "2026-07-29T21:00:00Z",
    ownershipRecordIds: ["own-cell-1"],
    structureOwnershipRecordIds: ["own-structure-1"],
    verificationRecordIds: ["verify-cell-1", "verify-structure-1"],
    unionStatusRecordIds: ["status-1"],
    evidenceIds: ["snapshot-evidence-1"],
    creatorId: "actor-1",
    reviewerId: "reviewer-1",
    completenessRecordIds: ["complete-1"],
    previousConfirmedSnapshotId: null
  }, overrides || {});
}

function evaluationInput(overrides) {
  return Object.assign({
    snapshot: snapshot(),
    territoryOwnershipRecords: [territoryOwnership()],
    structureOwnershipRecords: [structureOwnership()],
    verificationRecords: [verificationRecord(), structureVerificationRecord()],
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "logical_structure", structureId: "structure-1" }
    ]
  }, overrides || {});
}

runTest("factory rejects missing unknown and non-function dependencies", () => {
  assert.throws(
    () => createConfirmedServerSnapshotValidator({}),
    /requires 'validateTerritoryOwnershipRecord'/
  );

  const deps = createFactoryDependencies();
  deps.extra = function extra() {};
  assert.throws(
    () => createConfirmedServerSnapshotValidator(deps),
    /does not recognize option 'extra'/
  );

  const depsWithBadType = createFactoryDependencies();
  depsWithBadType.validateTargetVerificationRecord = 123;
  assert.throws(
    () => createConfirmedServerSnapshotValidator(depsWithBadType),
    /must be a function/
  );
});

runTest("factory preserves dependency this-binding and instance isolation", () => {
  function createTaggedDeps(tag, calls) {
    const dependencySet = {
      validateTerritoryOwnershipRecord(record) {
        calls.push(`${tag}:record:${this === dependencySet ? "self" : "other"}`);
        return validateTerritoryOwnershipRecord(record);
      },
      validateTerritoryOwnershipHistory(records) {
        calls.push(`${tag}:history-territory:${this === dependencySet ? "self" : "other"}`);
        return validateTerritoryOwnershipHistory(records);
      },
      validateStructureOwnershipRecord(record) {
        calls.push(`${tag}:record-structure:${this === dependencySet ? "self" : "other"}`);
        return validateStructureOwnershipRecord(record);
      },
      validateStructureOwnershipHistory(records) {
        calls.push(`${tag}:history-structure:${this === dependencySet ? "self" : "other"}`);
        return validateStructureOwnershipHistory(records);
      },
      validateTargetVerificationRecord(record) {
        calls.push(`${tag}:record-verify:${this === dependencySet ? "self" : "other"}`);
        return validateTargetVerificationRecord(record);
      },
      validateTargetVerificationHistory(records) {
        calls.push(`${tag}:history-verify:${this === dependencySet ? "self" : "other"}`);
        return validateTargetVerificationHistory(records);
      }
    };

    return dependencySet;
  }

  const calls = [];
  const deps = createTaggedDeps("A", calls);
  const validatorA = createConfirmedServerSnapshotValidator(deps);
  const depsB = createFactoryDependencies();
  const validatorB = createConfirmedServerSnapshotValidator(depsB);

  const resultA = validatorA.evaluateConfirmedServerSnapshotReferences(evaluationInput());
  const resultB = validatorB.evaluateConfirmedServerSnapshotReferences(evaluationInput());

  assert.strictEqual(resultA.valid, true);
  assert.strictEqual(resultB.valid, true);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((entry) => entry.indexOf(":self") !== -1));
});

runTest("snapshot validator enforces canonical fields unknowns and array uniqueness", () => {
  const validator = createValidator();
  const badSnapshot = snapshot({
    ownershipRecordIds: ["own-cell-1", "own-cell-1"],
    extra: true
  });
  delete badSnapshot.creatorId;

  const result = validator.validateConfirmedServerSnapshot(badSnapshot);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "creatorId");
  assertError(result, "UNKNOWN_FIELD", "extra");
  assertError(result, "DUPLICATE_ID", "ownershipRecordIds[1]");
});

runTest("snapshot timestamp accepts canonical precision and rejects malformed values", () => {
  const validator = createValidator();

  const noFraction = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00Z" }));
  const oneDigit = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00.1Z" }));
  const twoDigits = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00.12Z" }));
  const threeDigits = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00.123Z" }));
  const badOffset = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00+01:00" }));
  const badPrecision = validator.validateConfirmedServerSnapshot(snapshot({ createdAt: "2026-07-29T21:00:00.1234Z" }));

  assert.strictEqual(noFraction.valid, true);
  assert.strictEqual(oneDigit.valid, true);
  assert.strictEqual(twoDigits.valid, true);
  assert.strictEqual(threeDigits.valid, true);
  assert.strictEqual(badOffset.valid, false);
  assert.strictEqual(badPrecision.valid, false);
  assertError(badOffset, "INVALID_TIMESTAMP", "createdAt");
  assertError(badPrecision, "INVALID_TIMESTAMP", "createdAt");
});

runTest("snapshot history rejects duplicate IDs invalid ordering and forks", () => {
  const validator = createValidator();

  const duplicate = validator.validateConfirmedServerSnapshotHistory([
    snapshot({ snapshotId: "dup" }),
    snapshot({ snapshotId: "dup", createdAt: "2026-07-29T22:00:00Z" })
  ]);

  const badOrdering = validator.validateConfirmedServerSnapshotHistory([
    snapshot({ snapshotId: "earlier", createdAt: "2026-07-29T10:00:00Z" }),
    snapshot({
      snapshotId: "later",
      createdAt: "2026-07-29T09:00:00Z",
      previousConfirmedSnapshotId: "earlier"
    })
  ]);

  const fork = validator.validateConfirmedServerSnapshotHistory([
    snapshot({ snapshotId: "root", createdAt: "2026-07-29T09:00:00Z" }),
    snapshot({ snapshotId: "branch-a", createdAt: "2026-07-29T10:00:00Z", previousConfirmedSnapshotId: "root" }),
    snapshot({ snapshotId: "branch-b", createdAt: "2026-07-29T10:30:00Z", previousConfirmedSnapshotId: "root" })
  ]);

  assert.strictEqual(duplicate.valid, false);
  assert.strictEqual(badOrdering.valid, false);
  assert.strictEqual(fork.valid, false);
  assertError(duplicate, "DUPLICATE_SNAPSHOT_ID", "records[1].snapshotId");
  assertError(badOrdering, "INVALID_PREVIOUS_SNAPSHOT", "records[1].previousConfirmedSnapshotId");
  assertError(fork, "SNAPSHOT_CHAIN_FORK", "records[0].snapshotId");
});

runTest("history cross-record logic excludes individually invalid records", () => {
  const validator = createValidator();
  const invalid = snapshot({
    snapshotId: "bad-time",
    createdAt: "2026-02-30T10:00:00Z"
  });

  const result = validator.validateConfirmedServerSnapshotHistory([
    invalid,
    snapshot({
      snapshotId: "next",
      createdAt: "2026-07-29T12:00:00Z",
      previousConfirmedSnapshotId: "bad-time"
    })
  ]);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_TIMESTAMP", "records[0].createdAt");
  assertError(result, "INVALID_PREVIOUS_SNAPSHOT", "records[1].previousConfirmedSnapshotId");
  assert.ok(!result.errors.some((error) => error.code === "SNAPSHOT_CHAIN_CYCLE"));
});

runTest("history grouping is collision-safe for null-character tuple identities", () => {
  const validator = createValidator();
  const result = validator.validateConfirmedServerSnapshotHistory([
    snapshot({
      snapshotId: "group-a",
      serverId: "x",
      seasonId: "a\u0000b",
      createdAt: "2026-07-29T09:00:00Z"
    }),
    snapshot({
      snapshotId: "group-b",
      serverId: "x\u0000a",
      seasonId: "b",
      createdAt: "2026-07-29T09:30:00Z"
    })
  ]);

  assert.strictEqual(result.valid, true);
});

runTest("reference evaluation resolves valid cell and structure selections", () => {
  const validator = createValidator();
  const result = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput());

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.completeCoverage, true);
  assert.strictEqual(result.projection.qualifiesAsFullMapConfirmation, true);
  assert.strictEqual(result.projection.mapDataConfirmedThrough, "2026-07-29T00:30:00Z");
  assert.strictEqual(result.projection.observationWindowStartedAt, "2026-07-29T00:30:00Z");
  assert.strictEqual(result.projection.observationWindowEndedAt, "2026-07-29T20:30:00Z");
  assert.strictEqual(result.projection.fullConfirmationAt, "2026-07-29T00:30:00Z");
});

runTest("reference evaluation rejects scope and ownership mismatch", () => {
  const validator = createValidator();

  const mismatch = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    territoryOwnershipRecords: [
      territoryOwnership({ serverId: "server-x" })
    ]
  }));

  const verificationMismatch = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    verificationRecords: [
      verificationRecord({ verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "wrong-id" } }),
      structureVerificationRecord()
    ]
  }));

  assert.strictEqual(mismatch.valid, false);
  assert.strictEqual(verificationMismatch.valid, false);
  assertError(mismatch, "SNAPSHOT_REFERENCE_SCOPE_MISMATCH", "snapshot.ownershipRecordIds[0]");
  assertError(verificationMismatch, "OWNERSHIP_VERIFICATION_MISMATCH", "snapshot.verificationRecordIds[0]");
});

runTest("latest verification selection is required for required targets", () => {
  const validator = createValidator();

  const older = verificationRecord({
    verificationId: "verify-cell-older",
    observedAt: "2026-07-29T00:20:00Z",
    confirmedAt: "2026-07-29T00:25:00Z"
  });

  const newer = verificationRecord({
    verificationId: "verify-cell-newer",
    observedAt: "2026-07-29T01:20:00Z",
    confirmedAt: "2026-07-29T01:25:00Z"
  });

  const result = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    snapshot: snapshot({ verificationRecordIds: ["verify-cell-older", "verify-structure-1"] }),
    verificationRecords: [older, newer, structureVerificationRecord()]
  }));

  assert.strictEqual(result.valid, false);
  assertError(result, "NOT_LATEST_SELECTED_VERIFICATION", "snapshot.verificationRecordIds");
});

runTest("incomplete coverage stays valid but non-qualifying with null window fields", () => {
  const validator = createValidator();
  const result = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    snapshot: snapshot({
      structureOwnershipRecordIds: [],
      verificationRecordIds: ["verify-cell-1"]
    })
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.completeCoverage, false);
  assert.strictEqual(result.projection.qualifiesAsFullMapConfirmation, false);
  assert.strictEqual(result.projection.mapDataConfirmedThrough, null);
  assert.strictEqual(result.projection.observationWindowStartedAt, null);
  assert.strictEqual(result.projection.observationWindowEndedAt, null);
  assert.strictEqual(result.projection.fullConfirmationAt, null);
});

runTest("exact 24-hour span qualifies and over-24-hour span does not", () => {
  const validator = createValidator();

  const exact = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    snapshot: snapshot({ createdAt: "2026-07-30T01:00:00Z" }),
    verificationRecords: [
      verificationRecord({ observedAt: "2026-07-29T00:30:00Z", confirmedAt: "2026-07-29T00:40:00Z" }),
      structureVerificationRecord({ observedAt: "2026-07-30T00:30:00Z", confirmedAt: "2026-07-30T00:40:00Z" })
    ]
  }));

  const over = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    snapshot: snapshot({ createdAt: "2026-07-30T01:00:00Z" }),
    verificationRecords: [
      verificationRecord({ observedAt: "2026-07-29T00:30:00Z", confirmedAt: "2026-07-29T00:40:00Z" }),
      structureVerificationRecord({ observedAt: "2026-07-30T00:30:01Z", confirmedAt: "2026-07-30T00:40:00Z" })
    ]
  }));

  assert.strictEqual(exact.valid, true);
  assert.strictEqual(exact.projection.qualifiesAsFullMapConfirmation, true);
  assert.strictEqual(exact.projection.fullConfirmationAt, "2026-07-29T00:30:00Z");

  assert.strictEqual(over.valid, true);
  assert.strictEqual(over.projection.completeCoverage, true);
  assert.strictEqual(over.projection.qualifiesAsFullMapConfirmation, false);
  assert.strictEqual(over.projection.mapDataConfirmedThrough, "2026-07-29T00:30:00Z");
  assert.strictEqual(over.projection.observationWindowStartedAt, null);
  assert.strictEqual(over.projection.observationWindowEndedAt, null);
  assert.strictEqual(over.projection.fullConfirmationAt, null);
});

runTest("carried-forward mixed timestamps preserve oldest selected observedAt floor", () => {
  const validator = createValidator();

  const oldCarriedForward = verificationRecord({
    verificationId: "verify-cell-old",
    observedAt: "2026-07-27T06:00:00Z",
    confirmedAt: "2026-07-27T06:05:00Z"
  });

  const currentCarriedForward = verificationRecord({
    verificationId: "verify-cell-current",
    observedAt: "2026-07-29T06:00:00Z",
    confirmedAt: "2026-07-29T06:05:00Z"
  });

  const result = validator.evaluateConfirmedServerSnapshotReferences(evaluationInput({
    snapshot: snapshot({ verificationRecordIds: ["verify-cell-current", "verify-structure-1"] }),
    verificationRecords: [oldCarriedForward, currentCarriedForward, structureVerificationRecord()]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.completeCoverage, true);
  assert.strictEqual(result.projection.mapDataConfirmedThrough, "2026-07-29T06:00:00Z");
});

runTest("determinism and input immutability", () => {
  const validator = createValidator();
  const input = evaluationInput();
  const before = clone(input);

  const first = validator.evaluateConfirmedServerSnapshotReferences(input);
  const second = validator.evaluateConfirmedServerSnapshotReferences(input);

  first.errors.push({ code: "mutated", path: "x", message: "x" });

  assert.deepStrictEqual(input, before);
  assert.strictEqual(second.errors.length, 0);
  assert.deepStrictEqual(second.warnings, []);
});

runTest("CommonJS and browser-global exports", () => {
  assert.strictEqual(typeof createConfirmedServerSnapshotValidator, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "confirmed-server-snapshot-validator.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createConfirmedServerSnapshotValidator, "function");
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
