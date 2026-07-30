const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createUnionServerSeasonRelationService,
  UnionServerSeasonRelationServiceError
} = require("../src/services/union-server-season-relation-service.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function createValidInitialRelations() {
  return [
    {
      unionId: "union-0001",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    },
    {
      unionId: "union-0002",
      serverId: "server-367",
      seasonId: "season-1",
      currentNativeStatusId: "native-status-2",
      currentActiveStatusId: "active-status-2",
      firstConfirmedPresenceAt: "2026-07-25T09:15:00.000Z",
      mostRecentConfirmedPresenceAt: "2026-07-26T09:15:00.000Z",
      evidenceIds: ["evidence-1", "evidence-2"],
      manualOverride: null
    }
  ];
}

function assertErrorCode(fn, code, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof UnionServerSeasonRelationServiceError);
    assert.strictEqual(error.code, code);
    if (messagePattern) {
      assert.match(error.message, messagePattern);
    }

    return true;
  });
}

runTest("valid empty and populated initialization", () => {
  const emptyService = createUnionServerSeasonRelationService([]);
  assert.deepStrictEqual(emptyService.listRelations(), []);

  const service = createUnionServerSeasonRelationService(createValidInitialRelations());
  assert.deepStrictEqual(service.listRelations().map((relation) => relation.unionId), ["union-0001", "union-0002"]);
  assert.strictEqual(service.hasRelation("season-1", "server-366", "union-0001"), true);
  assert.strictEqual(service.hasRelation("season-1", "server-999", "union-0001"), false);
  assert.strictEqual(service.getRelation("season-1", "server-999", "union-0001"), null);
});

runTest("adding a known union", () => {
  const service = createUnionServerSeasonRelationService([]);
  const input = Object.create(null);
  input.seasonId = "season-1";
  input.serverId = "server-368";
  input.unionId = "union-0003";

  const relation = service.addKnownUnion(input);

  const expected = Object.create(null);
  expected.unionId = "union-0003";
  expected.serverId = "server-368";
  expected.seasonId = "season-1";
  expected.currentNativeStatusId = null;
  expected.currentActiveStatusId = null;
  expected.firstConfirmedPresenceAt = null;
  expected.mostRecentConfirmedPresenceAt = null;
  expected.evidenceIds = [];
  expected.manualOverride = null;

  assert.strictEqual(Object.getPrototypeOf(relation), null);
  assert.deepStrictEqual(relation, expected);
  assert.strictEqual(service.hasRelation("season-1", "server-368", "union-0003"), true);
});

runTest("null-prototype relation initialization is accepted", () => {
  const relation = Object.create(null);
  relation.unionId = "union-0006";
  relation.serverId = "server-370";
  relation.seasonId = "season-2";
  relation.currentNativeStatusId = null;
  relation.currentActiveStatusId = null;
  relation.firstConfirmedPresenceAt = null;
  relation.mostRecentConfirmedPresenceAt = null;
  relation.evidenceIds = [];
  relation.manualOverride = null;

  const service = createUnionServerSeasonRelationService([relation]);
  const loaded = service.getRelation("season-2", "server-370", "union-0006");

  assert.strictEqual(Object.getPrototypeOf(loaded), null);
  assert.deepStrictEqual(loaded, relation);
});

runTest("existence does not create native active status", () => {
  const service = createUnionServerSeasonRelationService([]);

  service.addKnownUnion({ seasonId: "season-1", serverId: "server-369", unionId: "union-0004" });
  const relation = service.getRelation("season-1", "server-369", "union-0004");

  assert.strictEqual(relation.currentNativeStatusId, null);
  assert.strictEqual(relation.currentActiveStatusId, null);
  assert.strictEqual(relation.firstConfirmedPresenceAt, null);
  assert.strictEqual(relation.mostRecentConfirmedPresenceAt, null);
});

runTest("list filtering by season server union and combinations", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());

  service.addKnownUnion({ seasonId: "season-2", serverId: "server-366", unionId: "union-0001" });
  service.addKnownUnion({ seasonId: "season-1", serverId: "server-368", unionId: "union-0001" });

  assert.deepStrictEqual(service.listRelations({ seasonId: "season-1" }).map((relation) => relation.serverId), ["server-366", "server-367", "server-368"]);
  assert.deepStrictEqual(service.listRelations({ serverId: "server-366" }).map((relation) => relation.seasonId), ["season-1", "season-2"]);
  assert.deepStrictEqual(service.listRelations({ unionId: "union-0001" }).map((relation) => relation.serverId), ["server-366", "server-366", "server-368"]);
  assert.deepStrictEqual(service.listRelations({ seasonId: "season-1", serverId: "server-366" }).map((relation) => relation.unionId), ["union-0001"]);
  assert.deepStrictEqual(service.listRelations({ seasonId: "season-1", serverId: "server-366", unionId: "union-0001" }).map((relation) => relation.unionId), ["union-0001"]);
});

runTest("composite identity isolation across different servers and seasons", () => {
  const service = createUnionServerSeasonRelationService([]);

  service.addKnownUnion({ seasonId: "season-1", serverId: "server-366", unionId: "union-0005" });
  service.addKnownUnion({ seasonId: "season-1", serverId: "server-367", unionId: "union-0005" });
  service.addKnownUnion({ seasonId: "season-2", serverId: "server-366", unionId: "union-0005" });

  assert.strictEqual(service.hasRelation("season-1", "server-366", "union-0005"), true);
  assert.strictEqual(service.hasRelation("season-1", "server-367", "union-0005"), true);
  assert.strictEqual(service.hasRelation("season-2", "server-366", "union-0005"), true);
  assert.deepStrictEqual(service.listRelations({ unionId: "union-0005" }).map((relation) => `${relation.seasonId}/${relation.serverId}`), ["season-1/server-366", "season-1/server-367", "season-2/server-366"]);
});

runTest("delimiter-like null-character tuples do not collide on initialization", () => {
  const relationA = {
    seasonId: "a",
    serverId: "b",
    unionId: "c\u0000d",
    currentNativeStatusId: null,
    currentActiveStatusId: null,
    firstConfirmedPresenceAt: null,
    mostRecentConfirmedPresenceAt: null,
    evidenceIds: [],
    manualOverride: null
  };

  const relationB = {
    seasonId: "a\u0000b",
    serverId: "c",
    unionId: "d",
    currentNativeStatusId: null,
    currentActiveStatusId: null,
    firstConfirmedPresenceAt: null,
    mostRecentConfirmedPresenceAt: null,
    evidenceIds: [],
    manualOverride: null
  };

  const service = createUnionServerSeasonRelationService([relationA, relationB]);

  assert.strictEqual(service.hasRelation("a", "b", "c\u0000d"), true);
  assert.strictEqual(service.hasRelation("a\u0000b", "c", "d"), true);
  assert.deepStrictEqual(service.getRelation("a", "b", "c\u0000d"), relationA);
  assert.deepStrictEqual(service.getRelation("a\u0000b", "c", "d"), relationB);

  assertErrorCode(() => createUnionServerSeasonRelationService([relationA, relationA]), "duplicate_relation", /a \/ b \/ c/);
});

runTest("delimiter-like null-character tuples do not collide when added sequentially", () => {
  const service = createUnionServerSeasonRelationService([]);

  service.addKnownUnion({ seasonId: "a", serverId: "b", unionId: "c\u0000d" });
  service.addKnownUnion({ seasonId: "a\u0000b", serverId: "c", unionId: "d" });

  assert.strictEqual(service.hasRelation("a", "b", "c\u0000d"), true);
  assert.strictEqual(service.hasRelation("a\u0000b", "c", "d"), true);
  assert.strictEqual(service.getRelation("a", "b", "c\u0000d").unionId, "c\u0000d");
  assert.strictEqual(service.getRelation("a\u0000b", "c", "d").unionId, "d");

  assertErrorCode(
    () => service.addKnownUnion({ seasonId: "a", serverId: "b", unionId: "c\u0000d" }),
    "duplicate_relation",
    /a \/ b \/ c/
  );
});

runTest("duplicate rejection", () => {
  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0001",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    },
    {
      unionId: "union-0001",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    }
  ]), "duplicate_relation", /season-1 \/ server-366 \/ union-0001/);

  const service = createUnionServerSeasonRelationService([]);
  service.addKnownUnion({ seasonId: "season-1", serverId: "server-366", unionId: "union-0001" });
  assertErrorCode(() => service.addKnownUnion({ seasonId: "season-1", serverId: "server-366", unionId: "union-0001" }), "duplicate_relation", /season-1 \/ server-366 \/ union-0001/);
});

runTest("unknown lookup behavior", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());

  assert.strictEqual(service.getRelation("season-9", "server-999", "union-9999"), null);
  assert.strictEqual(service.hasRelation("season-9", "server-999", "union-9999"), false);
});

runTest("malformed IDs", () => {
  const service = createUnionServerSeasonRelationService([]);

  assertErrorCode(() => service.getRelation("", "server-1", "union-1"), "invalid_input", /seasonId/);
  assertErrorCode(() => service.hasRelation("season-1", "   ", "union-1"), "invalid_input", /serverId/);
  assertErrorCode(() => service.addKnownUnion({ seasonId: "season-1", serverId: "server-1", unionId: "" }), "invalid_input", /unionId/);
});

runTest("unknown fields and invalid object types", () => {
  assertErrorCode(() => createUnionServerSeasonRelationService(null), "invalid_input", /initialRelations/);
  assertErrorCode(() => createUnionServerSeasonRelationService({}), "invalid_input", /initialRelations/);
  assertErrorCode(() => createUnionServerSeasonRelationService([[]]), "invalid_input", /plain object/);
  assertErrorCode(() => createUnionServerSeasonRelationService([new Date()]), "invalid_input", /plain object/);
  assertErrorCode(() => createUnionServerSeasonRelationService([new Map()]), "invalid_input", /plain object/);
  assertErrorCode(() => createUnionServerSeasonRelationService([new Set()]), "invalid_input", /plain object/);
  assertErrorCode(() => createUnionServerSeasonRelationService([() => {}]), "invalid_input", /plain object/);

  class RelationRecord {}
  assertErrorCode(() => createUnionServerSeasonRelationService([new RelationRecord()]), "invalid_input", /plain object/);

  const invalidField = createValidInitialRelations();
  invalidField[0].active = true;
  assertErrorCode(() => createUnionServerSeasonRelationService(invalidField), "invalid_input", /field 'active'/);

  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0001",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null,
      extra: true
    }
  ]), "invalid_input", /field 'extra'/);
});

runTest("invalid timestamps and ordering", () => {
  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0010",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: "not-a-timestamp",
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    }
  ]), "invalid_input", /firstConfirmedPresenceAt/);

  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-impossible-date",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: "2026-02-30T09:15:00Z",
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    }
  ]), "invalid_input", /firstConfirmedPresenceAt/);

  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0011",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: "2026-07-26T09:15:00.000Z",
      mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00.000Z",
      evidenceIds: [],
      manualOverride: null
    }
  ]), "invalid_input", /firstConfirmedPresenceAt/);
});

runTest("duplicate and invalid evidence IDs", () => {
  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0012",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: ["evidence-1", "evidence-1"],
      manualOverride: null
    }
  ]), "invalid_input", /evidenceIds/);

  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0013",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: ["evidence-1", ""],
      manualOverride: null
    }
  ]), "invalid_input", /evidenceIds\[1\]/);
});

runTest("non-null manualOverride rejection", () => {
  assertErrorCode(() => createUnionServerSeasonRelationService([
    {
      unionId: "union-0014",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: {}
    }
  ]), "invalid_input", /manualOverride/);
});

runTest("safe copy and reference isolation", () => {
  const initialRelations = createValidInitialRelations();
  const inputBefore = clone(initialRelations);
  const service = createUnionServerSeasonRelationService(initialRelations);

  initialRelations[0].evidenceIds.push("evidence-99");
  initialRelations[1].currentNativeStatusId = "changed";

  const listed = service.listRelations();
  listed[0].evidenceIds.push("mutated");
  listed[1].currentActiveStatusId = "changed";

  assert.deepStrictEqual(initialRelations, [
    {
      unionId: "union-0001",
      serverId: "server-366",
      seasonId: "season-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: ["evidence-99"],
      manualOverride: null
    },
    {
      unionId: "union-0002",
      serverId: "server-367",
      seasonId: "season-1",
      currentNativeStatusId: "changed",
      currentActiveStatusId: "active-status-2",
      firstConfirmedPresenceAt: "2026-07-25T09:15:00.000Z",
      mostRecentConfirmedPresenceAt: "2026-07-26T09:15:00.000Z",
      evidenceIds: ["evidence-1", "evidence-2"],
      manualOverride: null
    }
  ]);

  assert.deepStrictEqual(service.listRelations(), inputBefore);
  assert.strictEqual(service.getRelation("season-1", "server-367", "union-0002").currentNativeStatusId, "native-status-2");
});

runTest("failed addition leaves state unchanged", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());
  const before = service.listRelations();

  assertErrorCode(() => service.addKnownUnion({ seasonId: "season-1", serverId: "server-366", unionId: "union-0001" }), "duplicate_relation", /season-1 \/ server-366 \/ union-0001/);
  assert.deepStrictEqual(service.listRelations(), before);
});

runTest("active status projection updates only rebuildable relation cache fields", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());
  const before = service.getRelation("season-1", "server-366", "union-0001");
  const updated = service.updateActiveStatusProjection({
    statusId: "active-status-new",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    reviewState: "confirmed",
    effectiveTo: null,
    supersededBy: null,
    firstConfirmedPresenceAt: "2026-07-10T18:42:00.1Z",
    mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00.12Z"
  });
  assert.strictEqual(updated.currentActiveStatusId, "active-status-new");
  assert.strictEqual(updated.firstConfirmedPresenceAt, "2026-07-10T18:42:00.1Z");
  assert.strictEqual(updated.mostRecentConfirmedPresenceAt, "2026-07-25T09:15:00.12Z");
  assert.strictEqual(updated.currentNativeStatusId, before.currentNativeStatusId);
  assert.deepStrictEqual(updated.evidenceIds, before.evidenceIds);
});

runTest("active status projection preflight returns the projected relation without mutation", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());
  const before = service.getRelation("season-1", "server-366", "union-0001");
  const projected = service.validateActiveStatusProjection({
    statusId: "active-status-preview",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    reviewState: "confirmed",
    effectiveTo: null,
    supersededBy: null,
    firstConfirmedPresenceAt: "2026-07-10T18:42:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-25T09:15:00Z"
  });
  assert.strictEqual(projected.currentActiveStatusId, "active-status-preview");
  assert.deepStrictEqual(service.getRelation("season-1", "server-366", "union-0001"), before);
});

runTest("invalid active status projection is rejected without changing relation state", () => {
  const service = createUnionServerSeasonRelationService(createValidInitialRelations());
  const before = service.listRelations();
  const valid = {
    statusId: "active-status-new",
    unionId: "union-0001",
    serverId: "server-366",
    seasonId: "season-1",
    reviewState: "confirmed",
    effectiveTo: null,
    supersededBy: null,
    firstConfirmedPresenceAt: "2026-07-25T09:15:00Z",
    mostRecentConfirmedPresenceAt: "2026-07-10T18:42:00Z"
  };
  assertErrorCode(() => service.updateActiveStatusProjection(valid), "invalid_input", /chronologically ordered/);
  assertErrorCode(
    () => service.updateActiveStatusProjection(Object.assign({}, valid, {
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      reviewState: "superseded",
      effectiveTo: "2026-07-30T00:00:00Z",
      supersededBy: "replacement"
    })),
    "invalid_input",
    /effective current confirmed/
  );
  assertErrorCode(
    () => service.updateActiveStatusProjection(Object.assign({}, valid, {
      serverId: "unknown",
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null
    })),
    "unknown_relation"
  );
  assert.deepStrictEqual(service.listRelations(), before);
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createUnionServerSeasonRelationService, "function");
  assert.strictEqual(typeof UnionServerSeasonRelationServiceError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "union-server-season-relation-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createUnionServerSeasonRelationService, "function");
  assert.strictEqual(typeof sandbox.globalThis.UnionServerSeasonRelationServiceError, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "union-server-season-relation-service.js");
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
