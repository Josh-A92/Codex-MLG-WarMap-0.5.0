const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createCommittedGenerationMigrationSnapshotAdapter, CommittedGenerationMigrationSnapshotAdapterError } = require("../src/services/committed-generation-migration-snapshot-adapter.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };

function realFileSystem() {
  return {
    async mkdir(directory) { return fs.promises.mkdir(directory, { recursive: true }); },
    async readFile(filePath) { return fs.promises.readFile(filePath); },
    async writeFile(filePath, data) { return fs.promises.writeFile(filePath, data); },
    async rename(from, to) { return fs.promises.rename(from, to); },
    async unlink(filePath) { return fs.promises.unlink(filePath); },
    async readdir(directory) { return fs.promises.readdir(directory); },
    async access(filePath) { return fs.promises.access(filePath); },
    async flush() {}
  };
}

function documents(overrides = {}) {
  return [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", value: { unions: ["union-1"] } },
    { documentId: "strategic-season-1", scope: context.seasonId, type: "strategic-domain", value: { state: { territoryOwnershipRecords: [] } } },
    { documentId: "projection-season-1-season1-map", scope: `${context.seasonId}/${context.baseMapId}`, type: "server-state", value: { servers: [{ id: "server-366", ownership: {} }] } },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", value: { records: [] } },
    ...overrides.extra || []
  ].filter((document) => !overrides.remove || !overrides.remove.includes(document.documentId));
}

async function withStore(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-migration-snapshot-"));
  try {
    const store = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    await callback(directory, store);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function commit(store, value) {
  return store.commit({ expectedGeneration: 0, transactionId: `snapshot-${value}`, createdAt: "2026-08-13T00:00:00.000Z", documents: documents(value) });
}

async function currentIdentity(store) {
  const loaded = await store.loadCommittedGeneration();
  return { generation: loaded.pointer.generation, manifestFile: loaded.pointer.manifestFile, manifestSha256: loaded.pointer.manifestSha256 };
}

function adapter(store) {
  return createCommittedGenerationMigrationSnapshotAdapter({ generationStore: store, seasonId: context.seasonId, baseMapId: context.baseMapId });
}

function assertCode(callback, code) {
  return assert.rejects(callback, (error) => error instanceof CommittedGenerationMigrationSnapshotAdapterError && error.code === code);
}

async function test(name, callback) {
  await callback();
  console.log(`PASS ${name}`);
}

(async () => {
  await test("loads a valid current generation and derives exact source IDs", async () => {
    await withStore(async (_directory, store) => {
      await commit(store, "valid");
      const expectedCurrent = await currentIdentity(store);
      const result = await adapter(store).load({ expectedCurrent });
      assert.strictEqual(result.status, "loaded");
      assert.deepStrictEqual(result.sourceDocumentIds, { strategic: "strategic-season-1", projection: "projection-season-1-season1-map" });
      assert.deepStrictEqual(result.referenceDocuments.map((document) => document.documentId), result.manifest.documents.map((document) => document.documentId));
    });
  });

  await test("rejects an expected-current mismatch", async () => {
    await withStore(async (_directory, store) => {
      await commit(store, "mismatch");
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent: { ...expectedCurrent, manifestSha256: "sha256:wrong" } }), "stale_generation");
    });
  });

  await test("rejects fallback from PREVIOUS", async () => {
    await withStore(async (directory, store) => {
      await commit(store, "first");
      await store.commit({ expectedGeneration: 1, transactionId: "snapshot-second", createdAt: "2026-08-13T00:01:00.000Z", documents: documents("second") });
      const expectedCurrent = await currentIdentity(store);
      await fs.promises.unlink(path.join(directory, "CURRENT"));
      await assertCode(() => adapter(store).load({ expectedCurrent }), "committed_generation_ambiguous");
    });
  });

  await test("rejects missing and duplicate required roles", async () => {
    await withStore(async (_directory, store) => {
      await commit(store, { remove: ["strategic-season-1"] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "missing_strategic_document");
    });
    await withStore(async (_directory, store) => {
      await commit(store, { remove: ["projection-season-1-season1-map"] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "missing_projection_document");
    });
    await withStore(async (_directory, store) => {
      await commit(store, { extra: [{ documentId: "strategic-copy", scope: context.seasonId, type: "strategic-domain", value: {} }] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "duplicate_strategic_document");
    });
    await withStore(async (_directory, store) => {
      await commit(store, { extra: [{ documentId: "projection-copy", scope: `${context.seasonId}/${context.baseMapId}`, type: "server-state", value: {} }] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "duplicate_projection_document");
    });
  });

  await test("rejects season and base-map scope mismatches", async () => {
    await withStore(async (_directory, store) => {
      await commit(store, { remove: ["projection-season-1-season1-map"], extra: [{ documentId: "wrong-projection", scope: "season-2/season2-map", type: "server-state", value: {} }] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "projection_scope_mismatch");
    });
    await withStore(async (_directory, store) => {
      await commit(store, { remove: ["strategic-season-1"], extra: [{ documentId: "wrong-strategic", scope: "season-2", type: "strategic-domain", value: {} }] });
      const expectedCurrent = await currentIdentity(store);
      await assertCode(() => adapter(store).load({ expectedCurrent }), "strategic_scope_mismatch");
    });
  });

  await test("preserves complete references and isolates input and result copies", async () => {
    await withStore(async (_directory, store) => {
      await commit(store, "immutable");
      const expectedCurrent = await currentIdentity(store);
      const inputBefore = JSON.stringify(expectedCurrent);
      const result = await adapter(store).load({ expectedCurrent });
      const resultBefore = JSON.stringify(result);
      assert.strictEqual(JSON.stringify(expectedCurrent), inputBefore);
      assert.strictEqual(result.referenceDocuments.length, result.manifest.documents.length);
      result.manifest.documents[0].fileName = "changed";
      result.referenceDocuments[0].reference.sha256 = "changed";
      result.documents[0].value.changed = true;
      assert.strictEqual(JSON.stringify(expectedCurrent), inputBefore);
      const again = await adapter(store).load({ expectedCurrent });
      assert.strictEqual(JSON.stringify(again), resultBefore);
      assert.ok(again.referenceDocuments.every((document) => document.reference.fileName));
      assert.ok(again.referenceDocuments.every((document) => document.reference.sha256));
    });
  });

  console.log("7 committed-generation migration snapshot scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});