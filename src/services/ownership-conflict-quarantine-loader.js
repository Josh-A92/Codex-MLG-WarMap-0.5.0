(function initializeOwnershipConflictQuarantineLoader(globalScope) {
  const FACTORY_FIELDS = new Set([
    "generationStore",
    "deserializeUnionRegistryEnvelope",
    "deserializeStrategicDomainEnvelope",
    "deserializeEvidenceEnvelope",
    "deserializeServerState",
    "deserializeApplicationAuditEnvelope",
    "deserializeOwnershipHistoryProvenance",
    "validateTerritoryOwnershipRecord",
    "validateStructureOwnershipRecord",
    "validateOwnershipRetractionRecord",
    "ownershipConflictAnalysis",
    "resolveSeasonPackage",
    "createTargetCatalog"
  ]);
  const INPUT_FIELDS = new Set(["expectedCurrent"]);
  const EXPECTED_CURRENT_FIELDS = new Set(["generation", "manifestFile", "manifestSha256"]);
  const DOCUMENT_FIELDS = new Set(["documentId", "scope", "type", "fileName", "sha256"]);
  const REQUIRED_ROLES = [
    ["union-registry-global", "global", "union-registry"],
    ["strategic", null, "strategic-domain"],
    ["evidence", null, "evidence-domain"],
    ["projection", null, "server-state"],
    ["season-administration", "global", "season-administration"],
    ["application-audit-global", "global", "application-audit"]
  ];
  const OPTIONAL_TYPES = new Set(["ownership-history-provenance"]);

  class OwnershipConflictQuarantineLoaderError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "OwnershipConflictQuarantineLoaderError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new OwnershipConflictQuarantineLoaderError(code, message, cause);
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
        value: clone(value[key]), enumerable: true, configurable: true, writable: true
      });
    });
    return output;
  }

  function freeze(value) {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => freeze(value[key]));
    return Object.freeze(value);
  }

  function immutable(value) {
    return freeze(clone(value));
  }

  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function requireFunction(value, path) {
    if (typeof value !== "function") fail("invalid_factory", `${path} must be a function.`);
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_document", `${path} must be an array.`);
    return value;
  }

  function normalizeExpectedCurrent(value) {
    rejectUnknown(value, EXPECTED_CURRENT_FIELDS, "input.expectedCurrent");
    if (!Number.isSafeInteger(value.generation) || value.generation < 0) fail("invalid_input", "input.expectedCurrent.generation is invalid.");
    return {
      generation: value.generation,
      manifestFile: requireString(value.manifestFile, "input.expectedCurrent.manifestFile"),
      manifestSha256: requireString(value.manifestSha256, "input.expectedCurrent.manifestSha256")
    };
  }

  function identity(value, path) {
    if (!isRecord(value)) fail("invalid_generation", `${path} must be an object.`);
    return {
      generation: value.generation,
      manifestFile: requireString(value.manifestFile, `${path}.manifestFile`),
      manifestSha256: requireString(value.manifestSha256, `${path}.manifestSha256`)
    };
  }

  function sameIdentity(left, right) {
    return left.generation === right.generation
      && left.manifestFile === right.manifestFile
      && left.manifestSha256 === right.manifestSha256;
  }

  function normalizeManifestDocument(value, index) {
    rejectUnknown(value, DOCUMENT_FIELDS, `manifest.documents[${index}]`);
    return {
      documentId: requireString(value.documentId, `manifest.documents[${index}].documentId`),
      scope: requireString(value.scope, `manifest.documents[${index}].scope`),
      type: requireString(value.type, `manifest.documents[${index}].type`),
      fileName: requireString(value.fileName, `manifest.documents[${index}].fileName`),
      sha256: requireString(value.sha256, `manifest.documents[${index}].sha256`)
    };
  }

  async function validateAdministration(value, resolvePackage, seasonId) {
    if (!isRecord(value)) fail("invalid_administration", "Season administration document must be an object.");
    const allowed = new Set(["schemaVersion", "activeSeason", "completedSeasons"]);
    rejectUnknown(value, allowed, "season-administration");
    if (value.schemaVersion !== 2) fail("unsupported_version", "Season administration schemaVersion must equal 2.");
    if (!Array.isArray(value.completedSeasons)) fail("invalid_administration", "Season administration completedSeasons must be an array.");
    const active = value.activeSeason;
    const completed = value.completedSeasons;
    async function validateActivation(entry, path, completedEntry, requireCurrentScope) {
      if (!isRecord(entry)) fail("invalid_administration", `${path} must be an object.`);
      const allowedActivation = new Set(["schemaVersion", "seasonId", "packageVersion", "serverIds", "confirmations", "activatedAt", "activatedBy", "completedAt", "completedBy"]);
      rejectUnknown(entry, allowedActivation, path);
      if (entry.schemaVersion !== 1) fail("unsupported_version", `${path}.schemaVersion must equal 1.`);
      if (requireCurrentScope && entry.seasonId !== seasonId) fail("scope_mismatch", `${path}.seasonId does not match strategic scope.`);
      const packageValue = await resolvePackage(entry.seasonId);
      if (!packageValue || entry.packageVersion !== packageValue.packageIdentity.packageVersion) fail("package_scope_mismatch", `${path}.packageVersion does not match the prepared package.`);
      if (!Array.isArray(entry.serverIds) || entry.serverIds.length === 0 || new Set(entry.serverIds).size !== entry.serverIds.length || entry.serverIds.some((id) => typeof id !== "string" || id.trim() === "")) fail("invalid_administration", `${path}.serverIds is invalid.`);
      if (!isRecord(entry.confirmations) || entry.confirmations.mapAndStructures !== true || entry.confirmations.resourcesAndValues !== true) fail("invalid_administration", `${path}.confirmations is incomplete.`);
      ["activatedAt", completedEntry ? "completedAt" : null].filter(Boolean).forEach((field) => {
        if (typeof entry[field] !== "string" || !Number.isFinite(Date.parse(entry[field]))) fail("invalid_administration", `${path}.${field} is invalid.`);
      });
      if (typeof entry.activatedBy !== "string" || entry.activatedBy.trim() === "") fail("invalid_administration", `${path}.activatedBy is invalid.`);
      if (completedEntry && (typeof entry.completedBy !== "string" || entry.completedBy.trim() === "")) fail("invalid_administration", `${path}.completedBy is invalid.`);
      return { seasonId: entry.seasonId, serverIds: entry.serverIds.slice() };
    }
    const completedForSeason = (await Promise.all(completed.map((entry, index) => validateActivation(entry, `season-administration.completedSeasons[${index}]`, true)))).filter((entry) => entry.seasonId === seasonId);
    const activeScope = active === null ? null : await validateActivation(active, "season-administration.activeSeason", false, true);
    const scope = activeScope || completedForSeason[completedForSeason.length - 1] || null;
    if (!scope) fail("missing_scope", "Season administration has neither active nor completed target season.");
    return { serverIds: scope.serverIds, archived: activeScope === null && completedForSeason.length > 0 };
  }

  function validateRecord(record, validator, path) {
    let result;
    try { result = validator(record); } catch (error) { fail("invalid_ownership_record", `${path} validator threw.`, error); }
    if (!isRecord(result) || result.valid !== true || !Array.isArray(result.errors)) fail("invalid_ownership_record", `${path} is invalid.`);
  }

  function validateUnionReferences(records, unionIds, path) {
    records.forEach((record, index) => {
      if (!isRecord(record)) fail("invalid_ownership_record", `${path}[${index}] must be an object.`);
      if (record.ownerUnionId !== null && record.ownerUnionId !== undefined && !unionIds.has(record.ownerUnionId)) fail("unknown_union", `${path}[${index}].ownerUnionId is unknown.`);
    });
  }

  function createOwnershipConflictQuarantineLoader(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    const generationStore = options.generationStore;
    if (!isRecord(generationStore) || typeof generationStore.loadCommittedGeneration !== "function") fail("invalid_factory", "options.generationStore.loadCommittedGeneration must be a function.");
    const deserializeUnion = requireFunction(options.deserializeUnionRegistryEnvelope, "options.deserializeUnionRegistryEnvelope");
    const deserializeStrategic = requireFunction(options.deserializeStrategicDomainEnvelope, "options.deserializeStrategicDomainEnvelope");
    const deserializeEvidence = requireFunction(options.deserializeEvidenceEnvelope, "options.deserializeEvidenceEnvelope");
    const deserializeServer = requireFunction(options.deserializeServerState, "options.deserializeServerState");
    const deserializeAudit = requireFunction(options.deserializeApplicationAuditEnvelope, "options.deserializeApplicationAuditEnvelope");
    const deserializeProvenance = requireFunction(options.deserializeOwnershipHistoryProvenance, "options.deserializeOwnershipHistoryProvenance");
    const validateTerritory = requireFunction(options.validateTerritoryOwnershipRecord, "options.validateTerritoryOwnershipRecord");
    const validateStructure = requireFunction(options.validateStructureOwnershipRecord, "options.validateStructureOwnershipRecord");
    const validateRetraction = requireFunction(options.validateOwnershipRetractionRecord, "options.validateOwnershipRetractionRecord");
    if (!isRecord(options.ownershipConflictAnalysis) || typeof options.ownershipConflictAnalysis.inspect !== "function") fail("invalid_factory", "options.ownershipConflictAnalysis.inspect must be a function.");
    const resolvePackage = requireFunction(options.resolveSeasonPackage, "options.resolveSeasonPackage");
    const createCatalog = requireFunction(options.createTargetCatalog, "options.createTargetCatalog");

    async function load(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      const expectedCurrent = normalizeExpectedCurrent(input.expectedCurrent);
      let loaded;
      try { loaded = await generationStore.loadCommittedGeneration(); } catch (error) { fail("generation_load_failed", "Current generation could not be loaded.", error); }
      if (!isRecord(loaded) || loaded.status !== "committed" || loaded.source !== "current" || Object.prototype.hasOwnProperty.call(loaded, "recovery")) fail("unsafe_committed_generation", "Only the current committed generation may enter quarantine.");
      if (!isRecord(loaded.pointer) || !isRecord(loaded.manifest) || !Array.isArray(loaded.manifest.documents) || !Array.isArray(loaded.documents)) fail("invalid_generation", "Current generation result is incomplete.");
      const actual = identity(loaded.pointer, "current pointer");
      if (!sameIdentity(actual, expectedCurrent)) fail("stale_current", "Current generation does not match expectedCurrent.");
      if (loaded.manifest.schemaVersion !== 1 || loaded.manifest.generation !== actual.generation || loaded.manifest.documents.length !== loaded.documents.length) fail("invalid_manifest", "Current manifest is invalid or inconsistent.");
      const manifestDocuments = loaded.manifest.documents.map(normalizeManifestDocument);
      const byId = new Map();
      manifestDocuments.forEach((document, index) => {
        if (byId.has(document.documentId)) fail("duplicate_document_id", `Duplicate document '${document.documentId}'.`);
        const loadedDocument = loaded.documents[index];
        if (!isRecord(loadedDocument) || loadedDocument.documentId !== document.documentId
            || (Object.prototype.hasOwnProperty.call(loadedDocument, "scope") && loadedDocument.scope !== document.scope)
            || (Object.prototype.hasOwnProperty.call(loadedDocument, "type") && loadedDocument.type !== document.type)) fail("invalid_generation", "Loaded documents do not match manifest identity.");
        byId.set(document.documentId, { manifest: document, value: loadedDocument.value });
      });
      const documents = manifestDocuments.map((document) => ({ documentId: document.documentId, scope: document.scope, type: document.type, value: clone(byId.get(document.documentId).value) }));
      const strategic = manifestDocuments.find((document) => document.type === "strategic-domain");
      const projection = manifestDocuments.find((document) => document.type === "server-state");
      if (!strategic || !projection || manifestDocuments.filter((document) => document.type === "strategic-domain").length !== 1 || manifestDocuments.filter((document) => document.type === "server-state").length !== 1) fail("duplicate_role", "Current generation must contain exactly one strategic and projection document.");
      const seasonId = requireString(strategic.scope, "strategic scope");
      const projectionParts = projection.scope.split("/");
      if (projectionParts.length !== 2 || projectionParts[0] !== seasonId) fail("scope_mismatch", "Strategic and projection scopes do not match.");
      const baseMapId = requireString(projectionParts[1], "projection base map scope");
      const packageValue = await resolvePackage(seasonId);
      if (!isRecord(packageValue) || packageValue.packageIdentity.seasonId !== seasonId || packageValue.rulesDefinition.mapDefinition.baseMapId !== baseMapId) fail("package_scope_mismatch", "Committed generation does not match a prepared season package.");
      const expectedRoles = [
        ["union-registry-global", "global", "union-registry"],
        [strategic.documentId, seasonId, "strategic-domain"],
        [`evidence-${seasonId}`, seasonId, "evidence-domain"],
        [projection.documentId, `${seasonId}/${baseMapId}`, "server-state"],
        ["season-administration", "global", "season-administration"],
        ["application-audit-global", "global", "application-audit"]
      ];
      expectedRoles.forEach(([documentId, scope, type]) => {
        const entry = byId.get(documentId);
        if (!entry || entry.manifest.scope !== scope || entry.manifest.type !== type) fail("missing_or_invalid_role", `Required document '${documentId}' is missing or invalid.`);
      });
      manifestDocuments.forEach((document) => {
        if (!expectedRoles.some(([id]) => id === document.documentId)
            && !OPTIONAL_TYPES.has(document.type)) fail("unsupported_role", `Document '${document.documentId}' is not a supported quarantine role.`);
        if (document.type === "ownership-history-provenance") {
          if (manifestDocuments.filter((candidate) => candidate.type === "ownership-history-provenance").length !== 1
              || document.documentId !== `ownership-provenance:${seasonId}:${baseMapId}`
              || document.scope !== `${seasonId}/${baseMapId}`) fail("invalid_provenance_role", "Ownership provenance role is duplicated or out of scope.");
          deserializeProvenance(byId.get(document.documentId).value, { seasonId, baseMapId, activeSeasonId: seasonId });
        }
      });
      let unionEnvelope; let strategicEnvelope; let evidenceEnvelope; let projectionEnvelope; let auditEnvelope;
      try {
        unionEnvelope = deserializeUnion(byId.get("union-registry-global").value);
        strategicEnvelope = deserializeStrategic(byId.get(strategic.documentId).value);
        evidenceEnvelope = deserializeEvidence(byId.get(`evidence-${seasonId}`).value);
        projectionEnvelope = deserializeServer(byId.get(projection.documentId).value);
        auditEnvelope = deserializeAudit(byId.get("application-audit-global").value);
      } catch (error) { fail("non_ownership_validation_failed", "A non-ownership document failed normal validation.", error); }
      if (!isRecord(unionEnvelope) || !Array.isArray(unionEnvelope.identities)) fail("invalid_union_registry", "Validated union registry is incomplete.");
      if (!isRecord(auditEnvelope) || !Array.isArray(auditEnvelope.records)) fail("invalid_application_audit", "Validated application audit history is incomplete.");
      const unionIds = new Set(unionEnvelope.identities.map((identityValue, index) => requireString(identityValue.unionId, `unionRegistry.identities[${index}].unionId`)));
      if (!isRecord(strategicEnvelope) || strategicEnvelope.seasonId !== seasonId || !isRecord(strategicEnvelope.state)) fail("scope_mismatch", "Strategic envelope scope is invalid.");
      if (!isRecord(projectionEnvelope) || projectionEnvelope.seasonId !== seasonId || projectionEnvelope.baseMapId !== baseMapId || !Array.isArray(projectionEnvelope.servers)) fail("scope_mismatch", "Projection envelope scope is invalid.");
      const administrationScope = await validateAdministration(byId.get("season-administration").value, resolvePackage, seasonId);
      const serverIds = projectionEnvelope.servers.map((server, index) => requireString(server.id, `projection.servers[${index}].id`));
      if (new Set(serverIds).size !== serverIds.length || administrationScope.serverIds.some((serverId) => !serverIds.includes(serverId))) fail("scope_mismatch", "Administration and projection server scopes differ.");
      projectionEnvelope.servers.forEach((server, index) => {
        if (!isRecord(server.ownership)) fail("invalid_projection", `projection.servers[${index}].ownership is invalid.`);
        Object.keys(server.ownership).forEach((key) => {
          const ownerUnionId = server.ownership[key];
          if (ownerUnionId !== null && ownerUnionId !== undefined && !unionIds.has(ownerUnionId)) fail("unknown_union", `projection.servers[${index}].ownership.${key} is unknown.`);
        });
      });
      const state = strategicEnvelope.state;
      const territoryRecords = requireArray(state.territoryOwnershipRecords, "strategic.state.territoryOwnershipRecords");
      const structureRecords = requireArray(state.structureOwnershipRecords, "strategic.state.structureOwnershipRecords");
      const retractionRecords = requireArray(state.ownershipRetractions, "strategic.state.ownershipRetractions");
      territoryRecords.forEach((record, index) => validateRecord(record, validateTerritory, `territoryRecords[${index}]`));
      structureRecords.forEach((record, index) => validateRecord(record, validateStructure, `structureRecords[${index}]`));
      retractionRecords.forEach((record, index) => validateRecord(record, validateRetraction, `retractionRecords[${index}]`));
      [...territoryRecords, ...structureRecords].forEach((record, index) => {
        if (record.seasonId !== seasonId || !serverIds.includes(record.serverId)) fail("scope_mismatch", `ownership record ${index} is outside the committed scope.`);
      });
      retractionRecords.forEach((record, index) => {
        if (record.seasonId !== seasonId || !serverIds.includes(record.serverId)) fail("scope_mismatch", `retraction record ${index} is outside the committed scope.`);
      });
      validateUnionReferences(territoryRecords, unionIds, "territoryRecords");
      validateUnionReferences(structureRecords, unionIds, "structureRecords");
      const targetCatalog = await createCatalog(packageValue);
      if (!isRecord(targetCatalog)) fail("invalid_target_catalog", "Target catalog is invalid.");
      const conflicts = [];
      for (const serverId of serverIds) {
        try {
          const conflict = options.ownershipConflictAnalysis.inspect({ seasonId, serverId, territoryRecords, structureRecords, retractionRecords });
          if (conflict) conflicts.push(conflict);
        } catch (error) { fail("ownership_history_invalid", `Ownership history for '${serverId}' is not recoverable.`, error); }
      }
      const sourceDocumentIds = { strategic: strategic.documentId, projection: projection.documentId };
      if (conflicts.length === 0) return immutable({ status: "recovery_not_required", sourceGeneration: actual, scope: { seasonId, baseMapId, serverIds, archived: administrationScope.archived }, documentMetadata: manifestDocuments.map((document) => clone(document)), documents, sourceDocumentIds, existingAuditRecords: auditEnvelope.records });
      if (conflicts.length !== 1) fail("multiple_conflicts", "Quarantine permits exactly one recoverable ownership conflict at a time.");
      return immutable({
        status: "recovery_ready",
        sourceGeneration: actual,
        scope: { seasonId, baseMapId, serverIds, archived: administrationScope.archived },
        documentMetadata: manifestDocuments.map((document) => clone(document)),
        documents,
        sourceDocumentIds,
        existingAuditRecords: auditEnvelope.records,
        territoryRecords,
        structureRecords,
        retractionRecords,
        conflict: conflicts[0]
      });
    }

    return Object.freeze({ load });
  }

  const exportsObject = { createOwnershipConflictQuarantineLoader, OwnershipConflictQuarantineLoaderError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
