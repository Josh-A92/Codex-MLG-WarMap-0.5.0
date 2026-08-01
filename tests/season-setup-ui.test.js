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

test("Season Setup is a dedicated workspace rather than a subordinate selector", () => {
  assert.match(html, /data-workspace-target="season-setup"/);
  assert.match(html, /id="seasonSetupView"/);
  assert.strictEqual((html.match(/data-workspace-target="season-setup"/g) || []).length, 1);
});

test("approved three-step labels and package-driven confirmation areas are present", () => {
  assert.match(renderer, /Season & Servers/);
  assert.match(renderer, /Confirm Loaded Setup/);
  assert.match(renderer, /Review & Activate/);
  assert.match(renderer, /Map & Structures/);
  assert.match(renderer, /Resources & Values/);
  assert.match(renderer, /summary\.resourceModel\.resources/);
  assert.doesNotMatch(renderer, /summary\.resource\.displayName/);
  assert.doesNotMatch(renderer, /Ice Crystal Value/);
});

test("selection panel uses plural season-defined value arrays from the target view", () => {
  assert.match(renderer, /seasonDefinedValues/);
  assert.doesNotMatch(renderer, /\bformatSeasonDefinedValue\b/);
});

test("empty scoring displays do not render a fallback scoring row", () => {
  assert.match(renderer, /scoringDisplays\.length > 0/);
  assert.doesNotMatch(renderer, /Scoring rules not configured/);
});

test("renderer does not invent generic territory value labels", () => {
  assert.doesNotMatch(renderer, /Territory Value/);
  assert.doesNotMatch(renderer, /Territory Values/);
});

test("screen confirms loaded rules without exposing rule editing controls", () => {
  assert.match(renderer, /cannot be edited here/);
  assert.match(renderer, /Loaded structure catalogue/);
  assert.doesNotMatch(renderer, /data-season-setup-action="(?:add|edit|delete)-structure"/);
  assert.doesNotMatch(renderer, /data-season-setup-action="edit-resource"/);
});

test("activation uses the authorized service with both confirmations and server IDs", () => {
  assert.match(renderer, /seasonAdministrationService\.activateSeason\(localActor/);
  assert.match(renderer, /serverIds: Array\.from\(seasonSetupState\.selectedServerIds\)/);
  assert.match(renderer, /mapAndStructures: seasonSetupState\.mapAndStructuresConfirmed/);
  assert.match(renderer, /resourcesAndValues: seasonSetupState\.resourcesAndValuesConfirmed/);
});

test("Season Setup handlers attach during workspace initialization", () => {
  const attachStart = renderer.indexOf("function attachWorkspaceShellHandlers()");
  const nextFunction = renderer.indexOf("function createHeadCell(", attachStart);
  const attachSource = renderer.slice(attachStart, nextFunction);
  assert.match(attachSource, /seasonSetupView\.addEventListener\("click", handleSeasonSetupClick\)/);
  assert.match(attachSource, /seasonSetupView\.addEventListener\("change", handleSeasonSetupChange\)/);

  const footprintStart = renderer.indexOf("function getStructureFootprint(");
  const footprintEnd = renderer.indexOf("async function handleSelectionPanelChange", footprintStart);
  assert.doesNotMatch(renderer.slice(footprintStart, footprintEnd), /seasonSetupView\.addEventListener/);
});

test("persisted and newly activated contexts filter participating servers", () => {
  assert.match(renderer, /allowedServers\.has\(server\.id\)/);
  assert.match(renderer, /applyActivatedServerSelection\(activeSeason\)/);
});

test("Season Setup has responsive single-column phone rules", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.season-setup-progress[\s\S]*grid-template-columns:1fr/);
  assert.match(styles, /\.season-setup-server-grid,[\s\S]*grid-template-columns:1fr/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*\.season-setup-actions/);
});
