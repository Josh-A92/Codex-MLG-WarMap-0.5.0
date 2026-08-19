const SAFE_GENERATION_STATUSES = new Set(["published", "already_published", "already_proven"]);
const SAFE_LEGACY_CLASSIFICATIONS = new Set(["first_run", "aligned"]);

class WarMapStartupReadinessError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "WarMapStartupReadinessError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
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
  if (!isRecord(value)) throw new WarMapStartupReadinessError("invalid_factory", `${path} must be a plain object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (unknown.length > 0) throw new WarMapStartupReadinessError("invalid_factory", `${path}.${unknown[0]} is not supported.`);
}

function requireMethod(value, path, method) {
  if (!isRecord(value) || typeof value[method] !== "function") throw new WarMapStartupReadinessError("invalid_factory", `${path}.${method} must be a function.`);
}

function diagnostics(value) {
  if (!Array.isArray(value)) return [];
  return value.map(clone);
}

function blocked(reason, classification, details = {}) {
  return immutable({
    status: "blocked",
    persistenceMode: "unavailable",
    reason,
    classification: classification || null,
    diagnostics: diagnostics(details.diagnostics)
  });
}

function createWarMapStartupReadiness(options) {
  rejectUnknown(options, new Set(["migrationStartup", "legacyStateLoader", "legacyStateClassifier"]), "options");
  requireMethod(options.migrationStartup, "options.migrationStartup", "resolve");
  requireMethod(options.legacyStateClassifier, "options.legacyStateClassifier", "classify");
  requireMethod(options.legacyStateLoader, "options.legacyStateLoader", "load");

  async function resolve() {
    let migrationResult;
    try {
      migrationResult = await options.migrationStartup.resolve();
    } catch (error) {
      return blocked(error && error.code ? error.code : "migration_startup_failed", null, { diagnostics: ["migration_startup_failed"] });
    }
    if (!isRecord(migrationResult) || typeof migrationResult.status !== "string" || typeof migrationResult.persistenceMode !== "string") {
      return blocked("malformed_migration_startup_result", null, { diagnostics: ["malformed_migration_startup_result"] });
    }
    if (SAFE_GENERATION_STATUSES.has(migrationResult.status) && migrationResult.persistenceMode === "generation") {
      return immutable({
        status: migrationResult.status,
        persistenceMode: "generation",
        reason: migrationResult.reason || null,
        classification: null,
        diagnostics: diagnostics(migrationResult.diagnostics)
      });
    }
    if (migrationResult.status !== "legacy_required") {
      return blocked(typeof migrationResult.reason === "string" ? migrationResult.reason : "unsafe_migration_startup", null, migrationResult);
    }

    let legacyInput;
    try {
      legacyInput = await options.legacyStateLoader.load();
    } catch (error) {
      return blocked(error && error.code ? error.code : "legacy_load_failed", null, { diagnostics: ["legacy_load_failed"] });
    }
    if (!isRecord(legacyInput)) return blocked("malformed_legacy_loader_result", null, { diagnostics: ["malformed_legacy_loader_result"] });

    let classification;
    try {
      classification = await options.legacyStateClassifier.classify(clone(legacyInput));
    } catch (error) {
      return blocked(error && error.code ? error.code : "legacy_classification_failed", null, { diagnostics: ["legacy_classification_failed"] });
    }
    if (!isRecord(classification) || typeof classification.status !== "string") {
      return blocked("malformed_legacy_classification", null, { diagnostics: ["malformed_legacy_classification"] });
    }
    if (classification.status === "first_run") {
      return immutable({ status: "first_run", persistenceMode: "legacy", reason: null, classification: "first_run", diagnostics: [] });
    }
    if (classification.status === "aligned") {
      return immutable({ status: "legacy_ready", persistenceMode: "legacy", reason: null, classification: "aligned", diagnostics: [] });
    }
    const reason = typeof classification.reason === "string" ? classification.reason : "legacy_classification_blocked";
    return blocked(reason, classification.status, classification);
  }

  return Object.freeze({ resolve });
}

module.exports = {
  createWarMapStartupReadiness,
  WarMapStartupReadinessError
};
