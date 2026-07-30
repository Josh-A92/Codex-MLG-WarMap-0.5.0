const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createActiveUnionStatusProjectionService,
  ActiveUnionStatusProjectionServiceError
} = require("../src/services/active-union-status-projection-service.js");
const { createActiveUnionStatusEvaluator } = require("../src/services/active-union-status-evaluator.js");
const { validateActiveUnionStatus } = require("../src/services/active-union-status-validator.js");
const { createActivityFactHistoryService } = require("../src/services/activity-fact-history-service.js");

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
    observedAt: "2026-07-01T00:00:00Z",
    ownershipRecordId: "ownership-1",
    snapshotId: "snapshot-1"
  }, overrides || {});
}

function createService(options) {
  return createActiveUnionStatusProjectionService(Object.assign({
    activeUnionStatusEvaluator: createActiveUnionStatusEvaluator({ validateActiveUnionStatus }),
    activeUnionStatusService: {
      getCurrentStatus() {
        return null;
      }
    },
    activityFactHistoryService: createActivityFactHistoryService()
  }, options || {}));
}

function request(overrides) {
  return Object.assign({
    seasonId: "season-1",
    serverId: "server-366",
    unionId: "union-1",
    evaluatedAt: "2026-07-30T00:00:00Z"
  }, overrides || {});
}

test("known relation without facts projects inactive and unverified without mutation", () => {
  const service = createService();
  const result = service.getProjection(request());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.currentStatus, null);
  assert.strictEqual(result.projection.canonicalStatus.activityState, "inactive");
  assert.strictEqual(result.projection.canonicalStatus.derivedFrom, "known_relation_without_confirmed_ownership");
  assert.strictEqual(result.projection.verificationHealth, "unverified");
  assert.strictEqual(result.projection.requiresReplacement, true);
});

test("confirmed presence facts project active status", () => {
  const history = createActivityFactHistoryService({
    initialConfirmedPresenceFacts: [presence()],
    initialQualifyingFullMapConfirmations: []
  });
  const result = createService({ activityFactHistoryService: history }).getProjection(request());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.canonicalStatus.activityState, "active");
  assert.strictEqual(result.projection.canonicalStatus.firstConfirmedPresenceAt, "2026-07-01T00:00:00Z");
  assert.strictEqual(result.projection.verificationHealth, "stale");
});

test("current factual status can become stale at read time without replacement", () => {
  const history = createActivityFactHistoryService({
    initialConfirmedPresenceFacts: [presence()],
    initialQualifyingFullMapConfirmations: []
  });
  const initial = createService({ activityFactHistoryService: history }).getProjection(request({
    evaluatedAt: "2026-07-02T00:00:00Z"
  })).projection.canonicalStatus;
  const result = createService({
    activityFactHistoryService: history,
    activeUnionStatusService: {
      getCurrentStatus() {
        return initial;
      }
    }
  }).getProjection(request({ evaluatedAt: "2026-07-30T00:00:00Z" }));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.projection.requiresReplacement, false);
  assert.strictEqual(result.projection.verificationHealth, "stale");
});

test("strict input dependency and failure boundaries are preserved", () => {
  assert.throws(() => createActiveUnionStatusProjectionService({}), (error) => {
    assert.ok(error instanceof ActiveUnionStatusProjectionServiceError);
    return true;
  });
  const service = createService();
  assert.throws(() => service.getProjection(Object.assign(request(), { extra: true })), /does not recognize/);
  assert.throws(() => service.getProjection(request({ unionId: " " })), /non-empty string/);
  const invalid = createService({
    activeUnionStatusEvaluator: {
      evaluate() {
        return { valid: false, errors: [{ code: "bad", path: "input", message: "bad" }], warnings: [] };
      }
    }
  }).getProjection(request());
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.projection, null);
  assert.throws(() => createService({
    activeUnionStatusEvaluator: {
      evaluate() {
        return { valid: true, errors: [], warnings: [], evaluation: null };
      }
    }
  }).getProjection(request()), (error) => error.code === "invalid_dependency");
});

test("class dependency context safe copies exports and infrastructure boundaries are preserved", () => {
  class StatusService {
    constructor() {
      this.calls = 0;
    }
    getCurrentStatus() {
      this.calls += 1;
      return null;
    }
  }
  const statusService = new StatusService();
  const result = createService({ activeUnionStatusService: statusService }).getProjection(request());
  result.projection.canonicalStatus.activityState = "mutated";
  assert.strictEqual(statusService.calls, 1);
  assert.strictEqual(createService().getProjection(request()).projection.canonicalStatus.activityState, "inactive");

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "active-union-status-projection-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createActiveUnionStatusProjectionService, "function");
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
