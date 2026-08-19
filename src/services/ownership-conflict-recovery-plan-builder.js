(function initializeOwnershipConflictRecoveryPlanBuilder(globalScope) {
  const FACTORY_FIELDS = new Set();
  const INPUT_FIELDS = new Set(["snapshot", "retainedRecordId", "reason"]);
  const SNAPSHOT_FIELDS = new Set([
    "status",
    "sourceGeneration",
    "scope",
    "documentMetadata",
    "territoryRecords",
    "structureRecords",
    "retractionRecords",
    "conflict"
  ]);
  const GENERATION_FIELDS = new Set(["generation", "manifestFile", "manifestSha256"]);
  const SCOPE_FIELDS = new Set(["seasonId", "baseMapId", "serverIds", "archived"]);
  const DOCUMENT_FIELDS = new Set(["documentId", "scope", "type", "fileName", "sha256"]);
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

  function createOwnershipConflictRecoveryPlanBuilder(options = {}) {
    rejectUnknown(options, FACTORY_FIELDS, "options");

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
