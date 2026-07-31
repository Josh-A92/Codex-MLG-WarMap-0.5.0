const assert = require("assert");
const {
  AUTHORIZATION_CAPABILITIES,
  createAuthorizationPolicyService,
  createTrustedLocalActor,
  AuthorizationPolicyError
} = require("../src/services/authorization-policy-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function actor(grants) { return { actorId: "user-1", grants }; }
function grant(capability, seasonId = null, serverId = null) {
  return { capability, seasonId, serverId };
}

test("global grant authorizes global and scoped operations", () => {
  const service = createAuthorizationPolicyService();
  const value = actor([grant("server_state.edit")]);
  assert.strictEqual(service.authorize(value, "server_state.edit").authorized, true);
  assert.strictEqual(
    service.authorize(value, "server_state.edit", { seasonId: "season-1", serverId: "366" }).authorized,
    true
  );
});

test("season grant authorizes only its season and all servers in it", () => {
  const service = createAuthorizationPolicyService();
  const value = actor([grant("server_state.edit", "season-1")]);
  assert.strictEqual(service.authorize(value, "server_state.edit", { seasonId: "season-1" }).authorized, true);
  assert.strictEqual(
    service.authorize(value, "server_state.edit", { seasonId: "season-1", serverId: "366" }).authorized,
    true
  );
  assert.strictEqual(
    service.authorize(value, "server_state.edit", { seasonId: "season-2", serverId: "366" }).authorized,
    false
  );
  assert.strictEqual(service.authorize(value, "server_state.edit").authorized, false);
});

test("server grant authorizes only its exact season and server", () => {
  const service = createAuthorizationPolicyService();
  const value = actor([grant("proposal.review", "season-1", "366")]);
  assert.strictEqual(
    service.authorize(value, "proposal.review", { seasonId: "season-1", serverId: "366" }).authorized,
    true
  );
  assert.strictEqual(
    service.authorize(value, "proposal.review", { seasonId: "season-1", serverId: "367" }).authorized,
    false
  );
  assert.strictEqual(service.authorize(value, "proposal.review", { seasonId: "season-1" }).authorized, false);
});

test("a different capability never authorizes the operation", () => {
  const service = createAuthorizationPolicyService();
  const value = actor([grant("server_state.edit")]);
  assert.strictEqual(service.authorize(value, "proposal.review").authorized, false);
});

test("requireAuthorized returns a safe decision and throws a stable denial", () => {
  const service = createAuthorizationPolicyService();
  const value = actor([grant("server_state.edit", "season-1", "366")]);
  const decision = service.requireAuthorized(
    value,
    "server_state.edit",
    { seasonId: "season-1", serverId: "366" }
  );
  decision.matchingGrant.serverId = "mutated";
  assert.strictEqual(value.grants[0].serverId, "366");
  assert.throws(
    () => service.requireAuthorized(value, "proposal.review", { seasonId: "season-1", serverId: "366" }),
    (error) => error instanceof AuthorizationPolicyError
      && error.code === "authorization_denied"
      && error.details.actorId === "user-1"
  );
});

test("trusted local actor receives every global capability", () => {
  const value = createTrustedLocalActor("desktop-user");
  assert.deepStrictEqual(
    value.grants.map((entry) => entry.capability),
    Array.from(AUTHORIZATION_CAPABILITIES)
  );
  value.grants.forEach((entry) => {
    assert.strictEqual(entry.seasonId, null);
    assert.strictEqual(entry.serverId, null);
  });
});

test("validation rejects malformed actors, grants, capabilities, and scopes", () => {
  const service = createAuthorizationPolicyService();
  const invalidValues = [
    () => service.authorize(null, "server_state.edit"),
    () => service.authorize({ actorId: "u", grants: [], extra: true }, "server_state.edit"),
    () => service.authorize(actor([grant("unknown")] ), "server_state.edit"),
    () => service.authorize(actor([grant("server_state.edit", null, "366")]), "server_state.edit"),
    () => service.authorize(actor([grant("server_state.edit"), grant("server_state.edit")]), "server_state.edit"),
    () => service.authorize(actor([]), "unknown"),
    () => service.authorize(actor([]), "server_state.edit", { serverId: "366" }),
    () => service.authorize(actor([]), "server_state.edit", { seasonId: "s", extra: true })
  ];
  invalidValues.forEach((call) => {
    assert.throws(call, (error) => error instanceof AuthorizationPolicyError && error.code === "invalid_input");
  });
});

test("null-prototype actor, grants, and scope are accepted", () => {
  const service = createAuthorizationPolicyService();
  const value = Object.assign(Object.create(null), {
    actorId: "user-1",
    grants: [Object.assign(Object.create(null), {
      capability: "server_state.edit",
      seasonId: "season-1",
      serverId: "366"
    })]
  });
  const scope = Object.assign(Object.create(null), { seasonId: "season-1", serverId: "366" });
  assert.strictEqual(service.authorize(value, "server_state.edit", scope).authorized, true);
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
