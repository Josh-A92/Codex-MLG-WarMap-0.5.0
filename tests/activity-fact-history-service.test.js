const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createActivityFactHistoryService,
  ActivityFactHistoryServiceError
} = require("../src/services/activity-fact-history-service.js");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function presence(overrides) {
  return Object.assign({
    factId: "fact-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    observedAt: "2026-07-29T00:30:00Z",
    ownershipRecordId: "ownership-1",
    snapshotId: "snapshot-1"
  }, overrides || {});
}

function confirmation(overrides) {
  return Object.assign({
    snapshotId: "snapshot-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    fullConfirmationAt: "2026-07-29T00:30:00Z",
    ownedTerritoryCount: 1
  }, overrides || {});
}

function facts(overrides) {
  return Object.assign({
    confirmedPresenceFacts: [presence()],
    qualifyingFullMapConfirmations: [confirmation()]
  }, overrides || {});
}

test("initial facts and appended facts are returned for their exact scope", () => {
  const service = createActivityFactHistoryService({
    initialConfirmedPresenceFacts: [presence()],
    initialQualifyingFullMapConfirmations: [confirmation()]
  });
  service.appendResolvedFacts(facts({
    confirmedPresenceFacts: [presence({
      factId: "fact-2",
      unionId: "union-2",
      ownershipRecordId: "ownership-2"
    })],
    qualifyingFullMapConfirmations: [confirmation({
      unionId: "union-2"
    })]
  }));
  assert.strictEqual(service.getFacts("season-1", "server-366", "union-1").confirmedPresenceFacts.length, 1);
  assert.strictEqual(service.getFacts("season-1", "server-366", "union-2").confirmedPresenceFacts.length, 1);
  assert.deepStrictEqual(service.getFacts("season-1", "server-367", "union-1"), {
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  });
});

test("append is atomic when any new fact is invalid", () => {
  const service = createActivityFactHistoryService();
  assert.throws(() => service.appendResolvedFacts(facts({
    confirmedPresenceFacts: [
      presence(),
      presence({ factId: "fact-2", observedAt: "bad" })
    ]
  })), (error) => error instanceof ActivityFactHistoryServiceError && error.code === "invalid_input");
  assert.deepStrictEqual(service.getAllFacts(), {
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  });
});

test("preflight validation detects conflicts without mutating history", () => {
  const service = createActivityFactHistoryService();
  const validated = service.validateResolvedFacts(facts());
  assert.strictEqual(validated.confirmedPresenceFacts.length, 1);
  assert.deepStrictEqual(service.getAllFacts(), {
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  });
  service.appendResolvedFacts(facts());
  assert.throws(() => service.validateResolvedFacts(facts()), (error) => error.code === "duplicate_fact");
  assert.strictEqual(service.getAllFacts().confirmedPresenceFacts.length, 1);
});

test("duplicate presence and per-scope confirmation identities are rejected atomically", () => {
  const service = createActivityFactHistoryService();
  service.appendResolvedFacts(facts());
  assert.throws(() => service.appendResolvedFacts(facts({
    qualifyingFullMapConfirmations: []
  })), (error) => error.code === "duplicate_fact");
  assert.throws(() => service.appendResolvedFacts(facts({
    confirmedPresenceFacts: [presence({ factId: "fact-2", ownershipRecordId: "ownership-2" })]
  })), (error) => error.code === "duplicate_fact");
  assert.strictEqual(service.getAllFacts().confirmedPresenceFacts.length, 1);
});

test("the same snapshot ID remains valid for a different union scope", () => {
  const service = createActivityFactHistoryService();
  service.appendResolvedFacts(facts());
  service.appendResolvedFacts({
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: [confirmation({ unionId: "union-2" })]
  });
  assert.strictEqual(service.getAllFacts().qualifyingFullMapConfirmations.length, 2);
});

test("strict field timestamp count and object validation is enforced", () => {
  assert.throws(() => createActivityFactHistoryService({ unknown: true }), /does not recognize/);
  const service = createActivityFactHistoryService();
  [
    null,
    [],
    new Date(),
    "bad"
  ].forEach((value) => assert.throws(() => service.appendResolvedFacts(value), /plain object/));
  assert.throws(() => service.appendResolvedFacts(facts({
    confirmedPresenceFacts: [presence({ extra: true })]
  })), /does not recognize/);
  assert.throws(() => service.appendResolvedFacts(facts({
    qualifyingFullMapConfirmations: [confirmation({ ownedTerritoryCount: -1 })]
  })), /non-negative integer/);
  assert.throws(() => service.appendResolvedFacts(facts({
    qualifyingFullMapConfirmations: [confirmation({ fullConfirmationAt: "2026-07-29T00:30:00+01:00" })]
  })), /UTC ISO-8601/);
  assert.throws(() => service.appendResolvedFacts(facts({
    confirmedPresenceFacts: [presence({ observedAt: "2026-02-30T00:00:00Z" })]
  })), /UTC ISO-8601/);
});

test("null-prototype inputs are accepted and caller and returned references are isolated", () => {
  const options = Object.create(null);
  const item = Object.assign(Object.create(null), presence());
  options.initialConfirmedPresenceFacts = [item];
  options.initialQualifyingFullMapConfirmations = [];
  const service = createActivityFactHistoryService(options);
  item.unionId = "mutated-input";
  const first = service.getFacts("season-1", "server-366", "union-1");
  first.confirmedPresenceFacts[0].unionId = "mutated-output";
  assert.strictEqual(
    service.getFacts("season-1", "server-366", "union-1").confirmedPresenceFacts[0].unionId,
    "union-1"
  );
});

test("tuple scoping is collision-safe", () => {
  const service = createActivityFactHistoryService({
    initialConfirmedPresenceFacts: [
      presence({
        factId: "fact-a",
        seasonId: "a",
        serverId: "b",
        unionId: "c\u0000d"
      }),
      presence({
        factId: "fact-b",
        seasonId: "a\u0000b",
        serverId: "c",
        unionId: "d",
        ownershipRecordId: "ownership-2",
        snapshotId: "snapshot-2"
      })
    ],
    initialQualifyingFullMapConfirmations: []
  });
  assert.strictEqual(service.getFacts("a", "b", "c\u0000d").confirmedPresenceFacts[0].factId, "fact-a");
  assert.strictEqual(service.getFacts("a\u0000b", "c", "d").confirmedPresenceFacts[0].factId, "fact-b");
});

test("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createActivityFactHistoryService, "function");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "activity-fact-history-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createActivityFactHistoryService, "function");
  assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
});

if (require.main === module) {
  let passed = 0;
  tests.forEach(({ name, fn }) => {
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
