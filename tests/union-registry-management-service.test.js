const assert = require("assert");
const {
  createUnionRegistryManagementService,
  UnionRegistryManagementServiceError
} = require("../src/services/union-registry-management-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function setup(allowed = true) {
  const calls = [];
  const registry = {
    createUnionIdentity(value) { calls.push(["create", value]); return { ...value }; },
    updateUnionIdentity(id, value) { calls.push(["update", id, value]); return { unionId: id, ...value }; },
    archiveUnionIdentity(id) { calls.push(["archive", id]); return { unionId: id, registryStatus: "archived" }; },
    restoreUnionIdentity(id) { calls.push(["restore", id]); return { unionId: id, registryStatus: "current" }; }
  };
  const authorization = {
    requireAuthorized(actor, capability, scope) {
      calls.push(["authorize", actor.actorId, capability, scope]);
      if (!allowed) {
        const error = new Error("denied");
        error.code = "authorization_denied";
        throw error;
      }
      return { authorized: true };
    }
  };
  return {
    calls,
    service: createUnionRegistryManagementService({
      authorizationPolicyService: authorization,
      unionRegistryService: registry
    })
  };
}

test("all registry commands require global union_registry.manage before mutation", () => {
  const { calls, service } = setup();
  const actor = { actorId: "admin" };
  service.createUnionIdentity(actor, { unionId: "mlg" });
  service.updateUnionIdentity(actor, "mlg", { displayName: "MLG" });
  service.archiveUnionIdentity(actor, "mlg");
  service.restoreUnionIdentity(actor, "mlg");
  assert.deepStrictEqual(calls.map((call) => call[0]), [
    "authorize", "create",
    "authorize", "update",
    "authorize", "archive",
    "authorize", "restore"
  ]);
  calls.filter((call) => call[0] === "authorize").forEach((call) => {
    assert.strictEqual(call[2], "union_registry.manage");
    assert.deepStrictEqual(call[3], {});
  });
});

test("authorization denial prevents every registry mutation", () => {
  const { calls, service } = setup(false);
  const actor = { actorId: "viewer" };
  [
    () => service.createUnionIdentity(actor, { unionId: "mlg" }),
    () => service.updateUnionIdentity(actor, "mlg", {}),
    () => service.archiveUnionIdentity(actor, "mlg"),
    () => service.restoreUnionIdentity(actor, "mlg")
  ].forEach((call) => assert.throws(call, (error) => error.code === "authorization_denied"));
  assert.ok(calls.every((call) => call[0] === "authorize"));
});

test("registry results and errors pass through unchanged", () => {
  const expected = { unionId: "mlg" };
  const registryError = new Error("duplicate");
  const service = createUnionRegistryManagementService({
    authorizationPolicyService: { requireAuthorized() {} },
    unionRegistryService: {
      createUnionIdentity() { return expected; },
      updateUnionIdentity() { throw registryError; },
      archiveUnionIdentity() {},
      restoreUnionIdentity() {}
    }
  });
  assert.strictEqual(service.createUnionIdentity({}, {}), expected);
  assert.throws(() => service.updateUnionIdentity({}, "mlg", {}), (error) => error === registryError);
});

test("factory validates exact interfaces and binds class instances", () => {
  class Authorization {
    constructor() { this.calls = 0; }
    requireAuthorized() { this.calls += 1; }
  }
  class Registry {
    constructor() { this.calls = 0; }
    createUnionIdentity(value) { this.calls += 1; return value; }
    updateUnionIdentity() {}
    archiveUnionIdentity() {}
    restoreUnionIdentity() {}
  }
  const authorization = new Authorization();
  const registry = new Registry();
  const service = createUnionRegistryManagementService({
    authorizationPolicyService: authorization,
    unionRegistryService: registry
  });
  service.createUnionIdentity({}, { unionId: "mlg" });
  assert.strictEqual(authorization.calls, 1);
  assert.strictEqual(registry.calls, 1);

  assert.throws(
    () => createUnionRegistryManagementService({}),
    (error) => error instanceof UnionRegistryManagementServiceError && error.code === "invalid_factory"
  );
  assert.throws(
    () => createUnionRegistryManagementService({
      authorizationPolicyService: { requireAuthorized() {} },
      unionRegistryService: {},
      extra: true
    }),
    (error) => error instanceof UnionRegistryManagementServiceError && error.code === "invalid_factory"
  );
});

let passed = 0;
tests.forEach(({ name, fn }) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
});
console.log(`${passed} tests passed`);
