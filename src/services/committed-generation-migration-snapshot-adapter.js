(function initializeCommittedGenerationMigrationSnapshotAdapter(globalScope) {
  const FACTORY_FIELDS = new Set(["generationStore", "seasonId", "baseMapId"]);
  const INPUT_FIELDS = new Set(["expectedCurrent"]);
  const EXPECTED_CURRENT_FIELDS = new Set(["generation", "manifestFile", "manifestSha256"]);

  class CommittedGenerationMigrationSnapshotAdapterError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "CommittedGenerationMigrationSnapshotAdapterError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new CommittedGenerationMigrationSnapshotAdapterError(code, message);
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
    Object.keys(value).forEach((key) => Object.defineProperty(output, key, {
      value: clone(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    }));
    return output;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function requireGeneration(value, path) {
    if (!Number.isSafeInteger(value) || value < 0) fail("invalid_input", `${path} must be a non-negative safe integer.`);
    return value;
  }

  function rejectUnknown(value, fields, path, code = "invalid_input") {
    if (!isRecord(value)) fail(code, `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail(code, `${path}.${unknown[0]} is not supported.`);
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (!isRecord(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function normalizeExpectedCurrent(value) {
    rejectUnknown(value, EXPECTED_CURRENT_FIELDS, "input.expectedCurrent");
    return {
      generation: requireGeneration(value.generation, "input.expectedCurrent.generation"),
      manifestFile: requireString(value.manifestFile, "input.expectedCurrent.manifestFile"),
      manifestSha256: requireString(value.manifestSha256, "input.expectedCurrent.manifestSha256")
    };
  }

  function normalizeManifestDocument(document, index) {
    if (!isRecord(document)) fail("invalid_generation", `manifest.documents[${index}] must be a plain object.`);
    rejectUnknown(document, new Set(["documentId", "scope", "type", "fileName", "sha256"]), `manifest.documents[${index}]`, "invalid_generation");
    return {
      documentId: requireString(document.documentId, `manifest.documents[${index}].documentId`),
      scope: requireString(document.scope, `manifest.documents[${index}].scope`),
      type: requireString(document.type, `manifest.documents[${index}].type`),
      fileName: requireString(document.fileName, `manifest.documents[${index}].fileName`),
      sha256: requireString(document.sha256, `manifest.documents[${index}].sha256`)
    };
  }

  function createCommittedGenerationMigrationSnapshotAdapter(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options", "invalid_factory");
    if (!isRecord(options.generationStore) || typeof options.generationStore.loadCommittedGeneration !== "function") {
      fail("invalid_factory", "options.generationStore.loadCommittedGeneration must be a function.");
    }
    const loadCommittedGeneration = options.generationStore.loadCommittedGeneration.bind(options.generationStore);
    const seasonId = requireString(options.seasonId, "options.seasonId");
    const baseMapId = requireString(options.baseMapId, "options.baseMapId");
    const expectedProjectionScope = `${seasonId}/${baseMapId}`;

    async function load(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      const expectedCurrent = normalizeExpectedCurrent(input.expectedCurrent);
      const loaded = await loadCommittedGeneration();
      if (!isRecord(loaded) || loaded.status !== "committed") fail("committed_generation_unavailable", "A committed generation is required.");
      if (loaded.source !== "current" || Object.prototype.hasOwnProperty.call(loaded, "recovery")) {
        fail("committed_generation_ambiguous", "The committed generation is fallback or recovery-sourced.");
      }
      if (!isRecord(loaded.pointer) || !isRecord(loaded.manifest) || !Array.isArray(loaded.manifest.documents) || !Array.isArray(loaded.documents)) {
        fail("invalid_generation", "The committed generation result is incomplete.");
      }
      const actualCurrent = {
        generation: loaded.pointer.generation,
        manifestFile: loaded.pointer.manifestFile,
        manifestSha256: loaded.pointer.manifestSha256
      };
      if (canonical(actualCurrent) !== canonical(expectedCurrent)) fail("stale_generation", "The committed generation does not match expectedCurrent.");
      if (loaded.manifest.generation !== actualCurrent.generation
          || loaded.manifest.documents.length !== loaded.documents.length) {
        fail("invalid_generation", "The committed generation manifest is inconsistent with its documents.");
      }

      const manifestDocuments = loaded.manifest.documents.map(normalizeManifestDocument);
      const documentIds = new Set();
      manifestDocuments.forEach((document) => {
        if (documentIds.has(document.documentId)) fail("duplicate_document_id", `Duplicate manifest document '${document.documentId}'.`);
        documentIds.add(document.documentId);
      });
      const strategicDocuments = manifestDocuments.filter((document) => document.type === "strategic-domain");
      const projectionDocuments = manifestDocuments.filter((document) => document.type === "server-state");
      if (strategicDocuments.length === 0) fail("missing_strategic_document", "The committed generation has no strategic-domain document.");
      if (strategicDocuments.length > 1) fail("duplicate_strategic_document", "The committed generation has multiple strategic-domain documents.");
      if (projectionDocuments.length === 0) fail("missing_projection_document", "The committed generation has no server-state projection document.");
      if (projectionDocuments.length > 1) fail("duplicate_projection_document", "The committed generation has multiple server-state projection documents.");
      const strategic = strategicDocuments[0];
      const projection = projectionDocuments[0];
      if (strategic.scope !== seasonId) fail("strategic_scope_mismatch", "The strategic-domain document scope does not match the configured season.");
      if (projection.scope !== expectedProjectionScope) fail("projection_scope_mismatch", "The projection document scope does not match the configured season and base map.");

      const loadedById = new Map(loaded.documents.map((document, index) => {
        if (!isRecord(document) || document.documentId !== manifestDocuments[index].documentId) fail("invalid_generation", "Loaded documents do not match manifest ordering or identity.");
        return [document.documentId, document];
      }));
      const referenceDocuments = manifestDocuments.map((document) => ({
        documentId: document.documentId,
        scope: document.scope,
        type: document.type,
        reference: { fileName: document.fileName, sha256: document.sha256 }
      }));
      return clone({
        status: "loaded",
        expectedCurrent,
        generation: actualCurrent.generation,
        manifest: loaded.manifest,
        documents: Array.from(loadedById.values()),
        sourceDocumentIds: { strategic: strategic.documentId, projection: projection.documentId },
        referenceDocuments
      });
    }

    return Object.freeze({ load });
  }

  const exportsObject = {
    createCommittedGenerationMigrationSnapshotAdapter,
    CommittedGenerationMigrationSnapshotAdapterError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));