const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createUnionServerSeasonIntelligenceViewService,
  UnionServerSeasonIntelligenceViewServiceError
} = require("../src/services/union-server-season-intelligence-view-service.js");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function baseView(unionId) {
  return {
    relation: {
      seasonId: "season-1",
      serverId: "server-366",
      unionId
    },
    unionIdentity: {
      unionId,
      displayName: unionId === "union-1" ? "Moonlight Guillotine" : "Other",
      tag: unionId === "union-1" ? "MLG" : "OTH"
    },
    currentNativeAssignment: null
  };
}

function dependencies() {
  const views = [baseView("union-1"), baseView("union-2")];
  return {
    unionServerSeasonViewService: {
      getView(seasonId, serverId, unionId) {
        return views.find((view) => view.relation.unionId === unionId) || null;
      },
      listViews() {
        return views;
      }
    },
    activeStatusProjectionService: {
      getProjection(input) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          projection: {
            canonicalStatus: {
              unionId: input.unionId,
              activityState: input.unionId === "union-1" ? "active" : "inactive"
            },
            verificationHealth: "current",
            evaluatedAt: input.evaluatedAt
          }
        };
      }
    }
  };
}

test("getView composes identity relation native assignment and read-time activity", () => {
  const service = createUnionServerSeasonIntelligenceViewService(dependencies());
  const result = service.getView(
    "season-1",
    "server-366",
    "union-1",
    "2026-07-30T00:00:00Z"
  );
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.view.unionIdentity.tag, "MLG");
  assert.strictEqual(result.view.activity.canonicalStatus.activityState, "active");
  assert.strictEqual(result.view.activity.evaluatedAt, "2026-07-30T00:00:00Z");
  assert.strictEqual(
    service.getView("season-1", "server-366", "unknown", "2026-07-30T00:00:00Z"),
    null
  );
});

test("listViews preserves base relation ordering and map-specific activity", () => {
  const results = createUnionServerSeasonIntelligenceViewService(dependencies()).listViews({
    seasonId: "season-1",
    serverId: "server-366",
    evaluatedAt: "2026-07-30T00:00:00Z"
  });
  assert.deepStrictEqual(results.map((result) => result.view.relation.unionId), ["union-1", "union-2"]);
  assert.deepStrictEqual(
    results.map((result) => result.view.activity.canonicalStatus.activityState),
    ["active", "inactive"]
  );
});

test("invalid activity projection remains an explicit per-union result", () => {
  const deps = dependencies();
  deps.activeStatusProjectionService.getProjection = function getProjection() {
    return {
      valid: false,
      errors: [{ code: "invalid_fact_set", path: "input", message: "conflict" }],
      warnings: [],
      projection: null
    };
  };
  const result = createUnionServerSeasonIntelligenceViewService(deps).getView(
    "season-1",
    "server-366",
    "union-1",
    "2026-07-30T00:00:00Z"
  );
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.view, null);
  assert.strictEqual(result.errors[0].code, "invalid_fact_set");
});

test("strict inputs dependency contracts class binding and safe copies are preserved", () => {
  assert.throws(() => createUnionServerSeasonIntelligenceViewService({}), (error) => {
    assert.ok(error instanceof UnionServerSeasonIntelligenceViewServiceError);
    return true;
  });
  const service = createUnionServerSeasonIntelligenceViewService(dependencies());
  assert.throws(() => service.listViews({}), /requires input/);
  assert.throws(() => service.listViews({
    seasonId: "season-1",
    serverId: "server-366",
    evaluatedAt: "now",
    extra: true
  }), /does not recognize/);
  const result = service.getView("season-1", "server-366", "union-1", "now");
  result.view.unionIdentity.tag = "changed";
  assert.strictEqual(service.getView("season-1", "server-366", "union-1", "now").view.unionIdentity.tag, "MLG");

  class BaseViews {
    constructor() {
      this.calls = 0;
    }
    getView() {
      this.calls += 1;
      return baseView("union-1");
    }
    listViews() {
      return [];
    }
  }
  const base = new BaseViews();
  createUnionServerSeasonIntelligenceViewService({
    unionServerSeasonViewService: base,
    activeStatusProjectionService: dependencies().activeStatusProjectionService
  }).getView("season-1", "server-366", "union-1", "now");
  assert.strictEqual(base.calls, 1);

  const malformedBase = dependencies();
  malformedBase.unionServerSeasonViewService.getView = function getView() {
    return {};
  };
  assert.throws(
    () => createUnionServerSeasonIntelligenceViewService(malformedBase)
      .getView("season-1", "server-366", "union-1", "now"),
    (error) => error.code === "invalid_dependency"
  );
  const malformedList = dependencies();
  malformedList.unionServerSeasonViewService.listViews = function listViews() {
    return {};
  };
  assert.throws(
    () => createUnionServerSeasonIntelligenceViewService(malformedList)
      .listViews({ seasonId: "season-1", serverId: "server-366", evaluatedAt: "now" }),
    (error) => error.code === "invalid_dependency"
  );
  const malformedProjection = dependencies();
  malformedProjection.activeStatusProjectionService.getProjection = function getProjection() {
    return { valid: true, errors: [], projection: null };
  };
  assert.throws(
    () => createUnionServerSeasonIntelligenceViewService(malformedProjection)
      .getView("season-1", "server-366", "union-1", "now"),
    (error) => error.code === "invalid_dependency"
  );
});

test("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "union-server-season-intelligence-view-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createUnionServerSeasonIntelligenceViewService, "function");
  assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
});

if (require.main === module) {
  let passed = 0;
  tests.forEach(({ name, fn }) => {
    try {
      fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  });
  console.log(`\n${passed} tests passed`);
}
