(function initializeEvidenceDomainRuntimeFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["modules", "initialState"]);
  const MODULE_FIELDS = new Set([
    "validateEvidenceAsset",
    "validateEvidenceAssetHistory",
    "createEvidenceAssetService",
    "validateEvidenceRecord",
    "validateEvidenceRecordHistory",
    "createEvidenceRecordService"
  ]);
  const STATE_FIELDS = new Set(["assets", "evidenceRecords"]);

  class EvidenceDomainRuntimeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "EvidenceDomainRuntimeError";
      this.code = code;
    }
  }

  function fail(message) {
    throw new EvidenceDomainRuntimeError("invalid_factory", message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireRecord(value, path) {
    if (!isRecord(value)) fail(`Evidence Domain Runtime requires ${path} to be a plain object.`);
    return value;
  }

  function exactFields(value, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(`Evidence Domain Runtime requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail(`Evidence Domain Runtime does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function createEvidenceDomainRuntime(options) {
    const input = requireRecord(options, "options");
    exactFields(input, FACTORY_FIELDS, "options");
    const modules = requireRecord(input.modules, "options.modules");
    exactFields(modules, MODULE_FIELDS, "options.modules");
    MODULE_FIELDS.forEach((field) => {
      if (typeof modules[field] !== "function") {
        fail(`Evidence Domain Runtime requires options.modules.${field} to be a function.`);
      }
    });
    const state = requireRecord(input.initialState, "options.initialState");
    exactFields(state, STATE_FIELDS, "options.initialState");
    STATE_FIELDS.forEach((field) => {
      if (!Array.isArray(state[field])) {
        fail(`Evidence Domain Runtime requires options.initialState.${field} to be an array.`);
      }
    });

    const evidenceAssetService = modules.createEvidenceAssetService({
      initialAssets: state.assets,
      validateEvidenceAsset: modules.validateEvidenceAsset,
      validateEvidenceAssetHistory: modules.validateEvidenceAssetHistory
    });
    const evidenceRecordService = modules.createEvidenceRecordService({
      initialEvidenceRecords: state.evidenceRecords,
      validateEvidenceRecord: modules.validateEvidenceRecord,
      validateEvidenceRecordHistory: modules.validateEvidenceRecordHistory,
      evidenceAssetService
    });

    return Object.freeze({ evidenceAssetService, evidenceRecordService });
  }

  const exportsObject = { createEvidenceDomainRuntime, EvidenceDomainRuntimeError };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
