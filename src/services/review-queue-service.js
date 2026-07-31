(function initializeReviewQueueServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "nativeAssignmentService",
    "combatStrengthObservationService",
    "serverObservationService",
    "ownershipRecordService",
    "evidenceRecordService"
  ]);
  const FILTER_FIELDS = new Set(["seasonId", "serverId", "itemType"]);
  const ITEM_TYPES = new Set([
    "native_assignment",
    "combat_strength_observation",
    "server_observation",
    "territory_ownership",
    "structure_ownership",
    "evidence_record"
  ]);

  class ReviewQueueServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ReviewQueueServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ReviewQueueServiceError(code, message);
  }
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }
  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Review Queue Service requires ${path} to be non-empty.`);
    }
    return value;
  }
  function bindService(value, field, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Review Queue Service requires options.${field}.`);
    }
    return methods.reduce((bound, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Review Queue Service requires options.${field}.${method}.`);
      }
      bound[method] = value[method].bind(value);
      return bound;
    }, {});
  }

  function createReviewQueueService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Review Queue Service requires options.");
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Review Queue Service requires options.${field}.`);
      }
    });
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Review Queue Service does not recognize options.${unknown[0]}.`);

    const nativeAssignments = bindService(
      options.nativeAssignmentService,
      "nativeAssignmentService",
      ["listAssignments"]
    );
    const combatStrength = bindService(
      options.combatStrengthObservationService,
      "combatStrengthObservationService",
      ["listObservations"]
    );
    const serverObservations = bindService(
      options.serverObservationService,
      "serverObservationService",
      ["listObservations"]
    );
    const ownership = bindService(
      options.ownershipRecordService,
      "ownershipRecordService",
      ["listTerritoryRecords", "listStructureRecords"]
    );
    const evidence = bindService(
      options.evidenceRecordService,
      "evidenceRecordService",
      ["listEvidenceRecords"]
    );

    function createItem(itemType, record, idField, timeField) {
      if (!isRecord(record)
          || typeof record[idField] !== "string"
          || record[idField].trim() === ""
          || typeof record[timeField] !== "string"
          || !Number.isFinite(Date.parse(record[timeField]))) {
        fail("invalid_dependency", `Review Queue Service received an invalid ${itemType} proposal.`);
      }
      return {
        itemType,
        itemId: record[idField],
        seasonId: typeof record.seasonId === "string" ? record.seasonId : null,
        serverId: typeof record.serverId === "string" ? record.serverId : null,
        observedAt: record[timeField],
        sourceType: typeof record.sourceType === "string" ? record.sourceType : null,
        evidenceIds: Array.isArray(record.evidenceIds)
          ? clone(record.evidenceIds)
          : (typeof record.evidenceId === "string" ? [record.evidenceId] : []),
        record: clone(record)
      };
    }

    function collect(service, method, filter, itemType, idField, timeField) {
      const records = service[method](filter);
      if (!Array.isArray(records)) {
        fail("invalid_dependency", `Review Queue Service requires ${method} to return an array.`);
      }
      return records.map((record) => createItem(itemType, record, idField, timeField));
    }

    function listPendingReviews(filter) {
      const value = filter === undefined ? {} : filter;
      if (!isRecord(value)) fail("invalid_input", "Review Queue Service requires filter to be a plain object.");
      const unknownFilters = Object.keys(value).filter((field) => !FILTER_FIELDS.has(field)).sort();
      if (unknownFilters.length > 0) {
        fail("invalid_input", `Review Queue Service does not recognize filter.${unknownFilters[0]}.`);
      }
      Object.keys(value).forEach((field) => requireString(value[field], `filter.${field}`));
      if (value.itemType !== undefined && !ITEM_TYPES.has(value.itemType)) {
        fail("invalid_input", `Review Queue Service does not recognize item type '${value.itemType}'.`);
      }

      const scoped = {};
      if (value.seasonId !== undefined) scoped.seasonId = value.seasonId;
      if (value.serverId !== undefined) scoped.serverId = value.serverId;
      const items = [];
      function include(itemType) {
        return value.itemType === undefined || value.itemType === itemType;
      }
      if (include("native_assignment")) {
        items.push(...collect(
          nativeAssignments, "listAssignments", { ...scoped, reviewState: "proposed" },
          "native_assignment", "assignmentId", "observedAt"
        ));
      }
      if (include("combat_strength_observation")) {
        items.push(...collect(
          combatStrength, "listObservations", { ...scoped, reviewState: "proposed" },
          "combat_strength_observation", "observationId", "observedAt"
        ));
      }
      if (include("server_observation")) {
        items.push(...collect(
          serverObservations, "listObservations", { ...scoped, reviewState: "proposed" },
          "server_observation", "observationId", "observedAt"
        ));
      }
      if (include("territory_ownership")) {
        items.push(...collect(
          ownership, "listTerritoryRecords", { ...scoped, reviewState: "proposed" },
          "territory_ownership", "ownershipRecordId", "effectiveAt"
        ));
      }
      if (include("structure_ownership")) {
        items.push(...collect(
          ownership, "listStructureRecords", { ...scoped, reviewState: "proposed" },
          "structure_ownership", "structureOwnershipId", "effectiveAt"
        ));
      }
      if (include("evidence_record")) {
        const evidenceItems = collect(
          evidence, "listEvidenceRecords", { reviewState: "proposed" },
          "evidence_record", "evidenceId", "observedAt"
        );
        items.push(...evidenceItems.filter((item) => (
          (value.seasonId === undefined || item.seasonId === value.seasonId)
          && (value.serverId === undefined || item.serverId === value.serverId)
        )));
      }

      return items.sort((left, right) => {
        const time = Date.parse(right.observedAt) - Date.parse(left.observedAt);
        return time
          || left.itemType.localeCompare(right.itemType)
          || left.itemId.localeCompare(right.itemId);
      });
    }

    return { listPendingReviews };
  }

  const exportsObject = { createReviewQueueService, ReviewQueueServiceError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
