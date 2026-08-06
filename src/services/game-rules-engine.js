(function initializeGameRulesEngineFactory(globalScope) {
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function clone(value) {
    if (
      value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value))
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(clone);
    }

    if (!isRecord(value)) {
      return value;
    }

    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(output, key, {
        value: clone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    return output;
  }

  function normalizeRecord(value) {
    return isRecord(value) ? value : {};
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function stripInternalOrder(entry) {
    if (!isRecord(entry)) {
      return entry;
    }

    const output = {};
    Object.keys(entry).forEach((key) => {
      if (key !== "_order") {
        output[key] = entry[key];
      }
    });
    return output;
  }

  function normalizeResourceEntry(entry) {
    const source = normalizeRecord(entry);
    return {
      resourceId: typeof source.resourceId === "string" ? source.resourceId : null,
      displayName: typeof source.displayName === "string" ? source.displayName : null,
      unit: typeof source.unit === "string" ? source.unit : null,
      metricType: typeof source.metricType === "string" ? source.metricType : null
    };
  }

  function normalizeCalculationEntry(entry) {
    const source = normalizeRecord(entry);
    return {
      calculationId: typeof source.calculationId === "string" ? source.calculationId : null,
      calculationModelId: typeof source.calculationModelId === "string" ? source.calculationModelId : null,
      resourceId: typeof source.resourceId === "string" ? source.resourceId : null,
      configured: source.configured === true,
      displayLabel: typeof source.displayLabel === "string" ? source.displayLabel : null,
      serverField: typeof source.serverField === "string" ? source.serverField : null,
      unconfiguredLabel: typeof source.unconfiguredLabel === "string" ? source.unconfiguredLabel : null
    };
  }

  function normalizeResourceOutputEntry(entry) {
    const source = normalizeRecord(entry);
    return {
      resourceId: typeof source.resourceId === "string" ? source.resourceId : null,
      value: Number.isFinite(Number(source.value)) ? Number(source.value) : null
    };
  }

  function normalizeDefinition(definition) {
    const source = normalizeRecord(definition);
    const resourceModel = normalizeRecord(source.resourceModel);
    const scoringModel = normalizeRecord(source.scoringModel);

    return {
      seasonIdentity: normalizeRecord(source.seasonIdentity),
      metadata: normalizeRecord(source.metadata),
      mapDefinition: normalizeRecord(source.mapDefinition),
      structureCatalog: normalizeArray(source.structureCatalog).map((entry) => clone(entry)),
      resourceModel: {
        resources: normalizeArray(resourceModel.resources).map(normalizeResourceEntry),
        structureOutputs: normalizeRecord(resourceModel.structureOutputs)
      },
      scoringModel: {
        calculations: normalizeArray(scoringModel.calculations).map(normalizeCalculationEntry)
      },
      phaseModel: normalizeArray(source.phaseModel).map((phase) => clone(phase)),
      structureUnlocks: normalizeRecord(source.structureUnlocks),
      captureRules: normalizeRecord(source.captureRules),
      buffDefinitions: normalizeArray(source.buffDefinitions).map((buff) => clone(buff))
    };
  }

  function getCatalogEntry(catalog, structureCodeOrType) {
    if (!structureCodeOrType) {
      return null;
    }

    const key = String(structureCodeOrType);
    return catalog.find((entry) => entry && (entry.code === key || entry.type === key || entry.structureTypeId === key)) || null;
  }

  function createGameRulesEngine(definition) {
    const normalized = normalizeDefinition(definition);
    const resourcesById = new Map();
    const calculationsById = new Map();

    normalized.resourceModel.resources.forEach((resource, index) => {
      if (resource && typeof resource.resourceId === "string" && !resourcesById.has(resource.resourceId)) {
        resourcesById.set(resource.resourceId, { ...resource, _order: index });
      }
    });

    normalized.scoringModel.calculations.forEach((calculation, index) => {
      if (calculation && typeof calculation.calculationId === "string" && !calculationsById.has(calculation.calculationId)) {
        calculationsById.set(calculation.calculationId, { ...calculation, _order: index });
      }
    });

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

    function getResourceModel() {
      return {
        resources: normalized.resourceModel.resources.map((resource) => ({ ...resource })),
        structureOutputs: clone(normalized.resourceModel.structureOutputs)
      };
    }

    function getScoringModel() {
      return {
        calculations: normalized.scoringModel.calculations.map((calculation) => ({ ...calculation }))
      };
    }

    function listResources() {
      return normalized.resourceModel.resources.map((resource) => ({ ...stripInternalOrder(resource) }));
    }

    function getResource(resourceId) {
      if (typeof resourceId !== "string" || resourceId.trim() === "") {
        return null;
      }

      const resource = resourcesById.get(resourceId);
      return resource ? { ...stripInternalOrder(resource) } : null;
    }

    function listScoringCalculations() {
      return normalized.scoringModel.calculations.map((calculation) => ({ ...stripInternalOrder(calculation) }));
    }

    function getScoringCalculation(calculationId) {
      if (typeof calculationId !== "string" || calculationId.trim() === "") {
        return null;
      }

      const calculation = calculationsById.get(calculationId);
      return calculation ? { ...stripInternalOrder(calculation) } : null;
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

      const unlocks = normalized.structureUnlocks;
      if (Object.prototype.hasOwnProperty.call(unlocks, structure.code)) {
        return Boolean(unlocks[structure.code]);
      }

      if (Object.prototype.hasOwnProperty.call(unlocks, structure.type)) {
        return Boolean(unlocks[structure.type]);
      }

      if (Object.prototype.hasOwnProperty.call(unlocks, structure.structureTypeId)) {
        return Boolean(unlocks[structure.structureTypeId]);
      }

      return false;
    }

    function canCaptureStructure(structureCodeOrType) {
      const structure = getCatalogEntry(normalized.structureCatalog, structureCodeOrType);
      if (!structure || !isStructureUnlocked(structureCodeOrType)) {
        return false;
      }

      const captureRules = normalized.captureRules;
      const captureByCode = captureRules.byCode || {};
      if (Object.prototype.hasOwnProperty.call(captureByCode, structure.code)) {
        return Boolean(captureByCode[structure.code]);
      }

      const captureByType = captureRules.byType || {};
      if (Object.prototype.hasOwnProperty.call(captureByType, structure.type)) {
        return Boolean(captureByType[structure.type]);
      }

      return Boolean(captureRules.defaultCapturable);
    }

    function supportsCalculationModel(modelId) {
      return modelId === "structure-output-holdings-total" || modelId === "structure-output-production-rate";
    }

    function getStructureResourceProfile(structureCodeOrType) {
      const structure = getCatalogEntry(normalized.structureCatalog, structureCodeOrType);
      if (!structure) {
        return null;
      }

      const outputs = normalized.resourceModel.structureOutputs || {};
      const outputKeys = Object.keys(outputs);
      const resolvedEntries = [];
      const seenResourceIds = new Set();

      [structure.code, structure.type, structure.structureTypeId].forEach((key) => {
        if (!key || !Object.prototype.hasOwnProperty.call(outputs, key)) {
          return;
        }

        const structureOutputs = Array.isArray(outputs[key]) ? outputs[key] : [];
        structureOutputs.forEach((entry) => {
          const output = normalizeResourceOutputEntry(entry);
          if (!output.resourceId || !resourcesById.has(output.resourceId) || seenResourceIds.has(output.resourceId)) {
            return;
          }

          const resource = resourcesById.get(output.resourceId);
          resolvedEntries.push({
            resourceId: resource.resourceId,
            displayName: resource.displayName,
            unit: resource.unit,
            metricType: resource.metricType,
            value: output.value
          });
          seenResourceIds.add(output.resourceId);
        });
      });

      if (resolvedEntries.length === 0 && outputKeys.some((key) => Object.prototype.hasOwnProperty.call(outputs, key))) {
        return [];
      }

      resolvedEntries.sort((left, right) => {
        return (resourcesById.get(left.resourceId)._order || 0) - (resourcesById.get(right.resourceId)._order || 0);
      });

      return resolvedEntries;
    }

    return {
      getSeasonIdentity,
      getSeasonMetadata,
      getMapDefinition,
      getStructureCatalog,
      getResourceModel,
      getScoringModel,
      listResources,
      getResource,
      listScoringCalculations,
      getScoringCalculation,
      getPhaseModel,
      getCaptureRules,
      getBuffDefinitions,
      isStructureUnlocked,
      canCaptureStructure,
      supportsCalculationModel,
      getStructureResourceProfile
    };
  }

  globalScope.createGameRulesEngine = createGameRulesEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createGameRulesEngine
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
