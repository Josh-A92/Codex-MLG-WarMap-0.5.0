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
    "nodeText",
    "mineFieldFill",
    "mineFieldBorder",
    "mineLevel1Fill",
    "mineLevel2Fill",
    "mineLevel3Fill",
    "mineLevel4Fill",
    "mineLevel5Fill",
    "mineLevel6Fill"
  ]);
  const ALLOWED_OPTION_KEYS = new Set(["selectedNodeId", "theme", "assetByTypeCode"]);
  const NODE_SCALE = 72;
  const DEFAULT_THEME = {
    panelBackground: "#d9ad68",
    panelBorder: "#8f826c",
    panelAccent: "#c96a2d",
    panelText: "#5d4d3b",
    connectionStroke: "#c8b89d",
    nodeFill: "#ead7ae",
    nodeBorder: "#705643",
    nodeSelectedFill: "#f5e0a6",
    nodeSelectedBorder: "#c98b1f",
    nodeText: "#4f463d",
    mineFieldFill: "#ead7ae",
    mineFieldBorder: "#705643",
    mineLevel1Fill: "#decda8",
    mineLevel2Fill: "#d9ad68",
    mineLevel3Fill: "#cf8959",
    mineLevel4Fill: "#b96b4e",
    mineLevel5Fill: "#92534c",
    mineLevel6Fill: "#477d78"
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
    if (projection.mineFieldDimensions !== null && !isPlainObject(projection.mineFieldDimensions)) {
      fail("INVALID_PROJECTION", "Projection.mineFieldDimensions must be a plain object or null.");
    }
    if (!Array.isArray(projection.resourceMineTiles)) {
      fail("INVALID_PROJECTION", "Projection.resourceMineTiles must be an array.");
    }
    if (projection.resourceMineTiles.length > 0 && projection.mineFieldDimensions === null) {
      fail("INVALID_PROJECTION", "Projection.mineFieldDimensions is required when resourceMineTiles are present.");
    }

    if (projection.mineFieldDimensions !== null) {
      if (!Number.isInteger(projection.mineFieldDimensions.rows) || projection.mineFieldDimensions.rows <= 0) {
        fail("INVALID_PROJECTION", "Projection.mineFieldDimensions.rows must be a positive integer.");
      }
      if (!Number.isInteger(projection.mineFieldDimensions.columns) || projection.mineFieldDimensions.columns <= 0) {
        fail("INVALID_PROJECTION", "Projection.mineFieldDimensions.columns must be a positive integer.");
      }
    }

    const mineTileIds = new Set();
    const mineTilePositions = new Set();
    projection.resourceMineTiles.forEach((tile, index) => {
      if (!isPlainObject(tile)) {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}] must be a plain object.`);
      }
      if (typeof tile.mineTileId !== "string" || tile.mineTileId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}].mineTileId must be a non-empty string.`);
      }
      if (mineTileIds.has(tile.mineTileId)) {
        fail("INVALID_PROJECTION", `Projection contains a duplicate mineTileId '${tile.mineTileId}'.`);
      }
      mineTileIds.add(tile.mineTileId);
      if (!isPlainObject(tile.position)
          || !Number.isInteger(tile.position.row)
          || !Number.isInteger(tile.position.column)
          || tile.position.row < 1
          || tile.position.column < 1
          || tile.position.row > projection.mineFieldDimensions.rows
          || tile.position.column > projection.mineFieldDimensions.columns) {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}].position must resolve within mineFieldDimensions.`);
      }
      const positionKey = `${tile.position.row}|${tile.position.column}`;
      if (mineTilePositions.has(positionKey)) {
        fail("INVALID_PROJECTION", `Projection contains a duplicate resource-mine position '${positionKey}'.`);
      }
      mineTilePositions.add(positionKey);
      if (!Number.isInteger(tile.level) || tile.level <= 0) {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}].level must be a positive integer.`);
      }
      if (typeof tile.resourceId !== "string" || tile.resourceId.trim() === "") {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}].resourceId must be a non-empty string.`);
      }
      if (typeof tile.outputSpeedPercent !== "number" || !Number.isFinite(tile.outputSpeedPercent) || tile.outputSpeedPercent < 0) {
        fail("INVALID_PROJECTION", `Projection.resourceMineTiles[${index}].outputSpeedPercent must be a finite non-negative number.`);
      }
    });

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
      nodeText: merged.nodeText,
      mineFieldFill: merged.mineFieldFill,
      mineFieldBorder: merged.mineFieldBorder,
      mineLevel1Fill: merged.mineLevel1Fill,
      mineLevel2Fill: merged.mineLevel2Fill,
      mineLevel3Fill: merged.mineLevel3Fill,
      mineLevel4Fill: merged.mineLevel4Fill,
      mineLevel5Fill: merged.mineLevel5Fill,
      mineLevel6Fill: merged.mineLevel6Fill
    };
  }

  function createResourceMinePath(position, mineFieldDimensions) {
    const cx = position.column * NODE_SCALE;
    const cy = position.row * NODE_SCALE;
    const halfTile = NODE_SCALE / 2;
    const structureHalfSize = 21;
    const left = cx - halfTile;
    const right = cx + halfTile;
    const top = cy - halfTile;
    const bottom = cy + halfTile;
    const cutTopLeft = position.row > 1 && position.column > 1;
    const cutTopRight = position.row > 1 && position.column < mineFieldDimensions.columns;
    const cutBottomRight = position.row < mineFieldDimensions.rows && position.column < mineFieldDimensions.columns;
    const cutBottomLeft = position.row < mineFieldDimensions.rows && position.column > 1;
    const points = [
      [left + (cutTopLeft ? structureHalfSize : 0), top],
      [right - (cutTopRight ? structureHalfSize : 0), top]
    ];

    if (cutTopRight) points.push([right - structureHalfSize, top + structureHalfSize], [right, top + structureHalfSize]);
    else points.push([right, top]);
    points.push([right, bottom - (cutBottomRight ? structureHalfSize : 0)]);
    if (cutBottomRight) points.push([right - structureHalfSize, bottom - structureHalfSize], [right - structureHalfSize, bottom]);
    else points.push([right, bottom]);
    points.push([left + (cutBottomLeft ? structureHalfSize : 0), bottom]);
    if (cutBottomLeft) points.push([left + structureHalfSize, bottom - structureHalfSize], [left, bottom - structureHalfSize]);
    else points.push([left, bottom]);
    points.push([left, top + (cutTopLeft ? structureHalfSize : 0)]);
    if (cutTopLeft) points.push([left + structureHalfSize, top + structureHalfSize]);
    else points.push([left, top]);

    const normalizedPoints = points.filter((point, index) => (
      index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]
    ));
    const lastPoint = normalizedPoints[normalizedPoints.length - 1];
    const firstPoint = normalizedPoints[0];
    if (lastPoint[0] === firstPoint[0] && lastPoint[1] === firstPoint[1]) {
      normalizedPoints.pop();
    }
    return normalizedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ") + " Z";
  }

  function renderResourceMineTile(tile, theme, mineFieldDimensions) {
    const tilePath = createResourceMinePath(tile.position, mineFieldDimensions);
    const resourceLabel = tile.resourceId.slice(0, 1).toUpperCase() + tile.resourceId.slice(1);
    const title = escapeText(`Level ${tile.level} ${resourceLabel} resource mine: output speed +${tile.outputSpeedPercent}%`);

    return `
      <g class="strategic-node-network-resource-mine" data-mine-tile-id="${escapeAttribute(tile.mineTileId)}" data-resource-id="${escapeAttribute(tile.resourceId)}" data-mine-level="${tile.level}">
        <title>${title}</title>
        <path d="${tilePath}" class="strategic-node-network-resource-mine-shape" fill="${escapeAttribute(theme.mineFieldFill)}" stroke="${escapeAttribute(theme.mineFieldBorder)}" stroke-width="2" stroke-linejoin="miter" />
      </g>`;
  }

  function renderCentralMetropolisJunction(nodes, theme, mineFieldDimensions) {
    const metropolis = nodes.find((node) => node.typeCode === "MP7");
    if (!metropolis) return "";

    const position = {
      row: metropolis.position.row + 0.5,
      column: metropolis.position.column + 0.5
    };
    const junctionPath = createResourceMinePath(position, mineFieldDimensions);

    return `
      <path d="${junctionPath}" class="strategic-node-network-central-junction-shape" fill="${escapeAttribute(theme.mineFieldFill)}" stroke="${escapeAttribute(theme.mineFieldBorder)}" stroke-width="2" stroke-linejoin="miter" />`;
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

  function getNodeRadius(typeCode) {
    if (typeCode === "MP7") return 40;
    if (typeCode === "MP6" || typeCode === "BG6") return 24;
    return 21;
  }

  function renderNodeBackground(node, theme, isSelected, cx, cy, radius, hasAsset) {
    if (hasAsset && !isSelected) return "";

    const fill = hasAsset ? "none" : escapeAttribute(isSelected ? theme.nodeSelectedFill : theme.nodeFill);
    const stroke = escapeAttribute(isSelected ? theme.nodeSelectedBorder : theme.nodeBorder);
    return `<rect x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" class="strategic-node-network-node-background" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
  }

  function renderNode(node, theme, selectedNodeId, assetByTypeCode, hasMineLayer) {
    const nodeId = escapeAttribute(node.nodeId);
    const typeCode = escapeAttribute(node.typeCode);
    const typeText = escapeText(formatTypeText(node.type));
    const levelText = escapeText(formatLevelText(node.level));
    const fullLabel = escapeText(`Level ${node.level} ${node.type}`);
    const isSelected = selectedNodeId !== null && selectedNodeId === node.nodeId;
    const classes = ["strategic-node-network-node", isSelected ? "selected" : ""];
    const assetPath = assetByTypeCode[node.typeCode];
    const gridShift = hasMineLayer ? 0.5 : 0;
    const radius = getNodeRadius(node.typeCode);
    const cx = (node.position.column + gridShift) * NODE_SCALE;
    const cy = (node.position.row + gridShift) * NODE_SCALE;
    const assetSize = node.typeCode === "MP7" ? 50 : (node.typeCode === "MP6" || node.typeCode === "BG6") ? 44 : 40;
    const halfAssetSize = assetSize / 2;

    const backgroundMarkup = renderNodeBackground(node, theme, isSelected, cx, cy, radius, Boolean(assetPath));
    const assetMarkup = assetPath
      ? `
        <image href="${escapeAttribute(assetPath)}" x="${cx - halfAssetSize}" y="${cy - halfAssetSize}" width="${assetSize}" height="${assetSize}" preserveAspectRatio="xMidYMid meet" />
      `
      : `
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="strategic-node-network-node-fallback" fill="${escapeAttribute(theme.nodeText)}">${typeText}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" class="strategic-node-network-node-level" fill="${escapeAttribute(theme.nodeText)}">${levelText}</text>
      `;

    return `
      <g class="${classes.filter(Boolean).join(" ")}" data-node-id="${nodeId}" data-type-code="${typeCode}">
        <title>${fullLabel}</title>
        ${backgroundMarkup}
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
      const hasMineLayer = validatedProjection.mineFieldDimensions !== null && validatedProjection.resourceMineTiles.length > 0;
      const layoutRows = hasMineLayer ? validatedProjection.mineFieldDimensions.rows : validatedProjection.dimensions.rows;
      const layoutColumns = hasMineLayer ? validatedProjection.mineFieldDimensions.columns : validatedProjection.dimensions.columns;
      const viewBox = `0 0 ${(layoutColumns + 1) * NODE_SCALE} ${(layoutRows + 1) * NODE_SCALE}`;
      const mineTileMarkup = validatedProjection.resourceMineTiles.map((tile) => (
        renderResourceMineTile(tile, theme, validatedProjection.mineFieldDimensions)
      )).join("");
      const centralJunctionMarkup = hasMineLayer
        ? renderCentralMetropolisJunction(validatedProjection.nodes, theme, validatedProjection.mineFieldDimensions)
        : "";
      const gridShift = hasMineLayer ? 0.5 : 0;
      const connectionMarkup = hasMineLayer ? "" : validatedProjection.connections.map((connection) => {
        const fromNode = validatedProjection.nodes.find((node) => node.nodeId === connection.fromNodeId);
        const toNode = validatedProjection.nodes.find((node) => node.nodeId === connection.toNodeId);
        if (!fromNode || !toNode) {
          return "";
        }
        const x1 = (fromNode.position.column + gridShift) * NODE_SCALE;
        const y1 = (fromNode.position.row + gridShift) * NODE_SCALE;
        const x2 = (toNode.position.column + gridShift) * NODE_SCALE;
        const y2 = (toNode.position.row + gridShift) * NODE_SCALE;
        return `
          <path d="M ${x1} ${y1} L ${x2} ${y2}" class="strategic-node-network-connection-underlay" stroke="${escapeAttribute(theme.panelBorder)}" stroke-width="10" stroke-linecap="round" fill="none" />
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="strategic-node-network-connection" stroke="${escapeAttribute(theme.connectionStroke)}" stroke-width="3" stroke-linecap="round" />`;
      }).join("");
      const nodeMarkup = validatedProjection.nodes.map((node) => renderNode(node, theme, normalizedOptions.selectedNodeId, assetByTypeCode, hasMineLayer)).join("");

      const markup = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(viewBox)}" class="strategic-node-network-svg" role="img" aria-label="${escapeAttribute(validatedProjection.seasonId)} map">
          <rect x="0" y="0" width="100%" height="100%" fill="${escapeAttribute(theme.panelBackground)}" stroke="${escapeAttribute(theme.panelBorder)}" stroke-width="4" />
          <g class="strategic-node-network-resource-mines">${mineTileMarkup}${centralJunctionMarkup}</g>
          <g class="strategic-node-network-connections">${connectionMarkup}</g>
          <g class="strategic-node-network-nodes">${nodeMarkup}</g>
        </svg>`;

      return {
        markup,
        viewBox,
        nodeCount: validatedProjection.nodes.length,
        connectionCount: validatedProjection.connections.length,
        mineTileCount: validatedProjection.resourceMineTiles.length
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
