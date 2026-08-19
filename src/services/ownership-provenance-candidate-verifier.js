(function initializeOwnershipProvenanceCandidateVerifier(globalScope) {
  const FACTORY_FIELDS = new Set([
    "isolatedGraphLoader",
    "resolveSeasonPackage",
    "createTargetCatalog",
    "createContextDecisionService",
    "createOwnershipStartupCandidateGate"
  ]);

  class OwnershipProvenanceCandidateVerifierError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "OwnershipProvenanceCandidateVerifierError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message) {
    throw new OwnershipProvenanceCandidateVerifierError(code, message);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => { output[key] = clone(value[key]); });
    return output;
  }

  function freeze(value) {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => freeze(value[key]));
    return Object.freeze(value);
  }

  function rejectUnknown(value, fields, path) {
    if (!isRecord(value)) fail("invalid_input", `${path} must be an object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function requireMethod(value, path, method) {
    if (!isRecord(value) || typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`);
  }

  function sourceDocumentIds(manifest) {
    if (!isRecord(manifest) || !Array.isArray(manifest.documents)) fail("malformed_candidate", "Candidate manifest documents are required.");
    const strategic = manifest.documents.filter((document) => isRecord(document) && document.type === "strategic-domain");
    const projections = manifest.documents.filter((document) => isRecord(document) && document.type === "server-state");
    if (strategic.length !== 1 || projections.length !== 1) fail("ambiguous_candidate_scope", "Candidate must contain exactly one strategic and projection document.");
    return { strategic: strategic[0].documentId, projection: projections[0].documentId };
  }

  function refusal(reason, details = {}) {
    return freeze({ status: "refused", accepted: false, reason, ...clone(details) });
  }

  function createOwnershipProvenanceCandidateVerifier(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    requireMethod(options.isolatedGraphLoader, "options.isolatedGraphLoader", "load");
    if (typeof options.resolveSeasonPackage !== "function") fail("invalid_factory", "options.resolveSeasonPackage must be a function.");
    if (typeof options.createTargetCatalog !== "function") fail("invalid_factory", "options.createTargetCatalog must be a function.");
    const hasGateFactory = typeof options.createOwnershipStartupCandidateGate === "function";
    const hasDecisionFactory = typeof options.createContextDecisionService === "function";
    if (!hasGateFactory && !hasDecisionFactory) fail("invalid_factory", "options.createContextDecisionService or options.createOwnershipStartupCandidateGate must be a function.");

    const { createOwnershipMigrationInputAdapter } = typeof require === "function"
      ? require("./ownership-migration-input-adapter.js")
      : globalScope;
    const inputAdapter = createOwnershipMigrationInputAdapter({
      resolveSeasonPackage: options.resolveSeasonPackage,
      createTargetCatalog: options.createTargetCatalog
    });
    const gate = hasGateFactory
      ? options.createOwnershipStartupCandidateGate()
      : (() => {
          const { createOwnershipStartupCandidateGate } = typeof require === "function"
            ? require("./ownership-startup-candidate-gate.js")
            : globalScope;
          return createOwnershipStartupCandidateGate({ createContextDecisionService: options.createContextDecisionService });
        })();

    async function verify(snapshot) {
      try {
        rejectUnknown(snapshot, new Set(["status", "candidate", "manifest", "documents"]), "snapshot");
        if (snapshot.status !== "prepared" || !isRecord(snapshot.candidate)) return refusal("malformed_candidate");
        const sourceDocumentIdsValue = sourceDocumentIds(snapshot.manifest);
        if (!Array.isArray(snapshot.documents) || snapshot.documents.length === 0) return refusal("malformed_candidate");
        const graph = await options.isolatedGraphLoader.load({ documents: clone(snapshot.documents) });
        const input = await inputAdapter.adapt({ snapshot: graph, sourceDocumentIds: sourceDocumentIdsValue });
        const gateResult = gate.evaluate({
          activeSeason: input.activeSeason,
          provenanceState: input.provenanceState,
          territoryRecords: input.territoryRecords,
          structureRecords: input.structureRecords,
          targetCatalog: input.targetCatalog,
          persistedProjection: input.persistedProjection
        });
        if (!isRecord(gateResult) || typeof gateResult.decision !== "string") return refusal("ambiguous_result");
        if (gateResult.decision !== "ready") return refusal(gateResult.decision, { gate: gateResult });
        return freeze({ status: "accepted", accepted: true, decision: "ready", gate: clone(gateResult) });
      } catch (error) {
        if (error instanceof OwnershipProvenanceCandidateVerifierError) return refusal(error.code);
        return refusal(error && typeof error.code === "string" ? error.code : "malformed_candidate");
      }
    }

    return Object.freeze({ verify });
  }

  const exportsObject = { createOwnershipProvenanceCandidateVerifier, OwnershipProvenanceCandidateVerifierError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));