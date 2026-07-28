(function initializeOwnershipServiceFactory(globalScope) {
  function normalizeOwnerId(ownerId) {
    return ownerId == null ? null : ownerId;
  }

  function createOwnershipService(options) {
    const config = options || {};
    const getUnionRegistry = typeof config.getUnionRegistry === "function"
      ? config.getUnionRegistry
      : () => [];
    const getTileByPosition = typeof config.getTileByPosition === "function"
      ? config.getTileByPosition
      : () => null;

    function getUnionById(unionId) {
      if (!unionId) {
        return null;
      }

      const registry = getUnionRegistry();
      if (!Array.isArray(registry)) {
        return null;
      }

      return registry.find((union) => union.id === unionId) || null;
    }

    function getTileOwner(tile) {
      if (!tile || typeof tile !== "object") {
        return null;
      }

      return normalizeOwnerId(tile.ownerId);
    }

    function getTileOwnerLabel(tile) {
      const ownerId = getTileOwner(tile);

      if (!ownerId) {
        return "Unassigned";
      }

      const union = getUnionById(ownerId);
      return union ? union.shortName || union.displayName || ownerId : ownerId;
    }

    function getTileOwnerColor(tile) {
      const ownerId = getTileOwner(tile);

      if (!ownerId) {
        return null;
      }

      const union = getUnionById(ownerId);
      return union && union.color ? union.color : null;
    }

    function setTileOwner(tile, ownerId) {
      if (!tile || typeof tile !== "object") {
        return null;
      }

      tile.ownerId = normalizeOwnerId(ownerId);
      return tile.ownerId;
    }

    function getStructureOwner(structure) {
      if (!structure || typeof structure !== "object") {
        return {
          state: "unassigned",
          ownerId: null,
          union: null
        };
      }

      const rows = Number(structure.rows || 1);
      const cols = Number(structure.cols || 1);
      const startRow = Number(structure.row);
      const startCol = Number(structure.col);

      const ownerIds = [];

      for (let row = startRow; row < startRow + rows; row += 1) {
        for (let col = startCol; col < startCol + cols; col += 1) {
          const tile = getTileByPosition(row, col);
          ownerIds.push(getTileOwner(tile));
        }
      }

      const nonNullOwnerIds = ownerIds.filter((ownerId) => ownerId !== null);
      const uniqueOwned = new Set(nonNullOwnerIds);
      const hasNull = ownerIds.some((ownerId) => ownerId === null);

      if (uniqueOwned.size === 0) {
        return {
          state: "unassigned",
          ownerId: null,
          union: null
        };
      }

      if (uniqueOwned.size === 1 && !hasNull) {
        const [ownerId] = Array.from(uniqueOwned);
        return {
          state: "owned",
          ownerId,
          union: getUnionById(ownerId)
        };
      }

      if (uniqueOwned.size > 1) {
        return {
          state: "contested",
          ownerId: null,
          union: null,
          ownerIds: Array.from(uniqueOwned)
        };
      }

      return {
        state: "partial",
        ownerId: null,
        union: null,
        ownerIds: Array.from(uniqueOwned)
      };
    }

    return {
      getUnionById,
      getTileOwner,
      getTileOwnerLabel,
      getTileOwnerColor,
      setTileOwner,
      getStructureOwner
    };
  }

  globalScope.createOwnershipService = createOwnershipService;
})(window);
