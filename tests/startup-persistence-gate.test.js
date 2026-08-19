const assert = require("assert");
const {
  createStartupPersistenceGate,
  StartupPersistenceGateError
} = require("../src/main/startup-persistence-gate.js");

function startupResult(status, persistenceMode, diagnostics = []) {
  return {
    status,
    persistenceMode,
    generation: persistenceMode === "generation" ? { generation: 2, manifestFile: "candidate.json", manifestSha256: "sha256:candidate" } : null,
    reason: null,
    diagnostics
  };
}

async function assertCode(operation, code) {
  await assert.rejects(operation, (error) => error instanceof StartupPersistenceGateError && error.code === code);
}

(async () => {
  let gate = createStartupPersistenceGate();
  let executed = false;
  await assertCode(() => gate.writeGeneration(async () => { executed = true; }), "startup_not_ready");
  await assertCode(() => gate.writeLegacy(async () => { executed = true; }), "startup_not_ready");
  assert.strictEqual(executed, false);
  console.log("PASS writes reject before settlement");

  gate = createStartupPersistenceGate();
  gate.settle(startupResult("published", "generation"));
  let generationWrites = 0;
  await gate.writeGeneration(async () => { generationWrites += 1; });
  await assertCode(() => gate.writeLegacy(async () => { throw new Error("must not execute"); }), "persistence_mode_inactive");
  assert.strictEqual(generationWrites, 1);
  console.log("PASS safe generation result enables only generation writes");

  gate = createStartupPersistenceGate();
  gate.settle(startupResult("legacy_required", "legacy"));
  const legacyState = gate.getState();
  assert.deepStrictEqual(legacyState, { status: "blocked", settled: true, mode: null, reason: "legacy_classification_required", diagnostics: [] });
  let legacyExecuted = false;
  let generationExecuted = false;
  await assertCode(() => gate.writeLegacy(async () => { legacyExecuted = true; }), "persistence_mode_inactive");
  await assertCode(() => gate.writeGeneration(async () => { generationExecuted = true; }), "persistence_mode_inactive");
  assert.strictEqual(legacyExecuted, false);
  assert.strictEqual(generationExecuted, false);
  console.log("PASS legacy-required result cannot authorize either write mode");

  for (const status of ["first_run", "legacy_ready"]) {
    gate = createStartupPersistenceGate();
    gate.settle(startupResult(status, "legacy"));
    let legacyWrites = 0;
    await gate.writeLegacy(async () => { legacyWrites += 1; });
    await assertCode(() => gate.writeGeneration(async () => { throw new Error("must not execute"); }), "persistence_mode_inactive");
    assert.strictEqual(legacyWrites, 1);
  }
  console.log("PASS first-run and legacy-ready results enable only legacy writes");

  gate = createStartupPersistenceGate();
  const unsafe = { status: "verification_failed", persistenceMode: "unavailable", diagnostics: [{ code: "blocked" }] };
  const blockedState = gate.settle(unsafe);
  assert.deepStrictEqual(blockedState, { status: "blocked", settled: true, mode: null, reason: "unsafe_startup_result", diagnostics: [{ code: "blocked" }] });
  await assertCode(() => gate.writeGeneration(async () => { throw new Error("must not execute"); }), "persistence_mode_inactive");
  await assertCode(() => gate.writeLegacy(async () => { throw new Error("must not execute"); }), "persistence_mode_inactive");
  console.log("PASS unsafe startup remains blocked");

  gate = createStartupPersistenceGate();
  const firstState = gate.settle(startupResult("published", "generation"));
  const secondState = gate.settle(startupResult("legacy_required", "legacy"));
  assert.deepStrictEqual(secondState, firstState);
  assert.strictEqual(gate.getState().mode, "generation");
  console.log("PASS settlement is one-shot");

  gate = createStartupPersistenceGate();
  gate.settle(startupResult("published", "generation"));
  const events = [];
  let releaseFirst;
  const first = gate.writeGeneration(async () => {
    events.push("first-start");
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push("first-end");
  });
  const second = gate.writeGeneration(async () => { events.push("second"); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(events, ["first-start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepStrictEqual(events, ["first-start", "first-end", "second"]);
  console.log("PASS permitted writes execute serially");

  gate = createStartupPersistenceGate();
  gate.settle(startupResult("published", "generation"));
  const laterWrites = [];
  await assert.rejects(
    gate.writeGeneration(async () => { laterWrites.push("rejected"); throw new Error("expected write failure"); }),
    /expected write failure/
  );
  await gate.writeGeneration(async () => { laterWrites.push("later"); });
  assert.deepStrictEqual(laterWrites, ["rejected", "later"]);
  console.log("PASS rejected write does not poison the queue");

  gate = createStartupPersistenceGate();
  gate.settle(startupResult("published", "generation"));
  let inactiveExecuted = false;
  await assertCode(() => gate.writeLegacy(async () => { inactiveExecuted = true; }), "persistence_mode_inactive");
  assert.strictEqual(inactiveExecuted, false);
  console.log("PASS inactive-mode callbacks are never executed");

  gate = createStartupPersistenceGate();
  const diagnostics = [{ code: "trusted", nested: { value: 1 } }];
  const input = startupResult("published", "generation", diagnostics);
  const exposed = gate.settle(input);
  input.persistenceMode = "legacy";
  input.diagnostics[0].nested.value = 2;
  assert.strictEqual(exposed.mode, "generation");
  assert.strictEqual(exposed.diagnostics[0].nested.value, 1);
  assert.deepStrictEqual(gate.getState(), exposed);
  assert.ok(Object.isFrozen(exposed));
  assert.ok(Object.isFrozen(exposed.diagnostics));
  assert.ok(Object.isFrozen(exposed.diagnostics[0].nested));
  assert.deepStrictEqual(Object.keys(gate).sort(), ["getState", "settle", "writeGeneration", "writeLegacy"]);
  console.log("PASS startup inputs and exposed state remain isolated and immutable");

  console.log("9 startup persistence gate scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
