const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createServerStateService } = require("../src/services/server-state-service.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createOwnershipProjectionReplacementCoordinator } = require("../src/services/ownership-projection-replacement-coordinator.js");
const { createOwnershipProjectionComparator } = require("../src/services/ownership-projection-comparator.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function territory(row, col, ownershipState = "owned", ownerUnionId = "union-1") {
  return { targetKey: JSON.stringify(["normal_map_cell", row, col]), territoryRef: { type: "normal_map_cell", row, col }, ownershipState, ownerUnionId, recordId: `record-${row}-${col}`, eventAt: { precision: "exact", at: "2026-08-01T00:00:00Z" } };
}
function result(territories, overrides = {}) { return { seasonId: "season-1", serverId: "server-366", territories, structures: [], uncertainty: [], excludedRecords: [], consistencyDiagnostics: [], ...overrides }; }
function persisted(ownership, overrides = {}) { return { schemaVersion: 1, seasonId: "season-1", baseMapId: "season1-map", savedAt: "2026-08-01T00:00:00.000Z", servers: [{ id: "server-366", ownership }, ...((overrides.servers) || [{ id: "server-367", ownership: { "8-8": "union-other" } }])], ...overrides }; }
function setup({ resolvedResult = result([territory(1, 1)]), stored = { "9-9": null }, extraServers = true, resolveError = null, failReplace = false, failCommit = false } = {}) {
  const serverState = createServerStateService({ seasonId: "season-1", baseMapId: "season1-map", servers: [{ id: "server-366", label: "366", ownership: stored }, ...(extraServers ? [{ id: "server-367", label: "367", ownership: { "8-8": "union-other" } }] : [])] });
  const audit = { appends: 0, captureTransactionState() { return this.appends; }, restoreTransactionState(snapshot) { this.appends = snapshot; } };
  let commits = 0;
  const mutation = createApplicationMutationCoordinator({ participants: [serverState, audit] });
  const history = { listTerritoryRecords: () => [], listStructureRecords: () => [] };
  const resolver = { resolve() { if (resolveError) throw Object.assign(new Error(resolveError), { code: resolveError }); return clone(resolvedResult); } };
  const serverStateInterface = {
    getSeasonId: () => serverState.getSeasonId(),
    captureTransactionState: () => serverState.captureTransactionState(),
    replaceTerritoryOwnership(ownershipByServerId) {
      if (failReplace) throw new Error("replace failed");
      return serverState.replaceTerritoryOwnership(ownershipByServerId);
    }
  };
  const coordinator = createOwnershipProjectionReplacementCoordinator({ ownershipHistoryResolver: resolver, ownershipProjectionComparator: createOwnershipProjectionComparator(), ownershipRecordService: history, serverStateService: serverStateInterface, mutationCoordinator: mutation });
  return { coordinator, serverState, history, audit, get commits() { return commits; }, durableCommit() { commits += 1; if (failCommit) throw new Error("commit failed"); } };
}
async function runReplace(context, input, options = {}) {
  return context.coordinator.replace(input, context.durableCommit.bind(context));
}
function expectRecovery(resultValue, reason) { assert.strictEqual(resultValue.status, "recovery_required"); if (reason) assert.strictEqual(resultValue.reason, reason); }

test("returns unchanged without mutation or durable commit", async () => {
  const context = setup({ stored: { "1-1": "union-1" } });
  const before = context.serverState.captureTransactionState();
  const output = await runReplace(context, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({ "1-1": "union-1" }) });
  assert.strictEqual(output.status, "unchanged"); assert.strictEqual(context.commits, 0); assert.deepStrictEqual(context.serverState.captureTransactionState(), before);
  assert.deepStrictEqual(output.rebuiltProjection.ownership, { "1-1": "union-1" });
});

test("repairs missing, stale, and orphan drift with owned/unclaimed mapping", async () => {
  for (const stored of [{}, { "1-1": "wrong" }, { "9-9": null }]) {
    const context = setup({ stored });
    const output = await runReplace(context, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted(stored) });
    assert.strictEqual(output.status, "repaired"); assert.deepStrictEqual(context.serverState.getTerritoryOwnership("server-366"), { "1-1": "union-1" }); assert.strictEqual(context.commits, 1);
  }
  const unclaimed = setup({ resolvedResult: result([territory(1, 2, "unclaimed", null)]), stored: {} });
  await runReplace(unclaimed, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) });
  assert.deepStrictEqual(unclaimed.serverState.getTerritoryOwnership("server-366"), { "1-2": null });
});

test("refuses uncertainty, exact unknown, contradiction, and invalid persisted state", async () => {
  const uncertain = setup({ resolvedResult: result([territory(1, 1)], { uncertainty: [{ kind: "territory", recordId: "bounded", targetKey: '["normal_map_cell",1,2]', target: { type: "normal_map_cell", row: 1, col: 2 }, precision: "bounded", eventAt: {} }] }) });
  expectRecovery(await runReplace(uncertain, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) }), "uncertain_authoritative_history");
  const unknown = setup({ resolvedResult: result([territory(1, 1, "unknown", null)]) });
  expectRecovery(await runReplace(unknown, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) }), "unrepresentable_ownership_state");
  const contradiction = setup({ resolveError: "contradiction" });
  expectRecovery(await runReplace(contradiction, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) }), "contradictory_authoritative_history");
  const malformed = setup();
  expectRecovery(await runReplace(malformed, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}, { savedAt: "bad" }) }));
});

test("preserves other servers and refuses context mismatch", async () => {
  const context = setup({ stored: {} }); const otherBefore = context.serverState.getTerritoryOwnership("server-367");
  const output = await runReplace(context, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) });
  assert.strictEqual(output.status, "repaired"); assert.deepStrictEqual(context.serverState.getTerritoryOwnership("server-367"), otherBefore);
  expectRecovery(await runReplace(context, { seasonId: "season-2", serverId: "server-366", persistedProjection: persisted({}) }), "context_mismatch");
  const missingServer = setup({ stored: {}, extraServers: false });
  expectRecovery(await runReplace(missingServer, { seasonId: "season-1", serverId: "server-367", persistedProjection: persisted({}) }), "context_mismatch");
});

test("rolls back replacement and durable commit failures", async () => {
  const failedReplace = setup({ stored: { "5-5": "original" }, failReplace: true }); const beforeReplace = failedReplace.serverState.captureTransactionState();
  await assert.rejects(() => runReplace(failedReplace, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({ "5-5": "original" }) }), /replace failed/);
  assert.deepStrictEqual(failedReplace.serverState.captureTransactionState(), beforeReplace);
  const failedCommit = setup({ stored: { "5-5": "original" }, failCommit: true }); const beforeCommit = failedCommit.serverState.captureTransactionState();
  await assert.rejects(() => runReplace(failedCommit, { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({ "5-5": "original" }) }), /commit failed/);
  assert.deepStrictEqual(failedCommit.serverState.captureTransactionState(), beforeCommit);
});

test("is idempotent and does not change history or audit participants", async () => {
  const context = setup({ stored: {} }); const historyBefore = { territory: context.history.listTerritoryRecords(), structures: context.history.listStructureRecords() };
  const input = { seasonId: "season-1", serverId: "server-366", persistedProjection: persisted({}) };
  const first = await runReplace(context, input); const second = await runReplace(context, { ...input, persistedProjection: persisted({ "1-1": "union-1" }) });
  assert.strictEqual(first.status, "repaired"); assert.strictEqual(second.status, "unchanged"); assert.strictEqual(context.commits, 1);
  assert.deepStrictEqual({ territory: context.history.listTerritoryRecords(), structures: context.history.listStructureRecords() }, historyBefore); assert.strictEqual(context.audit.appends, 0);
});

test("supports browser globals and has no host integration", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-projection-replacement-coordinator.js"), "utf8"); const sandbox = { globalThis: {} };
  vm.createContext(sandbox); vm.runInContext(source, sandbox); assert.strictEqual(typeof sandbox.globalThis.createOwnershipProjectionReplacementCoordinator, "function");
  assert.ok(!/persistence|generation|applicationAudit|electron|ipcRenderer|ipcMain|document|fetch|WebSocket|score|fs|crypto|clock/.test(source));
});

(async () => { let passed = 0; for (const entry of tests) { await entry.fn(); passed += 1; console.log(`PASS ${entry.name}`); } console.log(`${passed} ownership projection replacement scenarios passed`); })().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });