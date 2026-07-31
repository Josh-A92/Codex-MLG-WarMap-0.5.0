const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateEvidenceAsset,
  validateEvidenceAssetHistory
} = require("../src/services/evidence-asset-validator.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");
const {
  validateEvidenceRecord,
  validateEvidenceRecordHistory
} = require("../src/services/evidence-record-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");
const {
  createEvidenceDomainRuntime,
  EvidenceDomainRuntimeError
} = require("../src/app/evidence-domain-runtime.js");

function asset() {
  return {
    assetId: "asset-1",
    storageRef: "evidence/asset-1.jpg",
    ingestionSource: "application_upload",
    mediaType: "image/jpeg",
    byteSize: 1024,
    pixelWidth: 560,
    pixelHeight: 968,
    uploadedBy: "user-1",
    uploadedAt: "2026-07-25T09:15:00Z",
    observedAt: "2026-07-25T09:00:00Z",
    observationTimePrecision: "exact",
    integrityHash: `sha256:${"a".repeat(64)}`,
    processingState: "uploaded",
    processedAt: null,
    failureReason: null,
    sourceContext: {}
  };
}

function evidenceRecord() {
  return {
    evidenceId: "evidence-1",
    assetId: "asset-1",
    sourceType: "screenshot_extraction",
    rawExtractedValue: "MLG",
    normalizedValue: "union-1",
    confidence: 0.9,
    observedAt: "2026-07-25T09:00:00Z",
    reviewState: "proposed",
    actorId: "system-extractor",
    reviewerId: null,
    reviewedAt: null,
    notes: null,
    linkedEntityType: "UnionMatchProposal",
    linkedEntityId: "proposal-1",
    supersededBy: null
  };
}

const modules = {
  validateEvidenceAsset,
  validateEvidenceAssetHistory,
  createEvidenceAssetService,
  validateEvidenceRecord,
  validateEvidenceRecordHistory,
  createEvidenceRecordService
};

const initialState = { assets: [asset()], evidenceRecords: [evidenceRecord()] };
const runtime = createEvidenceDomainRuntime({ modules, initialState });
assert.strictEqual(Object.isFrozen(runtime), true);
assert.strictEqual(runtime.evidenceAssetService.hasAsset("asset-1"), true);
assert.strictEqual(runtime.evidenceRecordService.hasEvidenceRecord("evidence-1"), true);
assert.deepStrictEqual(initialState.assets[0], asset());
assert.deepStrictEqual(initialState.evidenceRecords[0], evidenceRecord());

runtime.evidenceAssetService.markProcessed("asset-1", "2026-07-25T09:16:00Z");
assert.strictEqual(runtime.evidenceAssetService.getAsset("asset-1").processingState, "processed");
assert.strictEqual(runtime.evidenceRecordService.getEvidenceRecord("evidence-1").assetId, "asset-1");

assert.throws(
  () => createEvidenceDomainRuntime({ modules, initialState: { assets: [], evidenceRecords: [
    { ...evidenceRecord(), assetId: "missing" }
  ] } }),
  (error) => error.code === "unknown_asset"
);
assert.throws(
  () => createEvidenceDomainRuntime({ modules, initialState: { assets: [] } }),
  (error) => error instanceof EvidenceDomainRuntimeError
    && error.code === "invalid_factory"
);
assert.throws(
  () => createEvidenceDomainRuntime({
    modules: { ...modules, extra: () => {} },
    initialState: { assets: [], evidenceRecords: [] }
  }),
  /does not recognize/
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "evidence-domain-runtime.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createEvidenceDomainRuntime, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - evidence domain runtime");
console.log("\n1 test passed");
