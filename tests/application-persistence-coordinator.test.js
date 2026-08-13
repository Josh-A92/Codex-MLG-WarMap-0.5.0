const assert = require("assert");
const { createApplicationMutationCoordinator } = require("../src/services/application-mutation-coordinator.js");
const { createApplicationPersistenceCoordinator } = require("../src/services/application-persistence-coordinator.js");
const { createWarMapApplicationPersistenceCoordinator } = require("../src/services/warmap-application-persistence-composition.js");
const { createApplicationAuditRecordService } = require("../src/services/application-audit-record-service.js");
const { validateAuditRecord, validateAuditHistory } = require("../src/services/application-audit-record-validator.js");
const { createApplicationAuditRecordSerializer } = require("../src/services/application-audit-record-serializer.js");

function participant(value) {
  return {
    value,
    captureTransactionState() { return structuredClone(this.value); },
    restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); }
  };
}

function baseOptions(overrides = {}) {
  const first = participant("before");
  const second = participant(0);
  const options = {
    generationStore: {
      async loadCommittedGeneration() {
        return { status: "committed", source: "current", manifest: { generation: 4 }, documents: [] };
      },
      async commit() { return { generation: 5 }; }
    },
    mutationCoordinator: createApplicationMutationCoordinator({ participants: [first, second] }),
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    serializeDocuments: async () => [],
    deserializeDocuments: async () => ({ value: "loaded" }),
    applyState: async () => {},
    clock: () => new Date("2026-08-12T12:00:00.000Z"),
    createTransactionId: () => "tx-test",
    ...overrides
  };
  return { options, first, second };
}

(async () => {
  const timestamps = [];
  const applicationAuditRecordService = createApplicationAuditRecordService({
    initialRecords: [], validateAuditRecord, validateAuditHistory,
    createAuditId: () => "audit-test", clock: () => new Date("2026-08-12T12:00:00.000Z")
  });
  const auditSerializer = createApplicationAuditRecordSerializer({ validateAuditHistory });
  let committedDocuments = null;
  const compositionOptions = {
    generationStore: { async loadCommittedGeneration() { return { status: "missing" }; }, async commit(payload) { committedDocuments = payload.documents; return { generation: 1 }; } },
    mutationCoordinator: createApplicationMutationCoordinator({ participants: [participant(1)] }),
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    unionRegistryService: {}, strategicDomainRuntime: {}, evidenceDomainRuntime: {}, serverStateService: {},
    seasonAdministrationService: {
      captureTransactionState: () => ({ schemaVersion: 2, activeSeason: null, completedSeasons: [] }),
      restoreTransactionState: () => {}
    },
    applicationAuditRecordService,
    serializeApplicationAuditRecords: auditSerializer.serializeRecords,
    deserializeApplicationAuditEnvelope: auditSerializer.deserializeEnvelope,
    serializeUnionRegistry: (_value, savedAt) => { timestamps.push(savedAt); return {}; },
    deserializeUnionRegistryEnvelope: (value) => value,
    serializeStrategicDomainRuntime: (_value, _season, savedAt) => { timestamps.push(savedAt); return {}; },
    deserializeStrategicDomainEnvelope: (value) => value,
    serializeEvidenceRuntime: (_value, savedAt) => { timestamps.push(savedAt); return {}; },
    deserializeEvidenceEnvelope: (value) => value,
    serializeServerState: (_value, savedAt) => { timestamps.push(savedAt); return {}; },
    deserializeServerState: (value) => value,
    seasonId: "season-1", baseMapId: "season1-map", createTransactionId: () => "tx", clock: () => new Date("2026-08-12T12:00:00.000Z"),
    createApplicationPersistenceCoordinator: createApplicationPersistenceCoordinator
  };
  assert.throws(
    () => createWarMapApplicationPersistenceCoordinator({ ...compositionOptions, createApplicationPersistenceCoordinator: undefined }),
    /Missing createApplicationPersistenceCoordinator/
  );
  const composed = createWarMapApplicationPersistenceCoordinator(compositionOptions);
  await composed.commitCurrent();
  assert.strictEqual(new Set(timestamps).size, 1);
  assert.strictEqual(committedDocuments.filter((document) => document.documentId === "application-audit-global").length, 1);
  assert.strictEqual(committedDocuments.find((document) => document.documentId === "application-audit-global").type, "application-audit");

  const context = baseOptions({
    applyState: async () => {
      context.first.value = "partial";
      context.second.value = 99;
      throw new Error("apply failed");
    }
  });
  await assert.rejects(() => createApplicationPersistenceCoordinator(context.options).load({}), /apply failed/);
  assert.strictEqual(context.first.value, "before");
  assert.strictEqual(context.second.value, 0);

  console.log("3 persistence coordinator hardening scenarios passed");
  console.log("1 test passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
