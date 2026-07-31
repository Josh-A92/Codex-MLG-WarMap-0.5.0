const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createServerDataCompletenessService,
  ServerDataCompletenessServiceError
} = require("../src/services/server-data-completeness-service.js");

function unionResult(overrides = {}) {
  return {
    valid: true,
    errors: [],
    warnings: [],
    view: {
      currentNativeAssignment: { assignmentId: "native-1" },
      activity: {
        verificationHealth: "current",
        canonicalStatus: { activityState: "active" }
      },
      latestCombatStrengthObservation: { observationId: "combat-1" },
      ...overrides
    }
  };
}
function input() {
  return {
    serverIntelligenceView: {
      unions: [
        unionResult(),
        unionResult({
          currentNativeAssignment: null,
          activity: {
            verificationHealth: "stale",
            canonicalStatus: { activityState: "inactive" }
          },
          latestCombatStrengthObservation: null
        }),
        { valid: false, errors: [{ code: "conflict" }], warnings: [], view: null }
      ]
    },
    snapshotProjection: {
      requiredTerritoryTargetCount: 400,
      verifiedTerritoryTargetCount: 376,
      requiredStructureTargetCount: 80,
      verifiedStructureTargetCount: 80
    },
    pendingReviewCount: 3
  };
}

const service = createServerDataCompletenessService();
assert.deepStrictEqual(service.evaluate(input()), {
  territoryCoverage: { verified: 376, required: 400, complete: false },
  structureVerification: { verified: 80, required: 80, complete: true },
  nativeUnionVerification: { verified: 1, required: 3, complete: false },
  activeUnionInformation: { verified: 1, required: 3, complete: false },
  combatStrengthCoverage: { verified: 1, required: 1, complete: true },
  evidenceAwaitingReview: { count: 3 }
});

const empty = input();
empty.serverIntelligenceView.unions = [];
empty.snapshotProjection = {
  requiredTerritoryTargetCount: 0,
  verifiedTerritoryTargetCount: 0,
  requiredStructureTargetCount: 0,
  verifiedStructureTargetCount: 0
};
empty.pendingReviewCount = 0;
assert.strictEqual(service.evaluate(empty).combatStrengthCoverage.complete, true);

const inconsistent = input();
inconsistent.snapshotProjection.verifiedTerritoryTargetCount = 401;
assert.throws(
  () => service.evaluate(inconsistent),
  (error) => error instanceof ServerDataCompletenessServiceError
    && error.code === "inconsistent_state"
);
assert.throws(() => service.evaluate({}), /requires input/);
const unknown = input();
unknown.extra = true;
assert.throws(() => service.evaluate(unknown), /does not recognize/);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "server-data-completeness-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createServerDataCompletenessService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
console.log("ok - server data completeness service");
console.log("\n1 test passed");
