const SAFE_GENERATION_STATUSES = new Set(["published", "already_published", "already_proven"]);
const SAFE_LEGACY_STATUSES = new Set(["first_run", "legacy_ready"]);

class StartupPersistenceGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StartupPersistenceGateError";
    this.code = code;
  }
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

function immutable(value) {
  return freeze(clone(value));
}

function rejectUnknown(value, fields, path) {
  if (!isRecord(value)) throw new StartupPersistenceGateError("invalid_input", `${path} must be a plain object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (unknown.length > 0) throw new StartupPersistenceGateError("invalid_input", `${path}.${unknown[0]} is not supported.`);
}

function requireCallback(value, path) {
  if (typeof value !== "function") throw new StartupPersistenceGateError("invalid_input", `${path} must be a function.`);
}

function initialState() {
  return {
    status: "closed",
    settled: false,
    mode: null,
    reason: "startup_not_ready",
    diagnostics: []
  };
}

function normalizeSettlement(value) {
  if (!isRecord(value)) {
    return {
      status: "blocked",
      settled: true,
      mode: null,
      reason: "unsafe_startup_result",
      diagnostics: ["invalid_startup_result"]
    };
  }
  try {
    rejectUnknown(value, new Set(["status", "persistenceMode", "generation", "reason", "classification", "diagnostics"]), "startupResult");
  } catch (_error) {
    return {
      status: "blocked",
      settled: true,
      mode: null,
      reason: "unsafe_startup_result",
      diagnostics: ["invalid_startup_result"]
    };
  }
  const safeGeneration = SAFE_GENERATION_STATUSES.has(value.status) && value.persistenceMode === "generation";
  const safeLegacy = SAFE_LEGACY_STATUSES.has(value.status) && value.persistenceMode === "legacy";
  if (safeGeneration || safeLegacy) {
    return {
      status: "open",
      settled: true,
      mode: safeGeneration ? "generation" : "legacy",
      reason: null,
      diagnostics: Array.isArray(value.diagnostics) ? clone(value.diagnostics) : []
    };
  }
  const reason = value.status === "legacy_required"
    ? "legacy_classification_required"
    : "unsafe_startup_result";
  return {
    status: "blocked",
    settled: true,
    mode: null,
    reason,
    diagnostics: Array.isArray(value.diagnostics) ? clone(value.diagnostics) : []
  };
}

function createStartupPersistenceGate() {
  let state = initialState();
  let queueTail = Promise.resolve();

  function getState() {
    return immutable(state);
  }

  function settle(startupResult) {
    if (!state.settled) state = normalizeSettlement(clone(startupResult));
    return getState();
  }

  function enqueue(mode, operation) {
    requireCallback(operation, `write${mode[0].toUpperCase()}${mode.slice(1)}`);
    if (!state.settled) return Promise.reject(new StartupPersistenceGateError("startup_not_ready", "Startup persistence is not settled."));
    if (state.mode !== mode) return Promise.reject(new StartupPersistenceGateError("persistence_mode_inactive", `Persistence mode '${mode}' is inactive.`));

    const queued = queueTail.then(() => operation(), () => operation());
    queueTail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  return Object.freeze({
    settle,
    getState,
    writeGeneration(operation) { return enqueue("generation", operation); },
    writeLegacy(operation) { return enqueue("legacy", operation); }
  });
}

module.exports = {
  createStartupPersistenceGate,
  StartupPersistenceGateError
};
