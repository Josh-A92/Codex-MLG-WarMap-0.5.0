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
  created.unionRegistration = { registerUnion() {} };
  created.evidenceManagement = { resolveEvidenceScope() { return {}; } };
  created.reviewQueue = { listPendingReviews() { return []; } };
  created.proposalReview = { confirmProposal() {} };
  created.query = { getServerWorkspace() {} };
  const modules = {
    createAuthorizationPolicyService: creator("authorization", created.authorization),
    createUnionRegistryManagementService: creator("registryManagement", created.registryManagement),
    createServerIntelligenceManagementService: creator("serverManagement", created.serverManagement),
    createUnionRegistrationCoordinator: creator("unionRegistration", created.unionRegistration),
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
      createId(kind) { return `${kind}-1`; },
      executeAtomically(operation) { return operation(); }
    }
  };
}

test("composes the union registration coordinator with the screen-facing services", () => {
  const setup = factory();
  const runtime = createDataManagementRuntime(setup.options);
  assert.deepStrictEqual(Object.keys(runtime), [
    "authorizationPolicyService",
    "unionRegistryManagementService",
    "serverIntelligenceManagementService",
    "unionRegistrationCoordinator",
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
    "unionRegistration",
    "evidenceManagement",
    "reviewQueue",
    "proposalReview",
    "query"
  ]);
});

test("threads one authorization policy through all mutation boundaries", () => {
  const setup = factory();
  createDataManagementRuntime(setup.options);
  [
    "registryManagement",
    "serverManagement",
    "unionRegistration",
    "evidenceManagement",
    "proposalReview"
  ].forEach((name) => {
    const options = setup.calls.find((call) => call[0] === name)[1];
    assert.strictEqual(options.authorizationPolicyService, setup.created.authorization);
  });
});

test("threads registration services, ID generation, and transaction execution into the coordinator", () => {
  const setup = factory();
  const runtime = createDataManagementRuntime(setup.options);
  const registration = setup.calls.find((call) => call[0] === "unionRegistration")[1];

  assert.strictEqual(
    registration.authorizationPolicyService,
    setup.created.authorization
  );
  assert.strictEqual(
    registration.unionRegistryManagementService,
    setup.created.registryManagement
  );
  assert.strictEqual(
    registration.serverIntelligenceManagementService,
    setup.created.serverManagement
  );
  assert.strictEqual(registration.createId, setup.options.createId);
  assert.strictEqual(registration.executeAtomically, setup.options.executeAtomically);
  assert.strictEqual(runtime.unionRegistrationCoordinator, setup.created.unionRegistration);
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
  const missingTransaction = factory();
  delete missingTransaction.options.executeAtomically;
  assert.throws(
    () => createDataManagementRuntime(missingTransaction.options),
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
