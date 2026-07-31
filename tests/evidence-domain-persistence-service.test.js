const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { validateEvidenceAsset, validateEvidenceAssetHistory } =
  require("../src/services/evidence-asset-validator.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");
const { validateEvidenceRecord, validateEvidenceRecordHistory } =
  require("../src/services/evidence-record-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");
const { createEvidenceDomainRuntime } = require("../src/app/evidence-domain-runtime.js");
const { createEvidenceDomainStateSerializer } =
  require("../src/services/evidence-domain-state-serializer.js");
const {
  createEvidenceDomainPersistenceService,
  EvidenceDomainPersistenceServiceError
} = require("../src/services/evidence-domain-persistence-service.js");

const modules = {
  validateEvidenceAsset, validateEvidenceAssetHistory, createEvidenceAssetService,
  validateEvidenceRecord, validateEvidenceRecordHistory, createEvidenceRecordService
};
const serializer = createEvidenceDomainStateSerializer({
  validateEvidenceAssetHistory,
  validateEvidenceRecordHistory
});

function harness(stored = null) {
  const calls = [];
  const adapter = {
    stored,
    async loadEnvelope(identity) {
      calls.push({ action: "load", identity });
      return this.stored;
    },
    async saveEnvelope(identity, envelope) {
      calls.push({ action: "save", identity, envelope });
      this.stored = envelope;
    }
  };
  return {
    adapter,
    calls,
    service: createEvidenceDomainPersistenceService({
      storageAdapter: adapter,
      stateSerializer: serializer,
      createEvidenceDomainRuntime,
      modules,
      clock: () => new Date("2026-07-30T23:45:00.000Z")
    })
  };
}

(async () => {
  const missing = harness();
  const missingResult = await missing.service.load();
  assert.strictEqual(missingResult.status, "missing");
  assert.deepStrictEqual(missingResult.runtime.evidenceAssetService.listAssets(), []);
  assert.deepStrictEqual(missing.calls[0].identity, {
    scope: "evidence_domain",
    domainId: "global"
  });

  const saved = await missing.service.save(missingResult.runtime);
  assert.deepStrictEqual(saved, {
    status: "saved",
    savedAt: "2026-07-30T23:45:00.000Z"
  });
  assert.strictEqual(missing.calls[1].action, "save");

  const restored = harness(missing.adapter.stored);
  const restoredResult = await restored.service.load();
  assert.strictEqual(restoredResult.status, "restored");
  assert.strictEqual(restoredResult.savedAt, "2026-07-30T23:45:00.000Z");

  await assert.rejects(
    () => harness({}).service.load(),
    (error) => error instanceof EvidenceDomainPersistenceServiceError
      && error.code === "stored_evidence_invalid"
  );
  const loadFailure = harness();
  loadFailure.adapter.loadEnvelope = async () => { throw new Error("load failed"); };
  const loadFailureService = createEvidenceDomainPersistenceService({
    storageAdapter: loadFailure.adapter,
    stateSerializer: serializer,
    createEvidenceDomainRuntime,
    modules,
    clock: () => new Date()
  });
  await assert.rejects(
    () => loadFailureService.load(),
    (error) => error.code === "storage_load_failed" && error.cause.message === "load failed"
  );
  assert.throws(() => createEvidenceDomainPersistenceService({}), (error) => error.code === "invalid_factory");

  class Adapter {
    async loadEnvelope() {
      assert.strictEqual(this instanceof Adapter, true);
      return null;
    }
    async saveEnvelope() {
      assert.strictEqual(this instanceof Adapter, true);
    }
  }
  const classService = createEvidenceDomainPersistenceService({
    storageAdapter: new Adapter(),
    stateSerializer: serializer,
    createEvidenceDomainRuntime,
    modules,
    clock: () => new Date("2026-07-30T23:45:00.000Z")
  });
  assert.strictEqual((await classService.load()).status, "missing");

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "evidence-domain-persistence-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createEvidenceDomainPersistenceService, "function");
  assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB|\bfs\b/.test(source));

  console.log("ok - evidence domain persistence service");
  console.log("\n1 test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
