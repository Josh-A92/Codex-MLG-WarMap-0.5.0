const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createReviewQueueService, ReviewQueueServiceError } =
  require("../src/services/review-queue-service.js");

function proposal(id, overrides = {}) {
  return {
    assignmentId: id,
    observationId: id,
    ownershipRecordId: id,
    structureOwnershipId: id,
    evidenceId: id,
    seasonId: "season-1",
    serverId: "server-366",
    observedAt: "2026-07-30T10:00:00Z",
    effectiveAt: "2026-07-30T10:00:00Z",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-source"],
    reviewState: "proposed",
    ...overrides
  };
}

function dependencies() {
  const calls = [];
  function list(name, records) {
    return function listRecords(filter) {
      calls.push({ name, filter });
      return records;
    };
  }
  return {
    calls,
    options: {
      nativeAssignmentService: {
        listAssignments: list("native", [proposal("native-1", { observedAt: "2026-07-30T09:00:00Z" })])
      },
      combatStrengthObservationService: {
        listObservations: list("combat", [proposal("combat-1", { observedAt: "2026-07-30T11:00:00Z" })])
      },
      serverObservationService: {
        listObservations: list("server", [proposal("server-1")])
      },
      ownershipRecordService: {
        listTerritoryRecords: list("territory", [proposal("territory-1")]),
        listStructureRecords: list("structure", [proposal("structure-1")])
      },
      evidenceRecordService: {
        listEvidenceRecords: list("evidence", [proposal("evidence-1")])
      },
      resolveEvidenceScope() {
        return { seasonId: "season-1", serverId: "server-366" };
      }
    }
  };
}

const deps = dependencies();
const service = createReviewQueueService(deps.options);
const all = service.listPendingReviews();
assert.strictEqual(all.length, 6);
assert.strictEqual(all[0].itemType, "combat_strength_observation");
assert.ok(all.every((item) => item.record.reviewState === "proposed"));
assert.ok(deps.calls.every((call) => call.filter.reviewState === "proposed"));

const territory = service.listPendingReviews({
  seasonId: "season-1",
  serverId: "server-366",
  itemType: "territory_ownership"
});
assert.strictEqual(territory.length, 1);
assert.strictEqual(territory[0].itemId, "territory-1");
const latestCalls = deps.calls.slice(-1);
assert.deepStrictEqual(latestCalls[0], {
  name: "territory",
  filter: { seasonId: "season-1", serverId: "server-366", reviewState: "proposed" }
});

all[0].record.reviewState = "changed";
assert.strictEqual(service.listPendingReviews()[0].record.reviewState, "proposed");

assert.throws(
  () => createReviewQueueService({}),
  (error) => error instanceof ReviewQueueServiceError && error.code === "invalid_factory"
);
assert.throws(() => service.listPendingReviews({ itemType: "unknown" }), /does not recognize item type/);
assert.throws(() => service.listPendingReviews({ extra: true }), /does not recognize filter/);

const malformed = dependencies();
malformed.options.serverObservationService.listObservations = () => ({});
assert.throws(
  () => createReviewQueueService(malformed.options).listPendingReviews(),
  (error) => error.code === "invalid_dependency"
);

class NativeService {
  listAssignments() {
    assert.strictEqual(this instanceof NativeService, true);
    return [];
  }
}
const classDeps = dependencies();
classDeps.options.nativeAssignmentService = new NativeService();
assert.doesNotThrow(() => createReviewQueueService(classDeps.options).listPendingReviews());

const invalidEvidenceScope = dependencies();
invalidEvidenceScope.options.resolveEvidenceScope = () => ({});
assert.throws(
  () => createReviewQueueService(invalidEvidenceScope.options).listPendingReviews(),
  (error) => error.code === "invalid_dependency"
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "review-queue-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createReviewQueueService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
console.log("ok - review queue service");
console.log("\n1 test passed");
