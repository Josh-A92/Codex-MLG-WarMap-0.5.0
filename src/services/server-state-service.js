(function initializeServerStateServiceFactory(globalScope) {
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => deepClone(item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const clone = {};
    Object.keys(value).forEach((key) => {
      clone[key] = deepClone(value[key]);
    });

    return clone;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Server State Service requires ${fieldName} to be a non-empty string.`);
    }

    return value;
  }

  function normalizeOwnerId(ownerId, fieldName, allowUndefined) {
    if (ownerId === undefined && allowUndefined) {
      return null;
    }

    if (ownerId === null) {
      return null;
    }

    if (typeof ownerId === "string" && ownerId.trim() !== "") {
      return ownerId;
    }

    throw new Error(`Server State Service requires ${fieldName} to be null or a non-empty string.`);
  }

  function createServerStateService(initialSeasonState) {
    if (!isPlainObject(initialSeasonState)) {
      throw new Error("Server State Service requires initialSeasonState to be an object.");
    }

    const seasonId = requireNonEmptyString(initialSeasonState.seasonId, "seasonId");
    const baseMapId = requireNonEmptyString(initialSeasonState.baseMapId, "baseMapId");

    if (!Array.isArray(initialSeasonState.servers)) {
      throw new Error("Server State Service requires servers to be an array.");
    }

    const state = {
      seasonId,
      baseMapId,
      serversById: new Map(),
      serverIds: []
    };

    initialSeasonState.servers.forEach((server, index) => {
      if (!isPlainObject(server)) {
        throw new Error(`Server State Service requires servers[${index}] to be an object.`);
      }

      const serverId = requireNonEmptyString(server.id, `servers[${index}].id`);
      if (state.serversById.has(serverId)) {
        throw new Error(`Server State Service requires unique server ids. Duplicate id '${serverId}'.`);
      }

      const ownershipSource = Object.prototype.hasOwnProperty.call(server, "ownership")
        ? server.ownership
        : {};
      if (!isPlainObject(ownershipSource)) {
        throw new Error(`Server State Service requires servers[${index}].ownership to be an object when supplied.`);
      }

      const ownership = {};
      Object.keys(ownershipSource).forEach((territoryKey) => {
        requireNonEmptyString(territoryKey, `servers[${index}].ownership key '${territoryKey}'`);

        ownership[territoryKey] = normalizeOwnerId(
          ownershipSource[territoryKey],
          `servers[${index}].ownership['${territoryKey}']`,
          false
        );
      });

      const serverState = deepClone(server);
      serverState.ownership = ownership;

      state.serversById.set(serverId, serverState);
      state.serverIds.push(serverId);
    });

    function requireServer(serverId) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      if (!state.serversById.has(normalizedServerId)) {
        throw new Error(`Server State Service could not find server '${normalizedServerId}'.`);
      }

      return state.serversById.get(normalizedServerId);
    }

    function requireTerritoryKey(territoryKey) {
      return requireNonEmptyString(territoryKey, "territoryKey");
    }

    function getSeasonId() {
      return state.seasonId;
    }

    function getBaseMapId() {
      return state.baseMapId;
    }

    function listServers() {
      return state.serverIds.map((serverId) => deepClone(state.serversById.get(serverId)));
    }

    function getServer(serverId) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      if (!state.serversById.has(normalizedServerId)) {
        return null;
      }

      return deepClone(state.serversById.get(normalizedServerId));
    }

    function hasServer(serverId) {
      const normalizedServerId = requireNonEmptyString(serverId, "serverId");
      return state.serversById.has(normalizedServerId);
    }

    function getTerritoryOwnership(serverId) {
      const server = requireServer(serverId);
      return deepClone(server.ownership || {});
    }

    function getTerritoryOwner(serverId, territoryKey, fallbackOwnerId) {
      const server = requireServer(serverId);
      const normalizedTerritoryKey = requireTerritoryKey(territoryKey);
      const ownership = server.ownership || {};

      if (Object.prototype.hasOwnProperty.call(ownership, normalizedTerritoryKey)) {
        return ownership[normalizedTerritoryKey];
      }

      return normalizeOwnerId(fallbackOwnerId, "fallbackOwnerId", true);
    }

    function setTerritoryOwner(serverId, territoryKey, ownerId) {
      const server = requireServer(serverId);
      const normalizedTerritoryKey = requireTerritoryKey(territoryKey);
      const normalizedOwnerId = normalizeOwnerId(ownerId, "ownerId", false);
      const ownership = server.ownership || {};

      ownership[normalizedTerritoryKey] = normalizedOwnerId;
      server.ownership = ownership;

      return normalizedOwnerId;
    }

    return {
      getSeasonId,
      getBaseMapId,
      listServers,
      getServer,
      hasServer,
      getTerritoryOwnership,
      getTerritoryOwner,
      setTerritoryOwner
    };
  }

  globalScope.createServerStateService = createServerStateService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createServerStateService
    };
  }
})(typeof window !== "undefined" ? window : globalThis);