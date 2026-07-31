const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateServerObservation,
  validateServerObservationHistory
} = require("../src/services/server-observation-validator.js");
const {
  createServerObservationService,
  ServerObservationServiceError
} = require("../src/services/server-observation-service.js");

function observation(overrides = {}) {
  return {
    observationId: "observation-1",
    serverId: "server-366",
    seasonId: "season-1",
    text: "Eastern territory is obscured.",
    observedAt: "2026-07-25T09:15:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "user-1",
    reviewState: "confirmed",
    reviewerId: "user-1",
    reviewedAt: "2026-07-25T09:16:00Z",
    supersededBy: null,
    ...overrides
  };
}

function create(initialObservations = []) {
  return createServerObservationService({
    initialObservations,
    validateServerObservation,
    validateServerObservationHistory
  });
}

const service = create();
assert.strictEqual(service.hasObservation("observation-1"), false);
service.addObservation(observation());
assert.strictEqual(service.hasObservation("observation-1"), true);
assert.strictEqual(service.getObservation("missing"), null);
assert.strictEqual(service.listObservations({ serverId: "server-366" }).length, 1);
assert.strictEqual(service.listObservations({ seasonId: "other-season" }).length, 0);
assert.throws(
  () => service.addObservation(observation()),
  (error) => error instanceof ServerObservationServiceError
    && error.code === "duplicate_observation"
);

const proposed = observation({
  observationId: "proposal-1",
  sourceType: "screenshot_extraction",
  evidenceIds: ["evidence-1"],
  reviewState: "proposed",
  reviewerId: null,
  reviewedAt: null
});
service.addObservation(proposed);
const confirmed = { ...proposed, reviewState: "confirmed", reviewerId: "reviewer-1", reviewedAt: "2026-07-25T09:17:00Z" };
assert.strictEqual(service.reviewProposal("proposal-1", confirmed).reviewState, "confirmed");
assert.throws(
  () => service.reviewProposal("proposal-1", { ...confirmed, text: "Changed while reviewing." }),
  (error) => error.code === "invalid_transition"
);

const correction = observation({
  observationId: "observation-2",
  text: "The eastern territory is visible; the prior note was incorrect.",
  reviewedAt: "2026-07-25T09:18:00Z"
});
const corrected = service.correctConfirmed("observation-1", correction);
assert.strictEqual(corrected.superseded.supersededBy, "observation-2");
assert.strictEqual(service.getObservation("observation-2").reviewState, "confirmed");
assert.throws(
  () => service.correctConfirmed("observation-1", correction),
  (error) => error.code === "invalid_transition"
);

const beforeInvalid = service.listObservations();
assert.throws(() => service.addObservation(observation({ observationId: "bad", text: " " })));
assert.throws(() => service.correctConfirmed("observation-2", observation({
  observationId: "wrong-scope",
  serverId: "server-367",
  reviewedAt: "2026-07-25T09:19:00Z"
})));
assert.deepStrictEqual(service.listObservations(), beforeInvalid);

const input = observation({
  observationId: "isolated",
  evidenceIds: ["evidence-isolated"]
});
const isolated = create([input]);
input.evidenceIds[0] = "changed";
const returned = isolated.getObservation("isolated");
returned.evidenceIds[0] = "changed-again";
assert.strictEqual(isolated.getObservation("isolated").evidenceIds[0], "evidence-isolated");

assert.throws(() => createServerObservationService({}), /requires options/);
assert.throws(() => service.listObservations({ unknown: "value" }), /does not recognize/);
assert.throws(() => service.getObservation(" "), /non-empty/);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "server-observation-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createServerObservationService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - server observation service");
console.log("\n1 test passed");
