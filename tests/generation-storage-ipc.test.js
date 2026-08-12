const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  MAX_DOCUMENTS,
  createGenerationStorageHandlers,
  validateCommitPayload
} = require("../src/main/generation-storage-ipc.js");

const validPayload = {
  expectedGeneration: 0,
  transactionId: "tx-1",
  createdAt: "2026-08-12T12:00:00.000Z",
  documents: [{ documentId: "doc-1", scope: "season-1", type: "state", value: { ok: true } }]
};

(async () => {
  let commitPayload = null;
  const handlers = createGenerationStorageHandlers({
    async loadCommittedGeneration() { return { status: "missing" }; },
    async commit(payload) { commitPayload = payload; return { status: "committed", generation: 1 }; }
  });

  const loaded = await handlers.loadCommittedGeneration();
  assert.deepStrictEqual(loaded, { ok: true, result: { status: "missing" } });
  const committed = await handlers.commitGeneration(validPayload);
  assert.deepStrictEqual(committed, { ok: true, result: { status: "committed", generation: 1 } });
  assert.deepStrictEqual(commitPayload, validPayload);

  for (const invalid of [
    null,
    { ...validPayload, expectedGeneration: -1 },
    { ...validPayload, documents: [] },
    { ...validPayload, documents: new Array(MAX_DOCUMENTS + 1).fill(validPayload.documents[0]) },
    { ...validPayload, documents: [{ ...validPayload.documents[0], extra: true }] },
    { ...validPayload, documents: [{ ...validPayload.documents[0], reference: { fileName: "x", sha256: "sha256:x" } }] }
  ]) {
    const result = await handlers.commitGeneration(invalid);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, "invalid_payload");
  }

  const failing = createGenerationStorageHandlers({
    async loadCommittedGeneration() { throw Object.assign(new Error("recovery needed"), { code: "recovery_required" }); },
    async commit() { throw Object.assign(new Error("stale"), { code: "stale_generation" }); }
  });
  assert.deepStrictEqual(await failing.loadCommittedGeneration(), { ok: false, error: { code: "recovery_required", message: "recovery needed" } });
  assert.deepStrictEqual(await failing.commitGeneration(validPayload), { ok: false, error: { code: "stale_generation", message: "stale" } });

  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const preloadSource = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  assert.match(mainSource, /createGenerationStore/);
  assert.match(mainSource, /path\.join\(persistenceStoreDirectory, "generations"\)/);
  assert.doesNotMatch(preloadSource, /\bfs\b|\bpath\b/);
  assert.match(preloadSource, /warMapGenerationStorage/);
  assert.match(preloadSource, /generation:load-committed/);
  assert.match(preloadSource, /generation:commit/);
  validateCommitPayload(validPayload);
  console.log("10 generation IPC/security scenarios passed");
  console.log("1 test passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
