(function initializeOwnershipConflictRecoveryPlanBuilder(globalScope) {
  const FACTORY_FIELDS = new Set(["validateAuditHistory", "deserializeStrategicDomainEnvelope", "deserializeApplicationAuditEnvelope", "deserializeServerState"]);
  const INPUT_FIELDS = new Set(["snapshot", "retainedRecordId", "reason"]);
  const SNAPSHOT_FIELDS = new Set([
    "status",
    "sourceGeneration",
    "scope",
    "documentMetadata",
    "documents",
    "sourceDocumentIds",
    "existingAuditRecords",
    "territoryRecords",
    "structureRecords",
    "retractionRecords",
    "conflict"
  ]);
  const GENERATION_FIELDS = new Set(["generation", "manifestFile", "manifestSha256"]);
  const SCOPE_FIELDS = new Set(["seasonId", "baseMapId", "serverIds", "archived"]);
  const DOCUMENT_FIELDS = new Set(["documentId", "scope", "type", "fileName", "sha256"]);
  const SOURCE_DOCUMENT_FIELDS = new Set(["documentId", "scope", "type", "value"]);
  const SOURCE_DOCUMENT_ID_FIELDS = new Set(["strategic", "projection"]);
  const CONFLICT_FIELDS = new Set(["seasonId", "serverId", "kind", "targetKey", "recordIds", "records"]);
  const MAX_REASON_LENGTH = 1000;

  class OwnershipConflictRecoveryPlanBuilderError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipConflictRecoveryPlanBuilderError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new OwnershipConflictRecoveryPlanBuilderError(code, message);
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

  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requiredArray(value, path) {
    if (!Array.isArray(value)) fail("invalid_input", `${path} must be an array.`);
    return value;
  }

  function validateExistingAuditRecords(value, validateHistory) {
    const records = requiredArray(value, "snapshot.existingAuditRecords");
    let result;
    try { result = validateHistory(records); } catch (error) { fail("invalid_snapshot", "snapshot.existingAuditRecords validation failed."); }
    if (!isRecord(result) || result.valid !== true || !Array.isArray(result.errors)) fail("invalid_snapshot", "snapshot.existingAuditRecords is invalid.");
    return clone(records);
  }

  function isData(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) {
      if (seen.has(value)) return false;
      seen.add(value);
      const valid = value.every((entry) => isData(entry, seen));
      seen.delete(value);
      return valid;
    }
    if (!isRecord(value) || seen.has(value)) return false;
    seen.add(value);
    const valid = Object.keys(value).every((key) => isData(value[key], seen));
    seen.delete(value);
    return valid;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (!isRecord(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function validateGeneration(value) {
    rejectUnknown(value, GENERATION_FIELDS, "snapshot.sourceGeneration");
    if (!Number.isSafeInteger(value.generation) || value.generation < 0) fail("invalid_snapshot", "snapshot.sourceGeneration.generation is invalid.");
    return {
      generation: value.generation,
      manifestFile: requiredString(value.manifestFile, "snapshot.sourceGeneration.manifestFile"),
      manifestSha256: requiredString(value.manifestSha256, "snapshot.sourceGeneration.manifestSha256")
    };
  }

  function validateScope(value) {
    rejectUnknown(value, SCOPE_FIELDS, "snapshot.scope");
    const serverIds = requiredArray(value.serverIds, "snapshot.scope.serverIds").map((serverId, index) => requiredString(serverId, `snapshot.scope.serverIds[${index}]`));
    if (serverIds.length === 0 || new Set(serverIds).size !== serverIds.length) fail("invalid_snapshot", "snapshot.scope.serverIds must be unique and non-empty.");
    if (typeof value.archived !== "boolean") fail("invalid_snapshot", "snapshot.scope.archived must be boolean.");
    return { seasonId: requiredString(value.seasonId, "snapshot.scope.seasonId"), baseMapId: requiredString(value.baseMapId, "snapshot.scope.baseMapId"), serverIds, archived: value.archived };
  }

  function validateConflict(value, scope) {
    rejectUnknown(value, CONFLICT_FIELDS, "snapshot.conflict");
    if (value.seasonId !== scope.seasonId || typeof value.serverId !== "string" || !scope.serverIds.includes(value.serverId)) fail("invalid_conflict", "snapshot.conflict scope is invalid.");
    if (value.kind !== "territory" && value.kind !== "structure") fail("invalid_conflict", "snapshot.conflict.kind is invalid.");
    const recordIds = requiredArray(value.recordIds, "snapshot.conflict.recordIds").map((recordId, index) => requiredString(recordId, `snapshot.conflict.recordIds[${index}]`)).sort();
    if (recordIds.length < 2 || new Set(recordIds).size !== recordIds.length) fail("invalid_conflict", "snapshot.conflict.recordIds must contain unique terminals.");
    if (typeof value.targetKey !== "string" || value.targetKey.trim() === "") fail("invalid_conflict", "snapshot.conflict.targetKey is required.");
    const records = requiredArray(value.records, "snapshot.conflict.records");
    const recordById = new Map(records.map((record) => {
      if (!isRecord(record)) fail("invalid_conflict", "snapshot.conflict.records must contain objects.");
      const id = value.kind === "territory" ? record.ownershipRecordId : record.structureOwnershipId;
      return [id, record];
    }));
    if (records.length !== recordIds.length || recordIds.some((recordId) => !recordById.has(recordId))) fail("invalid_conflict", "snapshot.conflict records must exactly match recordIds.");
    const orderedRecords = recordIds.map((recordId) => recordById.get(recordId));
    return { seasonId: scope.seasonId, serverId: requiredString(value.serverId, "snapshot.conflict.serverId"), kind: value.kind, targetKey: value.targetKey, recordIds, records: orderedRecords };
  }

  function validateDocumentMetadata(value) {
    const metadata = requiredArray(value, "snapshot.documentMetadata");
    const documentIds = new Set();
    return metadata.map((document, index) => {
      rejectUnknown(document, DOCUMENT_FIELDS, `snapshot.documentMetadata[${index}]`);
      const normalized = {
        documentId: requiredString(document.documentId, `snapshot.documentMetadata[${index}].documentId`),
        scope: requiredString(document.scope, `snapshot.documentMetadata[${index}].scope`),
        type: requiredString(document.type, `snapshot.documentMetadata[${index}].type`),
        fileName: requiredString(document.fileName, `snapshot.documentMetadata[${index}].fileName`),
        sha256: requiredString(document.sha256, `snapshot.documentMetadata[${index}].sha256`)
      };
      if (documentIds.has(normalized.documentId)) fail("invalid_snapshot", "snapshot.documentMetadata contains duplicate document IDs.");
      documentIds.add(normalized.documentId);
      return normalized;
    });
  }

  function validateDocuments(value, metadata) {
    const documents = requiredArray(value, "snapshot.documents");
    if (documents.length !== metadata.length) fail("invalid_snapshot", "snapshot.documents must match documentMetadata count.");
    const ids = new Set();
    return documents.map((document, index) => {
      rejectUnknown(document, SOURCE_DOCUMENT_FIELDS, `snapshot.documents[${index}]`);
      if (!Object.prototype.hasOwnProperty.call(document, "value") || !isData(document.value)) fail("invalid_snapshot", `snapshot.documents[${index}].value is invalid.`);
      const documentId = requiredString(document.documentId, `snapshot.documents[${index}].documentId`);
      const scope = requiredString(document.scope, `snapshot.documents[${index}].scope`);
      const type = requiredString(document.type, `snapshot.documents[${index}].type`);
      if (ids.has(documentId)) fail("invalid_snapshot", "snapshot.documents contains duplicate document IDs.");
      ids.add(documentId);
      const expected = metadata[index];
      if (documentId !== expected.documentId || scope !== expected.scope || type !== expected.type) fail("invalid_snapshot", "snapshot.documents must match documentMetadata order and identity.");
      return { documentId, scope, type, value: clone(document.value) };
    });
  }

  function validateSourceDocumentIds(value, documents) {
    rejectUnknown(value, SOURCE_DOCUMENT_ID_FIELDS, "snapshot.sourceDocumentIds");
    const strategic = requiredString(value.strategic, "snapshot.sourceDocumentIds.strategic");
    const projection = requiredString(value.projection, "snapshot.sourceDocumentIds.projection");
    if (strategic === projection) fail("invalid_snapshot", "snapshot.sourceDocumentIds roles must differ.");
    const strategicDocuments = documents.filter((document) => document.type === "strategic-domain");
    const projectionDocuments = documents.filter((document) => document.type === "server-state");
    if (strategicDocuments.length !== 1 || projectionDocuments.length !== 1 || strategicDocuments[0].documentId !== strategic || projectionDocuments[0].documentId !== projection) fail("invalid_snapshot", "snapshot.sourceDocumentIds must identify unique strategic and projection documents.");
    return { strategic, projection };
  }

  function validateDocumentBindings(documents, sourceDocumentIds, histories, existingAuditRecords, scope, adapters) {
    const strategicDocument = documents.find((document) => document.documentId === sourceDocumentIds.strategic);
    const auditDocuments = documents.filter((document) => document.type === "application-audit");
    const projectionDocument = documents.find((document) => document.documentId === sourceDocumentIds.projection);
    if (auditDocuments.length !== 1) fail("invalid_snapshot", "snapshot.documents must include exactly one application audit.");
    const auditDocument = auditDocuments[0];
    let strategicEnvelope; let auditEnvelope; let projectionEnvelope;
    try {
      strategicEnvelope = adapters.deserializeStrategicDomainEnvelope(strategicDocument.value);
      auditEnvelope = adapters.deserializeApplicationAuditEnvelope(auditDocument.value);
      projectionEnvelope = adapters.deserializeServerState(projectionDocument.value);
    } catch (error) { fail("invalid_snapshot", "snapshot source document validation failed."); }
    if (!isRecord(strategicEnvelope) || !isRecord(strategicEnvelope.state)
        || canonical(strategicEnvelope.state.territoryOwnershipRecords) !== canonical(histories.territoryRecords)
        || canonical(strategicEnvelope.state.structureOwnershipRecords) !== canonical(histories.structureRecords)
        || canonical(strategicEnvelope.state.ownershipRetractions) !== canonical(histories.retractionRecords)) fail("invalid_snapshot", "Strategic document does not match snapshot histories.");
    if (!isRecord(auditEnvelope) || canonical(auditEnvelope.records) !== canonical(existingAuditRecords)) fail("invalid_snapshot", "Application audit document does not match snapshot audit history.");
    if (!isRecord(projectionEnvelope) || projectionEnvelope.seasonId !== scope.seasonId || projectionEnvelope.baseMapId !== scope.baseMapId) fail("invalid_snapshot", "Projection document scope does not match snapshot scope.");
  }

  function createOwnershipConflictRecoveryPlanBuilder(options = {}) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    if (typeof options.validateAuditHistory !== "function") fail("invalid_factory", "options.validateAuditHistory must be a function.");
    ["deserializeStrategicDomainEnvelope", "deserializeApplicationAuditEnvelope", "deserializeServerState"].forEach((field) => {
      if (typeof options[field] !== "function") fail("invalid_factory", `options.${field} must be a function.`);
    });
    const validateAuditHistory = options.validateAuditHistory;
    const adapters = { deserializeStrategicDomainEnvelope: options.deserializeStrategicDomainEnvelope, deserializeApplicationAuditEnvelope: options.deserializeApplicationAuditEnvelope, deserializeServerState: options.deserializeServerState };

    function build(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      if (!isRecord(input.snapshot)) fail("invalid_snapshot", "input.snapshot is required.");
      rejectUnknown(input.snapshot, SNAPSHOT_FIELDS, "input.snapshot");
      if (input.snapshot.status !== "recovery_ready") fail("recovery_not_ready", "input.snapshot must have recovery_ready status.");
      const sourceGeneration = validateGeneration(input.snapshot.sourceGeneration);
      const scope = validateScope(input.snapshot.scope);
      if (scope.archived) fail("archived_read_only", "Archived recovery snapshots are read-only.");
      const conflict = validateConflict(input.snapshot.conflict, scope);
      if (!Array.isArray(input.snapshot.territoryRecords) || !Array.isArray(input.snapshot.structureRecords) || !Array.isArray(input.snapshot.retractionRecords)) fail("invalid_snapshot", "input.snapshot histories are required.");
      const documentMetadata = validateDocumentMetadata(input.snapshot.documentMetadata);
      const documents = validateDocuments(input.snapshot.documents, documentMetadata);
      const sourceDocumentIds = validateSourceDocumentIds(input.snapshot.sourceDocumentIds, documents);
      const existingAuditRecords = validateExistingAuditRecords(input.snapshot.existingAuditRecords, validateAuditHistory);
      validateDocumentBindings(documents, sourceDocumentIds, { territoryRecords: input.snapshot.territoryRecords, structureRecords: input.snapshot.structureRecords, retractionRecords: input.snapshot.retractionRecords }, existingAuditRecords, scope, adapters);
      const history = conflict.kind === "territory" ? input.snapshot.territoryRecords : input.snapshot.structureRecords;
      const idField = conflict.kind === "territory" ? "ownershipRecordId" : "structureOwnershipId";
      const historyById = new Map(history.map((record) => [record && record[idField], record]));
      if (conflict.recordIds.some((recordId) => !historyById.has(recordId) || canonical(historyById.get(recordId)) !== canonical(conflict.records.find((record) => record[idField] === recordId)))) {
        fail("invalid_conflict", "snapshot.conflict records must match the complete ownership history.");
      }
      const retainedRecordId = requiredString(input.retainedRecordId, "input.retainedRecordId");
      if (!conflict.recordIds.includes(retainedRecordId)) fail("invalid_retained_record", "input.retainedRecordId is not in the analyzer-derived conflict.");
      if (typeof input.reason !== "string" || input.reason.trim() === "") fail("invalid_reason", "input.reason must be non-empty after trimming.");
      const reason = input.reason.trim();
      if (reason.length > MAX_REASON_LENGTH) fail("invalid_reason", `input.reason must be at most ${MAX_REASON_LENGTH} characters.`);
      const rejectedRecordIds = conflict.recordIds.filter((recordId) => recordId !== retainedRecordId).sort();
      if (rejectedRecordIds.length === 0) fail("invalid_conflict", "The recovery conflict must contain at least one rejected record.");
      const conflictFingerprint = canonical({ seasonId: conflict.seasonId, serverId: conflict.serverId, kind: conflict.kind, targetKey: conflict.targetKey, recordIds: conflict.recordIds });
      return immutable({
        status: "recovery_plan_ready",
        sourceGeneration,
        scope,
        documentMetadata,
        documents,
        sourceDocumentIds,
        existingAuditRecords,
        territoryRecords: clone(input.snapshot.territoryRecords),
        structureRecords: clone(input.snapshot.structureRecords),
        retractionRecords: clone(input.snapshot.retractionRecords),
        conflict: clone(conflict),
        retainedRecordId,
        rejectedRecordIds,
        reason,
        conflictFingerprint
      });
    }

    return Object.freeze({ build });
  }

  const exportsObject = { createOwnershipConflictRecoveryPlanBuilder, OwnershipConflictRecoveryPlanBuilderError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
