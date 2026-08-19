(function initializeMapOwnershipCoordinatorFactory(globalScope) {
  const historyResolverExports = globalScope.createOwnershipHistoryResolver
    ? globalScope
    : (typeof require === "function" ? require("./ownership-history-resolver.js") : {});
  const conflictAnalysisExports = globalScope.createOwnershipConflictAnalysisService
    ? globalScope
    : (typeof require === "function" ? require("./ownership-conflict-analysis-service.js") : {});
  const FACTORY_FIELDS = new Set([
    "relationService",
    "serverIntelligenceManagementService",
    "targetVerificationService",
    "ownershipRecordService",
    "ownershipRetractionService",
    "evidenceRecordService",
    "resolveEvidenceScope",
    "seasonAdministrationService",
    "serverStateService",
    "targetCatalog",
    "executeAtomically",
    "createId",
    "clock"
  ]);
  const TERRITORY_FIELDS = new Set([
    "seasonId", "serverId", "row", "col", "territoryRef", "ownerUnionId",
    "effectiveAt", "eventAt", "evidenceIds"
  ]);
  const STRUCTURE_FIELDS = new Set([
    "seasonId", "serverId", "structureId", "footprint", "ownerUnionId",
    "effectiveAt", "eventAt", "evidenceIds"
  ]);
  const RETRACTION_FIELDS = new Set([
    "seasonId", "serverId", "reason", "transactionId", "retractedRecordId", "targetKind", "territoryRef", "row", "col", "structureId"
  ]);
  const CONFLICT_INSPECTION_FIELDS = new Set(["seasonId", "serverId"]);
  const CONFLICT_RESOLUTION_FIELDS = new Set([
    "seasonId", "serverId", "kind", "retainedRecordId", "reason", "transactionId"
  ]);

  class MapOwnershipCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "MapOwnershipCoordinatorError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new MapOwnershipCoordinatorError(code, message);
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

  function exact(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `Map Ownership Coordinator requires ${path}.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Map Ownership Coordinator does not recognize ${path}.${unknown[0]}.`);
    }
    return value;
  }

  function requireFields(value, fields, required, path) {
    required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Map Ownership Coordinator requires ${path}.${field}.`);
      }
    });
    return exact(value, fields, path);
  }

  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Map Ownership Coordinator requires ${path} to be non-empty.`);
    }
    return value;
  }

  function positiveInteger(value, path) {
    if (!Number.isInteger(value) || value < 1) {
      fail("invalid_input", `Map Ownership Coordinator requires ${path} to be a positive integer.`);
    }
    return value;
  }

  function owner(value) {
    if (value === null) return null;
    return requiredString(value, "input.ownerUnionId");
  }

  function optionalTimestamp(value) {
    if (value === undefined) return undefined;
    return requiredString(value, "input.effectiveAt");
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Map Ownership Coordinator requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Map Ownership Coordinator requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function normalizeCatalog(value) {
    if (!isRecord(value)) {
      fail("invalid_factory", "Map Ownership Coordinator requires options.targetCatalog.");
    }
    if (!Array.isArray(value.territoryKeys) || !Array.isArray(value.structures)) {
      fail("invalid_factory", "Map Ownership Coordinator requires options.targetCatalog territoryKeys and structures arrays.");
    }
    const territoryTargetKeys = new Set();
    const structureFootprintById = new Map();

    value.territoryKeys.forEach((entry, index) => {
      if (!isRecord(entry)) {
        fail("invalid_factory", `Map Ownership Coordinator requires targetCatalog.territoryKeys[${index}] to be an object.`);
      }
      if (entry.type === "strategic_node") {
        const nodeId = requiredString(entry.nodeId, `targetCatalog.territoryKeys[${index}].nodeId`);
        territoryTargetKeys.add(JSON.stringify(["strategic_node", nodeId]));
        return;
      }
      const row = positiveInteger(entry.row, `targetCatalog.territoryKeys[${index}].row`);
      const col = positiveInteger(entry.col, `targetCatalog.territoryKeys[${index}].col`);
      territoryTargetKeys.add(JSON.stringify(["normal_map_cell", row, col]));
    });

    value.structures.forEach((entry, index) => {
      if (!isRecord(entry) || !Array.isArray(entry.footprint)) {
        fail("invalid_factory", `Map Ownership Coordinator requires targetCatalog.structures[${index}] with a footprint array.`);
      }
      const structureId = requiredString(entry.structureId, `targetCatalog.structures[${index}].structureId`);
      const footprint = entry.footprint.map((point, pointIndex) => {
        if (!isRecord(point)) {
          fail("invalid_factory", `Map Ownership Coordinator requires targetCatalog.structures[${index}].footprint[${pointIndex}] to be an object.`);
        }
        const row = positiveInteger(point.row, `targetCatalog.structures[${index}].footprint[${pointIndex}].row`);
        const col = positiveInteger(point.col, `targetCatalog.structures[${index}].footprint[${pointIndex}].col`);
        const targetKey = JSON.stringify(["normal_map_cell", row, col]);
        if (!territoryTargetKeys.has(targetKey)) {
          fail("invalid_factory", `Map Ownership Coordinator requires structure '${structureId}' footprint to reference a known territory target.`);
        }
        return { row, col, key: `${row}-${col}` };
      });
      structureFootprintById.set(structureId, footprint);
    });

    return {
      territoryTargetKeys,
      structureFootprintById
    };
  }

  function territoryProjectionKey(territoryRef) {
    if (territoryRef.type === "strategic_node") {
      return JSON.stringify(["strategic_node", territoryRef.nodeId]);
    }
    return `${territoryRef.row}-${territoryRef.col}`;
  }

  function territoryCatalogKey(territoryRef) {
    if (territoryRef.type === "strategic_node") {
      return JSON.stringify(["strategic_node", territoryRef.nodeId]);
    }
    return JSON.stringify(["normal_map_cell", territoryRef.row, territoryRef.col]);
  }

  function normalizeTerritoryRef(inputValue) {
    if (Object.prototype.hasOwnProperty.call(inputValue, "territoryRef")) {
      if (Object.prototype.hasOwnProperty.call(inputValue, "row")
          || Object.prototype.hasOwnProperty.call(inputValue, "col")) {
        fail("invalid_input", "Map Ownership Coordinator does not allow input.row or input.col with input.territoryRef.");
      }
      if (!isRecord(inputValue.territoryRef)) {
        fail("invalid_input", "Map Ownership Coordinator requires input.territoryRef.");
      }
      const territoryRef = inputValue.territoryRef.type === "strategic_node"
        ? exact(inputValue.territoryRef, new Set(["type", "nodeId"]), "input.territoryRef")
        : exact(inputValue.territoryRef, new Set(["type", "row", "col"]), "input.territoryRef");
      if (territoryRef.type === "strategic_node") {
        return {
          type: "strategic_node",
          nodeId: requiredString(territoryRef.nodeId, "input.territoryRef.nodeId")
        };
      }
      if (territoryRef.type !== "normal_map_cell") {
        fail("invalid_input", "Map Ownership Coordinator requires input.territoryRef.type to be normal_map_cell or strategic_node.");
      }
      return {
        type: "normal_map_cell",
        row: positiveInteger(territoryRef.row, "input.territoryRef.row"),
        col: positiveInteger(territoryRef.col, "input.territoryRef.col")
      };
    }

    return {
      type: "normal_map_cell",
      row: positiveInteger(inputValue.row, "input.row"),
      col: positiveInteger(inputValue.col, "input.col")
    };
  }

  function normalizeEvidenceIds(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      fail("invalid_input", "Map Ownership Coordinator requires input.evidenceIds to be an array.");
    }
    const seen = new Set();
    return value.map((entry, index) => {
      const evidenceId = requiredString(entry, `input.evidenceIds[${index}]`);
      if (seen.has(evidenceId)) {
        fail("invalid_input", `Map Ownership Coordinator requires input.evidenceIds[${index}] to be unique.`);
      }
      seen.add(evidenceId);
      return evidenceId;
    });
  }

  function createMapOwnershipCoordinator(options) {
    const input = requireFields(options, FACTORY_FIELDS, FACTORY_FIELDS, "options");
    const relations = bindInterface(
      input.relationService,
      "options.relationService",
      ["hasRelation"]
    );
    const management = bindInterface(
      input.serverIntelligenceManagementService,
      "options.serverIntelligenceManagementService",
      [
        "addKnownUnion",
        "recordManualTerritoryOwnership",
        "recordManualStructureOwnership"
      ]
    );
    const verifications = bindInterface(
      input.targetVerificationService,
      "options.targetVerificationService",
      ["addConfirmedVerification", "getCurrentVerification", "correctVerification"]
    );
    const ownership = bindInterface(
      input.ownershipRecordService,
      "options.ownershipRecordService",
      ["listTerritoryRecords", "listStructureRecords"]
    );
    const retractions = bindInterface(
      input.ownershipRetractionService,
      "options.ownershipRetractionService",
      ["listRetractions", "addManualRetraction"]
    );
    const evidence = bindInterface(
      input.evidenceRecordService,
      "options.evidenceRecordService",
      ["getEvidenceRecord"]
    );
    const seasonAdministration = bindInterface(
      input.seasonAdministrationService,
      "options.seasonAdministrationService",
      ["getActiveSeason"]
    );
    const serverState = bindInterface(
      input.serverStateService,
      "options.serverStateService",
      ["captureTransactionState", "replaceTerritoryOwnership"]
    );
    if (typeof input.resolveEvidenceScope !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.resolveEvidenceScope.");
    }
    if (typeof input.executeAtomically !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.executeAtomically.");
    }
    if (typeof input.createId !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.createId.");
    }
    if (typeof input.clock !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires options.clock.");
    }

    const catalog = normalizeCatalog(input.targetCatalog);
    if (typeof historyResolverExports.createOwnershipHistoryResolver !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires the ownership history resolver.");
    }
    const historyResolver = historyResolverExports.createOwnershipHistoryResolver({
      targetCatalog: input.targetCatalog
    });
    if (typeof conflictAnalysisExports.createOwnershipConflictAnalysisService !== "function") {
      fail("invalid_factory", "Map Ownership Coordinator requires the ownership conflict analysis service.");
    }
    const conflictAnalysis = conflictAnalysisExports.createOwnershipConflictAnalysisService({
      ownershipHistoryResolver: historyResolver
    });
    const resolveEvidenceScope = input.resolveEvidenceScope.bind(input);
    const executeAtomically = input.executeAtomically.bind(input);
    const createId = input.createId.bind(input);
    const clock = input.clock.bind(input);

    function currentTimestamp() {
      const value = clock();
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        fail("invalid_clock", "Map Ownership Coordinator clock must return a valid Date.");
      }
      return value.toISOString();
    }

    function ensureActiveSeasonScope(seasonId, serverId) {
      const activeSeason = seasonAdministration.getActiveSeason();
      if (!activeSeason
          || activeSeason.seasonId !== seasonId
          || !Array.isArray(activeSeason.serverIds)
          || !activeSeason.serverIds.includes(serverId)) {
        fail("archived_season", `Map Ownership Coordinator rejects ownership capture for archived season '${seasonId}' on server '${serverId}'.`);
      }
    }

    function ensureKnownUnion(actor, seasonId, serverId, ownerUnionId) {
      if (
        ownerUnionId !== null
        && !relations.hasRelation(seasonId, serverId, ownerUnionId)
      ) {
        management.addKnownUnion(actor, { seasonId, serverId, unionId: ownerUnionId });
      }
    }

    function validateEvidenceScope(seasonId, serverId, evidenceIds) {
      evidenceIds.forEach((evidenceId) => {
        const record = evidence.getEvidenceRecord(evidenceId);
        if (!record) {
          fail("unknown_evidence", `Map Ownership Coordinator could not find evidence '${evidenceId}'.`);
        }
        const scope = resolveEvidenceScope(record);
        if (!scope || scope.seasonId !== seasonId || scope.serverId !== serverId) {
          fail(
            "evidence_scope_mismatch",
            `Evidence '${evidenceId}' does not match season '${seasonId}' and server '${serverId}'.`
          );
        }
      });
    }

    function ensureKnownTerritory(territoryRef) {
      const key = territoryCatalogKey(territoryRef);
      if (!catalog.territoryTargetKeys.has(key)) {
        fail("invalid_target", `Map Ownership Coordinator could not find target '${key}' in the active map catalog.`);
      }
    }

    function ensureKnownStructure(structureId) {
      if (!catalog.structureFootprintById.has(structureId)) {
        fail("invalid_target", `Map Ownership Coordinator could not find structure '${structureId}' in the active map catalog.`);
      }
    }

    function nextVerificationId() {
      return requiredString(
        createId("target_verification"),
        "createId('target_verification')"
      );
    }

    function addVerification(record, targetRef, ownershipType, recordId, evidenceIds) {
      const observedAt = typeof record.effectiveAt === "string"
        ? record.effectiveAt
        : (record.eventAt && record.eventAt.precision === "exact" ? record.eventAt.at : record.reviewedAt);
      const nextVerification = {
        verificationId: nextVerificationId(),
        serverId: record.serverId,
        seasonId: record.seasonId,
        targetRef,
        verifiedOwnershipRef: {
          type: ownershipType,
          recordId
        },
        observedAt,
        confirmedAt: record.reviewedAt,
        sourceType: "manual_entry",
        evidenceIds: evidenceIds.slice(),
        actorId: record.actorId,
        reviewerId: record.reviewerId,
        reviewState: "confirmed",
        supersededBy: null
      };
      const current = verifications.getCurrentVerification(record.serverId, record.seasonId, targetRef);
      return current === null
        ? verifications.addConfirmedVerification(nextVerification)
        : verifications.correctVerification(current.verificationId, nextVerification);
    }

    function createProjectionMap(seasonId, serverId) {
      const resolved = resolveOwnershipState(seasonId, serverId);
      const rebuiltOwnership = {};
      resolved.territories.forEach((record) => {
        const targetKey = territoryProjectionKey(record.territoryRef);
        rebuiltOwnership[targetKey] = record.ownershipState === "owned" ? record.ownerUnionId : null;
      });

      resolved.structures.forEach((record) => {
        const footprint = catalog.structureFootprintById.get(record.structureId) || [];
        footprint.forEach((cell) => {
          rebuiltOwnership[cell.key] = record.ownershipState === "owned" ? record.ownerUnionId : null;
        });
      });

      return rebuiltOwnership;
    }

    function ownershipHistoryInput(seasonId, serverId) {
      const territoryRecords = ownership.listTerritoryRecords({
        seasonId,
        serverId
      });
      const structureRecords = ownership.listStructureRecords({
        seasonId,
        serverId
      });
      const retractionRecords = retractions.listRetractions({ seasonId, serverId });

      return { seasonId, serverId, territoryRecords, structureRecords, retractionRecords };
    }

    function resolveOwnershipState(seasonId, serverId) {
      const historyInput = ownershipHistoryInput(seasonId, serverId);

      let resolved;
      try {
        resolved = historyResolver.resolve(historyInput);
      } catch (error) {
        fail(
          error && error.code === "contradiction"
            ? "contradictory_authoritative_history"
            : "invalid_authoritative_history",
          `Map Ownership Coordinator could not rebuild ownership projection: ${error.message}`
        );
      }
      return resolved;
    }

    function inspectOwnershipConflict(value) {
      const inputValue = requireFields(
        value,
        CONFLICT_INSPECTION_FIELDS,
        CONFLICT_INSPECTION_FIELDS,
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const historyInput = ownershipHistoryInput(seasonId, serverId);
      try {
        return conflictAnalysis.inspect(historyInput);
      } catch (error) {
        if (!error || error.code !== "invalid_authoritative_history") {
          fail("invalid_authoritative_history", `Map Ownership Coordinator could not inspect ownership history: ${error && error.message ? error.message : "unknown failure"}`);
        }
        fail(
          "invalid_authoritative_history",
          `Map Ownership Coordinator could not inspect ownership history: ${error && error.message ? error.message : "unknown failure"}`
        );
      }
    }

    function resolveOwnershipConflict(actor, value) {
      const inputValue = requireFields(
        value,
        CONFLICT_RESOLUTION_FIELDS,
        CONFLICT_RESOLUTION_FIELDS,
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const kind = requiredString(inputValue.kind, "input.kind");
      const retainedRecordId = requiredString(inputValue.retainedRecordId, "input.retainedRecordId");
      const reason = requiredString(inputValue.reason, "input.reason");
      if (reason.length > 1000) fail("invalid_input", "Map Ownership Coordinator requires input.reason to be at most 1000 characters.");
      const transactionId = requiredString(inputValue.transactionId, "input.transactionId");
      if (kind !== "territory" && kind !== "structure") fail("invalid_input", "Map Ownership Coordinator requires input.kind to be territory or structure.");

      return executeAtomically(() => {
        ensureActiveSeasonScope(seasonId, serverId);
        const conflict = inspectOwnershipConflict({ seasonId, serverId });
        if (!conflict
            || conflict.kind !== kind
            || !conflict.recordIds.includes(retainedRecordId)) {
          fail("stale_conflict", "Map Ownership Coordinator requires the exact current ownership conflict.");
        }
        const actorId = requiredString(actor && actor.actorId, "actor.actorId");
        const recordedAt = currentTimestamp();
        const appendedRetractions = conflict.recordIds
          .filter((recordId) => recordId !== retainedRecordId)
          .map((retractedRecordId) => retractions.addManualRetraction({
            retractionId: nextRetractionId(),
            seasonId,
            serverId,
            targetKind: kind === "territory" ? "territory_ownership_record" : "structure_ownership_record",
            retractedRecordId,
            actorId,
            reason,
            recordedAt,
            transactionId,
            sourceType: "manual_retraction"
          }));
        const rebuiltOwnership = createProjectionMap(seasonId, serverId);
        replaceServerProjection(serverId, rebuiltOwnership);
        return clone({ conflict, retainedRecordId, retractions: appendedRetractions });
      });
    }

    function nextRetractionId() {
      return requiredString(createId("ownership_retraction"), "createId('ownership_retraction')");
    }

    function resolveCurrentTerritoryRecord(seasonId, serverId, territoryRef) {
      const resolved = resolveOwnershipState(seasonId, serverId);
      const key = territoryCatalogKey(territoryRef);
      const match = resolved.territories.find((entry) => territoryCatalogKey(entry.territoryRef) === key);
      return match || null;
    }

    function resolveCurrentStructureRecord(seasonId, serverId, structureId) {
      const resolved = resolveOwnershipState(seasonId, serverId);
      return resolved.structures.find((entry) => entry.structureId === structureId) || null;
    }

    function retractTerritoryOwnership(actor, value) {
      const hasTargetRef = value && Object.prototype.hasOwnProperty.call(value, "territoryRef");
      const required = hasTargetRef
        ? new Set(["seasonId", "serverId", "territoryRef", "reason", "transactionId", "retractedRecordId"])
        : new Set(["seasonId", "serverId", "row", "col", "reason", "transactionId", "retractedRecordId"]);
      const inputValue = requireFields(value, RETRACTION_FIELDS, required, "input");
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const reason = requiredString(inputValue.reason, "input.reason");
      const transactionId = requiredString(inputValue.transactionId, "input.transactionId");
      const retractedRecordId = requiredString(inputValue.retractedRecordId, "input.retractedRecordId");
      const territoryRef = normalizeTerritoryRef(inputValue);

      return executeAtomically(() => {
        ensureActiveSeasonScope(seasonId, serverId);
        ensureKnownTerritory(territoryRef);
        const current = resolveCurrentTerritoryRecord(seasonId, serverId, territoryRef);
        if (!current || current.recordId !== retractedRecordId) {
          fail("stale_retraction_target", `Map Ownership Coordinator cannot retract stale territory record '${retractedRecordId}'.`);
        }
        const retraction = retractions.addManualRetraction({
          retractionId: nextRetractionId(),
          seasonId,
          serverId,
          targetKind: "territory_ownership_record",
          retractedRecordId,
          actorId: requiredString(actor && actor.actorId, "actor.actorId"),
          reason,
          recordedAt: currentTimestamp(),
          transactionId,
          sourceType: "manual_retraction"
        });
        const rebuiltOwnership = createProjectionMap(seasonId, serverId);
        replaceServerProjection(serverId, rebuiltOwnership);
        return { retraction, targetType: territoryRef.type, projectedTerritoryKeys: [territoryProjectionKey(territoryRef)] };
      });
    }

    function retractStructureOwnership(actor, value) {
      const inputValue = requireFields(
        value,
        RETRACTION_FIELDS,
        new Set(["seasonId", "serverId", "structureId", "reason", "transactionId", "retractedRecordId"]),
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const structureId = requiredString(inputValue.structureId, "input.structureId");
      const reason = requiredString(inputValue.reason, "input.reason");
      const transactionId = requiredString(inputValue.transactionId, "input.transactionId");
      const retractedRecordId = requiredString(inputValue.retractedRecordId, "input.retractedRecordId");

      return executeAtomically(() => {
        ensureActiveSeasonScope(seasonId, serverId);
        ensureKnownStructure(structureId);
        const current = resolveCurrentStructureRecord(seasonId, serverId, structureId);
        if (!current || current.recordId !== retractedRecordId) {
          fail("stale_retraction_target", `Map Ownership Coordinator cannot retract stale structure record '${retractedRecordId}'.`);
        }
        const retraction = retractions.addManualRetraction({
          retractionId: nextRetractionId(),
          seasonId,
          serverId,
          targetKind: "structure_ownership_record",
          retractedRecordId,
          actorId: requiredString(actor && actor.actorId, "actor.actorId"),
          reason,
          recordedAt: currentTimestamp(),
          transactionId,
          sourceType: "manual_retraction"
        });
        const rebuiltOwnership = createProjectionMap(seasonId, serverId);
        const footprint = catalog.structureFootprintById.get(structureId) || [];
        replaceServerProjection(serverId, rebuiltOwnership);
        return { retraction, targetType: "logical_structure", projectedTerritoryKeys: footprint.map((cell) => cell.key) };
      });
    }

    function replaceServerProjection(serverId, rebuiltOwnership) {
      const currentProjection = serverState.captureTransactionState();
      if (!isRecord(currentProjection) || !isRecord(currentProjection[serverId])) {
        fail("invalid_projection", `Map Ownership Coordinator could not capture projection state for server '${serverId}'.`);
      }
      const replacementProjection = clone(currentProjection);
      replacementProjection[serverId] = clone(rebuiltOwnership);
      serverState.replaceTerritoryOwnership(replacementProjection);
      return replacementProjection;
    }

    function normalizeTemporalInput(inputValue) {
      const output = {};
      if (Object.prototype.hasOwnProperty.call(inputValue, "eventAt")) {
        output.eventAt = clone(inputValue.eventAt);
      }
      const effectiveAt = optionalTimestamp(inputValue.effectiveAt);
      if (effectiveAt !== undefined) {
        output.effectiveAt = effectiveAt;
      }
      return output;
    }

    function ownershipInput(base, ownerUnionId) {
      return {
        seasonId: base.seasonId,
        serverId: base.serverId,
        ownerUnionId,
        ownershipState: ownerUnionId === null ? "unclaimed" : "owned",
        evidenceIds: base.evidenceIds,
        ...normalizeTemporalInput(base)
      };
    }

    function setTerritoryOwnership(actor, value) {
      const hasTargetRef = value && Object.prototype.hasOwnProperty.call(value, "territoryRef");
      const required = hasTargetRef
        ? new Set(["seasonId", "serverId", "territoryRef", "ownerUnionId"])
        : new Set(["seasonId", "serverId", "row", "col", "ownerUnionId"]);
      const inputValue = requireFields(value, TERRITORY_FIELDS, required, "input");
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const ownerUnionId = owner(inputValue.ownerUnionId);
      const territoryRef = normalizeTerritoryRef(inputValue);
      const evidenceIds = normalizeEvidenceIds(inputValue.evidenceIds);

      return executeAtomically(() => {
        ensureActiveSeasonScope(seasonId, serverId);
        ensureKnownTerritory(territoryRef);
        validateEvidenceScope(seasonId, serverId, evidenceIds);
        ensureKnownUnion(actor, seasonId, serverId, ownerUnionId);
        const record = management.recordManualTerritoryOwnership(actor, {
          ...ownershipInput({ seasonId, serverId, effectiveAt: inputValue.effectiveAt, eventAt: inputValue.eventAt, evidenceIds }, ownerUnionId),
          territoryRef
        });
        const verification = addVerification(
          record,
          territoryRef,
          "territory_ownership_record",
          record.ownershipRecordId,
          evidenceIds
        );
        const rebuiltOwnership = createProjectionMap(seasonId, serverId);
        replaceServerProjection(serverId, rebuiltOwnership);
        return {
          targetType: territoryRef.type,
          record,
          verification,
          projectedTerritoryKeys: [territoryProjectionKey(territoryRef)]
        };
      });
    }

    function setStructureOwnership(actor, value) {
      const inputValue = requireFields(
        value,
        STRUCTURE_FIELDS,
        new Set(["seasonId", "serverId", "structureId", "ownerUnionId"]),
        "input"
      );
      const seasonId = requiredString(inputValue.seasonId, "input.seasonId");
      const serverId = requiredString(inputValue.serverId, "input.serverId");
      const structureId = requiredString(inputValue.structureId, "input.structureId");
      const ownerUnionId = owner(inputValue.ownerUnionId);
      const evidenceIds = normalizeEvidenceIds(inputValue.evidenceIds);

      return executeAtomically(() => {
        ensureActiveSeasonScope(seasonId, serverId);
        ensureKnownStructure(structureId);
        validateEvidenceScope(seasonId, serverId, evidenceIds);
        ensureKnownUnion(actor, seasonId, serverId, ownerUnionId);
        const record = management.recordManualStructureOwnership(actor, {
          ...ownershipInput({ seasonId, serverId, effectiveAt: inputValue.effectiveAt, eventAt: inputValue.eventAt, evidenceIds }, ownerUnionId),
          structureId
        });
        const verification = addVerification(
          record,
          { type: "logical_structure", structureId },
          "structure_ownership_record",
          record.structureOwnershipId,
          evidenceIds
        );
        const rebuiltOwnership = createProjectionMap(seasonId, serverId);
        replaceServerProjection(serverId, rebuiltOwnership);
        const footprint = catalog.structureFootprintById.get(structureId) || [];
        return {
          targetType: "logical_structure",
          record,
          verification,
          projectedTerritoryKeys: footprint.map((cell) => cell.key)
        };
      });
    }

    return Object.freeze({
      setTerritoryOwnership,
      setStructureOwnership,
      retractTerritoryOwnership,
      retractStructureOwnership,
      inspectOwnershipConflict,
      resolveOwnershipConflict
    });
  }

  const exportsObject = {
    createMapOwnershipCoordinator,
    MapOwnershipCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
