const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { validateAuditRecord, validateAuditHistory, MAX_DETAILS_BYTES } = require("../src/services/application-audit-record-validator.js");
const { createApplicationAuditRecordService, ApplicationAuditRecordServiceError } = require("../src/services/application-audit-record-service.js");

const clock = () => new Date("2026-08-13T10:00:00.000Z");
let id = 0;
const base = {
  transactionId: "tx-1", sequence: 1, actionType: "target_verification_confirmed",
  targetType: "target_verification", targetId: "verification-1", seasonId: "season-1",
  serverId: "server-366", actorId: "desktop-user", details: { correctionOf: null }
};
function create(overrides = {}) {
  return createApplicationAuditRecordService({
    initialRecords: [], validateAuditRecord, validateAuditHistory,
    createAuditId: () => `audit-${++id}`, clock, ...overrides
  });
}

const service = create();
const first = service.append(base);
assert.strictEqual(first.auditId, "audit-1");
assert.strictEqual(first.recordedAt, "2026-08-13T10:00:00.000Z");
assert.strictEqual(first.outcome, "accepted");
assert.deepStrictEqual(service.listRecords(), [first]);
assert.throws(() => service.append({ ...base, sequence: 2, auditId: "forged" }), (error) => error.code === "forged_audit_metadata");
assert.throws(() => service.append({ ...base, sequence: 2, recordedAt: "2026-01-01T00:00:00.000Z" }), (error) => error.code === "forged_audit_metadata");
assert.throws(() => service.append({ ...base, sequence: 2, outcome: "rejected" }), (error) => error.code === "forged_audit_metadata");
assert.strictEqual(validateAuditRecord({ ...first, outcome: "rejected" }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, seasonId: null, serverId: null }).valid, true);
assert.strictEqual(validateAuditRecord({ ...first, sequence: 0 }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, actionType: "unsupported" }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, actionType: "ownership_retracted" }).valid, true);
assert.strictEqual(validateAuditRecord({ ...first, actionType: "ownership_redone" }).valid, true);
assert.strictEqual(validateAuditRecord({ ...first, actionType: "ownership_conflict_resolved" }).valid, true);
assert.strictEqual(validateAuditRecord({
  ...first,
  actionType: "ownership_evidence_attached",
  targetType: "ownership_target",
  targetId: "normal_map_cell:1:1"
}).valid, true);
assert.strictEqual(validateAuditRecord({ ...first, recordedAt: "2026-02-30T10:00:00.000Z" }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, targetType: "unsupported" }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, details: { nested: [true, "x", 1] } }).valid, true);
const cyclic = {}; cyclic.self = cyclic;
assert.strictEqual(validateAuditRecord({ ...first, details: cyclic }).valid, false);
assert.strictEqual(validateAuditRecord({ ...first, details: { text: "x".repeat(MAX_DETAILS_BYTES) } }).valid, false);
const details = { nested: { value: "before" } };
const isolated = create();
const isolatedRecord = isolated.append({ ...base, details, sequence: 2 });
details.nested.value = "after";
isolatedRecord.details.nested.value = "changed";
assert.strictEqual(isolated.listRecords()[0].details.nested.value, "before");
const ordered = create();
ordered.append({ ...base, transactionId: "z", sequence: 1 });
ordered.append({ ...base, transactionId: "a", sequence: 2 });
const orderedRecords = ordered.listRecords();
assert.deepStrictEqual(orderedRecords.map((record) => [record.transactionId, record.sequence]), [["a", 2], ["z", 1]]);
assert.throws(() => ordered.append({ ...base, transactionId: "z", sequence: 1 }), (error) => error.code === "duplicate_transaction_sequence");
const rollback = create();
const snapshot = rollback.captureTransactionState();
rollback.append({ ...base, sequence: 2 });
rollback.restoreTransactionState(snapshot);
assert.deepStrictEqual(rollback.listRecords(), []);
const ownershipOperations = create();
ownershipOperations.append({ ...base, transactionId: "undo-tx", actionType: "ownership_retracted" });
ownershipOperations.append({ ...base, transactionId: "redo-tx", actionType: "ownership_redone" });
assert.deepStrictEqual(
  ownershipOperations.listRecords().map((record) => record.actionType),
  ["ownership_redone", "ownership_retracted"]
);
assert.throws(() => rollback.restoreTransactionState([{ ...first, auditId: "dup" }, { ...first, auditId: "dup", sequence: 2 }]), (error) => error.code === "invalid_history");
assert.deepStrictEqual(rollback.listRecords(), []);
assert.throws(() => create({ clock: () => new Date("invalid") }).append(base), (error) => error.code === "invalid_clock");
assert.strictEqual(ApplicationAuditRecordServiceError.prototype instanceof Error, true);
const validatorSource = fs.readFileSync("src/services/application-audit-record-validator.js", "utf8");
const serviceSource = fs.readFileSync("src/services/application-audit-record-service.js", "utf8");
assert.doesNotMatch(validatorSource, /\bBuffer\b|fs|electron|ipcRenderer|localStorage|indexedDB/);
assert.doesNotMatch(serviceSource, /fs|electron|ipcRenderer|localStorage|indexedDB/);
const sandbox = { globalThis: {}, module: undefined, TextEncoder };
vm.createContext(sandbox);
vm.runInContext(validatorSource, sandbox);
assert.strictEqual(typeof sandbox.globalThis.validateAuditRecord, "function");
console.log("21 application audit contract scenarios passed");
