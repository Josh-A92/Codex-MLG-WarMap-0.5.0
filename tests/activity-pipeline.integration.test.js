const assert = require("assert");
const {
  createConfirmedServerSnapshotValidator
} = require("../src/services/confirmed-server-snapshot-validator.js");
const {
  validateTerritoryOwnershipRecord,
  validateTerritoryOwnershipHistory,
  validateStructureOwnershipRecord,
  validateStructureOwnershipHistory
} = require("../src/services/ownership-record-validator.js");
const {
  validateTargetVerificationRecord,
  validateTargetVerificationHistory
} = require("../src/services/target-verification-validator.js");
const {
  createSnapshotActivityFactResolver
} = require("../src/services/snapshot-activity-fact-resolver.js");
const {
  createActivityFactHistoryService
} = require("../src/services/activity-fact-history-service.js");
const {
  createActiveUnionStatusEvaluator
} = require("../src/services/active-union-status-evaluator.js");
const {
  validateActiveUnionStatus,
  validateActiveUnionStatusHistory
} = require("../src/services/active-union-status-validator.js");
const {
  createActiveUnionStatusService
} = require("../src/services/active-union-status-service.js");
const {
  createUnionServerSeasonRelationService
} = require("../src/services/union-server-season-relation-service.js");
const {
  createActiveUnionStatusUpdateCoordinator
} = require("../src/services/active-union-status-update-coordinator.js");
const {
  createActiveUnionStatusProjectionService
} = require("../src/services/active-union-status-projection-service.js");

function createPipeline() {
  const snapshotValidator = createConfirmedServerSnapshotValidator({
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  });
  const resolver = createSnapshotActivityFactResolver({
    evaluateConfirmedServerSnapshotReferences:
      snapshotValidator.evaluateConfirmedServerSnapshotReferences
  });
  const factHistory = createActivityFactHistoryService();
  const evaluator = createActiveUnionStatusEvaluator({ validateActiveUnionStatus });
  const statusService = createActiveUnionStatusService({
    initialStatuses: [],
    validateActiveUnionStatus,
    validateActiveUnionStatusHistory
  });
  const relationService = createUnionServerSeasonRelationService([{
    unionId: "union-1",
    serverId: "server-366",
    seasonId: "season-1",
    currentNativeStatusId: null,
    currentActiveStatusId: null,
    firstConfirmedPresenceAt: null,
    mostRecentConfirmedPresenceAt: null,
    evidenceIds: [],
    manualOverride: null
  }]);
  const coordinator = createActiveUnionStatusUpdateCoordinator({
    snapshotActivityFactResolver: resolver,
    activeUnionStatusEvaluator: evaluator,
    activeUnionStatusService: statusService,
    activityFactHistoryService: factHistory,
    relationService
  });
  const projectionService = createActiveUnionStatusProjectionService({
    activeUnionStatusEvaluator: evaluator,
    activeUnionStatusService: statusService,
    activityFactHistoryService: factHistory
  });
  return { coordinator, factHistory, statusService, relationService, projectionService };
}

function snapshotInput(sequence, observedAt, owned) {
  const ownershipRecordId = `ownership-${sequence}`;
  const verificationId = `verification-${sequence}`;
  const snapshotId = `snapshot-${sequence}`;
  return {
    unionId: "union-1",
    snapshot: {
      snapshotId,
      serverId: "server-366",
      seasonId: "season-1",
      createdAt: observedAt,
      ownershipRecordIds: [ownershipRecordId],
      structureOwnershipRecordIds: [],
      verificationRecordIds: [verificationId],
      unionStatusRecordIds: [],
      evidenceIds: [],
      creatorId: "actor-1",
      reviewerId: "reviewer-1",
      completenessRecordIds: [],
      previousConfirmedSnapshotId: sequence === 1 ? null : `snapshot-${sequence - 1}`
    },
    territoryOwnershipRecords: [{
      ownershipRecordId,
      serverId: "server-366",
      seasonId: "season-1",
      territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
      ownerUnionId: owned ? "union-1" : null,
      ownershipState: owned ? "owned" : "unclaimed",
      reviewState: "confirmed",
      effectiveAt: observedAt,
      sourceType: "manual_entry",
      evidenceIds: [],
      actorId: "actor-1",
      reviewerId: "reviewer-1",
      reviewedAt: observedAt,
      supersededBy: null
    }],
    structureOwnershipRecords: [],
    verificationRecords: [{
      verificationId,
      serverId: "server-366",
      seasonId: "season-1",
      targetRef: { type: "normal_map_cell", row: 1, col: 1 },
      verifiedOwnershipRef: {
        type: "territory_ownership_record",
        recordId: ownershipRecordId
      },
      observedAt,
      confirmedAt: observedAt,
      sourceType: "manual_entry",
      evidenceIds: [],
      actorId: "actor-1",
      reviewerId: "reviewer-1",
      reviewState: "confirmed",
      supersededBy: null
    }],
    requiredTargetRefs: [{ type: "normal_map_cell", row: 1, col: 1 }]
  };
}

function process(pipeline, sequence, observedAt, owned) {
  return pipeline.coordinator.processSnapshot({
    identity: {
      statusId: `status-${sequence}`,
      unionId: "union-1",
      serverId: "server-366",
      seasonId: "season-1",
      evaluatedAt: observedAt
    },
    snapshotFactInput: snapshotInput(sequence, observedAt, owned)
  });
}

const pipeline = createPipeline();

let result = process(pipeline, 1, "2026-07-01T00:00:00Z", true);
assert.strictEqual(result.valid, true);
assert.strictEqual(result.update.appendedStatus.activityState, "active");
assert.strictEqual(result.update.appendedStatus.derivedFrom, "confirmed_ownership");

[
  "2026-07-02T00:00:00Z",
  "2026-07-05T00:00:00Z",
  "2026-07-08T00:00:00Z",
  "2026-07-11T00:00:00Z",
  "2026-07-16T00:00:00Z"
].forEach((observedAt, index) => {
  result = process(pipeline, index + 2, observedAt, false);
});

assert.strictEqual(result.valid, true);
assert.strictEqual(result.update.appendedStatus.activityState, "inactive");
assert.strictEqual(result.update.appendedStatus.derivedFrom, "verified_zero_territory_period");
assert.strictEqual(result.update.countedConfirmationIds.length, 5);
assert.strictEqual(result.update.appendedStatus.zeroTerritorySince, "2026-07-02T00:00:00Z");

result = process(pipeline, 7, "2026-07-17T00:00:00Z", true);
assert.strictEqual(result.valid, true);
assert.strictEqual(result.update.appendedStatus.activityState, "active");
assert.strictEqual(result.update.appendedStatus.derivedFrom, "confirmed_ownership");
assert.strictEqual(result.update.appendedStatus.mostRecentConfirmedPresenceAt, "2026-07-17T00:00:00Z");

const current = pipeline.statusService.getCurrentStatus("season-1", "server-366", "union-1");
assert.strictEqual(current.statusId, "status-7");
assert.strictEqual(pipeline.statusService.listStatuses().length, 7);

const facts = pipeline.factHistory.getFacts("season-1", "server-366", "union-1");
assert.strictEqual(facts.confirmedPresenceFacts.length, 2);
assert.strictEqual(facts.qualifyingFullMapConfirmations.length, 7);

const relation = pipeline.relationService.getRelation("season-1", "server-366", "union-1");
assert.strictEqual(relation.currentActiveStatusId, "status-7");
assert.strictEqual(relation.firstConfirmedPresenceAt, "2026-07-01T00:00:00Z");
assert.strictEqual(relation.mostRecentConfirmedPresenceAt, "2026-07-17T00:00:00Z");

const projection = pipeline.projectionService.getProjection({
  seasonId: "season-1",
  serverId: "server-366",
  unionId: "union-1",
  evaluatedAt: "2026-07-18T00:00:00Z"
});
assert.strictEqual(projection.valid, true);
assert.strictEqual(projection.projection.requiresReplacement, false);
assert.strictEqual(projection.projection.canonicalStatus.activityState, "active");
assert.strictEqual(projection.projection.verificationHealth, "current");

console.log("ok - territory held to inactivity to recapture pipeline");
console.log("\n1 integration test passed");
