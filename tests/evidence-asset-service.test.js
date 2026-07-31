const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validateEvidenceAsset,
  validateEvidenceAssetHistory
} = require("../src/services/evidence-asset-validator.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");

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
    uploadedAt: "2026-07-25T09:20:00Z",
    observedAt: "2026-07-25T09:15:00Z",
    observationTimePrecision: "approximate",
    integrityHash: `sha256:${"a".repeat(64)}`,
    processingState: "uploaded",
    processedAt: null,
    failureReason: null,
    sourceContext: {},
    ...overrides
  };
}

function service(initialAssets = []) {
  return createEvidenceAssetService({
    initialAssets,
    validateEvidenceAsset,
    validateEvidenceAssetHistory
  });
}

const empty = service();
assert.deepStrictEqual(empty.listAssets(), []);
assert.strictEqual(empty.getAsset("missing"), null);
empty.addUploadedAsset(asset());
assert.strictEqual(empty.hasAsset("asset-1"), true);
assert.strictEqual(empty.listAssets({ processingState: "uploaded" }).length, 1);

const processed = empty.markProcessed("asset-1", "2026-07-25T09:21:00Z");
assert.strictEqual(processed.processingState, "processed");
assert.strictEqual(empty.getAsset("asset-1").processedAt, "2026-07-25T09:21:00Z");
assert.throws(() => empty.markFailed("asset-1", "2026-07-25T09:22:00Z", "late"));

const retry = service([asset({ assetId: "retry" })]);
retry.markFailed("retry", "2026-07-25T09:21:00Z", "first failure");
assert.strictEqual(retry.getAsset("retry").processingState, "failed");
retry.markProcessed("retry", "2026-07-25T09:22:00Z");
assert.strictEqual(retry.getAsset("retry").processingState, "processed");

const before = retry.listAssets();
assert.throws(() => retry.addUploadedAsset(asset({ assetId: "retry" })));
assert.throws(() => retry.markFailed("unknown", "2026-07-25T09:22:00Z", "failure"));
assert.deepStrictEqual(retry.listAssets(), before);

const input = asset({ assetId: "isolated", sourceContext: { messageId: "1" } });
const isolated = service([input]);
input.sourceContext.messageId = "changed";
const returned = isolated.getAsset("isolated");
returned.sourceContext.messageId = "changed again";
assert.strictEqual(isolated.getAsset("isolated").sourceContext.messageId, "1");

assert.throws(() => service().addUploadedAsset(asset({
  assetId: "already-processed",
  processingState: "processed",
  processedAt: "2026-07-25T09:21:00Z"
})));

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "evidence-asset-service.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createEvidenceAssetService, "function");
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

console.log("ok - evidence asset service");
console.log("\n1 test passed");
