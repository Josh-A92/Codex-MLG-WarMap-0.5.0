const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createEvidenceStorageHandlers } = require("../src/main/evidence-storage-ipc.js");
const { PERSISTENCE_IPC_CHANNELS } = require("../src/shared/persistence-ipc-channels.js");

(async () => {
  let dialogOptions = null;
  let importedInput = null;
  const handlers = createEvidenceStorageHandlers({
    dialog: {
      async showOpenDialog(options) {
        dialogOptions = options;
        return { canceled: false, filePaths: ["C:\\screenshots\\capture.png"] };
      }
    },
    evidenceFileStore: {
      async importFile(input) {
        importedInput = input;
        return { storageRef: "evidence/hash.png", integrityHash: `sha256:${"a".repeat(64)}` };
      }
    }
  });
  const imported = await handlers.selectAndImportEvidence();
  assert.strictEqual(imported.ok, true);
  assert.strictEqual(imported.result.status, "imported");
  assert.deepStrictEqual(importedInput, { sourcePath: "C:\\screenshots\\capture.png" });
  assert.deepStrictEqual(dialogOptions.properties, ["openFile"]);
  assert.deepStrictEqual(dialogOptions.filters[0].extensions, ["png", "jpg", "jpeg"]);
  console.log("PASS selects one image in main and returns managed metadata only");

  const cancelled = createEvidenceStorageHandlers({
    dialog: { async showOpenDialog() { return { canceled: true, filePaths: [] }; } },
    evidenceFileStore: { async importFile() { throw new Error("must not run"); } }
  });
  assert.deepStrictEqual(await cancelled.selectAndImportEvidence(), { ok: true, result: { status: "cancelled" } });
  console.log("PASS cancellation performs no import");

  const failed = createEvidenceStorageHandlers({
    dialog: { async showOpenDialog() { return { canceled: false, filePaths: ["C:\\bad.png"] }; } },
    evidenceFileStore: { async importFile() { throw Object.assign(new Error("bad image"), { code: "unsupported_media" }); } }
  });
  assert.deepStrictEqual(await failed.selectAndImportEvidence(), { ok: false, error: { code: "unsupported_media", message: "bad image" } });
  assert.throws(() => createEvidenceStorageHandlers({ dialog: {}, evidenceFileStore: {} }), TypeError);
  console.log("PASS errors are bounded and dependencies are strict");

  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const preloadSource = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  assert.strictEqual(PERSISTENCE_IPC_CHANNELS.SELECT_AND_IMPORT_EVIDENCE, "evidence:select-and-import");
  assert.match(mainSource, /createEvidenceFileStore\(\{ rootDirectory: persistenceStoreDirectory \}\)/);
  assert.match(mainSource, /SELECT_AND_IMPORT_EVIDENCE/);
  assert.match(preloadSource, /warMapEvidenceStorage/);
  assert.match(preloadSource, /evidence:select-and-import/);
  assert.doesNotMatch(preloadSource, /showOpenDialog|sourcePath|readFile|writeFile|\bfs\b|\bpath\b/);
  console.log("PASS preload exposes one fixed-channel method and no filesystem capability");
  console.log("4 evidence storage IPC scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
