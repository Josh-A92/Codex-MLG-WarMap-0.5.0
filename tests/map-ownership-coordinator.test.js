const assert = require("assert");
const {
  createMapOwnershipCoordinator,
  MapOwnershipCoordinatorError
} = require("../src/services/map-ownership-coordinator.js");
const {
  createAtomicOperationExecutor
} = require("../src/services/atomic-operation-executor.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function participant(initialValue) {
  return {
    value: structuredClone(initialValue),
    captureTransactionState() { return structuredClone(this.value); },
    restoreTransactionState(snapshot) { this.value = structuredClone(snapshot); }
  };
}

function setup(overrides = {}) {
  const calls = [];
  const relationState = participant([]);
  relationState.hasRelation = function hasRelation(seasonId, serverId, unionId) {
    return this.value.some((entry) => (
      entry.seasonId === seasonId
      && entry.serverId === serverId
      && entry.unionId === unionId
    ));
  };
  const historyState = participant({ territory: [], structures: [] });
  const verificationState = participant([]);
  verificationState.addConfirmedVerification = function addConfirmedVerification(record) {
    this.value.push(structuredClone(record));
    calls.push(["verification", record]);
    return structuredClone(record);
  };
  const projectionState = participant({
    "server-366": { "1-1": "union-old", "2-2": null }
  });
  projectionState.getTerritoryOwner = function getTerritoryOwner(serverId, key, fallback) {
    const server = this.value[serverId] || {};
    return Object.prototype.hasOwnProperty.call(server, key) ? server[key] : fallback;
  };
  projectionState.setTerritoryOwner = function setTerritoryOwner(serverId, key, ownerUnionId) {
    if (!this.value[serverId]) this.value[serverId] = {};
    this.value[serverId][key] = ownerUnionId;
    calls.push(["project", serverId, key, ownerUnionId]);
    if (overrides.failProjectionAt === key) throw new Error("projection failed");
    return ownerUnionId;
  };

  const management = {
    addKnownUnion(actor, input) {
      calls.push(["known", actor, input]);
      relationState.value.push(structuredClone(input));
      return structuredClone(input);
    },
    recordManualTerritoryOwnership(actor, input) {
      calls.push(["territory", actor, input]);
      if (overrides.failHistory) throw new Error("history failed");
      const record = {
        ownershipRecordId: `territory-${historyState.value.territory.length + 1}`,
        ...structuredClone(input),
        effectiveAt: input.effectiveAt || "2026-07-31T10:00:00.000Z",
        actorId: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: "2026-07-31T10:00:00.000Z"
      };
      historyState.value.territory.push(record);
      return structuredClone(record);
    },
    recordManualStructureOwnership(actor, input) {
      calls.push(["structure", actor, input]);
      if (overrides.failHistory) throw new Error("history failed");
      const record = {
        structureOwnershipId: `structure-${historyState.value.structures.length + 1}`,
        ...structuredClone(input),
        effectiveAt: input.effectiveAt || "2026-07-31T10:00:00.000Z",
        actorId: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: "2026-07-31T10:00:00.000Z"
      };
      historyState.value.structures.push(record);
      return structuredClone(record);
    }
  };
  const atomic = createAtomicOperationExecutor({
    participants: [relationState, historyState, verificationState, projectionState]
  });
  const coordinator = createMapOwnershipCoordinator({
    relationService: relationState,
    serverIntelligenceManagementService: management,
    targetVerificationService: verificationState,
    serverStateService: projectionState,
    executeAtomically: atomic.executeAtomically,
    createId() { return `verification-${verificationState.value.length + 1}`; }
  });
  return {
    calls,
    relationState,
    historyState,
    verificationState,
    projectionState,
    coordinator
  };
}

const actor = { actorId: "desktop-user" };

test("records one canonical territory fact and updates its projection", async () => {
  const context = setup();
  const result = await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 3,
    col: 4,
    ownerUnionId: "union-1"
  });
  assert.strictEqual(result.targetType, "normal_map_cell");
  assert.deepStrictEqual(result.projectedTerritoryKeys, ["3-4"]);
  assert.deepStrictEqual(
    context.historyState.value.territory[0].territoryRef,
    { type: "normal_map_cell", row: 3, col: 4 }
  );
  assert.strictEqual(context.projectionState.value["server-366"]["3-4"], "union-1");
  assert.strictEqual(result.verification.verifiedOwnershipRef.recordId, "territory-1");
  assert.strictEqual(context.verificationState.value.length, 1);
});

test("discovers an owned union on the server before recording ownership", async () => {
  const context = setup();
  await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 3,
    col: 4,
    ownerUnionId: "union-1"
  });
  assert.deepStrictEqual(context.calls.slice(0, 2).map((entry) => entry[0]), [
    "known",
    "territory"
  ]);

  await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 4,
    col: 4,
    ownerUnionId: "union-1"
  });
  assert.strictEqual(context.calls.filter((entry) => entry[0] === "known").length, 1);
});

test("unclaimed territory does not create a known-union relation", async () => {
  const context = setup();
  await context.coordinator.setTerritoryOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    row: 3,
    col: 4,
    ownerUnionId: null
  });
  assert.strictEqual(context.calls.some((entry) => entry[0] === "known"), false);
  assert.strictEqual(context.historyState.value.territory[0].ownershipState, "unclaimed");
});

test("records one logical-structure fact while projecting every footprint cell", async () => {
  const context = setup();
  const result = await context.coordinator.setStructureOwnership(actor, {
    seasonId: "season-1",
    serverId: "server-366",
    structureId: "royal-city-1",
    footprint: [
      { row: 10, col: 10 },
      { row: 10, col: 11 },
      { row: 11, col: 10 },
      { row: 11, col: 11 }
    ],
    ownerUnionId: "union-1"
  });
  assert.strictEqual(context.historyState.value.structures.length, 1);
  assert.strictEqual(context.historyState.value.territory.length, 0);
  assert.strictEqual(result.record.structureId, "royal-city-1");
  assert.strictEqual(
    result.verification.verifiedOwnershipRef.type,
    "structure_ownership_record"
  );
  assert.deepStrictEqual(result.projectedTerritoryKeys, [
    "10-10", "10-11", "11-10", "11-11"
  ]);
});

test("rolls back discovered relation and history when projection fails", async () => {
  const context = setup({ failProjectionAt: "3-4" });
  const beforeProjection = structuredClone(context.projectionState.value);
  await assert.rejects(
    context.coordinator.setTerritoryOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      row: 3,
      col: 4,
      ownerUnionId: "union-1"
    }),
    /projection failed/
  );
  assert.deepStrictEqual(context.relationState.value, []);
  assert.deepStrictEqual(context.historyState.value, { territory: [], structures: [] });
  assert.deepStrictEqual(context.verificationState.value, []);
  assert.deepStrictEqual(context.projectionState.value, beforeProjection);
});

test("rolls back partial structure projection when a later footprint cell fails", async () => {
  const context = setup({ failProjectionAt: "5-6" });
  const beforeProjection = structuredClone(context.projectionState.value);
  await assert.rejects(
    context.coordinator.setStructureOwnership(actor, {
      seasonId: "season-1",
      serverId: "server-366",
      structureId: "town-1",
      footprint: [{ row: 5, col: 5 }, { row: 5, col: 6 }],
      ownerUnionId: "union-1"
    }),
    /projection failed/
  );
  assert.deepStrictEqual(context.historyState.value, { territory: [], structures: [] });
  assert.deepStrictEqual(context.verificationState.value, []);
  assert.deepStrictEqual(context.projectionState.value, beforeProjection);
});

test("rejects malformed inputs before any operation executes", async () => {
  const context = setup();
  assert.throws(
    () => context.coordinator.setStructureOwnership(actor, {
        seasonId: "season-1",
        serverId: "server-366",
        structureId: "town-1",
        footprint: [{ row: 5, col: 5 }, { row: 5, col: 5 }],
        ownerUnionId: "union-1"
      }),
    (error) => error instanceof MapOwnershipCoordinatorError
      && error.code === "invalid_input"
  );
  assert.deepStrictEqual(context.calls, []);
});

let passed = 0;
(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
