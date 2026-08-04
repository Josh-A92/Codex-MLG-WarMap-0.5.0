const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateStrategicNodeNetworkMap } = require("../src/services/strategic-node-network-map-validator.js");
const {
  createStrategicNodeNetworkProjectionService,
  StrategicNodeNetworkProjectionError
} = require("../src/services/strategic-node-network-projection-service.js");

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

runTest("real Season 2 map produces 145 nodes and 268 connections", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const projection = service.project(season2Map);

  assert.strictEqual(projection.nodes.length, 145);
  assert.strictEqual(projection.connections.length, 268);
});

runTest("centre MP7 node retains its midpoint position", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const projection = service.project(season2Map);
  const centreNode = projection.nodes.find((node) => node.typeCode === "MP7");

  assert.ok(centreNode);
  assert.deepStrictEqual(centreNode.position, { row: 6.5, column: 6.5 });
});

runTest("node type metadata resolves correctly", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const projection = service.project(season2Map);
  const firstNode = projection.nodes[0];

  assert.deepStrictEqual(firstNode, {
    nodeId: "s2-r01-c01",
    typeCode: "V1",
    type: "Village",
    level: 1,
    capturable: true,
    position: { row: 1, column: 1 }
  });
});

runTest("projection preserves source ordering", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const projection = service.project(season2Map);

  assert.deepStrictEqual(
    projection.nodes.map((node) => node.nodeId),
    season2Map.nodes.map((node) => node.nodeId)
  );
  assert.deepStrictEqual(
    projection.connections.map((connection) => connection.connectionId),
    season2Map.connections.map((connection) => connection.connectionId)
  );
});

runTest("projection is a safe copy and does not mutate input data", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const projection = service.project(season2Map);
  const originalSnapshot = clone(season2Map);

  projection.nodes[0].nodeId = "mutated-node";
  projection.nodes[0].position.column = 99;
  projection.connections[0].connectionId = "mutated-connection";

  assert.deepStrictEqual(season2Map, originalSnapshot);
  assert.notStrictEqual(projection.nodes[0], season2Map.nodes[0]);
  assert.notStrictEqual(projection.connections[0], season2Map.connections[0]);
});

runTest("invalid map produces the required stable error", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  const invalidMap = clone(season2Map);
  invalidMap.nodes[0].typeCode = "UNKNOWN";

  assert.throws(() => service.project(invalidMap), (error) => {
    assert.ok(error instanceof StrategicNodeNetworkProjectionError);
    assert.strictEqual(error.code, "INVALID_MAP_DATA");
    assert.deepStrictEqual(error.errors, validateStrategicNodeNetworkMap(invalidMap).errors);
    assert.deepStrictEqual(error.warnings, validateStrategicNodeNetworkMap(invalidMap).warnings);
    return true;
  });
});

runTest("injected validator keeps its object context", () => {
  const validatorContext = {
    marker: "validator-context",
    validateStrategicNodeNetworkMap(mapData) {
      assert.strictEqual(this.marker, "validator-context");
      return validateStrategicNodeNetworkMap(mapData);
    }
  };
  const service = createStrategicNodeNetworkProjectionService(validatorContext);
  const projection = service.project(season2Map);

  assert.ok(projection);
  assert.strictEqual(projection.seasonId, "season-2");
});

runTest("browser and CommonJS exports are available", () => {
  const service = createStrategicNodeNetworkProjectionService({
    validateStrategicNodeNetworkMap
  });
  assert.strictEqual(typeof service.project, "function");
  assert.strictEqual(typeof StrategicNodeNetworkProjectionError, "function");
  assert.strictEqual(typeof createStrategicNodeNetworkProjectionService, "function");
});

runTest("service source contains no prohibited dependencies", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "strategic-node-network-projection-service.js"),
    "utf8"
  );

  ["electron", "fs", "path", "http", "https", "window", "document", "navigator"].forEach((token) => {
    assert.strictEqual(source.includes(token), false, `Unexpected dependency token '${token}'`);
  });
});
