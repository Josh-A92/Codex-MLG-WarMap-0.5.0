const assert = require("assert");
const {
  createDataManagementQueryService,
  DataManagementQueryServiceError
} = require("../src/services/data-management-query-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function setup() {
  const filters = [];
  function list(name, values) {
    return (filter) => {
      filters.push([name, filter]);
      return values;
    };
  }
  const scopedAsset = {
    assetId: "asset-1",
    sourceContext: { seasonId: "season-1", serverId: "366" }
  };
  const otherAsset = {
    assetId: "asset-2",
    sourceContext: { seasonId: "season-1", serverId: "367" }
  };
  const service = createDataManagementQueryService({
    unionRegistryService: {
      listUnionIdentities: list("unions", [{ unionId: "mlg" }])
    },
    serverIntelligenceViewService: {
      getView(request) { return { ...request, unions: [] }; }
    },
    nativeAssignmentService: {
      listAssignments: list("native", [{ assignmentId: "native-1" }])
    },
    combatStrengthObservationService: {
      listObservations: list("combat", [{ observationId: "combat-1" }])
    },
    serverObservationService: {
      listObservations: list("observations", [{ observationId: "observation-1" }])
    },
    ownershipRecordService: {
      listTerritoryRecords: list("territory", [{ ownershipRecordId: "territory-1" }]),
      listStructureRecords: list("structure", [{ structureOwnershipId: "structure-1" }])
    },
    evidenceAssetService: {
      listAssets: list("assets", [scopedAsset, otherAsset])
    },
    evidenceRecordService: {
      listEvidenceRecords: list("evidence", [
        { evidenceId: "evidence-1", assetId: "asset-1" },
        { evidenceId: "evidence-2", assetId: "asset-2" }
      ])
    },
    reviewQueueService: {
      listPendingReviews: list("queue", [{ itemId: "proposal-1" }])
    },
    resolveEvidenceScope(record) {
      return record.assetId === "asset-1"
        ? { seasonId: "season-1", serverId: "366" }
        : { seasonId: "season-1", serverId: "367" };
    }
  });
  return { filters, service };
}

test("provides a complete global union registry workspace", () => {
  const { filters, service } = setup();
  assert.deepStrictEqual(service.getUnionRegistryWorkspace(), {
    identities: [{ unionId: "mlg" }]
  });
  assert.deepStrictEqual(filters[0], ["unions", { includeArchived: true }]);
});

test("provides a global evidence workspace including unscoped manual evidence", () => {
  const { service } = setup();
  const workspace = service.getEvidenceWorkspace();
  assert.deepStrictEqual(workspace.assets.map((entry) => entry.assetId), ["asset-1", "asset-2"]);
  assert.deepStrictEqual(
    workspace.evidenceRecords.map((entry) => entry.evidenceId),
    ["evidence-1", "evidence-2"]
  );
});

test("provides one screen-ready server management projection", () => {
  const { filters, service } = setup();
  const result = service.getServerWorkspace({
    seasonId: "season-1",
    serverId: "366",
    evaluatedAt: "2026-07-31T10:00:00Z"
  });
  assert.strictEqual(result.confirmedIntelligence.serverId, "366");
  assert.strictEqual(result.nativeAssignmentHistory.length, 1);
  assert.strictEqual(result.combatStrengthHistory.length, 1);
  assert.strictEqual(result.serverObservationHistory.length, 1);
  assert.strictEqual(result.territoryOwnershipHistory.length, 1);
  assert.strictEqual(result.structureOwnershipHistory.length, 1);
  assert.deepStrictEqual(result.evidenceAssets.map((entry) => entry.assetId), ["asset-1"]);
  assert.deepStrictEqual(result.evidenceRecords.map((entry) => entry.evidenceId), ["evidence-1"]);
  assert.strictEqual(result.pendingReviews.length, 1);
  ["native", "combat", "observations", "territory", "structure", "queue"].forEach((name) => {
    assert.ok(filters.some((entry) => (
      entry[0] === name
      && entry[1].seasonId === "season-1"
      && entry[1].serverId === "366"
    )));
  });
});

test("returned projections do not retain dependency references", () => {
  const { service } = setup();
  const first = service.getServerWorkspace({
    seasonId: "season-1",
    serverId: "366",
    evaluatedAt: "2026-07-31T10:00:00Z"
  });
  first.evidenceAssets[0].assetId = "mutated";
  const second = service.getServerWorkspace({
    seasonId: "season-1",
    serverId: "366",
    evaluatedAt: "2026-07-31T10:00:00Z"
  });
  assert.strictEqual(second.evidenceAssets[0].assetId, "asset-1");
});

test("server projection excludes unscoped manual evidence without failing", () => {
  const records = [
    { evidenceId: "manual-evidence", assetId: null },
    { evidenceId: "scoped-evidence", assetId: "asset-1" }
  ];
  const service = createDataManagementQueryService({
    unionRegistryService: { listUnionIdentities: () => [] },
    serverIntelligenceViewService: {
      getView: (request) => ({ ...request, unions: [] })
    },
    nativeAssignmentService: { listAssignments: () => [] },
    combatStrengthObservationService: { listObservations: () => [] },
    serverObservationService: { listObservations: () => [] },
    ownershipRecordService: {
      listTerritoryRecords: () => [],
      listStructureRecords: () => []
    },
    evidenceAssetService: {
      listAssets: () => [{
        assetId: "asset-1",
        sourceContext: { seasonId: "season-1", serverId: "366" }
      }]
    },
    evidenceRecordService: { listEvidenceRecords: () => records },
    reviewQueueService: { listPendingReviews: () => [] },
    resolveEvidenceScope(record) {
      assert.notStrictEqual(record.assetId, null);
      return { seasonId: "season-1", serverId: "366" };
    }
  });
  const workspace = service.getServerWorkspace({
    seasonId: "season-1",
    serverId: "366",
    evaluatedAt: "2026-07-31T10:00:00Z"
  });
  assert.deepStrictEqual(workspace.evidenceRecords.map((entry) => entry.evidenceId), ["scoped-evidence"]);
});

test("invalid requests and dependency results fail clearly", () => {
  const { service } = setup();
  assert.throws(
    () => service.getServerWorkspace({ seasonId: "season-1", serverId: "366" }),
    (error) => error instanceof DataManagementQueryServiceError && error.code === "invalid_input"
  );
  assert.throws(
    () => createDataManagementQueryService({}),
    (error) => error instanceof DataManagementQueryServiceError && error.code === "invalid_factory"
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
