const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateCombatStrengthObservation,
  validateCombatStrengthObservationHistory
} = require("../src/services/combat-strength-observation-validator.js");

function observation(overrides = {}) {
  return {
    observationId: "combat-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    value: 128450,
    unit: "combat strength",
    displayFormat: "number",
    observedAt: "2026-07-25T09:15:00Z",
    sourceType: "manual_entry",
    evidenceId: null,
    extractionMethod: null,
    rawExtractedValue: null,
    normalizedValue: 128450,
    confidence: null,
    reviewState: "confirmed",
    actorId: "user-1",
    reviewerId: "user-1",
    reviewedAt: "2026-07-25T09:16:00Z",
    supersededBy: null,
    ...overrides
  };
}

assert.strictEqual(validateCombatStrengthObservation(observation()).valid, true);
assert.strictEqual(validateCombatStrengthObservation(observation({
  reviewState: "proposed",
  reviewerId: null,
  reviewedAt: null
})).valid, true);
assert.strictEqual(validateCombatStrengthObservation(observation({
  reviewState: "rejected"
})).valid, true);

const assisted = observation({
  sourceType: "screenshot_extraction",
  evidenceId: "evidence-1",
  extractionMethod: "ocr",
  rawExtractedValue: "128,450",
  confidence: 0.91
});
assert.strictEqual(validateCombatStrengthObservation(assisted).valid, true);

[
  { value: -1 },
  { value: Infinity },
  { normalizedValue: 2 },
  { confidence: 0.5 },
  { reviewerId: null },
  { reviewedAt: "2026-07-25T09:14:00Z" },
  { observedAt: "2026-02-30T09:15:00Z" },
  { extra: true }
].forEach((override) => {
  assert.strictEqual(validateCombatStrengthObservation(observation(override)).valid, false);
});

assert.strictEqual(validateCombatStrengthObservation(observation({
  sourceType: "api_integration",
  evidenceId: null,
  extractionMethod: "api",
  confidence: 1
})).valid, false);

const first = observation({
  observationId: "combat-1",
  reviewState: "superseded",
  supersededBy: "combat-2"
});
const replacement = observation({
  observationId: "combat-2",
  value: 128451,
  normalizedValue: 128451,
  reviewedAt: "2026-07-25T09:17:00Z"
});
assert.strictEqual(validateCombatStrengthObservationHistory([first, replacement]).valid, true);

const laterObservation = observation({
  observationId: "combat-3",
  observedAt: "2026-07-26T09:15:00Z",
  reviewedAt: "2026-07-26T09:16:00Z"
});
assert.strictEqual(
  validateCombatStrengthObservationHistory([first, replacement, laterObservation]).valid,
  true
);

const duplicateTime = observation({ observationId: "combat-4" });
assert.ok(validateCombatStrengthObservationHistory([replacement, duplicateTime]).errors.some(
  (entry) => entry.code === "DUPLICATE_CONFIRMED_OBSERVED_AT"
));

const equivalentTime = observation({
  observationId: "combat-5",
  observedAt: "2026-07-25T09:15:00.000Z",
  reviewedAt: "2026-07-25T09:16:00.000Z"
});
assert.ok(validateCombatStrengthObservationHistory([replacement, equivalentTime]).errors.some(
  (entry) => entry.code === "DUPLICATE_CONFIRMED_OBSERVED_AT"
));

const invalidReplacement = observation({
  observationId: "combat-2",
  unionId: "union-2"
});
assert.ok(validateCombatStrengthObservationHistory([first, invalidReplacement]).errors.some(
  (entry) => entry.code === "INVALID_SUPERSESSION_REFERENCE"
));

const cycleA = observation({
  observationId: "cycle-a",
  reviewState: "superseded",
  supersededBy: "cycle-b"
});
const cycleB = observation({
  observationId: "cycle-b",
  reviewState: "superseded",
  supersededBy: "cycle-a"
});
assert.ok(validateCombatStrengthObservationHistory([cycleA, cycleB]).errors.some(
  (entry) => entry.code === "SUPERSESSION_CYCLE"
));

const invalidSameTime = observation({
  observationId: "invalid",
  value: -1
});
assert.strictEqual(
  validateCombatStrengthObservationHistory([replacement, invalidSameTime]).errors.some(
    (entry) => entry.code === "DUPLICATE_CONFIRMED_OBSERVED_AT"
  ),
  false
);

const candidate = observation();
const before = JSON.stringify(candidate);
validateCombatStrengthObservation(candidate);
assert.strictEqual(JSON.stringify(candidate), before);
assert.doesNotThrow(() => validateCombatStrengthObservation(new Date()));
assert.strictEqual(validateCombatStrengthObservationHistory([]).valid, true);
assert.strictEqual(validateCombatStrengthObservationHistory({}).valid, false);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "combat-strength-observation-validator.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateCombatStrengthObservation, "function");
assert.strictEqual(typeof sandbox.globalThis.validateCombatStrengthObservationHistory, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - combat strength observation validator");
console.log("\n1 test passed");
