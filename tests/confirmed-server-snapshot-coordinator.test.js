const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createConfirmedServerSnapshotCoordinator,
  ConfirmedServerSnapshotCoordinatorError
} = require("../src/services/confirmed-server-snapshot-coordinator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function territoryOwnership(overrides) {
  return Object.assign({
    ownershipRecordId: "ownership-cell-1",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function structureOwnership(overrides) {
  return Object.assign({
    structureOwnershipId: "ownership-structure-1",
    serverId: "server-366",
    seasonId: "season-1",
    structureId: "structure-town-1",
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function verification(overrides) {
  return Object.assign({
    verificationId: "verification-cell-1",
    serverId: "server-366",
    seasonId: "season-1",
    targetRef: { type: "normal_map_cell", row: 1, col: 1 },
    verifiedOwnershipRef: {
      type: "territory_ownership_record",
      recordId: "ownership-cell-1"
    },
    observedAt: "2026-07-29T00:00:00Z",
    reviewState: "confirmed",
    supersededBy: null
  }, overrides || {});
}

function structureVerification(overrides) {
  return verification(Object.assign({
    verificationId: "verification-structure-1",
    targetRef: { type: "logical_structure", structureId: "structure-town-1" },
    verifiedOwnershipRef: {
      type: "structure_ownership_record",
      recordId: "ownership-structure-1"
    }
  }, overrides || {}));
}

function request(overrides) {
  return Object.assign({
    snapshotId: "snapshot-2",
    serverId: "server-366",
    seasonId: "season-1",
    createdAt: "2026-07-29T01:00:00Z",
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "logical_structure", structureId: "structure-town-1" }
    ],
    unionStatusRecordIds: ["status-1"],
    evidenceIds: ["evidence-1"],
    creatorId: "actor-1",
    reviewerId: "reviewer-1",
    completenessRecordIds: ["completeness-1"]
  }, overrides || {});
}

function dependencies(overrides) {
  const territoryRecords = [territoryOwnership()];
  const structureRecords = [structureOwnership()];
  const verificationRecords = [verification(), structureVerification()];
  const currentByKey = new Map([
    [JSON.stringify(["normal_map_cell", 1, 1]), verificationRecords[0]],
    [JSON.stringify(["logical_structure", "structure-town-1"]), verificationRecords[1]]
  ]);

  return Object.assign({
    ownershipRecordService: {
      listTerritoryRecords() {
        return territoryRecords;
      },
      listStructureRecords() {
        return structureRecords;
      }
    },
    targetVerificationService: {
      listVerifications() {
        return verificationRecords;
      },
      getCurrentVerification(serverId, seasonId, targetRef) {
        const key = targetRef.type === "normal_map_cell"
          ? JSON.stringify([targetRef.type, targetRef.row, targetRef.col])
          : JSON.stringify([targetRef.type, targetRef.structureId]);
        return currentByKey.get(key) || null;
      }
    },
    confirmedSnapshotService: {
      getCurrentSnapshot() {
        return { snapshotId: "snapshot-1" };
      },
      evaluateSnapshot(input) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          projection: {
            completeCoverage: input.snapshot.verificationRecordIds.length === input.requiredTargetRefs.length
          }
        };
      },
      addConfirmedSnapshot(input) {
        return {
          snapshot: input.snapshot,
          projection: {
            completeCoverage: input.snapshot.verificationRecordIds.length === input.requiredTargetRefs.length
          }
        };
      }
    }
  }, overrides || {});
}

function createCoordinator(overrides) {
  return createConfirmedServerSnapshotCoordinator(dependencies(overrides));
}

function expectCoordinatorError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ConfirmedServerSnapshotCoordinatorError);
    assert.strictEqual(error.code, code);
    if (pattern) {
      assert.match(error.message, pattern);
    }
    return true;
  });
}

runTest("factory is strict and validates every dependency method", () => {
  expectCoordinatorError(() => createConfirmedServerSnapshotCoordinator({}), "invalid_input", /requires options/);
  expectCoordinatorError(() => createConfirmedServerSnapshotCoordinator(dependencies({ extra: true })), "invalid_input", /field 'extra'/);
  expectCoordinatorError(() => createConfirmedServerSnapshotCoordinator(dependencies({
    ownershipRecordService: []
  })), "invalid_input", /object interface/);
  expectCoordinatorError(() => createConfirmedServerSnapshotCoordinator(dependencies({
    targetVerificationService: {}
  })), "invalid_input", /listVerifications/);
  expectCoordinatorError(() => createConfirmedServerSnapshotCoordinator(dependencies({
    confirmedSnapshotService: { getCurrentSnapshot() {} }
  })), "invalid_input", /evaluateSnapshot/);
});

runTest("class-based dependencies retain their method context", () => {
  class OwnershipService {
    constructor() {
      this.calls = 0;
    }
    listTerritoryRecords() {
      this.calls += 1;
      return [territoryOwnership()];
    }
    listStructureRecords() {
      this.calls += 1;
      return [structureOwnership()];
    }
  }
  const ownership = new OwnershipService();
  const other = dependencies();
  const coordinator = createConfirmedServerSnapshotCoordinator({
    ownershipRecordService: ownership,
    targetVerificationService: other.targetVerificationService,
    confirmedSnapshotService: other.confirmedSnapshotService
  });
  coordinator.assembleEvaluationInput(request());
  assert.strictEqual(ownership.calls, 2);
});

runTest("assembly scopes histories and carries the previous snapshot automatically", () => {
  const calls = [];
  const base = dependencies();
  base.ownershipRecordService.listTerritoryRecords = function listTerritoryRecords(filter) {
    calls.push(["territory", filter]);
    return [territoryOwnership()];
  };
  base.ownershipRecordService.listStructureRecords = function listStructureRecords(filter) {
    calls.push(["structure", filter]);
    return [structureOwnership()];
  };
  base.targetVerificationService.listVerifications = function listVerifications(filter) {
    calls.push(["verification", filter]);
    return [verification(), structureVerification()];
  };

  const coordinator = createConfirmedServerSnapshotCoordinator(base);
  const result = coordinator.assembleEvaluationInput(request());

  assert.deepStrictEqual(calls, [
    ["territory", { serverId: "server-366", seasonId: "season-1" }],
    ["structure", { serverId: "server-366", seasonId: "season-1" }],
    ["verification", { serverId: "server-366", seasonId: "season-1" }]
  ]);
  assert.strictEqual(result.snapshot.previousConfirmedSnapshotId, "snapshot-1");
  assert.deepStrictEqual(result.snapshot.ownershipRecordIds, ["ownership-cell-1"]);
  assert.deepStrictEqual(result.snapshot.structureOwnershipRecordIds, ["ownership-structure-1"]);
  assert.deepStrictEqual(result.snapshot.verificationRecordIds, [
    "verification-cell-1",
    "verification-structure-1"
  ]);
});

runTest("first snapshot uses a null previous snapshot ID", () => {
  const base = dependencies();
  base.confirmedSnapshotService.getCurrentSnapshot = function getCurrentSnapshot() {
    return null;
  };
  const result = createConfirmedServerSnapshotCoordinator(base).assembleEvaluationInput(request());
  assert.strictEqual(result.snapshot.previousConfirmedSnapshotId, null);
});

runTest("partial coverage omits never-confirmed targets without erasing available facts", () => {
  const base = dependencies();
  const originalGet = base.targetVerificationService.getCurrentVerification;
  base.targetVerificationService.getCurrentVerification = function getCurrentVerification(serverId, seasonId, targetRef) {
    if (targetRef.type === "logical_structure") {
      return null;
    }
    return originalGet.call(this, serverId, seasonId, targetRef);
  };

  const result = createConfirmedServerSnapshotCoordinator(base).assembleEvaluationInput(request());
  assert.deepStrictEqual(result.snapshot.verificationRecordIds, ["verification-cell-1"]);
  assert.deepStrictEqual(result.snapshot.ownershipRecordIds, ["ownership-cell-1"]);
  assert.deepStrictEqual(result.snapshot.structureOwnershipRecordIds, []);
  assert.strictEqual(result.requiredTargetRefs.length, 2);
});

runTest("duplicate required targets and metadata IDs are rejected before assembly", () => {
  const coordinator = createCoordinator();
  expectCoordinatorError(() => coordinator.assembleEvaluationInput(request({
    requiredTargetRefs: [
      { type: "normal_map_cell", row: 1, col: 1 },
      { type: "normal_map_cell", row: 1, col: 1 }
    ]
  })), "invalid_input", /unique targets/);
  expectCoordinatorError(() => coordinator.assembleEvaluationInput(request({
    evidenceIds: ["evidence-1", "evidence-1"]
  })), "invalid_input", /unique IDs/);
});

runTest("preview evaluates without confirming and returns a safe copy", () => {
  let evaluated = 0;
  let confirmed = 0;
  const base = dependencies();
  base.confirmedSnapshotService.evaluateSnapshot = function evaluateSnapshot(input) {
    evaluated += 1;
    return { valid: true, errors: [], warnings: [], projection: { snapshotId: input.snapshot.snapshotId } };
  };
  base.confirmedSnapshotService.addConfirmedSnapshot = function addConfirmedSnapshot() {
    confirmed += 1;
    return {};
  };

  const result = createConfirmedServerSnapshotCoordinator(base).previewSnapshot(request());
  assert.strictEqual(result.projection.snapshotId, "snapshot-2");
  assert.strictEqual(evaluated, 1);
  assert.strictEqual(confirmed, 0);
});

runTest("confirm delegates the fully assembled candidate exactly once", () => {
  let captured = null;
  const base = dependencies();
  base.confirmedSnapshotService.addConfirmedSnapshot = function addConfirmedSnapshot(input) {
    captured = input;
    return { snapshot: input.snapshot, projection: { completeCoverage: true } };
  };

  const result = createConfirmedServerSnapshotCoordinator(base).confirmSnapshot(request());
  assert.strictEqual(captured.snapshot.snapshotId, "snapshot-2");
  assert.strictEqual(captured.snapshot.previousConfirmedSnapshotId, "snapshot-1");
  assert.strictEqual(result.projection.completeCoverage, true);
});

runTest("strict input and target boundaries reject malformed requests before service mutation", () => {
  const coordinator = createCoordinator();
  expectCoordinatorError(() => coordinator.confirmSnapshot({}), "invalid_input", /requires input/);
  expectCoordinatorError(() => coordinator.confirmSnapshot(request({ extra: true })), "invalid_input", /field 'extra'/);
  expectCoordinatorError(() => coordinator.confirmSnapshot(request({ evidenceIds: [" "] })), "invalid_input");
  expectCoordinatorError(() => coordinator.confirmSnapshot(request({
    requiredTargetRefs: [{ type: "normal_map_cell", row: 0, col: 1 }]
  })), "invalid_input");
  expectCoordinatorError(() => coordinator.confirmSnapshot(request({
    requiredTargetRefs: [{ type: "other" }]
  })), "invalid_input");
});

runTest("inconsistent verification ownership types fail clearly", () => {
  const base = dependencies();
  base.targetVerificationService.getCurrentVerification = function getCurrentVerification() {
    return verification({
      verifiedOwnershipRef: { type: "unknown", recordId: "record-1" }
    });
  };
  expectCoordinatorError(
    () => createConfirmedServerSnapshotCoordinator(base).assembleEvaluationInput(request({
      requiredTargetRefs: [{ type: "normal_map_cell", row: 1, col: 1 }]
    })),
    "inconsistent_state",
    /unsupported verified ownership/
  );
});

runTest("malformed dependency results fail with consistent-state errors", () => {
  const badCollection = dependencies();
  badCollection.ownershipRecordService.listTerritoryRecords = function listTerritoryRecords() {
    return null;
  };
  expectCoordinatorError(
    () => createConfirmedServerSnapshotCoordinator(badCollection).assembleEvaluationInput(request()),
    "inconsistent_state",
    /return an array/
  );

  const badVerification = dependencies();
  badVerification.targetVerificationService.getCurrentVerification = function getCurrentVerification() {
    return "invalid";
  };
  expectCoordinatorError(
    () => createConfirmedServerSnapshotCoordinator(badVerification).assembleEvaluationInput(request({
      requiredTargetRefs: [{ type: "normal_map_cell", row: 1, col: 1 }]
    })),
    "inconsistent_state",
    /plain objects or null/
  );

  const badSnapshot = dependencies();
  badSnapshot.confirmedSnapshotService.getCurrentSnapshot = function getCurrentSnapshot() {
    return {};
  };
  expectCoordinatorError(
    () => createConfirmedServerSnapshotCoordinator(badSnapshot).assembleEvaluationInput(request()),
    "invalid_input",
    /currentSnapshot.snapshotId/
  );
});

runTest("dependency failures pass through unchanged", () => {
  const expected = new Error("downstream failure");
  const base = dependencies();
  base.confirmedSnapshotService.addConfirmedSnapshot = function addConfirmedSnapshot() {
    throw expected;
  };
  assert.throws(
    () => createConfirmedServerSnapshotCoordinator(base).confirmSnapshot(request()),
    (error) => error === expected
  );
});

runTest("assembled inputs and returned results retain no caller or dependency references", () => {
  const sourceRequest = request();
  const base = dependencies();
  const coordinator = createConfirmedServerSnapshotCoordinator(base);
  const assembled = coordinator.assembleEvaluationInput(sourceRequest);

  sourceRequest.requiredTargetRefs[0].row = 99;
  assembled.snapshot.evidenceIds.push("mutated");
  const second = coordinator.assembleEvaluationInput(request());
  assert.strictEqual(assembled.requiredTargetRefs[0].row, 1);
  assert.deepStrictEqual(second.snapshot.evidenceIds, ["evidence-1"]);
});

runTest("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  assert.strictEqual(typeof createConfirmedServerSnapshotCoordinator, "function");
  assert.strictEqual(typeof ConfirmedServerSnapshotCoordinatorError, "function");

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "confirmed-server-snapshot-coordinator.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createConfirmedServerSnapshotCoordinator, "function");
  assert.strictEqual(typeof sandbox.globalThis.ConfirmedServerSnapshotCoordinatorError, "function");
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
