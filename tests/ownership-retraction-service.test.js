const assert = require("assert");
const {
  createOwnershipRetractionService,
  OwnershipRetractionServiceError
} = require("../src/services/ownership-retraction-service.js");
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

const service = createOwnershipRetractionService({
  initialRetractions: [],
  validateOwnershipRetractionRecord,
  validateOwnershipRetractionHistory
});

const added = service.addManualRetraction(record());
assert.strictEqual(added.retractionId, "retraction-1");
assert.strictEqual(service.hasRetractedRecordReference("territory-1"), true);
assert.strictEqual(service.listRetractions({ serverId: "server-366" }).length, 1);

assert.throws(
  () => service.addManualRetraction(record({ retractionId: "retraction-2" })),
  (error) => error instanceof OwnershipRetractionServiceError && error.code === "duplicate_retracted_record"
);

const snapshot = service.captureTransactionState();
snapshot.push(record({ retractionId: "mutated", retractedRecordId: "territory-2" }));
assert.strictEqual(service.listRetractions().length, 1);

service.restoreTransactionState([
  record({ retractionId: "retraction-3", retractedRecordId: "territory-3" })
]);
assert.deepStrictEqual(service.listRetractions().map((entry) => entry.retractedRecordId), ["territory-3"]);

assert.throws(
  () => createOwnershipRetractionService({ initialRetractions: [] }),
  (error) => error instanceof OwnershipRetractionServiceError && error.code === "invalid_factory"
);

console.log("ok - ownership retraction service");
console.log("\n1 test passed");
