const assert = require("assert");
const {
  createSelectedMapTargetViewService,
  SelectedMapTargetViewServiceError
} = require("../src/services/selected-map-target-view-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function setup(overrides = {}) {
  const territory = overrides.territory === undefined ? {
    ownershipRecordId: "territory-1",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 2, col: 3 },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    effectiveAt: "2026-07-31T08:00:00.000Z"
  } : overrides.territory;
  const structure = overrides.structure === undefined ? {
    structureOwnershipId: "structure-1",
    serverId: "server-366",
    seasonId: "season-1",
    structureId: "town-1",
    ownerUnionId: null,
    ownershipState: "unclaimed",
    effectiveAt: "2026-07-31T09:00:00.000Z"
  } : overrides.structure;
  const verification = overrides.verification === undefined ? {
    verificationId: "verification-1",
    observedAt: "2026-07-31T10:00:00.000Z"
  } : overrides.verification;
  return createSelectedMapTargetViewService({
    ownershipRecordService: {
      getCurrentTerritoryRecord() { return structuredClone(territory); },
      getCurrentStructureRecord() { return structuredClone(structure); }
    },
    targetVerificationService: {
      getCurrentVerification() {
        return verification === null ? null : structuredClone(verification);
      }
    },
    unionRegistryService: {
      getUnionIdentity(unionId) {
        return unionId === "union-1"
          ? {
              unionId,
              displayName: "Union One",
              tag: "ONE",
              defaultColor: "#112233",
              presentationMetadata: { mapPattern: "diagonal" }
            }
          : null;
      }
    },
    gameRulesEngine: {
      getStructureCatalog() {
        return [{
          structureTypeId: "structure-type-town",
          code: "T5",
          type: "Town",
          level: 5,
          capturable: true
        }];
      },
      getStructureResourceProfile(code) {
        return code === "T5" ? [{ resourceId: "season-resource", value: 25 }] : null;
      }
    }
  });
}

test("territory view separates last confirmation from last ownership change", () => {
  const service = setup();
  const view = service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    row: 2,
    col: 3
  });
  assert.deepStrictEqual(view.target, { type: "normal_map_cell", row: 2, col: 3 });
  assert.strictEqual(view.currentOwnershipRecord.ownershipRecordId, "territory-1");
  assert.strictEqual(view.currentUnionIdentity.tag, "ONE");
  assert.strictEqual(view.lastConfirmedAt, "2026-07-31T10:00:00.000Z");
  assert.strictEqual(view.lastOwnershipChangeAt, "2026-07-31T08:00:00.000Z");
  assert.strictEqual(view.confirmationState, "confirmed");
  assert.strictEqual(view.structureMetadata, null);
  assert.strictEqual(view.seasonDefinedValues, null);
});

test("structure view includes package metadata and season-defined value", () => {
  const service = setup();
  const view = service.getStructureView({
    seasonId: "season-1",
    serverId: "server-366",
    structureId: "town-1",
    structureCode: "T5"
  });
  assert.deepStrictEqual(view.target, {
    type: "logical_structure",
    structureId: "town-1"
  });
  assert.strictEqual(view.structureMetadata.type, "Town");
  assert.strictEqual(view.structureMetadata.level, 5);
  assert.deepStrictEqual(view.seasonDefinedValues, [
    {
      resourceId: "season-resource",
      value: 25
    }
  ]);
  assert.strictEqual(view.currentUnionIdentity, null);
});

test("missing verification is explicit and does not invent freshness", () => {
  const service = setup({ verification: null });
  const view = service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    row: 2,
    col: 3
  });
  assert.strictEqual(view.lastConfirmedAt, null);
  assert.strictEqual(view.confirmationState, "unverified");
});

test("missing ownership and verification return an unknown factual state", () => {
  const service = setup({ territory: null, verification: null });
  const view = service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    row: 2,
    col: 3
  });
  assert.strictEqual(view.currentOwnershipRecord, null);
  assert.strictEqual(view.currentUnionIdentity, null);
  assert.strictEqual(view.lastOwnershipChangeAt, null);
  assert.strictEqual(view.confirmationState, "unknown");
});

test("territory view supports strategic-node targets", () => {
  const territory = {
    ownershipRecordId: "territory-node-1",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "strategic_node", nodeId: "node-a" },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    effectiveAt: "2026-07-31T08:00:00.000Z"
  };
  const service = setup({ territory });
  const view = service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    territoryRef: { type: "strategic_node", nodeId: "node-a" }
  });
  assert.deepStrictEqual(view.target, { type: "strategic_node", nodeId: "node-a" });
  assert.strictEqual(view.currentOwnershipRecord.ownershipRecordId, "territory-node-1");
});

test("territory view rejects ambiguous and over-specified target references", () => {
  const service = setup();
  assert.throws(() => service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    row: 1,
    col: 1,
    territoryRef: { type: "strategic_node", nodeId: "node-a" }
  }), /does not allow request\.row or request\.col/);
  assert.throws(() => service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    territoryRef: { type: "strategic_node", nodeId: "node-a", row: 1 }
  }), /does not recognize request\.territoryRef\.row/);
});

test("returned nested data cannot mutate dependency state", () => {
  const metadata = { mapPattern: "diagonal" };
  const service = setup();
  const view = service.getTerritoryView({
    seasonId: "season-1",
    serverId: "server-366",
    row: 2,
    col: 3
  });
  view.currentUnionIdentity.presentationMetadata.mapPattern = "mutated";
  assert.strictEqual(metadata.mapPattern, "diagonal");
  assert.strictEqual(
    service.getTerritoryView({
      seasonId: "season-1",
      serverId: "server-366",
      row: 2,
      col: 3
    }).currentUnionIdentity.presentationMetadata.mapPattern,
    "diagonal"
  );
});

test("factory and request boundaries are strict", () => {
  assert.throws(
    () => createSelectedMapTargetViewService({}),
    (error) => error instanceof SelectedMapTargetViewServiceError
      && error.code === "invalid_input"
  );
  const service = setup();
  assert.throws(
    () => service.getTerritoryView({
      seasonId: "season-1",
      serverId: "server-366",
      row: 0,
      col: 3
    }),
    (error) => error instanceof SelectedMapTargetViewServiceError
      && error.code === "invalid_input"
  );
  assert.throws(
    () => service.getStructureView({
      seasonId: "season-1",
      serverId: "server-366",
      structureId: "town-1",
      structureCode: "T5",
      extra: true
    }),
    /does not recognize request.extra/
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
