(function initializeStrategicNodeNetworkProjectionService(globalScope) {
  class StrategicNodeNetworkProjectionError extends Error {
    constructor(code, message, errors, warnings) {
      super(message);
      this.name = "StrategicNodeNetworkProjectionError";
      this.code = code;
      this.errors = errors;
      this.warnings = warnings;
    }
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map(deepClone);
    }
    if (!isPlainObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      clone[key] = deepClone(value[key]);
    });
    return clone;
  }

  function createStrategicNodeNetworkProjectionService(options) {
    if (!isPlainObject(options)) {
      throw new TypeError("createStrategicNodeNetworkProjectionService requires options to be a plain object.");
    }

    if (typeof options.validateStrategicNodeNetworkMap !== "function") {
      throw new TypeError("createStrategicNodeNetworkProjectionService requires options.validateStrategicNodeNetworkMap to be a function.");
    }

    const validator = options.validateStrategicNodeNetworkMap.bind(options);

    function project(mapData) {
      const validationResult = validator(mapData);
      if (!validationResult || validationResult.valid !== true) {
        const errors = Array.isArray(validationResult && validationResult.errors) ? deepClone(validationResult.errors) : [];
        const warnings = Array.isArray(validationResult && validationResult.warnings) ? deepClone(validationResult.warnings) : [];
        throw new StrategicNodeNetworkProjectionError("INVALID_MAP_DATA", "Strategic node network projection requires valid map data.", errors, warnings);
      }

      const projection = {
        seasonId: mapData.seasonId,
        baseMapId: mapData.baseMapId,
        topologyType: mapData.topologyType,
        dimensions: deepClone(mapData.dimensions),
        nodes: mapData.nodes.map((node) => {
          const nodeTypeEntry = mapData.nodeTypes[node.typeCode];
          return {
            nodeId: node.nodeId,
            typeCode: node.typeCode,
            type: nodeTypeEntry.type,
            level: nodeTypeEntry.level,
            capturable: nodeTypeEntry.capturable,
            position: deepClone(node.position)
          };
        }),
        connections: mapData.connections.map((connection) => ({
          connectionId: connection.connectionId,
          fromNodeId: connection.fromNodeId,
          toNodeId: connection.toNodeId
        }))
      };

      return deepClone(projection);
    }

    return { project };
  }

  const exportsObject = {
    createStrategicNodeNetworkProjectionService,
    StrategicNodeNetworkProjectionError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
