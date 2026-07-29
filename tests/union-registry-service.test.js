const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createUnionRegistryService, UnionRegistryServiceError } = require("../src/services/union-registry-service.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function createValidInitialIdentities() {
  return [
    {
      unionId: "union-0001",
      displayName: "Moonlight Guillotine",
      tag: "MLG",
      aliases: ["Moonlight G", "Moonlight Guillotine Guild"],
      defaultColor: "#8FCEFF",
      presentationMetadata: {
        emblem: "crescent-blade"
      }
    },
    {
      unionId: "union-0002",
      displayName: "Second Union",
      tag: "SND",
      aliases: ["Second"],
      defaultColor: "#112233",
      presentationMetadata: Object.create(null),
      registryStatus: "archived"
    }
  ];
}

runTest("canonical data fixture has migrated union identity fields", () => {
  const sourcePath = path.join(__dirname, "..", "data", "unions.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

  assert.ok(Array.isArray(source.unions));
  assert.strictEqual(source.unions.length > 0, true);

  source.unions.forEach((union, index) => {
    assert.ok(union && typeof union === "object");
    assert.ok(Object.prototype.hasOwnProperty.call(union, "unionId"), `union ${index} missing unionId`);
    assert.ok(Object.prototype.hasOwnProperty.call(union, "displayName"), `union ${index} missing displayName`);
    assert.ok(Object.prototype.hasOwnProperty.call(union, "tag"), `union ${index} missing tag`);
    assert.ok(Object.prototype.hasOwnProperty.call(union, "aliases"), `union ${index} missing aliases`);
    assert.ok(Object.prototype.hasOwnProperty.call(union, "defaultColor"), `union ${index} missing defaultColor`);
    assert.ok(Object.prototype.hasOwnProperty.call(union, "presentationMetadata"), `union ${index} missing presentationMetadata`);
    assert.strictEqual(union.registryStatus, "current");
    assert.ok(!Object.prototype.hasOwnProperty.call(union, "id"));
    assert.ok(!Object.prototype.hasOwnProperty.call(union, "shortName"));
    assert.ok(!Object.prototype.hasOwnProperty.call(union, "color"));
    assert.ok(!Object.prototype.hasOwnProperty.call(union, "active"));
  });
});

function assertErrorCode(fn, code, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof UnionRegistryServiceError);
    assert.strictEqual(error.code, code);
    if (messagePattern) {
      assert.match(error.message, messagePattern);
    }

    return true;
  });
}

runTest("valid initialization", () => {
  const service = createUnionRegistryService(createValidInitialIdentities());

  assert.deepStrictEqual(service.listUnionIdentities().map((identity) => identity.unionId), ["union-0001"]);
  assert.deepStrictEqual(service.listUnionIdentities({ includeArchived: true }).map((identity) => identity.unionId), ["union-0001", "union-0002"]);
  assert.strictEqual(service.getUnionIdentity("union-0001").displayName, "Moonlight Guillotine");
  assert.strictEqual(service.getUnionIdentity("union-0002").registryStatus, "archived");
  assert.strictEqual(service.hasUnionIdentity("union-0001"), true);
  assert.strictEqual(service.hasUnionIdentity("union-9999"), false);
});

runTest("input and output reference isolation", () => {
  const input = createValidInitialIdentities();
  const service = createUnionRegistryService(input);

  input[0].displayName = "Changed Input";
  input[0].aliases.push("Changed Alias");
  input[0].presentationMetadata.emblem = "mutated";

  const list = service.listUnionIdentities({ includeArchived: true });
  const first = service.getUnionIdentity("union-0001");
  list[0].displayName = "Changed Output";
  list[0].aliases[0] = "Changed Alias";
  first.presentationMetadata.emblem = "changed";

  assert.deepStrictEqual(input, [
    {
      unionId: "union-0001",
      displayName: "Changed Input",
      tag: "MLG",
      aliases: ["Moonlight G", "Moonlight Guillotine Guild", "Changed Alias"],
      defaultColor: "#8FCEFF",
      presentationMetadata: {
        emblem: "mutated"
      }
    },
    {
      unionId: "union-0002",
      displayName: "Second Union",
      tag: "SND",
      aliases: ["Second"],
      defaultColor: "#112233",
      presentationMetadata: Object.create(null),
      registryStatus: "archived"
    }
  ]);
  assert.strictEqual(service.getUnionIdentity("union-0001").displayName, "Moonlight Guillotine");
  assert.strictEqual(service.getUnionIdentity("union-0001").presentationMetadata.emblem, "crescent-blade");
  assert.strictEqual(service.listUnionIdentities({ includeArchived: true })[0].displayName, "Moonlight Guillotine");
});

runTest("null-prototype plain objects", () => {
  const identity = Object.create(null);
  identity.unionId = "union-0100";
  identity.displayName = "Null Proto Union";
  identity.tag = "NPU";
  identity.aliases = [];
  identity.defaultColor = "#ABCDEF";
  identity.presentationMetadata = Object.create(null);

  const service = createUnionRegistryService([identity]);

  assert.strictEqual(service.getUnionIdentity("union-0100").displayName, "Null Proto Union");
});

runTest("nested structured metadata is accepted and isolated", () => {
  const metadata = Object.create(null);
  metadata.description = "root";
  metadata.flags = [true, false, null, 7, { nested: Object.create(null) }];
  metadata.flags[4].nested.label = "deep";
  metadata.nestedObject = Object.create(null);
  metadata.nestedObject.inner = {
    list: ["a", { empty: Object.create(null) }]
  };

  const service = createUnionRegistryService([
    {
      unionId: "union-0300",
      displayName: "Nested Union",
      tag: "NEST",
      aliases: [],
      defaultColor: "#334455",
      presentationMetadata: metadata
    }
  ]);

  const stored = service.getUnionIdentity("union-0300").presentationMetadata;

  assert.deepStrictEqual(stored, metadata);
  assert.notStrictEqual(stored, metadata);
  assert.notStrictEqual(stored.flags, metadata.flags);
  assert.notStrictEqual(stored.flags[4], metadata.flags[4]);
  assert.notStrictEqual(stored.nestedObject, metadata.nestedObject);
  assert.notStrictEqual(stored.nestedObject.inner, metadata.nestedObject.inner);

  metadata.description = "changed";
  metadata.flags[4].nested.label = "changed";
  metadata.nestedObject.inner.list[1].empty.marker = true;

  assert.strictEqual(service.getUnionIdentity("union-0300").presentationMetadata.description, "root");
  assert.strictEqual(service.getUnionIdentity("union-0300").presentationMetadata.flags[4].nested.label, "deep");
  assert.strictEqual(service.getUnionIdentity("union-0300").presentationMetadata.nestedObject.inner.list[1].empty.marker, undefined);
});

runTest("__proto__ metadata keys remain own properties and do not pollute prototypes", () => {
  const topLevelMetadata = JSON.parse('{"__proto__":{"polluted":true},"safe":"yes"}');
  const nestedMetadata = JSON.parse('{"safe":{"__proto__":{"polluted":true},"value":"nested"}}');

  const service = createUnionRegistryService([
    {
      unionId: "union-0340",
      displayName: "Proto Safe",
      tag: "SAFE",
      aliases: [],
      defaultColor: "#778899",
      presentationMetadata: topLevelMetadata
    },
    {
      unionId: "union-0341",
      displayName: "Nested Proto Safe",
      tag: "NPS",
      aliases: [],
      defaultColor: "#8899AA",
      presentationMetadata: nestedMetadata
    }
  ]);

  const topLevelClone = service.getUnionIdentity("union-0340").presentationMetadata;
  const nestedClone = service.getUnionIdentity("union-0341").presentationMetadata.safe;

  assert.strictEqual(Object.getPrototypeOf(topLevelClone), Object.prototype);
  assert.strictEqual(Object.getPrototypeOf(nestedClone), Object.prototype);
  assert.strictEqual(Object.prototype.polluted, undefined);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(topLevelClone.polluted, undefined);
  assert.strictEqual(nestedClone.polluted, undefined);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(topLevelClone, "__proto__"), true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(nestedClone, "__proto__"), true);
  assert.strictEqual(topLevelClone.__proto__.polluted, true);
  assert.strictEqual(nestedClone.__proto__.polluted, true);
  assert.strictEqual(topLevelClone.safe, "yes");
  assert.strictEqual(nestedClone.value, "nested");
});

runTest("returned ordinary and null-prototype metadata preserve their prototypes", () => {
  const service = createUnionRegistryService([
    {
      unionId: "union-0342",
      displayName: "Prototype Shapes",
      tag: "PTS",
      aliases: [],
      defaultColor: "#99AABB",
      presentationMetadata: {
        ordinary: {
          nested: "value"
        },
        nullProto: Object.create(null)
      }
    }
  ]);

  const metadata = service.getUnionIdentity("union-0342").presentationMetadata;

  assert.strictEqual(Object.getPrototypeOf(metadata.ordinary), Object.prototype);
  assert.strictEqual(Object.getPrototypeOf(metadata.nullProto), null);
});

runTest("initialization does not retain nested references", () => {
  const metadata = {
    nested: {
      items: [Object.create(null)]
    }
  };
  metadata.nested.items[0].tag = "stable";

  const service = createUnionRegistryService([
    {
      unionId: "union-0310",
      displayName: "Init Isolation",
      tag: "INI",
      aliases: [],
      defaultColor: "#445566",
      presentationMetadata: metadata
    }
  ]);

  metadata.nested.items[0].tag = "mutated";

  assert.strictEqual(service.getUnionIdentity("union-0310").presentationMetadata.nested.items[0].tag, "stable");
});

runTest("create does not retain nested references", () => {
  const metadata = {
    nested: {
      items: [1, { label: "create" }]
    }
  };

  const service = createUnionRegistryService([]);
  service.createUnionIdentity({
    unionId: "union-0320",
    displayName: "Create Isolation",
    tag: "CRT",
    aliases: [],
    defaultColor: "#556677",
    presentationMetadata: metadata
  });

  metadata.nested.items[1].label = "changed";

  assert.strictEqual(service.getUnionIdentity("union-0320").presentationMetadata.nested.items[1].label, "create");
});

runTest("update does not retain nested references", () => {
  const service = createUnionRegistryService([
    {
      unionId: "union-0330",
      displayName: "Update Isolation",
      tag: "UPD",
      aliases: [],
      defaultColor: "#667788",
      presentationMetadata: {
        nested: { label: "before" }
      }
    }
  ]);

  const replacementMetadata = {
    nested: {
      list: [Object.create(null)]
    }
  };
  replacementMetadata.nested.list[0].value = "updated";

  service.updateUnionIdentity("union-0330", {
    presentationMetadata: replacementMetadata
  });

  replacementMetadata.nested.list[0].value = "changed";

  assert.strictEqual(service.getUnionIdentity("union-0330").presentationMetadata.nested.list[0].value, "updated");
});

runTest("invalid nested metadata values are rejected", () => {
  const baseIdentity = {
    unionId: "union-0400",
    displayName: "Reject Union",
    tag: "REJ",
    aliases: [],
    defaultColor: "#778899",
    presentationMetadata: {}
  };

  [
    { label: "Date", value: new Date("2026-07-29T00:00:00Z"), path: /presentationMetadata\.bad/ },
    { label: "Map", value: new Map(), path: /presentationMetadata\.bad/ },
    { label: "Set", value: new Set(), path: /presentationMetadata\.bad/ },
    { label: "function", value: () => {}, path: /presentationMetadata\.bad/ },
    { label: "class instance", value: new (class Thing {})(), path: /presentationMetadata\.bad/ }
  ].forEach(({ value, path }) => {
    const identity = clone(baseIdentity);
    identity.unionId = `union-${Math.random().toString().slice(2, 6)}`;
    identity.presentationMetadata = { bad: value };
    assertErrorCode(() => createUnionRegistryService([identity]), "invalid_input", path);
  });
});

runTest("invalid primitive metadata values are rejected", () => {
  const baseIdentity = {
    unionId: "union-0410",
    displayName: "Primitive Reject",
    tag: "PRI",
    aliases: [],
    defaultColor: "#8899AA",
    presentationMetadata: {}
  };

  [
    { value: undefined, path: /presentationMetadata\.bad/ },
    { value: NaN, path: /non-finite number/ },
    { value: Infinity, path: /non-finite number/ },
    { value: 1n, path: /bigint/ },
    { value: Symbol("x"), path: /symbol/ }
  ].forEach(({ value, path }) => {
    const identity = clone(baseIdentity);
    identity.unionId = `union-${Math.random().toString().slice(2, 6)}`;
    identity.presentationMetadata = { bad: value };
    assertErrorCode(() => createUnionRegistryService([identity]), "invalid_input", path);
  });
});

runTest("cyclic metadata is rejected cleanly", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  assertErrorCode(() => createUnionRegistryService([
    {
      unionId: "union-0420",
      displayName: "Cyclic Reject",
      tag: "CYC",
      aliases: [],
      defaultColor: "#99AABB",
      presentationMetadata: cyclic
    }
  ]), "invalid_input", /cyclic reference/);
});

runTest("failed metadata update leaves existing identity unchanged", () => {
  const service = createUnionRegistryService([
    {
      unionId: "union-0430",
      displayName: "Atomic Metadata",
      tag: "ATM",
      aliases: [],
      defaultColor: "#AABBCC",
      presentationMetadata: {
        nested: { label: "stable" }
      }
    }
  ]);

  const before = service.getUnionIdentity("union-0430");

  assertErrorCode(() => service.updateUnionIdentity("union-0430", {
    presentationMetadata: {
      nested: {
        bad: new Date("2026-07-29T00:00:00Z")
      }
    }
  }), "invalid_input", /presentationMetadata\.nested\.bad/);

  assert.deepStrictEqual(service.getUnionIdentity("union-0430"), before);
});

runTest("malformed fields and unknown fields", () => {
  assertErrorCode(() => createUnionRegistryService(null), "invalid_input", /initialIdentities/);
  assertErrorCode(() => createUnionRegistryService({}), "invalid_input", /initialIdentities/);
  assertErrorCode(() => createUnionRegistryService([[]]), "invalid_input", /plain object/);

  const missingDisplayName = createValidInitialIdentities();
  delete missingDisplayName[0].displayName;
  assertErrorCode(() => createUnionRegistryService(missingDisplayName), "invalid_input", /displayName/);

  const badColor = createValidInitialIdentities();
  badColor[0].defaultColor = "blue";
  assertErrorCode(() => createUnionRegistryService(badColor), "invalid_input", /#RRGGBB/);

  const badAliases = createValidInitialIdentities();
  badAliases[0].aliases = ["Alpha", " "];
  assertErrorCode(() => createUnionRegistryService(badAliases), "invalid_input", /aliases\[1\]/);

  const unknownField = createValidInitialIdentities();
  unknownField[0].notes = "unexpected";
  assertErrorCode(() => createUnionRegistryService(unknownField), "invalid_input", /field 'notes'/);
});

runTest("legacy active rejection", () => {
  const identities = createValidInitialIdentities();
  identities[0].active = true;

  assertErrorCode(() => createUnionRegistryService(identities), "invalid_input", /field 'active'/);
});

runTest("duplicate unionId and duplicate aliases within one identity", () => {
  const duplicateIds = createValidInitialIdentities();
  duplicateIds.push({
    unionId: "union-0001",
    displayName: "Duplicate",
    tag: "DUP",
    aliases: [],
    defaultColor: "#123456",
    presentationMetadata: {}
  });

  assertErrorCode(() => createUnionRegistryService(duplicateIds), "duplicate_union_id", /union-0001/);

  const duplicateAliases = createValidInitialIdentities();
  duplicateAliases[0].unionId = "union-0010";
  duplicateAliases[0].aliases = ["Alpha", "alpha"];

  assertErrorCode(() => createUnionRegistryService(duplicateAliases), "invalid_input", /unique case-insensitively/);
});

runTest("duplicate tags across identities are allowed", () => {
  const service = createUnionRegistryService([
    {
      unionId: "union-0101",
      displayName: "First",
      tag: "TAG",
      aliases: [],
      defaultColor: "#111111",
      presentationMetadata: {}
    },
    {
      unionId: "union-0102",
      displayName: "Second",
      tag: "TAG",
      aliases: [],
      defaultColor: "#222222",
      presentationMetadata: {}
    }
  ]);

  assert.deepStrictEqual(service.listUnionIdentities().map((identity) => identity.unionId), ["union-0101", "union-0102"]);
});

runTest("create and update", () => {
  const service = createUnionRegistryService([]);

  const created = service.createUnionIdentity({
    unionId: "union-0200",
    displayName: "Created Union",
    tag: "CRT",
    aliases: ["Creator"],
    defaultColor: "#445566",
    presentationMetadata: {
      emblem: "spark"
    }
  });

  assert.strictEqual(created.registryStatus, "current");
  assert.strictEqual(service.listUnionIdentities().length, 1);

  const updated = service.updateUnionIdentity("union-0200", {
    displayName: "Updated Union",
    tag: "UPD",
    aliases: ["Updated"],
    defaultColor: "#667788",
    presentationMetadata: Object.create(null)
  });

  assert.strictEqual(updated.displayName, "Updated Union");
  assert.strictEqual(updated.tag, "UPD");
  assert.deepStrictEqual(service.getUnionIdentity("union-0200"), updated);
});

runTest("immutable unionId and registryStatus rejection", () => {
  const service = createUnionRegistryService(createValidInitialIdentities());

  assertErrorCode(
    () => service.updateUnionIdentity("union-0001", { unionId: "union-9999" }),
    "immutable_field_change",
    /unionId/
  );

  assertErrorCode(
    () => service.updateUnionIdentity("union-0001", { registryStatus: "archived" }),
    "immutable_field_change",
    /registryStatus/
  );
});

runTest("failed update is atomic", () => {
  const service = createUnionRegistryService(createValidInitialIdentities());
  const before = service.getUnionIdentity("union-0001");

  assertErrorCode(
    () => service.updateUnionIdentity("union-0001", {
      displayName: "Atomic Failure",
      aliases: ["Alpha", "alpha"]
    }),
    "invalid_input",
    /unique case-insensitively/
  );

  assert.deepStrictEqual(service.getUnionIdentity("union-0001"), before);
});

runTest("archive restore idempotency and list filtering", () => {
  const service = createUnionRegistryService(createValidInitialIdentities());

  const archived = service.archiveUnionIdentity("union-0001");
  assert.strictEqual(archived.registryStatus, "archived");
  assert.strictEqual(service.getUnionIdentity("union-0001").registryStatus, "archived");
  assert.deepStrictEqual(service.listUnionIdentities().map((identity) => identity.unionId), []);
  assert.deepStrictEqual(service.listUnionIdentities({ includeArchived: true }).map((identity) => identity.unionId), ["union-0001", "union-0002"]);

  const archivedAgain = service.archiveUnionIdentity("union-0001");
  assert.strictEqual(archivedAgain.registryStatus, "archived");

  const restored = service.restoreUnionIdentity("union-0001");
  assert.strictEqual(restored.registryStatus, "current");
  assert.deepStrictEqual(service.listUnionIdentities().map((identity) => identity.unionId), ["union-0001"]);

  const restoredAgain = service.restoreUnionIdentity("union-0001");
  assert.strictEqual(restoredAgain.registryStatus, "current");
});

runTest("unknown-union behaviour", () => {
  const service = createUnionRegistryService(createValidInitialIdentities());

  assert.strictEqual(service.getUnionIdentity("union-9999"), null);
  assert.strictEqual(service.hasUnionIdentity("union-9999"), false);

  assertErrorCode(() => service.updateUnionIdentity("union-9999", { displayName: "Nope" }), "unknown_union", /union-9999/);
  assertErrorCode(() => service.archiveUnionIdentity("union-9999"), "unknown_union", /union-9999/);
  assertErrorCode(() => service.restoreUnionIdentity("union-9999"), "unknown_union", /union-9999/);
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createUnionRegistryService, "function");
  assert.strictEqual(typeof UnionRegistryServiceError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "union-registry-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createUnionRegistryService, "function");
  assert.strictEqual(typeof sandbox.globalThis.UnionRegistryServiceError, "function");
});

runTest("service source stays infrastructure-free", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "union-registry-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
});

if (require.main === module) {
  let passed = 0;

  runTest.tests.forEach(({ name, fn }) => {
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