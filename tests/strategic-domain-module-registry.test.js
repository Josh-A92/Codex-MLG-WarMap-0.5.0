const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  STRATEGIC_DOMAIN_MODULE_FIELDS,
  createStrategicDomainModuleRegistry
} = require("../src/app/strategic-domain-module-registry.js");

function createScope() {
  const scope = {};
  STRATEGIC_DOMAIN_MODULE_FIELDS.forEach((field) => {
    scope[field] = function moduleFactory() {};
  });
  return scope;
}

const scope = createScope();
const registry = createStrategicDomainModuleRegistry(scope);
assert.deepStrictEqual(Object.keys(registry), STRATEGIC_DOMAIN_MODULE_FIELDS);
STRATEGIC_DOMAIN_MODULE_FIELDS.forEach((field) => {
  assert.strictEqual(registry[field], scope[field]);
});
assert.strictEqual(Object.isFrozen(registry), true);
assert.throws(() => {
  Object.defineProperty(registry, "createUnionRegistryService", { value: null });
}, TypeError);

STRATEGIC_DOMAIN_MODULE_FIELDS.forEach((field) => {
  const missing = createScope();
  delete missing[field];
  assert.throws(
    () => createStrategicDomainModuleRegistry(missing),
    new RegExp(`scope\\.${field}`)
  );
  const invalid = createScope();
  invalid[field] = {};
  assert.throws(
    () => createStrategicDomainModuleRegistry(invalid),
    new RegExp(`scope\\.${field}`)
  );
});
assert.throws(() => createStrategicDomainModuleRegistry(null), /scope to be an object/);
assert.throws(() => createStrategicDomainModuleRegistry([]), /scope to be an object/);

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "strategic-domain-module-registry.js"),
  "utf8"
);
const sandbox = { globalThis: {}, module: undefined };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(typeof sandbox.globalThis.createStrategicDomainModuleRegistry, "function");
assert.strictEqual(Array.isArray(sandbox.globalThis.STRATEGIC_DOMAIN_MODULE_FIELDS), true);
assert.ok(!/\bdocument\b|\bfetch\b|XMLHttpRequest|WebSocket|electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));

console.log("ok - strategic domain module registry");
console.log("\n1 test passed");
