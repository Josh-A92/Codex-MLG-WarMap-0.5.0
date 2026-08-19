const assert = require("assert");
const { createLegacyStateClassifier } = require("../src/services/legacy-state-classifier.js");
const { createWarMapStartupReadiness } = require("../src/main/warmap-startup-readiness.js");

const base = { seasonId: "season-1", baseMapId: "season1-map" };
function dataEnvelope(withRecord = false) { return { seasonId: base.seasonId, strategicDomain: { seasonId: base.seasonId, state: { territoryOwnershipRecords: withRecord ? [{ seasonId: base.seasonId, serverId: "server-366", territoryRef: { type: "normal_map_cell", row: 1, col: 1 }, ownerUnionId: "union-1", reviewState: "confirmed", supersededBy: null }] : [], structureOwnershipRecords: [] } } }; }
function serverEnvelope(ownership = {}) { return { seasonId: base.seasonId, baseMapId: base.baseMapId, servers: [{ id: "server-366", ownership }] }; }
function createClassifier() {
  return createLegacyStateClassifier({
    deserializeDataManagementEnvelope: (value) => { if (value && value.corrupt) throw new Error("bad data management"); return structuredClone(value); },
    deserializeServerStateEnvelope: (value) => structuredClone(value)
  });
}
function createHarness(migrationResult, legacyInput, options = {}) {
  let loads = 0;
  const loader = {
    async load() {
      loads += 1;
      if (options.loaderError) throw Object.assign(new Error("legacy load failed"), { code: options.loaderError });
      return typeof legacyInput === "function" ? legacyInput() : legacyInput;
    }
  };
  const migrationStartup = {
    async resolve() {
      if (options.migrationError) throw Object.assign(new Error("migration failed"), { code: options.migrationError });
      return typeof migrationResult === "function" ? migrationResult() : migrationResult;
    }
  };
  return { readiness: createWarMapStartupReadiness({ migrationStartup, legacyStateLoader: loader, legacyStateClassifier: options.classifier || createClassifier() }), get loads() { return loads; } };
}
function assertBlocked(result, reason, classification = null) {
  assert.strictEqual(result.status, "blocked");
  assert.strictEqual(result.persistenceMode, "unavailable");
  assert.strictEqual(result.reason, reason);
  assert.strictEqual(result.classification, classification);
}
function generationResult() { return { status: "published", persistenceMode: "generation", generation: { generation: 2 }, diagnostics: [{ code: "trusted" }] }; }

(async () => {
  let harness = createHarness(generationResult, { seasonId: base.seasonId, baseMapId: base.baseMapId });
  let result = await harness.readiness.resolve();
  assert.strictEqual(result.status, "published");
  assert.strictEqual(result.persistenceMode, "generation");
  assert.strictEqual(harness.loads, 0);
  console.log("PASS safe generation readiness bypasses legacy loading");

  harness = createHarness({ status: "verification_failed", persistenceMode: "unavailable", reason: "refused" }, () => { throw new Error("must not load legacy"); });
  result = await harness.readiness.resolve();
  assertBlocked(result, "refused");
  assert.strictEqual(harness.loads, 0);
  console.log("PASS unsafe generation readiness never falls back to legacy");

  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, { ...base, dataManagementEnvelope: null, serverStateEnvelope: null, unionRegistryEnvelopes: [] });
  result = await harness.readiness.resolve();
  assert.deepStrictEqual(result, { status: "first_run", persistenceMode: "legacy", reason: null, classification: "first_run", diagnostics: [] });
  console.log("PASS absent legacy state returns first-run readiness");

  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, { ...base, dataManagementEnvelope: dataEnvelope(), serverStateEnvelope: serverEnvelope(), unionRegistryEnvelopes: [] });
  result = await harness.readiness.resolve();
  assert.deepStrictEqual(result, { status: "legacy_ready", persistenceMode: "legacy", reason: null, classification: "aligned", diagnostics: [] });
  console.log("PASS aligned legacy classification returns legacy-ready");

  const blockedCases = [
    ["rebuildable_projection", { ...base, dataManagementEnvelope: dataEnvelope(true), serverStateEnvelope: serverEnvelope({ "1-1": "other-union" }), unionRegistryEnvelopes: [] }, "legacy_classification_blocked"],
    ["recovery_required", { ...base, dataManagementEnvelope: dataEnvelope(), serverStateEnvelope: null, unionRegistryEnvelopes: [] }, "partial_legacy_state"],
    ["corrupt", { ...base, dataManagementEnvelope: { corrupt: true }, serverStateEnvelope: serverEnvelope(), unionRegistryEnvelopes: [] }, "legacy_validation_failed"]
  ];
  for (const [classification, input, reason] of blockedCases) {
    harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, input);
    result = await harness.readiness.resolve();
    assertBlocked(result, reason, classification);
  }
  const conflicting = { ...base, dataManagementEnvelope: dataEnvelope(), serverStateEnvelope: serverEnvelope(), unionRegistryEnvelopes: [{ identities: [{ unionId: "one" }] }, { identities: [{ unionId: "one" }, { unionId: "two" }] }] };
  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, conflicting);
  result = await harness.readiness.resolve();
  assertBlocked(result, "conflicting_union_registry_copies", "recovery_required");
  console.log("PASS unsafe legacy classifications remain blocked");

  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, null, { loaderError: "legacy_io_failed" });
  result = await harness.readiness.resolve();
  assertBlocked(result, "legacy_io_failed");
  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, {}, { classifier: { classify: () => { throw Object.assign(new Error("bad classifier"), { code: "classifier_failed" }); } } });
  result = await harness.readiness.resolve();
  assertBlocked(result, "classifier_failed");
  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, {} , { classifier: { classify: () => ({}) } });
  result = await harness.readiness.resolve();
  assertBlocked(result, "malformed_legacy_classification");
  console.log("PASS loader and classifier failures fail closed");

  const legacyInput = { ...base, dataManagementEnvelope: dataEnvelope(), serverStateEnvelope: serverEnvelope(), unionRegistryEnvelopes: [] };
  harness = createHarness({ status: "legacy_required", persistenceMode: "legacy" }, legacyInput);
  result = await harness.readiness.resolve();
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "dataManagementEnvelope"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "serverStateEnvelope"));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.diagnostics));
  legacyInput.dataManagementEnvelope.seasonId = "changed";
  assert.strictEqual(result.classification, "aligned");
  console.log("PASS readiness results expose no legacy state and remain immutable");

  console.log("9 startup readiness scenarios passed");
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
