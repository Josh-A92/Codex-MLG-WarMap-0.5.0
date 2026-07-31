const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateEvidenceAsset,
  validateEvidenceAssetHistory
} = require("../src/services/evidence-asset-validator.js");

function asset(overrides = {}) {
  return {
    assetId: "asset-1",
    storageRef: "private/asset-1",
    ingestionSource: "application_upload",
    mediaType: "image/png",
    byteSize: 1000,
    pixelWidth: 561,
    pixelHeight: 968,
    uploadedBy: "user-1",
    uploadedAt: "2026-07-25T09:20:00.000Z",
    observedAt: "2026-07-25T09:15:00.000Z",
    observationTimePrecision: "approximate",
    integrityHash: `sha256:${"a".repeat(64)}`,
    processingState: "uploaded",
    processedAt: null,
    failureReason: null,
    sourceContext: {},
    ...overrides
  };
}

assert.strictEqual(validateEvidenceAsset(asset()).valid, true);
assert.strictEqual(validateEvidenceAsset(asset({
  mediaType: "image/jpeg",
  processingState: "processed",
  processedAt: "2026-07-25T09:21:00Z"
})).valid, true);
assert.strictEqual(validateEvidenceAsset(asset({
  processingState: "failed",
  processedAt: "2026-07-25T09:21:00Z",
  failureReason: "Unreadable image"
})).valid, true);

[
  { mediaType: "image/gif" },
  { byteSize: 0 },
  { pixelWidth: 1.5 },
  { observedAt: "2026-07-25T09:21:00Z" },
  { processedAt: "2026-07-25T09:19:00Z" },
  { integrityHash: "abc" },
  { processingState: "processed" },
  { processingState: "failed", processedAt: "2026-07-25T09:21:00Z" },
  { sourceContext: { bad: new Date() } },
  { extra: true }
].forEach((override) => {
  assert.strictEqual(validateEvidenceAsset(asset(override)).valid, false);
});

const duplicate = validateEvidenceAssetHistory([asset(), asset()]);
assert.ok(duplicate.errors.some((entry) => entry.code === "DUPLICATE_ASSET_ID"));
assert.strictEqual(validateEvidenceAssetHistory([]).valid, true);
assert.strictEqual(validateEvidenceAssetHistory({}).valid, false);

const nullPrototype = Object.assign(Object.create(null), asset());
nullPrototype.sourceContext = Object.create(null);
assert.strictEqual(validateEvidenceAsset(nullPrototype).valid, true);

const cyclic = {};
cyclic.self = cyclic;
assert.strictEqual(validateEvidenceAsset(asset({ sourceContext: cyclic })).valid, false);
assert.doesNotThrow(() => validateEvidenceAsset(new Date()));

const candidate = asset();
const before = JSON.stringify(candidate);
validateEvidenceAsset(candidate);
assert.strictEqual(JSON.stringify(candidate), before);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "evidence-asset-validator.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateEvidenceAsset, "function");
assert.strictEqual(typeof sandbox.globalThis.validateEvidenceAssetHistory, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - evidence asset validator");
console.log("\n1 test passed");
