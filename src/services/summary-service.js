(function initializeSummaryServiceFactory(globalScope) {
  function getTileKey(row, col) {
    return `${row}-${col}`;
  }

  function normalizeOwnerId(ownerId) {
    return ownerId == null ? null : ownerId;
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function createSummaryService(options) {
    const config = options || {};
    const getMapData = typeof config.getMapData === "function" ? config.getMapData : () => null;
    const getBaseTileOwnerByKey = typeof config.getBaseTileOwnerByKey === "function" ? config.getBaseTileOwnerByKey : () => new Map();
    const getUnionRegistry = typeof config.getUnionRegistry === "function" ? config.getUnionRegistry : () => [];
    const getGameRulesEngine = typeof config.getGameRulesEngine === "function" ? config.getGameRulesEngine : () => null;

    function getResolvedScoringModel() {
      const defaultModel = {
        resourceLabel: "Ice Crystals",
        serverField: "iceCrystals",
        unconfiguredLabel: "Scoring rules not configured"
      };

      const engine = getGameRulesEngine();
      if (!engine || typeof engine.getScoringModel !== "function") {
        return defaultModel;
      }

      const scoringModel = engine.getScoringModel();
      if (!scoringModel || typeof scoringModel !== "object") {
        return defaultModel;
      }

      return {
        resourceLabel: scoringModel.resourceLabel || defaultModel.resourceLabel,
        serverField: scoringModel.serverField || defaultModel.serverField,
        unconfiguredLabel: scoringModel.unconfiguredLabel || defaultModel.unconfiguredLabel
      };
    }

    function getServerTileOwner(server, row, col) {
      const ownership = server && server.ownership && typeof server.ownership === "object" ? server.ownership : {};
      const tileKey = getTileKey(row, col);

      if (Object.prototype.hasOwnProperty.call(ownership, tileKey)) {
        return normalizeOwnerId(ownership[tileKey]);
      }

      const baseOwnership = getBaseTileOwnerByKey();
      return normalizeOwnerId(baseOwnership.get(tileKey) ?? null);
    }

    function getTileOwnershipStats(server) {
      const mapData = getMapData();
      const rows = mapData && Array.isArray(mapData.tiles) ? mapData.tiles : [];
      const activeUnionId = server ? normalizeOwnerId(server.activeUnionId) : null;
      let totalTiles = 0;
      let ownedTiles = 0;

      rows.forEach((tileRow) => {
        if (!Array.isArray(tileRow)) {
          return;
        }

        tileRow.forEach((tile) => {
          if (!tile || typeof tile !== "object") {
            return;
          }

          const row = toNumber(tile.row, NaN);
          const col = toNumber(tile.col, NaN);
          if (!Number.isFinite(row) || !Number.isFinite(col)) {
            return;
          }

          totalTiles += 1;
          if (activeUnionId && getServerTileOwner(server, row, col) === activeUnionId) {
            ownedTiles += 1;
          }
        });
      });

      const territoryPercent = totalTiles > 0 ? (ownedTiles / totalTiles) * 100 : 0;

      return {
        totalTiles,
        ownedTiles,
        territoryPercent
      };
    }

    function getStructureCaptureByType(server) {
      const mapData = getMapData();
      const structures = mapData && Array.isArray(mapData.structures) ? mapData.structures : [];
      const activeUnionId = server ? normalizeOwnerId(server.activeUnionId) : null;
      const structureSummary = new Map();

      structures.forEach((structure) => {
        if (!structure || typeof structure !== "object") {
          return;
        }

        const type = structure.type || "Unknown";
        const rows = Math.max(1, toNumber(structure.rows, 1));
        const cols = Math.max(1, toNumber(structure.cols, 1));
        const startRow = toNumber(structure.row, NaN);
        const startCol = toNumber(structure.col, NaN);

        if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) {
          return;
        }

        const ownerIds = [];

        for (let row = startRow; row < startRow + rows; row += 1) {
          for (let col = startCol; col < startCol + cols; col += 1) {
            ownerIds.push(getServerTileOwner(server, row, col));
          }
        }

        const allOwnedByActive = Boolean(
          activeUnionId
          && ownerIds.length > 0
          && ownerIds.every((ownerId) => ownerId === activeUnionId)
        );

        const bucket = structureSummary.get(type) || {
          type,
          captured: 0,
          available: 0
        };

        if (allOwnedByActive) {
          bucket.captured += 1;
        } else {
          bucket.available += 1;
        }

        structureSummary.set(type, bucket);
      });

      return Array.from(structureSummary.values());
    }

    function getUnionLabel(unionId) {
      if (!unionId) {
        return "Unassigned";
      }

      const unions = getUnionRegistry();
      if (!Array.isArray(unions)) {
        return unionId;
      }

      const union = unions.find((entry) => entry && entry.id === unionId);
      if (!union) {
        return unionId;
      }

      return union.shortName || union.displayName || union.id;
    }

    function getScoringDisplay(server) {
      const scoringModel = getResolvedScoringModel();
      const scoringField = scoringModel.serverField;
      const resourceLabel = scoringModel.resourceLabel;
      const unconfiguredLabel = scoringModel.unconfiguredLabel;
      const scoringValue = server && server.scoring && Number.isFinite(Number(server.scoring[scoringField]))
        ? Number(server.scoring[scoringField])
        : null;

      if (scoringValue === null) {
        return unconfiguredLabel;
      }

      return `${scoringValue.toLocaleString()} ${resourceLabel}`;
    }

    function getServerSummary(server) {
      const tileStats = getTileOwnershipStats(server);
      const structuresByType = getStructureCaptureByType(server);

      return {
        serverId: server ? server.id : null,
        serverLabel: server ? server.label : "Unknown Server",
        activeUnionId: server ? normalizeOwnerId(server.activeUnionId) : null,
        activeUnionLabel: getUnionLabel(server ? server.activeUnionId : null),
        tilesOwned: tileStats.ownedTiles,
        totalTiles: tileStats.totalTiles,
        territoryPercent: tileStats.territoryPercent,
        structuresByType,
        scoringDisplay: getScoringDisplay(server)
      };
    }

    return {
      getServerTileOwner,
      getTileOwnershipStats,
      getStructureCaptureByType,
      getServerSummary
    };
  }

  globalScope.createSummaryService = createSummaryService;
})(window);
