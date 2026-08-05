(function initializeSummaryServiceFactory(globalScope) {
  const DEFAULT_UNASSIGNED_UNION_LABEL = "Unassigned";
  const DEFAULT_SCORING_UNCONFIGURED_LABEL = "Scoring rules not configured";

  function isObject(value) {
    return value !== null && typeof value === "object";
  }

  function getTileKey(row, col) {
    return `${row}-${col}`;
  }

  function normalizeOwnerId(ownerId) {
    return ownerId == null ? null : ownerId;
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSpan(value) {
    const span = Math.floor(toFiniteNumber(value, 1));
    return span > 0 ? span : 1;
  }

  function normalizeUnionId(value) {
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  function toSafeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isCapturableTile(tile) {
    if (!isObject(tile)) {
      return false;
    }

    if (typeof tile.capturable === "boolean") {
      return tile.capturable;
    }

    if (typeof tile.isCapturable === "boolean") {
      return tile.isCapturable;
    }

    if (typeof tile.playable === "boolean") {
      return tile.playable;
    }

    return true;
  }

  function createSummaryService(options) {
    const config = options || {};
    const getMapData = typeof config.getMapData === "function" ? config.getMapData : () => null;
    const getUnionRegistry = typeof config.getUnionRegistry === "function" ? config.getUnionRegistry : () => [];
    const getGameRulesEngine = typeof config.getGameRulesEngine === "function" ? config.getGameRulesEngine : () => null;
    const getTerritoryOwner = typeof config.getTerritoryOwner === "function"
      ? config.getTerritoryOwner
      : (_serverId, _territoryKey, fallbackOwnerId) => normalizeOwnerId(fallbackOwnerId);
    const getDesignatedUnionId = typeof config.getDesignatedUnionId === "function"
      ? config.getDesignatedUnionId
      : () => null;
    const getNativeUnionIds = typeof config.getNativeUnionIds === "function"
      ? config.getNativeUnionIds
      : (server) => {
          const legacyUnionId = normalizeUnionId(getDesignatedUnionId(server));
          return legacyUnionId ? [legacyUnionId] : [];
        };
    const getLeadershipCalculationId = typeof config.getLeadershipCalculationId === "function"
      ? config.getLeadershipCalculationId
      : () => null;

    function getResolvedResourceModel() {
      const engine = getGameRulesEngine();
      if (!engine || typeof engine.getResourceModel !== "function") {
        return {
          resources: [],
          structureOutputs: {}
        };
      }

      const resourceModel = engine.getResourceModel();
      if (!isObject(resourceModel)) {
        return {
          resources: [],
          structureOutputs: {}
        };
      }

      return {
        resources: Array.isArray(resourceModel.resources) ? resourceModel.resources.map((entry) => ({ ...entry })) : [],
        structureOutputs: isObject(resourceModel.structureOutputs) ? { ...resourceModel.structureOutputs } : {}
      };
    }

    function getResolvedScoringCalculations() {
      const engine = getGameRulesEngine();
      if (!engine || typeof engine.listScoringCalculations !== "function") {
        return [];
      }

      const calculations = engine.listScoringCalculations();
      return Array.isArray(calculations) ? calculations.map((entry) => ({ ...entry })) : [];
    }

    function getResourceById(resourceId) {
      const resourceModel = getResolvedResourceModel();
      return resourceModel.resources.find((entry) => entry && entry.resourceId === resourceId) || null;
    }

    function getOwnedStructureOutputsForResource(server, resourceId, unionId) {
      const engine = getGameRulesEngine();
      if (!engine || typeof engine.getStructureResourceProfile !== "function" || typeof resourceId !== "string" || resourceId.trim() === "") {
        return 0;
      }

      const tileContext = buildTileContext();
      const serverId = isObject(server) ? server.id : null;
      const normalizedUnionId = normalizeUnionId(unionId);
      if (!normalizedUnionId) {
        return 0;
      }

      let total = 0;
      const logicalStructureFootprints = new Set();

      toSafeArray(tileContext.structures).forEach((structure) => {
        if (!isObject(structure)) {
          return;
        }

        getStructureFootprintKeys(structure).forEach((key) => logicalStructureFootprints.add(key));
        if (!isStructureOwnedBy(serverId, normalizedUnionId, structure, tileContext)) {
          return;
        }

        const profile = engine.getStructureResourceProfile(structure.code || structure.type || structure.structureTypeId);
        if (!Array.isArray(profile)) {
          return;
        }

        profile.forEach((entry) => {
          if (!isObject(entry) || entry.resourceId !== resourceId) {
            return;
          }

          const value = Number(entry.value);
          if (Number.isFinite(value)) {
            total += value;
          }
        });
      });

      tileContext.capturableTiles.forEach((tile) => {
        if (logicalStructureFootprints.has(tile.territoryKey)) {
          return;
        }

        const ownerId = resolveTerritoryOwner(serverId, tile.territoryKey, tile.fallbackOwnerId);
        if (ownerId !== normalizedUnionId) {
          return;
        }

        const profile = engine.getStructureResourceProfile(tile.code || tile.type);
        if (!Array.isArray(profile)) {
          return;
        }

        profile.forEach((entry) => {
          if (!isObject(entry) || entry.resourceId !== resourceId) {
            return;
          }

          const value = Number(entry.value);
          if (Number.isFinite(value)) {
            total += value;
          }
        });
      });

      return total;
    }

    function getScoringDisplays(server, unionId) {
      const calculations = getResolvedScoringCalculations();

      return calculations.map((calculation) => {
        const resource = getResourceById(calculation.resourceId);
        const configured = calculation.configured === true;
        const supportedModel = calculation.calculationModelId === "structure-output-holdings-total";
        const canResolve = configured && supportedModel && resource !== null;
        const value = canResolve ? getOwnedStructureOutputsForResource(server, calculation.resourceId, unionId) : null;
        const text = value === null
          ? (typeof calculation.unconfiguredLabel === "string" && calculation.unconfiguredLabel.trim() !== ""
            ? calculation.unconfiguredLabel
            : DEFAULT_SCORING_UNCONFIGURED_LABEL)
          : new Intl.NumberFormat("en-GB").format(value);

        return {
          calculationId: typeof calculation.calculationId === "string" && calculation.calculationId.trim() !== ""
            ? calculation.calculationId
            : null,
          calculationModelId: calculation.calculationModelId,
          resourceId: calculation.resourceId,
          text,
          configured,
          displayLabel: typeof calculation.displayLabel === "string" && calculation.displayLabel.trim() !== ""
            ? calculation.displayLabel
            : resource ? resource.displayName : null,
          metricType: resource ? resource.metricType : null,
          unit: resource ? resource.unit : null,
          value,
          serverField: typeof calculation.serverField === "string" && calculation.serverField.trim() !== ""
            ? calculation.serverField
            : null
        };
      });
    }

    function getNativeCandidates(server) {
      const suppliedIds = getNativeUnionIds(server);
      if (!Array.isArray(suppliedIds)) {
        return [];
      }

      return Array.from(new Set(suppliedIds.map(normalizeUnionId).filter(Boolean)));
    }

    function getLeadershipResult(server) {
      const calculations = getResolvedScoringCalculations();
      const requestedCalculationId = normalizeUnionId(getLeadershipCalculationId(server));
      const eligibleCalculations = calculations.filter((calculation) => (
        calculation
        && calculation.configured === true
        && calculation.calculationModelId === "structure-output-holdings-total"
        && getResourceById(calculation.resourceId) !== null
      ));
      const calculation = requestedCalculationId
        ? eligibleCalculations.find((entry) => entry.calculationId === requestedCalculationId) || null
        : eligibleCalculations.length === 1 ? eligibleCalculations[0] : null;

      if (!calculation) {
        return {
          status: "unavailable",
          calculationId: requestedCalculationId,
          score: null,
          unionIds: []
        };
      }

      const ranked = getNativeCandidates(server).map((unionId) => ({
        unionId,
        score: getOwnedStructureOutputsForResource(server, calculation.resourceId, unionId)
      }));
      const highestScore = ranked.reduce((highest, entry) => Math.max(highest, entry.score), 0);
      const unionIds = highestScore > 0
        ? ranked.filter((entry) => entry.score === highestScore).map((entry) => entry.unionId)
        : [];

      return {
        status: unionIds.length > 0 ? "available" : "no_native_leader",
        calculationId: calculation.calculationId,
        score: unionIds.length > 0 ? highestScore : 0,
        unionIds
      };
    }

    function buildTileContext() {
      const mapData = getMapData();
      const rows = mapData && Array.isArray(mapData.tiles) ? mapData.tiles : [];
      const capturableTiles = [];
      const fallbackOwnerByTerritoryKey = new Map();

      rows.forEach((tileRow) => {
        if (!Array.isArray(tileRow)) {
          return;
        }

        tileRow.forEach((tile) => {
          if (!isCapturableTile(tile)) {
            return;
          }

          const row = toFiniteNumber(tile.row, NaN);
          const col = toFiniteNumber(tile.col, NaN);

          if (!Number.isFinite(row) || !Number.isFinite(col)) {
            return;
          }

          const territoryKey = getTileKey(row, col);
          if (fallbackOwnerByTerritoryKey.has(territoryKey)) {
            return;
          }

          const fallbackOwnerId = normalizeOwnerId(tile.ownerId);
          fallbackOwnerByTerritoryKey.set(territoryKey, fallbackOwnerId);
          capturableTiles.push({
            territoryKey,
            fallbackOwnerId,
            code: typeof tile.code === "string" ? tile.code : null,
            type: typeof tile.type === "string" ? tile.type : null
          });
        });
      });

      return {
        capturableTiles,
        fallbackOwnerByTerritoryKey,
        structures: mapData && Array.isArray(mapData.structures) ? mapData.structures : []
      };
    }

    function resolveTerritoryOwner(serverId, territoryKey, fallbackOwnerId) {
      return normalizeOwnerId(getTerritoryOwner(serverId, territoryKey, fallbackOwnerId));
    }

    function getStructureFootprintKeys(structure) {
      const startRow = toFiniteNumber(structure && structure.row, NaN);
      const startCol = toFiniteNumber(structure && structure.col, NaN);
      if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) return [];

      const rowSpan = normalizeSpan(structure.rows);
      const colSpan = normalizeSpan(structure.cols);
      const keys = [];
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          keys.push(getTileKey(startRow + rowOffset, startCol + colOffset));
        }
      }
      return keys;
    }

    function isStructureOwnedBy(serverId, unionId, structure, tileContext) {
      if (!unionId) return false;
      const footprintKeys = getStructureFootprintKeys(structure);
      return footprintKeys.length > 0 && footprintKeys.every((territoryKey) => {
        const fallbackOwnerId = tileContext.fallbackOwnerByTerritoryKey.has(territoryKey)
          ? tileContext.fallbackOwnerByTerritoryKey.get(territoryKey)
          : null;
        return resolveTerritoryOwner(serverId, territoryKey, fallbackOwnerId) === unionId;
      });
    }

    function getUnionLabel(unionId) {
      if (!unionId) {
        return DEFAULT_UNASSIGNED_UNION_LABEL;
      }

      const unions = getUnionRegistry();
      if (!Array.isArray(unions)) {
        return unionId;
      }

      const union = unions.find((entry) => entry && entry.unionId === unionId);
      if (!union) {
        return unionId;
      }

      return union.tag || union.displayName || union.unionId;
    }

    function getTileOwnershipStats(server, focusUnionIds) {
      const tileContext = buildTileContext();
      const serverId = isObject(server) ? server.id : null;
      const normalizedFocusUnionIds = Array.isArray(focusUnionIds)
        ? focusUnionIds.map(normalizeUnionId).filter(Boolean)
        : [];
      const focusUnionIdSet = new Set(normalizedFocusUnionIds);
      const designatedUnionId = normalizedFocusUnionIds[0] || null;
      let controlledTileCount = 0;
      let designatedUnionControlledTileCount = 0;

      tileContext.capturableTiles.forEach((tile) => {
        const resolvedOwnerId = resolveTerritoryOwner(serverId, tile.territoryKey, tile.fallbackOwnerId);

        if (resolvedOwnerId !== null) {
          controlledTileCount += 1;
        }

        if (focusUnionIdSet.has(resolvedOwnerId)) {
          designatedUnionControlledTileCount += 1;
        }
      });

      const totalCapturableTileCount = tileContext.capturableTiles.length;
      const controlledTerritoryPercent = totalCapturableTileCount > 0
        ? (controlledTileCount / totalCapturableTileCount) * 100
        : 0;
      const designatedUnionTerritoryPercent = totalCapturableTileCount > 0
        ? (designatedUnionControlledTileCount / totalCapturableTileCount) * 100
        : 0;

      return {
        totalCapturableTileCount,
        controlledTileCount,
        controlledTerritoryPercent,
        designatedUnionId,
        designatedUnionControlledTileCount,
        designatedUnionTerritoryPercent
      };
    }

    function getStructureOwnershipByType(server, focusUnionIds) {
      const tileContext = buildTileContext();
      const serverId = isObject(server) ? server.id : null;
      const normalizedFocusUnionIds = Array.isArray(focusUnionIds)
        ? focusUnionIds.map(normalizeUnionId).filter(Boolean)
        : [];
      const summaryByType = new Map();

      toSafeArray(tileContext.structures).forEach((structure) => {
        if (!isObject(structure)) {
          return;
        }

        const type = typeof structure.type === "string" && structure.type.trim() !== ""
          ? structure.type
          : "Unknown";
        if (getStructureFootprintKeys(structure).length === 0) {
          return;
        }

        const isDesignatedOwned = normalizedFocusUnionIds.some((unionId) => (
          isStructureOwnedBy(serverId, unionId, structure, tileContext)
        ));

        const bucket = summaryByType.get(type) || {
          structureType: type,
          designatedUnionControlledCount: 0,
          availableCount: 0,
          totalCount: 0
        };

        bucket.totalCount += 1;

        if (isDesignatedOwned) {
          bucket.designatedUnionControlledCount += 1;
        } else {
          bucket.availableCount += 1;
        }

        summaryByType.set(type, bucket);
      });

      return Array.from(summaryByType.values());
    }

    function getServerSummary(server) {
      const leadership = getLeadershipResult(server);
      const legacyDesignatedUnionId = normalizeUnionId(getDesignatedUnionId(server));
      const tileStats = getTileOwnershipStats(server, legacyDesignatedUnionId ? [legacyDesignatedUnionId] : []);
      const leadingTileStats = getTileOwnershipStats(server, leadership.unionIds);
      const structureOwnershipByType = getStructureOwnershipByType(
        server,
        legacyDesignatedUnionId ? [legacyDesignatedUnionId] : []
      );
      const leadingStructureOwnershipByType = getStructureOwnershipByType(server, leadership.unionIds);
      const leadingUnionLabels = leadership.unionIds.map(getUnionLabel);
      const leadingUnionLabel = leadership.status === "unavailable"
        ? "Leader unavailable"
        : leadership.status === "no_native_leader"
          ? "No native leader yet"
          : leadingUnionLabels.join(" + ");
      const designatedUnionLabel = legacyDesignatedUnionId
        ? getUnionLabel(legacyDesignatedUnionId)
        : DEFAULT_UNASSIGNED_UNION_LABEL;
      const resourceModel = getResolvedResourceModel();

      return {
        serverId: isObject(server) ? (server.id ?? null) : null,
        serverLabel: isObject(server) && typeof server.label === "string" ? server.label : "Unknown Server",
        totalCapturableTileCount: tileStats.totalCapturableTileCount,
        controlledTileCount: tileStats.controlledTileCount,
        controlledTerritoryPercent: tileStats.controlledTerritoryPercent,
        designatedUnionId: legacyDesignatedUnionId,
        designatedUnionLabel,
        designatedUnionControlledTileCount: tileStats.designatedUnionControlledTileCount,
        designatedUnionTerritoryPercent: tileStats.designatedUnionTerritoryPercent,
        leadershipStatus: leadership.status,
        leadershipCalculationId: leadership.calculationId,
        leadingUnionIds: leadership.unionIds.slice(),
        leadingUnionId: leadership.unionIds.length === 1 ? leadership.unionIds[0] : null,
        leadingUnionLabels,
        leadingUnionLabel,
        leadingUnionScore: leadership.score,
        leadingUnionControlledTileCount: leadingTileStats.designatedUnionControlledTileCount,
        leadingUnionTerritoryPercent: leadingTileStats.designatedUnionTerritoryPercent,
        structureOwnershipByType,
        leadingStructureOwnershipByType,
        resourceModel,
        scoringDisplays: getScoringDisplays(
          server,
          leadership.unionIds[0] || legacyDesignatedUnionId || null
        )
      };
    }

    return {
      getTileOwnershipStats,
      getStructureOwnershipByType,
      getServerSummary
    };
  }

  globalScope.createSummaryService = createSummaryService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createSummaryService
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
