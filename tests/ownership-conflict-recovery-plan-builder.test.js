const assert = require("assert");
const {
  createOwnershipConflictRecoveryPlanBuilder,
  OwnershipConflictRecoveryPlanBuilderError
} = require("../src/services/ownership-conflict-recovery-plan-builder.js");
const { validateAuditHistory } = require("../src/services/application-audit-record-validator.js");

function record(kind, id, owner) {
  return kind === "territory"
    ? { ownershipRecordId: id, ownerUnionId: owner, seasonId: "season-1", serverId: "server-366", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownershipState: "owned", reviewState: "confirmed", eventAt: { precision: "exact", at: "2026-08-20T09:00:00Z" }, supersededBy: null }
    : { structureOwnershipId: id, ownerUnionId: owner, seasonId: "season-1", serverId: "server-366", structureId: "fort-1", ownershipState: "owned", reviewState: "confirmed", eventAt: { precision: "exact", at: "2026-08-20T09:00:00Z" }, supersededBy: null };
}
function auditRecord(id, details = {}) {
  return { auditId: id, transactionId: `transaction-${id}`, sequence: 1, actionType: "ownership_confirmed", targetType: "ownership_record", targetId: `target-${id}`, seasonId: "season-1", serverId: "server-366", actorId: "operator", recordedAt: "2026-08-20T09:20:00.000Z", outcome: "accepted", details };
}
function snapshot(kind = "territory", ids = ["a", "b"], overrides = {}) {
  const records = ids.map((id, index) => record(kind, id, `union-${index + 1}`));
  return {
    status: "recovery_ready",
    sourceGeneration: { generation: 4, manifestFile: "generation-4.json", manifestSha256: "sha256:generation-4" },
    scope: { seasonId: "season-1", baseMapId: "season1-map", serverIds: ["server-366"], archived: false },
    documentMetadata: [{ documentId: "strategic-season-1", scope: "season-1", type: "strategic-domain", fileName: "strategic.json", sha256: "sha256:strategic" }],
    existingAuditRecords: [],
    territoryRecords: kind === "territory" ? records : [],
    structureRecords: kind === "structure" ? records : [],
    retractionRecords: [],
    conflict: { seasonId: "season-1", serverId: "server-366", kind, targetKey: kind === "territory" ? '["normal_map_cell",1,1]' : '["logical_structure","fort-1"]', recordIds: ids.slice(), records },
    ...overrides
  };
}
function build(input) { return createOwnershipConflictRecoveryPlanBuilder({ validateAuditHistory }).build(input); }
function expectError(callback, code) { assert.throws(callback, (error) => error instanceof OwnershipConflictRecoveryPlanBuilderError && error.code === code); }

expectError(() => createOwnershipConflictRecoveryPlanBuilder(), "invalid_factory");
expectError(() => createOwnershipConflictRecoveryPlanBuilder({ validateAuditHistory: null }), "invalid_factory");

const territoryPlan = build({ snapshot: snapshot(), retainedRecordId: "a", reason: "Duplicate terminal import" });
assert.strictEqual(territoryPlan.status, "recovery_plan_ready");
assert.deepStrictEqual(territoryPlan.rejectedRecordIds, ["b"]);
assert.deepStrictEqual(territoryPlan.existingAuditRecords, []);
console.log("PASS valid territory recovery plan");

const structurePlan = build({ snapshot: snapshot("structure"), retainedRecordId: "b", reason: "Structure record B is authoritative" });
assert.strictEqual(structurePlan.conflict.kind, "structure");
assert.deepStrictEqual(structurePlan.rejectedRecordIds, ["a"]);
console.log("PASS valid structure recovery plan");

["a", "b", "c"].forEach((retainedRecordId) => {
  const plan = build({ snapshot: snapshot("territory", ["c", "a", "b"]), retainedRecordId, reason: "retain listed record" });
  assert.strictEqual(plan.retainedRecordId, retainedRecordId);
  assert.deepStrictEqual(plan.rejectedRecordIds, ["a", "b", "c"].filter((id) => id !== retainedRecordId));
});
console.log("PASS first middle and last retention derive canonical rejected IDs");

expectError(() => build({ snapshot: snapshot(), retainedRecordId: "missing", reason: "reason" }), "invalid_retained_record");
["", "   ", 4, null].forEach((reason) => expectError(() => build({ snapshot: snapshot(), retainedRecordId: "a", reason }), "invalid_reason"));
expectError(() => build({ snapshot: snapshot(), retainedRecordId: "a", reason: "x".repeat(1001) }), "invalid_reason");
console.log("PASS retained ID and strict reason validation");

expectError(() => build({ snapshot: snapshot("territory", ["a", "b"], { scope: { ...snapshot().scope, archived: true } }), retainedRecordId: "a", reason: "reason" }), "archived_read_only");
["recovery_not_required", "blocked", "malformed"].forEach((status) => expectError(() => build({ snapshot: { ...snapshot(), status }, retainedRecordId: "a", reason: "reason" }), "recovery_not_ready"));
console.log("PASS archived and non-recovery snapshots are refused");

expectError(() => build({ snapshot: { ...snapshot(), conflict: { ...snapshot().conflict, recordIds: ["a", "missing"] } }, retainedRecordId: "a", reason: "reason" }), "invalid_conflict");
expectError(() => build({ snapshot: { ...snapshot(), sourceGeneration: null }, retainedRecordId: "a", reason: "reason" }), "invalid_input");
expectError(() => build({ snapshot: Object.fromEntries(Object.entries(snapshot()).filter(([field]) => field !== "existingAuditRecords")), retainedRecordId: "a", reason: "reason" }), "invalid_input");
[null, {}, [null], ["invalid"], [{}], [auditRecord("duplicate"), auditRecord("duplicate", { different: true })]].forEach((existingAuditRecords) => expectError(() => build({ snapshot: snapshot("territory", ["a", "b"], { existingAuditRecords }), retainedRecordId: "a", reason: "reason" }), Array.isArray(existingAuditRecords) ? "invalid_snapshot" : "invalid_input"));
console.log("PASS malformed and incomplete snapshots are refused");

const extraFields = ["conflictKind", "targetKey", "rejectedRecordIds", "projection", "provenance", "transactionId", "timestamp", "auditFacts", "existingAuditRecords", "seasonId"];
extraFields.forEach((field) => {
  const input = { snapshot: snapshot(), retainedRecordId: "a", reason: "reason", [field]: "caller-value" };
  expectError(() => build(input), "invalid_input");
});
console.log("PASS caller-authored authority fields are rejected");

const permuted = build({ snapshot: snapshot("territory", ["b", "a", "c"]), retainedRecordId: "a", reason: "reason" });
const ordered = build({ snapshot: snapshot("territory", ["a", "b", "c"]), retainedRecordId: "a", reason: "reason" });
assert.deepStrictEqual(permuted.rejectedRecordIds, ordered.rejectedRecordIds);
assert.strictEqual(permuted.conflictFingerprint, ordered.conflictFingerprint);
console.log("PASS plan output is deterministic under permitted conflict permutations");

const original = snapshot();
const before = JSON.stringify(original);
const plan = build({ snapshot: original, retainedRecordId: "a", reason: "reason" });
assert.strictEqual(JSON.stringify(original), before);
assert.strictEqual(Object.isFrozen(plan), true);
assert.strictEqual(Object.isFrozen(plan.conflict), true);
assert.strictEqual(Object.isFrozen(plan.rejectedRecordIds), true);
try { plan.conflict.records[0].ownerUnionId = "mutated"; } catch (_error) { }
assert.strictEqual(JSON.stringify(original), before);
console.log("PASS input and output are isolated and immutable");

const existingAuditRecords = [auditRecord("audit-1", { nested: { order: 1 } }), auditRecord("audit-2", { nested: { order: 2 } })];
const auditPlan = build({ snapshot: snapshot("territory", ["a", "b"], { existingAuditRecords }), retainedRecordId: "a", reason: "reason" });
assert.deepStrictEqual(auditPlan.existingAuditRecords, existingAuditRecords);
assert.notStrictEqual(auditPlan.existingAuditRecords, existingAuditRecords);
assert.strictEqual(Object.isFrozen(auditPlan.existingAuditRecords), true);
assert.strictEqual(Object.isFrozen(auditPlan.existingAuditRecords[0].details.nested), true);
existingAuditRecords[0].details.nested.order = "changed";
assert.strictEqual(auditPlan.existingAuditRecords[0].details.nested.order, 1);
console.log("PASS existing audit history preserves order and remains isolated");

const source = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "services", "ownership-conflict-recovery-plan-builder.js"), "utf8");
assert.doesNotMatch(source, /GenerationStore|filesystem|electron|\bipc\b|timestamp|Date\(|write|commit|publish|prepare|fetch|localStorage/i);
console.log("PASS plan builder is host-neutral and side-effect free");
console.log("18 ownership conflict recovery plan scenarios passed");
