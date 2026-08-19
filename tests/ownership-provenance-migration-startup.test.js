const assert = require("assert");
const { createOwnershipProvenanceMigrationStartup } = require("../src/main/ownership-provenance-migration-startup.js");

function identity(generation, suffix = "current") {
  return { generation, manifestFile: `generation-${generation}-${suffix}.json`, manifestSha256: `sha256:${generation}-${suffix}` };
}

function generation(source, value, suffix = "current") {
  const current = identity(value, suffix);
  return {
    status: "committed",
    source,
    pointer: { schemaVersion: 1, ...current },
    manifest: { schemaVersion: 1, generation: value, documents: [] },
    documents: []
  };
}

function createHarness(loads, executionResult, options = {}) {
  let loadCount = 0;
  const calls = [];
  const loaded = loads.slice();
  const store = {
    async loadCommittedGeneration() {
      loadCount += 1;
      return loaded.shift();
    }
  };
  const execution = {
    async execute(input) {
      calls.push(input);
      if (options.mutateInput) input.expectedCurrent.manifestFile = "mutated.json";
      if (options.throwExecution) throw Object.assign(new Error("execution failed"), { code: options.throwExecution });
      return typeof executionResult === "function" ? executionResult(input) : executionResult;
    }
  };
  return {
    startup: createOwnershipProvenanceMigrationStartup({ generationStore: store, executionCoordinator: execution }),
    calls,
    get loadCount() { return loadCount; },
    store
  };
}

function assertFrozen(value) {
  assert.ok(Object.isFrozen(value));
  if (value && typeof value === "object") Object.values(value).forEach((entry) => { if (entry && typeof entry === "object") assertFrozen(entry); });
}

(async () => {
  const publishedCandidate = { generation: 2, ...identity(2, "candidate") };
  let harness = createHarness([generation("current", 1), generation("current", 2, "candidate")], { status: "published", generation: 2, candidate: publishedCandidate });
  let result = await harness.startup.resolve();
  assert.strictEqual(result.status, "published");
  assert.strictEqual(result.persistenceMode, "generation");
  assert.deepStrictEqual(result.generation, identity(2, "candidate"));
  assert.deepStrictEqual(harness.calls, [{ expectedCurrent: identity(1) }]);
  assert.strictEqual(harness.loadCount, 2);
  console.log("PASS published result requires exact CURRENT reload");

  harness = createHarness([generation("current", 1), generation("current", 2, "candidate")], { status: "already_published", candidate: publishedCandidate });
  result = await harness.startup.resolve();
  assert.strictEqual(result.status, "already_published");
  assert.strictEqual(result.persistenceMode, "generation");
  assert.deepStrictEqual(result.generation, identity(2, "candidate"));
  console.log("PASS already-published result requires exact CURRENT reload");

  harness = createHarness([generation("current", 1), generation("current", 1)], { status: "already_proven", diagnostics: [{ code: "provenance_present" }] });
  result = await harness.startup.resolve();
  assert.strictEqual(result.status, "already_proven");
  assert.strictEqual(result.persistenceMode, "generation");
  assert.deepStrictEqual(result.generation, identity(1));
  assert.deepStrictEqual(result.diagnostics, [{ code: "provenance_present" }]);
  console.log("PASS already-proven result requires exact CURRENT reload");

  harness = createHarness([{ status: "missing" }], { status: "published" });
  result = await harness.startup.resolve();
  assert.deepStrictEqual(result, { status: "legacy_required", persistenceMode: "legacy", generation: null, reason: "no_committed_generation", diagnostics: [] });
  assert.strictEqual(harness.calls.length, 0);
  console.log("PASS missing generation returns legacy-required without execution");

  harness = createHarness([generation("previous", 1)], { status: "published", generation: 2, candidate: publishedCandidate });
  result = await harness.startup.resolve();
  assert.strictEqual(result.status, "unsafe_committed_generation");
  assert.strictEqual(result.persistenceMode, "unavailable");
  assert.strictEqual(harness.calls.length, 0);
  console.log("PASS previous/fallback source fails closed");

  for (const status of ["refused", "verification_failed", "stale_current", "storage_failure"]) {
    const executionResult = status === "verification_failed"
      ? { status, reason: `reason-${status}`, verification: { diagnostics: [{ code: status }] } }
      : { status, reason: `reason-${status}`, diagnostics: [{ code: status }] };
    harness = createHarness([generation("current", 1)], executionResult);
    result = await harness.startup.resolve();
    assert.strictEqual(result.status, status);
    assert.strictEqual(result.persistenceMode, "unavailable");
    assert.strictEqual(result.reason, `reason-${status}`);
    assert.deepStrictEqual(result.diagnostics, [{ code: status }]);
  }
  console.log("PASS execution refusal and failure results map closed");

  harness = createHarness([generation("current", 1), generation("current", 3)], { status: "published", generation: 2, candidate: publishedCandidate });
  result = await harness.startup.resolve();
  assert.deepStrictEqual(result, { status: "identity_mismatch", persistenceMode: "unavailable", generation: null, reason: "published_generation_identity_mismatch", diagnostics: [] });
  console.log("PASS reload identity mismatch fails closed");

  harness = createHarness([{ status: "committed", source: "current", pointer: {}, manifest: {}, documents: [] }], { status: "published" });
  result = await harness.startup.resolve();
  assert.strictEqual(result.status, "malformed_generation");
  harness = createHarness([generation("current", 1)], { status: "published" });
  result = await harness.startup.resolve();
  assert.strictEqual(result.status, "malformed_result");
  console.log("PASS malformed load and execution results fail closed");

  const originalLoaded = generation("current", 1);
  harness = createHarness([originalLoaded, generation("current", 2, "candidate")], { status: "published", generation: 2, candidate: publishedCandidate, diagnostics: [{ code: "safe", details: { value: 1 } }] }, { mutateInput: true });
  result = await harness.startup.resolve();
  assert.deepStrictEqual(originalLoaded.pointer, { schemaVersion: 1, ...identity(1) });
  assertFrozen(result);
  assertFrozen(result.diagnostics[0].details);
  result.diagnostics[0].details.value = 2;
  assert.strictEqual(result.diagnostics[0].details.value, 1);
  console.log("PASS identities and returned results remain isolated and deeply immutable");

  console.log("9 ownership provenance migration startup scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
