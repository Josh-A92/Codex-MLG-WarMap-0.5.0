const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateStrategicNodeNetworkMap } = require("../src/services/strategic-node-network-map-validator.js");

const mapPath = path.join(__dirname, "..", "data", "season2-map.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

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

function gridNodeId(row, column) {
  return `s2-r${String(row).padStart(2, "0")}-c${String(column).padStart(2, "0")}`;
}

runTest("Season 2 reconstruction has canonical topology identity", () => {
  assert.strictEqual(map.schemaVersion, 1);
  assert.strictEqual(map.seasonId, "season-2");
  assert.strictEqual(map.baseMapId, "season2-strategic-node-network");
  assert.strictEqual(map.topologyType, "strategic_node_network");
  assert.deepStrictEqual(map.dimensions, { rows: 12, columns: 12 });
});

runTest("the screenshot sweep contains exactly ten unique ordered sources", () => {
  const expected = Array.from({ length: 10 }, (_value, index) => `IMG_${7618 + index}.PNG`);
  assert.deepStrictEqual(map.sourceEvidence.screenshots, expected);
  assert.strictEqual(new Set(map.sourceEvidence.screenshots).size, 10);
  assert.strictEqual(map.sourceEvidence.geometryAuthority, "in_game_screenshot_sweep");
});

runTest("the explicit nodes include 144 grid nodes plus one center node", () => {
  assert.strictEqual(map.nodes.length, 145);

  const gridNodes = map.nodes.filter((node) => node.nodeId !== "s2-center-metropolis");
  assert.strictEqual(gridNodes.length, 144);

  gridNodes.forEach((node) => {
    assert.ok(map.nodeTypes[node.typeCode], `Unknown type code ${node.typeCode}`);
    assert.ok(Number.isInteger(node.position.row));
    assert.ok(Number.isInteger(node.position.column));
    assert.ok(node.position.row >= 1 && node.position.row <= 12);
    assert.ok(node.position.column >= 1 && node.position.column <= 12);
  });
});

runTest("the resource-mine field is a distinct confirmed 13 by 13 layer", () => {
  assert.deepStrictEqual(map.mineFieldDimensions, { rows: 13, columns: 13 });
  assert.strictEqual(map.resourceMineTiles.length, 168);
  assert.strictEqual(new Set(map.resourceMineTiles.map((tile) => tile.mineTileId)).size, 168);
  assert.strictEqual(new Set(map.resourceMineTiles.map((tile) => `${tile.position.row}|${tile.position.column}`)).size, 168);
  assert.strictEqual(map.resourceMineTiles.some((tile) => tile.position.row === 7 && tile.position.column === 7), false);
});

runTest("resource-mine levels and output values follow the confirmed inward rings", () => {
  map.resourceMineTiles.forEach((tile) => {
    const expectedLevel = Math.min(
      tile.position.row,
      tile.position.column,
      14 - tile.position.row,
      14 - tile.position.column
    );
    assert.strictEqual(tile.level, expectedLevel, tile.mineTileId);
    assert.strictEqual(tile.outputSpeedPercent, expectedLevel, tile.mineTileId);
    assert.ok(["gold", "food", "iron"].includes(tile.resourceId), tile.mineTileId);
  });
});

runTest("strategic M2 structures remain distinct from resource-mine tiles", () => {
  assert.strictEqual(map.nodes.filter((node) => node.typeCode === "M2").length, 32);
  assert.strictEqual(map.resourceMineTiles.some((tile) => tile.mineTileId === "s2-r01-c01"), false);
  assert.strictEqual(map.resourceMineTiles.every((tile) => !Object.prototype.hasOwnProperty.call(tile, "typeCode")), true);
});

runTest("confirmed node-type counts match the reconstructed map", () => {
  const counts = {};
  map.nodes.forEach((node) => {
    counts[node.typeCode] = (counts[node.typeCode] || 0) + 1;
  });

  assert.deepStrictEqual(counts, {
    V1: 40,
    TC1: 4,
    TC2: 4,
    TC3: 4,
    TC4: 4,
    TC5: 4,
    M2: 32,
    MN3: 24,
    F4: 16,
    T5: 8,
    BG6: 1,
    MP6: 3,
    MP7: 1
  });

  const tradeCentreTotal = (counts.TC1 || 0) + (counts.TC2 || 0) + (counts.TC3 || 0) + (counts.TC4 || 0) + (counts.TC5 || 0);
  assert.strictEqual(tradeCentreTotal, 20);
});

runTest("Trade Centre assignments exactly match canonical branch-level mapping", () => {
  const expectedTradeCentreAssignments = {
    "s2-r01-c07": "TC1",
    "s2-r02-c07": "TC2",
    "s2-r03-c07": "TC3",
    "s2-r04-c07": "TC4",
    "s2-r05-c07": "TC5",
    "s2-r06-c01": "TC1",
    "s2-r06-c02": "TC2",
    "s2-r06-c03": "TC3",
    "s2-r06-c04": "TC4",
    "s2-r06-c05": "TC5",
    "s2-r07-c08": "TC5",
    "s2-r07-c09": "TC4",
    "s2-r07-c10": "TC3",
    "s2-r07-c11": "TC2",
    "s2-r07-c12": "TC1",
    "s2-r08-c06": "TC5",
    "s2-r09-c06": "TC4",
    "s2-r10-c06": "TC3",
    "s2-r11-c06": "TC2",
    "s2-r12-c06": "TC1"
  };

  const actualTradeCentreAssignments = {};
  map.nodes.forEach((node) => {
    if (/^TC[1-5]$/.test(node.typeCode)) {
      actualTradeCentreAssignments[node.nodeId] = node.typeCode;
    }
  });

  assert.deepStrictEqual(actualTradeCentreAssignments, expectedTradeCentreAssignments);
});

runTest("node type entries do not contain levelMode", () => {
  Object.values(map.nodeTypes).forEach((entry) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(entry, "levelMode"), false);
  });
});

runTest("the central Level 7 Metropolis is a distinct ownership node", () => {
  const centerNode = map.nodes.find((node) => node.nodeId === "s2-center-metropolis");
  assert.deepStrictEqual(centerNode, {
    nodeId: "s2-center-metropolis",
    typeCode: "MP7",
    position: { row: 6.5, column: 6.5 }
  });
  assert.strictEqual(map.nodeTypes.MP7.type, "Metropolis");
  assert.strictEqual(map.nodeTypes.MP7.level, 7);
  assert.strictEqual(map.nodeTypes.MP7.capturable, true);
});

runTest("stable node identities are unique across 144 grid nodes and one special node", () => {
  const nodeIds = map.nodes.map((node) => node.nodeId);
  assert.strictEqual(nodeIds.length, 145);
  assert.strictEqual(new Set(nodeIds).size, 145);

  for (let row = 1; row <= 12; row += 1) {
    for (let column = 1; column <= 12; column += 1) {
      const expectedId = gridNodeId(row, column);
      assert.ok(nodeIds.includes(expectedId), `Missing grid node ${expectedId}`);
    }
  }
});

runTest("the deterministic network contains 268 unique non-ownable connections", () => {
  const nodeIds = new Set(map.nodes.map((node) => node.nodeId));
  const normalized = map.connections.map((connection) => [connection.fromNodeId, connection.toNodeId].sort().join("|"));

  assert.strictEqual(map.connections.length, 268);
  assert.strictEqual(new Set(normalized).size, 268);

  map.connections.forEach((connection) => {
    assert.ok(nodeIds.has(connection.fromNodeId), `Unknown connection endpoint ${connection.fromNodeId}`);
    assert.ok(nodeIds.has(connection.toNodeId), `Unknown connection endpoint ${connection.toNodeId}`);
    assert.notStrictEqual(connection.fromNodeId, connection.toNodeId);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(connection, "ownershipTarget"), false);
  });
});

runTest("the canonical strategic-node-network validator accepts the reconstructed map", () => {
  const result = validateStrategicNodeNetworkMap(map);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("community-only modifier claims are explicitly excluded from calculations", () => {
  assert.ok(map.provisionalCommunityClaims.length > 0);
  map.provisionalCommunityClaims.forEach((claim) => {
    assert.strictEqual(claim.status, "unverified");
    assert.strictEqual(claim.calculationEligible, false);
  });
});
