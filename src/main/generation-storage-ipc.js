const MAX_DOCUMENTS = 128;
const MAX_DOCUMENT_ID_LENGTH = 256;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

class GenerationStorageIpcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GenerationStorageIpcError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GenerationStorageIpcError("invalid_payload", `${path} must be a non-empty string.`);
  }
  if (value.length > MAX_DOCUMENT_ID_LENGTH) {
    throw new GenerationStorageIpcError("invalid_payload", `${path} is too long.`);
  }
  return value;
}

function validateCommitPayload(value) {
  if (!isRecord(value)) throw new GenerationStorageIpcError("invalid_payload", "commit payload must be an object.");
  if (!Number.isSafeInteger(value.expectedGeneration) || value.expectedGeneration < 0) {
    throw new GenerationStorageIpcError("invalid_payload", "expectedGeneration must be a non-negative safe integer.");
  }
  requireString(value.transactionId, "transactionId");
  requireString(value.createdAt, "createdAt");
  if (!Array.isArray(value.documents) || value.documents.length === 0 || value.documents.length > MAX_DOCUMENTS) {
    throw new GenerationStorageIpcError("invalid_payload", `documents must contain 1-${MAX_DOCUMENTS} entries.`);
  }
  const ids = new Set();
  let totalBytes = 0;
  value.documents.forEach((document, index) => {
    if (!isRecord(document)) throw new GenerationStorageIpcError("invalid_payload", `documents[${index}] must be an object.`);
    const allowedFields = new Set(["documentId", "scope", "type", "value", "reference"]);
    Object.keys(document).forEach((field) => {
      if (!allowedFields.has(field)) throw new GenerationStorageIpcError("invalid_payload", `documents[${index}].${field} is not supported.`);
    });
    const documentId = requireString(document.documentId, `documents[${index}].documentId`);
    requireString(document.scope, `documents[${index}].scope`);
    requireString(document.type, `documents[${index}].type`);
    if (ids.has(documentId)) throw new GenerationStorageIpcError("invalid_payload", `documents[${index}].documentId is duplicated.`);
    ids.add(documentId);
    const hasValue = Object.prototype.hasOwnProperty.call(document, "value");
    const hasReference = Object.prototype.hasOwnProperty.call(document, "reference");
    if (hasValue === hasReference) {
      throw new GenerationStorageIpcError("invalid_payload", `documents[${index}] requires exactly one of value or reference.`);
    }
    const bytes = Buffer.byteLength(JSON.stringify(document), "utf8");
    if (bytes > MAX_DOCUMENT_BYTES) throw new GenerationStorageIpcError("payload_too_large", `documents[${index}] exceeds the document limit.`);
    totalBytes += bytes;
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new GenerationStorageIpcError("payload_too_large", "commit payload exceeds the total document limit.");
  return value;
}

function safeError(error) {
  return {
    code: error && typeof error.code === "string" ? error.code : "generation_store_error",
    message: error && typeof error.message === "string" ? error.message : String(error)
  };
}

function createGenerationStorageHandlers(generationStore) {
  if (!generationStore || typeof generationStore.loadCommittedGeneration !== "function"
      || (typeof generationStore.runGenerationWrite !== "function" && typeof generationStore.commit !== "function")) {
    throw new TypeError("generationStore must expose loadCommittedGeneration and runGenerationWrite.");
  }
  return {
    async loadCommittedGeneration() {
      try {
        return { ok: true, result: await generationStore.loadCommittedGeneration() };
      } catch (error) {
        return { ok: false, error: safeError(error) };
      }
    },
    async commitGeneration(payload) {
      try {
        validateCommitPayload(payload);
        const write = generationStore.runGenerationWrite || generationStore.commit;
        return { ok: true, result: await write.call(generationStore, payload) };
      } catch (error) {
        return { ok: false, error: safeError(error) };
      }
    }
  };
}

module.exports = {
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  MAX_TOTAL_BYTES,
  GenerationStorageIpcError,
  validateCommitPayload,
  createGenerationStorageHandlers
};
