const assert = require("assert");
const {
  createAtomicOperationExecutor,
  AtomicOperationExecutorError
} = require("../src/services/atomic-operation-executor.js");
const {
  createUnionRegistrationCoordinator
} = require("../src/services/union-registration-coordinator.js");
const {
  createUnionRegistryService
} = require("../src/services/union-registry-service.js");
const {
  createUnionRegistryManagementService
} = require("../src/services/union-registry-management-service.js");
const {
  createUnionServerSeasonRelationService
} = require("../src/services/union-server-season-relation-service.js");
const {
  createNativeUnionAssignmentService
} = require("../src/services/native-union-assignment-service.js");
const {
  validateNativeUnionAssignment,
  validateNativeUnionAssignmentHistory
} = require("../src/services/native-union-assignment-validator.js");
const {
  createServerIntelligenceManagementService
} = require("../src/services/server-intelligence-management-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function participant(initialValue, events, name) {
  return {
    value: initialValue,
    captureTransactionState() {
      events.push(`capture:${name}`);
      return { value: this.value };
    },
    restoreTransactionState(snapshot) {
      events.push(`restore:${name}`);
      this.value = snapshot.value;
    }
  };
}

test("successful operations commit participant mutations and return their result", async () => {
  const events = [];
  const first = participant("before-a", events, "a");
  const second = participant("before-b", events, "b");
  const executor = createAtomicOperationExecutor({ participants: [first, second] });

  const result = await executor.executeAtomically(() => {
    events.push("operation");
    first.value = "after-a";
    second.value = "after-b";
    return { committed: true };
  });

  assert.deepStrictEqual(result, { committed: true });
  assert.strictEqual(first.value, "after-a");
  assert.strictEqual(second.value, "after-b");
  assert.deepStrictEqual(events, ["capture:a", "capture:b", "operation"]);
});

test("failed operations restore every participant in reverse order", async () => {
  const events = [];
  const first = participant("before-a", events, "a");
  const second = participant("before-b", events, "b");
  const executor = createAtomicOperationExecutor({ participants: [first, second] });
  const failure = new Error("operation failed");

  await assert.rejects(
    () => executor.executeAtomically(() => {
      events.push("operation");
      first.value = "after-a";
      second.value = "after-b";
      throw failure;
    }),
    (error) => error === failure
  );

  assert.strictEqual(first.value, "before-a");
  assert.strictEqual(second.value, "before-b");
  assert.deepStrictEqual(events, [
    "capture:a",
    "capture:b",
    "operation",
    "restore:b",
    "restore:a"
  ]);
});

test("asynchronous operation failures roll back before rejection", async () => {
  const events = [];
  const target = participant("before", events, "target");
  const executor = createAtomicOperationExecutor({ participants: [target] });

  await assert.rejects(() => executor.executeAtomically(async () => {
    target.value = "after";
    await Promise.resolve();
    throw new Error("async failure");
  }), /async failure/);

  assert.strictEqual(target.value, "before");
});

test("rollback failure produces a stable error while retaining the operation failure", async () => {
  const operationFailure = new Error("operation failure");
  const rollbackFailure = new Error("rollback failure");
  const executor = createAtomicOperationExecutor({
    participants: [{
      captureTransactionState() { return {}; },
      restoreTransactionState() { throw rollbackFailure; }
    }]
  });

  await assert.rejects(
    () => executor.executeAtomically(() => { throw operationFailure; }),
    (error) => {
      assert.ok(error instanceof AtomicOperationExecutorError);
      assert.strictEqual(error.code, "rollback_failed");
      assert.strictEqual(error.cause, operationFailure);
      assert.deepStrictEqual(error.rollbackErrors, [rollbackFailure]);
      return true;
    }
  );
});

test("operations execute serially in request order", async () => {
  const events = [];
  const target = participant(0, events, "target");
  const executor = createAtomicOperationExecutor({ participants: [target] });
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = executor.executeAtomically(async () => {
    events.push("first:start");
    await gate;
    target.value += 1;
    events.push("first:end");
  });
  const second = executor.executeAtomically(() => {
    events.push("second");
    target.value += 1;
  });

  await Promise.resolve();
  assert.ok(!events.includes("second"));
  releaseFirst();
  await Promise.all([first, second]);
  assert.strictEqual(target.value, 2);
  assert.ok(events.indexOf("first:end") < events.indexOf("second"));
});

test("a failed queued transaction does not block later transactions", async () => {
  const target = participant(0, [], "target");
  const executor = createAtomicOperationExecutor({ participants: [target] });

  const failed = executor.executeAtomically(() => {
    target.value = 5;
    throw new Error("expected");
  });
  const succeeded = executor.executeAtomically(() => {
    target.value += 1;
    return target.value;
  });

  await assert.rejects(() => failed, /expected/);
  assert.strictEqual(await succeeded, 1);
});

test("factory and operation boundaries reject malformed input", async () => {
  assert.throws(
    () => createAtomicOperationExecutor({ participants: [] }),
    (error) => error instanceof AtomicOperationExecutorError && error.code === "invalid_factory"
  );
  assert.throws(
    () => createAtomicOperationExecutor({
      participants: [{ captureTransactionState() {} }]
    }),
    (error) => error instanceof AtomicOperationExecutorError && error.code === "invalid_factory"
  );
  const target = participant(0, [], "target");
  const executor = createAtomicOperationExecutor({ participants: [target] });
  await assert.rejects(
    () => executor.executeAtomically(null),
    (error) => error instanceof AtomicOperationExecutorError && error.code === "invalid_operation"
  );
});

test("class-based participants retain method context", async () => {
  class Participant {
    constructor() { this.value = "before"; }
    captureTransactionState() { return this.value; }
    restoreTransactionState(snapshot) { this.value = snapshot; }
  }
  const target = new Participant();
  const executor = createAtomicOperationExecutor({ participants: [target] });
  await assert.rejects(() => executor.executeAtomically(() => {
    target.value = "after";
    throw new Error("fail");
  }), /fail/);
  assert.strictEqual(target.value, "before");
});

test("failed real union registration leaves no identity, relation, or native assignment", async () => {
  const registry = createUnionRegistryService([]);
  const relations = createUnionServerSeasonRelationService([]);
  const nativeAssignments = createNativeUnionAssignmentService({
    initialAssignments: [],
    validateNativeUnionAssignment,
    validateNativeUnionAssignmentHistory
  });
  const authorizationPolicyService = {
    requireAuthorized(actor) {
      return { authorized: true, actorId: actor.actorId };
    }
  };
  const registryManagement = createUnionRegistryManagementService({
    authorizationPolicyService,
    unionRegistryService: registry
  });
  const expectedFailure = new Error("native write failed after mutation");
  const failingNativeAssignments = {
    addConfirmedManualAssignment(value) {
      nativeAssignments.addConfirmedManualAssignment(value);
      throw expectedFailure;
    }
  };
  let generatedId = 0;
  const serverManagement = createServerIntelligenceManagementService({
    authorizationPolicyService,
    unionRegistryService: registry,
    relationService: relations,
    nativeAssignmentService: failingNativeAssignments,
    combatStrengthObservationService: { addObservation() {} },
    serverObservationService: {
      addObservation() {},
      getObservation() { return null; },
      correctConfirmed() {}
    },
    ownershipRecordService: {
      addConfirmedManualTerritoryRecord() {},
      addConfirmedManualStructureRecord() {}
    },
    clock() { return "2026-07-31T10:00:00.000Z"; },
    createId(kind) {
      generatedId += 1;
      return `${kind}-${generatedId}`;
    }
  });
  const executor = createAtomicOperationExecutor({
    participants: [registry, relations, nativeAssignments]
  });
  const coordinator = createUnionRegistrationCoordinator({
    authorizationPolicyService,
    unionRegistryManagementService: registryManagement,
    serverIntelligenceManagementService: serverManagement,
    relationService: relations,
    executeAtomically: executor.executeAtomically,
    createId() { return "union-rollback"; }
  });

  await assert.rejects(
    () => coordinator.registerUnion(
      { actorId: "operator-1" },
      {
        seasonId: "season-1",
        serverId: "366",
        displayName: "Rollback Union",
        tag: "RBK",
        defaultColor: "#334455",
        mapPattern: "crosshatch"
      }
    ),
    (error) => error === expectedFailure
  );

  assert.deepStrictEqual(registry.listUnionIdentities({ includeArchived: true }), []);
  assert.deepStrictEqual(relations.listRelations(), []);
  assert.deepStrictEqual(nativeAssignments.listAssignments(), []);
});

test("exports CommonJS API", () => {
  assert.strictEqual(typeof createAtomicOperationExecutor, "function");
  assert.strictEqual(typeof AtomicOperationExecutorError, "function");
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
