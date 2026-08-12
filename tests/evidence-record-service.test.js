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
    },
    clock: () => new Date("2026-08-12T12:00:00.000Z")
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

const temporal = service();
const exact = temporal.addEvidenceRecord(record({
  evidenceId: "temporal-exact",
  eventAt: { precision: "exact", at: "2026-07-25T08:00:00Z" },
  ruleVersionRef: { seasonId: "season-1", packageVersion: "0.5.0", rulesVersion: "rules-v1" }
}));
assert.strictEqual(exact.observedAt, "2026-07-25T09:15:00Z");
assert.strictEqual(exact.recordedAt, "2026-08-12T12:00:00.000Z");
assert.throws(() => temporal.addEvidenceRecord(record({ evidenceId: "forged", recordedAt: "2026-07-25T09:00:00Z" })), (error) => error.code === "caller_recorded_at");
const bounded = temporal.addEvidenceRecord(record({ evidenceId: "temporal-bounded", eventAt: { precision: "bounded", earliestAt: "2026-07-25T08:00:00Z", latestAt: "2026-07-25T10:00:00Z" } }));
const unknown = temporal.addEvidenceRecord(record({ evidenceId: "temporal-unknown", eventAt: { precision: "unknown" } }));
assert.strictEqual(bounded.eventAt.precision, "bounded");
assert.strictEqual(unknown.eventAt.precision, "unknown");
const legacy = service([record({ evidenceId: "legacy" })]).getEvidenceRecord("legacy");
assert.strictEqual(Object.prototype.hasOwnProperty.call(legacy, "eventAt"), false);
assert.strictEqual(legacy.recordedAt, null);
assert.strictEqual(legacy.recordedAtLegacyUnknown, true);

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
