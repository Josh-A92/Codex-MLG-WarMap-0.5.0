(function initializeDataManagementRuntimeFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "modules",
    "unionRegistryService",
    "strategicDomainRuntime",
    "evidenceDomainRuntime",
    "targetCatalog",
    "serverStateService",
    "seasonAdministrationService",
    "gameRulesEngine",
    "clock",
    "createId"
  ]);
  const MODULE_FIELDS = new Set([
    "createAuthorizationPolicyService",
    "createAtomicOperationExecutor",
    "createUnionRegistryManagementService",
    "createServerIntelligenceManagementService",
    "createUnionRegistrationCoordinator",
    "createMapOwnershipCoordinator",
    "createSelectedMapTargetViewService",
    "createEvidenceManagementService",
    "createProposalReviewManagementService",
    "createReviewQueueService",
    "createDataManagementQueryService"
  ]);

  class DataManagementRuntimeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "DataManagementRuntimeError";
      this.code = code;
    }
  }

  function fail(message) {
    throw new DataManagementRuntimeError("invalid_factory", message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exact(value, fields, path) {
    if (!isRecord(value)) fail(`Data Management Runtime requires ${path}.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail(`Data Management Runtime does not recognize ${path}.${unknown[0]}.`);
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(`Data Management Runtime requires ${path}.${field}.`);
      }
    });
    return value;
  }

  function requireInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(`Data Management Runtime requires ${path}.`);
    }
    methods.forEach((method) => {
      if (typeof value[method] !== "function") {
        fail(`Data Management Runtime requires ${path}.${method}.`);
      }
    });
    return value;
  }

  function createDataManagementRuntime(options) {
    const input = exact(options, FACTORY_FIELDS, "options");
    const modules = exact(input.modules, MODULE_FIELDS, "options.modules");
    MODULE_FIELDS.forEach((field) => {
      if (typeof modules[field] !== "function") {
        fail(`Data Management Runtime requires options.modules.${field}.`);
      }
    });
    if (typeof input.clock !== "function" || typeof input.createId !== "function") {
      fail("Data Management Runtime requires clock and createId functions.");
    }

    const registry = requireInterface(
      input.unionRegistryService,
      "options.unionRegistryService",
      [
        "getUnionIdentity",
        "createUnionIdentity",
        "updateUnionIdentity",
        "archiveUnionIdentity",
        "restoreUnionIdentity"
      ]
    );
    const strategic = requireInterface(
      input.strategicDomainRuntime,
      "options.strategicDomainRuntime",
      []
    );
    [
      "relationService",
      "nativeAssignmentService",
      "combatStrengthObservationService",
      "serverObservationService",
      "ownershipRecordService",
      "ownershipRetractionService",
      "targetVerificationService",
      "serverIntelligenceViewService"
    ].forEach((field) => {
      if (!strategic[field] || typeof strategic[field] !== "object") {
        fail(`Data Management Runtime requires options.strategicDomainRuntime.${field}.`);
      }
    });
    const evidence = requireInterface(input.evidenceDomainRuntime, "options.evidenceDomainRuntime", []);
    ["evidenceAssetService", "evidenceRecordService"].forEach((field) => {
      if (!evidence[field] || typeof evidence[field] !== "object") {
        fail(`Data Management Runtime requires options.evidenceDomainRuntime.${field}.`);
      }
    });
    const serverState = requireInterface(
      input.serverStateService,
      "options.serverStateService",
      ["getTerritoryOwner", "setTerritoryOwner", "captureTransactionState", "restoreTransactionState"]
    );
    const gameRules = requireInterface(
      input.gameRulesEngine,
      "options.gameRulesEngine",
      ["getStructureCatalog", "getStructureResourceProfile"]
    );

    const authorizationPolicyService = modules.createAuthorizationPolicyService();
    const unionRegistryManagementService = modules.createUnionRegistryManagementService({
      authorizationPolicyService,
      unionRegistryService: registry
    });
    const evidenceManagementService = modules.createEvidenceManagementService({
      authorizationPolicyService,
      evidenceAssetService: evidence.evidenceAssetService,
      evidenceRecordService: evidence.evidenceRecordService,
      clock: input.clock,
      createId: input.createId
    });
    const serverIntelligenceManagementService = modules.createServerIntelligenceManagementService({
      authorizationPolicyService,
      unionRegistryService: registry,
      relationService: strategic.relationService,
      nativeAssignmentService: strategic.nativeAssignmentService,
      combatStrengthObservationService: strategic.combatStrengthObservationService,
      serverObservationService: strategic.serverObservationService,
      ownershipRecordService: strategic.ownershipRecordService,
      clock: input.clock,
      createId: input.createId
    });
    const atomicOperationExecutor = requireInterface(
      modules.createAtomicOperationExecutor({
        participants: [
          registry,
          strategic.relationService,
          strategic.nativeAssignmentService
        ]
      }),
      "created atomicOperationExecutor",
      ["executeAtomically"]
    );
    const unionRegistrationCoordinator = modules.createUnionRegistrationCoordinator({
      authorizationPolicyService,
      unionRegistryManagementService,
      serverIntelligenceManagementService,
      relationService: strategic.relationService,
      executeAtomically: atomicOperationExecutor.executeAtomically.bind(atomicOperationExecutor),
      createId: input.createId
    });
    const mapOwnershipAtomicExecutor = requireInterface(
      modules.createAtomicOperationExecutor({
        participants: [
          strategic.relationService,
          strategic.ownershipRecordService,
          strategic.ownershipRetractionService,
          strategic.targetVerificationService,
          serverState
        ]
      }),
      "created map ownership atomicOperationExecutor",
      ["executeAtomically"]
    );
    const mapOwnershipCoordinator = modules.createMapOwnershipCoordinator({
      relationService: strategic.relationService,
      serverIntelligenceManagementService,
      targetVerificationService: strategic.targetVerificationService,
      ownershipRecordService: strategic.ownershipRecordService,
      ownershipRetractionService: strategic.ownershipRetractionService,
      evidenceRecordService: evidence.evidenceRecordService,
      resolveEvidenceScope: evidenceManagementService.resolveEvidenceScope,
      seasonAdministrationService: input.seasonAdministrationService,
      serverStateService: serverState,
      targetCatalog: input.targetCatalog,
      executeAtomically:
        mapOwnershipAtomicExecutor.executeAtomically.bind(mapOwnershipAtomicExecutor),
      createId: input.createId,
      clock: () => {
        const value = input.clock();
        return value instanceof Date ? new Date(value.getTime()) : new Date(value);
      }
    });
    const selectedMapTargetViewService =
      modules.createSelectedMapTargetViewService({
        ownershipRecordService: strategic.ownershipRecordService,
        targetVerificationService: strategic.targetVerificationService,
        unionRegistryService: registry,
        gameRulesEngine: gameRules
      });
    const reviewQueueService = modules.createReviewQueueService({
      nativeAssignmentService: strategic.nativeAssignmentService,
      combatStrengthObservationService: strategic.combatStrengthObservationService,
      serverObservationService: strategic.serverObservationService,
      ownershipRecordService: strategic.ownershipRecordService,
      evidenceRecordService: evidence.evidenceRecordService,
      resolveEvidenceScope: evidenceManagementService.resolveEvidenceScope
    });
    const proposalReviewManagementService = modules.createProposalReviewManagementService({
      authorizationPolicyService,
      nativeAssignmentService: strategic.nativeAssignmentService,
      combatStrengthObservationService: strategic.combatStrengthObservationService,
      serverObservationService: strategic.serverObservationService,
      ownershipRecordService: strategic.ownershipRecordService,
      evidenceRecordService: evidence.evidenceRecordService,
      resolveEvidenceScope: evidenceManagementService.resolveEvidenceScope,
      clock: input.clock
    });
    const dataManagementQueryService = modules.createDataManagementQueryService({
      unionRegistryService: registry,
      serverIntelligenceViewService: strategic.serverIntelligenceViewService,
      nativeAssignmentService: strategic.nativeAssignmentService,
      combatStrengthObservationService: strategic.combatStrengthObservationService,
      serverObservationService: strategic.serverObservationService,
      ownershipRecordService: strategic.ownershipRecordService,
      evidenceAssetService: evidence.evidenceAssetService,
      evidenceRecordService: evidence.evidenceRecordService,
      reviewQueueService,
      resolveEvidenceScope: evidenceManagementService.resolveEvidenceScope
    });

    return Object.freeze({
      authorizationPolicyService,
      unionRegistryManagementService,
      serverIntelligenceManagementService,
      unionRegistrationCoordinator,
      mapOwnershipCoordinator,
      selectedMapTargetViewService,
      evidenceManagementService,
      reviewQueueService,
      proposalReviewManagementService,
      dataManagementQueryService
    });
  }

  const exportsObject = { createDataManagementRuntime, DataManagementRuntimeError };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
