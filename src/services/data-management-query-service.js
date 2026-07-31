(function initializeDataManagementQueryServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "unionRegistryService",
    "serverIntelligenceViewService",
    "nativeAssignmentService",
    "combatStrengthObservationService",
    "serverObservationService",
    "ownershipRecordService",
    "evidenceAssetService",
    "evidenceRecordService",
    "reviewQueueService",
    "resolveEvidenceScope"
  ]);
  const REQUEST_FIELDS = new Set(["seasonId", "serverId", "evaluatedAt"]);

  class DataManagementQueryServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "DataManagementQueryServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new DataManagementQueryServiceError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(output, key, {
        value: clone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    return output;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Data Management Query Service requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Data Management Query Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Data Management Query Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) {
      fail("invalid_dependency", `Data Management Query Service requires ${path} to return an array.`);
    }
    return value.map(clone);
  }

  function createDataManagementQueryService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Data Management Query Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Data Management Query Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Data Management Query Service requires options.${field}.`);
      }
    });
    if (typeof options.resolveEvidenceScope !== "function") {
      fail("invalid_factory", "Data Management Query Service requires options.resolveEvidenceScope.");
    }

    const registry = bindInterface(
      options.unionRegistryService,
      "options.unionRegistryService",
      ["listUnionIdentities"]
    );
    const serverViews = bindInterface(
      options.serverIntelligenceViewService,
      "options.serverIntelligenceViewService",
      ["getView"]
    );
    const nativeAssignments = bindInterface(
      options.nativeAssignmentService,
      "options.nativeAssignmentService",
      ["listAssignments"]
    );
    const combat = bindInterface(
      options.combatStrengthObservationService,
      "options.combatStrengthObservationService",
      ["listObservations"]
    );
    const observations = bindInterface(
      options.serverObservationService,
      "options.serverObservationService",
      ["listObservations"]
    );
    const ownership = bindInterface(
      options.ownershipRecordService,
      "options.ownershipRecordService",
      ["listTerritoryRecords", "listStructureRecords"]
    );
    const assets = bindInterface(
      options.evidenceAssetService,
      "options.evidenceAssetService",
      ["listAssets"]
    );
    const evidence = bindInterface(
      options.evidenceRecordService,
      "options.evidenceRecordService",
      ["listEvidenceRecords"]
    );
    const queue = bindInterface(
      options.reviewQueueService,
      "options.reviewQueueService",
      ["listPendingReviews"]
    );
    const resolveEvidenceScope = options.resolveEvidenceScope.bind(options);

    function getUnionRegistryWorkspace() {
      return {
        identities: requireArray(
          registry.listUnionIdentities({ includeArchived: true }),
          "unionRegistryService.listUnionIdentities"
        )
      };
    }

    function getEvidenceWorkspace() {
      return {
        assets: requireArray(assets.listAssets(), "evidenceAssetService.listAssets"),
        evidenceRecords: requireArray(
          evidence.listEvidenceRecords(),
          "evidenceRecordService.listEvidenceRecords"
        )
      };
    }

    function getServerWorkspace(request) {
      if (!isRecord(request)) {
        fail("invalid_input", "Data Management Query Service requires request.");
      }
      const unknownFields = Object.keys(request).filter((field) => !REQUEST_FIELDS.has(field)).sort();
      if (unknownFields.length > 0) {
        fail("invalid_input", `Data Management Query Service does not recognize request.${unknownFields[0]}.`);
      }
      REQUEST_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(request, field)) {
          fail("invalid_input", `Data Management Query Service requires request.${field}.`);
        }
      });
      const seasonId = requireString(request.seasonId, "request.seasonId");
      const serverId = requireString(request.serverId, "request.serverId");
      const evaluatedAt = requireString(request.evaluatedAt, "request.evaluatedAt");
      const scope = { seasonId, serverId };
      const confirmedIntelligence = serverViews.getView({ seasonId, serverId, evaluatedAt });
      if (!isRecord(confirmedIntelligence)) {
        fail("invalid_dependency", "Data Management Query Service received an invalid server intelligence view.");
      }
      const listedAssets = requireArray(assets.listAssets(), "evidenceAssetService.listAssets");
      const scopedAssets = listedAssets.filter((asset) => (
        isRecord(asset.sourceContext)
        && asset.sourceContext.seasonId === seasonId
        && asset.sourceContext.serverId === serverId
      ));
      const scopedEvidence = requireArray(
        evidence.listEvidenceRecords(),
        "evidenceRecordService.listEvidenceRecords"
      ).filter((record) => {
        if (record.assetId === null) return false;
        const recordScope = resolveEvidenceScope(clone(record));
        if (!isRecord(recordScope)) {
          fail("invalid_dependency", "Data Management Query Service received an invalid evidence scope.");
        }
        return recordScope.seasonId === seasonId && recordScope.serverId === serverId;
      });

      return {
        seasonId,
        serverId,
        evaluatedAt,
        confirmedIntelligence: clone(confirmedIntelligence),
        nativeAssignmentHistory: requireArray(
          nativeAssignments.listAssignments(scope),
          "nativeAssignmentService.listAssignments"
        ),
        combatStrengthHistory: requireArray(
          combat.listObservations(scope),
          "combatStrengthObservationService.listObservations"
        ),
        serverObservationHistory: requireArray(
          observations.listObservations(scope),
          "serverObservationService.listObservations"
        ),
        territoryOwnershipHistory: requireArray(
          ownership.listTerritoryRecords(scope),
          "ownershipRecordService.listTerritoryRecords"
        ),
        structureOwnershipHistory: requireArray(
          ownership.listStructureRecords(scope),
          "ownershipRecordService.listStructureRecords"
        ),
        evidenceAssets: clone(scopedAssets),
        evidenceRecords: clone(scopedEvidence),
        pendingReviews: requireArray(
          queue.listPendingReviews(scope),
          "reviewQueueService.listPendingReviews"
        )
      };
    }

    return Object.freeze({
      getUnionRegistryWorkspace,
      getEvidenceWorkspace,
      getServerWorkspace
    });
  }

  const exportsObject = {
    createDataManagementQueryService,
    DataManagementQueryServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
