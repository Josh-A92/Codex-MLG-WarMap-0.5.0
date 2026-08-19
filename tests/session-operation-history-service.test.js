const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const {
  createSessionOperationHistoryService,
  SessionOperationHistoryError
} = require("../src/services/session-operation-history-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("records successful operations and applies undo then redo", async () => {
  const calls = [];
  const history = createSessionOperationHistoryService();
  history.record({ operationId: "capture-1", undo: async () => { calls.push("undo"); return "u"; }, redo: async () => { calls.push("redo"); return "r"; } });
  assert.deepStrictEqual(history.getState().undoOperationIds, ["capture-1"]);
  assert.strictEqual((await history.undo()).result, "u");
  assert.deepStrictEqual(history.getState().redoOperationIds, ["capture-1"]);
  assert.strictEqual((await history.redo()).result, "r");
  assert.deepStrictEqual(calls, ["undo", "redo"]);
});

test("failed compensation leaves stacks unchanged and queue recovers", async () => {
  let failUndo = true;
  const history = createSessionOperationHistoryService();
  history.record({ operationId: "capture-1", undo: async () => { if (failUndo) throw new Error("durable undo failed"); }, redo: async () => {} });
  await assert.rejects(history.undo(), /durable undo failed/);
  assert.deepStrictEqual(history.getState().undoOperationIds, ["capture-1"]);
  failUndo = false;
  assert.strictEqual((await history.undo()).status, "applied");
});

test("new operations clear redo history", async () => {
  const history = createSessionOperationHistoryService();
  history.record({ operationId: "one", undo: async () => {}, redo: async () => {} });
  await history.undo();
  history.record({ operationId: "two", undo: async () => {}, redo: async () => {} });
  assert.deepStrictEqual(history.getState().redoOperationIds, []);
});

test("bounded history evicts the oldest operation", () => {
  const history = createSessionOperationHistoryService({ limit: 2 });
  ["one", "two", "three"].forEach((operationId) => history.record({ operationId, undo: async () => {}, redo: async () => {} }));
  assert.deepStrictEqual(history.getState().undoOperationIds, ["two", "three"]);
});

test("empty and clear behavior is deterministic", async () => {
  const history = createSessionOperationHistoryService();
  assert.deepStrictEqual(await history.undo(), { status: "empty", direction: "undo", state: history.getState() });
  history.record({ operationId: "one", undo: async () => {}, redo: async () => {} });
  assert.strictEqual(history.clear().canUndo, false);
  assert.strictEqual((await history.redo()).status, "empty");
});

test("strict boundaries reject invalid and duplicate operations", () => {
  assert.throws(() => createSessionOperationHistoryService({ limit: 0 }), (error) => error instanceof SessionOperationHistoryError && error.code === "invalid_factory");
  const history = createSessionOperationHistoryService();
  assert.throws(() => history.record({ operationId: "one", undo: async () => {} }), (error) => error.code === "invalid_input");
  history.record({ operationId: "one", undo: async () => {}, redo: async () => {} });
  assert.throws(() => history.record({ operationId: "one", undo: async () => {}, redo: async () => {} }), (error) => error.code === "duplicate_operation");
});

test("recording is refused while a compensating operation is queued", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const history = createSessionOperationHistoryService();
  history.record({ operationId: "one", undo: () => blocked, redo: async () => {} });
  const undoResult = history.undo();
  assert.throws(
    () => history.record({ operationId: "two", undo: async () => {}, redo: async () => {} }),
    (error) => error.code === "operation_in_progress"
  );
  release();
  await undoResult;
});

test("state snapshots are immutable and do not expose callbacks", () => {
  const history = createSessionOperationHistoryService();
  history.record({ operationId: "one", undo: async () => {}, redo: async () => {} });
  const state = history.getState();
  assert.strictEqual(Object.isFrozen(state), true);
  assert.strictEqual(Object.isFrozen(state.undoOperationIds), true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(state, "undo"), false);
});

test("browser global is available and source has no persistence or host dependency", () => {
  const source = fs.readFileSync("src/services/session-operation-history-service.js", "utf8");
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createSessionOperationHistoryService, "function");
  assert.doesNotMatch(source, /electron|ipcRenderer|ipcMain|localStorage|indexedDB|fetch|require\(|GenerationStore|serverState|auditRecordService/);
});

(async () => {
  for (const item of tests) {
    await item.fn();
    console.log(`PASS ${item.name}`);
  }
  console.log(`${tests.length} session operation history scenarios passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
