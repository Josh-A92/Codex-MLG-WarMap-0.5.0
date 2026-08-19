(function initializeOwnershipProvenanceCandidateDocumentBuilder(globalScope) {
  const FACTORY_FIELDS = new Set();
  const INPUT_FIELDS = new Set(["snapshot", "provenanceDocument"]);
  const MANIFEST_DOCUMENT_FIELDS = new Set(["documentId", "scope", "type", "fileName", "sha256"]);
  const PROVENANCE_DOCUMENT_TYPE = "ownership-history-provenance";

  class OwnershipProvenanceCandidateDocumentBuilderError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipProvenanceCandidateDocumentBuilderError";
      this.code = code;
    }
  }

  function fail(code, message) { throw new OwnershipProvenanceCandidateDocumentBuilderError(code, message); }
  function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, { value: clone(value[key]), enumerable: true, configurable: true, writable: true }));
    return output;
  }
  function freeze(value) { if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value; Object.keys(value).forEach((key) => freeze(value[key])); return Object.freeze(value); }
  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }
  function requireString(value, path) { if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`); return value; }
  function normalizeManifestDocument(value, index) {
    if (!isRecord(value)) fail("invalid_snapshot", `snapshot.manifest.documents[${index}] must be an object.`);
    rejectUnknown(value, MANIFEST_DOCUMENT_FIELDS, `snapshot.manifest.documents[${index}]`);
    return { documentId: requireString(value.documentId, `snapshot.manifest.documents[${index}].documentId`), scope: requireString(value.scope, `snapshot.manifest.documents[${index}].scope`), type: requireString(value.type, `snapshot.manifest.documents[${index}].type`), fileName: requireString(value.fileName, `snapshot.manifest.documents[${index}].fileName`), sha256: requireString(value.sha256, `snapshot.manifest.documents[${index}].sha256`) };
  }

  function createOwnershipProvenanceCandidateDocumentBuilder(options = {}) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    function build(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      if (!isRecord(input.snapshot) || input.snapshot.status !== "loaded" || !isRecord(input.snapshot.manifest) || !Array.isArray(input.snapshot.manifest.documents)) fail("invalid_snapshot", "input.snapshot must be a loaded snapshot-adapter result.");
      const manifestDocuments = input.snapshot.manifest.documents.map(normalizeManifestDocument);
      const ids = new Set();
      manifestDocuments.forEach((document) => { if (ids.has(document.documentId)) fail("duplicate_document_id", `Duplicate committed document '${document.documentId}'.`); ids.add(document.documentId); });
      const strategic = manifestDocuments.filter((document) => document.type === "strategic-domain");
      const projections = manifestDocuments.filter((document) => document.type === "server-state");
      if (strategic.length !== 1 || projections.length !== 1) fail("invalid_snapshot", "Snapshot must contain exactly one strategic and projection document.");
      const seasonId = strategic[0].scope;
      const projectionScope = projections[0].scope;
      const separator = projectionScope.indexOf("/");
      if (separator <= 0 || separator === projectionScope.length - 1 || projectionScope.indexOf("/", separator + 1) !== -1) fail("invalid_snapshot", "Projection scope must identify season and base map.");
      const projectionSeasonId = projectionScope.slice(0, separator);
      const baseMapId = projectionScope.slice(separator + 1);
      if (projectionSeasonId !== seasonId) fail("scope_mismatch", "Strategic and projection scopes identify different seasons.");
      const provenanceId = `ownership-provenance:${seasonId}:${baseMapId}`;
      const existing = manifestDocuments.filter((document) => document.type === PROVENANCE_DOCUMENT_TYPE || document.documentId === provenanceId);
      if (existing.length > 1) fail("duplicate_provenance_document", "Committed generation contains multiple provenance documents.");
      if (!isRecord(input.provenanceDocument)) fail("invalid_provenance_document", "provenanceDocument must be an object.");
      const provenance = input.provenanceDocument;
      if (provenance.documentId !== provenanceId || provenance.documentType !== PROVENANCE_DOCUMENT_TYPE || provenance.seasonId !== seasonId || provenance.baseMapId !== baseMapId) fail("provenance_scope_mismatch", "Provenance document ID, type, season, or base-map scope does not match the committed generation.");
      if (!Array.isArray(provenance.records)) fail("invalid_provenance_document", "provenanceDocument.records must be an array.");
      const sourceById = new Map((Array.isArray(input.snapshot.documents) ? input.snapshot.documents : []).map((document) => [document.documentId, document]));
      const documents = manifestDocuments.map((document) => document.type === PROVENANCE_DOCUMENT_TYPE || document.documentId === provenanceId
        ? { documentId: provenanceId, scope: projectionScope, type: PROVENANCE_DOCUMENT_TYPE, value: clone(provenance) }
        : input.snapshot.sourceKind === "legacy_migration"
          ? { documentId: document.documentId, scope: document.scope, type: document.type, value: clone(sourceById.get(document.documentId) && sourceById.get(document.documentId).value) }
          : { documentId: document.documentId, scope: document.scope, type: document.type, reference: { fileName: document.fileName, sha256: document.sha256 } });
      if (existing.length === 0) documents.push({ documentId: provenanceId, scope: projectionScope, type: PROVENANCE_DOCUMENT_TYPE, value: clone(provenance) });
      if (documents.filter((document) => document.documentId === provenanceId).length !== 1) fail("duplicate_provenance_document", "Candidate must contain exactly one provenance document.");
      return freeze(clone({ documents }));
    }
    return Object.freeze({ build });
  }

  const exportsObject = { createOwnershipProvenanceCandidateDocumentBuilder, OwnershipProvenanceCandidateDocumentBuilderError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
