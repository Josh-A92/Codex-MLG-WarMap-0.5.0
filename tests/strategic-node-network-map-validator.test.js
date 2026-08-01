const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateStrategicNodeNetworkMap } = require("../src/services/strategic-node-network-map-validator.js");

const mapPath = path.join(__dirname, "..", "data", "season2-map.json");
const season2Map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function assertError(result, code, pathText) {
  assert.ok(
    result.errors.some((entry) => entry.code === code && entry.path === pathText),
    `Expected ${code} at ${pathText}`
  );
}

runTest("real Season 2 map validates", () => {
  const result = validateStrategicNodeNetworkMap(season2Map);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("real Season 2 map has 145 nodes and 268 connections", () => {
  assert.strictEqual(season2Map.nodes.length, 145);
  assert.strictEqual(season2Map.connections.length, 268);
});

runTest("confirmed type counts are preserved", () => {
  const counts = {};
  season2Map.nodes.forEach((node) => {
    counts[node.typeCode] = (counts[node.typeCode] || 0) + 1;
  });

  assert.deepStrictEqual(counts, {
    V1: 40,
    M2: 32,
    MN3: 24,
    F4: 16,
    T5: 8,
    TC1: 4,
    TC2: 4,
    TC3: 4,
    TC4: 4,
    TC5: 4,
    BG6: 1,
    MP6: 3,
    MP7: 1
  });
});

runTest("no canonical node type uses levelMode", () => {
  Object.values(season2Map.nodeTypes).forEach((entry) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(entry, "levelMode"), false);
  });
});

runTest("ten screenshot sources remain recorded", () => {
  assert.strictEqual(season2Map.sourceEvidence.screenshots.length, 10);
  assert.strictEqual(new Set(season2Map.sourceEvidence.screenshots).size, 10);
});

runTest("duplicate node IDs are rejected", () => {
  const candidate = clone(season2Map);
  candidate.nodes[1].nodeId = candidate.nodes[0].nodeId;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "nodes[1].nodeId");
});

runTest("duplicate node positions are rejected", () => {
  const candidate = clone(season2Map);
  candidate.nodes[1].position = clone(candidate.nodes[0].position);

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_POSITION", "nodes[1].position");
});

runTest("duplicate undirected connection pairs are rejected", () => {
  const candidate = clone(season2Map);
  const original = candidate.connections[0];
  candidate.connections.push({
    connectionId: "conn-duplicate-undirected",
    fromNodeId: original.toNodeId,
    toNodeId: original.fromNodeId
  });

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_UNDIRECTED_CONNECTION", "connections[268]");
});

runTest("duplicate connection IDs are rejected", () => {
  const candidate = clone(season2Map);
  candidate.connections[1].connectionId = candidate.connections[0].connectionId;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_IDENTIFIER", "connections[1].connectionId");
});

runTest("unresolved connection endpoints are rejected", () => {
  const candidate = clone(season2Map);
  candidate.connections[0].toNodeId = "s2-r99-c99";

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNRESOLVED_NODE_REFERENCE", "connections[0].toNodeId");
});

runTest("unresolved node type references are rejected", () => {
  const candidate = clone(season2Map);
  candidate.nodes[0].typeCode = "UNKNOWN";

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNRESOLVED_TYPE_REFERENCE", "nodes[0].typeCode");
});

runTest("self-connections are rejected", () => {
  const candidate = clone(season2Map);
  candidate.connections[0].toNodeId = candidate.connections[0].fromNodeId;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "SELF_CONNECTION", "connections[0]");
});

runTest("invalid coordinates are rejected", () => {
  const candidate = clone(season2Map);
  candidate.nodes[0].position.row = 0;
  candidate.nodes[0].position.column = 12.25;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_COORDINATE", "nodes[0].position.row");
  assertError(result, "INVALID_COORDINATE", "nodes[0].position.column");
});

runTest("malformed objects and invalid object types are rejected", () => {
  const candidate = clone(season2Map);
  candidate.dimensions = [];
  candidate.sourceEvidence = new Date();
  candidate.nodeTypes = new Map();
  candidate.nodes[0] = class BadNode {};
  candidate.connections[0] = new Set();

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_OBJECT", "dimensions");
  assertError(result, "INVALID_OBJECT", "sourceEvidence");
  assertError(result, "INVALID_OBJECT", "nodeTypes");
  assertError(result, "INVALID_OBJECT", "nodes[0]");
  assertError(result, "INVALID_OBJECT", "connections[0]");
});

runTest("unknown canonical fields are rejected", () => {
  const candidate = clone(season2Map);
  candidate.extraTopLevel = true;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "extraTopLevel");
});

runTest("unknown nested fields are rejected for dimensions node connection and nodeType entries", () => {
  const candidate = clone(season2Map);
  candidate.dimensions.depth = 1;
  candidate.nodes[0].extra = true;
  candidate.nodes[0].position.extra = true;
  candidate.connections[0].extra = true;
  candidate.nodeTypes.V1.extra = true;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "dimensions.depth");
  assertError(result, "UNKNOWN_FIELD", "nodes[0].extra");
  assertError(result, "UNKNOWN_FIELD", "nodes[0].position.extra");
  assertError(result, "UNKNOWN_FIELD", "connections[0].extra");
  assertError(result, "UNKNOWN_FIELD", "nodeTypes.V1.extra");
});

runTest("missing node-type level is rejected", () => {
  const candidate = clone(season2Map);
  delete candidate.nodeTypes.V1.level;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "nodeTypes.V1.level");
});

runTest("invalid node-type level is rejected", () => {
  const candidate = clone(season2Map);
  candidate.nodeTypes.V1.level = 0;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_INTEGER", "nodeTypes.V1.level");
});

runTest("node-type levelMode is rejected as unknown field", () => {
  const candidate = clone(season2Map);
  candidate.nodeTypes.V1.levelMode = "position_derived";

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "nodeTypes.V1.levelMode");
});

runTest("cyclic metadata is rejected safely", () => {
  const candidate = clone(season2Map);
  candidate.sourceEvidence.cycle = candidate.sourceEvidence;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "METADATA_CYCLE_DETECTED", "sourceEvidence.cycle");
});

runTest("unsafe __proto__ metadata key is rejected", () => {
  const candidate = clone(season2Map);
  candidate.sourceEvidence = Object.create(null);
  candidate.sourceEvidence.safe = "ok";
  candidate.sourceEvidence.__proto__ = "unsafe";

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNSAFE_METADATA_KEY", "sourceEvidence.__proto__");
});

runTest("null-prototype plain objects are accepted", () => {
  const candidate = clone(season2Map);
  const nullProtoSourceEvidence = Object.assign(Object.create(null), candidate.sourceEvidence);
  candidate.sourceEvidence = nullProtoSourceEvidence;

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

runTest("input remains unchanged after validation", () => {
  const candidate = clone(season2Map);
  const before = clone(candidate);

  const result = validateStrategicNodeNetworkMap(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(candidate, before);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
