const assert = require("assert");
const {
  validateOwnershipRetractionRecord,
  validateOwnershipRetractionHistory
} = require("../src/services/ownership-retraction-validator.js");

function record(overrides = {}) {
  return {
    retractionId: "retraction-1",
    seasonId: "season-1",
    serverId: "server-366",
    targetKind: "territory_ownership_record",
    retractedRecordId: "territory-1",
    actorId: "operator-1",
    reason: "Undo capture",
    recordedAt: "2026-08-19T10:00:00Z",
    transactionId: "transaction-1",
    sourceType: "manual_retraction",
    ...overrides
  };
}

assert.strictEqual(validateOwnershipRetractionRecord(record()).valid, true);
assert.strictEqual(validateOwnershipRetractionHistory([record()]).valid, true);

const unknownField = validateOwnershipRetractionRecord({ ...record(), extra: true });
assert.strictEqual(unknownField.valid, false);
assert.ok(unknownField.errors.some((entry) => entry.code === "UNKNOWN_FIELD"));

const badSource = validateOwnershipRetractionRecord(record({ sourceType: "manual_entry" }));
assert.strictEqual(badSource.valid, false);
assert.ok(badSource.errors.some((entry) => entry.code === "INVALID_SOURCE_TYPE"));

const impossibleDate = validateOwnershipRetractionRecord(record({ recordedAt: "2026-02-30T12:00:00.000Z" }));
assert.strictEqual(impossibleDate.valid, false);
assert.ok(impossibleDate.errors.some((entry) => entry.code === "INVALID_TIMESTAMP"));

const duplicateTarget = validateOwnershipRetractionHistory([
  record({ retractionId: "r-1", retractedRecordId: "territory-1" }),
  record({ retractionId: "r-2", retractedRecordId: "territory-1" })
]);
assert.strictEqual(duplicateTarget.valid, false);
assert.ok(duplicateTarget.errors.some((entry) => entry.code === "DUPLICATE_RETRACTED_RECORD"));

console.log("ok - ownership retraction validator");
console.log("\n1 test passed");
