(function initializeStrategicDomainRuntimeFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["modules", "unionRegistryService", "initialState"]);
  const INITIAL_STATE_FIELDS = new Set([
    "relations",
    "nativeAssignments",
    "activeStatuses",
    "combatStrengthObservations",
    "serverObservations",
    "territoryOwnershipRecords",
    "structureOwnershipRecords",
    "targetVerifications",
    "confirmedSnapshots",
    "confirmedPresenceFacts",
    "qualifyingFullMapConfirmations"
  ]);

  const MODULE_FIELDS = [
    "createUnionMatchingService",
    "createUnionServerSeasonRelationService",
    "validateNativeUnionAssignment",
    "validateNativeUnionAssignmentHistory",
    "createNativeUnionAssignmentService",
    "validateActiveUnionStatus",
    "validateActiveUnionStatusHistory",
    "createActiveUnionStatusEvaluator",
    "createActiveUnionStatusService",
    "validateCombatStrengthObservation",
    "validateCombatStrengthObservationHistory",
    "createCombatStrengthObservationService",
    "validateServerObservation",
    "validateServerObservationHistory",
    "createServerObservationService",
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
    "createUnionServerSeasonIntelligenceViewService",
    "createServerIntelligenceViewService",
    "createServerDataCompletenessService",
    "createConfirmedSnapshotChangeService",
    "createServerHistoryService"
  ];

  class StrategicDomainRuntimeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "StrategicDomainRuntimeError";
      this.code = code;
    }
  }

  function fail(message) {
    throw new StrategicDomainRuntimeError("invalid_factory", message);
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireRecord(value, path) {
    if (!isRecordObject(value)) {
      fail(`Strategic Domain Runtime requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireExactFields(value, expectedFields, path) {
    const unknownFields = Object.keys(value)
      .filter((field) => !expectedFields.has(field))
      .sort();
    if (unknownFields.length > 0) {
      fail(`Strategic Domain Runtime does not recognize ${path}.${unknownFields[0]}.`);
    }
    expectedFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(`Strategic Domain Runtime requires ${path}.${field}.`);
      }
    });
  }

  function requireInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(`Strategic Domain Runtime requires ${path} to be an object.`);
    }
    methods.forEach((method) => {
      if (typeof value[method] !== "function") {
        fail(`Strategic Domain Runtime requires ${path}.${method}.`);
      }
    });
    return value;
  }

  function requireModules(value) {
    const modules = requireRecord(value, "options.modules");
    MODULE_FIELDS.forEach((field) => {
      if (typeof modules[field] !== "function") {
        fail(`Strategic Domain Runtime requires options.modules.${field}.`);
      }
    });
    return modules;
  }

  function requireInitialState(value) {
    const initialState = requireRecord(value, "options.initialState");
    requireExactFields(initialState, INITIAL_STATE_FIELDS, "options.initialState");
    INITIAL_STATE_FIELDS.forEach((field) => {
      if (!Array.isArray(initialState[field])) {
        fail(`Strategic Domain Runtime requires options.initialState.${field} to be an array.`);
      }
    });
    return initialState;
  }

  function createStrategicDomainRuntime(options) {
    const input = requireRecord(options, "options");
    requireExactFields(input, FACTORY_FIELDS, "options");
    const modules = requireModules(input.modules);
    const initialState = requireInitialState(input.initialState);
    const unionRegistryService = requireInterface(
      input.unionRegistryService,
      "options.unionRegistryService",
      ["listUnionIdentities", "getUnionIdentity"]
    );

    const unionMatchingService = modules.createUnionMatchingService({ unionRegistryService });
    const relationService = modules.createUnionServerSeasonRelationService(initialState.relations);
    const nativeAssignmentService = modules.createNativeUnionAssignmentService({
      initialAssignments: initialState.nativeAssignments,
      validateNativeUnionAssignment: modules.validateNativeUnionAssignment,
      validateNativeUnionAssignmentHistory: modules.validateNativeUnionAssignmentHistory
    });
    const activeStatusEvaluator = modules.createActiveUnionStatusEvaluator({
      validateActiveUnionStatus: modules.validateActiveUnionStatus
    });
    const activeStatusService = modules.createActiveUnionStatusService({
      initialStatuses: initialState.activeStatuses,
      validateActiveUnionStatus: modules.validateActiveUnionStatus,
      validateActiveUnionStatusHistory: modules.validateActiveUnionStatusHistory
    });
    const combatStrengthObservationService = modules.createCombatStrengthObservationService({
      initialObservations: initialState.combatStrengthObservations,
      validateCombatStrengthObservation: modules.validateCombatStrengthObservation,
      validateCombatStrengthObservationHistory: modules.validateCombatStrengthObservationHistory,
      clock: typeof input.clock === "function" ? input.clock : () => new Date()
    });
    const serverObservationService = modules.createServerObservationService({
      initialObservations: initialState.serverObservations,
      validateServerObservation: modules.validateServerObservation,
      validateServerObservationHistory: modules.validateServerObservationHistory,
      clock: typeof input.clock === "function" ? input.clock : () => new Date()
    });
    const ownershipRecordService = modules.createOwnershipRecordService({
      initialTerritoryRecords: initialState.territoryOwnershipRecords,
      initialStructureRecords: initialState.structureOwnershipRecords,
      validateTerritoryOwnershipRecord: modules.validateTerritoryOwnershipRecord,
      validateTerritoryOwnershipHistory: modules.validateTerritoryOwnershipHistory,
      validateStructureOwnershipRecord: modules.validateStructureOwnershipRecord,
      validateStructureOwnershipHistory: modules.validateStructureOwnershipHistory,
      clock: typeof input.clock === "function" ? input.clock : () => new Date()
    });
    const targetVerificationService = modules.createTargetVerificationService({
      initialVerifications: initialState.targetVerifications,
      validateTargetVerificationRecord: modules.validateTargetVerificationRecord,
      validateTargetVerificationHistory: modules.validateTargetVerificationHistory,
      clock: typeof input.clock === "function" ? input.clock : () => new Date()
    });
    const confirmedSnapshotValidator = modules.createConfirmedServerSnapshotValidator({
      validateTerritoryOwnershipRecord: modules.validateTerritoryOwnershipRecord,
      validateTerritoryOwnershipHistory: modules.validateTerritoryOwnershipHistory,
      validateStructureOwnershipRecord: modules.validateStructureOwnershipRecord,
      validateStructureOwnershipHistory: modules.validateStructureOwnershipHistory,
      validateTargetVerificationRecord: modules.validateTargetVerificationRecord,
      validateTargetVerificationHistory: modules.validateTargetVerificationHistory
    });
    const confirmedSnapshotService = modules.createConfirmedServerSnapshotService({
      initialSnapshots: initialState.confirmedSnapshots,
      validateConfirmedServerSnapshot: confirmedSnapshotValidator.validateConfirmedServerSnapshot,
      validateConfirmedServerSnapshotHistory: confirmedSnapshotValidator.validateConfirmedServerSnapshotHistory,
      evaluateConfirmedServerSnapshotReferences:
        confirmedSnapshotValidator.evaluateConfirmedServerSnapshotReferences,
      clock: typeof input.clock === "function" ? input.clock : () => new Date()
    });
    const confirmedSnapshotCoordinator = modules.createConfirmedServerSnapshotCoordinator({
      ownershipRecordService,
      targetVerificationService,
      confirmedSnapshotService
    });
    const snapshotActivityFactResolver = modules.createSnapshotActivityFactResolver({
      evaluateConfirmedServerSnapshotReferences:
        confirmedSnapshotValidator.evaluateConfirmedServerSnapshotReferences
    });
    const activityFactHistoryService = modules.createActivityFactHistoryService({
      initialConfirmedPresenceFacts: initialState.confirmedPresenceFacts,
      initialQualifyingFullMapConfirmations: initialState.qualifyingFullMapConfirmations
    });
    const activeStatusUpdateCoordinator = modules.createActiveUnionStatusUpdateCoordinator({
      snapshotActivityFactResolver,
      activeUnionStatusEvaluator: activeStatusEvaluator,
      activeUnionStatusService: activeStatusService,
      activityFactHistoryService,
      relationService
    });
    const activeStatusProjectionService = modules.createActiveUnionStatusProjectionService({
      activeUnionStatusEvaluator: activeStatusEvaluator,
      activeUnionStatusService: activeStatusService,
      activityFactHistoryService
    });
    const unionServerSeasonViewService = modules.createUnionServerSeasonViewService({
      unionRegistryService,
      relationService,
      nativeAssignmentService
    });
    const unionServerSeasonIntelligenceViewService =
      modules.createUnionServerSeasonIntelligenceViewService({
        unionServerSeasonViewService,
        activeStatusProjectionService,
        combatStrengthObservationService
      });
    const serverIntelligenceViewService = modules.createServerIntelligenceViewService({
      unionServerSeasonIntelligenceViewService,
      serverObservationService
    });
    const serverDataCompletenessService = modules.createServerDataCompletenessService();
    const confirmedSnapshotChangeService = modules.createConfirmedSnapshotChangeService();
    const serverHistoryService = modules.createServerHistoryService({
      confirmedSnapshotService,
      ownershipRecordService,
      confirmedSnapshotChangeService
    });

    return Object.freeze({
      unionRegistryService,
      unionMatchingService,
      relationService,
      nativeAssignmentService,
      activeStatusEvaluator,
      activeStatusService,
      combatStrengthObservationService,
      serverObservationService,
      ownershipRecordService,
      targetVerificationService,
      confirmedSnapshotValidator,
      confirmedSnapshotService,
      confirmedSnapshotCoordinator,
      snapshotActivityFactResolver,
      activityFactHistoryService,
      activeStatusUpdateCoordinator,
      activeStatusProjectionService,
      unionServerSeasonViewService,
      unionServerSeasonIntelligenceViewService,
      serverIntelligenceViewService,
      serverDataCompletenessService,
      confirmedSnapshotChangeService,
      serverHistoryService
    });
  }

  const exportsObject = {
    createStrategicDomainRuntime,
    StrategicDomainRuntimeError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
