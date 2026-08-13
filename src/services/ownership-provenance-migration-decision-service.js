(function initializeOwnershipProvenanceMigrationDecisionService(globalScope) {
  const provenanceFactoryExports = typeof globalScope.createOwnershipHistoryProvenanceEvidenceFactory === "function"
    ? globalScope
    : (typeof require === "function" ? require("./ownership-history-provenance-evidence-factory.js") : {});
  const FACTORY_FIELDS = new Set(["createCompletenessEvaluator"]);
  const INPUT_FIELDS = new Set([
    "activeSeason",
    "territoryRecords",
    "structureRecords",
    "targetCatalog",
    "persistedProjection",
    "provenanceState",
    "sourceDocumentIds"
  ]);
  const ACTIVE_FIELDS = new Set(["seasonId", "baseMapId", "serverIds"]);
  const SOURCE_FIELDS = new Set(["strategic", "projection"]);
  const REPAIRABLE = new Set(["missing_projection_entry", "stale_projection_entry", "orphan_projection_entry"]);

  class OwnershipProvenanceMigrationDecisionServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProvenanceMigrationDecisionServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new OwnershipProvenanceMigrationDecisionServiceError(code, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`);
    return value;
  }

  function rejectUnknown(value, fields, path) {
    if (!isPlainObject(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function compareStrings(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isPlainObject(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, {
      value: clone(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    }));
    return output;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (!isPlainObject(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort(compareStrings).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function diagnostics(evidence) {
    return Array.from(new Set(evidence.safetyDiagnosticCodes || [])).sort(compareStrings);
  }

  function reasonForEvidence(evidence) {
    const territory = evidence.territoryCoverage && evidence.territoryCoverage.classification;
    const projection = evidence.projectionRelationship || {};
    if (territory === "structurally_empty") return "structurally_empty_existing_data";
    if (territory === "projection_only") return "projection_only";
    if (territory === "partial") return "partial_territory_history";
    if (territory === "uncertain") {
      if ((evidence.territoryCoverage.uncertainTargetKeys || []).length > 0) return "exact_unknown_territory_history";
      return "uncertain_territory_history";
    }
    if (territory === "contradictory") return "contradictory_territory_history";
    if (territory === "malformed") return "malformed_territory_history";
    if (territory !== "complete") return "incomplete_territory_history";
    if (projection.classification !== "complete") return "unrepresentable_projection";
    if (projection.status === "matching_projection") return "complete_exact_history";
    if (!Array.isArray(projection.differences) || projection.differences.length === 0) return "unrepresentable_projection";
    if (projection.differences.some((difference) => !REPAIRABLE.has(difference.classification))) return "unrepresentable_projection";
    return "repairable_projection_drift";
  }

  function createOwnershipProvenanceMigrationDecisionService(options) {
    if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    if (typeof options.createCompletenessEvaluator !== "function") fail("invalid_factory", "createCompletenessEvaluator must be a function.");
    if (typeof provenanceFactoryExports.createOwnershipHistoryProvenanceEvidenceFactory !== "function") {
      fail("invalid_factory", "The ownership history provenance evidence factory is unavailable.");
    }

    const evidenceFactory = provenanceFactoryExports.createOwnershipHistoryProvenanceEvidenceFactory({
      createCompletenessEvaluator: options.createCompletenessEvaluator
    });

    function validateInput(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      rejectUnknown(input.activeSeason, ACTIVE_FIELDS, "input.activeSeason");
      const seasonId = requireString(input.activeSeason.seasonId, "input.activeSeason.seasonId");
      const baseMapId = requireString(input.activeSeason.baseMapId, "input.activeSeason.baseMapId");
      const serverIds = requireArray(input.activeSeason.serverIds, "input.activeSeason.serverIds").map((serverId, index) => requireString(serverId, `input.activeSeason.serverIds[${index}]`));
      if (serverIds.length === 0) fail("invalid_input", "input.activeSeason.serverIds must not be empty.");
      if (new Set(serverIds).size !== serverIds.length) fail("invalid_input", "input.activeSeason.serverIds contains duplicates.");
      requireArray(input.territoryRecords, "input.territoryRecords");
      requireArray(input.structureRecords, "input.structureRecords");
      if (!isPlainObject(input.targetCatalog)) fail("invalid_input", "input.targetCatalog must be a plain object.");
      if (!isPlainObject(input.persistedProjection)) fail("invalid_input", "input.persistedProjection must be a plain object.");
      if (!isPlainObject(input.provenanceState)) fail("invalid_input", "input.provenanceState must be a plain object.");
      rejectUnknown(input.sourceDocumentIds, SOURCE_FIELDS, "input.sourceDocumentIds");
      const sourceDocumentIds = {
        strategic: requireString(input.sourceDocumentIds.strategic, "input.sourceDocumentIds.strategic"),
        projection: requireString(input.sourceDocumentIds.projection, "input.sourceDocumentIds.projection")
      };
      if (sourceDocumentIds.strategic === sourceDocumentIds.projection) fail("invalid_input", "input.sourceDocumentIds must identify distinct strategic and projection documents.");
      return { seasonId, baseMapId, serverIds, sourceDocumentIds };
    }

    function existingRecords(provenanceState, seasonId, baseMapId) {
      if (provenanceState.status === "unknown_provenance") return [];
      if (provenanceState.status !== "present" || !isPlainObject(provenanceState.document) || !Array.isArray(provenanceState.document.records)) return null;
      if (provenanceState.document.seasonId !== seasonId || provenanceState.document.baseMapId !== baseMapId) return null;
      return provenanceState.document.records.map(clone);
    }

    function blockedServer(serverId, reason, evidence, extraDiagnostics = []) {
      return {
        serverId,
        reason,
        diagnostics: Array.from(new Set(extraDiagnostics.concat(evidence ? diagnostics(evidence) : []))).sort(compareStrings)
      };
    }

    function decide(input) {
      const context = validateInput(input);
      const records = existingRecords(input.provenanceState, context.seasonId, context.baseMapId);
      const provenanceMalformed = records === null;
      const existingByServer = new Map((records || []).map((record) => [record.serverId, record]));
      const serverResults = [];
      const candidateRecords = records ? records.map(clone) : [];
      const repairServerIds = [];
      let blocked = false;
      let needsMigration = false;

      context.serverIds.slice().sort(compareStrings).forEach((serverId) => {
        let evidence = null;
        if (provenanceMalformed) {
          serverResults.push(blockedServer(serverId, "malformed_provenance", null));
          blocked = true;
          return;
        }
        try {
          evidence = evidenceFactory.createEvidence({
            seasonId: context.seasonId,
            serverId,
            baseMapId: context.baseMapId,
            territoryRecords: input.territoryRecords,
            structureRecords: input.structureRecords,
            targetCatalog: input.targetCatalog,
            persistedProjection: input.persistedProjection,
            sourceKind: "existing_generation",
            sourceDocumentIds: [context.sourceDocumentIds.strategic, context.sourceDocumentIds.projection]
          });
        } catch (error) {
          serverResults.push(blockedServer(serverId, error && error.code === "contradiction" ? "contradictory_territory_history" : "malformed_territory_history", null, [error && error.code ? error.code : "evidence_evaluation_failed"]));
          blocked = true;
          return;
        }

        const reason = reasonForEvidence(evidence);
        const existing = existingByServer.get(serverId);
        const derived = {
          territoryCoverage: evidence.territoryCoverage,
          structureCoverage: evidence.structureCoverage,
          projectionRelationship: evidence.projectionRelationship,
          safetyDiagnosticCodes: evidence.safetyDiagnosticCodes
        };
        if (reason !== "complete_exact_history" && reason !== "repairable_projection_drift") {
          serverResults.push(blockedServer(serverId, reason, evidence));
          blocked = true;
          return;
        }
        if (existing && canonical(existing) !== canonical(evidence)) {
          serverResults.push(blockedServer(serverId, "conflicting_existing_provenance", evidence));
          blocked = true;
          return;
        }
        if (reason === "repairable_projection_drift") repairServerIds.push(serverId);
        if (!existing) {
          candidateRecords.push(clone(evidence));
          needsMigration = true;
        }
        serverResults.push({
          serverId,
          reason: existing ? "matching_existing_provenance" : reason,
          diagnostics: diagnostics(evidence)
        });
      });

      serverResults.sort((left, right) => compareStrings(left.serverId, right.serverId));
      if (blocked) {
        return { decision: "migration_blocked", seasonId: context.seasonId, baseMapId: context.baseMapId, serverReasons: serverResults };
      }
      repairServerIds.sort(compareStrings);
      candidateRecords.sort((left, right) => compareStrings(left.serverId, right.serverId));
      if (!needsMigration && repairServerIds.length === 0) {
        return { decision: "already_proven", seasonId: context.seasonId, baseMapId: context.baseMapId, serverReasons: serverResults };
      }
      const decision = repairServerIds.length > 0 ? "migration_with_projection_repair" : "migration_eligible";
      return {
        decision,
        seasonId: context.seasonId,
        baseMapId: context.baseMapId,
        serverReasons: serverResults,
        candidateProvenanceRecords: candidateRecords,
        repairServerIds
      };
    }

    return Object.freeze({ decide });
  }

  const exportsObject = {
    createOwnershipProvenanceMigrationDecisionService,
    OwnershipProvenanceMigrationDecisionServiceError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));