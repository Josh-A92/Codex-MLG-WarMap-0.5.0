const assert = require("assert");
const {
  UNION_REGISTRATION_MAP_PATTERNS,
  createUnionRegistrationCoordinator,
  UnionRegistrationCoordinatorError
} = require("../src/services/union-registration-coordinator.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const actor = { actorId: "operator-1" };
const registration = {
  seasonId: "season-1",
  serverId: "366",
  displayName: "Union X",
  tag: "UNX",
  defaultColor: "#8FCEFF",
  mapPattern: "diagonal"
};

function setup(overrides = {}) {
  const calls = [];
  const options = {
    authorizationPolicyService: {
      requireAuthorized(actorValue, capability, scope) {
        calls.push(["authorize", actorValue, capability, scope]);
        return { actorId: actorValue.actorId };
      }
    },
    unionRegistryManagementService: {
      createUnionIdentity(actorValue, identity) {
        calls.push(["createIdentity", actorValue, identity]);
        return { ...identity };
      }
    },
    serverIntelligenceManagementService: {
      addKnownUnion(actorValue, value) {
        calls.push(["addKnownUnion", actorValue, value]);
        return { ...value };
      },
      recordManualNativeAssignment(actorValue, value) {
        calls.push(["nativeAssignment", actorValue, value]);
        return {
          assignmentId: "native-assignment-1",
          ...value,
          reviewState: "confirmed"
        };
      }
    },
    async executeAtomically(operation) {
      calls.push(["transactionStart"]);
      const result = operation();
      calls.push(["transactionComplete"]);
      return result;
    },
    createId(kind) {
      calls.push(["createId", kind]);
      return "union-generated-1";
    }
  };
  Object.assign(options, overrides);
  return {
    calls,
    options,
    coordinator: createUnionRegistrationCoordinator(options)
  };
}

function assertCoordinatorError(error, code, pattern) {
  return error instanceof UnionRegistrationCoordinatorError
    && error.code === code
    && pattern.test(error.message);
}

test("registers global identity, known relation, and native assignment in one transaction", async () => {
  const { calls, coordinator } = setup();
  const result = await coordinator.registerUnion(actor, registration);

  assert.deepStrictEqual(result.identity, {
    unionId: "union-generated-1",
    displayName: "Union X",
    tag: "UNX",
    aliases: [],
    defaultColor: "#8FCEFF",
    presentationMetadata: { mapPattern: "diagonal" },
    registryStatus: "current"
  });
  assert.deepStrictEqual(result.relation, {
    seasonId: "season-1",
    serverId: "366",
    unionId: "union-generated-1"
  });
  assert.strictEqual(result.nativeAssignment.nativeState, "native");

  assert.deepStrictEqual(calls.map((call) => call[0]), [
    "authorize",
    "authorize",
    "createId",
    "transactionStart",
    "createIdentity",
    "addKnownUnion",
    "nativeAssignment",
    "transactionComplete"
  ]);
});

test("authorizes global registry and scoped server access before IDs or transaction work", async () => {
  const { calls, coordinator } = setup();
  await coordinator.registerUnion(actor, registration);

  assert.deepStrictEqual(calls[0], ["authorize", actor, "union_registry.manage", {}]);
  assert.deepStrictEqual(calls[1], [
    "authorize",
    actor,
    "server_state.edit",
    { seasonId: "season-1", serverId: "366" }
  ]);
  assert.strictEqual(calls[2][0], "createId");
  assert.strictEqual(calls[3][0], "transactionStart");
});

test("authorization denial prevents ID generation, transaction, and domain writes", async () => {
  const denied = new Error("denied");
  denied.code = "authorization_denied";
  const { calls, coordinator } = setup({
    authorizationPolicyService: {
      requireAuthorized() {
        calls.push(["authorizeDenied"]);
        throw denied;
      }
    }
  });

  await assert.rejects(
    () => coordinator.registerUnion(actor, registration),
    (error) => error === denied
  );
  assert.deepStrictEqual(calls, [["authorizeDenied"]]);
});

test("scoped authorization denial occurs before ID generation and transaction", async () => {
  const calls = [];
  const denied = new Error("server denied");
  denied.code = "authorization_denied";
  const { coordinator } = setup({
    authorizationPolicyService: {
      requireAuthorized(actorValue, capability, scope) {
        calls.push(["authorize", capability, scope]);
        if (capability === "server_state.edit") throw denied;
        return { actorId: actorValue.actorId };
      }
    },
    createId() {
      calls.push(["createId"]);
      return "should-not-run";
    },
    executeAtomically() {
      calls.push(["transaction"]);
    }
  });

  await assert.rejects(
    () => coordinator.registerUnion(actor, registration),
    (error) => error === denied
  );
  assert.deepStrictEqual(calls, [
    ["authorize", "union_registry.manage", {}],
    ["authorize", "server_state.edit", { seasonId: "season-1", serverId: "366" }]
  ]);
});

test("visible registration input is strict and rejects internal ID or aliases", async () => {
  const { coordinator } = setup();
  await assert.rejects(
    () => coordinator.registerUnion(actor, { ...registration, unionId: "user-id" }),
    (error) => assertCoordinatorError(error, "invalid_input", /input\.unionId/)
  );
  await assert.rejects(
    () => coordinator.registerUnion(actor, { ...registration, aliases: ["Alias"] }),
    (error) => assertCoordinatorError(error, "invalid_input", /input\.aliases/)
  );
});

test("requires every visible field and rejects whitespace-only values", async () => {
  const { coordinator } = setup();
  for (const field of Object.keys(registration)) {
    const missing = { ...registration };
    delete missing[field];
    await assert.rejects(
      () => coordinator.registerUnion(actor, missing),
      (error) => assertCoordinatorError(error, "invalid_input", new RegExp(`input\\.${field}`))
    );
  }
  await assert.rejects(
    () => coordinator.registerUnion(actor, { ...registration, displayName: " " }),
    (error) => assertCoordinatorError(error, "invalid_input", /input\.displayName/)
  );
});

test("validates canonical color and approved map patterns", async () => {
  const { coordinator } = setup();
  await assert.rejects(
    () => coordinator.registerUnion(actor, { ...registration, defaultColor: "blue" }),
    (error) => assertCoordinatorError(error, "invalid_input", /#RRGGBB/)
  );
  await assert.rejects(
    () => coordinator.registerUnion(actor, { ...registration, mapPattern: "waves" }),
    (error) => assertCoordinatorError(error, "invalid_input", /solid, diagonal, crosshatch, or dots/)
  );
  assert.deepStrictEqual(
    UNION_REGISTRATION_MAP_PATTERNS.slice().sort(),
    ["crosshatch", "diagonal", "dots", "solid"]
  );
});

test("invalid generated union ID fails before transaction work", async () => {
  const { calls, coordinator } = setup({ createId() { return " "; } });
  await assert.rejects(
    () => coordinator.registerUnion(actor, registration),
    (error) => assertCoordinatorError(error, "invalid_dependency", /createId\('union'\)/)
  );
  assert.ok(!calls.some((call) => call[0] === "transactionStart"));
});

test("transaction executor must invoke the operation exactly once", async () => {
  const { coordinator: skipped } = setup({
    async executeAtomically() {}
  });
  await assert.rejects(
    () => skipped.registerUnion(actor, registration),
    (error) => assertCoordinatorError(error, "invalid_dependency", /complete its operation/)
  );

  const { coordinator: repeated } = setup({
    async executeAtomically(operation) {
      operation();
      operation();
    }
  });
  await assert.rejects(
    () => repeated.registerUnion(actor, registration),
    (error) => assertCoordinatorError(error, "invalid_dependency", /invoke its operation once/)
  );
});

test("downstream failure propagates and prevents later registration steps", async () => {
  const downstream = new Error("relation failed");
  downstream.code = "relation_failure";
  const { calls, coordinator } = setup({
    serverIntelligenceManagementService: {
      addKnownUnion() {
        calls.push(["addKnownUnion"]);
        throw downstream;
      },
      recordManualNativeAssignment() {
        calls.push(["nativeAssignment"]);
      }
    }
  });

  await assert.rejects(
    () => coordinator.registerUnion(actor, registration),
    (error) => error === downstream
  );
  assert.ok(calls.some((call) => call[0] === "createIdentity"));
  assert.ok(calls.some((call) => call[0] === "addKnownUnion"));
  assert.ok(!calls.some((call) => call[0] === "nativeAssignment"));
});

test("returns safe copies and never mutates registration input", async () => {
  const input = { ...registration };
  const original = { ...input };
  const { coordinator } = setup();
  const result = await coordinator.registerUnion(actor, input);
  result.identity.presentationMetadata.mapPattern = "changed";
  result.relation.serverId = "changed";

  const second = await coordinator.registerUnion(actor, input);
  assert.strictEqual(second.identity.presentationMetadata.mapPattern, "diagonal");
  assert.strictEqual(second.relation.serverId, "366");
  assert.deepStrictEqual(input, original);
});

test("supports class-based dependencies with bound method context", async () => {
  class Authorization {
    constructor() { this.calls = 0; }
    requireAuthorized() { this.calls += 1; return { actorId: "operator-1" }; }
  }
  class Registry {
    constructor() { this.calls = 0; }
    createUnionIdentity(actorValue, identity) {
      this.calls += 1;
      return { ...identity, actorValue };
    }
  }
  class Intelligence {
    constructor() { this.calls = 0; }
    addKnownUnion(actorValue, value) { this.calls += 1; return { ...value, actorValue }; }
    recordManualNativeAssignment(actorValue, value) {
      this.calls += 1;
      return { ...value, actorValue };
    }
  }
  const authorization = new Authorization();
  const registry = new Registry();
  const intelligence = new Intelligence();
  const coordinator = createUnionRegistrationCoordinator({
    authorizationPolicyService: authorization,
    unionRegistryManagementService: registry,
    serverIntelligenceManagementService: intelligence,
    async executeAtomically(operation) { return operation(); },
    createId() { return "union-class"; }
  });

  await coordinator.registerUnion(actor, registration);
  assert.strictEqual(authorization.calls, 2);
  assert.strictEqual(registry.calls, 1);
  assert.strictEqual(intelligence.calls, 2);
});

test("factory options are strict and accept null-prototype option records", () => {
  assert.throws(
    () => createUnionRegistrationCoordinator({}),
    (error) => assertCoordinatorError(error, "invalid_factory", /options\./)
  );
  const { options } = setup();
  assert.throws(
    () => createUnionRegistrationCoordinator({ ...options, extra: true }),
    (error) => assertCoordinatorError(error, "invalid_factory", /options\.extra/)
  );

  const dictionary = Object.assign(Object.create(null), options);
  assert.doesNotThrow(() => createUnionRegistrationCoordinator(dictionary));
});

test("exports CommonJS API", () => {
  assert.strictEqual(typeof createUnionRegistrationCoordinator, "function");
  assert.strictEqual(typeof UnionRegistrationCoordinatorError, "function");
  assert.ok(Object.isFrozen(UNION_REGISTRATION_MAP_PATTERNS));
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
