const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "map-renderer.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

test("Data Management is a dedicated workspace", () => {
  assert.strictEqual((html.match(/data-workspace-target="data-management"/g) || []).length, 1);
  assert.match(html, /id="dataManagementView"/);
  assert.match(html, /id="dataManagementContent"/);
  assert.match(renderer, /nextWorkspace === "data-management"/);
  assert.match(styles, /data-active-workspace="data-management"/);
});

test("union registration exposes only the approved operator fields", () => {
  const formStart = renderer.indexOf("function renderUnionRegistryForm");
  const formEnd = renderer.indexOf("function renderUnionRegistryList");
  const formSource = renderer.slice(formStart, formEnd);

  ["Union name", "Tag", "Colour", "Map pattern", "Native server"].forEach((label) => {
    assert.ok(formSource.includes(`\"${label}\"`), `Expected visible ${label} field`);
  });
  assert.doesNotMatch(formSource, /name:\s*"unionId"/);
  assert.doesNotMatch(formSource, /name:\s*"aliases"/);
});

test("registration uses the atomic coordinator and edits use management services", () => {
  assert.match(renderer, /registration\.registerUnion\(localActor/);
  assert.match(renderer, /\.assignNativeServer\(localActor/);
  assert.match(renderer, /management\.updateUnionIdentity\(localActor/);
  assert.match(renderer, /archiveUnionIdentity\(localActor/);
  assert.match(renderer, /restoreUnionIdentity\(localActor/);
  assert.match(renderer, /applicationPersistenceFacade\.execute\(mutation, auditIntent\)/);
});

test("confirmed native servers are immutable while unconfirmed unions can assign one", () => {
  assert.match(renderer, /A confirmed native server requires a reviewed correction/);
  assert.match(renderer, /data-management-readonly-field/);
  assert.match(renderer, /isEditing && nativeServerLabel[\s\S]*?Native server[\s\S]*?else[\s\S]*?name:\s*"serverId"/);
  assert.match(renderer, /"assign-native-server"/);
  assert.match(renderer, /"Assign native server"/);
});

test("successful registry mutations unlock before persistence completes", () => {
  const mutationStart = renderer.indexOf("async function runDataManagementMutation");
  const mutationEnd = renderer.indexOf("async function handleDataManagementSubmit");
  const mutationSource = renderer.slice(mutationStart, mutationEnd);
  assert.match(mutationSource, /await applicationPersistenceFacade\.execute\(mutation, auditIntent\)/);
  assert.doesNotMatch(mutationSource, /dataManagementPersistenceController\.requestSave\(\)/);
});

test("map ownership failures are shown in the selected target panel", () => {
  assert.match(renderer, /selectionState\.errorMessage/);
  assert.match(renderer, /territory-editor-error/);
  assert.match(renderer, /Unable to update ownership/);
});

test("all approved map identity patterns have live previews", () => {
  ["solid", "diagonal", "crosshatch", "dots"].forEach((pattern) => {
    assert.ok(renderer.includes(`value: \"${pattern}\"`), `Expected ${pattern} option`);
  });
  assert.match(styles, /background-color:var\(--union-preview-color\)/);
  ["diagonal", "crosshatch", "dots"].forEach((pattern) => {
    assert.ok(styles.includes(`data-map-pattern=\"${pattern}\"`), `Expected ${pattern} preview style`);
  });
  assert.match(renderer, /action:\s*"preview-union"/);
});

test("archived identities remain visible and restorable", () => {
  assert.match(renderer, /workspace\.identities/);
  assert.match(renderer, /archived \? "Archived" : "Current"/);
  assert.match(renderer, /"restore-union"/);
  assert.match(renderer, /"archive-union"/);
});

test("Data Management exposes factual server notes with audited corrections", () => {
  assert.match(renderer, /Factual server notes/);
  assert.match(renderer, /Do not enter objectives, priorities, or recommendations/);
  assert.match(renderer, /data-data-management-form', 'server-note|data-data-management-form", "server-note/);
  assert.match(renderer, /recordManualServerObservation/);
  assert.match(renderer, /correctManualServerObservation/);
  assert.match(renderer, /Correction reason is required/);
  assert.match(renderer, /actionType: correctionOf \? "server_observation_corrected" : "server_observation_confirmed"/);
  assert.match(renderer, /Archived season notes are read-only/);
  assert.match(renderer, /completedSeasons\.slice\(\)\.reverse\(\)\.find/);
  assert.match(renderer, /getDataManagementSeasonServers\(\)/);
  assert.doesNotMatch(renderer, /name = "objective"|name="objective"/);
});

test("Data Management exposes recovery-only ownership conflict resolution", () => {
  assert.match(renderer, /data-ownership-conflict-panel/);
  assert.match(renderer, /data-data-management-form", "ownership-conflict/);
  assert.match(renderer, /inspectOwnershipConflict/);
  assert.match(renderer, /resolveOwnershipConflict/);
  assert.match(renderer, /ownership_conflict_resolved/);
  assert.match(renderer, /retainedRecordId/);
  assert.match(renderer, /retractedRecordId/);
  assert.match(renderer, /Resolution reason/);
});

test("Data Management layout has a phone-friendly single-column mode", () => {
  assert.match(styles, /@media \(max-width:700px\)/);
  assert.match(styles, /\.data-management-form\s*\{\s*grid-template-columns:1fr/);
  assert.match(styles, /\.union-registry-card\s*\{\s*grid-template-columns:1fr/);
  assert.match(styles, /\.union-pattern-preview\s*\{\s*width:100%/);
});
