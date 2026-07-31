const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateCombatStrengthObservation,
  validateCombatStrengthObservationHistory
} = require("../src/services/combat-strength-observation-validator.js");
const {
  createCombatStrengthObservationService
} = require("../src/services/combat-strength-observation-service.js");

function observation(overrides = {}) {
  return {
    observationId: "combat-1",
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    value: 100,
    unit: "combat strength",
    displayFormat: "number",
    observedAt: "2026-07-25T09:15:00Z",
    sourceType: "manual_entry",
    evidenceId: null,
    extractionMethod: null,
    rawExtractedValue: null,
    normalizedValue: 100,
    confidence: null,
    reviewState: "confirmed",
    actorId: "user-1",
    reviewerId: "user-1",
    reviewedAt: "2026-07-25T09:16:00Z",
    supersededBy: null,
    ...overrides
  };
}

function service(initialObservations = []) {
  return createCombatStrengthObservationService({
    initialObservations,
    validateCombatStrengthObservation,
    validateCombatStrengthObservationHistory
  });
}

const empty = service();
assert.deepStrictEqual(empty.listObservations(), []);
assert.strictEqual(empty.getObservation("unknown"), null);
assert.strictEqual(empty.getLatestConfirmed("season-1", "server-366", "union-1"), null);

const first = observation();
const initialized = service([first]);
first.value = 999;
assert.strictEqual(initialized.getObservation("combat-1").value, 100);
assert.strictEqual(initialized.hasObservation("combat-1"), true);

const later = observation({
  observationId: "combat-2",
  value: 200,
  normalizedValue: 200,
  observedAt: "2026-07-26T09:15:00Z",
  reviewedAt: "2026-07-26T09:16:00Z"
});
initialized.addObservation(later);
assert.strictEqual(
  initialized.getLatestConfirmed("season-1", "server-366", "union-1").value,
  200
);
assert.strictEqual(initialized.listObservations({ reviewState: "confirmed" }).length, 2);

const proposal = observation({
  observationId: "proposal-1",
  value: 300,
  normalizedValue: 300,
  observedAt: "2026-07-27T09:15:00Z",
  reviewState: "proposed",
  reviewerId: null,
  reviewedAt: null
});
initialized.addObservation(proposal);
assert.strictEqual(initialized.getLatestConfirmed("season-1", "server-366", "union-1").value, 200);
const reviewed = { ...proposal, reviewState: "confirmed", reviewerId: "reviewer-1", reviewedAt: "2026-07-27T09:16:00Z" };
initialized.reviewProposal("proposal-1", reviewed);
assert.strictEqual(initialized.getLatestConfirmed("season-1", "server-366", "union-1").value, 300);

const correction = observation({
  observationId: "correction-1",
  value: 301,
  normalizedValue: 301,
  observedAt: "2026-07-27T09:15:00.000Z",
  reviewerId: "reviewer-2",
  reviewedAt: "2026-07-27T09:17:00Z"
});
const correctionResult = initialized.correctConfirmed("proposal-1", correction);
assert.strictEqual(correctionResult.superseded.supersededBy, "correction-1");
assert.strictEqual(initialized.getObservation("proposal-1").reviewState, "superseded");
assert.strictEqual(initialized.getLatestConfirmed("season-1", "server-366", "union-1").value, 301);

const beforeFailure = initialized.listObservations();
assert.throws(() => initialized.addObservation(observation({ observationId: "combat-1" })));
assert.deepStrictEqual(initialized.listObservations(), beforeFailure);
assert.throws(() => initialized.reviewProposal("combat-1", observation()));
assert.throws(() => initialized.correctConfirmed("proposal-1", correction));
assert.deepStrictEqual(initialized.listObservations(), beforeFailure);

const returned = initialized.listObservations();
returned[0].value = 0;
assert.notStrictEqual(initialized.getObservation("combat-1").value, 0);

const independent = service([
  observation(),
  observation({
    observationId: "other",
    serverId: "server-367",
    value: 500,
    normalizedValue: 500
  })
]);
assert.strictEqual(independent.getLatestConfirmed("season-1", "server-367", "union-1").value, 500);
assert.strictEqual(independent.getLatestConfirmed("season-1", "server-366", "union-1").value, 100);

class Validators {
  validateRecord(value) {
    assert.strictEqual(this instanceof Validators, true);
    return validateCombatStrengthObservation(value);
  }
  validateHistory(value) {
    assert.strictEqual(this instanceof Validators, true);
    return validateCombatStrengthObservationHistory(value);
  }
}
const validators = new Validators();
assert.doesNotThrow(() => createCombatStrengthObservationService({
  initialObservations: [],
  validateCombatStrengthObservation: validators.validateRecord.bind(validators),
  validateCombatStrengthObservationHistory: validators.validateHistory.bind(validators)
}));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "combat-strength-observation-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createCombatStrengthObservationService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - combat strength observation service");
console.log("\n1 test passed");
