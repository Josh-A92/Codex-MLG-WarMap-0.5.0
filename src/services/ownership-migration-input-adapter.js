(function initializeOwnershipMigrationInputAdapter(globalScope) {
  const FACTORY_FIELDS = new Set(["resolveSeasonPackage", "createTargetCatalog"]);
  const INPUT_FIELDS = new Set(["snapshot", "sourceDocumentIds"]);
  const SOURCE_FIELDS = new Set(["strategic", "projection"]);

  class OwnershipMigrationInputAdapterError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "OwnershipMigrationInputAdapterError";
      this.code = code;
    }
  }

  function fail(code, message) { throw new OwnershipMigrationInputAdapterError(code, message); }
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
  function requireArray(value, path) { if (!Array.isArray(value)) fail("missing_state", `${path} must be an array.`); return value; }

  function createOwnershipMigrationInputAdapter(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    if (typeof options.resolveSeasonPackage !== "function") fail("invalid_factory", "options.resolveSeasonPackage must be a function.");
    if (typeof options.createTargetCatalog !== "function") fail("invalid_factory", "options.createTargetCatalog must be a function.");

    async function adapt(input) {
      rejectUnknown(input, INPUT_FIELDS, "input");
      if (!isRecord(input.snapshot) || input.snapshot.status !== "loaded" || !isRecord(input.snapshot.state)) fail("invalid_snapshot", "input.snapshot must be a loaded isolated graph snapshot.");
      rejectUnknown(input.sourceDocumentIds, SOURCE_FIELDS, "input.sourceDocumentIds");
      const sourceDocumentIds = { strategic: requireString(input.sourceDocumentIds.strategic, "input.sourceDocumentIds.strategic"), projection: requireString(input.sourceDocumentIds.projection, "input.sourceDocumentIds.projection") };
      if (sourceDocumentIds.strategic === sourceDocumentIds.projection) fail("invalid_source_documents", "Strategic and projection source document IDs must differ.");
      const state = input.snapshot.state;
      if (!isRecord(state.seasonAdministration) || !isRecord(state.seasonAdministration.activeSeason)) fail("active_season_unavailable", "Restored season administration has no active season.");
      const activeSeason = state.seasonAdministration.activeSeason;
      const seasonId = requireString(activeSeason.seasonId, "activeSeason.seasonId");
      const serverIds = requireArray(activeSeason.serverIds, "activeSeason.serverIds").map((id, index) => requireString(id, `activeSeason.serverIds[${index}]`));
      if (serverIds.length === 0 || new Set(serverIds).size !== serverIds.length) fail("invalid_active_servers", "Active season servers must be non-empty and unique.");
      const preparedPackage = await options.resolveSeasonPackage(seasonId);
      if (!isRecord(preparedPackage) || !isRecord(preparedPackage.packageIdentity) || !isRecord(preparedPackage.rulesDefinition)) fail("season_package_unavailable", `No prepared package resolves active season '${seasonId}'.`);
      if (preparedPackage.packageIdentity.seasonId !== seasonId) fail("season_scope_mismatch", "Prepared package season does not match active season.");
      const mapDefinition = preparedPackage.rulesDefinition.mapDefinition;
      if (!isRecord(mapDefinition)) fail("season_package_invalid", "Prepared package has no map definition.");
      const baseMapId = requireString(mapDefinition.baseMapId, "preparedPackage.rulesDefinition.mapDefinition.baseMapId");
      const serverState = state.serverState;
      if (!isRecord(serverState)) fail("missing_state", "Restored server state is required.");
      const serverStateDocument = state.serverStateDocument;
      if (!isRecord(serverStateDocument) || serverStateDocument.schemaVersion !== 1 || typeof serverStateDocument.savedAt !== "string" || serverStateDocument.seasonId !== seasonId || serverStateDocument.baseMapId !== baseMapId || !Array.isArray(serverStateDocument.servers)) fail("missing_state", "Restored server-state document metadata is required.");
      const projectionServers = Object.keys(serverState);
      serverIds.forEach((serverId) => { if (!Object.prototype.hasOwnProperty.call(serverState, serverId)) fail("server_scope_mismatch", `Active server '${serverId}' is missing from restored projection state.`); });
      const unionRegistry = requireArray(state.unionRegistry, "state.unionRegistry");
      const unionIds = new Set(unionRegistry.map((identity) => { if (!isRecord(identity)) fail("unresolved_union", "Restored union registry contains an invalid identity."); return requireString(identity.unionId, "state.unionRegistry.unionId"); }));
      const strategic = state.strategicDomain;
      if (!isRecord(strategic)) fail("missing_state", "Restored strategic domain state is required.");
      const history = state.strategicDomain.ownershipRecordService;
      if (!isRecord(history)) fail("missing_state", "Restored ownership history is required.");
      const territoryHistory = history.territoryRecords;
      const structureHistory = history.structureRecords;
      if (!Array.isArray(territoryHistory) || !Array.isArray(structureHistory)) fail("missing_state", "Restored ownership history is incomplete.");
      [...territoryHistory, ...structureHistory].forEach((record) => {
        if (!isRecord(record)) fail("invalid_history", "Ownership history contains an invalid record.");
        if (record.seasonId !== seasonId || !serverIds.includes(record.serverId)) fail("history_scope_mismatch", "Ownership history is outside the active season/server scope.");
        if (record.ownerUnionId !== null && record.ownerUnionId !== undefined && !unionIds.has(record.ownerUnionId)) fail("unresolved_union", `Ownership history references unknown union '${record.ownerUnionId}'.`);
      });
      Object.values(serverState).forEach((ownership) => {
        if (!isRecord(ownership)) fail("invalid_projection", "Restored projection contains invalid server state.");
        Object.values(ownership).forEach((ownerUnionId) => { if (ownerUnionId !== null && !unionIds.has(ownerUnionId)) fail("unresolved_union", `Projection references unknown union '${ownerUnionId}'.`); });
      });
      const documentServers = new Map(serverStateDocument.servers.map((server) => [server.id, server]));
      if (documentServers.size !== serverStateDocument.servers.length) fail("invalid_projection", "Restored server-state document contains duplicate servers.");
      if (documentServers.size !== projectionServers.length || projectionServers.some((serverId) => !documentServers.has(serverId))) fail("server_scope_mismatch", "Restored server-state metadata does not match the isolated projection.");
      const targetCatalog = await options.createTargetCatalog(preparedPackage);
      if (!isRecord(targetCatalog)) fail("invalid_target_catalog", "Target catalog factory returned an invalid catalog.");
      const provenanceState = state.ownershipHistoryProvenance;
      if (!isRecord(provenanceState) || !["unknown_provenance", "present"].includes(provenanceState.status)) fail("missing_state", "Restored provenance state is required.");
      return freeze(clone({
        activeSeason: { seasonId, baseMapId, serverIds: serverIds.slice() },
        territoryRecords: territoryHistory,
        structureRecords: structureHistory,
        targetCatalog,
        persistedProjection: { schemaVersion: serverStateDocument.schemaVersion, seasonId, baseMapId, savedAt: serverStateDocument.savedAt, servers: serverStateDocument.servers.map((server) => ({ ...clone(server), ownership: clone(serverState[server.id]) })) },
        provenanceState,
        sourceDocumentIds,
        sourceKind: input.snapshot.sourceKind || "existing_generation"
      }));
    }
    return Object.freeze({ adapt });
  }

  const exportsObject = { createOwnershipMigrationInputAdapter, OwnershipMigrationInputAdapterError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
