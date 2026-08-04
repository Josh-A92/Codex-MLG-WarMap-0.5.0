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
  assert.strictEqual((result.markup.match(/<g class="strategic-node-network-node(?: selected)?"/g) || []).length, 145);
  assert.strictEqual((result.markup.match(/<line /g) || []).length, 268);
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

runTest("centre MP7 uses the correct midpoint position", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);

  assert.match(result.markup, /data-node-id="s2-center-metropolis"/);
  assert.match(result.markup, /x="242" y="242"/);
});

runTest("node order and connection order are preserved", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const result = renderer.render(projection);
  const firstNode = result.markup.indexOf('data-node-id="s2-r01-c01"');
  const lastNode = result.markup.indexOf('data-node-id="s2-r12-c12"');
  const firstConnection = result.markup.indexOf('class="strategic-node-network-connection"');

  assert.ok(firstNode >= 0);
  assert.ok(lastNode > firstNode);
  assert.ok(firstConnection >= 0);
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
      connectionStroke: "#ffcc00"
    }
  });

  assert.match(result.markup, /#112233/);
  assert.match(result.markup, /#ffcc00/);
});

runTest("asset-backed and fallback node blocks render precisely", () => {
  const renderer = createStrategicNodeNetworkSvgRenderer();
  const assetNodeId = projection.nodes.find((node) => node.typeCode === "V1").nodeId;
  const fallbackNodeId = projection.nodes.find((node) => node.typeCode !== "V1").nodeId;
  const result = renderer.render(projection, {
    assetByTypeCode: {
      V1: "assets/sprites/village.png"
    },
    theme: {
      nodeText: "#123456"
    }
  });

  const assetNodeBlock = extractNodeBlock(result.markup, assetNodeId);
  const fallbackNodeBlock = extractNodeBlock(result.markup, fallbackNodeId);

  assert.match(assetNodeBlock, /<image href="assets\/sprites\/village\.png"/);
  assert.match(assetNodeBlock, /class="strategic-node-network-node-badge"/);
  assert.match(assetNodeBlock, /<title>/);
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-fallback"'));
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-label"'));
  assert.ok(!assetNodeBlock.includes('class="strategic-node-network-node-level"'));

  assert.match(fallbackNodeBlock, /class="strategic-node-network-node-fallback"/);
  assert.match(fallbackNodeBlock, /class="strategic-node-network-node-level"/);
  assert.ok(!fallbackNodeBlock.includes('<image'));
  assert.ok(!fallbackNodeBlock.includes('class="strategic-node-network-node-label"'));

  const visibleTextCount = (result.markup.match(/class="strategic-node-network-node-(?:badge|fallback|level)"/g) || []).length;
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

  assert.notStrictEqual(second.markup, first.markup);
  assert.strictEqual(second.nodeCount, projection.nodes.length);
  assert.strictEqual(second.connectionCount, projection.connections.length);
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
