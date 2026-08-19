const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGenerationStore } = require("../src/main/generation-store.js");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");
const { createApplicationPersistenceFacade } = require("../src/services/application-persistence-facade.js");
const { createOwnershipRecordService } = require("../src/services/ownership-record-service.js");
const {
  validateTerritoryOwnershipRecord,
  validateTerritoryOwnershipHistory,
  validateStructureOwnershipRecord,
  validateStructureOwnershipHistory
} = require("../src/services/ownership-record-validator.js");
const { createOwnershipHistoryResolver } = require("../src/services/ownership-history-resolver.js");
const { createOwnershipProjectionComparator } = require("../src/services/ownership-projection-comparator.js");
const { createOwnershipProjectionReplacementCoordinator } = require("../src/services/ownership-projection-replacement-coordinator.js");
const { createServerStateService } = require("../src/services/server-state-service.js");
const { serializeServerState, deserializePersistenceEnvelope } = require("../src/services/persistence-state-serializer.js");

const SEASON_ID = "season-1";
const BASE_MAP_ID = "season1-map";
const SERVER_ID = "server-366";
const OTHER_SERVER_ID = "server-367";
const SAVED_AT = "2026-08-12T12:00:00.000Z";

function territoryRecord() {
  return {
    ownershipRecordId: "ownership-1",
    serverId: SERVER_ID,
    seasonId: SEASON_ID,
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-08-01T00:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-08-01T00:10:00Z",
    supersededBy: null
  };
}

function targetCatalog() {
  return {
    territoryKeys: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
    structures: []
  };
}

function createHistory() {
  const history = createOwnershipRecordService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [],
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    clock: () => new Date(SAVED_AT)
  });
  history.listRetractions = () => [];
  return history;
}

function createAudit() {
  const state = { records: [{ auditId: "audit-1", actionType: "existing", details: {} }] };
  return {
    listRecords() { return structuredClone(state.records); },
    captureTransactionState() { return structuredClone(state.records); },
    restoreTransactionState(snapshot) { state.records = structuredClone(snapshot); }
  };
}

function createServerState(ownership = { "9-9": null }) {
  return createServerStateService({
    seasonId: SEASON_ID,
    baseMapId: BASE_MAP_ID,
    servers: [
      { id: SERVER_ID, label: "Server 366", ownership },
      { id: OTHER_SERVER_ID, label: "Server 367", ownership: { "8-8": "union-other" } }
    ]
  });
}

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

function createStateEnvelope(history, serverState, audit) {
  return {
    union: { identities: [{ unionId: "union-1" }] },
    strategic: {
      schemaVersion: 2,
      seasonId: SEASON_ID,
      state: {
        territoryOwnershipRecords: history.listTerritoryRecords(),
        structureOwnershipRecords: history.listStructureRecords(),
        ownershipRetractions: history.listRetractions()
      }
    },
    evidence: { assets: [], evidenceRecords: [] },
    server: serializeServerState(serverState, SAVED_AT),
    audit: { schemaVersion: 1, records: audit.listRecords() }
  };
}

function buildContext(directory, options = {}) {
  const rawStore = createGenerationStore({ baseDirectory: directory, fileSystem: createFileSystem() });
  let commitCount = 0;
  const generationStore = {
    loadCommittedGeneration: rawStore.loadCommittedGeneration,
    async commit(value) {
      commitCount += 1;
      if ((options.failFirstCommit && commitCount === 1) || (options.failSecondCommit && commitCount === 2)) throw new Error("generation commit failed");
      return rawStore.commit(value);
    }
  };
  const history = createHistory();
  const serverState = createServerState(options.initialOwnership);
  const audit = createAudit();
  const mutation = createApplicationMutationCoordinator({ participants: [history, serverState, audit] });
  const resolver = createOwnershipHistoryResolver({ targetCatalog: targetCatalog() });
  const replacement = createOwnershipProjectionReplacementCoordinator({
    ownershipHistoryResolver: resolver,
    ownershipProjectionComparator: createOwnershipProjectionComparator(),
    ownershipRecordService: history,
    serverStateService: serverState,
    mutationCoordinator: mutation
  });
  const serializeDocuments = async () => {
    const envelope = createStateEnvelope(history, serverState, audit);
    return [
      { documentId: "union", scope: "global", type: "union", value: envelope.union },
      { documentId: "strategic", scope: SEASON_ID, type: "strategic", value: envelope.strategic },
      { documentId: "evidence", scope: SEASON_ID, type: "evidence", value: envelope.evidence },
      { documentId: "server", scope: `${SEASON_ID}/${BASE_MAP_ID}`, type: "server-state", value: envelope.server },
      { documentId: "audit", scope: "global", type: "application-audit", value: envelope.audit }
    ];
  };
  const deserializeDocuments = async (documents) => {
    const values = Object.fromEntries(documents.map((document) => [document.documentId, document.value]));
    return {
      union: values.union,
      strategic: values.strategic,
      evidence: values.evidence,
      server: deserializePersistenceEnvelope(values.server),
      audit: values.audit
    };
  };
  const applyState = async (state) => {
    history.restoreTransactionState({
      territoryRecords: state.strategic.state.territoryOwnershipRecords,
      structureRecords: state.strategic.state.structureOwnershipRecords
    });
    serverState.replaceTerritoryOwnership(Object.fromEntries(state.server.servers.map((server) => [server.id, server.ownership])));
    audit.restoreTransactionState(state.audit.records);
  };
  const coordinator = createApplicationPersistenceCoordinator({
    generationStore,
    mutationCoordinator: mutation,
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments,
    deserializeDocuments,
    applyState,
    clock: () => new Date(SAVED_AT),
    createTransactionId: () => `transaction-${commitCount + 1}`,
    ownershipProjectionReplacementCoordinator: replacement
  });
  const facade = createApplicationPersistenceFacade({ coordinator });
  return { rawStore, coordinator, facade, history, serverState, audit, get commitCount() { return commitCount; } };
}

async function initialize(directory, options) {
  const context = buildContext(directory, options);
  await context.facade.load({});
  await context.facade.commitCurrent();
  return context;
}

async function withDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-ownership-repair-"));
  try { return await callback(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}

(async () => {
  await withDirectory(async (directory) => {
    const context = await initialize(directory, { initialOwnership: { "9-9": null } });
    const beforeHistory = context.history.listTerritoryRecords();
    const beforeAudit = context.audit.listRecords();
    const beforeOther = context.serverState.getTerritoryOwnership(OTHER_SERVER_ID);
    const repaired = await context.facade.repairOwnershipProjection({ seasonId: SEASON_ID, serverId: SERVER_ID });
    assert.strictEqual(repaired.status, "repaired");
    assert.deepStrictEqual(context.serverState.getTerritoryOwnership(SERVER_ID), { "1-1": "union-1" });
    assert.deepStrictEqual(context.serverState.getTerritoryOwnership(OTHER_SERVER_ID), beforeOther);
    assert.deepStrictEqual(context.history.listTerritoryRecords(), beforeHistory);
    assert.deepStrictEqual(context.audit.listRecords(), beforeAudit);
    assert.strictEqual(context.commitCount, 2);

    const reopened = buildContext(directory);
    const loadResult = await reopened.facade.load({});
    assert.strictEqual(loadResult.status, "committed");
    assert.strictEqual(loadResult.generation, 2);
    assert.deepStrictEqual(reopened.serverState.getTerritoryOwnership(SERVER_ID), { "1-1": "union-1" });
    assert.deepStrictEqual(reopened.serverState.getTerritoryOwnership(OTHER_SERVER_ID), beforeOther);
    assert.deepStrictEqual(reopened.history.listTerritoryRecords(), beforeHistory);
    assert.deepStrictEqual(reopened.audit.listRecords(), beforeAudit);
    const generation = await reopened.rawStore.loadCommittedGeneration();
    assert.deepStrictEqual(generation.manifest.documents.map((document) => document.documentId).sort(), ["audit", "evidence", "server", "strategic", "union"]);
    const generationValues = Object.fromEntries(generation.documents.map((document) => [document.documentId, document.value]));
    assert.deepStrictEqual(generationValues.union, { identities: [{ unionId: "union-1" }] });
    assert.deepStrictEqual(generationValues.evidence, { assets: [], evidenceRecords: [] });
    assert.deepStrictEqual(generationValues.audit, { schemaVersion: 1, records: beforeAudit });
    console.log("PASS real-store repair and reopen preserves history, audit, and other server");
  });

  await withDirectory(async (directory) => {
    const context = await initialize(directory, { initialOwnership: { "1-1": "union-1" } });
    const unchanged = await context.facade.repairOwnershipProjection({ seasonId: SEASON_ID, serverId: SERVER_ID });
    assert.strictEqual(unchanged.status, "unchanged");
    assert.strictEqual(context.commitCount, 1);
    const generation = await context.rawStore.loadCommittedGeneration();
    assert.strictEqual(generation.manifest.generation, 1);
    console.log("PASS matching repair creates no generation");
  });

  await withDirectory(async (directory) => {
    const context = await initialize(directory, { initialOwnership: { "9-9": null } });
    const recovery = await context.facade.repairOwnershipProjection({ seasonId: "season-2", serverId: SERVER_ID });
    assert.strictEqual(recovery.status, "recovery_required");
    assert.strictEqual(context.commitCount, 1);
    assert.deepStrictEqual(context.serverState.getTerritoryOwnership(SERVER_ID), { "9-9": null });
    const callerEnvelope = await context.facade.repairOwnershipProjection({ seasonId: SEASON_ID, serverId: SERVER_ID, persistedProjection: {} });
    assert.strictEqual(callerEnvelope.status, "recovery_required");
    assert.strictEqual(callerEnvelope.reason, "invalid_input");
    assert.strictEqual(context.commitCount, 1);
    console.log("PASS recovery creates no generation and does not mutate live state");
  });

  await withDirectory(async (directory) => {
    const context = await initialize(directory, { initialOwnership: { "9-9": null } });
    const failing = buildContext(directory, { failFirstCommit: true });
    await failing.facade.load({});
    const before = failing.serverState.captureTransactionState();
    await assert.rejects(() => failing.facade.repairOwnershipProjection({ seasonId: SEASON_ID, serverId: SERVER_ID }), /not saved and was rolled back/);
    assert.deepStrictEqual(failing.serverState.captureTransactionState(), before);
    const committed = await failing.rawStore.loadCommittedGeneration();
    assert.strictEqual(committed.status, "committed");
    assert.strictEqual(committed.manifest.generation, 1);
    assert.deepStrictEqual(context.serverState.getTerritoryOwnership(SERVER_ID), { "9-9": null });
    console.log("PASS generation commit failure restores live state and prior generation remains current");
  });

  console.log("4 ownership projection repair generation scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
