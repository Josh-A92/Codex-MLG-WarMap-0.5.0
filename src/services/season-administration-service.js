(function initializeSeasonAdministrationService(globalScope) {
  const OPTION_FIELDS = new Set([
    "preparedPackages",
    "validateSeasonPackage",
    "authorizationPolicyService",
    "storageAdapter",
    "persistenceCoordinator",
    "initialState",
    "clock"
  ]);
  const ACTIVATION_FIELDS = new Set([
    "schemaVersion",
    "seasonId",
    "packageVersion",
    "serverIds",
    "confirmations",
    "activatedAt",
    "activatedBy"
  ]);
  const ADMINISTRATION_STATE_FIELDS = new Set([
    "schemaVersion",
    "activeSeason",
    "completedSeasons"
  ]);
  const COMPLETION_FIELDS = new Set([
    ...ACTIVATION_FIELDS,
    "completedAt",
    "completedBy"
  ]);
  const CONFIRMATION_FIELDS = new Set(["mapAndStructures", "resourcesAndValues"]);
  const REQUEST_FIELDS = new Set(["seasonId", "serverIds", "confirmations"]);
  const STORAGE_IDENTITY = Object.freeze({ scope: "season_activation" });

  class SeasonAdministrationError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "SeasonAdministrationError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new SeasonAdministrationError(code, message, details);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireRecord(value, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    return value;
  }

  function rejectUnknownFields(value, allowedFields, path) {
    Object.keys(value).forEach((field) => {
      if (!allowedFields.has(field)) fail("invalid_input", `${path}.${field} is not supported.`);
    });
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `${path} must be a non-empty, non-whitespace string.`);
    }
    return value;
  }

  function requireUtcTimestamp(value, path) {
    requireString(value, path);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
      || !Number.isFinite(Date.parse(value))
    ) {
      fail("invalid_activation_state", `${path} must be a valid UTC ISO-8601 timestamp ending in Z.`);
    }
    return value;
  }

  function clone(value, seen) {
    if (
      value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value))
    ) return value;

    if (Array.isArray(value)) {
      if (seen.has(value)) fail("invalid_input", "Values must not contain cycles.");
      seen.add(value);
      const result = value.map((entry) => clone(entry, seen));
      seen.delete(value);
      return result;
    }

    if (!isRecord(value)) fail("invalid_input", "Values must contain JSON-compatible data only.");
    if (seen.has(value)) fail("invalid_input", "Values must not contain cycles.");
    seen.add(value);
    const result = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((field) => {
      Object.defineProperty(result, field, {
        value: clone(value[field], seen),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    seen.delete(value);
    return result;
  }

  function safeClone(value) {
    return clone(value, new Set());
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_input", `${path} must be an object.`);
    }
    return methods.reduce((bound, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_input", `${path}.${method} must be a function.`);
      }
      bound[method] = value[method].bind(value);
      return bound;
    }, {});
  }

  function normalizeServerIds(value, path) {
    if (!Array.isArray(value) || value.length === 0) {
      fail("invalid_input", `${path} must be a non-empty array.`);
    }
    const seen = new Set();
    return value.map((serverId, index) => {
      const normalized = requireString(serverId, `${path}[${index}]`);
      if (seen.has(normalized)) {
        fail("invalid_input", `${path} contains duplicate server ID '${normalized}'.`);
      }
      seen.add(normalized);
      return normalized;
    });
  }

  function normalizeConfirmations(value, path) {
    const record = requireRecord(value, path);
    rejectUnknownFields(record, CONFIRMATION_FIELDS, path);
    CONFIRMATION_FIELDS.forEach((field) => {
      if (record[field] !== true) {
        fail("confirmation_required", `${path}.${field} must be confirmed before activation.`);
      }
    });
    return { mapAndStructures: true, resourcesAndValues: true };
  }

  function normalizeActivationEnvelope(value, packagesBySeasonId) {
    const record = requireRecord(value, "activationEnvelope");
    rejectUnknownFields(record, ACTIVATION_FIELDS, "activationEnvelope");
    if (record.schemaVersion !== 1) {
      fail("unsupported_activation_version", "activationEnvelope.schemaVersion must equal 1.");
    }
    const seasonId = requireString(record.seasonId, "activationEnvelope.seasonId");
    const preparedPackage = packagesBySeasonId.get(seasonId);
    if (!preparedPackage) {
      fail("unknown_active_season", `Active season '${seasonId}' is not available in the prepared-package catalogue.`);
    }
    const expectedPackageVersion = preparedPackage.packageIdentity.packageVersion || null;
    if (record.packageVersion !== expectedPackageVersion) {
      fail("package_version_mismatch", `Active package version for '${seasonId}' does not match the prepared package.`);
    }
    return {
      schemaVersion: 1,
      seasonId,
      packageVersion: expectedPackageVersion,
      serverIds: normalizeServerIds(record.serverIds, "activationEnvelope.serverIds"),
      confirmations: normalizeConfirmations(record.confirmations, "activationEnvelope.confirmations"),
      activatedAt: requireUtcTimestamp(record.activatedAt, "activationEnvelope.activatedAt"),
      activatedBy: requireString(record.activatedBy, "activationEnvelope.activatedBy")
    };
  }

  function normalizeCompletedSeason(value, packagesBySeasonId, path) {
    const record = requireRecord(value, path);
    rejectUnknownFields(record, COMPLETION_FIELDS, path);
    const activationRecord = {};
    ACTIVATION_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(record, field)) activationRecord[field] = record[field];
    });
    const activation = normalizeActivationEnvelope(activationRecord, packagesBySeasonId);
    const completedAt = requireUtcTimestamp(record.completedAt, `${path}.completedAt`);
    if (Date.parse(completedAt) < Date.parse(activation.activatedAt)) {
      fail("invalid_activation_state", `${path}.completedAt cannot be earlier than activatedAt.`);
    }
    return {
      ...activation,
      completedAt,
      completedBy: requireString(record.completedBy, `${path}.completedBy`)
    };
  }

  function normalizeAdministrationState(value, packagesBySeasonId) {
    const record = requireRecord(value, "administrationState");
    if (record.schemaVersion === 1) {
      return {
        schemaVersion: 2,
        activeSeason: normalizeActivationEnvelope(record, packagesBySeasonId),
        completedSeasons: []
      };
    }
    rejectUnknownFields(record, ADMINISTRATION_STATE_FIELDS, "administrationState");
    if (record.schemaVersion !== 2) {
      fail("unsupported_activation_version", "administrationState.schemaVersion must equal 1 or 2.");
    }
    const activeSeason = record.activeSeason === null || record.activeSeason === undefined
      ? null
      : normalizeActivationEnvelope(record.activeSeason, packagesBySeasonId);
    if (!Array.isArray(record.completedSeasons)) {
      fail("invalid_activation_state", "administrationState.completedSeasons must be an array.");
    }
    const completedIds = new Set();
    const completedSeasons = record.completedSeasons.map((entry, index) => {
      const normalized = normalizeCompletedSeason(entry, packagesBySeasonId, `administrationState.completedSeasons[${index}]`);
      const completionKey = `${normalized.seasonId}\u0000${normalized.activatedAt}`;
      if (completedIds.has(completionKey)) {
        fail("invalid_activation_state", `administrationState.completedSeasons contains duplicate completion '${normalized.seasonId}'.`);
      }
      completedIds.add(completionKey);
      return normalized;
    });
    return {
      schemaVersion: 2,
      activeSeason,
      completedSeasons
    };
  }

  function packageSummary(preparedPackage) {
    const identity = preparedPackage.packageIdentity;
    const rules = preparedPackage.rulesDefinition;
    const mapDefinition = rules.mapDefinition;
    const resourceModel = rules.resourceModel;
    const scoringModel = rules.scoringModel;
    return {
      seasonId: identity.seasonId,
      displayName: identity.displayName,
      packageVersion: identity.packageVersion || null,
      seasonStatus: identity.seasonStatus,
      map: {
        baseMapId: mapDefinition.baseMapId,
        rows: mapDefinition.dimensions.rows,
        columns: mapDefinition.dimensions.columns,
        topologyType: typeof mapDefinition.topologyType === "string" ? mapDefinition.topologyType : null,
        mapDataRef: typeof mapDefinition.mapDataRef === "string" ? mapDefinition.mapDataRef : null
      },
      structures: rules.structureCatalog.map((entry) => ({
        structureTypeId: entry.structureTypeId,
        code: entry.code,
        type: entry.type,
        level: Object.prototype.hasOwnProperty.call(entry, "level") ? entry.level : null,
        capturable: entry.capturable
      })),
      resourceModel: {
        resources: safeClone(resourceModel.resources || []),
        structureOutputs: safeClone(resourceModel.structureOutputs || {})
      },
      scoringModel: {
        calculations: safeClone(scoringModel.calculations || [])
      }
    };
  }

  function createSeasonAdministrationService(options) {
    const config = requireRecord(options, "options");
    rejectUnknownFields(config, OPTION_FIELDS, "options");
    if (!Array.isArray(config.preparedPackages) || config.preparedPackages.length === 0) {
      fail("invalid_input", "options.preparedPackages must be a non-empty array.");
    }
    if (typeof config.validateSeasonPackage !== "function") {
      fail("invalid_input", "options.validateSeasonPackage must be a function.");
    }
    if (typeof config.clock !== "function") fail("invalid_input", "options.clock must be a function.");

    const authorization = bindInterface(
      config.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const storage = config.storageAdapter
      ? bindInterface(config.storageAdapter, "options.storageAdapter", ["loadEnvelope", "saveEnvelope"])
      : null;
    const persistence = config.persistenceCoordinator
      ? bindInterface(config.persistenceCoordinator, "options.persistenceCoordinator", ["execute"])
      : null;
    if (!storage && !persistence) fail("invalid_input", "Season Administration requires persistenceCoordinator or storageAdapter.");
    const packagesBySeasonId = new Map();

    config.preparedPackages.forEach((candidate, index) => {
      const result = config.validateSeasonPackage(candidate);
      if (!result || result.valid !== true) {
        fail("invalid_prepared_package", `options.preparedPackages[${index}] is invalid.`, {
          errors: result && Array.isArray(result.errors) ? safeClone(result.errors) : [],
          warnings: result && Array.isArray(result.warnings) ? safeClone(result.warnings) : []
        });
      }
      const seasonId = candidate.packageIdentity.seasonId;
      if (packagesBySeasonId.has(seasonId)) {
        fail("duplicate_season_id", `Prepared season ID '${seasonId}' is duplicated.`);
      }
      packagesBySeasonId.set(seasonId, safeClone(candidate));
    });

    let initialized = false;
    let administrationState = {
      schemaVersion: 2,
      activeSeason: null,
      completedSeasons: []
    };

    async function initialize() {
      if (initialized) return getActiveSeason();
      if (Object.prototype.hasOwnProperty.call(config, "initialState") && config.initialState !== undefined) {
        administrationState = normalizeAdministrationState(config.initialState, packagesBySeasonId);
      } else {
        const stored = await storage.loadEnvelope(STORAGE_IDENTITY);
        administrationState = stored === null || stored === undefined
          ? { schemaVersion: 2, activeSeason: null, completedSeasons: [] }
          : normalizeAdministrationState(stored, packagesBySeasonId);
      }
      initialized = true;
      return getActiveSeason();
    }

    async function persistState(nextState) {
      if (persistence) {
        return persistence.execute(() => {
          administrationState = nextState;
          return getActiveSeason();
        });
      }
      await storage.saveEnvelope(STORAGE_IDENTITY, safeClone(nextState));
      administrationState = nextState;
      return getActiveSeason();
    }

    function requireInitialized() {
      if (!initialized) fail("not_initialized", "Season Administration Service must be initialized first.");
    }

    function listPreparedSeasons() {
      return Array.from(packagesBySeasonId.values()).map(packageSummary);
    }

    function getPreparedSeason(seasonIdValue) {
      const seasonId = requireString(seasonIdValue, "seasonId");
      const preparedPackage = packagesBySeasonId.get(seasonId);
      if (!preparedPackage) fail("season_not_found", `Prepared season '${seasonId}' was not found.`);
      return { summary: packageSummary(preparedPackage), package: safeClone(preparedPackage) };
    }

    function getActiveSeason() {
      return administrationState.activeSeason === null
        ? null
        : safeClone(administrationState.activeSeason);
    }

    function listCompletedSeasons() {
      requireInitialized();
      return safeClone(administrationState.completedSeasons);
    }

    async function activateSeason(actor, requestValue) {
      requireInitialized();
      const request = requireRecord(requestValue, "request");
      rejectUnknownFields(request, REQUEST_FIELDS, "request");
      const seasonId = requireString(request.seasonId, "request.seasonId");
      const preparedPackage = packagesBySeasonId.get(seasonId);
      if (!preparedPackage) fail("season_not_found", `Prepared season '${seasonId}' was not found.`);
      if (preparedPackage.packageIdentity.seasonStatus !== "active") {
        fail(
          "inactive_prepared_package",
          `Season '${seasonId}' cannot be activated because its prepared package status is '${preparedPackage.packageIdentity.seasonStatus || "unknown"}'.`
        );
      }

      const serverIds = normalizeServerIds(request.serverIds, "request.serverIds");
      const confirmations = normalizeConfirmations(request.confirmations, "request.confirmations");
      const decision = authorization.requireAuthorized(actor, "season_rules.manage", { seasonId });

      if (administrationState.activeSeason) {
        fail(
          "season_already_activated",
          `Season '${administrationState.activeSeason.seasonId}' is already active and must be completed before another season can be activated.`
        );
      }

      const clockValue = config.clock();
      if (!(clockValue instanceof Date) || !Number.isFinite(clockValue.getTime())) {
        fail("invalid_clock", "options.clock must return a valid Date.");
      }
      const activation = {
        schemaVersion: 1,
        seasonId,
        packageVersion: preparedPackage.packageIdentity.packageVersion || null,
        serverIds,
        confirmations,
        activatedAt: clockValue.toISOString(),
        activatedBy: decision.actorId
      };

      const nextState = {
        schemaVersion: 2,
        activeSeason: activation,
        completedSeasons: safeClone(administrationState.completedSeasons)
      };
      return persistState(nextState);
    }

    async function updateActiveSeasonServers(actor, serverIdsValue) {
      requireInitialized();
      const activeSeason = administrationState.activeSeason;
      if (!activeSeason) fail("no_active_season", "There is no active season to update.");
      const serverIds = normalizeServerIds(serverIdsValue, "serverIds");
      authorization.requireAuthorized(actor, "season_rules.manage", {
        seasonId: activeSeason.seasonId
      });
      const updatedActiveSeason = {
        ...safeClone(activeSeason),
        serverIds
      };
      const nextState = {
        schemaVersion: 2,
        activeSeason: updatedActiveSeason,
        completedSeasons: safeClone(administrationState.completedSeasons)
      };
      return persistState(nextState);
    }

    async function completeActiveSeason(actor, options) {
      requireInitialized();
      const activeSeason = administrationState.activeSeason;
      if (!activeSeason) fail("no_active_season", "There is no active season to complete.");
      const decision = authorization.requireAuthorized(actor, "season_rules.manage", {
        seasonId: activeSeason.seasonId
      });
      const clockValue = config.clock();
      if (!(clockValue instanceof Date) || !Number.isFinite(clockValue.getTime())) {
        fail("invalid_clock", "options.clock must return a valid Date.");
      }
      const completedAt = clockValue.toISOString();
      if (Date.parse(completedAt) < Date.parse(activeSeason.activatedAt)) {
        fail("invalid_clock", "Season completion time cannot be earlier than activation time.");
      }
      const completion = {
        ...safeClone(activeSeason),
        completedAt,
        completedBy: decision.actorId
      };
      const nextState = {
        schemaVersion: 2,
        activeSeason: null,
        completedSeasons: administrationState.completedSeasons.concat([completion])
      };
      if (options && options.persist === false) {
        administrationState = nextState;
      } else {
        await persistState(nextState);
      }
      return safeClone(completion);
    }

    function captureTransactionState() {
      return safeClone(administrationState);
    }

    function restoreTransactionState(snapshot) {
      administrationState = normalizeAdministrationState(snapshot, packagesBySeasonId);
    }

    return Object.freeze({
      initialize,
      listPreparedSeasons,
      getPreparedSeason,
      getActiveSeason,
      listCompletedSeasons,
      activateSeason,
      updateActiveSeasonServers,
      completeActiveSeason
      ,captureTransactionState
      ,restoreTransactionState
    });
  }

  const exportsObject = {
    createSeasonAdministrationService,
    SeasonAdministrationError,
    SEASON_ACTIVATION_STORAGE_IDENTITY: STORAGE_IDENTITY
  };
  Object.keys(exportsObject).forEach((field) => {
    globalScope[field] = exportsObject[field];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
