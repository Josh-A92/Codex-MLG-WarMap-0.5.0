const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { validateEvidenceAsset, validateEvidenceAssetHistory } =
  require("../src/services/evidence-asset-validator.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");
const { validateEvidenceRecord, validateEvidenceRecordHistory } =
  require("../src/services/evidence-record-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");
const { createEvidenceDomainRuntime } = require("../src/app/evidence-domain-runtime.js");
const { createEvidenceDomainStateSerializer } =
  require("../src/services/evidence-domain-state-serializer.js");

function asset() {
  return {
    assetId: "asset-1", storageRef: "evidence/asset-1.jpg",
    ingestionSource: "application_upload", mediaType: "image/jpeg",
    byteSize: 1024, pixelWidth: 560, pixelHeight: 968, uploadedBy: "user-1",
    uploadedAt: "2026-07-25T09:15:00Z", observedAt: "2026-07-25T09:00:00Z",
    observationTimePrecision: "exact", integrityHash: `sha256:${"a".repeat(64)}`,
    processingState: "uploaded", processedAt: null, failureReason: null,
    sourceContext: JSON.parse('{"__proto__":{"polluted":true}}')
  };
}
function evidenceRecord() {
  return {
    evidenceId: "evidence-1", assetId: "asset-1", sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG", normalizedValue: "union-1", confidence: 0.9,
    observedAt: "2026-07-25T09:00:00Z", reviewState: "proposed",
    actorId: "system-extractor", reviewerId: null, reviewedAt: null, notes: null,
    linkedEntityType: "UnionMatchProposal", linkedEntityId: "proposal-1", supersededBy: null,
    eventAt: { precision: "bounded", earliestAt: "2026-07-25T08:00:00Z", latestAt: "2026-07-25T10:00:00Z" },
    recordedAt: "2026-07-30T10:00:00Z"
  };
}
const serializer = createEvidenceDomainStateSerializer({
  validateEvidenceAssetHistory,
  validateEvidenceRecordHistory
});
const modules = {
  validateEvidenceAsset, validateEvidenceAssetHistory, createEvidenceAssetService,
  validateEvidenceRecord, validateEvidenceRecordHistory, createEvidenceRecordService
};
const runtime = createEvidenceDomainRuntime({
  modules,
  initialState: { assets: [asset()], evidenceRecords: [evidenceRecord()] }
});
const envelope = serializer.serializeRuntime(runtime, "2026-07-30T23:30:00.000Z");
assert.deepStrictEqual(serializer.validateEnvelope(envelope), { valid: true, errors: [], warnings: [] });
assert.strictEqual(Object.prototype.hasOwnProperty.call(envelope.assets[0].sourceContext, "__proto__"), true);
assert.strictEqual({}.polluted, undefined);

const restored = serializer.deserializeEnvelope(envelope);
assert.deepStrictEqual(restored.evidenceRecords[0].eventAt, evidenceRecord().eventAt);
assert.strictEqual(restored.evidenceRecords[0].recordedAt, "2026-07-30T10:00:00Z");
const restoredRuntime = createEvidenceDomainRuntime({
  modules,
  initialState: { assets: restored.assets, evidenceRecords: restored.evidenceRecords }
});
restored.assets[0].storageRef = "changed";
assert.strictEqual(restoredRuntime.evidenceAssetService.getAsset("asset-1").storageRef, "evidence/asset-1.jpg");

const missingAsset = { ...envelope, assets: [] };
assert.ok(serializer.validateEnvelope(missingAsset).errors.some(
  (error) => error.code === "UNKNOWN_ASSET_REFERENCE"
));
assert.throws(() => serializer.deserializeEnvelope(missingAsset), (error) => error.code === "INVALID_ENVELOPE");
assert.strictEqual(serializer.validateEnvelope({ ...envelope, extra: true }).valid, false);
assert.strictEqual(serializer.validateEnvelope({ ...envelope, savedAt: "2026-07-30T23:30:00Z" }).valid, false);
assert.ok(serializer.validateEnvelope({ ...envelope, schemaVersion: 2 }).errors.some(
  (error) => error.code === "UNSUPPORTED_SCHEMA_VERSION"
));
assert.throws(() => createEvidenceDomainStateSerializer({}), (error) => error.code === "INVALID_FACTORY");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "evidence-domain-state-serializer.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createEvidenceDomainStateSerializer, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));
console.log("ok - evidence domain state serializer");
console.log("\n1 test passed");
