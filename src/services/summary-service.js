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

    function getResolvedScoringModel() {
      const engine = getGameRulesEngine();
      if (!engine || typeof engine.getScoringModel !== "function") {
        return {
          configured: false,
          serverField: null,
          resourceLabel: null,
          unconfiguredLabel: DEFAULT_SCORING_UNCONFIGURED_LABEL
        };
      }

      const scoringModel = engine.getScoringModel();
      if (!isObject(scoringModel)) {
        return {
          configured: false,
          serverField: null,
          resourceLabel: null,
          unconfiguredLabel: DEFAULT_SCORING_UNCONFIGURED_LABEL
        };
      }

      return {
        configured: Boolean(scoringModel.configured),
        serverField: typeof scoringModel.serverField === "string" && scoringModel.serverField.trim() !== ""
          ? scoringModel.serverField
          : null,
        resourceLabel: typeof scoringModel.resourceLabel === "string" && scoringModel.resourceLabel.trim() !== ""
          ? scoringModel.resourceLabel
          : null,
        unconfiguredLabel: typeof scoringModel.unconfiguredLabel === "string" && scoringModel.unconfiguredLabel.trim() !== ""
          ? scoringModel.unconfiguredLabel
          : DEFAULT_SCORING_UNCONFIGURED_LABEL
      };
    }

    function getResolvedResourceModel() {
      const engine = getGameRulesEngine();
      if (!engine || typeof engine.getResourceModel !== "function") {
        return {
          displayName: null,
          unit: null,
          metricType: null,
          resourceId: null
        };
      }

      const resourceModel = engine.getResourceModel();
      if (!isObject(resourceModel)) {
        return {
          displayName: null,
          unit: null,
          metricType: null,
          resourceId: null
        };
      }

      return {
        displayName: typeof resourceModel.displayName === "string" && resourceModel.displayName.trim() !== ""
          ? resourceModel.displayName
          : null,
        unit: typeof resourceModel.unit === "string" && resourceModel.unit.trim() !== ""
          ? resourceModel.unit
          : null,
        metricType: typeof resourceModel.metricType === "string" && resourceModel.metricType.trim() !== ""
          ? resourceModel.metricType
          : null,
        resourceId: typeof resourceModel.resourceId === "string" && resourceModel.resourceId.trim() !== ""
          ? resourceModel.resourceId
          : null
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
          capturableTiles.push({ territoryKey, fallbackOwnerId });
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

    function getScoringDisplay(server) {
      const scoringModel = getResolvedScoringModel();
      const resourceModel = getResolvedResourceModel();

      void server;

      return {
        text: scoringModel.unconfiguredLabel,
        configured: false,
        resourceLabel: scoringModel.resourceLabel || resourceModel.displayName,
        metricType: resourceModel.metricType,
        unit: resourceModel.unit,
        value: null,
        serverField: scoringModel.serverField
      };
    }

    function getTileOwnershipStats(server) {
      const tileContext = buildTileContext();
      const serverId = isObject(server) ? server.id : null;
      const designatedUnionId = normalizeUnionId(getDesignatedUnionId(server));
      let controlledTileCount = 0;
      let designatedUnionControlledTileCount = 0;

      tileContext.capturableTiles.forEach((tile) => {
        const resolvedOwnerId = resolveTerritoryOwner(serverId, tile.territoryKey, tile.fallbackOwnerId);

        if (resolvedOwnerId !== null) {
          controlledTileCount += 1;
        }

        if (designatedUnionId && resolvedOwnerId === designatedUnionId) {
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

    function getStructureOwnershipByType(server) {
      const tileContext = buildTileContext();
      const serverId = isObject(server) ? server.id : null;
      const designatedUnionId = normalizeUnionId(getDesignatedUnionId(server));
      const summaryByType = new Map();

      toSafeArray(tileContext.structures).forEach((structure) => {
        if (!isObject(structure)) {
          return;
        }

        const type = typeof structure.type === "string" && structure.type.trim() !== ""
          ? structure.type
          : "Unknown";
        const startRow = toFiniteNumber(structure.row, NaN);
        const startCol = toFiniteNumber(structure.col, NaN);

        if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) {
          return;
        }

        const rowSpan = normalizeSpan(structure.rows);
        const colSpan = normalizeSpan(structure.cols);

        const ownerIds = [];
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
            const row = startRow + rowOffset;
            const col = startCol + colOffset;
            const territoryKey = getTileKey(row, col);
            const fallbackOwnerId = tileContext.fallbackOwnerByTerritoryKey.has(territoryKey)
              ? tileContext.fallbackOwnerByTerritoryKey.get(territoryKey)
              : null;

            ownerIds.push(resolveTerritoryOwner(serverId, territoryKey, fallbackOwnerId));
          }
        }

        const isDesignatedOwned = Boolean(
          designatedUnionId
          && ownerIds.length > 0
          && ownerIds.every((ownerId) => ownerId === designatedUnionId)
        );

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
      const tileStats = getTileOwnershipStats(server);
      const structureOwnershipByType = getStructureOwnershipByType(server);
      const designatedUnionLabel = tileStats.designatedUnionId
        ? getUnionLabel(tileStats.designatedUnionId)
        : DEFAULT_UNASSIGNED_UNION_LABEL;

      return {
        serverId: isObject(server) ? (server.id ?? null) : null,
        serverLabel: isObject(server) && typeof server.label === "string" ? server.label : "Unknown Server",
        totalCapturableTileCount: tileStats.totalCapturableTileCount,
        controlledTileCount: tileStats.controlledTileCount,
        controlledTerritoryPercent: tileStats.controlledTerritoryPercent,
        designatedUnionId: tileStats.designatedUnionId,
        designatedUnionLabel,
        designatedUnionControlledTileCount: tileStats.designatedUnionControlledTileCount,
        designatedUnionTerritoryPercent: tileStats.designatedUnionTerritoryPercent,
        structureOwnershipByType,
        scoringDisplay: getScoringDisplay(server)
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
