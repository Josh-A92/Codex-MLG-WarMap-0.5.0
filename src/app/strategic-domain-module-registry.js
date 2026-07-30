(function initializeStrategicDomainModuleRegistryFactory(globalScope) {
  const STRATEGIC_DOMAIN_MODULE_FIELDS = Object.freeze([
    "createUnionRegistryService",
    "createUnionMatchingService",
    "createUnionServerSeasonRelationService",
    "validateNativeUnionAssignment",
    "validateNativeUnionAssignmentHistory",
    "createNativeUnionAssignmentService",
    "validateActiveUnionStatus",
    "validateActiveUnionStatusHistory",
    "createActiveUnionStatusEvaluator",
    "createActiveUnionStatusService",
    "validateTerritoryOwnershipRecord",
    "validateTerritoryOwnershipHistory",
    "validateStructureOwnershipRecord",
    "validateStructureOwnershipHistory",
    "createOwnershipRecordService",
    "validateTargetVerificationRecord",
    "validateTargetVerificationHistory",
    "createTargetVerificationService",
    "createConfirmedServerSnapshotValidator",
    "createConfirmedServerSnapshotService",
    "createConfirmedServerSnapshotCoordinator",
    "createSnapshotActivityFactResolver",
    "createActivityFactHistoryService",
    "createActiveUnionStatusUpdateCoordinator",
    "createActiveUnionStatusProjectionService",
    "createUnionServerSeasonViewService",
    "createUnionServerSeasonIntelligenceViewService"
  ]);

  function createStrategicDomainModuleRegistry(scope) {
    if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
      throw new TypeError("Strategic Domain Module Registry requires scope to be an object.");
    }

    const registry = {};
    STRATEGIC_DOMAIN_MODULE_FIELDS.forEach((field) => {
      if (typeof scope[field] !== "function") {
        throw new TypeError(`Strategic Domain Module Registry requires scope.${field}.`);
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

  globalScope.STRATEGIC_DOMAIN_MODULE_FIELDS = STRATEGIC_DOMAIN_MODULE_FIELDS;
  globalScope.createStrategicDomainModuleRegistry = createStrategicDomainModuleRegistry;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      STRATEGIC_DOMAIN_MODULE_FIELDS,
      createStrategicDomainModuleRegistry
    };
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
