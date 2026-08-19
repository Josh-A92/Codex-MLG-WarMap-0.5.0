(function initializeOwnershipProvenanceMigrationExecutionCoordinator(globalScope) {
  const FACTORY_FIELDS = new Set(["generationStore", "preparationCoordinator", "candidateVerifier"]);
  const INPUT_FIELDS = new Set(["expectedCurrent"]);
  const STALE_CODES = new Set(["stale_candidate", "stale_generation"]);

  class OwnershipProvenanceMigrationExecutionCoordinatorError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "OwnershipProvenanceMigrationExecutionCoordinatorError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new OwnershipProvenanceMigrationExecutionCoordinatorError(code, message, cause);
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
    if (!isRecord(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
  }

  function requireMethod(value, path, method) {
    if (!isRecord(value) || typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`);
  }

  function result(value) {
    return freeze(clone(value));
  }

  function errorCode(error) {
    return error && typeof error.code === "string" ? error.code : "storage_failure";
  }

  function createOwnershipProvenanceMigrationExecutionCoordinator(options) {
    rejectUnknown(options, FACTORY_FIELDS, "options");
    requireMethod(options.generationStore, "options.generationStore", "publish");
    requireMethod(options.preparationCoordinator, "options.preparationCoordinator", "prepare");
    requireMethod(options.candidateVerifier, "options.candidateVerifier", "verify");

    async function execute(input) {
      try {
        rejectUnknown(input, INPUT_FIELDS, "input");
        const prepared = await options.preparationCoordinator.prepare({ expectedCurrent: clone(input.expectedCurrent) });
        if (!isRecord(prepared) || typeof prepared.status !== "string") return result({ status: "refused", reason: "invalid_preparation_result" });
        if (prepared.status !== "prepared") return result(prepared);

        let verification = null;
        try {
          const published = await options.generationStore.publish(prepared.candidate, async (snapshot) => {
            verification = await options.candidateVerifier.verify(snapshot);
            return verification !== null && typeof verification === "object" && verification.accepted === true;
          });
          if (published.status === "already_published") return result({ status: "already_published", candidate: published.candidate });
          if (published.status === "published") return result({ status: "published", candidate: published.candidate, generation: published.generation });
          return result({ status: "storage_failure", reason: "invalid_publish_result" });
        } catch (error) {
          const code = errorCode(error);
          if (code === "verification_rejected") {
            return result({ status: "verification_failed", reason: verification && typeof verification.reason === "string" ? verification.reason : "rejected", verification: verification || null });
          }
          if (STALE_CODES.has(code)) return result({ status: "stale_current", reason: code });
          if (code === "publish_verification_failed") return result({ status: "storage_failure", reason: "post_head_ambiguity", currentPreserved: false });
          return result({ status: "storage_failure", reason: code });
        }
      } catch (error) {
        if (error instanceof OwnershipProvenanceMigrationExecutionCoordinatorError) throw error;
        return result({ status: "storage_failure", phase: "preparation", reason: errorCode(error) });
      }
    }

    return Object.freeze({ execute });
  }

  const exportsObject = {
    createOwnershipProvenanceMigrationExecutionCoordinator,
    OwnershipProvenanceMigrationExecutionCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
