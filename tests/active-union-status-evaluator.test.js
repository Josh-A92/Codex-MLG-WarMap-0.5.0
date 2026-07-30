const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createActiveUnionStatusEvaluator,
  ActiveUnionStatusEvaluatorError
} = require("../src/services/active-union-status-evaluator.js");
const {
  validateActiveUnionStatus
} = require("../src/services/active-union-status-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function identity(overrides) {
  return Object.assign({
    statusId: "status-eval-1",
    unionId: "union-1",
    serverId: "server-1",
    seasonId: "season-1",
    evaluatedAt: "2026-07-20T00:00:00Z"
  }, overrides || {});
}

function currentNoPresence(overrides) {
  return Object.assign({
    statusId: "status-current-1",
    unionId: "union-1",
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

function currentConfirmedOwnership(overrides) {
  return Object.assign({
    statusId: "status-current-2",
    unionId: "union-1",
    serverId: "server-1",
    seasonId: "season-1",
    activityState: "active",
    reviewState: "confirmed",
    derivedFrom: "confirmed_ownership",
    firstConfirmedPresenceAt: "2026-07-10T00:00:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-15T00:00:00Z",
    zeroTerritorySince: null,
    verificationWindowStartedAt: null,
    verificationThrough: "2026-07-15T00:00:00Z",
    verificationSnapshotIds: ["snapshot-pos-2"],
    effectiveFrom: "2026-07-15T00:00:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function currentZeroWindow(overrides) {
  return Object.assign({
    statusId: "status-current-3",
    unionId: "union-1",
    serverId: "server-1",
    seasonId: "season-1",
    activityState: "active",
    reviewState: "confirmed",
    derivedFrom: "verified_zero_territory_period",
    firstConfirmedPresenceAt: "2026-07-01T00:00:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-10T00:00:00Z",
    zeroTerritorySince: "2026-07-11T00:00:00Z",
    verificationWindowStartedAt: "2026-07-11T00:00:00Z",
    verificationThrough: "2026-07-12T00:00:00Z",
    verificationSnapshotIds: ["snapshot-zero-1", "snapshot-zero-2"],
    effectiveFrom: "2026-07-11T00:00:00Z",
    effectiveTo: null,
    supersededBy: null
  }, overrides || {});
}

function presenceFact(overrides) {
  return Object.assign({
    factId: "fact-1",
    unionId: "union-1",
    serverId: "server-1",
    seasonId: "season-1",
    observedAt: "2026-07-10T00:00:00Z",
    ownershipRecordId: "own-1",
    snapshotId: "snapshot-pos-1"
  }, overrides || {});
}

function qualifyingConfirmation(overrides) {
  return Object.assign({
    snapshotId: "snapshot-q-1",
    unionId: "union-1",
    serverId: "server-1",
    seasonId: "season-1",
    fullConfirmationAt: "2026-07-11T00:00:00Z",
    ownedTerritoryCount: 0
  }, overrides || {});
}

function createEvaluator(validator) {
  return createActiveUnionStatusEvaluator({
    validateActiveUnionStatus: validator || validateActiveUnionStatus
  });
}

function evaluateInput(overrides) {
  return Object.assign({
    identity: identity(),
    currentStatus: null,
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  }, overrides || {});
}

function assertError(result, code, path) {
  assert.ok(
    result.errors.some((error) => error.code === code && (!path || error.path === path)),
    `Expected ${code}${path ? ` at ${path}` : ""}; got ${JSON.stringify(result.errors)}`
  );
}

runTest("factory validation strict options null-prototype options and validator this", () => {
  assert.throws(() => createActiveUnionStatusEvaluator({}), (error) => {
    assert.ok(error instanceof ActiveUnionStatusEvaluatorError);
    assert.strictEqual(error.code, "invalid_factory");
    return true;
  });

  assert.throws(() => createActiveUnionStatusEvaluator({
    validateActiveUnionStatus,
    extra: true
  }), /does not recognize option/);

  let observedThis = null;
  const options = Object.create(null);
  options.validateActiveUnionStatus = function validateWithThis(record) {
    observedThis = this;
    return validateActiveUnionStatus(record);
  };

  const evaluator = createActiveUnionStatusEvaluator(options);
  const result = evaluator.evaluate(evaluateInput());

  assert.strictEqual(result.valid, true);
  assert.strictEqual(observedThis, options);
});

runTest("malformed input returns errors without throwing", () => {
  const evaluator = createEvaluator();
  const badValues = [undefined, null, [], new Date(), new Map(), new Set(), function bad() {}, class Bad {}];

  badValues.forEach((value) => {
    assert.doesNotThrow(() => evaluator.evaluate(value));
    const result = evaluator.evaluate(value);
    assert.strictEqual(result.valid, false);
    assertError(result, "invalid_input", "input");
    assert.strictEqual(result.evaluation, null);
  });
});

runTest("unknown fields and scope mismatch are rejected", () => {
  const evaluator = createEvaluator();
  const withUnknown = evaluator.evaluate(evaluateInput({ extra: true }));
  const withScopeMismatch = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ serverId: "server-x" })]
  }));

  assert.strictEqual(withUnknown.valid, false);
  assert.strictEqual(withScopeMismatch.valid, false);
  assertError(withUnknown, "invalid_input", "input.extra");
  assertError(withScopeMismatch, "invalid_input", "input.confirmedPresenceFacts[0]");
});

runTest("timestamp validity and parsed-time equivalence", () => {
  const evaluator = createEvaluator();

  const badTime = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00+01:00" })]
  }));

  const noReplacementEquivalent = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-20T00:00:00Z", statusId: "unused-status" }),
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-10T00:00:00.1Z",
      mostRecentConfirmedPresenceAt: "2026-07-10T00:00:00.1Z",
      verificationThrough: "2026-07-10T00:00:00.1Z",
      verificationSnapshotIds: ["snapshot-pos-1"]
    }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00.100Z" })]
  }));

  assert.strictEqual(badTime.valid, false);
  assertError(badTime, "invalid_input", "input.confirmedPresenceFacts[0].observedAt");
  assert.strictEqual(noReplacementEquivalent.valid, true);
  assert.strictEqual(noReplacementEquivalent.evaluation.requiresReplacement, false);
});

runTest("input immutability and safe outputs", () => {
  const evaluator = createEvaluator();
  const input = evaluateInput({
    confirmedPresenceFacts: [presenceFact()]
  });
  const before = clone(input);

  const result = evaluator.evaluate(input);
  result.evaluation.canonicalStatus.activityState = "mutated";
  result.evaluation.countedConfirmationIds.push("x");

  assert.deepStrictEqual(input, before);
  assert.strictEqual(evaluator.evaluate(input).evaluation.canonicalStatus.activityState, "active");
});

runTest("deterministic ordering is input-order independent", () => {
  const evaluator = createEvaluator();
  const inputA = evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-b", ownershipRecordId: "own-b", observedAt: "2026-07-12T00:00:00Z", snapshotId: "snapshot-pos-b" }),
      presenceFact({ factId: "fact-a", ownershipRecordId: "own-a", observedAt: "2026-07-10T00:00:00Z", snapshotId: "snapshot-pos-a" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "snapshot-zero-2", fullConfirmationAt: "2026-07-15T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "snapshot-zero-1", fullConfirmationAt: "2026-07-13T00:00:00Z" })
    ]
  });

  const inputB = evaluateInput({
    confirmedPresenceFacts: inputA.confirmedPresenceFacts.slice().reverse(),
    qualifyingFullMapConfirmations: inputA.qualifyingFullMapConfirmations.slice().reverse()
  });

  assert.deepStrictEqual(evaluator.evaluate(inputA), evaluator.evaluate(inputB));
});

runTest("no-presence first status and unchanged no-op", () => {
  const evaluator = createEvaluator();

  const first = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-20T00:00:00Z" })
  }));

  const unchanged = evaluator.evaluate(evaluateInput({
    identity: identity({ statusId: "unused-status" }),
    currentStatus: currentNoPresence({ effectiveFrom: "2026-07-01T00:00:00Z" })
  }));

  assert.strictEqual(first.valid, true);
  assert.strictEqual(first.evaluation.canonicalStatus.activityState, "inactive");
  assert.strictEqual(first.evaluation.canonicalStatus.derivedFrom, "known_relation_without_confirmed_ownership");
  assert.strictEqual(first.evaluation.canonicalStatus.effectiveFrom, "2026-07-20T00:00:00Z");
  assert.strictEqual(first.evaluation.replacementEffectiveFrom, "2026-07-20T00:00:00Z");
  assert.strictEqual(first.evaluation.verificationHealth, "unverified");

  assert.strictEqual(unchanged.valid, true);
  assert.strictEqual(unchanged.evaluation.requiresReplacement, false);
  assert.strictEqual(unchanged.evaluation.replacementEffectiveFrom, null);
  assert.strictEqual(unchanged.evaluation.canonicalStatus.effectiveFrom, "2026-07-01T00:00:00Z");
});

runTest("partial confirmed presence establishes confirmed ownership", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact()]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.canonicalStatus.activityState, "active");
  assert.strictEqual(result.evaluation.canonicalStatus.derivedFrom, "confirmed_ownership");
  assert.deepStrictEqual(result.evaluation.canonicalStatus.verificationSnapshotIds, ["snapshot-pos-1"]);
  assert.strictEqual(result.evaluation.replacementEffectiveFrom, "2026-07-10T00:00:00Z");
});

runTest("positive full-map presence is treated as confirmed presence", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({
        snapshotId: "snapshot-pos-q",
        fullConfirmationAt: "2026-07-12T00:00:00Z",
        ownedTerritoryCount: 3
      })
    ]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.canonicalStatus.activityState, "active");
  assert.strictEqual(result.evaluation.canonicalStatus.mostRecentConfirmedPresenceAt, "2026-07-12T00:00:00Z");
  assert.deepStrictEqual(result.evaluation.canonicalStatus.verificationSnapshotIds, ["snapshot-pos-q"]);
});

runTest("duplicate positive-event collapse and contradictory duplicate rejection", () => {
  const evaluator = createEvaluator();

  const collapsed = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-1", ownershipRecordId: "own-1", snapshotId: "snapshot-collapse", observedAt: "2026-07-10T00:00:00Z" }),
      presenceFact({ factId: "fact-2", ownershipRecordId: "own-2", snapshotId: "snapshot-collapse", observedAt: "2026-07-10T00:00:00Z" })
    ]
  }));

  const contradictory = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ snapshotId: "snapshot-contradict", observedAt: "2026-07-10T00:00:00Z" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "snapshot-contradict", fullConfirmationAt: "2026-07-10T00:00:00Z", ownedTerritoryCount: 0 })
    ]
  }));

  assert.strictEqual(collapsed.valid, true);
  assert.deepStrictEqual(collapsed.evaluation.canonicalStatus.verificationSnapshotIds, ["snapshot-collapse"]);

  assert.strictEqual(contradictory.valid, false);
  assertError(contradictory, "invalid_fact_set", "input.qualifyingFullMapConfirmations[0].snapshotId");
});

runTest("same-instant positive and zero contradictions fail even with different snapshot IDs", () => {
  const evaluator = createEvaluator();

  const differentSnapshots = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ snapshotId: "snapshot-positive", observedAt: "2026-07-10T00:00:00Z" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "snapshot-zero", fullConfirmationAt: "2026-07-10T00:00:00Z", ownedTerritoryCount: 0 })
    ]
  }));

  const equivalentFractional = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ snapshotId: "snapshot-positive-2", observedAt: "2026-07-10T00:00:00.1Z" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "snapshot-zero-2", fullConfirmationAt: "2026-07-10T00:00:00.100Z", ownedTerritoryCount: 0 })
    ]
  }));

  const differentTimes = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ snapshotId: "snapshot-positive-3", observedAt: "2026-07-10T00:00:00Z" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "snapshot-zero-3", fullConfirmationAt: "2026-07-11T00:00:00Z", ownedTerritoryCount: 0 })
    ]
  }));

  assert.strictEqual(differentSnapshots.valid, false);
  assert.strictEqual(differentSnapshots.evaluation, null);
  assertError(differentSnapshots, "invalid_fact_set", "input.qualifyingFullMapConfirmations[0].fullConfirmationAt");

  assert.strictEqual(equivalentFractional.valid, false);
  assert.strictEqual(equivalentFractional.evaluation, null);
  assertError(equivalentFractional, "invalid_fact_set", "input.qualifyingFullMapConfirmations[0].fullConfirmationAt");

  assert.strictEqual(differentTimes.valid, true);
});

runTest("same-instant contradictions are not suppressed by currentStatus no-op equality", () => {
  const evaluator = createEvaluator();

  const sameInstantNoOp = evaluator.evaluate(evaluateInput({
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-10T00:00:00Z",
      mostRecentConfirmedPresenceAt: "2026-07-10T00:00:00Z",
      verificationThrough: "2026-07-10T00:00:00Z",
      verificationSnapshotIds: ["snapshot-positive"]
    }),
    confirmedPresenceFacts: [
      presenceFact({
        factId: "fact-positive",
        ownershipRecordId: "own-positive",
        snapshotId: "snapshot-positive",
        observedAt: "2026-07-10T00:00:00Z"
      })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({
        snapshotId: "snapshot-zero-other",
        fullConfirmationAt: "2026-07-10T00:00:00Z",
        ownedTerritoryCount: 0
      })
    ]
  }));

  const fractionalNoOp = evaluator.evaluate(evaluateInput({
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-10T00:00:00.1Z",
      mostRecentConfirmedPresenceAt: "2026-07-10T00:00:00.1Z",
      verificationThrough: "2026-07-10T00:00:00.1Z",
      verificationSnapshotIds: ["snapshot-positive-frac"]
    }),
    confirmedPresenceFacts: [
      presenceFact({
        factId: "fact-positive-frac",
        ownershipRecordId: "own-positive-frac",
        snapshotId: "snapshot-positive-frac",
        observedAt: "2026-07-10T00:00:00.100Z"
      })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({
        snapshotId: "snapshot-zero-frac",
        fullConfirmationAt: "2026-07-10T00:00:00.1Z",
        ownedTerritoryCount: 0
      })
    ]
  }));

  assert.strictEqual(sameInstantNoOp.valid, false);
  assert.strictEqual(sameInstantNoOp.evaluation, null);
  assertError(sameInstantNoOp, "invalid_fact_set", "input.qualifyingFullMapConfirmations[0].fullConfirmationAt");

  assert.strictEqual(fractionalNoOp.valid, false);
  assert.strictEqual(fractionalNoOp.evaluation, null);
  assertError(fractionalNoOp, "invalid_fact_set", "input.qualifyingFullMapConfirmations[0].fullConfirmationAt");
});

runTest("server and season isolation through exact scope validation", () => {
  const evaluator = createEvaluator();
  const serverMismatch = evaluator.evaluate(evaluateInput({
    qualifyingFullMapConfirmations: [qualifyingConfirmation({ serverId: "server-x" })]
  }));
  const seasonMismatch = evaluator.evaluate(evaluateInput({
    qualifyingFullMapConfirmations: [qualifyingConfirmation({ seasonId: "season-x" })]
  }));

  assert.strictEqual(serverMismatch.valid, false);
  assert.strictEqual(seasonMismatch.valid, false);
  assertError(serverMismatch, "invalid_input", "input.qualifyingFullMapConfirmations[0]");
  assertError(seasonMismatch, "invalid_input", "input.qualifyingFullMapConfirmations[0]");
});

runTest("zero window start under-24h ignored exact-24h count and exact-5day continuation", () => {
  const evaluator = createEvaluator();

  const started = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" })
    ]
  }));

  const ignored = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-2", fullConfirmationAt: "2026-07-11T12:00:00Z" })
    ]
  }));

  const exact24 = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-2", fullConfirmationAt: "2026-07-12T00:00:00Z" })
    ]
  }));

  const exact5d = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-2", fullConfirmationAt: "2026-07-16T00:00:00Z" })
    ]
  }));

  assert.strictEqual(started.valid, true);
  assert.strictEqual(started.evaluation.canonicalStatus.derivedFrom, "verified_zero_territory_period");
  assert.deepStrictEqual(started.evaluation.countedConfirmationIds, ["zero-1"]);
  assert.strictEqual(started.evaluation.canonicalStatus.zeroTerritorySince, "2026-07-11T00:00:00Z");

  assert.strictEqual(ignored.valid, true);
  assert.deepStrictEqual(ignored.evaluation.countedConfirmationIds, ["zero-1"]);
  assert.deepStrictEqual(ignored.evaluation.ignoredConfirmationIds, ["zero-2"]);
  assert.strictEqual(ignored.evaluation.canonicalStatus.verificationThrough, "2026-07-11T12:00:00Z");

  assert.strictEqual(exact24.valid, true);
  assert.deepStrictEqual(exact24.evaluation.countedConfirmationIds, ["zero-1", "zero-2"]);

  assert.strictEqual(exact5d.valid, true);
  assert.deepStrictEqual(exact5d.evaluation.countedConfirmationIds, ["zero-1", "zero-2"]);
  assert.strictEqual(exact5d.evaluation.windowRestartCount, 0);
});

runTest("over-5day restart and original zeroTerritorySince retained across restart", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-2", fullConfirmationAt: "2026-07-16T00:00:01Z" })
    ]
  }));

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.evaluation.countedConfirmationIds, ["zero-2"]);
  assert.strictEqual(result.evaluation.windowRestartCount, 1);
  assert.strictEqual(result.evaluation.canonicalStatus.zeroTerritorySince, "2026-07-11T00:00:00Z");
  assert.strictEqual(result.evaluation.canonicalStatus.verificationWindowStartedAt, "2026-07-16T00:00:01Z");
});

runTest("five confirmations without 14 days remains active and exact 14-day completion becomes inactive", () => {
  const evaluator = createEvaluator();

  const active = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-01T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "z1", fullConfirmationAt: "2026-07-02T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z2", fullConfirmationAt: "2026-07-03T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z3", fullConfirmationAt: "2026-07-04T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z4", fullConfirmationAt: "2026-07-05T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z5", fullConfirmationAt: "2026-07-06T00:00:00Z" })
    ]
  }));

  const inactive = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-20T00:00:00Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-01T00:00:00Z" })],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "z1", fullConfirmationAt: "2026-07-02T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z2", fullConfirmationAt: "2026-07-05T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z3", fullConfirmationAt: "2026-07-08T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z4", fullConfirmationAt: "2026-07-11T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "z5", fullConfirmationAt: "2026-07-16T00:00:00Z" })
    ]
  }));

  assert.strictEqual(active.valid, true);
  assert.strictEqual(active.evaluation.canonicalStatus.activityState, "active");

  assert.strictEqual(inactive.valid, true);
  assert.strictEqual(inactive.evaluation.canonicalStatus.activityState, "inactive");
  assert.strictEqual(inactive.evaluation.replacementEffectiveFrom, "2026-07-16T00:00:00Z");
});

runTest("recapture reset and later new window", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [
      presenceFact({ factId: "p1", ownershipRecordId: "own-1", observedAt: "2026-07-01T00:00:00Z", snapshotId: "snapshot-pos-1" }),
      presenceFact({ factId: "p2", ownershipRecordId: "own-2", observedAt: "2026-07-06T10:00:00Z", snapshotId: "snapshot-pos-2" })
    ],
    qualifyingFullMapConfirmations: [
      qualifyingConfirmation({ snapshotId: "zero-a", fullConfirmationAt: "2026-07-02T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-b", fullConfirmationAt: "2026-07-05T00:00:00Z" }),
      qualifyingConfirmation({ snapshotId: "zero-c", fullConfirmationAt: "2026-07-08T00:00:00Z" })
    ]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.canonicalStatus.mostRecentConfirmedPresenceAt, "2026-07-06T10:00:00Z");
  assert.strictEqual(result.evaluation.canonicalStatus.zeroTerritorySince, "2026-07-08T00:00:00Z");
  assert.deepStrictEqual(result.evaluation.countedConfirmationIds, ["zero-c"]);
  assert.strictEqual(result.evaluation.windowRestartCount, 0);
});

runTest("verification health unverified current monitoring and stale", () => {
  const evaluator = createEvaluator();

  const unverified = evaluator.evaluate(evaluateInput());
  const current = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-12T00:00:00Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })]
  }));
  const monitoring = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-12T12:00:00Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })],
    qualifyingFullMapConfirmations: [qualifyingConfirmation({ snapshotId: "zero-1", fullConfirmationAt: "2026-07-11T00:00:00Z" })]
  }));
  const stale = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-20T00:00:01Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-10T00:00:00Z" })]
  }));

  assert.strictEqual(unverified.evaluation.verificationHealth, "unverified");
  assert.strictEqual(current.evaluation.verificationHealth, "current");
  assert.strictEqual(monitoring.evaluation.verificationHealth, "monitoring");
  assert.strictEqual(stale.evaluation.verificationHealth, "stale");
});

runTest("future verificationThrough is rejected", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    identity: identity({ evaluatedAt: "2026-07-10T00:00:00Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-11T00:00:00Z" })]
  }));

  assert.strictEqual(result.valid, false);
  assertError(result, "invalid_input", "input.identity.evaluatedAt");
});

runTest("factual equality ignores status and audit fields", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    identity: identity({ statusId: "new-status-id" }),
    currentStatus: currentConfirmedOwnership({
      statusId: "old-status-id",
      effectiveFrom: "2026-07-01T00:00:00Z"
    }),
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-1", ownershipRecordId: "own-1", observedAt: "2026-07-10T00:00:00Z", snapshotId: "snapshot-pos-1" }),
      presenceFact({ factId: "fact-2", ownershipRecordId: "own-2", observedAt: "2026-07-15T00:00:00Z", snapshotId: "snapshot-pos-2" })
    ]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.requiresReplacement, false);
  assert.strictEqual(result.evaluation.canonicalStatus.statusId, "old-status-id");
});

runTest("late state-changing evidence is rejected while unchanged older evidence is a no-op", () => {
  const evaluator = createEvaluator();

  const rejected = evaluator.evaluate(evaluateInput({
    currentStatus: currentNoPresence({ effectiveFrom: "2026-07-10T00:00:00Z" }),
    confirmedPresenceFacts: [presenceFact({ observedAt: "2026-07-09T00:00:00Z" })]
  }));

  const noop = evaluator.evaluate(evaluateInput({
    currentStatus: currentNoPresence({ effectiveFrom: "2026-07-10T00:00:00Z" }),
    identity: identity({ evaluatedAt: "2026-07-30T00:00:00Z" })
  }));

  assert.strictEqual(rejected.valid, false);
  assertError(rejected, "invalid_fact_set", "input.currentStatus.effectiveFrom");

  assert.strictEqual(noop.valid, true);
  assert.strictEqual(noop.evaluation.requiresReplacement, false);
});

runTest("newly discovered earlier first presence is rejected and equivalent existing first presence remains a no-op", () => {
  const evaluator = createEvaluator();

  const rejected = evaluator.evaluate(evaluateInput({
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-15T00:00:00Z",
      mostRecentConfirmedPresenceAt: "2026-07-15T00:00:00Z",
      verificationThrough: "2026-07-15T00:00:00Z",
      verificationSnapshotIds: ["snapshot-pos-15"],
      effectiveFrom: "2026-07-15T00:00:00Z"
    }),
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-old", ownershipRecordId: "own-old", observedAt: "2026-07-01T00:00:00Z", snapshotId: "snapshot-pos-01" }),
      presenceFact({ factId: "fact-current", ownershipRecordId: "own-current", observedAt: "2026-07-15T00:00:00Z", snapshotId: "snapshot-pos-15" })
    ]
  }));

  const noOpEquivalent = evaluator.evaluate(evaluateInput({
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-15T00:00:00.1Z",
      mostRecentConfirmedPresenceAt: "2026-07-15T00:00:00.1Z",
      verificationThrough: "2026-07-15T00:00:00.1Z",
      verificationSnapshotIds: ["snapshot-pos-15"]
    }),
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-current", ownershipRecordId: "own-current", observedAt: "2026-07-15T00:00:00.100Z", snapshotId: "snapshot-pos-15" })
    ]
  }));

  assert.strictEqual(rejected.valid, false);
  assert.strictEqual(rejected.evaluation, null);
  assertError(rejected, "invalid_fact_set", "input.currentStatus.firstConfirmedPresenceAt");

  assert.strictEqual(noOpEquivalent.valid, true);
  assert.strictEqual(noOpEquivalent.evaluation.requiresReplacement, false);
});

runTest("later presence still produces an ordinary replacement", () => {
  const evaluator = createEvaluator();
  const result = evaluator.evaluate(evaluateInput({
    currentStatus: currentConfirmedOwnership({
      firstConfirmedPresenceAt: "2026-07-10T00:00:00Z",
      mostRecentConfirmedPresenceAt: "2026-07-15T00:00:00Z",
      verificationThrough: "2026-07-15T00:00:00Z",
      verificationSnapshotIds: ["snapshot-pos-2"],
      effectiveFrom: "2026-07-15T00:00:00Z"
    }),
    confirmedPresenceFacts: [
      presenceFact({ factId: "fact-1", ownershipRecordId: "own-1", observedAt: "2026-07-10T00:00:00Z", snapshotId: "snapshot-pos-1" }),
      presenceFact({ factId: "fact-2", ownershipRecordId: "own-2", observedAt: "2026-07-15T00:00:00Z", snapshotId: "snapshot-pos-2" }),
      presenceFact({ factId: "fact-3", ownershipRecordId: "own-3", observedAt: "2026-07-18T00:00:00Z", snapshotId: "snapshot-pos-3" })
    ]
  }));

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.requiresReplacement, true);
  assert.strictEqual(result.evaluation.replacementEffectiveFrom, "2026-07-18T00:00:00Z");
  assert.strictEqual(result.evaluation.canonicalStatus.mostRecentConfirmedPresenceAt, "2026-07-18T00:00:00Z");
});

runTest("currentStatus validation and invalid output are surfaced without throwing", () => {
  const evaluator = createEvaluator();
  const badCurrentStatus = evaluator.evaluate(evaluateInput({
    currentStatus: currentNoPresence({ reviewState: "superseded", effectiveTo: "2026-07-02T00:00:00Z", supersededBy: "next" })
  }));

  const invalidOutputEvaluator = createEvaluator(function invalidOutputValidator(record) {
    if (record && record.statusId === "status-eval-1") {
      return {
        valid: false,
        errors: [{ code: "X", path: "statusId", message: "bad" }],
        warnings: []
      };
    }

    return validateActiveUnionStatus(record);
  });

  const invalidOutput = invalidOutputEvaluator.evaluate(evaluateInput({
    confirmedPresenceFacts: [presenceFact()]
  }));

  assert.strictEqual(badCurrentStatus.valid, false);
  assertError(badCurrentStatus, "invalid_current_status", "input.currentStatus");

  assert.strictEqual(invalidOutput.valid, false);
  assertError(invalidOutput, "invalid_output", "evaluation.canonicalStatus");
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createActiveUnionStatusEvaluator, "function");
  assert.strictEqual(typeof ActiveUnionStatusEvaluatorError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-evaluator.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createActiveUnionStatusEvaluator, "function");
  assert.strictEqual(typeof sandbox.globalThis.ActiveUnionStatusEvaluatorError, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "active-union-status-evaluator.js");
  const source = fs.readFileSync(sourcePath, "utf8");

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
