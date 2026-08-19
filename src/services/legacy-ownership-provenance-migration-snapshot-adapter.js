(function initializeLegacyOwnershipProvenanceMigrationSnapshotAdapter(globalScope) {
  const FACTORY_FIELDS = new Set(["legacyInput"]);
  const INPUT_FIELDS = new Set(["expectedCurrent"]);

  class LegacyOwnershipProvenanceMigrationSnapshotAdapterError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "LegacyOwnershipProvenanceMigrationSnapshotAdapterError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new LegacyOwnershipProvenanceMigrationSnapshotAdapterError(code, message);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return structuredClone(value);
  }

  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be a non-empty string.`);
    return value;
  }

  function document(documentId, scope, type, value) {
    return { documentId, scope, type, value: clone(value) };
  }

  function manifestDocument(documentValue, index) {
    return {
      documentId: documentValue.documentId,
      scope: documentValue.scope,
      type: documentValue.type,
      fileName: `legacy-source-${index}.json`,
      sha256: `legacy-source:${index}`
    };
  }

  function createLegacyOwnershipProvenanceMigrationSnapshotAdapter(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    const input = options.legacyInput;
    if (!isRecord(input)) fail("invalid_factory", "options.legacyInput must be a plain object.");
    if (!isRecord(input.classification) || input.classification.status !== "rebuildable_projection") fail("invalid_factory", "options.legacyInput must be rebuildable_projection.");

    async function load(request) {
      rejectUnknown(request, INPUT_FIELDS, "input");
      if (request.expectedCurrent !== null) fail("stale_generation", "Legacy adoption requires an empty generation head.");
      const seasonId = requireString(input.seasonId, "legacyInput.seasonId");
      const baseMapId = requireString(input.baseMapId, "legacyInput.baseMapId");
      const data = input.dataManagementEnvelope;
      const projection = input.serverStateEnvelope;
      const administration = input.seasonAdministrationEnvelope;
      if (!isRecord(data) || !isRecord(projection) || !isRecord(administration)) fail("legacy_input_incomplete", "Legacy adoption requires data management, server state, and season administration envelopes.");
      if (!isRecord(input.classification.projection)) fail("legacy_projection_unavailable", "Legacy adoption requires the trusted rebuilt projection.");
      const servers = Array.isArray(projection.servers) ? projection.servers.map((server) => ({
        ...clone(server),
        ownership: clone(input.classification.projection[server.id] || {})
      })) : null;
      if (!servers) fail("legacy_projection_invalid", "Legacy server state must contain servers.");
      const documents = [
        document("union-registry-global", "global", "union-registry", data.unionRegistry),
        document(`strategic-${seasonId}`, seasonId, "strategic-domain", data.strategicDomain),
        document(`evidence-${seasonId}`, seasonId, "evidence-domain", data.evidenceDomain),
        document(`projection-${seasonId}-${baseMapId}`, `${seasonId}/${baseMapId}`, "server-state", { ...clone(projection), servers }),
        document("season-administration", "global", "season-administration", administration),
        document("application-audit-global", "global", "application-audit", input.applicationAuditEnvelope || { schemaVersion: 1, records: [] })
      ];
      return clone({
        status: "loaded",
        expectedCurrent: null,
        generation: 0,
        sourceKind: "legacy_migration",
        manifest: {
          schemaVersion: 1,
          generation: 0,
          transactionId: "legacy-migration-source",
          createdAt: data.savedAt,
          documents: documents.map(manifestDocument)
        },
        documents,
        sourceDocumentIds: {
          strategic: `strategic-${seasonId}`,
          projection: `projection-${seasonId}-${baseMapId}`
        },
        referenceDocuments: []
      });
    }

    return Object.freeze({ load });
  }

  const exportsObject = {
    createLegacyOwnershipProvenanceMigrationSnapshotAdapter,
    LegacyOwnershipProvenanceMigrationSnapshotAdapterError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
