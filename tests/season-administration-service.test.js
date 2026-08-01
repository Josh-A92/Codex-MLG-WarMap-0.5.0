const assert = require("assert");
const {
  createSeasonAdministrationService,
  SeasonAdministrationError,
  SEASON_ACTIVATION_STORAGE_IDENTITY
} = require("../src/services/season-administration-service.js");
const { validateSeasonPackage } = require("../src/services/season-package-validator.js");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");

const scheduledTests = [];
function test(name, fn) { scheduledTests.push({ name, fn }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createSetup(options) {
  const values = options || {};
  const calls = [];
  let stored = Object.prototype.hasOwnProperty.call(values, "stored") ? values.stored : null;
  const storageAdapter = values.storageAdapter || {
    async loadEnvelope(identity) {
      calls.push(["load", clone(identity)]);
      return stored === null ? null : clone(stored);
    },
    async saveEnvelope(identity, envelope) {
      calls.push(["save", clone(identity), clone(envelope)]);
      stored = clone(envelope);
    }
  };
  const authorizationPolicyService = values.authorizationPolicyService || {
    requireAuthorized(actor, capability, scope) {
      calls.push(["authorize", actor.actorId, capability, clone(scope)]);
      return { actorId: actor.actorId };
    }
  };
  const service = createSeasonAdministrationService({
    preparedPackages: values.preparedPackages || [SEASON_1_PACKAGE],
    validateSeasonPackage: values.validateSeasonPackage || validateSeasonPackage,
    authorizationPolicyService,
    storageAdapter,
    clock: values.clock || (() => new Date("2026-07-31T12:00:00.000Z"))
  });
  return { service, calls, getStored: () => stored };
}

function activationRequest(overrides) {
  return {
    seasonId: "season-1",
    serverIds: ["366", "367"],
    confirmations: { mapAndStructures: true, resourcesAndValues: true },
    ...(overrides || {})
  };
}

test("lists validated prepared seasons using package-driven summaries", () => {
  const { service } = createSetup();
  const listed = service.listPreparedSeasons();
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].seasonId, "season-1");
  assert.deepStrictEqual(listed[0].map, { baseMapId: "season1-map", rows: 20, columns: 20 });
  assert.strictEqual(listed[0].structures.length, 17);
  assert.strictEqual(listed[0].resource.displayName, "Ice Crystals");
  assert.strictEqual(listed[0].resource.scoringConfigured, true);
  listed[0].map.rows = 1;
  assert.strictEqual(service.listPreparedSeasons()[0].map.rows, 20);
});

test("returns a safe package confirmation view and rejects unknown seasons", () => {
  const { service } = createSetup();
  const view = service.getPreparedSeason("season-1");
  assert.deepStrictEqual(view.package, SEASON_1_PACKAGE);
  assert.notStrictEqual(view.package, SEASON_1_PACKAGE);
  view.package.packageIdentity.displayName = "Changed";
  assert.strictEqual(service.getPreparedSeason("season-1").package.packageIdentity.displayName, "Season 1");
  assert.throws(
    () => service.getPreparedSeason("season-x"),
    (error) => error instanceof SeasonAdministrationError && error.code === "season_not_found"
  );
});

test("rejects invalid or duplicate prepared packages at construction", () => {
  const invalid = clone(SEASON_1_PACKAGE);
  invalid.packageIdentity.displayName = "";
  assert.throws(
    () => createSetup({ preparedPackages: [invalid] }),
    (error) => error.code === "invalid_prepared_package" && error.details.errors.length > 0
  );
  assert.throws(
    () => createSetup({ preparedPackages: [SEASON_1_PACKAGE, clone(SEASON_1_PACKAGE)] }),
    (error) => error.code === "duplicate_season_id"
  );
});

test("initialization treats a missing activation as normal first use", async () => {
  const { service, calls } = createSetup();
  assert.strictEqual(await service.initialize(), null);
  assert.strictEqual(service.getActiveSeason(), null);
  assert.deepStrictEqual(calls, [["load", { scope: "season_activation" }]]);
});

test("loads and safely returns a valid persisted activation", async () => {
  const stored = {
    schemaVersion: 1,
    seasonId: "season-1",
    packageVersion: "0.5.0",
    serverIds: ["366"],
    confirmations: { mapAndStructures: true, resourcesAndValues: true },
    activatedAt: "2026-07-31T10:00:00.000Z",
    activatedBy: "admin-1"
  };
  const { service } = createSetup({ stored });
  const loaded = await service.initialize();
  assert.deepStrictEqual(loaded, stored);
  loaded.serverIds.push("999");
  assert.deepStrictEqual(service.getActiveSeason().serverIds, ["366"]);
});

test("rejects unavailable or mismatched persisted activation state", async () => {
  const invalidStates = [
    { schemaVersion: 2 },
    {
      schemaVersion: 1,
      seasonId: "season-x",
      packageVersion: null,
      serverIds: ["366"],
      confirmations: { mapAndStructures: true, resourcesAndValues: true },
      activatedAt: "2026-07-31T10:00:00.000Z",
      activatedBy: "admin"
    },
    {
      schemaVersion: 1,
      seasonId: "season-1",
      packageVersion: "wrong",
      serverIds: ["366"],
      confirmations: { mapAndStructures: true, resourcesAndValues: true },
      activatedAt: "2026-07-31T10:00:00.000Z",
      activatedBy: "admin"
    }
  ];
  for (const stored of invalidStates) {
    const { service } = createSetup({ stored });
    await assert.rejects(() => service.initialize(), SeasonAdministrationError);
  }
});

test("activation requires initialization, both confirmations, and unique servers", async () => {
  const { service, calls } = createSetup();
  await assert.rejects(
    () => service.activateSeason({ actorId: "admin" }, activationRequest()),
    (error) => error.code === "not_initialized"
  );
  await service.initialize();
  const invalidRequests = [
    activationRequest({ confirmations: { mapAndStructures: false, resourcesAndValues: true } }),
    activationRequest({ confirmations: { mapAndStructures: true } }),
    activationRequest({ serverIds: [] }),
    activationRequest({ serverIds: ["366", "366"] })
  ];
  for (const request of invalidRequests) {
    await assert.rejects(() => service.activateSeason({ actorId: "admin" }, request));
  }
  assert.strictEqual(calls.some((entry) => entry[0] === "save"), false);
});

test("authorized activation persists one canonical envelope and returns a safe copy", async () => {
  const { service, calls, getStored } = createSetup();
  await service.initialize();
  const result = await service.activateSeason({ actorId: "admin-1" }, activationRequest());
  assert.deepStrictEqual(result, {
    schemaVersion: 1,
    seasonId: "season-1",
    packageVersion: "0.5.0",
    serverIds: ["366", "367"],
    confirmations: { mapAndStructures: true, resourcesAndValues: true },
    activatedAt: "2026-07-31T12:00:00.000Z",
    activatedBy: "admin-1"
  });
  assert.deepStrictEqual(calls[1], [
    "authorize",
    "admin-1",
    "season_rules.manage",
    { seasonId: "season-1" }
  ]);
  assert.deepStrictEqual(calls[2][0], "save");
  assert.deepStrictEqual(calls[2][1], SEASON_ACTIVATION_STORAGE_IDENTITY);
  assert.deepStrictEqual(getStored(), result);
  result.serverIds.length = 0;
  assert.deepStrictEqual(service.getActiveSeason().serverIds, ["366", "367"]);
});

test("authorization denial prevents persistence and state mutation", async () => {
  const denied = new Error("denied");
  denied.code = "authorization_denied";
  const { service, calls } = createSetup({
    authorizationPolicyService: { requireAuthorized() { throw denied; } }
  });
  await service.initialize();
  await assert.rejects(
    () => service.activateSeason({ actorId: "viewer" }, activationRequest()),
    (error) => error === denied
  );
  assert.strictEqual(service.getActiveSeason(), null);
  assert.strictEqual(calls.some((entry) => entry[0] === "save"), false);
});

test("failed storage write leaves the active selection unchanged", async () => {
  const { service } = createSetup({
    storageAdapter: {
      async loadEnvelope() { return null; },
      async saveEnvelope() { throw new Error("disk unavailable"); }
    }
  });
  await service.initialize();
  await assert.rejects(
    () => service.activateSeason({ actorId: "admin" }, activationRequest()),
    /disk unavailable/
  );
  assert.strictEqual(service.getActiveSeason(), null);
});

test("same-season reactivation is blocked pending controlled correction", async () => {
  const { service } = createSetup();
  await service.initialize();
  await service.activateSeason({ actorId: "admin" }, activationRequest());
  await assert.rejects(
    () => service.activateSeason({ actorId: "admin" }, activationRequest()),
    (error) => error.code === "season_already_activated"
  );
});

(async () => {
  let failures = 0;
  for (const scheduled of scheduledTests) {
    try {
      await scheduled.fn();
      process.stdout.write(`PASS ${scheduled.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`FAIL ${scheduled.name}\n${error.stack || error.message}\n`);
    }
  }
  if (failures > 0) process.exitCode = 1;
  else process.stdout.write(`${scheduledTests.length} tests passed\n`);
})();
