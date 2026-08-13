const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../src/services/ownership-history-provenance-document-serializer.js");
const { createOwnershipHistoryProvenanceStateService } = require("../src/services/ownership-history-provenance-state-service.js");

const context = { seasonId: "season-1", baseMapId: "season1-map", activeSeasonId: "season-1" };
const record = {
  schemaVersion: 1,
  proofVersion: 1,
  seasonId: context.seasonId,
  serverId: "server-366",
  baseMapId: context.baseMapId,
  territoryCoverage: { classification: "complete", targetKeys: ["1-1"], missingTargetKeys: [], uncertainTargetKeys: [] },
  structureCoverage: { classification: "structurally_empty", targetKeys: [], missingTargetKeys: [], uncertainTargetKeys: [] },
  projectionRelationship: { classification: "complete", targetKeys: [], status: "matching_projection", differences: [] },
  safetyDiagnosticCodes: [],
  sourceKind: "existing_generation",
  sourceDocumentIds: ["strategic-season-1"]
};

function createFileSystem() {
  return {
    mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }),
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
    rename: fs.promises.rename,
    unlink: fs.promises.unlink,
    readdir: fs.promises.readdir,
    access: fs.promises.access,
    flush: async () => {}
  };
}

function createContext(directory, initialState, options = {}) {
  const rawGenerationStore = createGenerationStore({ baseDirectory: directory, fileSystem: createFileSystem() });
  const generationStore = {
    loadCommittedGeneration: rawGenerationStore.loadCommittedGeneration,
    async commit(payload) {
      if (options.failCommit) throw new Error("generation commit failed");
      return rawGenerationStore.commit(payload);
    }
  };
  const serializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const provenance = createOwnershipHistoryProvenanceStateService({ seasonId: context.seasonId, baseMapId: context.baseMapId, serializer, initialState });
  const other = { value: "unchanged", captureTransactionState() { return this.value; }, restoreTransactionState(snapshot) { this.value = snapshot; } };
  const mutation = createApplicationMutationCoordinator({ participants: [other, provenance] });
  let documents = null;
  const serializeDocuments = async () => {
    const result = [
      { documentId: "strategic", scope: context.seasonId, type: "strategic-domain", value: { marker: "history" } },
      { documentId: "server", scope: `${context.seasonId}/${context.baseMapId}`, type: "server-state", value: { marker: "projection" } }
    ];
    if (provenance.isPresent()) result.push({ documentId: serializer.createDocumentId(context.seasonId, context.baseMapId), scope: `${context.seasonId}/${context.baseMapId}`, type: "ownership-history-provenance", value: provenance.serialize() });
    documents = result;
    return result;
  };
  const deserializeDocuments = async (values) => {
    const valuesById = Object.fromEntries(values.map((document) => [document.documentId, document.value]));
    return {
      strategic: valuesById.strategic,
      server: valuesById.server,
      provenance: Object.prototype.hasOwnProperty.call(valuesById, serializer.createDocumentId(context.seasonId, context.baseMapId))
        ? serializer.deserialize(valuesById[serializer.createDocumentId(context.seasonId, context.baseMapId)], context)
        : { status: "unknown_provenance", seasonId: context.seasonId, baseMapId: context.baseMapId, records: [] }
    };
  };
  const applyState = async (state) => {
    other.value = state.strategic.marker;
    provenance.restoreState(state.provenance.status === "present" ? { status: "present", document: state.provenance.document } : { status: "unknown_provenance" });
    if (options.failApply) throw new Error("apply failed");
  };
  const coordinator = createApplicationPersistenceCoordinator({
    generationStore,
    mutationCoordinator: mutation,
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments,
    deserializeDocuments,
    applyState,
    clock: () => new Date("2026-08-13T00:00:00.000Z"),
    createTransactionId: () => "provenance-test"
  });
  return { generationStore, rawGenerationStore, provenance, other, coordinator, get documents() { return documents; } };
}

async function withDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-provenance-generation-"));
  try { return await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}

(async () => {
  await withDirectory(async (directory) => {
    const missing = createContext(directory, { status: "unknown_provenance" });
    await missing.coordinator.load({});
    await missing.coordinator.commitCurrent();
    assert.strictEqual(missing.provenance.getState().status, "unknown_provenance");
    assert.strictEqual((await missing.generationStore.loadCommittedGeneration()).documents.some((document) => document.type === "ownership-history-provenance"), false);
    await missing.coordinator.execute(() => { missing.other.value = "unrelated"; });
    assert.strictEqual((await missing.generationStore.loadCommittedGeneration()).documents.some((document) => document.type === "ownership-history-provenance"), false);
    console.log("PASS missing provenance stays unknown and absent across unrelated commit");
  });

  await withDirectory(async (directory) => {
    const present = createContext(directory, { status: "present", document: { documentId: "ownership-provenance:season-1:season1-map", documentType: "ownership-history-provenance", schemaVersion: 1, proofVersion: 1, seasonId: context.seasonId, baseMapId: context.baseMapId, records: [record] } });
    await present.coordinator.load({});
    await present.coordinator.commitCurrent();
    const first = await present.generationStore.loadCommittedGeneration();
    assert.strictEqual(first.documents.filter((document) => document.type === "ownership-history-provenance").length, 1);
    const reopened = createContext(directory, { status: "unknown_provenance" });
    const loaded = await reopened.coordinator.load({});
    assert.strictEqual(loaded.status, "committed");
    assert.strictEqual(reopened.provenance.getState().status, "present");
    assert.deepStrictEqual(reopened.provenance.getState().document.records, [record]);
    const reopenedGeneration = await reopened.rawGenerationStore.loadCommittedGeneration();
    assert.deepStrictEqual(reopenedGeneration.documents.filter((document) => document.type !== "ownership-history-provenance").map((document) => [document.documentId, document.value]), [["strategic", { marker: "history" }], ["server", { marker: "projection" }]]);
    console.log("PASS present provenance survives generation commit and reopen");
  });

  await withDirectory(async (directory) => {
    const presentEmptyDocument = { documentId: "ownership-provenance:season-1:season1-map", documentType: "ownership-history-provenance", schemaVersion: 1, proofVersion: 1, seasonId: context.seasonId, baseMapId: context.baseMapId, records: [] };
    const presentEmpty = createContext(directory, { status: "present", document: presentEmptyDocument });
    await presentEmpty.coordinator.load({});
    await presentEmpty.coordinator.commitCurrent();
    assert.strictEqual(presentEmpty.provenance.getState().status, "present");
    const presentEmptyGeneration = await presentEmpty.rawGenerationStore.loadCommittedGeneration();
    assert.strictEqual(presentEmptyGeneration.documents.filter((document) => document.type === "ownership-history-provenance").length, 1);
    console.log("PASS present-empty provenance remains distinct from missing");
  });

  await withDirectory(async (directory) => {
    const malformed = createContext(directory, { status: "present", document: { documentId: "ownership-provenance:season-1:season1-map", documentType: "ownership-history-provenance", schemaVersion: 1, proofVersion: 1, seasonId: context.seasonId, baseMapId: context.baseMapId, records: [record] } });
    const store = malformed.generationStore;
    await malformed.coordinator.load({});
    await malformed.coordinator.commitCurrent();
    const committed = await store.loadCommittedGeneration();
    const malformedDocuments = committed.documents.map((document) => document.type === "ownership-history-provenance" ? { ...document, value: { ...document.value, records: [record, record] } } : document);
    await store.commit({ expectedGeneration: 1, transactionId: "malformed", createdAt: "2026-08-13T00:00:00.000Z", documents: malformedDocuments });
    const fresh = createContext(directory, { status: "unknown_provenance" });
    const result = await fresh.coordinator.load({});
    assert.strictEqual(result.status, "recovery_required");
    assert.strictEqual(fresh.other.value, "unchanged");
    assert.strictEqual(fresh.provenance.getState().status, "unknown_provenance");
    console.log("PASS malformed present provenance blocks adoption");
  });

  await withDirectory(async (directory) => {
    const present = createContext(directory, { status: "present", document: { documentId: "ownership-provenance:season-1:season1-map", documentType: "ownership-history-provenance", schemaVersion: 1, proofVersion: 1, seasonId: context.seasonId, baseMapId: context.baseMapId, records: [record] } });
    await present.coordinator.load({});
    await present.coordinator.commitCurrent();
    const before = present.provenance.getState();
    const failing = createContext(directory, { status: "present", document: before.document }, { failApply: true });
    await assert.rejects(() => failing.coordinator.load({}), /apply failed/);
    assert.deepStrictEqual(failing.provenance.getState(), { status: "present", seasonId: context.seasonId, baseMapId: context.baseMapId, document: before.document });
    console.log("PASS apply failure restores provenance participant");
  });

  await withDirectory(async (directory) => {
    const initial = createContext(directory, { status: "present", document: { documentId: "ownership-provenance:season-1:season1-map", documentType: "ownership-history-provenance", schemaVersion: 1, proofVersion: 1, seasonId: context.seasonId, baseMapId: context.baseMapId, records: [record] } });
    await initial.coordinator.load({});
    await initial.coordinator.commitCurrent();
    const failing = createContext(directory, { status: "present", document: initial.provenance.getState().document }, { failCommit: true });
    await failing.coordinator.load({});
    const before = failing.provenance.getState();
    await assert.rejects(() => failing.coordinator.execute(() => { failing.other.value = "mutated"; }), /generation commit failed/);
    assert.deepStrictEqual(failing.provenance.getState(), before);
    assert.strictEqual(failing.other.value, "history");
    const prior = await failing.rawGenerationStore.loadCommittedGeneration();
    assert.strictEqual(prior.status, "committed");
    assert.strictEqual(prior.manifest.generation, 1);
    console.log("PASS generation commit failure restores provenance and prior generation");
  });

  console.log("6 provenance generation scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

