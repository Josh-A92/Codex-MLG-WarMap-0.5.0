(function initializeApplicationPersistenceCoordinatorFactory(globalScope) {
  const FIELDS = new Set([
    "generationStore",
    "mutationCoordinator",
    "legacyStateClassifier",
    "serializeDocuments",
    "deserializeDocuments",
    "applyState",
    "clock",
    "createTransactionId"
  ]);
  const OPTIONAL_FIELDS = new Set(["ownershipProjectionReplacementCoordinator", "legacyWrite", "seasonAdministrationService"]);
  const REPAIR_INPUT_FIELDS = new Set(["seasonId", "serverId"]);

  class ApplicationPersistenceCoordinatorError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "ApplicationPersistenceCoordinatorError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new ApplicationPersistenceCoordinatorError(code, message, cause);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function exact(value, fields) {
    if (!isRecord(value)) fail("invalid_factory", "options must be a plain object.");
    const allowedFields = new Set([...fields, ...OPTIONAL_FIELDS]);
    const unknown = Object.keys(value).filter((field) => !allowedFields.has(field)).sort();
    if (unknown.length) fail("invalid_factory", `Unsupported option '${unknown[0]}'.`);
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) fail("invalid_factory", `Missing option '${field}'.`);
    });
    return value;
  }

  function requireFunction(value, path) {
    if (typeof value !== "function") fail("invalid_factory", `${path} must be a function.`);
    return value;
  }

  function createApplicationPersistenceCoordinator(options) {
    const input = exact(options, FIELDS);
    const generationStore = input.generationStore;
    if (!isRecord(generationStore)) fail("invalid_factory", "generationStore must be an object.");
    const loadGeneration = requireFunction(generationStore.loadCommittedGeneration, "generationStore.loadCommittedGeneration").bind(generationStore);
    const commitGeneration = requireFunction(generationStore.runGenerationWrite || generationStore.commit, "generationStore.runGenerationWrite").bind(generationStore);
    const legacyWrite = input.legacyWrite || null;
    const mutation = requireFunction(input.mutationCoordinator.execute, "mutationCoordinator.execute").bind(input.mutationCoordinator);
    const classifyLegacy = requireFunction(input.legacyStateClassifier.classify, "legacyStateClassifier.classify").bind(input.legacyStateClassifier);
    const serializeDocuments = requireFunction(input.serializeDocuments, "serializeDocuments");
    const deserializeDocuments = requireFunction(input.deserializeDocuments, "deserializeDocuments");
    const applyState = requireFunction(input.applyState, "applyState");
    const clock = requireFunction(input.clock, "clock");
    const createTransactionId = requireFunction(input.createTransactionId, "createTransactionId");
    const replacementCoordinator = input.ownershipProjectionReplacementCoordinator || null;
    const seasonAdministration = input.seasonAdministrationService || null;
    let expectedGeneration = null;

    async function load(inputValue) {
      const current = await loadGeneration();
      if (current.status === "committed") {
        expectedGeneration = current.manifest.generation;
        let state;
        try {
          state = await deserializeDocuments(current.documents);
        } catch (_error) {
          return { status: "recovery_required", reason: "generation_document_invalid" };
        }
        await mutation(() => applyState(state), async () => {});
        return { status: "committed", generation: expectedGeneration, source: current.source, state };
      }
      if (current.status !== "missing") return { status: "recovery_required", reason: current.errorCode || "invalid_generation" };
      const legacy = inputValue && inputValue.trustedClassification
        ? inputValue.trustedClassification
        : classifyLegacy(inputValue);
      if (legacy.status !== "aligned" && legacy.status !== "rebuildable_projection" && legacy.status !== "first_run") {
        return { status: legacy.status, reason: legacy.reason };
      }
      expectedGeneration = 0;
      let legacyDocuments = inputValue.legacyDocuments;
      if (legacy.status === "rebuildable_projection" && legacy.projection && Array.isArray(legacyDocuments)) {
        legacyDocuments = legacyDocuments.map((document) => {
          if (document.documentId !== "projection") return document;
          return {
            ...document,
            value: {
              ...document.value,
              servers: document.value.servers.map((server) => ({
                ...server,
                ownership: legacy.projection[server.id] || {}
              }))
            }
          };
        });
      }
      const state = legacy.status === "first_run" ? null : await deserializeDocuments(legacyDocuments);
      if (state !== null) await mutation(() => applyState(state), async () => {});
      return { status: legacy.status, generation: 0, state };
    }

    async function commitCurrent() {
      const generation = expectedGeneration === null ? 0 : expectedGeneration;
      const createdAt = clock();
      const documents = await serializeDocuments();
      if (generation === 0 && typeof legacyWrite === "function") {
        await legacyWrite(documents);
        return { status: "legacy_saved", generation: 0 };
      }
      const result = await commitGeneration({
        expectedGeneration: generation,
        transactionId: createTransactionId(),
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
        documents
      });
      expectedGeneration = result.generation;
      return result;
    }

    async function execute(mutate, auditIntent) {
      if (seasonAdministration && typeof seasonAdministration.assertOperationalMutationAllowed === "function") {
        seasonAdministration.assertOperationalMutationAllowed();
      }
      return mutation(mutate, async () => commitCurrent(), auditIntent);
    }

    function executeLifecycle(mutate, auditIntent) {
      return mutation(mutate, async () => commitCurrent(), auditIntent);
    }

    async function repairOwnershipProjection(repairInput) {
      if (!replacementCoordinator || typeof replacementCoordinator.replace !== "function") {
        return { status: "recovery_required", reason: "projection_repair_unavailable" };
      }
      if (!isRecord(repairInput)) return { status: "recovery_required", reason: "invalid_input" };
      const unknown = Object.keys(repairInput).filter((field) => !REPAIR_INPUT_FIELDS.has(field)).sort();
      if (unknown.length > 0) return { status: "recovery_required", reason: "invalid_input" };
      if (typeof repairInput.seasonId !== "string" || repairInput.seasonId.trim() === ""
          || typeof repairInput.serverId !== "string" || repairInput.serverId.trim() === "") {
        return { status: "recovery_required", reason: "invalid_input" };
      }
      let documents;
      try {
        documents = await serializeDocuments();
      } catch (_error) {
        return { status: "recovery_required", reason: "projection_snapshot_failed" };
      }
      if (!Array.isArray(documents)) return { status: "recovery_required", reason: "projection_snapshot_invalid" };
      const projectionDocuments = documents.filter((document) => isRecord(document) && document.type === "server-state");
      if (projectionDocuments.length !== 1 || !Object.prototype.hasOwnProperty.call(projectionDocuments[0], "value")) {
        return { status: "recovery_required", reason: "projection_snapshot_invalid" };
      }
      return replacementCoordinator.replace(
        { ...repairInput, persistedProjection: projectionDocuments[0].value },
        async () => commitCurrent()
      );
    }

    return Object.freeze({ load, commitCurrent, execute, executeLifecycle, repairOwnershipProjection });
  }

  const exportsObject = { createApplicationPersistenceCoordinator, ApplicationPersistenceCoordinatorError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
