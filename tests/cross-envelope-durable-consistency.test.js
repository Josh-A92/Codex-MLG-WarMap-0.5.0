const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");

function participant(value) {
  return { value, captureTransactionState() { return structuredClone(this.value); }, restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); } };
}
function realFs(failure) {
  const base = { mkdir: (x) => fs.promises.mkdir(x, { recursive: true }), readFile: fs.promises.readFile, writeFile: fs.promises.writeFile, unlink: fs.promises.unlink, readdir: fs.promises.readdir, access: fs.promises.access };
  let renames = 0;
  return { ...base, async flush(file) {}, async rename(from, to) { renames += 1; if (failure && renames === failure) throw new Error("injected generation publication failure"); return fs.promises.rename(from, to); } };
}
async function scenario(label, failure) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-phase3c2b3-"));
  try {
    const initialStore = createGenerationStore({ baseDirectory: directory, fileSystem: realFs() });
    const authoritative = participant([]);
    const projection = participant({ "server-366": {} });
    const documents = () => [
      { documentId: "strategic", scope: "season-1", type: "strategic", value: { records: authoritative.value } },
      { documentId: "projection", scope: "season-1/season1-map", type: "server-state", value: projection.value }
    ];
    const makeCoordinator = (store) => createApplicationPersistenceCoordinator({
      generationStore: store,
      mutationCoordinator: createApplicationMutationCoordinator({ participants: [authoritative, projection] }),
      legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
      serializeDocuments: async () => documents(),
      deserializeDocuments: async (items) => items,
      applyState: async (state) => { authoritative.value = state[0].value.records; projection.value = state[1].value; },
      clock: () => new Date("2026-08-12T12:00:00.000Z"),
      createTransactionId: () => `tx-${label}`
    });
    const seed = makeCoordinator(initialStore);
    await seed.load({ legacyDocuments: [] });
    await seed.execute(() => {});
    const failing = createGenerationStore({ baseDirectory: directory, fileSystem: realFs(failure) });
    const coordinator = makeCoordinator(failing);
    await coordinator.load({ legacyDocuments: [] });
    await assert.rejects(() => coordinator.execute(() => { authoritative.value.push({ ownershipRecordId: "ownership-1", ownerUnionId: "union-0001" }); projection.value["server-366"]["3-4"] = "union-0001"; }), /injected generation publication failure/);
    assert.deepStrictEqual(authoritative.value, []);
    assert.deepStrictEqual(projection.value, { "server-366": {} });
    const reopened = createGenerationStore({ baseDirectory: directory, fileSystem: realFs() });
    const committed = await reopened.loadCommittedGeneration();
    assert.strictEqual(committed.manifest.generation, 1);
    assert.deepStrictEqual(committed.documents.map((item) => item.value), [{ records: [] }, { "server-366": {} }]);
    console.log(`PASS ${label}`);
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}
(async () => {
  await scenario("Scenario A authoritative publication failure", 1);
  await scenario("Scenario B projection publication failure", 3);
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-phase3c2b3-success-"));
  try {
    const store = createGenerationStore({ baseDirectory: directory, fileSystem: realFs() });
    const authoritative = participant([]); const projection = participant({ "server-366": {} });
    const coordinator = createApplicationPersistenceCoordinator({ generationStore: store, mutationCoordinator: createApplicationMutationCoordinator({ participants: [authoritative, projection] }), legacyStateClassifier: { classify: () => ({ status: "first_run" }) }, serializeDocuments: async () => [{ documentId: "strategic", scope: "season-1", type: "strategic", value: { records: authoritative.value } }, { documentId: "projection", scope: "season-1/map", type: "server-state", value: projection.value }], deserializeDocuments: async (items) => items, applyState: async () => {}, clock: () => new Date("2026-08-12T12:00:00.000Z"), createTransactionId: () => "success" });
    await coordinator.load({ legacyDocuments: [] });
    await coordinator.execute(() => { authoritative.value.push({ id: "ownership-1" }); projection.value["server-366"]["3-4"] = "union-0001"; });
    const reopened = await store.loadCommittedGeneration();
    assert.deepStrictEqual(reopened.documents.map((item) => item.value), [{ records: [{ id: "ownership-1" }] }, { "server-366": { "3-4": "union-0001" } }]);
    console.log("PASS successful commit/reopen aligned");
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
