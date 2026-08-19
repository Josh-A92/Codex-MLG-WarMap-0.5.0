const assert = require("assert");
const season1Servers = require("../data/season1-servers.json");
const season1Map = require("../data/season1-map.json");
const season2Map = require("../data/season2-map.json");
const { SEASON_1_PACKAGE } = require("../src/seasons/season1-package.js");
const { SEASON_2_PACKAGE } = require("../src/seasons/season2-package.js");
const { contextFromCommitted, legacySeasonIdFromAdministration } = require("../src/main/warmap-electron-startup.js");
const season2CommittedServers = [{ id: "server-201", label: "Server 201" }, { id: "server-202", label: "Server 202" }];

function identity(generation = 7) {
  return { generation, manifestFile: `generation-${generation}.json`, manifestSha256: `sha256:generation-${generation}` };
}

function committed(seasonId, packageValue, servers, options = {}) {
  const baseMapId = packageValue.rulesDefinition.mapDefinition.baseMapId;
  const activeServerIds = options.activeServerIds || [servers[0].id];
  const pointer = identity();
  const documents = [
    {
      documentId: "season-administration",
      scope: "global",
      type: "season-administration",
      fileName: "administration.json",
      sha256: "sha256:administration",
      value: {
        schemaVersion: 2,
        activeSeason: {
          schemaVersion: 1,
          seasonId,
          packageVersion: packageValue.packageIdentity.packageVersion,
          serverIds: activeServerIds,
          confirmations: { mapAndStructures: true, resourcesAndValues: true },
          activatedAt: "2026-08-19T00:00:00.000Z",
          activatedBy: "local"
        },
        completedSeasons: []
      }
    },
    { documentId: `strategic-${seasonId}`, scope: seasonId, type: "strategic-domain", fileName: "strategic.json", sha256: "sha256:strategic", value: { schemaVersion: 1, seasonId, state: {} } },
    { documentId: `projection-${seasonId}-${baseMapId}`, scope: `${seasonId}/${baseMapId}`, type: "server-state", fileName: "projection.json", sha256: "sha256:projection", value: { schemaVersion: 1, seasonId, baseMapId, savedAt: "2026-08-19T00:00:00.000Z", servers: servers.map((server) => ({ id: server.id, label: server.label, ownership: {} })) } }
  ];
  const manifest = { schemaVersion: 1, generation: pointer.generation, transactionId: "fixture", createdAt: "2026-08-19T00:00:00.000Z", documents: documents.map(({ value, ...document }) => document) };
  return { status: "committed", source: "current", pointer, manifest, documents };
}

function assertContext(context, seasonId, packageValue, servers, activeServerIds) {
  assert.strictEqual(context.seasonId, seasonId);
  assert.deepStrictEqual(context.packageValue.packageIdentity, packageValue.packageIdentity);
  assert.strictEqual(context.baseMapId, packageValue.rulesDefinition.mapDefinition.baseMapId);
  assert.deepStrictEqual(context.serverIds, activeServerIds);
  assert.deepStrictEqual(context.servers.servers.map((server) => server.id), servers.map((server) => server.id));
}

const season1 = committed("season-1", SEASON_1_PACKAGE, season1Servers.servers, { activeServerIds: [season1Servers.servers[0].id] });
const season1Context = contextFromCommitted(season1);
assertContext(season1Context, "season-1", SEASON_1_PACKAGE, season1Servers.servers, [season1Servers.servers[0].id]);
assert.ok(Array.isArray(season1Context.map.tiles));
console.log("PASS Season 1 committed context resolves registered package, map, and active servers");

const season2 = committed("season-2", SEASON_2_PACKAGE, season2CommittedServers, { activeServerIds: [season2CommittedServers[0].id] });
const season2Before = JSON.stringify(season2);
const season2Context = contextFromCommitted(season2);
assertContext(season2Context, "season-2", SEASON_2_PACKAGE, season2CommittedServers, [season2CommittedServers[0].id]);
assert.strictEqual(season2Context.baseMapId, "season2-strategic-node-network");
assert.ok(Array.isArray(season2Context.map.nodes));
assert.ok(!Object.prototype.hasOwnProperty.call(season2Context.map, "tiles"));
assert.notStrictEqual(season2Context.map, season1Context.map);
assert.notStrictEqual(season2Context.servers, season1Context.servers);
assert.strictEqual(JSON.stringify(season2), season2Before);
console.log("PASS Season 2 uses the same production path without Season 1 data defaults");

const unknownPackage = committed("season-unknown", { ...SEASON_2_PACKAGE, packageIdentity: { ...SEASON_2_PACKAGE.packageIdentity, seasonId: "season-unknown" } }, season2CommittedServers);
assert.throws(() => contextFromCommitted(unknownPackage), (error) => error.code === "season_package_mismatch");
console.log("PASS unknown active package fails closed");

const scopeMismatch = committed("season-2", SEASON_2_PACKAGE, season2CommittedServers);
scopeMismatch.documents.find((document) => document.type === "server-state").scope = "season-2/wrong-map";
assert.throws(() => contextFromCommitted(scopeMismatch), (error) => error.code === "generation_scope_mismatch");
console.log("PASS strategic/projection scope mismatch fails closed");

const missingActiveServer = committed("season-2", SEASON_2_PACKAGE, season2CommittedServers, { activeServerIds: ["server-not-in-projection"] });
assert.throws(() => contextFromCommitted(missingActiveServer), (error) => error.code === "server_scope_mismatch");
console.log("PASS missing active projection server fails closed");

const inactiveProjectionServers = committed("season-2", SEASON_2_PACKAGE, season2CommittedServers, { activeServerIds: [season2CommittedServers[0].id] });
const inactiveContext = contextFromCommitted(inactiveProjectionServers);
assert.deepStrictEqual(inactiveContext.serverIds, [season2CommittedServers[0].id]);
assert.ok(inactiveContext.servers.servers.some((server) => server.id === season2CommittedServers[1].id));
console.log("PASS inactive registered projection servers remain non-active participants");

const overrideAttempt = committed("season-2", SEASON_2_PACKAGE, season2CommittedServers);
const overrideBefore = JSON.stringify(overrideAttempt);
const overrideContext = contextFromCommitted(overrideAttempt, { seasonId: "season-1", packageValue: SEASON_1_PACKAGE, baseMapId: "season1-map", serverIds: ["forged-server"] });
assert.strictEqual(overrideContext.seasonId, "season-2");
assert.deepStrictEqual(overrideContext.packageValue.packageIdentity, SEASON_2_PACKAGE.packageIdentity);
assert.strictEqual(overrideContext.baseMapId, "season2-strategic-node-network");
assert.strictEqual(JSON.stringify(overrideAttempt), overrideBefore);
console.log("PASS renderer/request input cannot override committed context");

const resultBeforeMutation = JSON.stringify(season2Context);
try { season2Context.serverIds.push("mutated"); } catch (_error) { }
try { season2Context.map.nodes[0].nodeId = "mutated"; } catch (_error) { }
assert.strictEqual(JSON.stringify(season2Context), resultBeforeMutation);
assert.ok(Object.isFrozen(season2Context));
assert.strictEqual(season2.documents.find((document) => document.type === "strategic-domain").value.seasonId, "season-2");
assert.strictEqual(season2.documents.find((document) => document.type === "server-state").value.baseMapId, "season2-strategic-node-network");
console.log("PASS committed inputs remain unchanged after returned context mutation");

assert.strictEqual(legacySeasonIdFromAdministration({
  activeSeason: null,
  completedSeasons: [{ seasonId: "season-1" }, { seasonId: "season-2" }]
}), "season-2");
assert.strictEqual(legacySeasonIdFromAdministration({
  activeSeason: { seasonId: "season-1" },
  completedSeasons: [{ seasonId: "season-2" }]
}), "season-1");
assert.strictEqual(legacySeasonIdFromAdministration({ activeSeason: null, completedSeasons: [] }), null);
console.log("PASS legacy startup restores the latest archived season without treating it as active migration context");

console.log("9 Electron startup context scenarios passed");
