(function initializeGameRulesEngineFactory(globalScope) {
  function createDefaultScoringModel() {
    return {
      configured: false,
      resourceLabel: "Ice Crystals",
      serverField: "iceCrystals",
      unconfiguredLabel: "Scoring rules not configured"
    };
  }

  function createDefaultResourceModel() {
    return {
      primaryResource: "Ice Crystals",
      structureOutputs: {}
    };
  }

  function createDefaultCaptureRules() {
    return {
      defaultCapturable: true,
      byCode: {},
      byType: {}
    };
  }

  function normalizeDefinition(definition) {
    const source = definition && typeof definition === "object" ? definition : {};

    return {
      seasonIdentity: source.seasonIdentity && typeof source.seasonIdentity === "object" ? source.seasonIdentity : {},
      metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : {},
      mapDefinition: source.mapDefinition && typeof source.mapDefinition === "object" ? source.mapDefinition : {},
      structureCatalog: Array.isArray(source.structureCatalog) ? source.structureCatalog : [],
      scoringModel: source.scoringModel && typeof source.scoringModel === "object"
        ? source.scoringModel
        : createDefaultScoringModel(),
      resourceModel: source.resourceModel && typeof source.resourceModel === "object"
        ? source.resourceModel
        : createDefaultResourceModel(),
      phaseModel: Array.isArray(source.phaseModel) ? source.phaseModel : [],
      structureUnlocks: source.structureUnlocks && typeof source.structureUnlocks === "object" ? source.structureUnlocks : {},
      captureRules: source.captureRules && typeof source.captureRules === "object"
        ? source.captureRules
        : createDefaultCaptureRules(),
      buffDefinitions: Array.isArray(source.buffDefinitions) ? source.buffDefinitions : []
    };
  }

  function getCatalogEntry(catalog, structureCodeOrType) {
    if (!structureCodeOrType) {
      return null;
    }

    const key = String(structureCodeOrType);
    return catalog.find((entry) => entry && (entry.code === key || entry.type === key)) || null;
  }

  function createGameRulesEngine(definition) {
    const normalized = normalizeDefinition(definition);

    function getSeasonIdentity() {
      return { ...normalized.seasonIdentity };
    }

    function getSeasonMetadata() {
      return { ...normalized.metadata };
    }

    function getMapDefinition() {
      return { ...normalized.mapDefinition };
    }

    function getStructureCatalog() {
      return normalized.structureCatalog.map((structure) => ({ ...structure }));
    }

    function getScoringModel() {
      return { ...normalized.scoringModel };
    }

    function getResourceModel() {
      return {
        ...normalized.resourceModel,
        structureOutputs: {
          ...(normalized.resourceModel && normalized.resourceModel.structureOutputs
            ? normalized.resourceModel.structureOutputs
            : {})
        }
      };
    }

    function getPhaseModel() {
      return normalized.phaseModel.map((phase) => ({ ...phase }));
    }

    function getCaptureRules() {
      return {
        ...normalized.captureRules,
        byCode: { ...(normalized.captureRules.byCode || {}) },
        byType: { ...(normalized.captureRules.byType || {}) }
      };
    }

    function getBuffDefinitions() {
      return normalized.buffDefinitions.map((buff) => ({ ...buff }));
    }

    function isStructureUnlocked(structureCodeOrType) {
      const structure = getCatalogEntry(normalized.structureCatalog, structureCodeOrType);
      if (!structure) {
        return false;
      }

      const codeKey = structure.code;
      const typeKey = structure.type;

      if (Object.prototype.hasOwnProperty.call(normalized.structureUnlocks, codeKey)) {
        return Boolean(normalized.structureUnlocks[codeKey]);
      }

      if (Object.prototype.hasOwnProperty.call(normalized.structureUnlocks, typeKey)) {
        return Boolean(normalized.structureUnlocks[typeKey]);
      }

      return false;
    }

    function canCaptureStructure(structureCodeOrType) {
      const structure = getCatalogEntry(normalized.structureCatalog, structureCodeOrType);
      if (!structure || !isStructureUnlocked(structureCodeOrType)) {
        return false;
      }

      const captureByCode = normalized.captureRules.byCode || {};
      if (Object.prototype.hasOwnProperty.call(captureByCode, structure.code)) {
        return Boolean(captureByCode[structure.code]);
      }

      const captureByType = normalized.captureRules.byType || {};
      if (Object.prototype.hasOwnProperty.call(captureByType, structure.type)) {
        return Boolean(captureByType[structure.type]);
      }

      return Boolean(normalized.captureRules.defaultCapturable);
    }

    function getStructureResourceProfile(structureCodeOrType) {
      const structure = getCatalogEntry(normalized.structureCatalog, structureCodeOrType);
      if (!structure) {
        return null;
      }

      const structureOutputs = normalized.resourceModel.structureOutputs || {};
      if (Object.prototype.hasOwnProperty.call(structureOutputs, structure.code)) {
        return structureOutputs[structure.code];
      }

      if (Object.prototype.hasOwnProperty.call(structureOutputs, structure.type)) {
        return structureOutputs[structure.type];
      }

      return null;
    }

    return {
      getSeasonIdentity,
      getSeasonMetadata,
      getMapDefinition,
      getStructureCatalog,
      getScoringModel,
      getResourceModel,
      getPhaseModel,
      getCaptureRules,
      getBuffDefinitions,
      isStructureUnlocked,
      canCaptureStructure,
      getStructureResourceProfile
    };
  }

  globalScope.createGameRulesEngine = createGameRulesEngine;
})(window);