const assert = require("assert");
const {
  EVIDENCE_DOMAIN_MODULE_FIELDS,
  createEvidenceDomainModuleRegistry
} = require("../src/app/evidence-domain-module-registry.js");
const {
  DATA_MANAGEMENT_MODULE_FIELDS,
  createDataManagementModuleRegistry
} = require("../src/app/data-management-module-registry.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function scopeFor(fields) {
  const scope = {};
  fields.forEach((field) => {
    scope[field] = function moduleFactory() {};
  });
  return scope;
}

function verifyRegistry(fields, createRegistry) {
  const scope = scopeFor(fields);
  const registry = createRegistry(scope);
  assert.deepStrictEqual(Object.keys(registry), Array.from(fields));
  fields.forEach((field) => {
    assert.strictEqual(registry[field], scope[field]);
  });
  assert.strictEqual(Object.isFrozen(registry), true);
  assert.throws(() => createRegistry(null), TypeError);
  const missing = scopeFor(fields);
  delete missing[fields[0]];
  assert.throws(() => createRegistry(missing), new RegExp(fields[0]));
}

test("evidence domain registry exposes the exact frozen module contract", () => {
  verifyRegistry(EVIDENCE_DOMAIN_MODULE_FIELDS, createEvidenceDomainModuleRegistry);
});

test("data management registry exposes the exact frozen module contract", () => {
  verifyRegistry(DATA_MANAGEMENT_MODULE_FIELDS, createDataManagementModuleRegistry);
});

test("module field lists are immutable", () => {
  assert.strictEqual(Object.isFrozen(EVIDENCE_DOMAIN_MODULE_FIELDS), true);
  assert.strictEqual(Object.isFrozen(DATA_MANAGEMENT_MODULE_FIELDS), true);
});

let passed = 0;
tests.forEach(({ name, fn }) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
});
console.log(`${passed} tests passed`);
