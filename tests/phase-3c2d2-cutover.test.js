const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createApplicationPersistenceFacade } = require("../src/services/application-persistence-facade.js");

const root = path.join(__dirname, "..");

async function main() {
  const facade = createApplicationPersistenceFacade({
    coordinator: {
      async load() { return { status: "recovery_required", reason: "partial_legacy_state" }; },
      async execute() { throw new Error("must not execute while recovering"); },
      async commitCurrent() { throw new Error("must not commit while recovering"); }
    }
  });
  const loaded = await facade.load({});
  assert.strictEqual(loaded.status, "recovery_required");
  assert.strictEqual(facade.isRecoveryRequired(), true);
  await assert.rejects(() => facade.execute(() => {}), (error) => error.code === "recovery_required");
  console.log("PASS unsafe legacy state blocks facade mutations");

  let restored = false;
  const successful = createApplicationPersistenceFacade({
    coordinator: {
      async load() { return { status: "first_run" }; },
      async execute(mutate) { await mutate(); return { generation: 1 }; },
      async commitCurrent() { return { generation: 1 }; }
    }
  });
  await successful.load({});
  await successful.execute(() => { restored = true; });
  assert.strictEqual(restored, true);
  console.log("PASS facade routes successful mutations to one coordinator");

  const index = await fs.promises.readFile(path.join(root, "index.html"), "utf8");
  const renderer = await fs.promises.readFile(path.join(root, "src", "map-renderer.js"), "utf8");
  const bootstrap = await fs.promises.readFile(path.join(root, "src", "app", "application-bootstrap.js"), "utf8");
  assert.ok(index.indexOf('src="src/services/application-persistence-coordinator.js"') < index.indexOf('src="src/map-renderer.js"'));
  assert.ok(index.indexOf('src="src/services/application-persistence-facade.js"') < index.indexOf('src="src/map-renderer.js"'));
  assert.doesNotMatch(renderer, /requestSave\s*\(/);
  assert.doesNotMatch(renderer, /saveEnvelope\s*\(/);
  assert.doesNotMatch(bootstrap, /createPersistenceService\s*\(/);
  assert.doesNotMatch(bootstrap, /createElectronFileStorageAdapter\s*\(/);
  assert.match(bootstrap, /generationStore\.loadCommittedGeneration\(\)/);
  assert.match(bootstrap, /warMapPersistenceStorage\.loadEnvelope/);
  console.log("PASS active renderer/bootstrap paths contain no legacy writes");
  console.log("3 Phase 3C2D2 cutover scenarios passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});