(function initializeOwnershipProvenanceMigrationPreparationCoordinator(globalScope) {
  const FACTORY_FIELDS = new Set([
    "generationStore",
    "snapshotAdapter",
    "isolatedGraphLoader",
    "migrationInputAdapter",
    "migrationDecisionService",
    "provenanceSerializer",
    "candidateDocumentBuilder",
    "clock",
    "createTransactionId"
  ]);

  class OwnershipProvenanceMigrationPreparationCoordinatorError extends Error {
    constructor(code, message, cause) { super(message); this.name = "OwnershipProvenanceMigrationPreparationCoordinatorError"; this.code = code; if (cause !== undefined) this.cause = cause; }
  }

  function fail(code, message, cause) { throw new OwnershipProvenanceMigrationPreparationCoordinatorError(code, message, cause); }
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
  function requireMethod(value, path, method) { if (!isRecord(value) || typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`); }
  function requireDate(value) { if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail("invalid_clock", "clock must return a valid Date."); return value.toISOString(); }
  function normalizeExpectedCurrent(value) {
    if (!isRecord(value)) fail("invalid_input", "input.expectedCurrent must be an object.");
    const fields = new Set(["schemaVersion", "generation", "manifestFile", "manifestSha256"]);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `input.expectedCurrent.${unknown[0]} is not supported.`);
    if (!Number.isSafeInteger(value.generation) || value.generation < 0) fail("invalid_input", "input.expectedCurrent.generation is invalid.");
    if (typeof value.manifestFile !== "string" || value.manifestFile.trim() === "" || typeof value.manifestSha256 !== "string" || value.manifestSha256.trim() === "") fail("invalid_input", "input.expectedCurrent manifest identity is invalid.");
    return { generation: value.generation, manifestFile: value.manifestFile, manifestSha256: value.manifestSha256 };
  }

  function createOwnershipProvenanceMigrationPreparationCoordinator(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    requireMethod(options.generationStore, "options.generationStore", "prepare");
    requireMethod(options.snapshotAdapter, "options.snapshotAdapter", "load");
    requireMethod(options.isolatedGraphLoader, "options.isolatedGraphLoader", "load");
    requireMethod(options.migrationInputAdapter, "options.migrationInputAdapter", "adapt");
    requireMethod(options.migrationDecisionService, "options.migrationDecisionService", "decide");
    requireMethod(options.provenanceSerializer, "options.provenanceSerializer", "serialize");
    requireMethod(options.candidateDocumentBuilder, "options.candidateDocumentBuilder", "build");
    if (typeof options.clock !== "function") fail("invalid_factory", "options.clock must be a function.");
    if (typeof options.createTransactionId !== "function") fail("invalid_factory", "options.createTransactionId must be a function.");

    async function prepare(input) {
      rejectUnknown(input, new Set(["expectedCurrent"]), "input");
      const expectedCurrent = normalizeExpectedCurrent(input.expectedCurrent);
      let snapshot;
      try {
        snapshot = await options.snapshotAdapter.load({ expectedCurrent });
        const graph = await options.isolatedGraphLoader.load({ documents: snapshot.documents });
        const migrationInput = await options.migrationInputAdapter.adapt({ snapshot: graph, sourceDocumentIds: snapshot.sourceDocumentIds });
        const decision = await options.migrationDecisionService.decide(migrationInput);
        if (!isRecord(decision) || typeof decision.decision !== "string") return freeze({ status: "refused", reason: "invalid_decision" });
        if (decision.decision === "already_proven") return freeze({ status: "already_proven", expectedCurrent });
        if (decision.decision !== "migration_eligible") return freeze({ status: "refused", reason: decision.decision, serverReasons: clone(decision.serverReasons || []) });
        if (!Array.isArray(decision.candidateProvenanceRecords)) return freeze({ status: "refused", reason: "invalid_eligible_decision" });
        const provenanceDocument = options.provenanceSerializer.serialize({
          seasonId: migrationInput.activeSeason.seasonId,
          baseMapId: migrationInput.activeSeason.baseMapId,
          activeSeasonId: migrationInput.activeSeason.seasonId,
          records: decision.candidateProvenanceRecords
        });
        const candidateDocuments = options.candidateDocumentBuilder.build({ snapshot, provenanceDocument });
        const transactionId = options.createTransactionId();
        if (typeof transactionId !== "string" || transactionId.trim() === "") fail("invalid_transaction_id", "createTransactionId must return a non-empty string.");
        const createdAt = requireDate(options.clock());
        const prepared = await options.generationStore.prepare({ expectedCurrent, transactionId, createdAt, documents: candidateDocuments.documents });
        return freeze(clone({ status: "prepared", decision: "migration_eligible", expectedCurrent, transactionId, createdAt, candidate: prepared.candidate, serverReasons: decision.serverReasons || [] }));
      } catch (error) {
        if (error instanceof OwnershipProvenanceMigrationPreparationCoordinatorError) throw error;
        fail("preparation_failed", "Ownership provenance migration preparation failed.", error);
      }
    }

    return Object.freeze({ prepare });
  }

  const exportsObject = { createOwnershipProvenanceMigrationPreparationCoordinator, OwnershipProvenanceMigrationPreparationCoordinatorError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
