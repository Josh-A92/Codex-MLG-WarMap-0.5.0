const assert = require("assert");
const {
  createProposalReviewManagementService,
  ProposalReviewManagementServiceError
} = require("../src/services/proposal-review-management-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function proposal(id, overrides = {}) {
  return {
    assignmentId: id,
    observationId: id,
    ownershipRecordId: id,
    structureOwnershipId: id,
    evidenceId: id,
    seasonId: "season-1",
    serverId: "366",
    observedAt: "2026-07-31T09:00:00Z",
    reviewState: "proposed",
    reviewerId: null,
    reviewedAt: null,
    ...overrides
  };
}

function setup() {
  const calls = [];
  const records = {
    native_assignment: proposal("native-1"),
    combat_strength_observation: proposal("combat-1"),
    server_observation: proposal("observation-1"),
    territory_ownership: proposal("territory-1"),
    structure_ownership: proposal("structure-1"),
    evidence_record: proposal("evidence-1", {
      seasonId: undefined,
      serverId: undefined,
      linkedEntityType: "CombatStrengthObservation",
      linkedEntityId: "combat-1"
    })
  };
  function review(type, id, value) {
    calls.push([type, id, value]);
    return value;
  }
  const options = {
    authorizationPolicyService: {
      requireAuthorized(actor, capability, scope) {
        calls.push(["authorize", actor.actorId, capability, scope]);
        return { actorId: actor.actorId };
      }
    },
    nativeAssignmentService: {
      getAssignment: () => records.native_assignment,
      confirmProposal: (id, value) => review("native-confirm", id, value),
      rejectProposal: (id, value) => review("native-reject", id, value)
    },
    combatStrengthObservationService: {
      getObservation: () => records.combat_strength_observation,
      reviewProposal: (id, value) => review("combat", id, value)
    },
    serverObservationService: {
      getObservation: () => records.server_observation,
      reviewProposal: (id, value) => review("observation", id, value)
    },
    ownershipRecordService: {
      getTerritoryRecord: () => records.territory_ownership,
      confirmTerritoryProposal: (id, value) => review("territory-confirm", id, value),
      rejectTerritoryProposal: (id, value) => review("territory-reject", id, value),
      getStructureRecord: () => records.structure_ownership,
      confirmStructureProposal: (id, value) => review("structure-confirm", id, value),
      rejectStructureProposal: (id, value) => review("structure-reject", id, value)
    },
    evidenceRecordService: {
      getEvidenceRecord: () => records.evidence_record,
      reviewProposal: (id, value) => review("evidence", id, value)
    },
    resolveEvidenceScope(record) {
      calls.push(["resolveEvidenceScope", record.evidenceId]);
      return { seasonId: "season-1", serverId: "366" };
    },
    clock: () => "2026-07-31T10:00:00.000Z"
  };
  return {
    calls,
    records,
    service: createProposalReviewManagementService(options)
  };
}

const actor = { actorId: "reviewer-1" };

test("confirms and rejects native proposals with service-specific lifecycle fields", () => {
  const { service } = setup();
  const confirmed = service.confirmProposal(actor, "native_assignment", "native-1");
  assert.deepStrictEqual(confirmed, {
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-31T10:00:00.000Z",
    effectiveFrom: "2026-07-31T09:00:00Z"
  });
  const rejected = service.rejectProposal(actor, "native_assignment", "native-1");
  assert.deepStrictEqual(rejected, {
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-31T10:00:00.000Z"
  });
});

test("reviews combat, server, and evidence proposals without changing factual fields", () => {
  const { records, service } = setup();
  const combat = service.confirmProposal(actor, "combat_strength_observation", "combat-1");
  const observation = service.rejectProposal(actor, "server_observation", "observation-1");
  const evidence = service.confirmProposal(actor, "evidence_record", "evidence-1");
  assert.strictEqual(combat.reviewState, "confirmed");
  assert.strictEqual(observation.reviewState, "rejected");
  assert.strictEqual(evidence.reviewState, "confirmed");
  assert.strictEqual(combat.observedAt, records.combat_strength_observation.observedAt);
  assert.strictEqual(records.combat_strength_observation.reviewState, "proposed");
  assert.strictEqual(evidence.reviewerId, "reviewer-1");
});

test("reviews territory and structure proposals through their typed operations", () => {
  const { calls, service } = setup();
  service.confirmProposal(actor, "territory_ownership", "territory-1");
  service.rejectProposal(actor, "structure_ownership", "structure-1");
  assert.ok(calls.some((call) => call[0] === "territory-confirm"));
  assert.ok(calls.some((call) => call[0] === "structure-reject"));
});

test("every review uses proposal.review with the proposal scope", () => {
  const { calls, service } = setup();
  service.confirmProposal(actor, "combat_strength_observation", "combat-1");
  service.confirmProposal(actor, "evidence_record", "evidence-1");
  const authorizations = calls.filter((call) => call[0] === "authorize");
  assert.deepStrictEqual(authorizations, [
    ["authorize", "reviewer-1", "proposal.review", { seasonId: "season-1", serverId: "366" }],
    ["authorize", "reviewer-1", "proposal.review", { seasonId: "season-1", serverId: "366" }]
  ]);
  assert.ok(calls.some((call) => call[0] === "resolveEvidenceScope"));
});

test("denial prevents clock and review mutation", () => {
  let sideEffects = 0;
  const base = setup();
  const service = createProposalReviewManagementService({
    authorizationPolicyService: {
      requireAuthorized() {
        const error = new Error("denied");
        error.code = "authorization_denied";
        throw error;
      }
    },
    nativeAssignmentService: {
      getAssignment: () => proposal("native-1"),
      confirmProposal() { sideEffects += 1; },
      rejectProposal() { sideEffects += 1; }
    },
    combatStrengthObservationService: {
      getObservation: () => null,
      reviewProposal() {}
    },
    serverObservationService: {
      getObservation: () => null,
      reviewProposal() {}
    },
    ownershipRecordService: {
      getTerritoryRecord: () => null,
      confirmTerritoryProposal() {},
      rejectTerritoryProposal() {},
      getStructureRecord: () => null,
      confirmStructureProposal() {},
      rejectStructureProposal() {}
    },
    evidenceRecordService: {
      getEvidenceRecord: () => null,
      reviewProposal() {}
    },
    resolveEvidenceScope: base.service.resolveEvidenceScope || (() => ({})),
    clock() { sideEffects += 1; return "2026-07-31T10:00:00Z"; }
  });
  assert.throws(
    () => service.confirmProposal(actor, "native_assignment", "native-1"),
    (error) => error.code === "authorization_denied"
  );
  assert.strictEqual(sideEffects, 0);
});

test("unknown, non-proposed, and invalid item types fail clearly", () => {
  const base = setup();
  base.records.native_assignment = null;
  assert.throws(
    () => base.service.confirmProposal(actor, "native_assignment", "missing"),
    (error) => error instanceof ProposalReviewManagementServiceError
      && error.code === "unknown_proposal"
  );
  const second = setup();
  second.records.native_assignment.reviewState = "confirmed";
  assert.throws(
    () => second.service.confirmProposal(actor, "native_assignment", "native-1"),
    (error) => error instanceof ProposalReviewManagementServiceError
      && error.code === "invalid_transition"
  );
  assert.throws(
    () => second.service.confirmProposal(actor, "unknown", "id"),
    (error) => error instanceof ProposalReviewManagementServiceError
      && error.code === "invalid_input"
  );
});

test("invalid evidence scope is rejected before authorization", () => {
  const base = setup();
  const service = createProposalReviewManagementService({
    authorizationPolicyService: { requireAuthorized() { throw new Error("must not authorize"); } },
    nativeAssignmentService: {
      getAssignment() {}, confirmProposal() {}, rejectProposal() {}
    },
    combatStrengthObservationService: {
      getObservation() {}, reviewProposal() {}
    },
    serverObservationService: {
      getObservation() {}, reviewProposal() {}
    },
    ownershipRecordService: {
      getTerritoryRecord() {}, confirmTerritoryProposal() {}, rejectTerritoryProposal() {},
      getStructureRecord() {}, confirmStructureProposal() {}, rejectStructureProposal() {}
    },
    evidenceRecordService: {
      getEvidenceRecord: () => base.records.evidence_record,
      reviewProposal() {}
    },
    resolveEvidenceScope: () => ({}),
    clock: () => "2026-07-31T10:00:00Z"
  });
  assert.throws(
    () => service.confirmProposal(actor, "evidence_record", "evidence-1"),
    (error) => error instanceof ProposalReviewManagementServiceError
      && error.code === "invalid_dependency"
  );
});

let passed = 0;
tests.forEach(({ name, fn }) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
});
console.log(`${passed} tests passed`);
