(function initializeDataManagementModuleRegistryFactory(globalScope) {
  const DATA_MANAGEMENT_MODULE_FIELDS = Object.freeze([
    "createAuthorizationPolicyService",
    "createAtomicOperationExecutor",
    "createUnionRegistryManagementService",
    "createServerIntelligenceManagementService",
    "createUnionRegistrationCoordinator",
    "createEvidenceManagementService",
    "createProposalReviewManagementService",
    "createReviewQueueService",
    "createDataManagementQueryService"
  ]);

  function createDataManagementModuleRegistry(scope) {
    if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
      throw new TypeError("Data Management Module Registry requires scope to be an object.");
    }
    const registry = {};
    DATA_MANAGEMENT_MODULE_FIELDS.forEach((field) => {
      if (typeof scope[field] !== "function") {
        throw new TypeError(`Data Management Module Registry requires scope.${field}.`);
      }
      Object.defineProperty(registry, field, {
        value: scope[field],
        enumerable: true,
        configurable: false,
        writable: false
      });
    });
    return Object.freeze(registry);
  }

  globalScope.DATA_MANAGEMENT_MODULE_FIELDS = DATA_MANAGEMENT_MODULE_FIELDS;
  globalScope.createDataManagementModuleRegistry = createDataManagementModuleRegistry;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DATA_MANAGEMENT_MODULE_FIELDS,
      createDataManagementModuleRegistry
    };
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
