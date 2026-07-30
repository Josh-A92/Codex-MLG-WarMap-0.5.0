const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createActiveUnionStatusUpdateCoordinator,
  ActiveUnionStatusUpdateCoordinatorError
} = require("../src/services/active-union-status-update-coordinator.js");
const { createActiveUnionStatusEvaluator } = require("../src/services/active-union-status-evaluator.js");
const { createActiveUnionStatusService } = require("../src/services/active-union-status-service.js");
const { createActivityFactHistoryService } = require("../src/services/activity-fact-history-service.js");
const { createUnionServerSeasonRelationService } = require("../src/services/union-server-season-relation-service.js");
const {
  validateActiveUnionStatus,
  validateActiveUnionStatusHistory
} = require("../src/services/active-union-status-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function presenceFact(overrides) {
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

function zeroFact(overrides) {
  return Object.assign({
    snapshotId: "snapshot-2",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    fullConfirmationAt: "2026-07-02T00:00:00Z",
    ownedTerritoryCount: 0
  }, overrides || {});
}

function identity(overrides) {
  return Object.assign({
    statusId: "status-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    evaluatedAt: "2026-07-01T01:00:00Z"
  }, overrides || {});
}

function createRealStatusService() {
  return createActiveUnionStatusService({
    initialStatuses: [],
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory
  });
}

function createDependencies(facts, overrides) {
  return Object.assign({
    snapshotActivityFactResolver: {
      resolve() {
        return {
          valid: true,
          errors: [],
          warnings: [],
          facts: facts || {
            confirmedPresenceFacts: [presenceFact()],
            qualifyingFullMapConfirmations: []
          }
        };
      }
    },
    activeUnionStatusEvaluator: createActiveUnionStatusEvaluator({ validateActiveUnionStatus }),
    activeUnionStatusService: createRealStatusService(),
    activityFactHistoryService: createActivityFactHistoryService(),
    relationService: createUnionServerSeasonRelationService([{
      seasonId: "season-1",
      serverId: "server-366",
      unionId: "union-1",
      currentNativeStatusId: null,
      currentActiveStatusId: null,
      firstConfirmedPresenceAt: null,
      mostRecentConfirmedPresenceAt: null,
      evidenceIds: [],
      manualOverride: null
    }])
  }, overrides || {});
}

function request(overrides) {
  return Object.assign({
    identity: identity(),
    snapshotFactInput: { event: "opaque-to-coordinator" }
  }, overrides || {});
}

runTest("factory is strict and supports class-based bound dependencies", () => {
  assert.throws(() => createActiveUnionStatusUpdateCoordinator({}), (error) => {
    assert.ok(error instanceof ActiveUnionStatusUpdateCoordinatorError);
    assert.strictEqual(error.code, "invalid_input");
    return true;
  });
  assert.throws(() => createActiveUnionStatusUpdateCoordinator(Object.assign(createDependencies(), {
    extra: true
  })), /does not recognize/);

  class Resolver {
    constructor() {
      this.calls = 0;
    }
    resolve() {
      this.calls += 1;
      return { valid: true, errors: [], warnings: [], facts: {
        confirmedPresenceFacts: [presenceFact()],
        qualifyingFullMapConfirmations: []
      } };
    }
  }
  const resolver = new Resolver();
  const deps = createDependencies();
  const coordinator = createActiveUnionStatusUpdateCoordinator(Object.assign(deps, {
    snapshotActivityFactResolver: resolver
  }));
  assert.strictEqual(coordinator.processSnapshot(request()).valid, true);
  assert.strictEqual(resolver.calls, 1);
});

runTest("first positive snapshot appends a confirmed active status", () => {
  const deps = createDependencies();
  const coordinator = createActiveUnionStatusUpdateCoordinator(deps);
  const result = coordinator.processSnapshot(request());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.update.requiresReplacement, true);
  assert.strictEqual(result.update.appendedStatus.activityState, "active");
  assert.strictEqual(result.update.appendedStatus.derivedFrom, "confirmed_ownership");
  assert.strictEqual(
    deps.activeUnionStatusService.getCurrentStatus("season-1", "server-366", "union-1").statusId,
    "status-1"
  );
  const relation = deps.relationService.getRelation("season-1", "server-366", "union-1");
  assert.strictEqual(relation.currentActiveStatusId, "status-1");
  assert.strictEqual(relation.firstConfirmedPresenceAt, "2026-07-01T00:00:00Z");
});

runTest("unchanged facts do not append a replacement status", () => {
  const deps = createDependencies();
  const coordinator = createActiveUnionStatusUpdateCoordinator(deps);
  coordinator.processSnapshot(request());
  const before = deps.activeUnionStatusService.listStatuses();
  deps.snapshotActivityFactResolver.resolve = function resolveNoNewFacts() {
    return {
      valid: true,
      errors: [],
      warnings: [],
      facts: {
        confirmedPresenceFacts: [],
        qualifyingFullMapConfirmations: []
      }
    };
  };
  const result = createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(request({
    identity: identity({ statusId: "status-unused" })
  }));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.update.requiresReplacement, false);
  assert.strictEqual(result.update.appendedStatus, null);
  assert.deepStrictEqual(deps.activeUnionStatusService.listStatuses(), before);
});

runTest("new zero snapshot merges with prior presence and starts monitoring", () => {
  const deps = createDependencies();
  const coordinator = createActiveUnionStatusUpdateCoordinator(deps);
  coordinator.processSnapshot(request());

  deps.snapshotActivityFactResolver.resolve = function resolveZero() {
    return {
      valid: true,
      errors: [],
      warnings: [],
      facts: {
        confirmedPresenceFacts: [],
        qualifyingFullMapConfirmations: [zeroFact()]
      }
    };
  };
  const rebound = createActiveUnionStatusUpdateCoordinator(deps);
  const result = rebound.processSnapshot(request({
    identity: identity({
      statusId: "status-2",
      evaluatedAt: "2026-07-02T01:00:00Z"
    })
  }));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.update.appendedStatus.activityState, "active");
  assert.strictEqual(result.update.appendedStatus.derivedFrom, "verified_zero_territory_period");
  assert.strictEqual(result.update.verificationHealth, "monitoring");
  assert.strictEqual(
    deps.activityFactHistoryService.getFacts("season-1", "server-366", "union-1")
      .qualifyingFullMapConfirmations.length,
    1
  );
});

runTest("invalid resolver or evaluator results never append status", () => {
  const statusService = createRealStatusService();
  const invalidResolver = createDependencies(null, {
    snapshotActivityFactResolver: {
      resolve() {
        return { valid: false, errors: [{ code: "bad", path: "input", message: "bad" }], warnings: [], facts: null };
      }
    },
    activeUnionStatusService: statusService
  });
  const result = createActiveUnionStatusUpdateCoordinator(invalidResolver).processSnapshot(request());
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.update, null);
  assert.strictEqual(statusService.listStatuses().length, 0);

  const invalidEvaluator = createDependencies(null, {
    activeUnionStatusEvaluator: {
      evaluate() {
        return { valid: false, errors: [{ code: "bad-eval", path: "input", message: "bad" }], warnings: [], evaluation: null };
      }
    },
    activeUnionStatusService: statusService
  });
  const second = createActiveUnionStatusUpdateCoordinator(invalidEvaluator).processSnapshot(request());
  assert.strictEqual(second.valid, false);
  assert.strictEqual(statusService.listStatuses().length, 0);
});

runTest("strict input boundaries reject malformed requests", () => {
  const coordinator = createActiveUnionStatusUpdateCoordinator(createDependencies());
  assert.throws(() => coordinator.processSnapshot({}), /requires input/);
  assert.throws(() => coordinator.processSnapshot(Object.assign(request(), { extra: true })), /does not recognize/);
  assert.throws(() => coordinator.processSnapshot(request({ snapshotFactInput: [] })), /plain object/);
  assert.throws(() => coordinator.processSnapshot(request({
    identity: identity({ unionId: " " })
  })), /non-empty string/);
});

runTest("failed evaluation does not append resolved facts to history", () => {
  const history = createActivityFactHistoryService();
  const deps = createDependencies(null, {
    activityFactHistoryService: history,
    activeUnionStatusEvaluator: {
      evaluate() {
        return {
          valid: false,
          errors: [{ code: "bad-eval", path: "input", message: "bad" }],
          warnings: [],
          evaluation: null
        };
      }
    }
  });
  const result = createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(request());
  assert.strictEqual(result.valid, false);
  assert.deepStrictEqual(history.getAllFacts(), {
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  });
});

runTest("history preflight failure prevents status and fact mutation", () => {
  const deps = createDependencies();
  deps.activityFactHistoryService.appendResolvedFacts({
    confirmedPresenceFacts: [presenceFact()],
    qualifyingFullMapConfirmations: []
  });
  assert.throws(
    () => createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(request()),
    (error) => error.code === "invalid_dependency"
  );
  assert.strictEqual(deps.activeUnionStatusService.listStatuses().length, 0);
  assert.strictEqual(deps.activityFactHistoryService.getAllFacts().confirmedPresenceFacts.length, 1);
});

runTest("a missing relation prevents all activity mutations", () => {
  const deps = createDependencies(null, {
    relationService: createUnionServerSeasonRelationService([])
  });
  assert.throws(
    () => createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(request()),
    (error) => error.code === "inconsistent_state"
  );
  assert.strictEqual(deps.activeUnionStatusService.listStatuses().length, 0);
  assert.deepStrictEqual(deps.activityFactHistoryService.getAllFacts(), {
    confirmedPresenceFacts: [],
    qualifyingFullMapConfirmations: []
  });
});

runTest("malformed dependency results throw stable coordinator errors", () => {
  const deps = createDependencies(null, {
    snapshotActivityFactResolver: {
      resolve() {
        return {};
      }
    }
  });
  assert.throws(
    () => createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(request()),
    (error) => {
      assert.ok(error instanceof ActiveUnionStatusUpdateCoordinatorError);
      assert.strictEqual(error.code, "invalid_dependency");
      return true;
    }
  );
});

runTest("input and output data remain isolated", () => {
  const source = request();
  const deps = createDependencies();
  const result = createActiveUnionStatusUpdateCoordinator(deps).processSnapshot(source);
  result.update.canonicalStatus.activityState = "mutated";
  source.identity.unionId = "mutated-input";
  assert.strictEqual(
    deps.activeUnionStatusService.getCurrentStatus("season-1", "server-366", "union-1").activityState,
    "active"
  );
});

runTest("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createActiveUnionStatusUpdateCoordinator, "function");
  assert.strictEqual(typeof ActiveUnionStatusUpdateCoordinatorError, "function");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "active-union-status-update-coordinator.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createActiveUnionStatusUpdateCoordinator, "function");
  assert.strictEqual(typeof sandbox.globalThis.ActiveUnionStatusUpdateCoordinatorError, "function");
  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
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
