const assert = require("assert");
const season1Servers = require("../data/season1-servers.json");
const {
  createApplicationMutationCoordinator,
  ApplicationMutationCoordinatorError
} = require("../src/services/application-mutation-coordinator.js");
const { createServerStateService } = require("../src/services/server-state-service.js");
const {
  createOwnershipRecordService
} = require("../src/services/ownership-record-service.js");
const {
  validateTerritoryOwnershipRecord,
  validateTerritoryOwnershipHistory,
  validateStructureOwnershipRecord,
  validateStructureOwnershipHistory
} = require("../src/services/ownership-record-validator.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function participant(value, options = {}) {
  return {
    value,
    captureTransactionState() { return structuredClone(this.value); },
    restoreTransactionState(snapshot) {
      if (options.failRestore) throw new Error(options.failRestore);
      this.value = structuredClone(snapshot);
    }
  };
}

function createRealOwnershipContext() {
  const serverStateService = createServerStateService(season1Servers);
  const ownershipRecordService = createOwnershipRecordService({
    initialTerritoryRecords: [],
    initialStructureRecords: [],
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory
  });
  const coordinator = createApplicationMutationCoordinator({
    participants: [ownershipRecordService, serverStateService]
  });
  return { coordinator, ownershipRecordService, serverStateService };
}

function addRealOwnership(ownershipRecordService, serverStateService) {
  ownershipRecordService.addConfirmedManualTerritoryRecord({
    ownershipRecordId: "territory-phase3c2a",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 3, col: 4 },
    ownerUnionId: "union-0001",
    ownershipState: "owned",
    effectiveAt: "2026-08-12T12:00:00Z",
    evidenceIds: [],
    actorId: "desktop-user",
    reviewerId: "desktop-user",
    reviewedAt: "2026-08-12T12:01:00Z"
  });
  serverStateService.setTerritoryOwner("server-366", "3-4", "union-0001");
}

test("successful mutation and durable commit retain changes", async () => {
  const first = participant(0);
  const second = participant("before");
  const coordinator = createApplicationMutationCoordinator({ participants: [first, second] });
  const result = await coordinator.execute(
    () => { first.value = 1; second.value = "after"; return "committed"; },
    async () => {}
  );
  assert.strictEqual(result, "committed");
  assert.strictEqual(first.value, 1);
  assert.strictEqual(second.value, "after");
});

test("mutation failure restores every participant", async () => {
  const first = participant(0);
  const second = participant("before");
  const coordinator = createApplicationMutationCoordinator({ participants: [first, second] });
  await assert.rejects(
    () => coordinator.execute(
      () => { first.value = 1; second.value = "after"; throw new Error("mutation failed"); },
      async () => {}
    ),
    /mutation failed/
  );
  assert.strictEqual(first.value, 0);
  assert.strictEqual(second.value, "before");
});

test("durable commit failure restores every participant", async () => {
  const first = participant(0);
  const second = participant("before");
  const coordinator = createApplicationMutationCoordinator({ participants: [first, second] });
  await assert.rejects(
    () => coordinator.execute(
      () => { first.value = 1; second.value = "after"; },
      async () => { throw new Error("durable commit failed"); }
    ),
    /durable commit failed/
  );
  assert.strictEqual(first.value, 0);
  assert.strictEqual(second.value, "before");
});

test("partial restore failure is surfaced with the operation cause", async () => {
  const first = participant(0, { failRestore: "restore failed" });
  const second = participant("before");
  const coordinator = createApplicationMutationCoordinator({ participants: [first, second] });
  await assert.rejects(
    () => coordinator.execute(
      () => { first.value = 1; second.value = "after"; },
      async () => { throw new Error("commit failed"); }
    ),
    (error) => error instanceof ApplicationMutationCoordinatorError
      && error.code === "rollback_failed"
      && error.cause.message === "commit failed"
      && error.rollbackErrors.length === 1
  );
  assert.strictEqual(second.value, "before");
});

test("real ownership history and server projection roll back together", async () => {
  const context = createRealOwnershipContext();
  await assert.rejects(
    () => context.coordinator.execute(
      () => { addRealOwnership(context.ownershipRecordService, context.serverStateService); },
      async () => { throw new Error("generation commit failed"); }
    ),
    /generation commit failed/
  );
  assert.deepStrictEqual(context.ownershipRecordService.listTerritoryRecords(), []);
  assert.strictEqual(context.serverStateService.getTerritoryOwner("server-366", "3-4", null), null);
});

test("nested atomic mutation failure remains transactional", async () => {
  const first = participant(0);
  const second = participant("before");
  const inner = createApplicationMutationCoordinator({ participants: [first, second] });
  const outer = createApplicationMutationCoordinator({ participants: [first, second] });
  await assert.rejects(
    () => outer.execute(
      () => inner.execute(
        () => { first.value = 1; second.value = "after"; throw new Error("inner failed"); },
        async () => {}
      ),
      async () => {}
    ),
    /inner failed/
  );
  assert.strictEqual(first.value, 0);
  assert.strictEqual(second.value, "before");
});

test("queued operations execute serially", async () => {
  const target = participant(0);
  const coordinator = createApplicationMutationCoordinator({ participants: [target] });
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = coordinator.execute(async () => { events.push("first:start"); await gate; target.value += 1; events.push("first:end"); }, async () => {});
  const second = coordinator.execute(() => { events.push("second"); target.value += 1; }, async () => {});
  await Promise.resolve();
  await Promise.resolve();
  assert.deepStrictEqual(events, ["first:start"]);
  release();
  await Promise.all([first, second]);
  assert.deepStrictEqual(events, ["first:start", "first:end", "second"]);
  assert.strictEqual(target.value, 2);
});

(async () => {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
