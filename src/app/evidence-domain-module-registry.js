(function initializeEvidenceDomainModuleRegistryFactory(globalScope) {
  const EVIDENCE_DOMAIN_MODULE_FIELDS = Object.freeze([
    "validateEvidenceAsset",
    "validateEvidenceAssetHistory",
    "createEvidenceAssetService",
    "validateEvidenceRecord",
    "validateEvidenceRecordHistory",
    "createEvidenceRecordService"
  ]);

  function createEvidenceDomainModuleRegistry(scope) {
    if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
      throw new TypeError("Evidence Domain Module Registry requires scope to be an object.");
    }
    const registry = {};
    EVIDENCE_DOMAIN_MODULE_FIELDS.forEach((field) => {
      if (typeof scope[field] !== "function") {
        throw new TypeError(`Evidence Domain Module Registry requires scope.${field}.`);
      }
      Object.defineProperty(registry, field, {
        value: scope[field],
        enumerable: true,
        configurable: false,
        writable: false
      });
    });
    return Object.freeze(registry);
  }

  globalScope.EVIDENCE_DOMAIN_MODULE_FIELDS = EVIDENCE_DOMAIN_MODULE_FIELDS;
  globalScope.createEvidenceDomainModuleRegistry = createEvidenceDomainModuleRegistry;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      EVIDENCE_DOMAIN_MODULE_FIELDS,
      createEvidenceDomainModuleRegistry
    };
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
