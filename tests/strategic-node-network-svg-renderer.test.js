const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createStrategicNodeNetworkProjectionService } = require("../src/services/strategic-node-network-projection-service.js");
const { validateStrategicNodeNetworkMap } = require("../src/services/strategic-node-network-map-validator.js");
const { createStrategicNodeNetworkSvgRenderer, StrategicNodeNetworkSvgRendererError } = require("../src/services/strategic-node-network-svg-renderer.js");

const mapPath = path.join(__dirname, "..", "data", "season2-map.json");
const season2Map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const projectionService = createStrategicNodeNetworkProjectionService({ validateStrategicNodeNetworkMap });
const projection = projectionService.project(season2Map);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractNodeBlock(markup, nodeId) {
  const pattern = new RegExp(`<g[^>]*data-node-id="${escapeRegExp(nodeId)}"[^>]*>([\\s\\S]*?)<\\/g>`, "i");
  const match = markup.match(pattern);
  if (!match) {
    throw new Error(`Could not extract node block for ${nodeId}`);
  }
  return match[1];
}

function extractMineBlock(markup, mineTileId) {
  const pattern = new RegExp(`<g[^>]*data-mine-tile-id="${escapeRegExp(mineTileId)}"[^>]*>([\\s\\S]*?)<\\/g>`, "i");
  const match = markup.match(pattern);
  if (!match) {
    throw new Error(`Could not extract resource-mine block for ${mineTileId}`);
  }
  return match[1];
}

function runTest(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

runTest("real Season 2 projection renders 145 nodes and 268 connections", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);

  assert.strictEqual(result.nodeCount, 145);
  assert.strictEqual(result.connectionCount, 268);
  assert.strictEqual(result.mineTileCount, 168);
  assert.strictEqual((result.markup.match(/<g class="strategic-node-network-node(?: selected)?"/g) || []).length, 145);
  assert.strictEqual((result.markup.match(/<line /g) || []).length, 0);
  assert.strictEqual((result.markup.match(/class="strategic-node-network-resource-mine"/g) || []).length, 168);
  assert.match(result.markup, /<svg/);
});

runTest("connections occur before nodes in markup", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);
  const connectionsIndex = result.markup.indexOf("strategic-node-network-connections");
  const nodesIndex = result.markup.indexOf("strategic-node-network-nodes");

  assert.ok(connectionsIndex >= 0);
  assert.ok(nodesIndex > connectionsIndex);
});

runTest("strategic routes remain available for maps without a mine-field layer", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const networkOnlyProjection = clone(projection);
  networkOnlyProjection.mineFieldDimensions = null;
  networkOnlyProjection.resourceMineTiles = [];
  const result = renderer.render(networkOnlyProjection, {
    assetByTypeCode: {
      V1: "assets/sprites/village.png",
      M2: "assets/sprites/mine.png",
      MN3: "assets/sprites/manor.png",
      F4: "assets/sprites/factory.png",
      T5: "assets/sprites/town.png",
      MP6: "assets/sprites/metropolis.png",
      MP7: "assets/sprites/metropolis.png"
    }
  });

  assert.match(result.markup, /class="strategic-node-network-connection-underlay"/);
  assert.match(result.markup, /class="strategic-node-network-connection"/);
  assert.match(result.markup, /stroke-linecap="round"/);
  assert.match(result.markup, /href="assets\/sprites\/village\.png"/);
  assert.match(result.markup, /href="assets\/sprites\/metropolis\.png"/);
});

runTest("centre MP7 uses a normal-colour straight-edged junction without a separate card", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection, {
    assetByTypeCode: {
      MP7: "assets/sprites/season2/central-metropolis.png"
    }
  });

  assert.match(result.markup, /data-node-id="s2-center-metropolis"/);
  assert.match(result.markup, /viewBox="0 0 1008 1008"/);
  const centreBlock = extractNodeBlock(result.markup, "s2-center-metropolis");
  assert.ok(!centreBlock.includes("strategic-node-network-node-background"));
  assert.match(centreBlock, /<image[^>]*x="479" y="479" width="50" height="50"/);
  assert.match(result.markup, /class="strategic-node-network-central-junction-shape" fill="#ead7ae" stroke="#705643" stroke-width="2"/);
});

runTest("resource mines render as positional plus T and L tiles below centred strategic structures", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);
  const mineLayerIndex = result.markup.indexOf("strategic-node-network-resource-mines");
  const connectionLayerIndex = result.markup.indexOf("strategic-node-network-connections");
  const nodeLayerIndex = result.markup.indexOf("strategic-node-network-nodes");

  assert.ok(mineLayerIndex >= 0);
  assert.ok(connectionLayerIndex > mineLayerIndex);
  assert.ok(nodeLayerIndex > connectionLayerIndex);
  assert.match(result.markup, /data-mine-tile-id="s2-resource-mine-r01-c01"/);
  assert.match(result.markup, /class="strategic-node-network-resource-mine-shape"/);
  assert.match(result.markup, /data-mine-tile-id="s2-resource-mine-r01-c01"[^>]*data-mine-level="1"/);
  assert.match(extractMineBlock(result.markup, "s2-resource-mine-r01-c01"), /d="M 36 36 L 108 36 L 108 87 L 87 87 L 87 108 L 36 108 Z"/);
  assert.match(extractMineBlock(result.markup, "s2-resource-mine-r01-c02"), /d="M 108 36 L 180 36 L 180 87 L 159 87 L 159 108 L 129 108 L 129 87 L 108 87 Z"/);
  assert.match(extractMineBlock(result.markup, "s2-resource-mine-r02-c02"), /d="M 129 108 L 159 108 L 159 129 L 180 129 L 180 159 L 159 159 L 159 180 L 129 180 L 129 159 L 108 159 L 108 129 L 129 129 Z"/);
  assert.match(extractMineBlock(result.markup, "s2-resource-mine-r13-c13"), /d="M 921 900 L 972 900 L 972 972 L 900 972 L 900 921 L 921 921 Z"/);
  assert.match(result.markup, /fill="#d9ad68" stroke="#8f826c"/);
  assert.strictEqual((result.markup.match(/class="strategic-node-network-resource-mine-shape"/g) || []).length, 168);
  assert.strictEqual((result.markup.match(/class="strategic-node-network-resource-mine-shape" fill="#ead7ae" stroke="#705643" stroke-width="2"/g) || []).length, 168);
  assert.ok(!result.markup.includes('fill="#477d78"'));
  assert.ok(!result.markup.includes("strategic-node-network-resource-mine-label"));
  assert.ok(!result.markup.includes("strategic-node-network-resource-mine-value"));
  assert.match(result.markup, /<title>Level 1 Gold resource mine: output speed \+1%<\/title>/);
  assert.ok(!result.markup.includes('data-mine-tile-id="s2-resource-mine-r07-c07"'));
  assert.match(extractNodeBlock(result.markup, "s2-r01-c01"), /x="87" y="87" width="42" height="42"/);
  assert.strictEqual((result.markup.match(/class="strategic-node-network-connection-underlay"/g) || []).length, 0);
  assert.strictEqual((result.markup.match(/class="strategic-node-network-connection"/g) || []).length, 0);
});

runTest("map geometry centres equal structure cards symmetrically between mine junctions", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection, {
    assetByTypeCode: {
      V1: "assets/sprites/season2/village.png",
      BG6: "assets/sprites/season2/building-guild.png",
      MP7: "assets/sprites/season2/central-metropolis.png"
    }
  });
  const villageBlock = extractNodeBlock(result.markup, "s2-r01-c01");
  const buildingGuildBlock = extractNodeBlock(result.markup, "s2-r06-c06");
  const centreBlock = extractNodeBlock(result.markup, "s2-center-metropolis");

  const mirroredVillageBlock = extractNodeBlock(result.markup, "s2-r01-c12");
  const bottomVillageBlock = extractNodeBlock(result.markup, "s2-r12-c01");

  assert.ok(!villageBlock.includes("strategic-node-network-node-background"));
  assert.ok(!mirroredVillageBlock.includes("strategic-node-network-node-background"));
  assert.ok(!bottomVillageBlock.includes("strategic-node-network-node-background"));
  assert.ok(!buildingGuildBlock.includes("strategic-node-network-node-background"));
  assert.ok(!centreBlock.includes("strategic-node-network-node-background"));
  assert.ok(!result.markup.includes('rx="8"'));
  assert.ok(!result.markup.includes("drop-shadow"));
  assert.match(result.markup, /class="strategic-node-network-resource-mine-shape"/);
  assert.match(result.markup, /stroke-width="2"/);
});

runTest("node order is preserved after the mine-field layer", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);
  const firstNode = result.markup.indexOf('data-node-id="s2-r01-c01"');
  const lastNode = result.markup.indexOf('data-node-id="s2-r12-c12"');
  const mineLayer = result.markup.indexOf('class="strategic-node-network-resource-mines"');

  assert.ok(firstNode >= 0);
  assert.ok(lastNode > firstNode);
  assert.ok(mineLayer >= 0);
  assert.ok(firstNode > mineLayer);
});

runTest("selected-node class is applied only to the requested node", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection, { selectedNodeId: "s2-r01-c01" });
  const selectedCount = (result.markup.match(/<g class="strategic-node-network-node selected"/g) || []).length;
  const nodeCount = (result.markup.match(/<g class="strategic-node-network-node(?: selected)?"/g) || []).length;

  assert.strictEqual(selectedCount, 1);
  assert.strictEqual(nodeCount, 145);
});

runTest("custom theme tokens appear correctly", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection, {
    theme: {
      panelBackground: "#112233",
      mineFieldFill: "#ffcc00"
    }
  });

  assert.match(result.markup, /#112233/);
  assert.match(result.markup, /#ffcc00/);
});

runTest("asset-backed and fallback node blocks render precisely", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const assetNodeId = projection.nodes.find((node) => node.typeCode === "V1").nodeId;
  const tradeCentreNodeId = projection.nodes.find((node) => node.typeCode === "TC1").nodeId;
  const fallbackNodeId = projection.nodes.find((node) => node.typeCode === "M2").nodeId;
  const result = renderer.render(projection, {
    assetByTypeCode: {
      V1: "assets/sprites/village.png",
      TC1: "assets/sprites/trade-centre.png"
    },
    theme: {
      nodeText: "#123456"
    }
  });

  const assetNodeBlock = extractNodeBlock(result.markup, assetNodeId);
  const tradeCentreNodeBlock = extractNodeBlock(result.markup, tradeCentreNodeId);
  const fallbackNodeBlock = extractNodeBlock(result.markup, fallbackNodeId);

  assert.match(assetNodeBlock, /<image href="assets\/sprites\/village\.png"/);
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-badge"'));
  assert.match(assetNodeBlock, /<image href="assets\/sprites\/village\.png" x="88" y="88" width="40" height="40"/);
  assert.ok(!tradeCentreNodeBlock.includes('class="strategic-node-network-node-badge"'));
  assert.match(assetNodeBlock, /<title>/);
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-fallback"'));
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-label"'));
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-level"'));

  assert.match(fallbackNodeBlock, /class="strategic-node-network-node-fallback"/);
  assert.match(fallbackNodeBlock, /class="strategic-node-network-node-level"/);
  assert.ok(!fallbackNodeBlock.includes('<image'));
  assert.ok(!fallbackNodeBlock.includes('class="strategic-node-network-node-label"'));

  const visibleTextCount = (result.markup.match(/class="strategic-node-network-node-(?:fallback|level)"/g) || []).length;
  const nodeTextFillCount = (result.markup.match(/fill="#123456"/g) || []).length;
  assert.strictEqual(nodeTextFillCount, visibleTextCount);
});

runTest("unsafe text and paths are escaped", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const unsafeProjection = clone(projection);
  unsafeProjection.nodes[0].type = 'Bad <script>alert(1)</script>';
  unsafeProjection.nodes[0].typeCode = 'V1';
  const result = renderer.render(unsafeProjection, {
    assetByTypeCode: {
      V1: 'assets/"bad".png'
    }
  });

  assert.match(result.markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(result.markup, /data-node-id="s2-r01-c01"/);
  assert.match(result.markup, /assets\/&quot;bad&quot;\.png/);
});

runTest("malformed inputs fail clearly", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  assert.throws(() => renderer.render(null), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_PROJECTION");
    return true;
  });

  assert.throws(() => renderer.render(projection, { theme: [] }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { extra: true }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { theme: { unknown: "#fff" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });
});

runTest("inputs and repeated results are isolated", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const first = renderer.render(projection);
  const second = renderer.render(projection);

  first.markup = "mutated";
  first.viewBox = "0 0 0 0";
  first.nodeCount = 0;
  first.connectionCount = 0;
  first.mineTileCount = 0;

  assert.notStrictEqual(second.markup, first.markup);
  assert.strictEqual(second.nodeCount, projection.nodes.length);
  assert.strictEqual(second.connectionCount, projection.connections.length);
  assert.strictEqual(second.mineTileCount, projection.resourceMineTiles.length);
});

runTest("browser and CommonJS exports are available", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  assert.strictEqual(typeof renderer.render, "function");
  assert.strictEqual(typeof StrategicNodeNetworkSvgRendererError, "function");
  assert.strictEqual(typeof createStrategicNodeNetworkSvgRenderer, "function");
});

runTest("dangerous asset paths and invalid projection data are rejected", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  assert.throws(() => renderer.render(projection, { assetByTypeCode: { V1: "javascript:alert(1)" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { assetByTypeCode: { V1: "/assets/sprites/village.png" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { assetByTypeCode: { V1: "../assets/sprites/village.png" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { assetByTypeCode: { V1: "https://example.com/village.png" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  assert.throws(() => renderer.render(projection, { assetByTypeCode: { UNKNOWN: "assets/sprites/village.png" } }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  const invalidProjection = clone(projection);
  invalidProjection.connections[0].connectionId = invalidProjection.connections[0].connectionId;
  invalidProjection.connections.push({ connectionId: invalidProjection.connections[0].connectionId, fromNodeId: invalidProjection.nodes[0].nodeId, toNodeId: invalidProjection.nodes[1].nodeId });
  assert.throws(() => renderer.render(invalidProjection), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_PROJECTION");
    return true;
  });
});

runTest("unknown selection, out-of-range positions, and duplicate IDs are rejected", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  assert.throws(() => renderer.render(projection, { selectedNodeId: "missing-node" }), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });

  const badProjection = clone(projection);
  badProjection.nodes[0].position = { row: 99, column: 1 };
  assert.throws(() => renderer.render(badProjection), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_PROJECTION");
    return true;
  });

  const duplicateIdProjection = clone(projection);
  duplicateIdProjection.nodes[1].nodeId = duplicateIdProjection.nodes[0].nodeId;
  assert.throws(() => renderer.render(duplicateIdProjection), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_PROJECTION");
    return true;
  });
});

runTest("JSON-parsed __proto__ option data does not alter any prototype", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const options = JSON.parse('{"theme":{"panelBackground":"#112233"},"__proto__":{"polluted":"yes"}}');

  assert.throws(() => renderer.render(projection, options), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkSvgRendererError);
    assert.strictEqual(error.code, "INVALID_OPTIONS");
    return true;
  });
  assert.strictEqual(Object.prototype.polluted, undefined);
});

runTest("service source contains no prohibited dependencies", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "strategic-node-network-svg-renderer.js"),
    "utf8"
  );
  const sanitizedSource = source.replace('xmlns="http://www.w3.org/2000/svg"', "");

  ["electron", "fs", "window", "document", "navigator"].forEach((token) => {
    assert.strictEqual(sanitizedSource.includes(token), false, `Unexpected dependency token '${token}'`);
  });
});
