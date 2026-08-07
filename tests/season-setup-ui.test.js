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

test("Season Management is a dedicated workspace with persistent re-entry routes", () => {
  assert.match(html, /data-workspace-target="season-setup"/);
  assert.match(html, /id="seasonSetupView"/);
  assert.match(html, />Season Management<\/button>/);
  assert.match(html, />Manage Season<\/button>/);
  assert.strictEqual((html.match(/data-workspace-target="season-setup"/g) || []).length, 2);
});

test("strategic-network scripts load before the renderer and bootstrap in dependency order", () => {
  const validatorIndex = html.indexOf("src/services/strategic-node-network-map-validator.js");
  const projectionIndex = html.indexOf("src/services/strategic-node-network-projection-service.js");
  const svgIndex = html.indexOf("src/services/strategic-node-network-svg-renderer.js");
  const rendererIndex = html.indexOf("src/map-renderer.js");
  const season1Index = html.indexOf("src/seasons/season1-package.js");
  const season2Index = html.indexOf("src/seasons/season2-package.js");
  const bootstrapIndex = html.indexOf("src/app/application-bootstrap.js");
  const gameRulesEngineIndex = html.indexOf("src/services/game-rules-engine.js");

  assert.ok(validatorIndex !== -1 && validatorIndex < rendererIndex);
  assert.ok(projectionIndex !== -1 && projectionIndex < rendererIndex);
  assert.ok(svgIndex !== -1 && svgIndex < rendererIndex);
  assert.ok(season1Index !== -1 && season2Index !== -1 && season1Index < season2Index);
  assert.ok(season2Index !== -1 && season2Index < gameRulesEngineIndex);
  assert.ok(season2Index !== -1 && season2Index < rendererIndex);
  assert.ok(season2Index !== -1 && season2Index < bootstrapIndex);
  assert.strictEqual((html.match(/src\/seasons\/season2-package\.js/g) || []).length, 1);
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
  assert.match(renderer, /window\.location\.reload\(\);/);
});

test("startup initialization failures are surfaced visibly with the error name and message", () => {
  assert.match(renderer, /Application initialization failed/);
  assert.match(renderer, /errorName/);
  assert.match(renderer, /errorMessage/);
  assert.match(renderer, /document\.body\.prepend/);
});

test("active season management explicitly clears live maps while preserving history", () => {
  assert.match(renderer, /data-season-setup-action", "complete-season"/);
  assert.match(renderer, /seasonAdministrationService\.completeActiveSeason\(localActor\)/);
  assert.match(renderer, /clears live map ownership while preserving union, evidence, and audit history/);
  assert.match(renderer, /clears live map ownership while preserving union, evidence, and audit history/);
  assert.match(renderer, /seasonSetupState\.isCompleting/);
  assert.match(renderer, /serverStateService\.replaceTerritoryOwnership\(\{\}\)/);
  assert.match(renderer, /serverStateService\.restoreTransactionState\(ownershipSnapshot\)/);
  assert.match(renderer, /serverStatePersistenceController\.flush\(\)/);
});

test("active Season Management can update participating servers", () => {
  assert.match(renderer, /data-active-season-server/);
  assert.match(renderer, /Save participating servers/);
  assert.match(renderer, /seasonAdministrationService\.updateActiveSeasonServers/);
  assert.match(renderer, /appState\.allServers\.filter/);
});

test("Season Management registers user-entered server numbers and persists them", () => {
  assert.match(renderer, /Add a server number/);
  assert.match(renderer, /data-server-number-input/);
  assert.match(renderer, /data-season-setup-action", "register-server"/);
  assert.match(renderer, /\^\[1-9\]\\d\*\$/);
  assert.match(renderer, /serverStateService\.hasServer\(serverId\)/);
  assert.match(renderer, /serverStateService\.registerServer\(\{ id: serverId, label: `Server \$\{serverNumber\}` \}\)/);
  assert.match(renderer, /appState\.allServers = serverStateService\.listServers\(\);[\s\S]*seasonSetupState\.selectedServerIds\.add\(serverId\);[\s\S]*renderSeasonSetup\(\);[\s\S]*serverStatePersistenceController\.requestSave\(\)/);
  assert.match(renderer, /serverStatePersistenceController\.requestSave\(\)/);
  assert.match(renderer, /serverStatePersistenceController\.flush\(\)/);
  assert.match(renderer, /appState\.allServers = serverStateService\.listServers\(\)/);
  assert.match(renderer, /actionTarget\.closest\("\.season-setup-server-registration"\)/);
  assert.match(renderer, /Server \$\{serverNumber\} was added, but could not be saved/);
  const registrationBranchStart = renderer.indexOf('if (action === "register-server")');
  const registrationBranchEnd = renderer.indexOf('if (action === "back")', registrationBranchStart);
  const registrationBranch = registrationBranchStart >= 0 && registrationBranchEnd > registrationBranchStart
    ? renderer.slice(registrationBranchStart, registrationBranchEnd)
    : "";
  assert.ok(registrationBranch.includes('if (action === "register-server")'), "registration action branch should exist");
  assert.doesNotMatch(registrationBranch, /unregisterServer/);
  assert.doesNotMatch(registrationBranch, /selectedServerIds\.delete/);
});

test("leaving the server-number field does not redraw it before registration", () => {
  const changeHandlerStart = renderer.indexOf("function handleSeasonSetupChange(event)");
  const changeHandlerEnd = renderer.indexOf("const DATA_MANAGEMENT_PATTERNS", changeHandlerStart);
  const changeHandler = renderer.slice(changeHandlerStart, changeHandlerEnd);

  assert.ok(changeHandlerStart >= 0 && changeHandlerEnd > changeHandlerStart);
  assert.match(changeHandler, /if \(!\["select-season", "toggle-server", "confirm-map", "confirm-resource"\]\.includes\(action\)\) \{\s*return;/);
});

test("registering a server keeps creation separate from active-season participation", () => {
  const branchStart = renderer.indexOf('if (action === "register-server")');
  const branchEnd = renderer.indexOf('if (action === "back")', branchStart);
  const registrationBranch = renderer.slice(branchStart, branchEnd);
  assert.ok(branchStart >= 0 && branchEnd > branchStart, "registration action branch should exist");
  assert.doesNotMatch(registrationBranch, /updateActiveSeasonServers/);
  assert.doesNotMatch(registrationBranch, /activeSeason\.serverIds\.concat/);
  assert.match(renderer, /Create the server here, then select it below and save the participating servers/);
});

test("Command Centre exposes no server cards without an active season", () => {
  assert.match(renderer, /No servers are available until a season is active/);
  assert.match(renderer, /appState\.servers = activeSeason[\s\S]*:\s*\[\]/);
});

test("renderer requires the complete season-administration lifecycle API", () => {
  assert.match(renderer, /typeof bootstrapContext\.seasonAdministrationService\.listCompletedSeasons !== "function"/);
  assert.match(renderer, /typeof bootstrapContext\.seasonAdministrationService\.updateActiveSeasonServers !== "function"/);
  assert.match(renderer, /typeof bootstrapContext\.seasonAdministrationService\.completeActiveSeason !== "function"/);
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
  assert.match(renderer, /appState\.allServers\.filter\(\(server\) => allowed\.has\(server\.id\)\)/);
  assert.match(renderer, /applyActivatedServerSelection\(activeSeason\)/);
});

test("Season Setup has responsive single-column phone rules", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.season-setup-progress[\s\S]*grid-template-columns:1fr/);
  assert.match(styles, /\.season-setup-server-grid,[\s\S]*grid-template-columns:1fr/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*\.season-setup-actions/);
});

test("draft season setup exposes preview-only controls and a map preview entry point", () => {
  assert.match(renderer, /Draft preview — cannot be activated/);
  assert.match(renderer, /Load Map Preview/);
  assert.match(renderer, /season-setup-preview-surface/);
  assert.doesNotMatch(renderer, /data-season-setup-preview-node/);
  assert.match(renderer, /structure type/);
  assert.match(renderer, /type code/);
});

test("renderer config validates and captures both injected strategic-network services", () => {
  assert.match(renderer, /Renderer requires a strategic node network projection service/);
  assert.match(renderer, /Renderer requires a strategic node network SVG renderer/);
  assert.match(renderer, /strategicNodeNetworkProjectionService = bootstrapContext\.strategicNodeNetworkProjectionService/);
  assert.match(renderer, /strategicNodeNetworkSvgRenderer = bootstrapContext\.strategicNodeNetworkSvgRenderer/);
});

test("active Season 1 setup still offers a prepared-package selector", () => {
  assert.match(renderer, /function renderPreparedSeasonSelector/);
  assert.match(renderer, /data-season-setup-action", "select-season"/);
  assert.match(renderer, /renderPreparedSeasonSelector\(seasonSetupContent, preparedSeasons\)/);
});

test("draft Season 2 uses the preview-only branch without activation controls", () => {
  const renderSeasonSetupSource = renderer.slice(
    renderer.indexOf("function renderSeasonSetup()"),
    renderer.indexOf("function applyActivatedServerSelection")
  );
  assert.match(renderSeasonSetupSource, /if \(activeSeason\) \{[\s\S]*renderPreparedSeasonSelector\(seasonSetupContent, preparedSeasons\);[\s\S]*renderDraftSeasonPreview\(seasonSetupContent, preparedView\);[\s\S]*return;/);
  assert.match(renderSeasonSetupSource, /if \(preparedView\.summary\.seasonStatus !== "active"\) \{[\s\S]*renderPreparedSeasonSelector\(seasonSetupContent, preparedSeasons\);[\s\S]*renderDraftSeasonPreview\(seasonSetupContent, preparedView\);[\s\S]*return;/);
  assert.doesNotMatch(renderSeasonSetupSource, /renderSeasonSetupActions\(seasonSetupContent, canContinue\);[\s\S]*renderSeasonSetupActions\(seasonSetupContent, canContinue\);/);
});

test("preview loading uses the prepared summary map reference", () => {
  assert.match(renderer, /preparedView\.summary\.map\.mapDataRef/);
  assert.doesNotMatch(renderer, /preparedView\.package\.rulesDefinition/);
});

test("Season 2 preview uses its dedicated structure asset family", () => {
  const assetPaths = [
    "assets/sprites/season2/village.png",
    "assets/sprites/season2/strategic-mine.png",
    "assets/sprites/season2/manor.png",
    "assets/sprites/season2/factory.png",
    "assets/sprites/season2/town.png",
    "assets/sprites/season2/trade-centre.png",
    "assets/sprites/season2/building-guild.png",
    "assets/sprites/season2/metropolis.png",
    "assets/sprites/season2/central-metropolis.png"
  ];

  for (const assetPath of assetPaths) {
    assert.ok(renderer.includes(assetPath), `Expected renderer mapping for ${assetPath}`);
    assert.ok(fs.existsSync(path.join(root, assetPath)), `Expected asset file ${assetPath}`);
  }
  assert.doesNotMatch(renderer.slice(
    renderer.indexOf("function createPreviewAssetMap()"),
    renderer.indexOf("function renderDraftSeasonPreview")
  ), /assets\/sprites\/(?:village|mine|manor|factory|town|metropolis)\.png/);
});

test("resource-mine facts remain available in selection details", () => {
  assert.match(renderer, /selectedMineTileData\.resourceId/);
  assert.match(renderer, /selectedMineTileData\.level/);
  assert.match(renderer, /selectedMineTileData\.outputSpeedPercent/);
  assert.match(renderer, /g\[data-mine-tile-id\]/);
});

test("season setup preview styling uses a bounded horizontally scrollable surface", () => {
  const surfaceBlock = (styles.match(/\.season-setup-preview-surface\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
  const svgBlock = (styles.match(/\.season-setup-preview-surface svg\s*\{([\s\S]*?)\n\}/) || [])[1] || "";

  assert.ok(surfaceBlock, "Expected a .season-setup-preview-surface CSS block");
  assert.ok(svgBlock, "Expected a .season-setup-preview-surface svg CSS block");
  assert.match(surfaceBlock, /overflow-x:auto/);
  assert.match(svgBlock, /width:100%/);
  assert.match(svgBlock, /min-width:620px/);
  assert.match(svgBlock, /max-width:none/);
  assert.doesNotMatch(svgBlock, /max-width:100%/);
});

test("territory_grid still uses the existing grid renderer path", () => {
  assert.match(renderer, /if \(topologyType === "territory_grid"\)/);
  assert.match(renderer, /renderGridHeaders\(gridSize\);/);
  assert.match(renderer, /renderTiles\(tiles\);/);
  assert.match(renderer, /renderMarkers\(markers\);/);
});

test("strategic_node_network uses projection then SVG rendering", () => {
  assert.match(renderer, /const projection = strategicNodeNetworkProjectionService\.project\(mapData\);/);
  assert.match(renderer, /const previewResult = strategicNodeNetworkSvgRenderer\.render\(projection, \{/);
  assert.match(renderer, /theme: createPreviewTheme\(\)/);
  assert.match(renderer, /assetByTypeCode: createPreviewAssetMap\(\)/);
  assert.match(renderer, /map\.innerHTML = previewResult\.markup;/);
});

test("strategic rendering skips grid headers, grid tiles, markers, and grid camera initialization", () => {
  assert.match(renderer, /function clearMapWorkspaceContent\(\)/);
  assert.match(renderer, /map\.className = "map";/);
  assert.match(renderer, /if \(topologyType === "strategic_node_network"\) \{/);
  assert.match(renderer, /const topologyType = gameRulesEngine && typeof gameRulesEngine\.getMapDefinition === "function"/);
  assert.match(renderer, /if \(topologyType === "territory_grid"\) \{[\s\S]*?initializeCamera\(mapData\);/);
});

test("unknown topology fails clearly", () => {
  assert.match(renderer, /throw new Error\(`Renderer does not support topology '\$\{topologyType \|\| "unknown"\}'\.`\);/);
});

test("live strategic topology uses a dedicated scrollable SVG surface", () => {
  const strategicSurfaceBlock = (styles.match(/\.map\[data-topology-type="strategic_node_network"\]\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
  const strategicSvgBlock = (styles.match(/\.map\[data-topology-type="strategic_node_network"\] svg\s*\{([\s\S]*?)\n\}/) || [])[1] || "";

  assert.ok(strategicSurfaceBlock, "Expected a strategic topology CSS block");
  assert.ok(strategicSvgBlock, "Expected a strategic topology SVG CSS block");
  assert.match(strategicSurfaceBlock, /overflow-x:auto/);
  assert.match(strategicSurfaceBlock, /min-width:620px/);
  assert.match(strategicSvgBlock, /width:100%/);
  assert.match(strategicSvgBlock, /min-width:620px/);
  assert.match(strategicSvgBlock, /max-width:none/);
});
