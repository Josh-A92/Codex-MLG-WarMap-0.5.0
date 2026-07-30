const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createUnionMatchingService,
  UnionMatchingServiceError
} = require("../src/services/union-matching-service.js");
const { createUnionRegistryService } = require("../src/services/union-registry-service.js");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function identity(overrides) {
  return Object.assign({
    unionId: "union-1",
    displayName: "Moonlight Guillotine",
    tag: "MLG",
    aliases: ["Moonlight G", "Moonlight Guillotine Guild"],
    defaultColor: "#8FCEFF",
    presentationMetadata: {},
    registryStatus: "current"
  }, overrides || {});
}

function service(identities) {
  return createUnionMatchingService({
    unionRegistryService: createUnionRegistryService(identities || [identity()])
  });
}

test("matching precedence is canonical ID then tag then display name then alias", () => {
  const matcher = service([
    identity(),
    identity({
      unionId: "MLG",
      displayName: "ID Wins",
      tag: "OTHER",
      aliases: [],
      defaultColor: "#112233"
    })
  ]);
  const idResult = matcher.match({ value: "MLG" });
  assert.strictEqual(idResult.status, "matched");
  assert.strictEqual(idResult.matchType, "exact_id");
  assert.strictEqual(idResult.matchedUnion.displayName, "ID Wins");

  const tagResult = service().match({ value: "  mlg  " });
  assert.strictEqual(tagResult.matchType, "exact_tag");
  assert.strictEqual(tagResult.matchedUnion.unionId, "union-1");

  const nameResult = service().match({ value: " moonlight guillotine " });
  assert.strictEqual(nameResult.matchType, "exact_name");
  assert.strictEqual(nameResult.matchedUnion.unionId, "union-1");

  const aliasResult = service().match({ value: "moonlight g" });
  assert.strictEqual(aliasResult.matchType, "alias");
});

test("duplicate canonical display names are surfaced as ambiguous", () => {
  const matcher = service([
    identity(),
    identity({
      unionId: "union-2",
      displayName: "moonlight guillotine",
      tag: "OTH",
      aliases: [],
      defaultColor: "#112233"
    })
  ]);
  const result = matcher.match({ value: "Moonlight Guillotine" });
  assert.strictEqual(result.status, "ambiguous");
  assert.strictEqual(result.matchType, "exact_name");
  assert.deepStrictEqual(result.candidates.map((item) => item.unionId), ["union-1", "union-2"]);
});

test("ambiguous tag or alias matches are surfaced and never silently merged", () => {
  const tagMatcher = service([
    identity(),
    identity({
      unionId: "union-2",
      displayName: "Other",
      tag: "mlg",
      aliases: [],
      defaultColor: "#112233"
    })
  ]);
  const tagResult = tagMatcher.match({ value: "MLG" });
  assert.strictEqual(tagResult.status, "ambiguous");
  assert.strictEqual(tagResult.matchType, "exact_tag");
  assert.strictEqual(tagResult.matchedUnion, null);
  assert.deepStrictEqual(tagResult.candidates.map((item) => item.unionId), ["union-1", "union-2"]);

  const aliasMatcher = service([
    identity({ aliases: ["shared"] }),
    identity({
      unionId: "union-2",
      displayName: "Other",
      tag: "OTH",
      aliases: ["SHARED"],
      defaultColor: "#112233"
    })
  ]);
  assert.strictEqual(aliasMatcher.match({ value: "shared" }).status, "ambiguous");
});

test("unmatched input remains a proposal candidate rather than creating identity", () => {
  const registry = createUnionRegistryService([identity()]);
  const matcher = createUnionMatchingService({ unionRegistryService: registry });
  const result = matcher.match({ value: "NEW" });
  assert.deepStrictEqual(result, {
    status: "unmatched",
    matchType: null,
    normalizedValue: "new",
    matchedUnion: null,
    candidates: []
  });
  assert.strictEqual(registry.listUnionIdentities().length, 1);
});

test("archived identities are excluded from matching", () => {
  const matcher = service([
    identity({ registryStatus: "archived" })
  ]);
  assert.strictEqual(matcher.match({ value: "MLG" }).status, "unmatched");
});

test("strict boundaries class binding and safe result copies are preserved", () => {
  assert.throws(() => createUnionMatchingService({}), (error) => {
    assert.ok(error instanceof UnionMatchingServiceError);
    return true;
  });
  const matcher = service();
  assert.throws(() => matcher.match({}), /requires input.value/);
  assert.throws(() => matcher.match({ value: "MLG", extra: true }), /does not recognize/);
  assert.throws(() => matcher.match({ value: " " }), /non-empty string/);

  class Registry {
    constructor() {
      this.calls = 0;
    }
    listUnionIdentities() {
      this.calls += 1;
      return [identity()];
    }
  }
  const registry = new Registry();
  const result = createUnionMatchingService({ unionRegistryService: registry }).match({ value: "MLG" });
  result.matchedUnion.aliases.push("mutated");
  result.matchedUnion.presentationMetadata.changed = true;
  assert.strictEqual(result.candidates[0].aliases.includes("mutated"), false);
  assert.strictEqual(result.candidates[0].presentationMetadata.changed, undefined);
  assert.strictEqual(registry.calls, 1);
  assert.strictEqual(createUnionMatchingService({ unionRegistryService: registry })
    .match({ value: "MLG" }).matchedUnion.aliases.includes("mutated"), false);
  assert.throws(() => createUnionMatchingService({
    unionRegistryService: {
      listUnionIdentities() {
        return [{ unionId: "broken" }];
      }
    }
  }).match({ value: "broken" }), (error) => error.code === "invalid_dependency");
});

test("CommonJS browser-global and infrastructure boundaries remain isolated", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "union-matching-service.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createUnionMatchingService, "function");
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
