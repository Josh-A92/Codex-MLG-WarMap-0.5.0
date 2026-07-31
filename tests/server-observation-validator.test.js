const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateServerObservation,
  validateServerObservationHistory
} = require("../src/services/server-observation-validator.js");

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

assert.strictEqual(validateServerObservation(observation()).valid, true);
assert.strictEqual(validateServerObservation(observation({
  sourceType: "screenshot_extraction",
  evidenceIds: ["evidence-1"],
  reviewState: "proposed",
  reviewerId: null,
  reviewedAt: null
})).valid, true);
[
  { text: " " },
  { sourceType: "bot_integration", evidenceIds: [] },
  { evidenceIds: ["same", "same"] },
  { reviewedAt: "2026-07-25T09:14:00Z" },
  { reviewState: "proposed" },
  { extra: true }
].forEach((override) => {
  assert.strictEqual(validateServerObservation(observation(override)).valid, false);
});

const old = observation({
  observationId: "old",
  reviewState: "superseded",
  supersededBy: "new"
});
const replacement = observation({
  observationId: "new",
  text: "Corrected factual observation.",
  reviewedAt: "2026-07-25T09:17:00Z"
});
assert.strictEqual(validateServerObservationHistory([old, replacement]).valid, true);
assert.ok(validateServerObservationHistory([
  old,
  observation({ observationId: "new", serverId: "server-367" })
]).errors.some((entry) => entry.code === "INVALID_SUPERSESSION_REFERENCE"));
assert.ok(validateServerObservationHistory([replacement, replacement]).errors.some(
  (entry) => entry.code === "DUPLICATE_OBSERVATION_ID"
));

const cycleA = observation({ observationId: "a", reviewState: "superseded", supersededBy: "b" });
const cycleB = observation({ observationId: "b", reviewState: "superseded", supersededBy: "a" });
assert.ok(validateServerObservationHistory([cycleA, cycleB]).errors.some(
  (entry) => entry.code === "SUPERSESSION_CYCLE"
));
assert.strictEqual(validateServerObservationHistory([]).valid, true);
assert.strictEqual(validateServerObservationHistory({}).valid, false);
assert.doesNotThrow(() => validateServerObservation(new Date()));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "server-observation-validator.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateServerObservation, "function");
assert.strictEqual(typeof sandbox.globalThis.validateServerObservationHistory, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - server observation validator");
console.log("\n1 test passed");
