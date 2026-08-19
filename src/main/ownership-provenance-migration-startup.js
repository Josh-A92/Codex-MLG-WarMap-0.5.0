const FACTORY_FIELDS = new Set(["generationStore", "executionCoordinator", "allowMissingGeneration"]);
const RESULT_STATUSES = new Set(["published", "already_published", "already_proven"]);
const FAILURE_STATUSES = new Set(["refused", "verification_failed", "stale_current", "storage_failure"]);

class OwnershipProvenanceMigrationStartupError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "OwnershipProvenanceMigrationStartupError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function fail(code, message, cause) {
  throw new OwnershipProvenanceMigrationStartupError(code, message, cause);
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

function immutableResult(value) {
  return freeze(clone(value));
}

function rejectUnknown(value, fields, path) {
  if (!isRecord(value)) fail("invalid_factory", `${path} must be a plain object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (unknown.length > 0) fail("invalid_factory", `${path}.${unknown[0]} is not supported.`);
}

function requireMethod(value, path, method) {
  if (!isRecord(value) || typeof value[method] !== "function") {
    fail("invalid_factory", `${path}.${method} must be a function.`);
  }
}

function errorCode(error, fallback) {
  return error && typeof error.code === "string" ? error.code : fallback;
}

function identityFromGeneration(generation, path) {
  if (!isRecord(generation) || !isRecord(generation.pointer) || !isRecord(generation.manifest)) {
    fail("malformed_generation", `${path} must contain pointer and manifest.`);
  }
  if (!Number.isSafeInteger(generation.pointer.generation) || generation.pointer.generation < 0
      || generation.pointer.generation !== generation.manifest.generation
      || typeof generation.pointer.manifestFile !== "string" || generation.pointer.manifestFile.trim() === ""
      || typeof generation.pointer.manifestSha256 !== "string" || generation.pointer.manifestSha256.trim() === "") {
    fail("malformed_generation", `${path} has an invalid generation identity.`);
  }
  return {
    generation: generation.pointer.generation,
    manifestFile: generation.pointer.manifestFile,
    manifestSha256: generation.pointer.manifestSha256
  };
}

function sameIdentity(left, right) {
  return left.generation === right.generation
    && left.manifestFile === right.manifestFile
    && left.manifestSha256 === right.manifestSha256;
}

function diagnostics(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => clone(entry));
}

function resultDiagnostics(value) {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.diagnostics)) return diagnostics(value.diagnostics);
  return isRecord(value.verification) ? diagnostics(value.verification.diagnostics) : [];
}

function failure(status, reason, details = {}) {
  return immutableResult({
    status,
    persistenceMode: "unavailable",
    generation: null,
    reason,
    diagnostics: resultDiagnostics(details)
  });
}

function createOwnershipProvenanceMigrationStartup(options) {
  rejectUnknown(options, FACTORY_FIELDS, "options");
  requireMethod(options.generationStore, "options.generationStore", "loadCommittedGeneration");
  requireMethod(options.executionCoordinator, "options.executionCoordinator", "execute");
  if (options.allowMissingGeneration !== undefined && typeof options.allowMissingGeneration !== "boolean") {
    fail("invalid_factory", "options.allowMissingGeneration must be a boolean.");
  }

  async function loadCurrent() {
    let loaded;
    try {
      loaded = await options.generationStore.loadCommittedGeneration();
    } catch (error) {
      return { failure: failure("storage_failure", errorCode(error, "generation_load_failed")) };
    }
    if (!isRecord(loaded) || typeof loaded.status !== "string") {
      return { failure: failure("malformed_generation", "invalid_load_result") };
    }
    if (loaded.status === "missing") return { missing: true };
    if (loaded.status !== "committed" || loaded.source !== "current" || Object.prototype.hasOwnProperty.call(loaded, "recovery")) {
      return { failure: failure("unsafe_committed_generation", loaded.source === "previous" ? "fallback_generation" : "unsafe_generation") };
    }
    try {
      return { loaded, identity: identityFromGeneration(loaded, "committed generation") };
    } catch (error) {
      return { failure: failure("malformed_generation", error.code || "invalid_generation_identity") };
    }
  }

  async function resolve() {
    const initial = await loadCurrent();
    if (initial.failure) return initial.failure;
    if (initial.missing && !options.allowMissingGeneration) {
      return immutableResult({
        status: "legacy_required",
        persistenceMode: "legacy",
        generation: null,
        reason: "no_committed_generation",
        diagnostics: []
      });
    }

    const expectedCurrent = initial.missing ? null : clone(initial.identity);
    let execution;
    try {
      execution = await options.executionCoordinator.execute({ expectedCurrent: clone(expectedCurrent) });
    } catch (error) {
      return failure("storage_failure", errorCode(error, "execution_failed"));
    }
    if (!isRecord(execution) || typeof execution.status !== "string") {
      return failure("malformed_result", "invalid_execution_result");
    }
    if (FAILURE_STATUSES.has(execution.status)) {
      return failure(execution.status, typeof execution.reason === "string" ? execution.reason : execution.status, execution);
    }
    if (!RESULT_STATUSES.has(execution.status)) {
      return failure("malformed_result", "unsupported_execution_status", execution);
    }

    let expectedResult;
    try {
      if (execution.status === "already_proven") {
        expectedResult = expectedCurrent;
      } else if (isRecord(execution.candidate)) {
        expectedResult = {
          generation: execution.candidate.generation,
          manifestFile: execution.candidate.manifestFile,
          manifestSha256: execution.candidate.manifestSha256
        };
        if (!Number.isSafeInteger(expectedResult.generation)
            || typeof expectedResult.manifestFile !== "string" || expectedResult.manifestFile.trim() === ""
            || typeof expectedResult.manifestSha256 !== "string" || expectedResult.manifestSha256.trim() === "") {
          throw new Error("invalid_result_identity");
        }
        if (execution.generation !== undefined && execution.generation !== expectedResult.generation) {
          throw new Error("result_generation_mismatch");
        }
      } else {
        throw new Error("missing_result_candidate");
      }
    } catch (error) {
      return failure("malformed_result", error.message || "invalid_result_identity", execution);
    }

    const reloaded = await loadCurrent();
    if (reloaded.failure) return reloaded.failure;
    if (reloaded.missing || !sameIdentity(reloaded.identity, expectedResult)) {
      return failure("identity_mismatch", "published_generation_identity_mismatch", execution);
    }
    return immutableResult({
      status: execution.status,
      persistenceMode: "generation",
      generation: reloaded.identity,
      reason: null,
      diagnostics: resultDiagnostics(execution)
    });
  }

  return Object.freeze({ resolve });
}

module.exports = {
  createOwnershipProvenanceMigrationStartup,
  OwnershipProvenanceMigrationStartupError
};
