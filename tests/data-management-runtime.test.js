const assert = require("assert");
const {
  createDataManagementRuntime,
  DataManagementRuntimeError
} = require("../src/app/data-management-runtime.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function factory() {
  const calls = [];
  const created = {};
  function creator(name, result) {
    return (options) => {
      calls.push([name, options]);
      return result;
    };
  }
  created.authorization = { requireAuthorized() {} };
  created.registryManagement = { createUnionIdentity() {} };
  created.serverManagement = { addKnownUnion() {} };
  created.evidenceManagement = { resolveEvidenceScope() { return {}; } };
  created.reviewQueue = { listPendingReviews() { return []; } };
  created.proposalReview = { confirmProposal() {} };
  created.query = { getServerWorkspace() {} };
  const modules = {
    createAuthorizationPolicyService: creator("authorization", created.authorization),
    createUnionRegistryManagementService: creator("registryManagement", created.registryManagement),
    createServerIntelligenceManagementService: creator("serverManagement", created.serverManagement),
    createEvidenceManagementService: creator("evidenceManagement", created.evidenceManagement),
    createProposalReviewManagementService: creator("proposalReview", created.proposalReview),
    createReviewQueueService: creator("reviewQueue", created.reviewQueue),
    createDataManagementQueryService: creator("query", created.query)
  };
  const registry = {
    getUnionIdentity() {},
    createUnionIdentity() {},
    updateUnionIdentity() {},
    archiveUnionIdentity() {},
    restoreUnionIdentity() {}
  };
  const strategic = {
    relationService: {},
    nativeAssignmentService: {},
    combatStrengthObservationService: {},
    serverObservationService: {},
    ownershipRecordService: {},
    serverIntelligenceViewService: {}
  };
  const evidence = {
    evidenceAssetService: {},
    evidenceRecordService: {}
  };
  return {
    calls,
    created,
    options: {
      modules,
      unionRegistryService: registry,
      strategicDomainRuntime: strategic,
      evidenceDomainRuntime: evidence,
      clock() { return "2026-07-31T10:00:00Z"; },
      createId(kind) { return `${kind}-1`; }
    }
  };
}

test("composes the seven screen-facing management services", () => {
  const setup = factory();
  const runtime = createDataManagementRuntime(setup.options);
  assert.deepStrictEqual(Object.keys(runtime), [
    "authorizationPolicyService",
    "unionRegistryManagementService",
    "serverIntelligenceManagementService",
    "evidenceManagementService",
    "reviewQueueService",
    "proposalReviewManagementService",
    "dataManagementQueryService"
  ]);
  assert.strictEqual(Object.isFrozen(runtime), true);
  assert.strictEqual(runtime.authorizationPolicyService, setup.created.authorization);
  assert.strictEqual(runtime.proposalReviewManagementService, setup.created.proposalReview);
  assert.deepStrictEqual(setup.calls.map((call) => call[0]), [
    "authorization",
    "registryManagement",
    "serverManagement",
    "evidenceManagement",
    "reviewQueue",
    "proposalReview",
    "query"
  ]);
});

test("threads one authorization policy through all mutation boundaries", () => {
  const setup = factory();
  createDataManagementRuntime(setup.options);
  ["registryManagement", "serverManagement", "evidenceManagement", "proposalReview"].forEach((name) => {
    const options = setup.calls.find((call) => call[0] === name)[1];
    assert.strictEqual(options.authorizationPolicyService, setup.created.authorization);
  });
});

test("threads strategic and evidence services into management and review composition", () => {
  const setup = factory();
  createDataManagementRuntime(setup.options);
  const server = setup.calls.find((call) => call[0] === "serverManagement")[1];
  assert.strictEqual(server.relationService, setup.options.strategicDomainRuntime.relationService);
  assert.strictEqual(server.ownershipRecordService, setup.options.strategicDomainRuntime.ownershipRecordService);
  const evidence = setup.calls.find((call) => call[0] === "evidenceManagement")[1];
  assert.strictEqual(evidence.evidenceAssetService, setup.options.evidenceDomainRuntime.evidenceAssetService);
  const queue = setup.calls.find((call) => call[0] === "reviewQueue")[1];
  assert.strictEqual(queue.evidenceRecordService, setup.options.evidenceDomainRuntime.evidenceRecordService);
  assert.strictEqual(queue.resolveEvidenceScope, setup.created.evidenceManagement.resolveEvidenceScope);
  const review = setup.calls.find((call) => call[0] === "proposalReview")[1];
  assert.strictEqual(review.resolveEvidenceScope, setup.created.evidenceManagement.resolveEvidenceScope);
  const query = setup.calls.find((call) => call[0] === "query")[1];
  assert.strictEqual(query.reviewQueueService, setup.created.reviewQueue);
  assert.strictEqual(query.serverIntelligenceViewService, setup.options.strategicDomainRuntime.serverIntelligenceViewService);
});

test("factory rejects missing, unknown, and malformed dependencies", () => {
  const setup = factory();
  assert.throws(
    () => createDataManagementRuntime({}),
    (error) => error instanceof DataManagementRuntimeError && error.code === "invalid_factory"
  );
  assert.throws(
    () => createDataManagementRuntime({ ...setup.options, extra: true }),
    (error) => error instanceof DataManagementRuntimeError && error.code === "invalid_factory"
  );
  const missingModule = factory();
  delete missingModule.options.modules.createReviewQueueService;
  assert.throws(
    () => createDataManagementRuntime(missingModule.options),
    (error) => error instanceof DataManagementRuntimeError && error.code === "invalid_factory"
  );
  const missingStrategic = factory();
  delete missingStrategic.options.strategicDomainRuntime.ownershipRecordService;
  assert.throws(
    () => createDataManagementRuntime(missingStrategic.options),
    (error) => error instanceof DataManagementRuntimeError && error.code === "invalid_factory"
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
