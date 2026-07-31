const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateEvidenceRecord,
  validateEvidenceRecordHistory
} = require("../src/services/evidence-record-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");

function record(overrides = {}) {
  return {
    evidenceId: "evidence-1",
    assetId: "asset-1",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-1",
    confidence: 0.9,
    observedAt: "2026-07-25T09:15:00Z",
    reviewState: "proposed",
    actorId: "user-1",
    reviewerId: null,
    reviewedAt: null,
    notes: null,
    linkedEntityType: "UnionMatchProposal",
    linkedEntityId: "proposal-1",
    supersededBy: null,
    ...overrides
  };
}

function service(initial = [], knownAssets = ["asset-1", "asset-2"]) {
  return createEvidenceRecordService({
    initialEvidenceRecords: initial,
    validateEvidenceRecord,
    validateEvidenceRecordHistory,
    evidenceAssetService: {
      hasAsset(assetId) {
        return knownAssets.includes(assetId);
      }
    }
  });
}

const evidence = service();
evidence.addEvidenceRecord(record());
assert.strictEqual(evidence.hasEvidenceRecord("evidence-1"), true);
assert.strictEqual(evidence.listEvidenceRecords({ reviewState: "proposed" }).length, 1);
assert.strictEqual(evidence.getEvidenceRecord("missing"), null);

const confirmed = record({
  reviewState: "confirmed",
  reviewerId: "reviewer-1",
  reviewedAt: "2026-07-25T09:16:00Z"
});
evidence.reviewProposal("evidence-1", confirmed);
assert.strictEqual(evidence.getEvidenceRecord("evidence-1").reviewState, "confirmed");

const correction = record({
  evidenceId: "evidence-2",
  assetId: "asset-2",
  rawExtractedValue: "MLG corrected",
  normalizedValue: "union-1",
  reviewState: "confirmed",
  reviewerId: "reviewer-2",
  reviewedAt: "2026-07-25T09:17:00Z"
});
const corrected = evidence.correctConfirmed("evidence-1", correction);
assert.strictEqual(corrected.superseded.supersededBy, "evidence-2");
assert.strictEqual(evidence.getEvidenceRecord("evidence-2").reviewState, "confirmed");

const before = evidence.listEvidenceRecords();
assert.throws(() => evidence.addEvidenceRecord(record({ evidenceId: "unknown-asset", assetId: "missing" })));
assert.throws(() => evidence.correctConfirmed("evidence-1", correction));
assert.deepStrictEqual(evidence.listEvidenceRecords(), before);

const manual = record({
  evidenceId: "manual",
  assetId: null,
  sourceType: "manual_entry",
  confidence: null
});
assert.doesNotThrow(() => service().addEvidenceRecord(manual));

const input = record({ normalizedValue: { candidate: "union-1" } });
const isolated = service([input]);
input.normalizedValue.candidate = "changed";
const returned = isolated.getEvidenceRecord("evidence-1");
returned.normalizedValue.candidate = "changed again";
assert.strictEqual(isolated.getEvidenceRecord("evidence-1").normalizedValue.candidate, "union-1");

assert.throws(() => createEvidenceRecordService({}), /requires options/);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "evidence-record-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createEvidenceRecordService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - evidence record service");
console.log("\n1 test passed");
