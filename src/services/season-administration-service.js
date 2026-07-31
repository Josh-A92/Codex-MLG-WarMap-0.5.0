(function initializeSeasonAdministrationService(globalScope) {
  const OPTION_FIELDS = new Set([
    "preparedPackages",
    "validateSeasonPackage",
    "authorizationPolicyService",
    "storageAdapter",
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
        columns: mapDefinition.dimensions.columns
      },
      structures: rules.structureCatalog.map((entry) => ({
        structureTypeId: entry.structureTypeId,
        code: entry.code,
        type: entry.type,
        level: Object.prototype.hasOwnProperty.call(entry, "level") ? entry.level : null,
        capturable: entry.capturable
      })),
      resource: {
        resourceId: resourceModel.resourceId,
        displayName: resourceModel.displayName,
        unit: resourceModel.unit,
        metricType: resourceModel.metricType,
        structureOutputs: safeClone(resourceModel.structureOutputs),
        scoringConfigured: scoringModel.configured === true
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
    const storage = bindInterface(config.storageAdapter, "options.storageAdapter", [
      "loadEnvelope",
      "saveEnvelope"
    ]);
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
    let activeActivation = null;

    async function initialize() {
      if (initialized) return getActiveSeason();
      const stored = await storage.loadEnvelope(STORAGE_IDENTITY);
      activeActivation = stored === null || stored === undefined
        ? null
        : normalizeActivationEnvelope(stored, packagesBySeasonId);
      initialized = true;
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
      return activeActivation === null ? null : safeClone(activeActivation);
    }

    async function activateSeason(actor, requestValue) {
      requireInitialized();
      const request = requireRecord(requestValue, "request");
      rejectUnknownFields(request, REQUEST_FIELDS, "request");
      const seasonId = requireString(request.seasonId, "request.seasonId");
      const preparedPackage = packagesBySeasonId.get(seasonId);
      if (!preparedPackage) fail("season_not_found", `Prepared season '${seasonId}' was not found.`);
      const serverIds = normalizeServerIds(request.serverIds, "request.serverIds");
      const confirmations = normalizeConfirmations(request.confirmations, "request.confirmations");
      const decision = authorization.requireAuthorized(actor, "season_rules.manage", { seasonId });

      if (activeActivation && activeActivation.seasonId === seasonId) {
        fail(
          "season_already_activated",
          `Season '${seasonId}' is already active. A controlled versioned correction process is required to replace it.`
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

      await storage.saveEnvelope(STORAGE_IDENTITY, safeClone(activation));
      activeActivation = activation;
      return getActiveSeason();
    }

    return Object.freeze({
      initialize,
      listPreparedSeasons,
      getPreparedSeason,
      getActiveSeason,
      activateSeason
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
