const assert = require("assert");
const fs = require("fs");
const path = require("path");

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

function expandNodeIds(definition) {
  const ids = [];
  definition.nodeTypeGrid.forEach((row, rowIndex) => {
    row.forEach((_typeCode, columnIndex) => {
      ids.push(gridNodeId(rowIndex + 1, columnIndex + 1));
    });
  });
  definition.specialNodes.forEach((node) => ids.push(node.nodeId));
  return ids;
}

function expandConnections(definition) {
  const connections = [];
  const rows = definition.coordinateSystem.rows;
  const columns = definition.coordinateSystem.columns;

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      if (column < columns) {
        connections.push([gridNodeId(row, column), gridNodeId(row, column + 1)]);
      }
      if (row < rows) {
        connections.push([gridNodeId(row, column), gridNodeId(row + 1, column)]);
      }
    }
  }

  return connections.concat(definition.connectionModel.specialConnections);
}

runTest("Season 2 reconstruction has the expected identity and verified status", () => {
  assert.strictEqual(map.schemaVersion, 1);
  assert.strictEqual(map.seasonId, "season-2");
  assert.strictEqual(map.baseMapId, "season2-strategic-node-network");
  assert.strictEqual(map.status, "geometry_verified");
});

runTest("the screenshot sweep contains exactly ten unique ordered sources", () => {
  const expected = Array.from({ length: 10 }, (_value, index) => `IMG_${7618 + index}.PNG`);
  assert.deepStrictEqual(map.sourceEvidence.screenshots, expected);
  assert.strictEqual(new Set(map.sourceEvidence.screenshots).size, 10);
  assert.strictEqual(map.sourceEvidence.geometryAuthority, "in_game_screenshot_sweep");
});

runTest("the regular node grid is exactly 12 by 12 and uses declared type codes", () => {
  assert.strictEqual(map.coordinateSystem.rows, 12);
  assert.strictEqual(map.coordinateSystem.columns, 12);
  assert.strictEqual(map.nodeTypeGrid.length, 12);

  map.nodeTypeGrid.forEach((row) => {
    assert.strictEqual(row.length, 12);
    row.forEach((typeCode) => assert.ok(map.nodeTypes[typeCode], `Unknown type code ${typeCode}`));
  });
});

runTest("confirmed node-type counts match the reconstructed map", () => {
  const counts = {};
  map.nodeTypeGrid.flat().forEach((typeCode) => {
    counts[typeCode] = (counts[typeCode] || 0) + 1;
  });
  map.specialNodes.forEach((node) => {
    counts[node.typeCode] = (counts[node.typeCode] || 0) + 1;
  });

  assert.deepStrictEqual(counts, {
    V1: 40,
    TC: 20,
    M2: 32,
    MN3: 24,
    F4: 16,
    T5: 8,
    BG6: 1,
    MP6: 3,
    MP7: 1
  });
});

runTest("the central Level 7 Metropolis is a distinct ownership node", () => {
  assert.deepStrictEqual(map.specialNodes, [{
    nodeId: "s2-center-metropolis",
    typeCode: "MP7",
    position: { row: 6.5, column: 6.5 },
    verification: "in_game_confirmed"
  }]);
  assert.strictEqual(map.nodeTypes.MP7.type, "Metropolis");
  assert.strictEqual(map.nodeTypes.MP7.level, 7);
  assert.strictEqual(map.nodeTypes.MP7.capturable, true);
});

runTest("stable node identities are unique across 144 grid nodes and one special node", () => {
  const nodeIds = expandNodeIds(map);
  assert.strictEqual(nodeIds.length, 145);
  assert.strictEqual(new Set(nodeIds).size, 145);
});

runTest("the deterministic network contains 268 unique non-ownable connections", () => {
  const nodeIds = new Set(expandNodeIds(map));
  const connections = expandConnections(map);
  const normalized = connections.map(([from, to]) => [from, to].sort().join("|"));

  assert.strictEqual(connections.length, 268);
  assert.strictEqual(new Set(normalized).size, 268);
  assert.strictEqual(map.connectionModel.ownershipTarget, false);
  connections.forEach(([from, to]) => {
    assert.ok(nodeIds.has(from), `Unknown connection endpoint ${from}`);
    assert.ok(nodeIds.has(to), `Unknown connection endpoint ${to}`);
    assert.notStrictEqual(from, to);
  });
});

runTest("community-only modifier claims are explicitly excluded from calculations", () => {
  assert.ok(map.provisionalCommunityClaims.length > 0);
  map.provisionalCommunityClaims.forEach((claim) => {
    assert.strictEqual(claim.status, "unverified");
    assert.strictEqual(claim.calculationEligible, false);
  });
});
