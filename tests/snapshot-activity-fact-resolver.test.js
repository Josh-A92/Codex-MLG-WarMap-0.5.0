const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createSnapshotActivityFactResolver,
  SnapshotActivityFactResolverError
} = require("../src/services/snapshot-activity-fact-resolver.js");
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
const {
  createActiveUnionStatusEvaluator
} = require("../src/services/active-union-status-evaluator.js");
const {
  validateActiveUnionStatus
} = require("../src/services/active-union-status-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function createSnapshotValidator() {
  return createConfirmedServerSnapshotValidator({
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  });
}

function ownership(overrides) {
  return Object.assign({
    ownershipRecordId: "ownership-1",
    serverId: "server-366",
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
    verificationId: "verification-1",
    serverId: "server-366",
    seasonId: "season-1",
    targetRef: { type: "normal_map_cell", row: 1, col: 1 },
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "ownership-1" },
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
    serverId: "server-366",
    seasonId: "season-1",
    createdAt: "2026-07-29T01:00:00Z",
    ownershipRecordIds: ["ownership-1"],
    structureOwnershipRecordIds: [],
    verificationRecordIds: ["verification-1"],
    unionStatusRecordIds: [],
    evidenceIds: [],
    creatorId: "actor-1",
    reviewerId: "reviewer-1",
    completenessRecordIds: [],
    previousConfirmedSnapshotId: null
  }, overrides || {});
}

function input(overrides) {
  return Object.assign({
    unionId: "union-1",
    snapshot: snapshot(),
    territoryOwnershipRecords: [ownership()],
    structureOwnershipRecords: [],
    verificationRecords: [verification()],
    requiredTargetRefs: [{ type: "normal_map_cell", row: 1, col: 1 }]
  }, overrides || {});
}

function factoryOptions(overrides) {
  const snapshotValidator = createSnapshotValidator();
  return Object.assign({
    evaluateConfirmedServerSnapshotReferences: snapshotValidator.evaluateConfirmedServerSnapshotReferences
  }, overrides || {});
}

function createResolver(overrides) {
  return createSnapshotActivityFactResolver(factoryOptions(overrides));
}

function assertError(result, code, pathValue) {
  assert.ok(
    result.errors.some((error) => error.code === code && (!pathValue || error.path === pathValue)),
    `Expected ${code}${pathValue ? ` at ${pathValue}` : ""}; got ${JSON.stringify(result.errors)}`
  );
}

runTest("factory is strict accepts null-prototype options and preserves validator context", () => {
  assert.throws(() => createSnapshotActivityFactResolver({}), (error) => {
    assert.ok(error instanceof SnapshotActivityFactResolverError);
    assert.strictEqual(error.code, "invalid_factory");
    return true;
  });
  assert.throws(() => createSnapshotActivityFactResolver(factoryOptions({ extra: true })), /does not recognize option/);
  assert.throws(() => createSnapshotActivityFactResolver(factoryOptions({
    evaluateConfirmedServerSnapshotReferences: null
  })), /to be a function/);

  const validator = createSnapshotValidator();
  const options = Object.create(null);
  let observedThis = null;
  options.evaluateConfirmedServerSnapshotReferences = function evaluateSnapshot(value) {
    observedThis = this;
    return validator.evaluateConfirmedServerSnapshotReferences(value);
  };
  const result = createSnapshotActivityFactResolver(options).resolve(input());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(observedThis, options);
});

runTest("qualifying owned snapshot produces presence and positive confirmation facts", () => {
  const result = createResolver().resolve(input());
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.facts.confirmedPresenceFacts, [{
    factId: JSON.stringify(["confirmed_presence", "snapshot-1", "ownership-1"]),
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    observedAt: "2026-07-29T00:30:00Z",
    ownershipRecordId: "ownership-1",
    snapshotId: "snapshot-1"
  }]);
  assert.deepStrictEqual(result.facts.qualifyingFullMapConfirmations, [{
    snapshotId: "snapshot-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    fullConfirmationAt: "2026-07-29T00:30:00Z",
    ownedTerritoryCount: 1
  }]);
});

runTest("qualifying zero-territory snapshot produces only a zero confirmation fact", () => {
  const result = createResolver().resolve(input({
    territoryOwnershipRecords: [ownership({
      ownerUnionId: null,
      ownershipState: "unclaimed"
    })]
  }));
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.facts.confirmedPresenceFacts, []);
  assert.strictEqual(result.facts.qualifyingFullMapConfirmations.length, 1);
  assert.strictEqual(result.facts.qualifyingFullMapConfirmations[0].ownedTerritoryCount, 0);
});

runTest("partial positive snapshot proves presence but cannot prove zero or full-map activity", () => {
  const result = createResolver().resolve(input({
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "normal_map_cell", row: 1, col: 2 }
    ]
  }));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.facts.confirmedPresenceFacts.length, 1);
  assert.deepStrictEqual(result.facts.qualifyingFullMapConfirmations, []);
});

runTest("ownership by another union does not produce presence for the evaluated union", () => {
  const result = createResolver().resolve(input({
    unionId: "union-2"
  }));
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.facts.confirmedPresenceFacts, []);
  assert.strictEqual(result.facts.qualifyingFullMapConfirmations[0].ownedTerritoryCount, 0);
});

runTest("multiple selected territories produce deterministic facts and counts", () => {
  const secondOwnership = ownership({
    ownershipRecordId: "ownership-2",
    territoryRef: { type: "normal_map_cell", row: 1, col: 2 }
  });
  const secondVerification = verification({
    verificationId: "verification-2",
    targetRef: { type: "normal_map_cell", row: 1, col: 2 },
    verifiedOwnershipRef: { type: "territory_ownership_record", recordId: "ownership-2" },
    observedAt: "2026-07-29T00:35:00Z",
    confirmedAt: "2026-07-29T00:45:00Z"
  });
  const result = createResolver().resolve(input({
    snapshot: snapshot({
      ownershipRecordIds: ["ownership-2", "ownership-1"],
      verificationRecordIds: ["verification-2", "verification-1"]
    }),
    territoryOwnershipRecords: [ownership(), secondOwnership],
    verificationRecords: [verification(), secondVerification],
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "normal_map_cell", row: 1, col: 2 }
    ]
  }));
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(
    result.facts.confirmedPresenceFacts.map((fact) => fact.ownershipRecordId),
    ["ownership-2", "ownership-1"]
  );
  assert.strictEqual(result.facts.qualifyingFullMapConfirmations[0].ownedTerritoryCount, 2);
});

runTest("missing and mismatched references fail through authoritative snapshot evaluation", () => {
  const resolver = createResolver();
  const missing = resolver.resolve(input({
    snapshot: snapshot({ ownershipRecordIds: ["missing"] })
  }));
  assert.strictEqual(missing.valid, false);
  assertError(missing, "UNRESOLVED_REFERENCE", "input.snapshot.ownershipRecordIds[0]");

  const scopeMismatch = resolver.resolve(input({
    snapshot: snapshot({ serverId: "server-367" })
  }));
  assert.strictEqual(scopeMismatch.valid, false);
  assert.ok(scopeMismatch.errors.some((error) => error.path.includes("ownershipRecordIds")));

  const wrongTargetVerification = verification({
    verificationId: "verification-2",
    targetRef: { type: "normal_map_cell", row: 1, col: 2 },
    observedAt: "2026-07-29T00:31:00Z",
    confirmedAt: "2026-07-29T00:41:00Z"
  });
  const mismatch = resolver.resolve(input({
    snapshot: snapshot({ verificationRecordIds: ["verification-2"] }),
    verificationRecords: [wrongTargetVerification]
  }));
  assert.strictEqual(mismatch.valid, false);
  assert.ok(mismatch.errors.some((error) => error.path.includes("ownershipRecordIds")));
});

runTest("superseded or non-current selected records cannot create facts", () => {
  const result = createResolver().resolve(input({
    territoryOwnershipRecords: [
      ownership({ reviewState: "superseded", supersededBy: "ownership-2" }),
      ownership({
        ownershipRecordId: "ownership-2",
        effectiveAt: "2026-07-30T00:00:00Z",
        reviewedAt: "2026-07-30T00:10:00Z"
      })
    ]
  }));
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_SELECTED_RECORD_STATE", "input.snapshot.ownershipRecordIds[0]");
});

runTest("qualification is resolved internally rather than accepted from caller input", () => {
  const resolver = createResolver();
  const withProjection = Object.assign(input(), {
    projection: {
      qualifiesAsFullMapConfirmation: true,
      fullConfirmationAt: "2026-07-29T00:30:00Z"
    }
  });
  const result = resolver.resolve(withProjection);
  assert.strictEqual(result.valid, false);
  assertError(result, "invalid_input", "input.projection");
});

runTest("malformed candidate input returns errors rather than throwing", () => {
  const resolver = createResolver();
  [null, [], new Date(), "bad"].forEach((value) => {
    assert.doesNotThrow(() => resolver.resolve(value));
    const result = resolver.resolve(value);
    assert.strictEqual(result.valid, false);
    assertError(result, "invalid_input", "input");
  });
  const unknown = resolver.resolve(Object.assign(input(), { extra: true }));
  assert.strictEqual(unknown.valid, false);
  assertError(unknown, "invalid_input", "input.extra");
});

runTest("dependency validation errors are prefixed and malformed dependencies throw stable errors", () => {
  const invalid = createResolver().resolve(input({
    snapshot: snapshot({ createdAt: "bad" })
  }));
  assert.strictEqual(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.path === "input.snapshot.createdAt"));

  const malformed = createResolver({
    evaluateConfirmedServerSnapshotReferences() {
      return {};
    }
  });
  assert.throws(() => malformed.resolve(input()), (error) => {
    assert.ok(error instanceof SnapshotActivityFactResolverError);
    assert.strictEqual(error.code, "invalid_dependency");
    return true;
  });
});

runTest("inputs and returned facts are isolated safe copies", () => {
  const source = input();
  const resolver = createResolver();
  const result = resolver.resolve(source);
  result.facts.confirmedPresenceFacts[0].unionId = "mutated";
  source.territoryOwnershipRecords[0].ownerUnionId = "mutated-input";
  assert.strictEqual(resolver.resolve(input()).facts.confirmedPresenceFacts[0].unionId, "union-1");
});

runTest("resolved facts pass directly into the Active-Status evaluator", () => {
  const resolved = createResolver().resolve(input());
  const evaluator = createActiveUnionStatusEvaluator({ validateActiveUnionStatus });
  const result = evaluator.evaluate({
    identity: {
      statusId: "status-1",
      unionId: "union-1",
      serverId: "server-366",
      seasonId: "season-1",
      evaluatedAt: "2026-07-29T01:00:00Z"
    },
    currentStatus: null,
    confirmedPresenceFacts: resolved.facts.confirmedPresenceFacts,
    qualifyingFullMapConfirmations: resolved.facts.qualifyingFullMapConfirmations
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.evaluation.canonicalStatus.activityState, "active");
  assert.strictEqual(result.evaluation.canonicalStatus.derivedFrom, "confirmed_ownership");
  assert.deepStrictEqual(result.evaluation.canonicalStatus.verificationSnapshotIds, ["snapshot-1"]);
});

runTest("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createSnapshotActivityFactResolver, "function");
  assert.strictEqual(typeof SnapshotActivityFactResolverError, "function");

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "snapshot-activity-fact-resolver.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createSnapshotActivityFactResolver, "function");
  assert.strictEqual(typeof sandbox.globalThis.SnapshotActivityFactResolverError, "function");
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
