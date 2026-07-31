const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createServerIntelligenceViewService,
  ServerIntelligenceViewServiceError
} = require("../src/services/server-intelligence-view-service.js");

function dependencies() {
  return {
    unionServerSeasonIntelligenceViewService: {
      listViews(request) {
        assert.deepStrictEqual(request, {
          seasonId: "season-1",
          serverId: "server-366",
          evaluatedAt: "2026-07-30T12:00:00Z"
        });
        return [
          { valid: true, errors: [], warnings: [], view: { relation: { unionId: "union-1" } } },
          { valid: false, errors: [{ code: "stale" }], warnings: [], view: null }
        ];
      }
    },
    serverObservationService: {
      listObservations(filter) {
        assert.deepStrictEqual(filter, {
          seasonId: "season-1",
          serverId: "server-366",
          reviewState: "confirmed"
        });
        return [
          {
            observationId: "observation-later",
            seasonId: "season-1",
            serverId: "server-366",
            observedAt: "2026-07-30T10:00:00Z",
            reviewState: "confirmed"
          },
          {
            observationId: "observation-earlier",
            seasonId: "season-1",
            serverId: "server-366",
            observedAt: "2026-07-29T10:00:00Z",
            reviewState: "confirmed"
          }
        ];
      }
    }
  };
}

const request = {
  seasonId: "season-1",
  serverId: "server-366",
  evaluatedAt: "2026-07-30T12:00:00Z"
};
const service = createServerIntelligenceViewService(dependencies());
const view = service.getView(request);
assert.deepStrictEqual(
  [view.seasonId, view.serverId, view.evaluatedAt],
  ["season-1", "server-366", "2026-07-30T12:00:00Z"]
);
assert.strictEqual(view.unions.length, 2);
assert.strictEqual(view.unions[1].valid, false);
assert.deepStrictEqual(
  view.confirmedObservations.map((entry) => entry.observationId),
  ["observation-later", "observation-earlier"]
);

view.unions[0].view.relation.unionId = "changed";
view.confirmedObservations[0].observationId = "changed";
const secondView = service.getView(request);
assert.strictEqual(secondView.unions[0].view.relation.unionId, "union-1");
assert.strictEqual(secondView.confirmedObservations[0].observationId, "observation-later");

assert.throws(
  () => createServerIntelligenceViewService({}),
  (error) => error instanceof ServerIntelligenceViewServiceError
    && error.code === "invalid_input"
);
assert.throws(() => service.getView({}), /requires input/);
assert.throws(() => service.getView({ ...request, extra: true }), /does not recognize/);

const invalidUnions = dependencies();
invalidUnions.unionServerSeasonIntelligenceViewService.listViews = () => ({});
assert.throws(
  () => createServerIntelligenceViewService(invalidUnions).getView(request),
  (error) => error.code === "invalid_dependency"
);
const invalidObservations = dependencies();
invalidObservations.serverObservationService.listObservations = () => [null];
assert.throws(
  () => createServerIntelligenceViewService(invalidObservations).getView(request),
  (error) => error.code === "invalid_dependency"
);

class ObservationSource {
  listObservations() {
    assert.strictEqual(this instanceof ObservationSource, true);
    return [];
  }
}
const classDependencies = dependencies();
classDependencies.serverObservationService = new ObservationSource();
assert.doesNotThrow(() => createServerIntelligenceViewService(classDependencies).getView(request));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "server-intelligence-view-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createServerIntelligenceViewService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - server intelligence view service");
console.log("\n1 test passed");
