const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateEvidenceRecord,
  validateEvidenceRecordHistory
} = require("../src/services/evidence-record-validator.js");

function evidence(overrides = {}) {
  return {
    evidenceId: "evidence-1",
    assetId: "asset-1",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "128,450",
    normalizedValue: 128450,
    confidence: 0.9,
    observedAt: "2026-07-25T09:15:00Z",
    reviewState: "confirmed",
    actorId: "user-1",
    reviewerId: "user-1",
    reviewedAt: "2026-07-25T09:16:00Z",
    notes: null,
    linkedEntityType: "CombatStrengthObservation",
    linkedEntityId: "combat-1",
    supersededBy: null,
    ...overrides
  };
}

assert.strictEqual(validateEvidenceRecord(evidence()).valid, true);
assert.strictEqual(validateEvidenceRecord(evidence({
  reviewState: "proposed",
  reviewerId: null,
  reviewedAt: null
})).valid, true);
assert.strictEqual(validateEvidenceRecord(evidence({
  sourceType: "manual_entry",
  assetId: null,
  confidence: null
})).valid, true);
assert.strictEqual(validateEvidenceRecord(evidence({
  normalizedValue: { ownershipState: "owned", cells: [1, 2] }
})).valid, true);

[
  { sourceType: "screenshot_extraction", assetId: null },
  { confidence: 2 },
  { normalizedValue: new Date() },
  { rawExtractedValue: 1 },
  { reviewedAt: "2026-07-25T09:14:00Z" },
  { reviewState: "proposed" },
  { extra: true }
].forEach((override) => {
  assert.strictEqual(validateEvidenceRecord(evidence(override)).valid, false);
});

const oldRecord = evidence({
  evidenceId: "evidence-1",
  reviewState: "superseded",
  supersededBy: "evidence-2"
});
const replacement = evidence({
  evidenceId: "evidence-2",
  normalizedValue: 128451,
  reviewedAt: "2026-07-25T09:17:00Z"
});
assert.strictEqual(validateEvidenceRecordHistory([oldRecord, replacement]).valid, true);
assert.ok(validateEvidenceRecordHistory([replacement, replacement]).errors.some(
  (entry) => entry.code === "DUPLICATE_EVIDENCE_ID"
));
assert.ok(validateEvidenceRecordHistory([
  oldRecord,
  evidence({ evidenceId: "evidence-2", linkedEntityId: "other" })
]).errors.some((entry) => entry.code === "INVALID_SUPERSESSION_REFERENCE"));

const cycleA = evidence({ evidenceId: "a", reviewState: "superseded", supersededBy: "b" });
const cycleB = evidence({ evidenceId: "b", reviewState: "superseded", supersededBy: "a" });
assert.ok(validateEvidenceRecordHistory([cycleA, cycleB]).errors.some(
  (entry) => entry.code === "SUPERSESSION_CYCLE"
));

const cyclicValue = {};
cyclicValue.self = cyclicValue;
assert.strictEqual(validateEvidenceRecord(evidence({ normalizedValue: cyclicValue })).valid, false);
assert.strictEqual(validateEvidenceRecordHistory([]).valid, true);
assert.strictEqual(validateEvidenceRecordHistory({}).valid, false);
assert.doesNotThrow(() => validateEvidenceRecord(new Date()));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "evidence-record-validator.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateEvidenceRecord, "function");
assert.strictEqual(typeof sandbox.globalThis.validateEvidenceRecordHistory, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - evidence record validator");
console.log("\n1 test passed");
