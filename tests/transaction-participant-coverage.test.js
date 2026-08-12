const assert = require("assert");
const { createActiveUnionStatusService } = require("../src/services/active-union-status-service.js");
const {
  validateActiveUnionStatus,
  validateActiveUnionStatusHistory
} = require("../src/services/active-union-status-validator.js");
const { createCombatStrengthObservationService } = require("../src/services/combat-strength-observation-service.js");
const {
  validateCombatStrengthObservation,
  validateCombatStrengthObservationHistory
} = require("../src/services/combat-strength-observation-validator.js");
const { createServerObservationService } = require("../src/services/server-observation-service.js");
const {
  validateServerObservation,
  validateServerObservationHistory
} = require("../src/services/server-observation-validator.js");
const { createConfirmedServerSnapshotService } = require("../src/services/confirmed-server-snapshot-service.js");
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
const { createActivityFactHistoryService } = require("../src/services/activity-fact-history-service.js");
const { createEvidenceAssetService } = require("../src/services/evidence-asset-service.js");
const {
  validateEvidenceAsset,
  validateEvidenceAssetHistory
} = require("../src/services/evidence-asset-validator.js");
const { createEvidenceRecordService } = require("../src/services/evidence-record-service.js");
const {
  validateEvidenceRecord,
  validateEvidenceRecordHistory
} = require("../src/services/evidence-record-validator.js");

const emptyStrategicState = {
  relations: [],
  nativeAssignments: [],
  activeStatuses: [],
  combatStrengthObservations: [],
  serverObservations: [],
  territoryOwnershipRecords: [],
  structureOwnershipRecords: [],
  targetVerifications: [],
  confirmedSnapshots: [],
  confirmedPresenceFacts: [],
  qualifyingFullMapConfirmations: []
};

function createServices() {
  const snapshotValidator = createConfirmedServerSnapshotValidator({
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
    validateTargetVerificationRecord,
    validateTargetVerificationHistory
  });
  const evidenceAssetService = createEvidenceAssetService({
    initialAssets: [],
    validateEvidenceAsset,
    validateEvidenceAssetHistory
  });
  const evidenceRecordService = createEvidenceRecordService({
    initialEvidenceRecords: [],
    validateEvidenceRecord,
    validateEvidenceRecordHistory,
    evidenceAssetService,
    clock: () => new Date("2026-08-12T12:00:00.000Z")
  });
  return {
    activeStatuses: createActiveUnionStatusService({
      initialStatuses: [], validateActiveUnionStatus, validateActiveUnionStatusHistory
    }),
    combatStrength: createCombatStrengthObservationService({
      initialObservations: [], validateCombatStrengthObservation, validateCombatStrengthObservationHistory,
      clock: () => new Date("2026-08-12T12:00:00.000Z")
    }),
    serverObservations: createServerObservationService({
      initialObservations: [], validateServerObservation, validateServerObservationHistory,
      clock: () => new Date("2026-08-12T12:00:00.000Z")
    }),
    snapshots: createConfirmedServerSnapshotService({
      initialSnapshots: [],
      validateConfirmedServerSnapshot: snapshotValidator.validateConfirmedServerSnapshot,
      validateConfirmedServerSnapshotHistory: snapshotValidator.validateConfirmedServerSnapshotHistory,
      evaluateConfirmedServerSnapshotReferences: () => ({ valid: true, errors: [], projection: {} })
      ,clock: () => new Date("2026-08-12T12:00:00.000Z")
    }),
    activityFacts: createActivityFactHistoryService({
      initialConfirmedPresenceFacts: [],
      initialQualifyingFullMapConfirmations: []
    }),
    evidenceAssets: evidenceAssetService,
    evidenceRecords: evidenceRecordService
  };
}

for (const [name, service, emptySnapshot] of [
  ["ActiveUnionStatusService", createServices().activeStatuses, []],
  ["CombatStrengthObservationService", createServices().combatStrength, []],
  ["ServerObservationService", createServices().serverObservations, []],
  ["ConfirmedServerSnapshotService", createServices().snapshots, []],
  ["ActivityFactHistoryService", createServices().activityFacts, { confirmedPresenceFacts: [], qualifyingFullMapConfirmations: [] }],
  ["EvidenceAssetService", createServices().evidenceAssets, []],
  ["EvidenceRecordService", createServices().evidenceRecords, []]
]) {
  assert.strictEqual(typeof service.captureTransactionState, "function", `${name} capture`);
  assert.strictEqual(typeof service.restoreTransactionState, "function", `${name} restore`);
  const snapshot = service.captureTransactionState();
  const detached = JSON.parse(JSON.stringify(snapshot));
  if (Array.isArray(detached)) detached.push({ mutated: true });
  else detached.mutated = true;
  assert.deepStrictEqual(service.captureTransactionState(), snapshot, `${name} snapshot detached`);
  service.restoreTransactionState(snapshot);
  assert.deepStrictEqual(service.captureTransactionState(), snapshot, `${name} round trip`);
  assert.throws(() => service.restoreTransactionState(Array.isArray(emptySnapshot) ? {} : []));
}

const activity = createServices().activityFacts;
assert.deepStrictEqual(activity.getAllFacts(), {
  confirmedPresenceFacts: [],
  qualifyingFullMapConfirmations: []
});

console.log("7 transaction participants covered");
console.log("1 test passed");
