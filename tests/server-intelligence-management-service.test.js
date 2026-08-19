const assert = require("assert");
const {
  createServerIntelligenceManagementService,
  ServerIntelligenceManagementServiceError
} = require("../src/services/server-intelligence-management-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function setup(overrides = {}) {
  const calls = [];
  let id = 0;
  const observations = new Map();
  const dependencies = {
    authorizationPolicyService: {
      requireAuthorized(actor, capability, scope) {
        calls.push(["authorize", actor.actorId, capability, scope]);
        return { actorId: actor.actorId };
      }
    },
    unionRegistryService: {
      getUnionIdentity(unionId) {
        calls.push(["getUnion", unionId]);
        return unionId === "archived"
          ? { unionId, registryStatus: "archived" }
          : { unionId, registryStatus: "current" };
      }
    },
    relationService: {
      hasRelation(seasonId, serverId, unionId) {
        calls.push(["hasRelation", seasonId, serverId, unionId]);
        return unionId !== "unknown-relation";
      },
      addKnownUnion(value) { calls.push(["addKnownUnion", value]); return value; }
    },
    nativeAssignmentService: {
      addConfirmedManualAssignment(value) { calls.push(["native", value]); return value; }
    },
    combatStrengthObservationService: {
      addObservation(value) { calls.push(["combat", value]); return value; }
    },
    serverObservationService: {
      addObservation(value) { observations.set(value.observationId, structuredClone(value)); calls.push(["observation", value]); return value; },
      getObservation(observationId) { return observations.has(observationId) ? structuredClone(observations.get(observationId)) : null; },
      correctConfirmed(observationId, replacement) {
        const current = observations.get(observationId);
        const superseded = { ...current, reviewState: "superseded", supersededBy: replacement.observationId };
        observations.set(observationId, superseded);
        observations.set(replacement.observationId, structuredClone(replacement));
        calls.push(["observationCorrection", observationId, replacement]);
        return { superseded, replacement };
      }
    },
    ownershipRecordService: {
      addConfirmedManualTerritoryRecord(value) { calls.push(["territory", value]); return value; },
      addConfirmedManualStructureRecord(value) { calls.push(["structure", value]); return value; }
    },
    clock() { return "2026-07-31T10:00:00.000Z"; },
    createId(kind) { id += 1; return `${kind}-${id}`; }
  };
  Object.assign(dependencies, overrides);
  return {
    calls,
    service: createServerIntelligenceManagementService(dependencies)
  };
}

const actor = { actorId: "operator-1" };

test("adds a current global union to one server after scoped authorization", () => {
  const { calls, service } = setup();
  const result = service.addKnownUnion(actor, {
    seasonId: "season-1",
    serverId: "366",
    unionId: "mlg"
  });
  assert.deepStrictEqual(result, { seasonId: "season-1", serverId: "366", unionId: "mlg" });
  const auth = calls.find((call) => call[0] === "authorize");
  assert.deepStrictEqual(auth.slice(2), [
    "server_state.edit",
    { seasonId: "season-1", serverId: "366" }
  ]);
});

test("rejects archived or unknown server union identities before mutation", () => {
  const { calls, service } = setup();
  assert.throws(
    () => service.addKnownUnion(actor, { seasonId: "season-1", serverId: "366", unionId: "archived" }),
    (error) => error instanceof ServerIntelligenceManagementServiceError && error.code === "unknown_union"
  );
  assert.ok(!calls.some((call) => call[0] === "addKnownUnion"));
});

test("records a confirmed manual native assignment with server-owned audit fields", () => {
  const { calls, service } = setup();
  const result = service.recordManualNativeAssignment(actor, {
    seasonId: "season-1",
    serverId: "366",
    unionId: "mlg",
    nativeState: "native",
    observedAt: "2026-07-31T09:00:00Z"
  });
  assert.strictEqual(result.assignmentId, "native_assignment-1");
  assert.strictEqual(result.reviewer, "operator-1");
  assert.strictEqual(result.reviewedAt, "2026-07-31T10:00:00.000Z");
  assert.strictEqual(result.effectiveFrom, "2026-07-31T09:00:00Z");
  assert.strictEqual(calls.filter((call) => call[0] === "native").length, 1);
});

test("records confirmed manual combat strength and ignores no audit fields from UI", () => {
  const { service } = setup();
  const result = service.recordManualCombatStrength(actor, {
    seasonId: "season-1",
    serverId: "366",
    unionId: "mlg",
    value: 1840000000,
    unit: "power",
    displayFormat: "compact"
  });
  assert.strictEqual(result.observationId, "combat_strength_observation-1");
  assert.strictEqual(result.sourceType, "manual_entry");
  assert.strictEqual(result.reviewState, "confirmed");
  assert.strictEqual(result.actorId, "operator-1");
  assert.strictEqual(result.reviewerId, "operator-1");
  assert.strictEqual(result.observedAt, "2026-07-31T10:00:00.000Z");
});

test("records a confirmed manual server observation", () => {
  const { service } = setup();
  const result = service.recordManualServerObservation(actor, {
    seasonId: "season-1",
    serverId: "366",
    text: "Eastern sector was not visible.",
    evidenceIds: ["evidence-1"]
  });
  assert.strictEqual(result.observationId, "server_observation-1");
  assert.deepStrictEqual(result.evidenceIds, ["evidence-1"]);
  assert.strictEqual(result.actorId, "operator-1");
});

test("corrects a confirmed factual server note with a required reason", () => {
  const { calls, service } = setup();
  const original = service.recordManualServerObservation(actor, {
    seasonId: "season-1", serverId: "366", text: "Eastern sector was obscured."
  });
  const result = service.correctManualServerObservation(actor, {
    seasonId: "season-1",
    serverId: "366",
    observationId: original.observationId,
    text: "Eastern sector is now visible.",
    reason: "Corrected after reviewing a clearer screenshot."
  });
  assert.strictEqual(result.superseded.supersededBy, result.replacement.observationId);
  assert.strictEqual(result.replacement.text, "Eastern sector is now visible.");
  assert.strictEqual(result.replacement.observedAt, original.observedAt);
  assert.strictEqual(calls.filter((call) => call[0] === "observationCorrection").length, 1);
  assert.throws(
    () => service.correctManualServerObservation(actor, {
      seasonId: "season-1", serverId: "366", observationId: result.replacement.observationId,
      text: "Changed", reason: " "
    }),
    (error) => error.code === "invalid_input"
  );
  assert.throws(
    () => service.recordManualServerObservation(actor, {
      seasonId: "season-1", serverId: "366", text: "x".repeat(2001)
    }),
    (error) => error.code === "invalid_input" && /at most 2000/.test(error.message)
  );
  assert.throws(
    () => service.correctManualServerObservation(actor, {
      seasonId: "season-1", serverId: "366", observationId: result.replacement.observationId,
      text: "Changed", reason: "x".repeat(1001)
    }),
    (error) => error.code === "invalid_input" && /at most 1000/.test(error.message)
  );
});

test("records territory and logical structure ownership independently", () => {
  const { service } = setup();
  const territory = service.recordManualTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "366",
    territoryRef: { type: "normal_map_cell", row: 1, col: 2 },
    ownerUnionId: "mlg",
    ownershipState: "owned"
  });
  const structure = service.recordManualStructureOwnership(actor, {
    seasonId: "season-1",
    serverId: "366",
    structureId: "royal-city-1",
    ownerUnionId: null,
    ownershipState: "unclaimed"
  });
  assert.strictEqual(territory.ownershipRecordId, "territory_ownership-1");
  assert.deepStrictEqual(territory.territoryRef, { type: "normal_map_cell", row: 1, col: 2 });
  assert.strictEqual(structure.structureOwnershipId, "structure_ownership-2");
  assert.strictEqual(structure.structureId, "royal-city-1");
});

test("owned facts require a known union relation but unclaimed facts do not", () => {
  const { service } = setup();
  assert.throws(
    () => service.recordManualTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "366",
      territoryRef: { type: "normal_map_cell", row: 1, col: 2 },
      ownerUnionId: "unknown-relation",
      ownershipState: "owned"
    }),
    (error) => error instanceof ServerIntelligenceManagementServiceError
      && error.code === "unknown_relation"
  );
  assert.doesNotThrow(() => service.recordManualTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "366",
    territoryRef: { type: "normal_map_cell", row: 1, col: 2 },
    ownerUnionId: null,
    ownershipState: "unclaimed"
  }));
});

test("authorization denial occurs before clocks, IDs, or domain writes", () => {
  let sideEffects = 0;
  const { service } = setup({
    authorizationPolicyService: {
      requireAuthorized() {
        const error = new Error("denied");
        error.code = "authorization_denied";
        throw error;
      }
    },
    clock() { sideEffects += 1; return "2026-07-31T10:00:00Z"; },
    createId() { sideEffects += 1; return "id"; }
  });
  assert.throws(
    () => service.recordManualServerObservation(actor, {
      seasonId: "season-1",
      serverId: "366",
      text: "Observed."
    }),
    (error) => error.code === "authorization_denied"
  );
  assert.strictEqual(sideEffects, 0);
});

test("operation inputs are strict and factory dependencies are validated", () => {
  const { service } = setup();
  assert.throws(
    () => service.addKnownUnion(actor, {
      seasonId: "season-1", serverId: "366", unionId: "mlg", extra: true
    }),
    (error) => error instanceof ServerIntelligenceManagementServiceError && error.code === "invalid_input"
  );
  assert.throws(
    () => createServerIntelligenceManagementService({}),
    (error) => error instanceof ServerIntelligenceManagementServiceError
      && error.code === "invalid_factory"
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
