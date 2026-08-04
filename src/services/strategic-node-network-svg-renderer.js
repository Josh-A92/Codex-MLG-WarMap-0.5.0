(function initializeStrategicNodeNetworkSvgRenderer(globalScope) {
  const ALLOWED_THEME_KEYS = new Set([
    "panelBackground",
    "panelBorder",
    "panelAccent",
    "panelText",
    "connectionStroke",
    "nodeFill",
    "nodeBorder",
    "nodeSelectedFill",
    "nodeSelectedBorder",
    "nodeText"
  ]);
  const ALLOWED_OPTION_KEYS = new Set(["selectedNodeId", "theme", "assetByTypeCode"]);
  const DEFAULT_THEME = {
    panelBackground: "#161616",
    panelBorder: "#6a4b00",
    panelAccent: "#f1b24a",
    panelText: "#f7e2b8",
    connectionStroke: "#d49f3d",
    nodeFill: "#2b2317",
    nodeBorder: "#b17818",
    nodeSelectedFill: "#6a4010",
    nodeSelectedBorder: "#ffd27a",
    nodeText: "#f8f0d4"
  };

  class StrategicNodeNetworkSvgRendererError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "StrategicNodeNetworkSvgRendererError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new StrategicNodeNetworkSvgRendererError(code, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
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
      defineOwnDataProperty(clone, key, deepClone(value[key]));
    });
    return clone;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function validateProjection(projection) {
    if (!isPlainObject(projection)) {
      fail("INVALID_PROJECTION", "Projection must be a plain object.");
    }

    if (typeof projection.seasonId !== "string" || projection.seasonId.trim() === "") {
      fail("INVALID_PROJECTION", "Projection.seasonId must be a non-empty string.");
    }
    if (typeof projection.baseMapId !== "string" || projection.baseMapId.trim() === "") {
      fail("INVALID_PROJECTION", "Projection.baseMapId must be a non-empty string.");
    }
    if (projection.topologyType !== "strategic_node_network") {
      fail("INVALID_PROJECTION", "Projection.topologyType must be 'strategic_node_network'.");
    }
    if (!isPlainObject(projection.dimensions)) {
      fail("INVALID_PROJECTION", "Projection.dimensions must be a plain object.");
    }
    if (!Number.isInteger(projection.dimensions.rows) || projection.dimensions.rows <= 0) {
      fail("INVALID_PROJECTION", "Projection.dimensions.rows must be a positive integer.");
    }
    if (!Number.isInteger(projection.dimensions.columns) || projection.dimensions.columns <= 0) {
      fail("INVALID_PROJECTION", "Projection.dimensions.columns must be a positive integer.");
    }
    if (!Array.isArray(projection.nodes)) {
      fail("INVALID_PROJECTION", "Projection.nodes must be an array.");
    }
    if (!Array.isArray(projection.connections)) {
      fail("INVALID_PROJECTION", "Projection.connections must be an array.");
    }

    const nodeIds = new Set();
    projection.nodes.forEach((node, index) => {
      if (!isPlainObject(node)) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}] must be a plain object.`);
      }
      if (typeof node.nodeId !== "string" || node.nodeId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].nodeId must be a non-empty string.`);
      }
      if (nodeIds.has(node.nodeId)) {
        fail("INVALID_PROJECTION", `Projection contains a duplicate nodeId '${node.nodeId}'.`);
      }
      nodeIds.add(node.nodeId);
      if (typeof node.typeCode !== "string" || node.typeCode.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].typeCode must be a non-empty string.`);
      }
      if (typeof node.type !== "string" || node.type.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].type must be a non-empty string.`);
      }
      if (!Number.isInteger(node.level) || node.level <= 0) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].level must be a positive integer.`);
      }
      if (typeof node.capturable !== "boolean") {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].capturable must be a boolean.`);
      }
      if (!isPlainObject(node.position)) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].position must be a plain object.`);
      }
      if (typeof node.position.row !== "number" || !Number.isFinite(node.position.row)) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].position.row must be a finite number.`);
      }
      if (typeof node.position.column !== "number" || !Number.isFinite(node.position.column)) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].position.column must be a finite number.`);
      }
      if (node.position.row < 1 || node.position.row > projection.dimensions.rows) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].position.row is outside the declared dimensions.`);
      }
      if (node.position.column < 1 || node.position.column > projection.dimensions.columns) {
        fail("INVALID_PROJECTION", `Projection.nodes[${index}].position.column is outside the declared dimensions.`);
      }
    });

    const connectionIds = new Set();
    projection.connections.forEach((connection, index) => {
      if (!isPlainObject(connection)) {
        fail("INVALID_PROJECTION", `Projection.connections[${index}] must be a plain object.`);
      }
      if (typeof connection.connectionId !== "string" || connection.connectionId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.connections[${index}].connectionId must be a non-empty string.`);
      }
      if (connectionIds.has(connection.connectionId)) {
        fail("INVALID_PROJECTION", `Projection contains a duplicate connectionId '${connection.connectionId}'.`);
      }
      connectionIds.add(connection.connectionId);
      if (typeof connection.fromNodeId !== "string" || connection.fromNodeId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.connections[${index}].fromNodeId must be a non-empty string.`);
      }
      if (typeof connection.toNodeId !== "string" || connection.toNodeId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.connections[${index}].toNodeId must be a non-empty string.`);
      }
      if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) {
        fail("INVALID_PROJECTION", `Projection.connections[${index}] resolves to an unknown node reference.`);
      }
    });
  }

  function validateOptions(options, projection) {
    const normalizedOptions = {
      selectedNodeId: null,
      theme: {},
      assetByTypeCode: {}
    };
    const availableTypeCodes = new Set(projection.nodes.map((node) => node.typeCode));

    if (options === undefined) {
      return normalizedOptions;
    }
    if (!isPlainObject(options)) {
      fail("INVALID_OPTIONS", "Options must be a plain object.");
    }

    const providedKeys = Object.keys(options).sort();
    providedKeys.forEach((key) => {
      if (!ALLOWED_OPTION_KEYS.has(key)) {
        fail("INVALID_OPTIONS", `Options contains an unknown field '${key}'.`);
      }
    });

    if (Object.prototype.hasOwnProperty.call(options, "selectedNodeId")) {
      if (options.selectedNodeId !== null && (typeof options.selectedNodeId !== "string" || options.selectedNodeId.trim() === "")) {
        fail("INVALID_OPTIONS", "Options.selectedNodeId must be a non-empty string or null.");
      }
      if (options.selectedNodeId !== null && !projection.nodes.some((node) => node.nodeId === options.selectedNodeId)) {
        fail("INVALID_OPTIONS", "Options.selectedNodeId must resolve to a projected node.");
      }
      normalizedOptions.selectedNodeId = options.selectedNodeId;
    }

    if (Object.prototype.hasOwnProperty.call(options, "theme")) {
      if (!isPlainObject(options.theme)) {
        fail("INVALID_OPTIONS", "Options.theme must be a plain object.");
      }
      const themeKeys = Object.keys(options.theme).sort();
      themeKeys.forEach((key) => {
        if (!ALLOWED_THEME_KEYS.has(key)) {
          fail("INVALID_OPTIONS", `Options.theme contains an unknown field '${key}'.`);
        }
      });
      Object.keys(options.theme).forEach((key) => {
        const value = options.theme[key];
        if (typeof value !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
          fail("INVALID_OPTIONS", `Options.theme.${key} must be a valid hex colour.`);
        }
      });
      normalizedOptions.theme = deepClone(options.theme);
    }

    if (Object.prototype.hasOwnProperty.call(options, "assetByTypeCode")) {
      if (!isPlainObject(options.assetByTypeCode)) {
        fail("INVALID_OPTIONS", "Options.assetByTypeCode must be a plain object.");
      }
      Object.keys(options.assetByTypeCode).forEach((key) => {
        const value = options.assetByTypeCode[key];
        if (typeof value !== "string" || value.trim() === "") {
          fail("INVALID_OPTIONS", `Options.assetByTypeCode.${key} must be a non-empty string.`);
        }
        if (!availableTypeCodes.has(key)) {
          fail("INVALID_OPTIONS", `Options.assetByTypeCode.${key} uses an unknown typeCode key.`);
        }
        if (/^(?:javascript|vbscript):/i.test(value) || value.startsWith("//") || value.includes("\u0000") || /[\u0001-\u001f]/.test(value)) {
          fail("INVALID_OPTIONS", `Options.assetByTypeCode.${key} contains an unsafe asset path.`);
        }
        if (value.startsWith("/") || value.startsWith("\\") || value.includes("\\") || value.includes(":") || value.startsWith(".") || /(^|\/)\.\.(\/|$)/.test(value)) {
          fail("INVALID_OPTIONS", `Options.assetByTypeCode.${key} must be a relative asset path.`);
        }
      });
      normalizedOptions.assetByTypeCode = deepClone(options.assetByTypeCode);
    }

    return normalizedOptions;
  }

  function resolveTheme(theme) {
    const merged = { ...DEFAULT_THEME, ...theme };
    return {
      panelBackground: merged.panelBackground,
      panelBorder: merged.panelBorder,
      panelAccent: merged.panelAccent,
      panelText: merged.panelText,
      connectionStroke: merged.connectionStroke,
      nodeFill: merged.nodeFill,
      nodeBorder: merged.nodeBorder,
      nodeSelectedFill: merged.nodeSelectedFill,
      nodeSelectedBorder: merged.nodeSelectedBorder,
      nodeText: merged.nodeText
    };
  }

  function formatLevelText(level) {
    return `L${level}`;
  }

  function formatTypeText(type) {
    return type
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("");
  }

  function renderNode(node, theme, selectedNodeId, assetByTypeCode) {
    const nodeId = escapeAttribute(node.nodeId);
    const typeCode = escapeAttribute(node.typeCode);
    const typeText = escapeText(formatTypeText(node.type));
    const levelText = escapeText(formatLevelText(node.level));
    const fullLabel = escapeText(`Level ${node.level} ${node.type}`);
    const isSelected = selectedNodeId !== null && selectedNodeId === node.nodeId;
    const classes = ["strategic-node-network-node", isSelected ? "selected" : ""];
    const assetPath = assetByTypeCode[node.typeCode];
    const scale = 40;
    const cx = node.position.column * scale;
    const cy = node.position.row * scale;
    const radius = 18;
    const x = cx - radius;
    const y = cy - radius;

    const assetMarkup = assetPath
      ? `
        <image href="${escapeAttribute(assetPath)}" x="${cx - 12}" y="${cy - 12}" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
        <rect x="${cx - 11}" y="${cy - 11}" width="14" height="10" rx="3" ry="3" fill="${escapeAttribute(theme.panelAccent)}" stroke="${escapeAttribute(theme.nodeBorder)}" stroke-width="1" />
        <text x="${cx - 4}" y="${cy - 3}" text-anchor="start" class="strategic-node-network-node-badge" fill="${escapeAttribute(theme.nodeText)}">${levelText}</text>
      `
      : `
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="strategic-node-network-node-fallback" fill="${escapeAttribute(theme.nodeText)}">${typeText}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" class="strategic-node-network-node-level" fill="${escapeAttribute(theme.nodeText)}">${levelText}</text>
      `;

    return `
      <g class="${classes.filter(Boolean).join(" ")}" data-node-id="${nodeId}" data-type-code="${typeCode}">
        <title>${fullLabel}</title>
        <rect x="${x}" y="${y}" width="${radius * 2}" height="${radius * 2}" rx="8" ry="8" fill="${escapeAttribute(isSelected ? theme.nodeSelectedFill : theme.nodeFill)}" stroke="${escapeAttribute(isSelected ? theme.nodeSelectedBorder : theme.nodeBorder)}" stroke-width="2" />
        ${assetMarkup}
      </g>`;
  }

  function createStrategicNodeNetworkSvgRenderer() {
    function render(projection, options) {
      const validatedProjection = deepClone(projection);
      validateProjection(validatedProjection);
      const normalizedOptions = validateOptions(options, validatedProjection);
      const theme = resolveTheme(normalizedOptions.theme);
      const assetByTypeCode = normalizedOptions.assetByTypeCode;
      const scale = 40;
      const viewBox = `0 0 ${validatedProjection.dimensions.columns * scale + 40} ${validatedProjection.dimensions.rows * scale + 40}`;
      const connectionMarkup = validatedProjection.connections.map((connection) => {
        const fromNode = validatedProjection.nodes.find((node) => node.nodeId === connection.fromNodeId);
        const toNode = validatedProjection.nodes.find((node) => node.nodeId === connection.toNodeId);
        if (!fromNode || !toNode) {
          return "";
        }
        return `<line x1="${fromNode.position.column * scale}" y1="${fromNode.position.row * scale}" x2="${toNode.position.column * scale}" y2="${toNode.position.row * scale}" class="strategic-node-network-connection" stroke="${escapeAttribute(theme.connectionStroke)}" />`;
      }).join("");
      const nodeMarkup = validatedProjection.nodes.map((node) => renderNode(node, theme, normalizedOptions.selectedNodeId, assetByTypeCode)).join("");

      const markup = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(viewBox)}" class="strategic-node-network-svg" role="img" aria-label="${escapeAttribute(validatedProjection.seasonId)} map">
          <rect x="0" y="0" width="100%" height="100%" fill="${escapeAttribute(theme.panelBackground)}" stroke="${escapeAttribute(theme.panelBorder)}" stroke-width="4" />
          <g class="strategic-node-network-connections">${connectionMarkup}</g>
          <g class="strategic-node-network-nodes">${nodeMarkup}</g>
        </svg>`;

      return {
        markup,
        viewBox,
        nodeCount: validatedProjection.nodes.length,
        connectionCount: validatedProjection.connections.length
      };
    }

    return { render };
  }

  const exportsObject = {
    createStrategicNodeNetworkSvgRenderer,
    StrategicNodeNetworkSvgRendererError
  };

  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
