(function initializeStrategicNodeNetworkMapValidator(globalScope) {
  const EXPECTED_SCHEMA_VERSION = 1;
  const EXPECTED_TOPOLOGY_TYPE = "strategic_node_network";
  const DANGEROUS_METADATA_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  const ALLOWED_MAP_KEYS = [
    "schemaVersion",
    "seasonId",
    "baseMapId",
    "topologyType",
    "dimensions",
    "sourceEvidence",
    "nodeTypes",
    "nodes",
    "connections",
    "provisionalCommunityClaims",
    "resolvedDiscrepancies"
  ];

  const ALLOWED_DIMENSIONS_KEYS = ["rows", "columns"];
  const ALLOWED_NODE_KEYS = ["nodeId", "typeCode", "position"];
  const ALLOWED_POSITION_KEYS = ["row", "column"];
  const ALLOWED_CONNECTION_KEYS = ["connectionId", "fromNodeId", "toNodeId"];
  const ALLOWED_NODE_TYPE_ENTRY_KEYS = ["type", "level", "capturable"];

  function pushError(errors, code, path, message) {
    errors.push({ code, path, message });
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function validateNonEmptyString(errors, value, path, label) {
    if (typeof value !== "string" || value.trim() === "") {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    return true;
  }

  function validatePositiveInteger(errors, value, path, label) {
    if (!Number.isInteger(value) || value <= 0) {
      pushError(errors, "INVALID_INTEGER", path, `${label} must be a positive integer.`);
      return false;
    }

    return true;
  }

  function checkUnknownFields(errors, value, allowedKeys, path) {
    Object.keys(value).sort().forEach((key) => {
      if (!allowedKeys.includes(key)) {
        const unknownPath = path ? `${path}.${key}` : key;
        pushError(errors, "UNKNOWN_FIELD", unknownPath, `Unknown field '${key}'.`);
      }
    });
  }

  function validateJsonCompatibleMetadata(value, errors, path, seen) {
    if (value === null) {
      return;
    }

    if (typeof value === "string" || typeof value === "boolean") {
      return;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        pushError(errors, "INVALID_METADATA_VALUE", path, `${path || "metadata"} contains a non-finite number.`);
      }
      return;
    }

    if (typeof value === "function") {
      pushError(errors, "INVALID_METADATA_VALUE", path, `${path || "metadata"} contains a function value.`);
      return;
    }

    if (typeof value !== "object") {
      pushError(errors, "INVALID_METADATA_VALUE", path, `${path || "metadata"} contains an unsupported value type.`);
      return;
    }

    if (seen.has(value)) {
      pushError(errors, "METADATA_CYCLE_DETECTED", path, `${path || "metadata"} must be acyclic.`);
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        validateJsonCompatibleMetadata(entry, errors, `${path}[${index}]`, seen);
      });
      seen.delete(value);
      return;
    }

    if (!isPlainObject(value)) {
      pushError(errors, "INVALID_METADATA_VALUE", path, `${path || "metadata"} must use plain JSON-compatible objects.`);
      seen.delete(value);
      return;
    }

    Object.keys(value).sort().forEach((key) => {
      if (DANGEROUS_METADATA_KEYS.has(key)) {
        pushError(errors, "UNSAFE_METADATA_KEY", `${path}.${key}`, `Unsafe metadata key '${key}' is not allowed.`);
        return;
      }

      validateJsonCompatibleMetadata(value[key], errors, `${path}.${key}`, seen);
    });

    seen.delete(value);
  }

  function validateDimensions(dimensions, errors) {
    if (!isPlainObject(dimensions)) {
      pushError(errors, "INVALID_OBJECT", "dimensions", "dimensions must be a plain object.");
      return;
    }

    checkUnknownFields(errors, dimensions, ALLOWED_DIMENSIONS_KEYS, "dimensions");

    if (!Object.prototype.hasOwnProperty.call(dimensions, "rows")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "dimensions.rows", "dimensions.rows is required.");
    } else {
      validatePositiveInteger(errors, dimensions.rows, "dimensions.rows", "dimensions.rows");
    }

    if (!Object.prototype.hasOwnProperty.call(dimensions, "columns")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "dimensions.columns", "dimensions.columns is required.");
    } else {
      validatePositiveInteger(errors, dimensions.columns, "dimensions.columns", "dimensions.columns");
    }
  }

  function validateNodeTypes(nodeTypes, errors) {
    if (!isPlainObject(nodeTypes)) {
      pushError(errors, "INVALID_OBJECT", "nodeTypes", "nodeTypes must be a plain object.");
      return;
    }

    Object.keys(nodeTypes).sort().forEach((typeCode) => {
      const entryPath = `nodeTypes.${typeCode}`;
      const entry = nodeTypes[typeCode];

      if (typeof typeCode !== "string" || typeCode.trim() === "") {
        pushError(errors, "INVALID_STRING", entryPath, `${entryPath} key must be a non-empty string.`);
        return;
      }

      if (!isPlainObject(entry)) {
        pushError(errors, "INVALID_OBJECT", entryPath, `${entryPath} must be a plain object.`);
        return;
      }

      checkUnknownFields(errors, entry, ALLOWED_NODE_TYPE_ENTRY_KEYS, entryPath);

      if (!Object.prototype.hasOwnProperty.call(entry, "type")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${entryPath}.type`, `${entryPath}.type is required.`);
      } else {
        validateNonEmptyString(errors, entry.type, `${entryPath}.type`, `${entryPath}.type`);
      }

      if (!Object.prototype.hasOwnProperty.call(entry, "capturable")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${entryPath}.capturable`, `${entryPath}.capturable is required.`);
      } else if (typeof entry.capturable !== "boolean") {
        pushError(errors, "INVALID_BOOLEAN", `${entryPath}.capturable`, `${entryPath}.capturable must be a boolean.`);
      }

      if (!Object.prototype.hasOwnProperty.call(entry, "level")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${entryPath}.level`, `${entryPath}.level is required.`);
      } else {
        validatePositiveInteger(errors, entry.level, `${entryPath}.level`, `${entryPath}.level`);
      }
    });
  }

  function isValidCoordinate(value, max) {
    return typeof value === "number"
      && Number.isFinite(value)
      && value > 0
      && value <= max
      && Number.isInteger(value * 2);
  }

  function validateNodes(nodes, nodeTypes, dimensions, errors) {
    if (!Array.isArray(nodes)) {
      pushError(errors, "INVALID_ARRAY", "nodes", "nodes must be an array.");
      return {
        nodeIds: new Set(),
        nodePositions: new Set()
      };
    }

    const nodeIds = new Set();
    const nodePositions = new Set();
    const rowMax = dimensions && dimensions.rows;
    const columnMax = dimensions && dimensions.columns;

    nodes.forEach((node, index) => {
      const path = `nodes[${index}]`;

      if (!isPlainObject(node)) {
        pushError(errors, "INVALID_OBJECT", path, `${path} must be a plain object.`);
        return;
      }

      checkUnknownFields(errors, node, ALLOWED_NODE_KEYS, path);

      if (!Object.prototype.hasOwnProperty.call(node, "nodeId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.nodeId`, `${path}.nodeId is required.`);
      } else if (validateNonEmptyString(errors, node.nodeId, `${path}.nodeId`, `${path}.nodeId`)) {
        if (nodeIds.has(node.nodeId)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.nodeId`, `Duplicate nodeId '${node.nodeId}'.`);
        }
        nodeIds.add(node.nodeId);
      }

      if (!Object.prototype.hasOwnProperty.call(node, "typeCode")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.typeCode`, `${path}.typeCode is required.`);
      } else if (validateNonEmptyString(errors, node.typeCode, `${path}.typeCode`, `${path}.typeCode`)) {
        if (!isPlainObject(nodeTypes) || !Object.prototype.hasOwnProperty.call(nodeTypes, node.typeCode)) {
          pushError(errors, "UNRESOLVED_TYPE_REFERENCE", `${path}.typeCode`, `${path}.typeCode '${node.typeCode}' does not resolve to nodeTypes.`);
        }
      }

      if (!Object.prototype.hasOwnProperty.call(node, "position")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.position`, `${path}.position is required.`);
      } else if (!isPlainObject(node.position)) {
        pushError(errors, "INVALID_OBJECT", `${path}.position`, `${path}.position must be a plain object.`);
      } else {
        checkUnknownFields(errors, node.position, ALLOWED_POSITION_KEYS, `${path}.position`);

        let row = null;
        let column = null;

        if (!Object.prototype.hasOwnProperty.call(node.position, "row")) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.position.row`, `${path}.position.row is required.`);
        } else {
          row = node.position.row;
          if (!isValidCoordinate(row, rowMax)) {
            pushError(errors, "INVALID_COORDINATE", `${path}.position.row`, `${path}.position.row must be a positive finite coordinate within dimensions.rows using integer or .5 increments.`);
          }
        }

        if (!Object.prototype.hasOwnProperty.call(node.position, "column")) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.position.column`, `${path}.position.column is required.`);
        } else {
          column = node.position.column;
          if (!isValidCoordinate(column, columnMax)) {
            pushError(errors, "INVALID_COORDINATE", `${path}.position.column`, `${path}.position.column must be a positive finite coordinate within dimensions.columns using integer or .5 increments.`);
          }
        }

        if (row !== null && column !== null && isValidCoordinate(row, rowMax) && isValidCoordinate(column, columnMax)) {
          const positionKey = `${row}|${column}`;
          if (nodePositions.has(positionKey)) {
            pushError(errors, "DUPLICATE_POSITION", `${path}.position`, `Duplicate node position '${positionKey}'.`);
          }
          nodePositions.add(positionKey);
        }
      }
    });

    return { nodeIds, nodePositions };
  }

  function validateConnections(connections, nodeIds, errors) {
    if (!Array.isArray(connections)) {
      pushError(errors, "INVALID_ARRAY", "connections", "connections must be an array.");
      return;
    }

    const connectionIds = new Set();
    const undirectedPairs = new Set();

    connections.forEach((connection, index) => {
      const path = `connections[${index}]`;

      if (!isPlainObject(connection)) {
        pushError(errors, "INVALID_OBJECT", path, `${path} must be a plain object.`);
        return;
      }

      checkUnknownFields(errors, connection, ALLOWED_CONNECTION_KEYS, path);

      let fromNodeId = null;
      let toNodeId = null;

      if (!Object.prototype.hasOwnProperty.call(connection, "connectionId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.connectionId`, `${path}.connectionId is required.`);
      } else if (validateNonEmptyString(errors, connection.connectionId, `${path}.connectionId`, `${path}.connectionId`)) {
        if (connectionIds.has(connection.connectionId)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.connectionId`, `Duplicate connectionId '${connection.connectionId}'.`);
        }
        connectionIds.add(connection.connectionId);
      }

      if (!Object.prototype.hasOwnProperty.call(connection, "fromNodeId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.fromNodeId`, `${path}.fromNodeId is required.`);
      } else if (validateNonEmptyString(errors, connection.fromNodeId, `${path}.fromNodeId`, `${path}.fromNodeId`)) {
        fromNodeId = connection.fromNodeId;
        if (!nodeIds.has(fromNodeId)) {
          pushError(errors, "UNRESOLVED_NODE_REFERENCE", `${path}.fromNodeId`, `${path}.fromNodeId '${fromNodeId}' does not resolve to nodes.`);
        }
      }

      if (!Object.prototype.hasOwnProperty.call(connection, "toNodeId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.toNodeId`, `${path}.toNodeId is required.`);
      } else if (validateNonEmptyString(errors, connection.toNodeId, `${path}.toNodeId`, `${path}.toNodeId`)) {
        toNodeId = connection.toNodeId;
        if (!nodeIds.has(toNodeId)) {
          pushError(errors, "UNRESOLVED_NODE_REFERENCE", `${path}.toNodeId`, `${path}.toNodeId '${toNodeId}' does not resolve to nodes.`);
        }
      }

      if (fromNodeId !== null && toNodeId !== null) {
        if (fromNodeId === toNodeId) {
          pushError(errors, "SELF_CONNECTION", path, `${path} must not connect a node to itself.`);
        }

        const pair = [fromNodeId, toNodeId].sort().join("|");
        if (undirectedPairs.has(pair)) {
          pushError(errors, "DUPLICATE_UNDIRECTED_CONNECTION", path, `Duplicate undirected connection pair '${pair}'.`);
        }
        undirectedPairs.add(pair);
      }
    });
  }

  function validateStrategicNodeNetworkMap(candidate) {
    const errors = [];

    try {
      if (!isPlainObject(candidate)) {
        pushError(errors, "INVALID_CANDIDATE_TYPE", "", "Map candidate must be a plain object.");
        return { valid: false, errors, warnings: [] };
      }

      checkUnknownFields(errors, candidate, ALLOWED_MAP_KEYS, "");

      if (!Object.prototype.hasOwnProperty.call(candidate, "schemaVersion")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "schemaVersion", "schemaVersion is required.");
      } else if (candidate.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
        pushError(errors, "INVALID_SCHEMA_VERSION", "schemaVersion", `schemaVersion must be exactly ${EXPECTED_SCHEMA_VERSION}.`);
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "seasonId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "seasonId", "seasonId is required.");
      } else {
        validateNonEmptyString(errors, candidate.seasonId, "seasonId", "seasonId");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "baseMapId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "baseMapId", "baseMapId is required.");
      } else {
        validateNonEmptyString(errors, candidate.baseMapId, "baseMapId", "baseMapId");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "topologyType")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "topologyType", "topologyType is required.");
      } else if (candidate.topologyType !== EXPECTED_TOPOLOGY_TYPE) {
        pushError(errors, "INVALID_TOPOLOGY_TYPE", "topologyType", `topologyType must be '${EXPECTED_TOPOLOGY_TYPE}'.`);
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "dimensions")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "dimensions", "dimensions is required.");
      } else {
        validateDimensions(candidate.dimensions, errors);
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "sourceEvidence")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "sourceEvidence", "sourceEvidence is required.");
      } else if (!isPlainObject(candidate.sourceEvidence)) {
        pushError(errors, "INVALID_OBJECT", "sourceEvidence", "sourceEvidence must be a plain object.");
      } else {
        validateJsonCompatibleMetadata(candidate.sourceEvidence, errors, "sourceEvidence", new Set());
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "nodeTypes")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "nodeTypes", "nodeTypes is required.");
      } else {
        validateNodeTypes(candidate.nodeTypes, errors);
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "nodes")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "nodes", "nodes is required.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "connections")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "connections", "connections is required.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "provisionalCommunityClaims")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "provisionalCommunityClaims", "provisionalCommunityClaims is required.");
      } else if (!Array.isArray(candidate.provisionalCommunityClaims)) {
        pushError(errors, "INVALID_ARRAY", "provisionalCommunityClaims", "provisionalCommunityClaims must be an array.");
      } else {
        validateJsonCompatibleMetadata(candidate.provisionalCommunityClaims, errors, "provisionalCommunityClaims", new Set());
      }

      if (!Object.prototype.hasOwnProperty.call(candidate, "resolvedDiscrepancies")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "resolvedDiscrepancies", "resolvedDiscrepancies is required.");
      } else if (!Array.isArray(candidate.resolvedDiscrepancies)) {
        pushError(errors, "INVALID_ARRAY", "resolvedDiscrepancies", "resolvedDiscrepancies must be an array.");
      } else {
        validateJsonCompatibleMetadata(candidate.resolvedDiscrepancies, errors, "resolvedDiscrepancies", new Set());
      }

      const nodeValidation = validateNodes(
        candidate.nodes,
        candidate.nodeTypes,
        candidate.dimensions,
        errors
      );

      validateConnections(candidate.connections, nodeValidation.nodeIds, errors);

      return {
        valid: errors.length === 0,
        errors,
        warnings: []
      };
    } catch (error) {
      pushError(errors, "VALIDATOR_RUNTIME_ERROR", "", `Validation failed unexpectedly: ${error && error.message ? error.message : "unknown error"}`);
      return {
        valid: false,
        errors,
        warnings: []
      };
    }
  }

  globalScope.validateStrategicNodeNetworkMap = validateStrategicNodeNetworkMap;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateStrategicNodeNetworkMap
    };
  }
})(globalThis);
