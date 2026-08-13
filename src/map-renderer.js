let gameRulesEngine = null;
let seasonIdentity = {};
let seasonMetadata = {};
let applicationConfig = null;
let appMapConfig = null;
let appServerConfig = null;
let appUnionConfig = null;
let appWorkspace = null;
let appSummaryConfig = null;
let dataManagementModules = null;
let dataManagementRuntimeFactory = null;
let trustedLocalActorFactory = null;
let ownershipServiceFactory = null;
let summaryServiceFactory = null;
let serverStateServiceFactory = null;
let applicationPersistenceFacade = null;
let applicationPersistenceCompositionFactory = null;
let persistenceStartup = null;
let persistenceBoundary = null;
let createUnionRegistryServiceFactory = null;
let createStrategicDomainRuntimeFactory = null;
let createEvidenceDomainRuntimeFactory = null;
let strategicDomainModules = null;
let evidenceDomainModules = null;
let applicationMutationCoordinatorFactory = null;
let applicationPersistenceCoordinatorFactory = null;
let applicationPersistenceFacadeFactory = null;
let legacyStateClassifier = null;
let applicationAuditRecordService = null;
let bootstrapPersistence = null;
let seasonAdministrationService = null;
let seasonContext = null;
let strategicNodeNetworkProjectionService = null;
let strategicNodeNetworkSvgRenderer = null;

let mapDataUrl = null;
let unionsDataUrl = null;
let seasonServerStateDataUrl = null;
let workspaceHome = null;
let mapWorkspaceLabel = null;

const spriteByCode = {
  V1: "assets/sprites/village.png",
  C2: "assets/sprites/mine.png",
  MN3: "assets/sprites/manor.png",
  F4: "assets/sprites/factory.png",
  T5: "assets/sprites/town.png",
  MP6: "assets/sprites/metropolis.png",
  RC7: "assets/sprites/royal-city.png"
};

const HEAD_CELL_CLASS = "headcell";
const TILE_CLASS_PREFIX = "tile";
const MARKER_CLASS_PREFIX = "marker sprite-v3";
const DEFAULT_GRID_SIZE = 20;
const SELECTED_TILE_CLASS = "selected";
const FOOTPRINT_CLASS_PREFIX = "merged-footprint";
const FOOTPRINT_INTERNAL_CLASS = "footprint-internal";
const FOOTPRINT_EDGE_CLASSES = [
  "merged-footprint",
  "footprint-internal",
  "merged-edge-top",
  "merged-edge-right",
  "merged-edge-bottom",
  "merged-edge-left"
];

const map = document.getElementById("map");
const cameraViewport = document.getElementById("cameraViewport");
const cameraSurface = document.getElementById("cameraSurface");
const cameraToolbar = document.getElementById("cameraToolbar");
const workspaceShell = document.getElementById("workspaceShell");
const serverDock = document.getElementById("serverDock");
const serverDockButtons = document.getElementById("serverDockButtons");
const applicationSeasonSubtitle = document.getElementById("applicationSeasonSubtitle");
const applicationMapSummary = document.getElementById("applicationMapSummary");
const commandCentreView = document.getElementById("commandCentreView");
const commandCentreCards = document.getElementById("commandCentreCards");
const commandCentreSeasonLabel = document.getElementById("commandCentreSeasonLabel");
const commandCentreOverviewTitle = document.getElementById("commandCentreOverviewTitle");
const dataManagementView = document.getElementById("dataManagementView");
const dataManagementContent = document.getElementById("dataManagementContent");
const seasonSetupView = document.getElementById("seasonSetupView");
const seasonSetupContent = document.getElementById("seasonSetupContent");
const mapWorkspaceView = document.getElementById("mapWorkspaceView");
const workspaceMapTitle = document.getElementById("workspaceMapTitle");
const colheads = document.getElementById("colheads");
const colheadsBottom = document.getElementById("colheadsBottom");
const rowheads = document.getElementById("rowheads");
const rowheadsRight = document.getElementById("rowheadsRight");
const selectionPanel = document.getElementById("selection-panel");

const selectionState = {
  selectedItem: null,
  selectedElements: [],
  errorMessage: null
};

const tileElementsByPosition = new Map();
const tileDataByPosition = new Map();
const selectionEdgeClasses = [
  "selected-footprint",
  "selected-edge-top",
  "selected-edge-right",
  "selected-edge-bottom",
  "selected-edge-left"
];

let currentGridSize = DEFAULT_GRID_SIZE;

const cameraState = {
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: 0.85,
  maxZoom: 4.5
};

const ZOOM_WHEEL_SENSITIVITY = 0.0015;
const TOOLBAR_ZOOM_FACTOR = 1.2;
const FIT_MAP_MARGIN_RATIO = 0.94;
const DESKTOP_PAN_DRAG_THRESHOLD = 6;
const TOUCH_PAN_DRAG_THRESHOLD = 6;
const activePointers = new Map();
let pinchZoomState = null;
let loadedMapData = null;
let ownershipService = null;
let summaryService = null;
let serverStateService = null;
let strategicDomainRuntime = null;
let evidenceDomainRuntime = null;
let dataManagementRuntime = null;
let mapOwnershipCoordinator = null;
let selectedMapTargetViewService = null;
let localActor = null;
let applicationStarted = false;
const appState = {
  gameRulesEngine: null,
  seasonIdentity: {},
  seasonMetadata: {},
  unionRegistryService: null,
  unionRegistry: [],
  strategicDomainRuntime: null,
  evidenceDomainRuntime: null,
  dataManagementRuntime: null,
  ownershipService: null,
  allServers: [],
  servers: [],
  activeWorkspace: null,
  activeServer: null
};
const seasonSetupState = {
  step: 1,
  selectedSeasonId: null,
  selectedServerIds: new Set(),
  mapAndStructuresConfirmed: true,
  resourcesAndValuesConfirmed: true,
  errorMessage: null,
  isActivating: false,
  isCompleting: false,
  isUpdatingServers: false,
  isRegisteringServer: false,
  preview: {
    status: "idle",
    errorMessage: null,
    markup: "",
    nodeCount: 0,
    connectionCount: 0,
    mineTileCount: 0,
    selectedNodeId: null,
    selectedNodeData: null,
    selectedMineTileId: null,
    selectedMineTileData: null,
    projection: null,
    mapDataRef: null
  }
};
const dataManagementState = {
  mode: "list",
  editingUnionId: null,
  errorMessage: null,
  isSaving: false
};
const desktopPanState = {
  isPointerDown: false,
  isDragging: false,
  suppressClick: false,
  startClientX: 0,
  startClientY: 0,
  startCameraX: 0,
  startCameraY: 0
};
const touchPanState = {
  pointerId: null,
  isPointerDown: false,
  isDragging: false,
  suppressClick: false,
  startClientX: 0,
  startClientY: 0,
  startCameraX: 0,
  startCameraY: 0
};

function getTileKey(row, col) {
  return `${row}-${col}`;
}

function createServerDockButton(server) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "server-dock-button";
  button.setAttribute("data-workspace-target", "server-map");
  button.setAttribute("data-server-id", server.id);
  button.textContent = (server.label || server.id || "").replace("Server ", "");
  return button;
}

function formatPercent(value) {
  const parsed = Number(value);
  const finiteValue = Number.isFinite(parsed) ? parsed : 0;
  return `${finiteValue.toFixed(1)}%`;
}

function getStructureAggregate(summary) {
  const byType = summary && Array.isArray(summary.leadingStructureOwnershipByType)
    ? summary.leadingStructureOwnershipByType
    : summary && Array.isArray(summary.structureOwnershipByType)
      ? summary.structureOwnershipByType
    : [];

  return byType.reduce((aggregate, entry) => {
    const designatedUnionControlledCount = Number(entry && entry.designatedUnionControlledCount);
    const availableCount = Number(entry && entry.availableCount);

    aggregate.designatedUnionControlledCount += Number.isFinite(designatedUnionControlledCount)
      ? designatedUnionControlledCount
      : 0;
    aggregate.availableCount += Number.isFinite(availableCount) ? availableCount : 0;

    return aggregate;
  }, {
    designatedUnionControlledCount: 0,
    availableCount: 0
  });
}

function createCommandCentreCard(server) {
  const summary = summaryService && typeof summaryService.getServerSummary === "function"
    ? summaryService.getServerSummary(server)
    : null;
  const leadingUnionLabel = summary
    && typeof summary.leadingUnionLabel === "string"
    && summary.leadingUnionLabel.trim() !== ""
    ? summary.leadingUnionLabel
    : "Leader unavailable";
  const totalCapturableTileCount = Number(summary && summary.totalCapturableTileCount);
  const controlledTileCount = Number(summary && summary.controlledTileCount);
  const designatedUnionControlledTileCount = Number(summary && summary.leadingUnionControlledTileCount);
  const controlledTerritoryPercent = summary ? summary.controlledTerritoryPercent : 0;
  const designatedUnionTerritoryPercent = summary ? summary.leadingUnionTerritoryPercent : 0;
  const scoringDisplays = summary && Array.isArray(summary.scoringDisplays) ? summary.scoringDisplays : [];
  const structureAggregate = getStructureAggregate(summary);
  const totalTiles = Number.isFinite(totalCapturableTileCount) ? totalCapturableTileCount : 0;
  const controlledTiles = Number.isFinite(controlledTileCount) ? controlledTileCount : 0;
  const designatedTiles = Number.isFinite(designatedUnionControlledTileCount) ? designatedUnionControlledTileCount : 0;
  const scoringDisplayMarkup = scoringDisplays.length > 0
    ? scoringDisplays.map((display) => {
      const label = typeof display.displayLabel === "string" && display.displayLabel.trim() !== ""
        ? display.displayLabel
        : (typeof display.resourceId === "string" && display.resourceId.trim() !== ""
          ? display.resourceId
          : null);
      if (!label) {
        return "";
      }
      const text = typeof display.text === "string" && display.text.trim() !== ""
        ? display.text
        : "";
      return `<div><span>${label}</span><strong>${text}</strong></div>`;
    }).join("")
    : "";

  const card = document.createElement("article");
  card.className = "command-centre-card";
  card.setAttribute("data-workspace-target", "server-map");
  card.setAttribute("data-server-id", server.id);
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `Open ${server.label} map workspace`);

  const title = document.createElement("h3");
  title.textContent = server.label;
  card.appendChild(title);

  const metrics = document.createElement("div");
  metrics.className = "command-centre-card-metrics";

  metrics.innerHTML = `
    <div><span>Leading Union</span><strong>${leadingUnionLabel}</strong></div>
    <div><span>Territory Controlled</span><strong>${controlledTiles} / ${totalTiles} (${formatPercent(controlledTerritoryPercent)})</strong></div>
    <div><span>Leader Territory</span><strong>${designatedTiles} / ${totalTiles} (${formatPercent(designatedUnionTerritoryPercent)})</strong></div>
    ${scoringDisplayMarkup}
    <div><span>Structures</span><strong>${structureAggregate.designatedUnionControlledCount} controlled · ${structureAggregate.availableCount} available</strong></div>
  `;

  card.appendChild(metrics);

  const openMapAction = document.createElement("button");
  openMapAction.type = "button";
  openMapAction.className = "command-centre-open-action";
  openMapAction.setAttribute("data-workspace-target", "server-map");
  openMapAction.setAttribute("data-server-id", server.id);
  openMapAction.textContent = "Open Map";
  card.appendChild(openMapAction);

  return card;
}

function renderServerDockNavigation() {
  if (serverDockButtons) {
    serverDockButtons.innerHTML = "";
    appState.servers.forEach((server) => {
      serverDockButtons.appendChild(createServerDockButton(server));
    });
  }
}

function renderCommandCentreCards() {
  if (commandCentreCards) {
    commandCentreCards.innerHTML = "";
    if (!seasonAdministrationService || !seasonAdministrationService.getActiveSeason()) {
      commandCentreCards.appendChild(createSeasonSetupElement(
        "div",
        "command-centre-empty-state",
        "No servers are available until a season is active."
      ));
      return;
    }
    appState.servers.forEach((server) => {
      commandCentreCards.appendChild(createCommandCentreCard(server));
    });
  }
}

function renderWorkspaceNavigation() {
  renderServerDockNavigation();
  renderCommandCentreCards();
}

function renderSeasonRuntimeShell(mapData) {
  const seasonName = typeof seasonIdentity.seasonName === "string" && seasonIdentity.seasonName.trim() !== ""
    ? seasonIdentity.seasonName
    : seasonIdentity.seasonId;
  const mapDefinition = gameRulesEngine && typeof gameRulesEngine.getMapDefinition === "function"
    ? gameRulesEngine.getMapDefinition()
    : {};
  const topologyType = mapDefinition.topologyType;
  const mapSummary = topologyType === "strategic_node_network"
    ? `${Array.isArray(mapData.nodes) ? mapData.nodes.length : 0} strategic nodes · ${Array.isArray(mapData.connections) ? mapData.connections.length : 0} connections`
    : `${Array.isArray(mapData.tiles) ? mapData.tiles.flat().length : 0} tiles · ${Array.isArray(mapData.structures) ? mapData.structures.length : 0} structures/markers`;

  if (applicationSeasonSubtitle) {
    applicationSeasonSubtitle.textContent = `${seasonName} Command Centre · ${mapWorkspaceLabel} workspaces`;
  }
  if (applicationMapSummary) {
    applicationMapSummary.textContent = mapSummary;
  }
  if (commandCentreSeasonLabel) {
    commandCentreSeasonLabel.textContent = `${seasonName} dashboard`;
  }
  if (commandCentreOverviewTitle) {
    commandCentreOverviewTitle.textContent = `${seasonName} Overview`;
  }
}

async function ensureActiveSeasonServers(activeSeason) {
  if (!activeSeason || !Array.isArray(activeSeason.serverIds)) {
    return;
  }

  await applicationPersistenceFacade.execute(() => {
    activeSeason.serverIds.forEach((serverId) => {
      if (serverStateService.hasServer(serverId)) return;
      const serverNumber = serverId.startsWith("server-") ? serverId.slice("server-".length) : serverId;
      serverStateService.registerServer({ id: serverId, label: `Server ${serverNumber}` });
    });
  });
}

function refreshCommandCentreCards() {
  renderCommandCentreCards();
}

function getServerById(serverId) {
  return appState.servers.find((server) => server.id === serverId) || null;
}

function createSeasonSetupElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function appendSeasonSetupFact(parent, label, value) {
  const row = createSeasonSetupElement("div", "season-setup-fact");
  row.appendChild(createSeasonSetupElement("span", null, label));
  row.appendChild(createSeasonSetupElement("strong", null, value));
  parent.appendChild(row);
}

function formatStructureValue(summary, structure) {
  const resourceModel = summary && summary.resourceModel && typeof summary.resourceModel === "object"
    ? summary.resourceModel
    : null;
  const resources = resourceModel && Array.isArray(resourceModel.resources) ? resourceModel.resources : [];
  const outputs = resourceModel && resourceModel.structureOutputs && typeof resourceModel.structureOutputs === "object"
    ? resourceModel.structureOutputs
    : null;
  const configuredOutputs = outputs && Object.prototype.hasOwnProperty.call(outputs, structure.code)
    ? outputs[structure.code]
    : null;
  if (!Array.isArray(configuredOutputs) || configuredOutputs.length === 0) return "Not configured";

  const resourceById = new Map();
  resources.forEach((resource) => {
    if (resource && typeof resource.resourceId === "string") {
      resourceById.set(resource.resourceId, resource);
    }
  });

  const formattedOutputs = configuredOutputs.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const resource = resourceById.get(entry.resourceId) || null;
    const value = Number(entry.value);
    if (!resource || !Number.isFinite(value)) {
      return null;
    }

    const label = resource.displayName || resource.resourceId;
    const unit = resource.unit ? ` ${resource.unit}` : "";
    return `${value} ${label}${unit}`;
  }).filter(Boolean);

  return formattedOutputs.length > 0 ? formattedOutputs.join(" · ") : "Not configured";
}

function renderSeasonSetupHeader(container, activeSeason) {
  const header = createSeasonSetupElement("div", "season-setup-header");
  const heading = createSeasonSetupElement("div");
  heading.appendChild(createSeasonSetupElement("h2", null, "Season Setup"));
  heading.appendChild(createSeasonSetupElement(
    "p",
    null,
    "Confirm a prepared season package before normal operation. Package rules remain read-only."
  ));
  header.appendChild(heading);
  header.appendChild(createSeasonSetupElement(
    "span",
    activeSeason ? "season-setup-status is-active" : "season-setup-status",
    activeSeason ? "Active" : "Not activated"
  ));
  container.appendChild(header);
}

function renderSeasonSetupProgress(container) {
  const progress = createSeasonSetupElement("ol", "season-setup-progress");
  ["Season & Servers", "Confirm Loaded Setup", "Review & Activate"].forEach((label, index) => {
    const item = createSeasonSetupElement("li", index + 1 === seasonSetupState.step ? "is-current" : null);
    if (index + 1 < seasonSetupState.step) item.classList.add("is-complete");
    item.appendChild(createSeasonSetupElement("span", null, String(index + 1)));
    item.appendChild(createSeasonSetupElement("strong", null, label));
    progress.appendChild(item);
  });
  container.appendChild(progress);
}

function renderSeasonSetupPackageSummary(container, preparedView, includeStructures) {
  const summary = preparedView.summary;
  const overview = createSeasonSetupElement("div", "season-setup-summary-grid");
  const mapCard = createSeasonSetupElement("section", "season-setup-card");
  mapCard.appendChild(createSeasonSetupElement("h3", null, "Map & Structures"));
  appendSeasonSetupFact(mapCard, "Base map", summary.map.baseMapId);
  appendSeasonSetupFact(mapCard, "Dimensions", `${summary.map.rows} × ${summary.map.columns}`);
  appendSeasonSetupFact(mapCard, "Structure types", String(summary.structures.length));
  overview.appendChild(mapCard);

  const resourceCard = createSeasonSetupElement("section", "season-setup-card");
  resourceCard.appendChild(createSeasonSetupElement("h3", null, "Resources & Values"));
  const resourceEntries = summary.resourceModel && Array.isArray(summary.resourceModel.resources)
    ? summary.resourceModel.resources
    : [];
  appendSeasonSetupFact(resourceCard, "Resources", resourceEntries.length === 0 ? "None" : resourceEntries.map((entry) => entry.displayName).join(", "));
  appendSeasonSetupFact(resourceCard, "Scoring", Array.isArray(summary.scoringModel && summary.scoringModel.calculations)
    ? `${summary.scoringModel.calculations.length} calculation(s)`
    : "Not configured in package");
  overview.appendChild(resourceCard);
  container.appendChild(overview);

  if (!includeStructures) return;
  const structureSection = createSeasonSetupElement("section", "season-setup-card season-setup-structures");
  structureSection.appendChild(createSeasonSetupElement("h3", null, "Loaded structure catalogue"));
  const grid = createSeasonSetupElement("div", "season-setup-structure-grid");
  summary.structures.forEach((structure) => {
    const entry = createSeasonSetupElement("div", "season-setup-structure");
    entry.appendChild(createSeasonSetupElement("strong", null, `${structure.code} · ${structure.type}`));
    entry.appendChild(createSeasonSetupElement(
      "span",
      null,
      `Level ${structure.level === null ? "—" : structure.level} · ${structure.capturable ? "Capturable" : "Not capturable"}`
    ));
    entry.appendChild(createSeasonSetupElement(
      "span",
      "season-setup-structure-value",
      formatStructureValue(summary, structure)
    ));
    grid.appendChild(entry);
  });
  structureSection.appendChild(grid);
  container.appendChild(structureSection);
}

function renderPreparedSeasonSelector(container, preparedSeasons) {
  const seasonLabel = createSeasonSetupElement("label", "season-setup-field");
  seasonLabel.appendChild(createSeasonSetupElement("span", null, "Prepared season package"));
  const select = createSeasonSetupElement("select");
  select.setAttribute("data-season-setup-action", "select-season");
  preparedSeasons.forEach((season) => {
    const option = createSeasonSetupElement("option", null, `${season.displayName} · Package ${season.packageVersion || "unversioned"}`);
    option.value = season.seasonId;
    option.selected = season.seasonId === seasonSetupState.selectedSeasonId;
    select.appendChild(option);
  });
  seasonLabel.appendChild(select);
  container.appendChild(seasonLabel);
  return select;
}

function renderServerRegistrationControl(container, helpText) {
  const registration = createSeasonSetupElement("div", "season-setup-server-registration");
  const label = createSeasonSetupElement("label", "season-setup-field");
  label.appendChild(createSeasonSetupElement("span", null, "Add a server number"));
  const input = createSeasonSetupElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = "Example: 374";
  input.disabled = seasonSetupState.isRegisteringServer;
  input.setAttribute("data-server-number-input", "");
  label.appendChild(input);
  registration.appendChild(label);
  registration.appendChild(createSeasonSetupElement("p", "season-setup-help", helpText));
  const button = createSeasonSetupElement(
    "button",
    "season-setup-button is-secondary",
    seasonSetupState.isRegisteringServer ? "Adding server…" : "Add server"
  );
  button.type = "button";
  button.disabled = seasonSetupState.isRegisteringServer;
  button.setAttribute("data-season-setup-action", "register-server");
  registration.appendChild(button);
  container.appendChild(registration);
}

function renderSeasonSetupStepOne(container, preparedSeasons) {
  const section = createSeasonSetupElement("section", "season-setup-card");
  section.appendChild(createSeasonSetupElement("h3", null, "1. Season & Servers"));
  renderPreparedSeasonSelector(section, preparedSeasons);

  section.appendChild(createSeasonSetupElement("h4", null, "Participating servers"));
  section.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-help",
    "Select the servers that belong to this season setup."
  ));
  renderServerRegistrationControl(section, "Enter a server number once, then select it for this season.");
  const serverGrid = createSeasonSetupElement("div", "season-setup-server-grid");
  appState.allServers.forEach((server) => {
    const label = createSeasonSetupElement("label", "season-setup-server-option");
    const checkbox = createSeasonSetupElement("input");
    checkbox.type = "checkbox";
    checkbox.value = server.id;
    checkbox.checked = seasonSetupState.selectedServerIds.has(server.id);
    checkbox.setAttribute("data-season-setup-action", "toggle-server");
    label.appendChild(checkbox);
    label.appendChild(createSeasonSetupElement("span", null, server.label || `Server ${server.id}`));
    serverGrid.appendChild(label);
  });
  section.appendChild(serverGrid);
  container.appendChild(section);
}

function renderConfirmationOption(labelText, action, checked) {
  const label = createSeasonSetupElement("label", "season-setup-confirmation");
  const checkbox = createSeasonSetupElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.setAttribute("data-season-setup-action", action);
  label.appendChild(checkbox);
  label.appendChild(createSeasonSetupElement("span", null, labelText));
  return label;
}

function renderSeasonSetupStepTwo(container, preparedView) {
  const intro = createSeasonSetupElement("section", "season-setup-card");
  intro.appendChild(createSeasonSetupElement("h3", null, "2. Confirm Loaded Setup"));
  intro.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-help",
    "This information comes from the prepared package and cannot be edited here."
  ));
  container.appendChild(intro);
  renderSeasonSetupPackageSummary(container, preparedView, true);
  const confirmations = createSeasonSetupElement("div", "season-setup-confirmations");
  confirmations.appendChild(renderConfirmationOption(
    "Map and structure configuration confirmed",
    "confirm-map",
    seasonSetupState.mapAndStructuresConfirmed
  ));
  confirmations.appendChild(renderConfirmationOption(
    "Resource and structure-value configuration confirmed",
    "confirm-resource",
    seasonSetupState.resourcesAndValuesConfirmed
  ));
  container.appendChild(confirmations);
}

function renderSeasonSetupStepThree(container, preparedView) {
  const section = createSeasonSetupElement("section", "season-setup-card");
  section.appendChild(createSeasonSetupElement("h3", null, "3. Review & Activate"));
  appendSeasonSetupFact(section, "Season", preparedView.summary.displayName);
  appendSeasonSetupFact(section, "Package", preparedView.summary.packageVersion || "Unversioned");
  appendSeasonSetupFact(section, "Servers", Array.from(seasonSetupState.selectedServerIds).join(", "));
  appendSeasonSetupFact(section, "Map & structures", "Confirmed");
  appendSeasonSetupFact(section, "Resources & values", "Confirmed");
  section.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-warning",
    "Activation makes this season package read-only during normal operation."
  ));
  container.appendChild(section);
}

function renderActivatedSeasonSetup(container, preparedView, activeSeason) {
  const notice = createSeasonSetupElement("section", "season-setup-card season-setup-active-card");
  notice.appendChild(createSeasonSetupElement("h3", null, `${preparedView.summary.displayName} is active`));
  notice.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-help",
    "The prepared rules are locked for normal operation. Changes require a controlled versioned correction."
  ));
  appendSeasonSetupFact(notice, "Activated", activeSeason.activatedAt);
  appendSeasonSetupFact(notice, "Activated by", activeSeason.activatedBy);
  const serverSection = createSeasonSetupElement("div", "season-setup-active-servers");
  serverSection.appendChild(createSeasonSetupElement("strong", null, "Participating servers"));
  serverSection.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-help",
    "Only selected servers appear in Command Centre and can receive season data."
  ));
  renderServerRegistrationControl(
    serverSection,
    "Create the server here, then select it below and save the participating servers."
  );
  const serverGrid = createSeasonSetupElement("div", "season-setup-server-grid");
  const selectedServerIds = new Set(activeSeason.serverIds);
  appState.allServers.forEach((server) => {
    const label = createSeasonSetupElement("label", "season-setup-server-option");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = server.id;
    input.checked = selectedServerIds.has(server.id);
    input.disabled = seasonSetupState.isUpdatingServers || seasonSetupState.isCompleting;
    input.setAttribute("data-active-season-server", "");
    label.appendChild(input);
    label.appendChild(createSeasonSetupElement("span", null, server.label || server.id));
    serverGrid.appendChild(label);
  });
  serverSection.appendChild(serverGrid);
  notice.appendChild(serverSection);
  if (seasonSetupState.errorMessage) {
    notice.appendChild(createSeasonSetupElement("div", "season-setup-error", seasonSetupState.errorMessage));
  }
  const actions = createSeasonSetupElement("div", "season-setup-actions");
  const saveServers = createSeasonSetupElement(
    "button",
    "season-setup-button is-secondary",
    seasonSetupState.isUpdatingServers ? "Saving servers…" : "Save participating servers"
  );
  saveServers.type = "button";
  saveServers.disabled = seasonSetupState.isUpdatingServers || seasonSetupState.isCompleting;
  saveServers.setAttribute("data-season-setup-action", "update-season-servers");
  actions.appendChild(saveServers);
  const complete = createSeasonSetupElement(
    "button",
    "season-setup-button is-danger",
    seasonSetupState.isCompleting ? "Completing…" : "Complete Season"
  );
  complete.type = "button";
  complete.disabled = seasonSetupState.isCompleting || seasonSetupState.isUpdatingServers;
  complete.setAttribute("data-season-setup-action", "complete-season");
  actions.appendChild(complete);
  notice.appendChild(actions);
  container.appendChild(notice);
  renderSeasonSetupPackageSummary(container, preparedView, true);
}

function renderCompletedSeasonNotice(container) {
  const completedSeasons = seasonAdministrationService.listCompletedSeasons();
  if (completedSeasons.length === 0) return;
  const completed = completedSeasons[completedSeasons.length - 1];
  const notice = createSeasonSetupElement("section", "season-setup-card season-setup-completed-card");
  notice.appendChild(createSeasonSetupElement("h3", null, "Most recently completed season"));
  appendSeasonSetupFact(notice, "Season", completed.seasonId);
  appendSeasonSetupFact(notice, "Completed", completed.completedAt);
  appendSeasonSetupFact(notice, "Completed by", completed.completedBy);
  notice.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-help",
    "Completion clears live map ownership while preserving union, evidence, and audit history. A prepared season may now be activated."
  ));
  container.appendChild(notice);
}

function createPreviewTheme() {
  return {
    panelBackground: "#d9ad68",
    panelBorder: "#8f826c",
    panelAccent: "#c96a2d",
    panelText: "#5d4d3b",
    connectionStroke: "#c8b89d",
    nodeFill: "#ead7ae",
    nodeBorder: "#705643",
    nodeSelectedFill: "#f5e0a6",
    nodeSelectedBorder: "#c98b1f",
    nodeText: "#4f463d",
    mineFieldFill: "#ead7ae",
    mineFieldBorder: "#705643",
    mineLevel1Fill: "#decda8",
    mineLevel2Fill: "#d9ad68",
    mineLevel3Fill: "#cf8959",
    mineLevel4Fill: "#b96b4e",
    mineLevel5Fill: "#92534c",
    mineLevel6Fill: "#477d78"
  };
}

function createPreviewAssetMap() {
  return {
    V1: "assets/sprites/season2/village.png",
    M2: "assets/sprites/season2/strategic-mine.png",
    MN3: "assets/sprites/season2/manor.png",
    F4: "assets/sprites/season2/factory.png",
    T5: "assets/sprites/season2/town.png",
    TC1: "assets/sprites/season2/trade-centre.png",
    TC2: "assets/sprites/season2/trade-centre.png",
    TC3: "assets/sprites/season2/trade-centre.png",
    TC4: "assets/sprites/season2/trade-centre.png",
    TC5: "assets/sprites/season2/trade-centre.png",
    BG6: "assets/sprites/season2/building-guild.png",
    MP6: "assets/sprites/season2/metropolis.png",
    MP7: "assets/sprites/season2/central-metropolis.png"
  };
}

function renderDraftSeasonPreview(container, preparedView) {
  const previewCard = createSeasonSetupElement("section", "season-setup-card");
  previewCard.appendChild(createSeasonSetupElement("h3", null, "Draft preview"));
  previewCard.appendChild(createSeasonSetupElement(
    "p",
    "season-setup-warning",
    "Draft preview — cannot be activated"
  ));
  renderSeasonSetupPackageSummary(previewCard, preparedView, true);

  const previewSurface = createSeasonSetupElement("div", "season-setup-preview-surface");
  previewSurface.setAttribute("data-season-setup-preview-surface", "true");
  if (preparedView.summary.map.topologyType === "strategic_node_network") {
    const previewAction = createSeasonSetupElement("button", "season-setup-button is-secondary", "Load Map Preview");
    previewAction.type = "button";
    previewAction.setAttribute("data-season-setup-action", "load-preview");
    previewCard.appendChild(previewAction);

    if (seasonSetupState.preview.status === "loading") {
      previewSurface.appendChild(createSeasonSetupElement("p", "season-setup-help", "Loading map preview…"));
    } else if (seasonSetupState.preview.errorMessage) {
      previewSurface.appendChild(createSeasonSetupElement("p", "season-setup-error", seasonSetupState.preview.errorMessage));
    } else if (seasonSetupState.preview.markup) {
      previewSurface.innerHTML = seasonSetupState.preview.markup;
    } else {
      previewSurface.appendChild(createSeasonSetupElement("p", "season-setup-help", "Preview not loaded yet."));
    }

    const previewMeta = createSeasonSetupElement("div", "season-setup-preview-meta");
    previewMeta.appendChild(createSeasonSetupElement("span", null, `Nodes: ${seasonSetupState.preview.nodeCount}`));
    previewMeta.appendChild(createSeasonSetupElement("span", null, `Connections: ${seasonSetupState.preview.connectionCount}`));
    previewMeta.appendChild(createSeasonSetupElement("span", null, `Resource mines: ${seasonSetupState.preview.mineTileCount}`));
    previewCard.appendChild(previewMeta);
    previewCard.appendChild(previewSurface);

    const previewDetails = createSeasonSetupElement("div", "season-setup-preview-details");
    if (seasonSetupState.preview.selectedNodeData) {
      previewDetails.appendChild(createSeasonSetupElement("h4", null, "Selected node"));
      appendSeasonSetupFact(previewDetails, "structure type", seasonSetupState.preview.selectedNodeData.type || "—");
      appendSeasonSetupFact(previewDetails, "level", String(seasonSetupState.preview.selectedNodeData.level || "—"));
      appendSeasonSetupFact(previewDetails, "type code", seasonSetupState.preview.selectedNodeData.typeCode || "—");
    } else if (seasonSetupState.preview.selectedMineTileData) {
      previewDetails.appendChild(createSeasonSetupElement("h4", null, "Selected resource mine"));
      appendSeasonSetupFact(previewDetails, "resource", seasonSetupState.preview.selectedMineTileData.resourceId || "—");
      appendSeasonSetupFact(previewDetails, "level", String(seasonSetupState.preview.selectedMineTileData.level || "—"));
      appendSeasonSetupFact(previewDetails, "output speed", `+${seasonSetupState.preview.selectedMineTileData.outputSpeedPercent}%`);
    } else {
      previewDetails.appendChild(createSeasonSetupElement("p", "season-setup-help", "Select a structure node or resource-mine tile to inspect it."));
    }
    previewCard.appendChild(previewDetails);
  } else {
    previewSurface.appendChild(createSeasonSetupElement("p", "season-setup-help", "This package has no strategic network preview available."));
    previewCard.appendChild(previewSurface);
  }

  container.appendChild(previewCard);
}

function renderSeasonSetupActions(container, canContinue) {
  const actions = createSeasonSetupElement("div", "season-setup-actions");
  if (seasonSetupState.step > 1) {
    const back = createSeasonSetupElement("button", "season-setup-button is-secondary", "Back");
    back.type = "button";
    back.setAttribute("data-season-setup-action", "back");
    actions.appendChild(back);
  }
  const nextAction = seasonSetupState.step === 3 ? "activate" : "next";
  const nextLabel = seasonSetupState.step === 3
    ? (seasonSetupState.isActivating ? "Activating…" : "Activate Season")
    : "Continue";
  const next = createSeasonSetupElement("button", "season-setup-button", nextLabel);
  next.type = "button";
  next.disabled = !canContinue || seasonSetupState.isActivating;
  next.setAttribute("data-season-setup-action", nextAction);
  actions.appendChild(next);
  container.appendChild(actions);
}

async function renderSeasonSetupPreviewMarkup(selectedNodeId = null) {
  if (!strategicNodeNetworkProjectionService || !strategicNodeNetworkSvgRenderer) {
    seasonSetupState.preview.status = "error";
    seasonSetupState.preview.errorMessage = "Preview services are unavailable.";
    return;
  }

  if (!seasonSetupState.preview.projection) {
    seasonSetupState.preview.status = "idle";
    seasonSetupState.preview.errorMessage = null;
    return;
  }

  const previewResult = strategicNodeNetworkSvgRenderer.render(seasonSetupState.preview.projection, {
    selectedNodeId,
    theme: createPreviewTheme(),
    assetByTypeCode: createPreviewAssetMap()
  });

  seasonSetupState.preview.status = "ready";
  seasonSetupState.preview.errorMessage = null;
  seasonSetupState.preview.markup = previewResult.markup;
  seasonSetupState.preview.nodeCount = previewResult.nodeCount;
  seasonSetupState.preview.connectionCount = previewResult.connectionCount;
  seasonSetupState.preview.mineTileCount = previewResult.mineTileCount;

  if (selectedNodeId) {
    seasonSetupState.preview.selectedNodeData = (seasonSetupState.preview.projection.nodes || []).find(
      (node) => node.nodeId === selectedNodeId
    ) || null;
  } else {
    seasonSetupState.preview.selectedNodeData = null;
  }
}

async function loadSeason2MapPreview(preparedView) {
  seasonSetupState.preview.status = "loading";
  seasonSetupState.preview.errorMessage = null;
  seasonSetupState.preview.markup = "";
  seasonSetupState.preview.nodeCount = 0;
  seasonSetupState.preview.connectionCount = 0;
  seasonSetupState.preview.mineTileCount = 0;
  seasonSetupState.preview.selectedNodeId = null;
  seasonSetupState.preview.selectedNodeData = null;
  seasonSetupState.preview.selectedMineTileId = null;
  seasonSetupState.preview.selectedMineTileData = null;
  seasonSetupState.preview.projection = null;
  seasonSetupState.preview.mapDataRef = null;
  renderSeasonSetup();

  try {
    const mapDataRef = preparedView && preparedView.summary && preparedView.summary.map
      && typeof preparedView.summary.map.mapDataRef === "string"
      && preparedView.summary.map.mapDataRef.trim() !== ""
      ? preparedView.summary.map.mapDataRef
      : null;

    if (!mapDataRef) {
      throw new Error("No map data reference is available for this package.");
    }

    const response = await fetch(mapDataRef, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load preview data (${response.status}).`);
    }

    const mapData = await response.json();
    const projection = strategicNodeNetworkProjectionService.project(mapData);
    seasonSetupState.preview.projection = projection;
    seasonSetupState.preview.mapDataRef = mapDataRef;
    await renderSeasonSetupPreviewMarkup();
  } catch (error) {
    seasonSetupState.preview.status = "error";
    seasonSetupState.preview.errorMessage = error && error.message
      ? error.message
      : "Unable to load the Strategic Network preview.";
    seasonSetupState.preview.projection = null;
  }

  renderSeasonSetup();
}

function renderSeasonSetup() {
  if (!seasonSetupContent || !seasonAdministrationService) return;
  seasonSetupContent.innerHTML = "";
  const activeSeason = seasonAdministrationService.getActiveSeason();
  renderSeasonSetupHeader(seasonSetupContent, activeSeason);
  const preparedSeasons = seasonAdministrationService.listPreparedSeasons();
  if (!seasonSetupState.selectedSeasonId && preparedSeasons.length > 0) {
    seasonSetupState.selectedSeasonId = activeSeason ? activeSeason.seasonId : preparedSeasons[0].seasonId;
  }
  const preparedView = seasonAdministrationService.getPreparedSeason(seasonSetupState.selectedSeasonId);

  if (activeSeason) {
    renderPreparedSeasonSelector(seasonSetupContent, preparedSeasons);
    const activePreparedView = seasonAdministrationService.getPreparedSeason(activeSeason.seasonId);
    renderActivatedSeasonSetup(seasonSetupContent, activePreparedView, activeSeason);
    if (preparedView.summary.seasonId !== activeSeason.seasonId) {
      if (preparedView.summary.seasonStatus !== "active") {
        renderDraftSeasonPreview(seasonSetupContent, preparedView);
      } else {
        renderSeasonSetupPackageSummary(seasonSetupContent, preparedView, true);
      }
    }
    return;
  }

  renderCompletedSeasonNotice(seasonSetupContent);

  if (preparedView.summary.seasonStatus !== "active") {
    renderPreparedSeasonSelector(seasonSetupContent, preparedSeasons);
    renderDraftSeasonPreview(seasonSetupContent, preparedView);
    return;
  }

  renderSeasonSetupProgress(seasonSetupContent);
  if (seasonSetupState.errorMessage) {
    seasonSetupContent.appendChild(createSeasonSetupElement(
      "div",
      "season-setup-error",
      seasonSetupState.errorMessage
    ));
  }

  if (seasonSetupState.step === 1) renderSeasonSetupStepOne(seasonSetupContent, preparedSeasons);
  if (seasonSetupState.step === 2) renderSeasonSetupStepTwo(seasonSetupContent, preparedView);
  if (seasonSetupState.step === 3) renderSeasonSetupStepThree(seasonSetupContent, preparedView);

  const canContinue = seasonSetupState.step === 1
    ? seasonSetupState.selectedServerIds.size > 0
    : seasonSetupState.mapAndStructuresConfirmed && seasonSetupState.resourcesAndValuesConfirmed;
  renderSeasonSetupActions(seasonSetupContent, canContinue);
}

function applyActivatedServerSelection(activeSeason) {
  if (!activeSeason || !Array.isArray(activeSeason.serverIds)) {
    appState.servers = [];
    renderWorkspaceNavigation();
    return;
  }
  const allowed = new Set(activeSeason.serverIds);
  appState.servers = appState.allServers.filter((server) => allowed.has(server.id));
  renderWorkspaceNavigation();
}

async function handleSeasonSetupClick(event) {
  const previewMineTile = event.target.closest("g[data-mine-tile-id]");
  if (previewMineTile) {
    const selectedMineTileId = previewMineTile.getAttribute("data-mine-tile-id");
    seasonSetupState.preview.selectedNodeId = null;
    seasonSetupState.preview.selectedNodeData = null;
    seasonSetupState.preview.selectedMineTileId = selectedMineTileId;
    seasonSetupState.preview.selectedMineTileData = (seasonSetupState.preview.projection.resourceMineTiles || []).find(
      (tile) => tile.mineTileId === selectedMineTileId
    ) || null;
    await renderSeasonSetupPreviewMarkup();
    renderSeasonSetup();
    return;
  }

  const previewNode = event.target.closest("g[data-node-id]");
  if (previewNode) {
    const selectedNodeId = previewNode.getAttribute("data-node-id");
    seasonSetupState.preview.selectedNodeId = selectedNodeId;
    seasonSetupState.preview.selectedMineTileId = null;
    seasonSetupState.preview.selectedMineTileData = null;
    await renderSeasonSetupPreviewMarkup(selectedNodeId);
    renderSeasonSetup();
    return;
  }

  const actionTarget = event.target.closest("[data-season-setup-action]");
  if (!actionTarget) return;
  const action = actionTarget.getAttribute("data-season-setup-action");
  if (action === "register-server") {
    const registrationControl = actionTarget.closest(".season-setup-server-registration");
    const input = registrationControl
      ? registrationControl.querySelector("[data-server-number-input]")
      : null;
    const serverNumber = input && typeof input.value === "string" ? input.value.trim() : "";
    if (!/^[1-9]\d*$/.test(serverNumber)) {
      seasonSetupState.errorMessage = "Enter a valid server number using digits only.";
      renderSeasonSetup();
      return;
    }

    const serverId = `server-${serverNumber}`;
    seasonSetupState.isRegisteringServer = true;
    seasonSetupState.errorMessage = null;
    let registered = false;
    try {
      if (!serverStateService.hasServer(serverId)) {
        serverStateService.registerServer({ id: serverId, label: `Server ${serverNumber}` });
        registered = true;
      }

      appState.allServers = serverStateService.listServers();

      const activeSeason = seasonAdministrationService.getActiveSeason();
      if (!activeSeason) {
        seasonSetupState.selectedServerIds.add(serverId);
      }

      renderSeasonSetup();

      if (registered) {
        await applicationPersistenceFacade.execute(() => undefined);
      }
    } catch (error) {
      appState.allServers = serverStateService.listServers();
      seasonSetupState.errorMessage = registered
        ? `Server ${serverNumber} was added, but could not be saved. ${error && error.message ? error.message : ""}`.trim()
        : error && error.message
          ? error.message
          : "Unable to add the server.";
    } finally {
      seasonSetupState.isRegisteringServer = false;
      renderSeasonSetup();
    }
    return;
  }
  if (action === "back") {
    seasonSetupState.step = Math.max(1, seasonSetupState.step - 1);
    seasonSetupState.errorMessage = null;
    renderSeasonSetup();
    return;
  }
  if (action === "next") {
    seasonSetupState.step = Math.min(3, seasonSetupState.step + 1);
    seasonSetupState.errorMessage = null;
    renderSeasonSetup();
    return;
  }
  if (action === "load-preview") {
    const preparedView = seasonAdministrationService.getPreparedSeason(seasonSetupState.selectedSeasonId);
    await loadSeason2MapPreview(preparedView);
    return;
  }
  if (action === "update-season-servers") {
    const selectedServerIds = Array.from(
      seasonSetupContent.querySelectorAll("[data-active-season-server]:checked")
    ).map((input) => input.value);
    seasonSetupState.isUpdatingServers = true;
    seasonSetupState.errorMessage = null;
    renderSeasonSetup();
    try {
      const activeSeason = await seasonAdministrationService.updateActiveSeasonServers(
        localActor,
        selectedServerIds
      );
      seasonContext = {
        seasonId: activeSeason.seasonId,
        activated: true,
        serverIds: activeSeason.serverIds.slice()
      };
      applyActivatedServerSelection(activeSeason);
      if (appState.activeServer && !activeSeason.serverIds.includes(appState.activeServer.id)) {
        setActiveWorkspace("command-centre");
      }
    } catch (error) {
      seasonSetupState.errorMessage = error && error.message
        ? error.message
        : "Unable to update participating servers.";
    } finally {
      seasonSetupState.isUpdatingServers = false;
      renderSeasonSetup();
    }
    return;
  }
  if (action === "complete-season") {
    const activeSeason = seasonAdministrationService.getActiveSeason();
    if (!activeSeason) return;
    const confirmed = typeof window.confirm !== "function"
      || window.confirm(
        `Complete ${activeSeason.seasonId}? This clears live map ownership while preserving union, evidence, and audit history.`
      );
    if (!confirmed) return;
    seasonSetupState.isCompleting = true;
    seasonSetupState.errorMessage = null;
    renderSeasonSetup();
    const ownershipSnapshot = serverStateService.captureTransactionState();
    let ownershipWasCleared = false;
    try {
      await applicationPersistenceFacade.execute(async () => {
        serverStateService.replaceTerritoryOwnership({});
        ownershipWasCleared = true;
        await seasonAdministrationService.completeActiveSeason(localActor, { persist: false });
      });
      seasonContext = {
        seasonId: activeSeason.seasonId,
        activated: false,
        serverIds: null
      };
      seasonSetupState.step = 1;
      seasonSetupState.selectedServerIds = new Set();
      if (window.location && typeof window.location.reload === "function") {
        window.location.reload();
        return;
      }
    } catch (error) {
      if (ownershipWasCleared) {
        serverStateService.restoreTransactionState(ownershipSnapshot);
      }
      seasonSetupState.errorMessage = error && error.message
        ? error.message
        : "Unable to complete the active season.";
    } finally {
      seasonSetupState.isCompleting = false;
      renderSeasonSetup();
    }
    return;
  }
  if (action !== "activate") return;

  seasonSetupState.isActivating = true;
  seasonSetupState.errorMessage = null;
  renderSeasonSetup();
  try {
    const activeSeason = await seasonAdministrationService.activateSeason(localActor, {
      seasonId: seasonSetupState.selectedSeasonId,
      serverIds: Array.from(seasonSetupState.selectedServerIds),
      confirmations: {
        mapAndStructures: seasonSetupState.mapAndStructuresConfirmed,
        resourcesAndValues: seasonSetupState.resourcesAndValuesConfirmed
      }
    });
    seasonContext = {
      seasonId: activeSeason.seasonId,
      activated: true,
      serverIds: activeSeason.serverIds.slice()
    };
    applyActivatedServerSelection(activeSeason);
    if (window.location && typeof window.location.reload === "function") {
      window.location.reload();
      return;
    }
  } catch (error) {
    seasonSetupState.errorMessage = error && error.message
      ? error.message
      : "Unable to activate the season.";
  } finally {
    seasonSetupState.isActivating = false;
    renderSeasonSetup();
  }
}

function handleSeasonSetupChange(event) {
  const action = event.target.getAttribute("data-season-setup-action");
  // Text inputs such as the server-number field emit change when they lose
  // focus. They must not redraw Season Setup before the following click runs.
  if (!["select-season", "toggle-server", "confirm-map", "confirm-resource"].includes(action)) {
    return;
  }
  if (action === "select-season") {
    seasonSetupState.selectedSeasonId = event.target.value;
    seasonSetupState.preview.status = "idle";
    seasonSetupState.preview.errorMessage = null;
    seasonSetupState.preview.markup = "";
    seasonSetupState.preview.nodeCount = 0;
    seasonSetupState.preview.connectionCount = 0;
    seasonSetupState.preview.mineTileCount = 0;
    seasonSetupState.preview.selectedNodeId = null;
    seasonSetupState.preview.selectedNodeData = null;
    seasonSetupState.preview.selectedMineTileId = null;
    seasonSetupState.preview.selectedMineTileData = null;
    seasonSetupState.preview.projection = null;
    seasonSetupState.preview.mapDataRef = null;
  }
  if (action === "toggle-server") {
    if (event.target.checked) seasonSetupState.selectedServerIds.add(event.target.value);
    else seasonSetupState.selectedServerIds.delete(event.target.value);
  }
  if (action === "confirm-map") seasonSetupState.mapAndStructuresConfirmed = event.target.checked;
  if (action === "confirm-resource") seasonSetupState.resourcesAndValuesConfirmed = event.target.checked;
  renderSeasonSetup();
}

const DATA_MANAGEMENT_PATTERNS = [
  { value: "solid", label: "Solid" },
  { value: "diagonal", label: "Diagonal stripes" },
  { value: "crosshatch", label: "Crosshatch" },
  { value: "dots", label: "Dots" }
];

function createDataManagementElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== undefined) element.textContent = textContent;
  return element;
}

function getDataManagementRuntimeService(serviceName, methodNames) {
  const service = dataManagementRuntime && dataManagementRuntime[serviceName];
  if (!service || methodNames.some((methodName) => typeof service[methodName] !== "function")) {
    throw new Error(`Data Management requires ${serviceName}.`);
  }
  return service;
}

function refreshUnionRegistryWorkspace() {
  const queryService = getDataManagementRuntimeService(
    "dataManagementQueryService",
    ["getUnionRegistryWorkspace"]
  );
  const workspace = queryService.getUnionRegistryWorkspace();
  const identities = workspace && Array.isArray(workspace.identities) ? workspace.identities : [];
  appState.unionRegistry = identities.filter((identity) => identity.registryStatus === "current");
  return identities;
}

function resolveNativeServerLabels(identities) {
  const labelsByUnionId = new Map();
  if (!dataManagementRuntime || !Array.isArray(appState.servers)) return labelsByUnionId;

  const knownUnionIds = new Set(identities.map((identity) => identity.unionId));
  const queryService = getDataManagementRuntimeService(
    "dataManagementQueryService",
    ["getServerWorkspace"]
  );
  const evaluatedAt = new Date().toISOString();

  appState.servers.forEach((server) => {
    try {
      const workspace = queryService.getServerWorkspace({
        seasonId: seasonIdentity.seasonId,
        serverId: server.id,
        evaluatedAt
      });
      const history = workspace && Array.isArray(workspace.nativeAssignmentHistory)
        ? workspace.nativeAssignmentHistory
        : [];
      history.forEach((assignment) => {
        const isCurrentNative = assignment
          && knownUnionIds.has(assignment.unionId)
          && assignment.nativeState === "native"
          && assignment.reviewState === "confirmed"
          && assignment.effectiveTo === null;
        if (isCurrentNative && !labelsByUnionId.has(assignment.unionId)) {
          labelsByUnionId.set(assignment.unionId, server.label || server.id);
        }
      });
    } catch (error) {
      console.error(`Unable to resolve native unions for ${server.id}`, error);
    }
  });

  return labelsByUnionId;
}

function getCurrentNativeUnionIds(server) {
  if (!server || typeof server.id !== "string" || !dataManagementRuntime) {
    return [];
  }

  try {
    const queryService = getDataManagementRuntimeService(
      "dataManagementQueryService",
      ["getServerWorkspace"]
    );
    const workspace = queryService.getServerWorkspace({
      seasonId: seasonIdentity.seasonId,
      serverId: server.id,
      evaluatedAt: new Date().toISOString()
    });
    const history = workspace && Array.isArray(workspace.nativeAssignmentHistory)
      ? workspace.nativeAssignmentHistory
      : [];

    const eligibleUnionIds = new Set((Array.isArray(appState.unionRegistry) ? appState.unionRegistry : [])
      .filter((identity) => identity
        && typeof identity.unionId === "string"
        && identity.unionId.trim() !== ""
        && (identity.registryStatus === undefined || identity.registryStatus === "current"))
      .map((identity) => identity.unionId));

    return Array.from(new Set(history
      .filter((assignment) => assignment
        && eligibleUnionIds.has(assignment.unionId)
        && assignment.nativeState === "native"
        && assignment.reviewState === "confirmed"
        && assignment.effectiveTo === null
        && typeof assignment.unionId === "string"
        && assignment.unionId.trim() !== "")
      .map((assignment) => assignment.unionId)));
  } catch (error) {
    console.error(`Unable to calculate native leaders for ${server.id}`, error);
    return [];
  }
}

function createUnionPatternPreview(identity, className = "") {
  const preview = createDataManagementElement(
    "div",
    `union-pattern-preview ${className}`.trim()
  );
  const metadata = identity && identity.presentationMetadata;
  const pattern = metadata && typeof metadata.mapPattern === "string"
    ? metadata.mapPattern
    : "solid";
  preview.dataset.mapPattern = pattern;
  preview.style.setProperty("--union-preview-color", identity.defaultColor || "#6b7280");
  preview.setAttribute("aria-label", `${pattern} map pattern preview`);
  return preview;
}

function appendDataManagementField(form, options) {
  const label = createDataManagementElement("label", "data-management-field");
  label.appendChild(createDataManagementElement("span", "", options.label));
  let control;

  if (options.type === "select") {
    control = document.createElement("select");
    options.options.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      option.selected = entry.value === options.value;
      control.appendChild(option);
    });
  } else {
    control = document.createElement("input");
    control.type = options.type || "text";
    control.value = options.value || "";
    if (options.maxLength) control.maxLength = options.maxLength;
  }

  control.name = options.name;
  control.required = options.required !== false;
  if (options.action) control.setAttribute("data-data-management-action", options.action);
  label.appendChild(control);
  form.appendChild(label);
  return control;
}

function renderUnionRegistryForm(container, editingIdentity, nativeServerLabel) {
  const isEditing = Boolean(editingIdentity);
  const panel = createDataManagementElement("section", "data-management-panel data-management-form-panel");
  panel.appendChild(createDataManagementElement(
    "h3",
    "",
    isEditing ? `Edit ${editingIdentity.tag}` : "Register a union"
  ));
  panel.appendChild(createDataManagementElement(
    "p",
    "data-management-help",
    isEditing
      ? (nativeServerLabel
          ? "Update the union's visible identity. A confirmed native server requires a reviewed correction."
          : "Update the union's identity or assign its native server.")
      : "Create the union identity and confirm its native server in one action."
  ));

  const form = createDataManagementElement("form", "data-management-form");
  form.setAttribute("data-data-management-form", "union-registry");
  appendDataManagementField(form, {
    label: "Union name",
    name: "displayName",
    value: isEditing ? editingIdentity.displayName : "",
    maxLength: 80
  });
  appendDataManagementField(form, {
    label: "Tag",
    name: "tag",
    value: isEditing ? editingIdentity.tag : "",
    maxLength: 20
  });
  appendDataManagementField(form, {
    label: "Colour",
    name: "defaultColor",
    type: "color",
    value: isEditing ? editingIdentity.defaultColor : "#4f8fd8",
    action: "preview-union"
  });
  appendDataManagementField(form, {
    label: "Map pattern",
    name: "mapPattern",
    type: "select",
    value: isEditing
      ? ((editingIdentity.presentationMetadata || {}).mapPattern || "solid")
      : "solid",
    options: DATA_MANAGEMENT_PATTERNS,
    action: "preview-union"
  });

  if (isEditing && nativeServerLabel) {
    const nativeField = createDataManagementElement("div", "data-management-readonly-field");
    nativeField.appendChild(createDataManagementElement("span", "", "Native server"));
    nativeField.appendChild(createDataManagementElement("strong", "", nativeServerLabel));
    form.appendChild(nativeField);
  } else {
    appendDataManagementField(form, {
      label: "Native server",
      name: "serverId",
      type: "select",
      value: appState.servers[0] ? appState.servers[0].id : "",
      options: appState.servers.map((server) => ({
        value: server.id,
        label: server.label || server.id
      }))
    });
  }

  const previewIdentity = editingIdentity || {
    defaultColor: "#4f8fd8",
    presentationMetadata: { mapPattern: "solid" }
  };
  form.appendChild(createUnionPatternPreview(previewIdentity, "union-pattern-preview--form"));

  const actions = createDataManagementElement("div", "data-management-form-actions");
  const submit = createDataManagementElement(
    "button",
    "data-management-primary-action",
    dataManagementState.isSaving ? "Saving…" : (isEditing ? "Save changes" : "Create union")
  );
  submit.type = "submit";
  submit.disabled = dataManagementState.isSaving;
  actions.appendChild(submit);
  if (isEditing) {
    if (!nativeServerLabel) {
      const assignNativeServer = createDataManagementElement(
        "button",
        "data-management-secondary-action",
        "Assign native server"
      );
      assignNativeServer.type = "button";
      assignNativeServer.setAttribute("data-data-management-action", "assign-native-server");
      assignNativeServer.setAttribute("data-union-id", editingIdentity.unionId);
      assignNativeServer.disabled = dataManagementState.isSaving;
      actions.appendChild(assignNativeServer);
    }
    const cancel = createDataManagementElement("button", "data-management-secondary-action", "Cancel");
    cancel.type = "button";
    cancel.setAttribute("data-data-management-action", "cancel-edit");
    cancel.disabled = dataManagementState.isSaving;
    actions.appendChild(cancel);
  }
  form.appendChild(actions);
  panel.appendChild(form);
  container.appendChild(panel);
}

function renderUnionRegistryList(container, identities, nativeServerLabels) {
  const panel = createDataManagementElement("section", "data-management-panel");
  const head = createDataManagementElement("div", "data-management-section-head");
  head.appendChild(createDataManagementElement("h3", "", "Registered unions"));
  head.appendChild(createDataManagementElement(
    "span",
    "data-management-count",
    `${identities.length} total`
  ));
  panel.appendChild(head);

  if (identities.length === 0) {
    panel.appendChild(createDataManagementElement(
      "p",
      "data-management-empty",
      "No unions have been registered for this installation."
    ));
  }

  const list = createDataManagementElement("div", "union-registry-list");
  identities.forEach((identity) => {
    const archived = identity.registryStatus === "archived";
    const card = createDataManagementElement(
      "article",
      `union-registry-card${archived ? " is-archived" : ""}`
    );
    card.appendChild(createUnionPatternPreview(identity));
    const body = createDataManagementElement("div", "union-registry-card-body");
    const title = createDataManagementElement("div", "union-registry-title");
    title.appendChild(createDataManagementElement("strong", "", identity.tag));
    title.appendChild(createDataManagementElement("span", "", identity.displayName));
    body.appendChild(title);
    body.appendChild(createDataManagementElement(
      "div",
      "union-registry-meta",
      `Native server: ${nativeServerLabels.get(identity.unionId) || "Not confirmed"}`
    ));
    body.appendChild(createDataManagementElement(
      "span",
      `union-registry-status ${archived ? "is-archived" : "is-current"}`,
      archived ? "Archived" : "Current"
    ));
    card.appendChild(body);

    const actions = createDataManagementElement("div", "union-registry-actions");
    if (archived) {
      const restore = createDataManagementElement("button", "data-management-secondary-action", "Restore");
      restore.type = "button";
      restore.setAttribute("data-data-management-action", "restore-union");
      restore.setAttribute("data-union-id", identity.unionId);
      restore.disabled = dataManagementState.isSaving;
      actions.appendChild(restore);
    } else {
      const edit = createDataManagementElement("button", "data-management-secondary-action", "Edit");
      edit.type = "button";
      edit.setAttribute("data-data-management-action", "edit-union");
      edit.setAttribute("data-union-id", identity.unionId);
      edit.disabled = dataManagementState.isSaving;
      actions.appendChild(edit);
      const archive = createDataManagementElement("button", "data-management-danger-action", "Archive");
      archive.type = "button";
      archive.setAttribute("data-data-management-action", "archive-union");
      archive.setAttribute("data-union-id", identity.unionId);
      archive.disabled = dataManagementState.isSaving;
      actions.appendChild(archive);
    }
    card.appendChild(actions);
    list.appendChild(card);
  });
  panel.appendChild(list);
  container.appendChild(panel);
}

function renderDataManagement() {
  if (!dataManagementContent) return;
  dataManagementContent.replaceChildren();

  const header = createDataManagementElement("div", "data-management-header");
  const heading = createDataManagementElement("div");
  heading.appendChild(createDataManagementElement("h2", "", "Data Management"));
  heading.appendChild(createDataManagementElement(
    "p",
    "",
    "Maintain the union identities used by maps, ownership, evidence, and server intelligence."
  ));
  header.appendChild(heading);
  header.appendChild(createDataManagementElement("span", "data-management-area-label", "Union Registry"));
  dataManagementContent.appendChild(header);

  if (dataManagementState.errorMessage) {
    dataManagementContent.appendChild(createDataManagementElement(
      "div",
      "data-management-error",
      dataManagementState.errorMessage
    ));
  }

  try {
    const identities = refreshUnionRegistryWorkspace();
    const nativeServerLabels = resolveNativeServerLabels(identities);
    const editingIdentity = dataManagementState.mode === "edit"
      ? identities.find((identity) => identity.unionId === dataManagementState.editingUnionId)
      : null;
    renderUnionRegistryForm(
      dataManagementContent,
      editingIdentity || null,
      editingIdentity ? nativeServerLabels.get(editingIdentity.unionId) : null
    );
    renderUnionRegistryList(dataManagementContent, identities, nativeServerLabels);
  } catch (error) {
    dataManagementContent.appendChild(createDataManagementElement(
      "div",
      "data-management-error",
      error && error.message ? error.message : "Unable to load Data Management."
    ));
  }
}

async function runDataManagementMutation(mutation) {
  if (dataManagementState.isSaving) return;
  dataManagementState.isSaving = true;
  dataManagementState.errorMessage = null;
  renderDataManagement();

  try {
    await applicationPersistenceFacade.execute(mutation);
    refreshUnionRegistryWorkspace();
    dataManagementState.mode = "list";
    dataManagementState.editingUnionId = null;
    refreshOwnershipView();
    refreshCommandCentreCards();
  } catch (error) {
    dataManagementState.errorMessage = error && error.message
      ? error.message
      : "Unable to save the union registry change.";
  } finally {
    dataManagementState.isSaving = false;
    renderDataManagement();
  }
}

async function handleDataManagementSubmit(event) {
  const form = event.target.closest("[data-data-management-form='union-registry']");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const values = {
    displayName: String(formData.get("displayName") || "").trim(),
    tag: String(formData.get("tag") || "").trim(),
    defaultColor: String(formData.get("defaultColor") || ""),
    mapPattern: String(formData.get("mapPattern") || "")
  };

  if (dataManagementState.mode === "edit") {
    const unionId = dataManagementState.editingUnionId;
    await runDataManagementMutation(() => {
      const identities = refreshUnionRegistryWorkspace();
      const identity = identities.find((entry) => entry.unionId === unionId);
      if (!identity) throw new Error("The selected union no longer exists.");
      const management = getDataManagementRuntimeService(
        "unionRegistryManagementService",
        ["updateUnionIdentity"]
      );
      return management.updateUnionIdentity(localActor, unionId, {
        displayName: values.displayName,
        tag: values.tag,
        defaultColor: values.defaultColor,
        presentationMetadata: Object.assign({}, identity.presentationMetadata, {
          mapPattern: values.mapPattern
        })
      });
    });
    return;
  }

  await runDataManagementMutation(() => {
    const registration = getDataManagementRuntimeService(
      "unionRegistrationCoordinator",
      ["registerUnion"]
    );
    return registration.registerUnion(localActor, {
      seasonId: seasonIdentity.seasonId,
      serverId: String(formData.get("serverId") || ""),
      displayName: values.displayName,
      tag: values.tag,
      defaultColor: values.defaultColor,
      mapPattern: values.mapPattern
    });
  });
}

function handleDataManagementInput(event) {
  if (event.target.getAttribute("data-data-management-action") !== "preview-union") return;
  const form = event.target.closest("[data-data-management-form='union-registry']");
  const preview = form && form.querySelector(".union-pattern-preview--form");
  if (!preview) return;
  const colorInput = form.elements.namedItem("defaultColor");
  const patternInput = form.elements.namedItem("mapPattern");
  preview.style.setProperty("--union-preview-color", colorInput.value);
  preview.dataset.mapPattern = patternInput.value;
  preview.setAttribute("aria-label", `${patternInput.value} map pattern preview`);
}

function handleDataManagementClick(event) {
  const actionButton = event.target.closest("[data-data-management-action]");
  if (!actionButton || actionButton.matches("input, select")) return;
  const action = actionButton.getAttribute("data-data-management-action");
  const unionId = actionButton.getAttribute("data-union-id");

  if (action === "edit-union") {
    dataManagementState.mode = "edit";
    dataManagementState.editingUnionId = unionId;
    dataManagementState.errorMessage = null;
    renderDataManagement();
    return;
  }
  if (action === "cancel-edit") {
    dataManagementState.mode = "list";
    dataManagementState.editingUnionId = null;
    dataManagementState.errorMessage = null;
    renderDataManagement();
    return;
  }
  if (action === "assign-native-server") {
    const form = actionButton.closest("[data-data-management-form='union-registry']");
    const serverControl = form && form.elements.namedItem("serverId");
    runDataManagementMutation(() => getDataManagementRuntimeService(
      "unionRegistrationCoordinator",
      ["assignNativeServer"]
    ).assignNativeServer(localActor, {
      seasonId: seasonIdentity.seasonId,
      serverId: String(serverControl ? serverControl.value : ""),
      unionId
    }));
    return;
  }
  if (action === "archive-union") {
    const confirmed = typeof window.confirm !== "function"
      || window.confirm("Archive this union? Its history will be preserved and it can be restored later.");
    if (!confirmed) return;
    runDataManagementMutation(() => getDataManagementRuntimeService(
      "unionRegistryManagementService",
      ["archiveUnionIdentity"]
    ).archiveUnionIdentity(localActor, unionId));
    return;
  }
  if (action === "restore-union") {
    runDataManagementMutation(() => getDataManagementRuntimeService(
      "unionRegistryManagementService",
      ["restoreUnionIdentity"]
    ).restoreUnionIdentity(localActor, unionId));
  }
}

function updateWorkspaceShellUI() {
  if (!workspaceShell) {
    return;
  }

  const isCommandCentre = appState.activeWorkspace === "command-centre";
  const isSeasonSetup = appState.activeWorkspace === "season-setup";
  const isDataManagement = appState.activeWorkspace === "data-management";
  workspaceShell.dataset.activeWorkspace = appState.activeWorkspace;

  if (commandCentreView) {
    commandCentreView.setAttribute("aria-hidden", String(!isCommandCentre));
  }

  if (seasonSetupView) {
    seasonSetupView.setAttribute("aria-hidden", String(!isSeasonSetup));
  }

  if (dataManagementView) {
    dataManagementView.setAttribute("aria-hidden", String(!isDataManagement));
  }

  if (mapWorkspaceView) {
    mapWorkspaceView.setAttribute("aria-hidden", String(isCommandCentre || isSeasonSetup || isDataManagement));
  }

  if (workspaceMapTitle) {
    const activeServer = getServerById(appState.activeServer);
    workspaceMapTitle.textContent = activeServer
      ? `${mapWorkspaceLabel} · ${activeServer.label}`
      : mapWorkspaceLabel;
  }

  if (!serverDock) {
    return;
  }

  serverDock.querySelectorAll("[data-workspace-target]").forEach((button) => {
    const targetWorkspace = button.getAttribute("data-workspace-target");
    const serverId = button.getAttribute("data-server-id");
    const isActiveCommand = targetWorkspace === "command-centre" && isCommandCentre;
    const isActiveSetup = targetWorkspace === "season-setup" && isSeasonSetup;
    const isActiveDataManagement = targetWorkspace === "data-management" && isDataManagement;
    const isActiveServer = targetWorkspace === "server-map"
      && !isCommandCentre
      && !isSeasonSetup
      && !isDataManagement
      && serverId === appState.activeServer;

    button.classList.toggle(
      "is-active",
      isActiveCommand || isActiveSetup || isActiveDataManagement || isActiveServer
    );
  });
}

function setActiveWorkspace(nextWorkspace, nextServerId = null) {
  if (nextWorkspace === "data-management") {
    appState.activeWorkspace = "data-management";
    appState.activeServer = null;
    clearSelection();
    renderDataManagement();
    updateWorkspaceShellUI();
    return;
  }

  if (nextWorkspace === "season-setup") {
    appState.activeWorkspace = "season-setup";
    appState.activeServer = null;
    clearSelection();
    renderSeasonSetup();
    updateWorkspaceShellUI();
    return;
  }

  if (nextWorkspace === "server-map") {
    const server = getServerById(nextServerId) || appState.servers[0];

    appState.activeWorkspace = "server-map";
    appState.activeServer = server ? server.id : null;
    updateWorkspaceShellUI();
    refreshOwnershipView();

    if (loadedMapData) {
      resetCameraView();
    }

    return;
  }

  appState.activeWorkspace = "command-centre";
  appState.activeServer = null;
  clearSelection();
  updateWorkspaceShellUI();
}

function handleWorkspaceShellClick(event) {
  const targetButton = event.target.closest("[data-workspace-target]");

  if (!targetButton) {
    return;
  }

  const targetWorkspace = targetButton.getAttribute("data-workspace-target");
  const serverId = targetButton.getAttribute("data-server-id");

  if (targetWorkspace === "server-map") {
    setActiveWorkspace("server-map", serverId);
    return;
  }

  if (targetWorkspace === "season-setup" || targetWorkspace === "data-management") {
    setActiveWorkspace(targetWorkspace);
    return;
  }
  setActiveWorkspace("command-centre");
}

function attachWorkspaceShellHandlers() {
  if (serverDock) {
    serverDock.addEventListener("click", handleWorkspaceShellClick);
  }

  if (commandCentreView) {
    commandCentreView.addEventListener("click", handleWorkspaceShellClick);
    commandCentreView.addEventListener("keydown", (event) => {
      const targetCard = event.target.closest(".command-centre-card[data-workspace-target]");

      if (!targetCard) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      setActiveWorkspace("server-map", targetCard.getAttribute("data-server-id"));
    });
  }

  if (seasonSetupView) {
    seasonSetupView.addEventListener("click", handleSeasonSetupClick);
    seasonSetupView.addEventListener("change", handleSeasonSetupChange);
  }

  if (dataManagementView) {
    dataManagementView.addEventListener("click", handleDataManagementClick);
    dataManagementView.addEventListener("input", handleDataManagementInput);
    dataManagementView.addEventListener("change", handleDataManagementInput);
    dataManagementView.addEventListener("submit", handleDataManagementSubmit);
  }

  updateWorkspaceShellUI();
}

function createHeadCell(value) {
  const cell = document.createElement("div");
  cell.className = HEAD_CELL_CLASS;
  cell.textContent = value;
  return cell;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function trySetPointerCapture(pointerId) {
  if (!cameraViewport || !cameraViewport.setPointerCapture || !cameraViewport.hasPointerCapture) {
    return;
  }

  if (cameraViewport.hasPointerCapture(pointerId)) {
    return;
  }

  try {
    cameraViewport.setPointerCapture(pointerId);
  } catch {
    // Ignore pointer capture failures in environments without an active pointer session.
  }
}

function getCameraViewportPoint(clientX, clientY) {
  if (!cameraViewport) {
    return null;
  }

  const viewportRect = cameraViewport.getBoundingClientRect();

  return {
    x: clientX - viewportRect.left,
    y: clientY - viewportRect.top
  };
}

function getViewportCenterPoint() {
  if (!cameraViewport) {
    return null;
  }

  return {
    x: cameraViewport.clientWidth / 2,
    y: cameraViewport.clientHeight / 2
  };
}

function getTileDataAt(row, col) {
  if (Number.isNaN(Number(row)) || Number.isNaN(Number(col))) {
    return null;
  }

  return tileDataByPosition.get(getTileKey(Number(row), Number(col))) || null;
}

function getActiveServerState() {
  if (!appState.activeServer) {
    return null;
  }

  return getServerById(appState.activeServer);
}

function getTilePositionKey(tile) {
  if (!tile || typeof tile !== "object") {
    return null;
  }

  const row = Number(tile.row);
  const col = Number(tile.col);

  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    return null;
  }

  return getTileKey(row, col);
}

function getServerTileOwner(tile) {
  const tileKey = getTilePositionKey(tile);
  if (!tileKey) {
    return null;
  }

  if (!serverStateService || !appState.activeServer) {
    return tile.ownerId == null ? null : tile.ownerId;
  }

  const fallbackOwnerId = tile.ownerId == null ? null : tile.ownerId;
  return serverStateService.getTerritoryOwner(appState.activeServer, tileKey, fallbackOwnerId);
}

function setServerTileOwner(tile, ownerId) {
  const tileKey = getTilePositionKey(tile);
  if (!tileKey) {
    return null;
  }

  if (!serverStateService || !appState.activeServer) {
    return getServerTileOwner(tile);
  }

  const normalizedOwnerId = ownerId == null ? null : ownerId;
  return serverStateService.setTerritoryOwner(appState.activeServer, tileKey, normalizedOwnerId);
}

function refreshOwnershipView() {
  applyOwnershipOverlays((loadedMapData && loadedMapData.structures) || []);

  if (selectionState.selectedItem) {
    renderSelectionPanel(selectionState.selectedItem);
  }
}

function initializeOwnershipService() {
  if (!ownershipServiceFactory) {
    return;
  }

  ownershipService = ownershipServiceFactory({
    getUnionRegistry: () => appState.unionRegistry,
    getTileByPosition: getTileDataAt,
    getTileOwner: getServerTileOwner,
    setTileOwner: setServerTileOwner
  });

  appState.ownershipService = ownershipService;
}

function initializeSummaryService() {
  if (typeof summaryServiceFactory !== "function") {
    throw new Error("Renderer requires a summary service factory.");
  }

  if (!serverStateService || typeof serverStateService.getTerritoryOwner !== "function") {
    throw new Error("Renderer requires server state service territory ownership access.");
  }

  summaryService = summaryServiceFactory({
    getMapData: () => loadedMapData,
    getUnionRegistry: () => appState.unionRegistry,
    getGameRulesEngine: () => appState.gameRulesEngine,
    getNativeUnionIds: (server) => getCurrentNativeUnionIds(server),
    getTerritoryOwner: serverStateService.getTerritoryOwner.bind(serverStateService)
  });
}

function getStructureOwnerLabel(structure) {
  if (!ownershipService) {
    return "Unassigned";
  }

  const result = ownershipService.getStructureOwner(structure);

  if (result.state === "owned") {
    const union = ownershipService.getUnionById(result.ownerId);
    return union ? union.tag || union.displayName || union.unionId : result.ownerId;
  }

  if (result.state === "contested") {
    return "Contested";
  }

  if (result.state === "partial") {
    return "Partial";
  }

  return "Unassigned";
}

function appendHeaderCells(targets, value) {
  targets.forEach((target) => {
    target.appendChild(createHeadCell(value));
  });
}

function renderGridHeaders(gridSize) {
  // The row and column headers share the same structure, so a small helper keeps the logic DRY.
  for (let index = 1; index <= gridSize; index += 1) {
    appendHeaderCells([colheads, colheadsBottom], index);
    appendHeaderCells([rowheads, rowheadsRight], index);
  }
}

function getCameraBounds() {
  if (!cameraViewport || !cameraSurface) {
    return null;
  }

  const viewportRect = cameraViewport.getBoundingClientRect();
  const surfaceRect = cameraSurface.getBoundingClientRect();

  if (!viewportRect.width || !viewportRect.height || !surfaceRect.width || !surfaceRect.height) {
    return null;
  }

  return { viewportRect, surfaceRect };
}

function getRoyalCityMarker(data) {
  return (data.structures || []).find((marker) => marker.code === "RC7" && marker.type === "Royal City") || null;
}

function getMarkerElement(marker) {
  if (!marker) {
    return null;
  }

  return map.querySelector(
    `.marker[data-code="${marker.code}"][data-row="${marker.row}"][data-col="${marker.col}"][data-rows="${marker.rows}"][data-cols="${marker.cols}"]`
  );
}

function getDefaultCameraState(data) {
  const viewportWidth = cameraViewport ? cameraViewport.clientWidth : 0;
  const viewportHeight = cameraViewport ? cameraViewport.clientHeight : 0;
  const surfaceWidth = cameraSurface ? cameraSurface.offsetWidth : 0;
  const surfaceHeight = cameraSurface ? cameraSurface.offsetHeight : 0;
  const royalCityMarker = getRoyalCityMarker(data);
  const fitZoom = viewportWidth && viewportHeight && surfaceWidth && surfaceHeight
    ? Math.min(
        viewportWidth / surfaceWidth,
        viewportHeight / surfaceHeight
      )
    : cameraState.zoom;
  const zoom = clamp(fitZoom / 0.38, cameraState.minZoom, cameraState.maxZoom);

  if (!viewportWidth || !viewportHeight || !royalCityMarker) {
    return {
      x: 0,
      y: 0,
      zoom
    };
  }

  const royalCityElement = getMarkerElement(royalCityMarker);

  if (!royalCityElement) {
    return {
      x: 0,
      y: 0,
      zoom
    };
  }

  const targetRect = royalCityElement.getBoundingClientRect();
  const surfaceRect = cameraSurface.getBoundingClientRect();
  const targetCenterX = (targetRect.left - surfaceRect.left + targetRect.width / 2) / cameraState.zoom;
  const targetCenterY = (targetRect.top - surfaceRect.top + targetRect.height / 2) / cameraState.zoom;

  return {
    x: viewportWidth / 2 - targetCenterX * zoom,
    y: viewportHeight / 2 - targetCenterY * zoom,
    zoom
  };
}

function applyCameraTransform() {
  if (!cameraSurface) {
    return;
  }

  cameraSurface.style.transform = `translate(${cameraState.x}px, ${cameraState.y}px) scale(${cameraState.zoom})`;
}

function getCameraConstraintBounds(zoom) {
  if (!cameraViewport || !map) {
    return null;
  }

  const viewportRect = cameraViewport.getBoundingClientRect();
  const mapWidth = map.offsetWidth;
  const mapHeight = map.offsetHeight;
  const mapOffsetLeft = map.offsetLeft;
  const mapOffsetTop = map.offsetTop;

  if (!viewportRect.width || !viewportRect.height || !mapWidth || !mapHeight) {
    return null;
  }

  const gridSize = Math.max(1, Number(currentGridSize || DEFAULT_GRID_SIZE));
  const tileSize = mapWidth / gridSize;
  const overscroll = tileSize * zoom;

  const minX = viewportRect.width - overscroll - (mapOffsetLeft + mapWidth) * zoom;
  const maxX = overscroll - mapOffsetLeft * zoom;
  const minY = viewportRect.height - overscroll - (mapOffsetTop + mapHeight) * zoom;
  const maxY = overscroll - mapOffsetTop * zoom;

  return {
    minX,
    maxX,
    minY,
    maxY
  };
}

function constrainCameraPosition(nextCameraState) {
  const bounds = getCameraConstraintBounds(nextCameraState.zoom);

  if (!bounds) {
    return {
      x: nextCameraState.x,
      y: nextCameraState.y
    };
  }

  const resolvedXBounds = bounds.minX <= bounds.maxX
    ? { min: bounds.minX, max: bounds.maxX }
    : { min: (bounds.minX + bounds.maxX) / 2, max: (bounds.minX + bounds.maxX) / 2 };
  const resolvedYBounds = bounds.minY <= bounds.maxY
    ? { min: bounds.minY, max: bounds.maxY }
    : { min: (bounds.minY + bounds.maxY) / 2, max: (bounds.minY + bounds.maxY) / 2 };

  return {
    x: clamp(nextCameraState.x, resolvedXBounds.min, resolvedXBounds.max),
    y: clamp(nextCameraState.y, resolvedYBounds.min, resolvedYBounds.max)
  };
}

function setCameraState(nextState) {
  const mergedState = {
    ...cameraState,
    ...nextState
  };

  mergedState.zoom = clamp(mergedState.zoom, mergedState.minZoom, mergedState.maxZoom);

  const constrainedPosition = constrainCameraPosition(mergedState);

  Object.assign(cameraState, mergedState, constrainedPosition);
  applyCameraTransform();
}

function centerCameraOnSurfacePoint(targetPoint, zoom = cameraState.zoom) {
  if (!targetPoint || !cameraViewport) {
    return;
  }

  const targetZoom = clamp(zoom, cameraState.minZoom, cameraState.maxZoom);

  setCameraState({
    x: cameraViewport.clientWidth / 2 - targetPoint.x * targetZoom,
    y: cameraViewport.clientHeight / 2 - targetPoint.y * targetZoom,
    zoom: targetZoom
  });
}

function getMapCenterSurfacePoint() {
  if (!map) {
    return null;
  }

  return {
    x: map.offsetLeft + map.offsetWidth / 2,
    y: map.offsetTop + map.offsetHeight / 2
  };
}

function getFitMapZoom() {
  if (!cameraViewport || !map || !map.offsetWidth || !map.offsetHeight) {
    return cameraState.zoom;
  }

  const fitZoom = Math.min(
    (cameraViewport.clientWidth * FIT_MAP_MARGIN_RATIO) / map.offsetWidth,
    (cameraViewport.clientHeight * FIT_MAP_MARGIN_RATIO) / map.offsetHeight
  );

  return clamp(fitZoom, cameraState.minZoom, cameraState.maxZoom);
}

function fitMapCamera() {
  const mapCenter = getMapCenterSurfacePoint();

  if (!mapCenter) {
    return;
  }

  centerCameraOnSurfacePoint(mapCenter, getFitMapZoom());
}

function resetCameraView() {
  if (!loadedMapData) {
    return;
  }

  setCameraState(getDefaultCameraState(loadedMapData));
}

function getSelectionSurfaceCenterPoint() {
  const selectedElements = selectionState.selectedElements || [];

  if (selectedElements.length === 0 || !cameraSurface) {
    return null;
  }

  const surfaceRect = cameraSurface.getBoundingClientRect();

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  selectedElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  });

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  return {
    x: (left - surfaceRect.left + (right - left) / 2) / cameraState.zoom,
    y: (top - surfaceRect.top + (bottom - top) / 2) / cameraState.zoom
  };
}

function centerOnCurrentSelection() {
  const selectionCenter = getSelectionSurfaceCenterPoint();

  if (!selectionCenter) {
    return;
  }

  centerCameraOnSurfacePoint(selectionCenter, cameraState.zoom);
}

function handleCameraToolbarClick(event) {
  const actionButton = event.target.closest(".camera-button[data-camera-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.cameraAction;

  switch (action) {
    case "zoom-in":
      setCameraZoomAt(cameraState.zoom * TOOLBAR_ZOOM_FACTOR, getViewportCenterPoint());
      break;
    case "zoom-out":
      setCameraZoomAt(cameraState.zoom / TOOLBAR_ZOOM_FACTOR, getViewportCenterPoint());
      break;
    case "fit-map":
      fitMapCamera();
      break;
    case "reset-view":
      resetCameraView();
      break;
    case "center-selection":
      centerOnCurrentSelection();
      break;
    default:
      break;
  }
}

function setCameraZoomAt(nextZoom, focalPoint) {
  if (!focalPoint) {
    setCameraState({ zoom: nextZoom });
    return;
  }

  const zoom = clamp(nextZoom, cameraState.minZoom, cameraState.maxZoom);
  const focusX = focalPoint.x;
  const focusY = focalPoint.y;
  const targetX = focusX - ((focusX - cameraState.x) / cameraState.zoom) * zoom;
  const targetY = focusY - ((focusY - cameraState.y) / cameraState.zoom) * zoom;

  setCameraState({
    x: targetX,
    y: targetY,
    zoom
  });
}

function getPinchDetails() {
  if (activePointers.size < 2) {
    return null;
  }

  const [firstPointer, secondPointer] = Array.from(activePointers.values());
  const deltaX = secondPointer.x - firstPointer.x;
  const deltaY = secondPointer.y - firstPointer.y;
  const distance = Math.hypot(deltaX, deltaY);

  return {
    distance,
    midpoint: {
      x: (firstPointer.x + secondPointer.x) / 2,
      y: (firstPointer.y + secondPointer.y) / 2
    }
  };
}

function startPinchIfNeeded() {
  if (pinchZoomState || activePointers.size < 2) {
    return;
  }

  const pinchDetails = getPinchDetails();

  if (!pinchDetails || !pinchDetails.distance) {
    return;
  }

  pinchZoomState = {
    startDistance: pinchDetails.distance,
    startZoom: cameraState.zoom
  };

  if (cameraViewport) {
    activePointers.forEach((pointer, pointerId) => {
      trySetPointerCapture(pointerId);
    });
  }
}

function updatePinchZoom() {
  if (!pinchZoomState) {
    return;
  }

  const pinchDetails = getPinchDetails();

  if (!pinchDetails || !pinchDetails.distance) {
    return;
  }

  const nextZoom = pinchZoomState.startZoom * (pinchDetails.distance / pinchZoomState.startDistance);
  setCameraZoomAt(nextZoom, pinchDetails.midpoint);
}

function endPinchIfNeeded() {
  if (activePointers.size < 2) {
    pinchZoomState = null;
  }
}

function handleCameraWheel(event) {
  if (!cameraViewport) {
    return;
  }

  event.preventDefault();

  const viewportPoint = getCameraViewportPoint(event.clientX, event.clientY);
  const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * cameraViewport.clientHeight : event.deltaY;
  const zoomFactor = Math.exp(-normalizedDelta * ZOOM_WHEEL_SENSITIVITY);

  setCameraZoomAt(cameraState.zoom * zoomFactor, viewportPoint);
}

function handleCameraPointerDown(event) {
  if (!cameraViewport || event.pointerType === "mouse") {
    return;
  }

  if (event.pointerType === "touch") {
    trySetPointerCapture(event.pointerId);
  }

  activePointers.set(event.pointerId, {
    x: event.clientX - cameraViewport.getBoundingClientRect().left,
    y: event.clientY - cameraViewport.getBoundingClientRect().top
  });

  if (event.pointerType === "touch" && activePointers.size === 1) {
    touchPanState.suppressClick = false;
    touchPanState.pointerId = event.pointerId;
    touchPanState.isPointerDown = true;
    touchPanState.isDragging = false;
    touchPanState.startClientX = event.clientX;
    touchPanState.startClientY = event.clientY;
    touchPanState.startCameraX = cameraState.x;
    touchPanState.startCameraY = cameraState.y;
  }

  if (activePointers.size >= 2) {
    touchPanState.isPointerDown = false;
    touchPanState.isDragging = false;
    startPinchIfNeeded();
  }
}

function handleCameraPointerMove(event) {
  if (!activePointers.has(event.pointerId) || !cameraViewport) {
    return;
  }

  activePointers.set(event.pointerId, {
    x: event.clientX - cameraViewport.getBoundingClientRect().left,
    y: event.clientY - cameraViewport.getBoundingClientRect().top
  });

  if (pinchZoomState) {
    event.preventDefault();
    updatePinchZoom();
    return;
  }

  if (event.pointerType !== "touch" || !touchPanState.isPointerDown || touchPanState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - touchPanState.startClientX;
  const deltaY = event.clientY - touchPanState.startClientY;
  const dragDistance = Math.hypot(deltaX, deltaY);

  if (!touchPanState.isDragging && dragDistance < TOUCH_PAN_DRAG_THRESHOLD) {
    return;
  }

  event.preventDefault();
  touchPanState.isDragging = true;

  setCameraState({
    x: touchPanState.startCameraX + deltaX,
    y: touchPanState.startCameraY + deltaY
  });
}

function handleCameraPointerUp(event) {
  if (event.pointerType === "touch" && touchPanState.pointerId === event.pointerId) {
    touchPanState.suppressClick = touchPanState.isDragging;
    touchPanState.pointerId = null;
    touchPanState.isPointerDown = false;
    touchPanState.isDragging = false;
  }

  if (!activePointers.has(event.pointerId)) {
    return;
  }

  activePointers.delete(event.pointerId);
  endPinchIfNeeded();

  if (event.pointerType === "touch" && activePointers.size === 1 && !pinchZoomState) {
    const remainingPointer = Array.from(activePointers.keys())[0];
    const remainingPoint = activePointers.get(remainingPointer);

    touchPanState.pointerId = remainingPointer;
    touchPanState.isPointerDown = true;
    touchPanState.isDragging = false;
    touchPanState.startClientX = remainingPoint.x + cameraViewport.getBoundingClientRect().left;
    touchPanState.startClientY = remainingPoint.y + cameraViewport.getBoundingClientRect().top;
    touchPanState.startCameraX = cameraState.x;
    touchPanState.startCameraY = cameraState.y;
  }
}

function isWithinCameraViewport(target) {
  return Boolean(cameraViewport && target && cameraViewport.contains(target));
}

function resetDesktopPanState() {
  desktopPanState.isPointerDown = false;
  desktopPanState.isDragging = false;

  if (cameraViewport) {
    cameraViewport.classList.remove("is-panning");
  }
}

function handleDesktopPanMouseDown(event) {
  if (event.button !== 0 || !isWithinCameraViewport(event.target)) {
    return;
  }

  event.preventDefault();

  desktopPanState.suppressClick = false;
  desktopPanState.isPointerDown = true;
  desktopPanState.isDragging = false;
  desktopPanState.startClientX = event.clientX;
  desktopPanState.startClientY = event.clientY;
  desktopPanState.startCameraX = cameraState.x;
  desktopPanState.startCameraY = cameraState.y;
}

function handleDesktopPanMouseMove(event) {
  if (!desktopPanState.isPointerDown) {
    return;
  }

  const deltaX = event.clientX - desktopPanState.startClientX;
  const deltaY = event.clientY - desktopPanState.startClientY;
  const dragDistance = Math.hypot(deltaX, deltaY);

  if (!desktopPanState.isDragging && dragDistance < DESKTOP_PAN_DRAG_THRESHOLD) {
    return;
  }

  event.preventDefault();

  if (!desktopPanState.isDragging && cameraViewport) {
    cameraViewport.classList.add("is-panning");
  }

  desktopPanState.isDragging = true;

  setCameraState({
    x: desktopPanState.startCameraX + deltaX,
    y: desktopPanState.startCameraY + deltaY
  });
}

function handleDesktopPanMouseUp() {
  if (!desktopPanState.isPointerDown) {
    return;
  }

  desktopPanState.suppressClick = desktopPanState.isDragging;

  resetDesktopPanState();
}

function handleCameraClickCapture(event) {
  if (!desktopPanState.suppressClick && !touchPanState.suppressClick) {
    return;
  }

  if (!isWithinCameraViewport(event.target)) {
    desktopPanState.suppressClick = false;
    touchPanState.suppressClick = false;
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  desktopPanState.suppressClick = false;
  touchPanState.suppressClick = false;
}

function handleDesktopPanDragStart(event) {
  if (!isWithinCameraViewport(event.target)) {
    return;
  }

  event.preventDefault();
}

function handleCameraViewportResize() {
  setCameraState({
    x: cameraState.x,
    y: cameraState.y
  });
}

function attachCameraInputHandlers() {
  if (!cameraViewport) {
    return;
  }

  cameraViewport.addEventListener("mousedown", handleDesktopPanMouseDown);
  window.addEventListener("mousemove", handleDesktopPanMouseMove);
  window.addEventListener("mouseup", handleDesktopPanMouseUp);
  window.addEventListener("resize", handleCameraViewportResize);
  cameraViewport.addEventListener("click", handleCameraClickCapture, true);
  cameraViewport.addEventListener("dragstart", handleDesktopPanDragStart);

  cameraViewport.addEventListener("wheel", handleCameraWheel, { passive: false });
  cameraViewport.addEventListener("pointerdown", handleCameraPointerDown);
  cameraViewport.addEventListener("pointermove", handleCameraPointerMove);
  cameraViewport.addEventListener("pointerup", handleCameraPointerUp);
  cameraViewport.addEventListener("pointercancel", handleCameraPointerUp);
}

function attachCameraToolbarHandlers() {
  if (!cameraToolbar) {
    return;
  }

  cameraToolbar.addEventListener("click", handleCameraToolbarClick);
}

function buildOwnerOption(union, selectedOwnerId) {
  const option = document.createElement("option");
  option.value = union.unionId;
  option.textContent = union.tag || union.displayName || union.unionId;
  option.selected = union.unionId === selectedOwnerId;
  return option;
}

function isStructureSelection(item) {
  return Boolean(
    item
    && Number.isFinite(Number(item.rows))
    && Number.isFinite(Number(item.cols))
  );
}

function getTerritoryEditorState(item, isStructure) {
  if (!ownershipService || !item) {
    return {
      selectedOwnerId: null,
      unassignedLabel: "Unassigned"
    };
  }

  if (!isStructure) {
    return {
      selectedOwnerId: ownershipService.getTileOwner(item),
      unassignedLabel: "Unassigned"
    };
  }

  const structureOwner = ownershipService.getStructureOwner(item);
  if (structureOwner.state === "owned") {
    return {
      selectedOwnerId: structureOwner.ownerId,
      unassignedLabel: "Unassigned"
    };
  }

  if (structureOwner.state === "partial" || structureOwner.state === "contested") {
    return {
      selectedOwnerId: null,
      unassignedLabel: "Mixed / Partial"
    };
  }

  return {
    selectedOwnerId: null,
    unassignedLabel: "Unassigned"
  };
}

function buildTerritoryEditor(item) {
  if (!selectionPanel || !ownershipService || !item) {
    return;
  }

  const isStructure = isStructureSelection(item);
  const editorState = getTerritoryEditorState(item, isStructure);

  const territorySection = document.createElement("div");
  territorySection.className = "territory-editor";

  const territoryTitle = document.createElement("h3");
  territoryTitle.className = "territory-editor-title";
  territoryTitle.textContent = "Territory";
  territorySection.appendChild(territoryTitle);

  const editorRow = document.createElement("label");
  editorRow.className = "territory-editor-row";
  editorRow.setAttribute("for", "tile-owner-select");

  const ownerLabel = document.createElement("span");
  ownerLabel.className = "selection-label";
  ownerLabel.textContent = "Owner";

  const ownerSelect = document.createElement("select");
  ownerSelect.id = "tile-owner-select";
  ownerSelect.className = "territory-owner-select";
  ownerSelect.setAttribute("data-owner-select", "true");

  const unassignedOption = document.createElement("option");
  unassignedOption.value = "";
  unassignedOption.textContent = editorState.unassignedLabel;
  unassignedOption.selected = editorState.selectedOwnerId === null;
  ownerSelect.appendChild(unassignedOption);

  appState.unionRegistry.forEach((union) => {
    if (!union || !union.unionId || union.registryStatus !== "current") {
      return;
    }

    ownerSelect.appendChild(buildOwnerOption(union, editorState.selectedOwnerId));
  });

  editorRow.appendChild(ownerLabel);
  editorRow.appendChild(ownerSelect);
  territorySection.appendChild(editorRow);
  if (selectionState.errorMessage) {
    territorySection.appendChild(createDataManagementElement(
      "div",
      "data-management-error territory-editor-error",
      selectionState.errorMessage
    ));
  }
  selectionPanel.appendChild(territorySection);
}

function getStructureFootprint(structure) {
  const footprint = [];
  const rows = Number(structure.rows || 1);
  const cols = Number(structure.cols || 1);
  const startRow = Number(structure.row);
  const startCol = Number(structure.col);

  for (let row = startRow; row < startRow + rows; row += 1) {
    for (let col = startCol; col < startCol + cols; col += 1) {
      footprint.push({ row, col });
    }
  }

  return footprint;
}

async function handleSelectionPanelChange(event) {
  const ownerSelect = event.target.closest("[data-owner-select='true']");

  if (!ownerSelect || !ownershipService || !mapOwnershipCoordinator || !localActor) {
    return;
  }

  const selectedItem = selectionState.selectedItem;
  const isStructure = isStructureSelection(selectedItem);

  if (!selectedItem) {
    return;
  }

  const ownerId = ownerSelect.value || null;
  selectionState.errorMessage = null;
  ownerSelect.disabled = true;

  try {
    await applicationPersistenceFacade.execute(async () => {
      if (isStructure) {
        await mapOwnershipCoordinator.setStructureOwnership(localActor, {
          seasonId: seasonIdentity.seasonId,
          serverId: appState.activeServer,
          structureId: selectedItem.id,
          footprint: getStructureFootprint(selectedItem),
          ownerUnionId: ownerId
        });
      } else {
        await mapOwnershipCoordinator.setTerritoryOwnership(localActor, {
          seasonId: seasonIdentity.seasonId,
          serverId: appState.activeServer,
          row: Number(selectedItem.row),
          col: Number(selectedItem.col),
          ownerUnionId: ownerId
        });
      }
    });

    refreshOwnershipView();
    refreshCommandCentreCards();
  } catch (error) {
    refreshOwnershipView();
    refreshCommandCentreCards();
    selectionState.errorMessage = error && error.message
      ? error.message
      : "Unable to update ownership.";
    renderSelectionPanel(selectedItem);
    console.error("Unable to apply or persist updated map ownership", error);
  } finally {
    ownerSelect.disabled = false;
  }
}

function attachSelectionPanelHandlers() {
  if (!selectionPanel) {
    return;
  }

  selectionPanel.addEventListener("change", handleSelectionPanelChange);
}

function getSelectedTargetView(item) {
  if (!selectedMapTargetViewService || !item || !appState.activeServer) {
    return null;
  }
  if (isStructureSelection(item)) {
    return selectedMapTargetViewService.getStructureView({
      seasonId: seasonIdentity.seasonId,
      serverId: appState.activeServer,
      structureId: item.id,
      structureCode: item.code
    });
  }
  return selectedMapTargetViewService.getTerritoryView({
    seasonId: seasonIdentity.seasonId,
    serverId: appState.activeServer,
    row: Number(item.row),
    col: Number(item.col)
  });
}

function formatRecordedTime(value, emptyLabel) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return emptyLabel;
  }
  const recordedAt = Date.parse(value);
  const elapsedMilliseconds = Math.max(0, Date.now() - recordedAt);
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60000);
  let relative;
  if (elapsedMinutes < 1) {
    relative = "Just now";
  } else if (elapsedMinutes < 60) {
    relative = `${elapsedMinutes} min ago`;
  } else if (elapsedMinutes < 48 * 60) {
    const hours = Math.floor(elapsedMinutes / 60);
    relative = `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else {
    const days = Math.floor(elapsedMinutes / (24 * 60));
    relative = `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  const exact = new Date(recordedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${relative} · ${exact}`;
}

function formatSeasonDefinedValues(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "Not configured";
  }

  const formattedValues = values.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const amount = Object.prototype.hasOwnProperty.call(entry, "value")
      ? entry.value
      : (Object.prototype.hasOwnProperty.call(entry, "amount") ? entry.amount : null);
    const unit = entry.unit || entry.resourceLabel || entry.resourceId || "";
    if (amount === null || amount === undefined) {
      return null;
    }

    return `${amount}${unit ? ` ${unit}` : ""}`;
  }).filter(Boolean);

  return formattedValues.length > 0 ? formattedValues.join(" · ") : "Not configured";
}

function getOwnerPattern(union) {
  const metadata = union && union.presentationMetadata;
  return metadata && typeof metadata.mapPattern === "string"
    ? metadata.mapPattern
    : "solid";
}

function renderSelectionPanel(tile) {
  if (!selectionPanel) {
    return;
  }

  if (!tile) {
    selectionPanel.innerHTML = `
      <h2>Tile Details</h2>
      <div class="selection-empty">Select a tile to view details.</div>
    `;
    return;
  }

  const terrainValue = tile.type || "Unknown terrain";
  const isStructure = isStructureSelection(tile);
  const targetView = getSelectedTargetView(tile);
  const fallbackOwnerValue = ownershipService
    ? (isStructure ? getStructureOwnerLabel(tile) : ownershipService.getTileOwnerLabel(tile))
    : "Unassigned";
  const unionIdentity = targetView && targetView.currentUnionIdentity;
  const ownerValue = unionIdentity
    ? (unionIdentity.tag || unionIdentity.displayName || unionIdentity.unionId)
    : fallbackOwnerValue;
  const ownerColor = unionIdentity && unionIdentity.defaultColor
    ? unionIdentity.defaultColor
    : "transparent";
  const ownerPattern = getOwnerPattern(unionIdentity);
  const title = isStructure
    ? `${tile.type || "Structure"}${tile.level ? ` · Level ${tile.level}` : ""}`
    : terrainValue;
  const structureValue = targetView
    ? formatSeasonDefinedValues(targetView.seasonDefinedValues)
    : "Not configured";
  const lastConfirmed = formatRecordedTime(
    targetView && targetView.lastConfirmedAt,
    "Not yet confirmed"
  );
  const lastOwnershipChange = formatRecordedTime(
    targetView && targetView.lastOwnershipChangeAt,
    "No recorded change"
  );

  selectionPanel.innerHTML = `
    <h2>${isStructure ? "Structure Details" : "Tile Details"}</h2>
    <div class="selection-summary">
      <div class="selection-title">${title}</div>
      <div class="selection-meta">
        <div class="selection-row">
          <span class="selection-label">Owner</span>
          <span class="selection-owner">
            <span class="selection-owner-swatch pattern-${ownerPattern}" style="--owner-color:${ownerColor}"></span>
            ${ownerValue}
          </span>
        </div>
        <div class="selection-row"><span class="selection-label">Last confirmed</span><span>${lastConfirmed}</span></div>
        <div class="selection-row"><span class="selection-label">Last ownership change</span><span>${lastOwnershipChange}</span></div>
        ${isStructure ? `<div class="selection-row"><span class="selection-label">Season value</span><span>${structureValue}</span></div>` : ""}
      </div>
    </div>
  `;

  buildTerritoryEditor(tile);
}

function clearHoverEffects() {
  map.querySelectorAll(`.${TILE_CLASS_PREFIX}.hovered`).forEach((tileElement) => {
    tileElement.classList.remove("hovered");
  });

  map.querySelectorAll(".footprint-overlay.hovered").forEach((overlayElement) => {
    overlayElement.classList.remove("hovered");
  });
}

function clearSelectionClasses(elements) {
  elements.forEach((element) => {
    element.classList.remove(SELECTED_TILE_CLASS, ...selectionEdgeClasses);
  });
}

function clearFootprintVisualClasses(elements) {
  elements.forEach((element) => {
    element.classList.remove(...FOOTPRINT_EDGE_CLASSES);
  });
}

function clearFootprintOverlayState() {
  map.querySelectorAll(".footprint-overlay.selected").forEach((overlayElement) => {
    overlayElement.classList.remove("selected");
  });

  map.querySelectorAll(".footprint-overlay.hovered").forEach((overlayElement) => {
    overlayElement.classList.remove("hovered");
  });
}

function clearTileOwnershipOverlays() {
  map.querySelectorAll(`.${TILE_CLASS_PREFIX}.ownership-owned`).forEach((tileElement) => {
    tileElement.classList.remove("ownership-owned");
    tileElement.style.removeProperty("--ownership-color");
    tileElement.removeAttribute("data-ownership-pattern");
  });
}

function clearStructureOwnershipOverlays() {
  map.querySelectorAll(".footprint-overlay.ownership-owned").forEach((overlayElement) => {
    overlayElement.classList.remove("ownership-owned");
    overlayElement.style.removeProperty("--ownership-color");
    overlayElement.removeAttribute("data-ownership-pattern");
  });
}

function applyTileOwnershipOverlays() {
  if (!ownershipService) {
    return;
  }

  clearTileOwnershipOverlays();

  map.querySelectorAll(`.${TILE_CLASS_PREFIX}`).forEach((tileElement) => {
    const tile = tileElement.tileData;
    const ownerColor = ownershipService.getTileOwnerColor(tile);
    const ownerId = ownershipService.getTileOwner(tile);
    const union = ownershipService.getUnionById(ownerId);

    if (!ownerColor) {
      return;
    }

    tileElement.classList.add("ownership-owned");
    tileElement.style.setProperty("--ownership-color", ownerColor);
    tileElement.setAttribute("data-ownership-pattern", getOwnerPattern(union));
  });
}

function applyStructureOwnershipOverlays(markers) {
  if (!ownershipService || !Array.isArray(markers)) {
    return;
  }

  clearStructureOwnershipOverlays();

  markers.forEach((marker) => {
    if (marker.rows === 1 && marker.cols === 1) {
      return;
    }

    const footprintTiles = getTileElementsForFootprint(marker);
    footprintTiles.forEach((tileElement) => {
      tileElement.classList.remove("ownership-owned");
      tileElement.style.removeProperty("--ownership-color");
      tileElement.removeAttribute("data-ownership-pattern");
    });

    const owner = ownershipService.getStructureOwner(marker);
    if (owner.state !== "owned") {
      return;
    }

    const union = ownershipService.getUnionById(owner.ownerId);
    const ownerColor = union && union.defaultColor ? union.defaultColor : null;
    if (!ownerColor) {
      return;
    }

    const overlayElement = getFootprintOverlay(marker);
    if (!overlayElement) {
      return;
    }

    overlayElement.classList.add("ownership-owned");
    overlayElement.style.setProperty("--ownership-color", ownerColor);
    overlayElement.setAttribute("data-ownership-pattern", getOwnerPattern(union));
  });
}

function applyOwnershipOverlays(markers) {
  applyTileOwnershipOverlays();
  applyStructureOwnershipOverlays(markers);
}

function getFootprintOverlay(marker) {
  return map.querySelector(`.footprint-overlay[data-row="${marker.row}"][data-col="${marker.col}"][data-rows="${marker.rows}"][data-cols="${marker.cols}"]`);
}

function applyFootprintVisuals(marker) {
  if (marker.rows === 1 && marker.cols === 1) {
    return;
  }

  const footprintElements = getTileElementsForFootprint(marker);
  clearFootprintVisualClasses(footprintElements);

  footprintElements.forEach((element) => {
    element.classList.add(FOOTPRINT_CLASS_PREFIX, FOOTPRINT_INTERNAL_CLASS);

    const row = Number(element.dataset.row ?? element.getAttribute("data-row"));
    const col = Number(element.dataset.col ?? element.getAttribute("data-col"));

    if (row === marker.row) {
      element.classList.add("merged-edge-top");
    }

    if (row === marker.row + marker.rows - 1) {
      element.classList.add("merged-edge-bottom");
    }

    if (col === marker.col) {
      element.classList.add("merged-edge-left");
    }

    if (col === marker.col + marker.cols - 1) {
      element.classList.add("merged-edge-right");
    }
  });
}

function applyFootprintSelection(elements, marker) {
  clearSelectionClasses(elements);

  elements.forEach((element) => {
    element.classList.add("selected-footprint");

    const row = Number(element.dataset.row ?? element.getAttribute("data-row"));
    const col = Number(element.dataset.col ?? element.getAttribute("data-col"));

    if (row === marker.row) {
      element.classList.add("selected-edge-top");
    }

    if (row === marker.row + marker.rows - 1) {
      element.classList.add("selected-edge-bottom");
    }

    if (col === marker.col) {
      element.classList.add("selected-edge-left");
    }

    if (col === marker.col + marker.cols - 1) {
      element.classList.add("selected-edge-right");
    }
  });
}

function clearSelection() {
  clearSelectionClasses(selectionState.selectedElements);
  clearFootprintOverlayState();

  clearHoverEffects();
  selectionState.selectedElements = [];
  selectionState.selectedItem = null;
  selectionState.errorMessage = null;
  renderSelectionPanel(null);
}

function buildTileLookup() {
  tileElementsByPosition.clear();
  tileDataByPosition.clear();

  map.querySelectorAll(`.${TILE_CLASS_PREFIX}`).forEach((tileElement) => {
    const row = Number(tileElement.dataset.row ?? tileElement.getAttribute("data-row"));
    const col = Number(tileElement.dataset.col ?? tileElement.getAttribute("data-col"));

    if (!Number.isNaN(row) && !Number.isNaN(col)) {
      tileElementsByPosition.set(getTileKey(row, col), tileElement);
      if (tileElement.tileData) {
        tileDataByPosition.set(getTileKey(row, col), tileElement.tileData);
      }
    }
  });
}

function getTileElementsForFootprint(marker) {
  const elements = [];

  for (let rowIndex = marker.row; rowIndex < marker.row + marker.rows; rowIndex += 1) {
    for (let colIndex = marker.col; colIndex < marker.col + marker.cols; colIndex += 1) {
      const tileElement = tileElementsByPosition.get(getTileKey(rowIndex, colIndex));
      if (tileElement) {
        elements.push(tileElement);
      }
    }
  }

  return elements;
}

function setMarkerHoverEffect(marker, isHovered) {
  const tileElements = getTileElementsForFootprint(marker);
  const overlayElement = getFootprintOverlay(marker);

  if (marker.rows === 1 && marker.cols === 1) {
    tileElements.forEach((tileElement) => {
      tileElement.classList.toggle("hovered", isHovered);
    });
  }

  if (overlayElement) {
    overlayElement.classList.toggle("hovered", isHovered);
  }
}

function selectTile(tile, element) {
  if (selectionState.selectedItem === tile && selectionState.selectedElements[0] === element) {
    return;
  }

  clearSelection();
  selectionState.selectedItem = tile;
  selectionState.selectedElements = [element];
  selectionState.errorMessage = null;
  clearSelectionClasses([element]);
  element.classList.add(SELECTED_TILE_CLASS);
  renderSelectionPanel(tile);
}

function selectMarker(marker) {
  if (selectionState.selectedItem === marker && selectionState.selectedElements.length > 0) {
    return;
  }

  clearSelection();
  const footprintElements = getTileElementsForFootprint(marker);
  selectionState.selectedItem = marker;
  selectionState.selectedElements = footprintElements;
  selectionState.errorMessage = null;

  if (footprintElements.length === 0) {
    renderSelectionPanel(marker);
    return;
  }

  const overlayElement = getFootprintOverlay(marker);

  if (marker.rows === 1 && marker.cols === 1) {
    clearSelectionClasses(footprintElements);
    footprintElements[0].classList.add(SELECTED_TILE_CLASS);
    if (overlayElement) {
      overlayElement.classList.remove("selected");
    }
  } else {
    applyFootprintSelection(footprintElements, marker);
    if (overlayElement) {
      overlayElement.classList.add("selected");
    }
  }

  renderSelectionPanel(marker);
}

function createTileElement(tile) {
  const element = document.createElement("div");
  element.className = `${TILE_CLASS_PREFIX} ${tile.code}`;
  element.dataset.row = tile.row;
  element.dataset.col = tile.col;
  element.setAttribute("data-row", tile.row);
  element.setAttribute("data-col", tile.col);
  element.tileData = tile;
  element.title = `R${tile.row} C${tile.col} · ${tile.code} · ${tile.type}`;
  element.innerHTML = `<span class="code">${tile.code}</span>`;
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    selectTile(tile, element);
  });
  return element;
}

function renderTiles(tiles) {
  tiles.forEach((row) => {
    row.forEach((tile) => {
      map.appendChild(createTileElement(tile));
    });
  });

  buildTileLookup();
}

function createMarkerElement(marker) {
  const element = document.createElement("div");
  element.className = `${MARKER_CLASS_PREFIX} ${marker.code}`;
  element.dataset.code = marker.code;
  element.dataset.row = marker.row;
  element.dataset.col = marker.col;
  element.dataset.rows = marker.rows;
  element.dataset.cols = marker.cols;
  element.style.setProperty("--r", marker.row);
  element.style.setProperty("--c", marker.col);
  element.style.setProperty("--rows", marker.rows);
  element.style.setProperty("--cols", marker.cols);
  element.markerData = marker;

  const sprite = spriteByCode[marker.code];
  const content = sprite
    ? `<img class="sprite-img" src="${sprite}" alt="${marker.type}" draggable="false"><span class="sprite-level">${marker.level}</span>`
    : `<span><span class="lvl">${marker.level}</span>${marker.type}</span>`;

  element.innerHTML = content;
  element.title = `${marker.type} · R${marker.row} C${marker.col} · ${marker.rows}x${marker.cols}`;
  element.addEventListener("mouseenter", () => setMarkerHoverEffect(marker, true));
  element.addEventListener("mouseleave", () => setMarkerHoverEffect(marker, false));
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    selectMarker(marker);
  });
  return element;
}

function createFootprintOverlay(marker) {
  if (marker.rows === 1 && marker.cols === 1) {
    return null;
  }

  const overlay = document.createElement("div");
  overlay.className = "footprint-overlay";
  overlay.style.setProperty("--r", marker.row);
  overlay.style.setProperty("--c", marker.col);
  overlay.style.setProperty("--rows", marker.rows);
  overlay.style.setProperty("--cols", marker.cols);
  overlay.dataset.row = marker.row;
  overlay.dataset.col = marker.col;
  overlay.dataset.rows = marker.rows;
  overlay.dataset.cols = marker.cols;
  overlay.setAttribute("aria-hidden", "true");
  return overlay;
}

function renderMarkers(markers) {
  markers.forEach((marker) => {
    const footprintOverlay = createFootprintOverlay(marker);
    if (footprintOverlay) {
      map.appendChild(footprintOverlay);
    }
    map.appendChild(createMarkerElement(marker));
  });
}

function clearMapWorkspaceContent() {
  if (map) {
    map.innerHTML = "";
    map.className = "map";
    map.removeAttribute("data-topology-type");
  }

  if (colheads) {
    colheads.innerHTML = "";
  }
  if (colheadsBottom) {
    colheadsBottom.innerHTML = "";
  }
  if (rowheads) {
    rowheads.innerHTML = "";
  }
  if (rowheadsRight) {
    rowheadsRight.innerHTML = "";
  }

  tileElementsByPosition.clear();
  tileDataByPosition.clear();
  clearSelection();
}

function renderStrategicNodeNetworkMap(mapData) {
  if (!strategicNodeNetworkProjectionService || typeof strategicNodeNetworkProjectionService.project !== "function") {
    throw new Error("Renderer requires a strategic node network projection service.");
  }
  if (!strategicNodeNetworkSvgRenderer || typeof strategicNodeNetworkSvgRenderer.render !== "function") {
    throw new Error("Renderer requires a strategic node network SVG renderer.");
  }

  const projection = strategicNodeNetworkProjectionService.project(mapData);
  const previewResult = strategicNodeNetworkSvgRenderer.render(projection, {
    selectedNodeId: null,
    theme: createPreviewTheme(),
    assetByTypeCode: createPreviewAssetMap()
  });

  if (map) {
    map.classList.add("map--strategic-node-network");
    map.setAttribute("data-topology-type", "strategic_node_network");
    map.innerHTML = previewResult.markup;
  }

  return previewResult;
}

function renderMap(data) {
  const topologyType = gameRulesEngine && typeof gameRulesEngine.getMapDefinition === "function"
    ? gameRulesEngine.getMapDefinition().topologyType
    : null;

  clearMapWorkspaceContent();

  if (topologyType === "territory_grid") {
    const gridSize = Number(data.gridSize || DEFAULT_GRID_SIZE);
    const tiles = data.tiles || [];
    const markers = data.structures || [];

    currentGridSize = gridSize;

    renderGridHeaders(gridSize);
    renderTiles(tiles);
    markers.forEach((marker) => {
      applyFootprintVisuals(marker);
    });
    renderMarkers(markers);
    applyOwnershipOverlays(markers);
    return;
  }

  if (topologyType === "strategic_node_network") {
    renderStrategicNodeNetworkMap(data);
    return;
  }

  throw new Error(`Renderer does not support topology '${topologyType || "unknown"}'.`);
}

function initializeCamera(data) {
  setCameraState(getDefaultCameraState(data));
}

function ensureTileOwnerIds(data) {
  // Map data is treated as shared immutable fallback data; ownership overrides live in server state service.
  return data;
}

function loadMapData() {
  return fetch(mapDataUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load map data");
      }
      return response.json();
    })
    .then((data) => ensureTileOwnerIds(data));
}

function loadUnionRegistry() {
  return fetch(unionsDataUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load union registry");
      }
      return response.json();
    })
    .then((data) => {
      if (!data || !Array.isArray(data.unions)) {
        throw new Error("Failed to load union registry");
      }

      return data.unions;
    });
}

function loadSeasonServerState() {
  return fetch(seasonServerStateDataUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load Season 1 server state");
      }
      return response.json();
    });
}

function initializeServerStateService(seasonServerState) {
  if (typeof serverStateServiceFactory !== "function") {
    throw new Error("Renderer requires a server state service factory.");
  }

  serverStateService = serverStateServiceFactory(seasonServerState);
}

function createRuntimeId(kind) {
  if (
    typeof kind !== "string"
    || kind.trim() === ""
    || !globalThis.crypto
    || typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error("Renderer requires a runtime ID kind and crypto.randomUUID().");
  }
  return `${kind}-${globalThis.crypto.randomUUID()}`;
}

function initializeDataManagementRuntime() {
  dataManagementRuntime = dataManagementRuntimeFactory({
    modules: dataManagementModules,
    unionRegistryService: appState.unionRegistryService,
    strategicDomainRuntime,
    evidenceDomainRuntime,
    serverStateService,
    gameRulesEngine,
    clock: () => new Date().toISOString(),
    createId: createRuntimeId
  });
  mapOwnershipCoordinator = dataManagementRuntime.mapOwnershipCoordinator;
  selectedMapTargetViewService = dataManagementRuntime.selectedMapTargetViewService;
  localActor = trustedLocalActorFactory("desktop-user");
  appState.dataManagementRuntime = dataManagementRuntime;
}

function createEmptyStrategicState() {
  return {
    relations: [], nativeAssignments: [], activeStatuses: [], combatStrengthObservations: [],
    serverObservations: [], territoryOwnershipRecords: [], structureOwnershipRecords: [],
    targetVerifications: [], confirmedSnapshots: [], confirmedPresenceFacts: [], qualifyingFullMapConfirmations: []
  };
}

async function initializePersistedDataManagementDomains(bundledIdentities) {
  appState.unionRegistryService = createUnionRegistryServiceFactory(bundledIdentities);
  appState.unionRegistry = appState.unionRegistryService.listUnionIdentities();
  strategicDomainRuntime = createStrategicDomainRuntimeFactory({
    modules: strategicDomainModules,
    unionRegistryService: appState.unionRegistryService,
    initialState: createEmptyStrategicState()
  });
  evidenceDomainRuntime = createEvidenceDomainRuntimeFactory({
    modules: evidenceDomainModules,
    initialState: { assets: [], evidenceRecords: [] }
  });
  appState.strategicDomainRuntime = strategicDomainRuntime;
  appState.evidenceDomainRuntime = evidenceDomainRuntime;
}

function initializeApplicationPersistence() {
  applicationAuditRecordService = bootstrapPersistence.createApplicationAuditRecordService({
    initialRecords: [],
    validateAuditRecord: bootstrapPersistence.validateApplicationAuditRecord,
    validateAuditHistory: bootstrapPersistence.validateApplicationAuditHistory,
    createAuditId: createRuntimeId.bind(null, "audit"),
    clock: () => new Date()
  });
  const participants = [
    appState.unionRegistryService,
    strategicDomainRuntime.relationService,
    strategicDomainRuntime.nativeAssignmentService,
    strategicDomainRuntime.activeStatusService,
    strategicDomainRuntime.combatStrengthObservationService,
    strategicDomainRuntime.serverObservationService,
    strategicDomainRuntime.ownershipRecordService,
    strategicDomainRuntime.targetVerificationService,
    strategicDomainRuntime.confirmedSnapshotService,
    strategicDomainRuntime.activityFactHistoryService,
    evidenceDomainRuntime.evidenceAssetService,
    evidenceDomainRuntime.evidenceRecordService,
    serverStateService,
    seasonAdministrationService,
    applicationAuditRecordService
  ];
  const mutationCoordinator = applicationMutationCoordinatorFactory({ participants });
  const coordinator = applicationPersistenceCoordinatorFactory({
    generationStore: persistenceStartup.generationStore,
    mutationCoordinator,
    legacyStateClassifier,
    unionRegistryService: appState.unionRegistryService,
    strategicDomainRuntime,
    evidenceDomainRuntime,
    serverStateService,
    seasonAdministrationService,
    applicationAuditRecordService,
    serializeApplicationAuditRecords: bootstrapPersistence.createApplicationAuditRecordSerializer({ validateAuditHistory: bootstrapPersistence.validateApplicationAuditHistory }).serializeRecords,
    deserializeApplicationAuditEnvelope: bootstrapPersistence.createApplicationAuditRecordSerializer({ validateAuditHistory: bootstrapPersistence.validateApplicationAuditHistory }).deserializeEnvelope,
    serializeUnionRegistry: bootstrapPersistence.serializeUnionRegistry,
    deserializeUnionRegistryEnvelope: bootstrapPersistence.deserializeUnionRegistryEnvelope,
    serializeStrategicDomainRuntime: bootstrapPersistence.serializeStrategicDomainRuntime,
    deserializeStrategicDomainEnvelope: bootstrapPersistence.deserializeStrategicDomainEnvelope,
    serializeEvidenceRuntime: bootstrapPersistence.evidenceStateSerializer.serializeRuntime.bind(bootstrapPersistence.evidenceStateSerializer),
    deserializeEvidenceEnvelope: bootstrapPersistence.evidenceStateSerializer.deserializeEnvelope.bind(bootstrapPersistence.evidenceStateSerializer),
    serializeServerState: bootstrapPersistence.serializeServerState,
    deserializeServerState: bootstrapPersistence.deserializeServerState,
    seasonId: seasonIdentity.seasonId,
    baseMapId: serverStateService.getBaseMapId(),
    createTransactionId: createRuntimeId.bind(null, "transaction"),
    clock: () => new Date(),
    createApplicationPersistenceCoordinator: applicationPersistenceCompositionFactory
  });
  applicationPersistenceFacade = applicationPersistenceFacadeFactory({ coordinator });
  bootstrapPersistence.setApplicationPersistenceFacade(applicationPersistenceFacade);
  return applicationPersistenceFacade.load(persistenceStartup.legacyInput);
}

function initializeMap() {
  return Promise.all([loadMapData(), loadUnionRegistry(), loadSeasonServerState()])
    .then(async ([mapData, bundledIdentities, seasonServerState]) => {
      await initializePersistedDataManagementDomains(bundledIdentities);
      initializeServerStateService(seasonServerState);
      const persistenceResult = await initializeApplicationPersistence();
      if (persistenceResult.status === "recovery_required" || persistenceResult.status === "corrupt") {
        const error = new Error(`Persistence recovery is required (${persistenceResult.reason}).`);
        error.code = "recovery_required";
        throw error;
      }
      await ensureActiveSeasonServers(seasonContext.activated ? seasonContext : null);
      initializeDataManagementRuntime();
      appState.allServers = serverStateService.listServers();
      const activeSeason = seasonAdministrationService.getActiveSeason();
      appState.servers = activeSeason
        ? appState.allServers.filter((server) => activeSeason.serverIds.includes(server.id))
        : [];
      seasonSetupState.selectedServerIds = new Set(
        activeSeason ? activeSeason.serverIds : appState.allServers.map((server) => server.id)
      );
      loadedMapData = mapData;
      initializeOwnershipService();
      initializeSummaryService();
      renderSeasonRuntimeShell(mapData);
      renderWorkspaceNavigation();
      renderMap(mapData);
      const topologyType = gameRulesEngine && typeof gameRulesEngine.getMapDefinition === "function"
        ? gameRulesEngine.getMapDefinition().topologyType
        : null;
      if (topologyType === "territory_grid") {
        initializeCamera(mapData);
      }
      attachWorkspaceShellHandlers();
      attachCameraInputHandlers();
      attachCameraToolbarHandlers();
      attachSelectionPanelHandlers();
      setActiveWorkspace(workspaceHome);
    });
}

function configureRenderer(bootstrapContext) {
  if (!bootstrapContext || typeof bootstrapContext !== "object") {
    throw new Error("Renderer bootstrap context is required.");
  }

  if (!bootstrapContext.gameRulesEngine || typeof bootstrapContext.gameRulesEngine.getSeasonIdentity !== "function") {
    throw new Error("Renderer requires a Game Rules Engine instance.");
  }

  if (!bootstrapContext.applicationConfig || typeof bootstrapContext.applicationConfig !== "object") {
    throw new Error("Renderer requires resolved application configuration.");
  }

  if (typeof bootstrapContext.ownershipServiceFactory !== "function") {
    throw new Error("Renderer requires an ownership service factory.");
  }

  if (typeof bootstrapContext.summaryServiceFactory !== "function") {
    throw new Error("Renderer requires a summary service factory.");
  }

  if (!bootstrapContext.dataManagementModules
      || typeof bootstrapContext.dataManagementModules !== "object"
      || Array.isArray(bootstrapContext.dataManagementModules)) {
    throw new Error("Renderer requires data management modules.");
  }

  if (typeof bootstrapContext.dataManagementRuntimeFactory !== "function") {
    throw new Error("Renderer requires a data management runtime factory.");
  }

  if (typeof bootstrapContext.trustedLocalActorFactory !== "function") {
    throw new Error("Renderer requires a trusted local actor factory.");
  }

  if (typeof bootstrapContext.serverStateServiceFactory !== "function") {
    throw new Error("Renderer requires a server state service factory.");
  }


  if (!bootstrapContext.seasonAdministrationService
      || typeof bootstrapContext.seasonAdministrationService !== "object"
      || typeof bootstrapContext.seasonAdministrationService.listPreparedSeasons !== "function"
      || typeof bootstrapContext.seasonAdministrationService.getPreparedSeason !== "function"
      || typeof bootstrapContext.seasonAdministrationService.getActiveSeason !== "function"
      || typeof bootstrapContext.seasonAdministrationService.listCompletedSeasons !== "function"
      || typeof bootstrapContext.seasonAdministrationService.activateSeason !== "function"
      || typeof bootstrapContext.seasonAdministrationService.updateActiveSeasonServers !== "function"
      || typeof bootstrapContext.seasonAdministrationService.completeActiveSeason !== "function") {
    throw new Error("Renderer requires a Season Administration Service.");
  }

  if (!bootstrapContext.persistenceStartup
      || !bootstrapContext.persistenceStartup.generationStore
      || !bootstrapContext.persistenceStartup.legacyInput
      || !bootstrapContext.persistenceStartup.persistenceBoundary) {
    throw new Error("Renderer requires generation-first application persistence.");
  }

  if (!bootstrapContext.strategicNodeNetworkProjectionService
      || typeof bootstrapContext.strategicNodeNetworkProjectionService !== "object"
      || Array.isArray(bootstrapContext.strategicNodeNetworkProjectionService)
      || typeof bootstrapContext.strategicNodeNetworkProjectionService.project !== "function") {
    throw new Error("Renderer requires a strategic node network projection service.");
  }

  if (!bootstrapContext.strategicNodeNetworkSvgRenderer
      || typeof bootstrapContext.strategicNodeNetworkSvgRenderer !== "object"
      || Array.isArray(bootstrapContext.strategicNodeNetworkSvgRenderer)
      || typeof bootstrapContext.strategicNodeNetworkSvgRenderer.render !== "function") {
    throw new Error("Renderer requires a strategic node network SVG renderer.");
  }

  if (!bootstrapContext.seasonContext || typeof bootstrapContext.seasonContext !== "object") {
    throw new Error("Renderer requires an active season context.");
  }

  gameRulesEngine = bootstrapContext.gameRulesEngine;
  seasonIdentity = gameRulesEngine.getSeasonIdentity();
  seasonMetadata = gameRulesEngine.getSeasonMetadata();
  applicationConfig = bootstrapContext.applicationConfig;
  appMapConfig = applicationConfig.map && typeof applicationConfig.map === "object" ? applicationConfig.map : null;
  appServerConfig = applicationConfig.server && typeof applicationConfig.server === "object" ? applicationConfig.server : null;
  appUnionConfig = applicationConfig.union && typeof applicationConfig.union === "object" ? applicationConfig.union : null;
  appWorkspace = applicationConfig.workspace && typeof applicationConfig.workspace === "object" ? applicationConfig.workspace : null;
  appSummaryConfig = applicationConfig.summary && typeof applicationConfig.summary === "object" ? applicationConfig.summary : null;
  strategicNodeNetworkProjectionService = bootstrapContext.strategicNodeNetworkProjectionService;
  strategicNodeNetworkSvgRenderer = bootstrapContext.strategicNodeNetworkSvgRenderer;
  dataManagementModules = bootstrapContext.dataManagementModules;
  dataManagementRuntimeFactory = bootstrapContext.dataManagementRuntimeFactory;
  trustedLocalActorFactory = bootstrapContext.trustedLocalActorFactory;
  ownershipServiceFactory = bootstrapContext.ownershipServiceFactory;
  summaryServiceFactory = bootstrapContext.summaryServiceFactory;
  serverStateServiceFactory = bootstrapContext.serverStateServiceFactory;
  serverStatePersistenceController = bootstrapContext.serverStatePersistenceController;
  bootstrapPersistence = bootstrapContext;
  persistenceStartup = {
    generationStore: bootstrapContext.generationStore,
    legacyInput: bootstrapContext.legacyInput,
    persistenceBoundary: bootstrapContext.persistenceBoundary
  };
  persistenceBoundary = bootstrapContext.persistenceBoundary;
  createUnionRegistryServiceFactory = bootstrapContext.createUnionRegistryService;
  createStrategicDomainRuntimeFactory = bootstrapContext.createStrategicDomainRuntime;
  createEvidenceDomainRuntimeFactory = bootstrapContext.createEvidenceDomainRuntime;
  strategicDomainModules = bootstrapContext.strategicDomainModules;
  evidenceDomainModules = bootstrapContext.evidenceDomainModules;
  applicationMutationCoordinatorFactory = bootstrapContext.createApplicationMutationCoordinator;
  applicationPersistenceCoordinatorFactory = bootstrapContext.createWarMapApplicationPersistenceCoordinator;
  applicationPersistenceCompositionFactory = bootstrapContext.createApplicationPersistenceCoordinator;
  applicationPersistenceFacadeFactory = bootstrapContext.createApplicationPersistenceFacade;
  legacyStateClassifier = bootstrapContext.legacyStateClassifier;
  seasonAdministrationService = bootstrapContext.seasonAdministrationService;
  seasonContext = bootstrapContext.seasonContext;

  if (!appMapConfig || !appMapConfig.dataUrl) {
    throw new Error("Renderer requires a map data URL from bootstrap.");
  }

  if (!appServerConfig || !appServerConfig.stateDataUrl) {
    throw new Error("Renderer requires a server state URL from bootstrap.");
  }

  if (!appUnionConfig || !appUnionConfig.registryDataUrl) {
    throw new Error("Renderer requires a union registry URL from bootstrap.");
  }

  if (!appWorkspace || !appWorkspace.homeId || !appWorkspace.mapLabel) {
    throw new Error("Renderer requires workspace configuration from bootstrap.");
  }

  if (!appSummaryConfig || !Object.prototype.hasOwnProperty.call(appSummaryConfig, "designatedUnionId")) {
    throw new Error("Renderer requires summary configuration from bootstrap.");
  }

  mapDataUrl = appMapConfig.dataUrl;
  unionsDataUrl = appUnionConfig.registryDataUrl;
  seasonServerStateDataUrl = appServerConfig.stateDataUrl;
  workspaceHome = appWorkspace.homeId;
  mapWorkspaceLabel = appWorkspace.mapLabel;

  appState.gameRulesEngine = gameRulesEngine;
  appState.seasonIdentity = seasonIdentity;
  appState.seasonMetadata = seasonMetadata;
  appState.activeWorkspace = workspaceHome;
}

function initializeMapRenderer(bootstrapContext) {
  if (applicationStarted) {
    return Promise.resolve();
  }

  configureRenderer(bootstrapContext);
  applicationStarted = true;
  return initializeMap().catch((error) => {
    console.error("Unable to load application data", error);
    const errorName = error && typeof error.name === "string" ? error.name : "Error";
    const errorMessage = error && typeof error.message === "string" ? error.message : String(error);
    if (typeof document !== "undefined" && document.body) {
      const startupError = document.createElement("div");
      startupError.className = "app-startup-error";
      startupError.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px 16px;background:#b00020;color:#ffffff;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);";
      startupError.textContent = `Application initialization failed (${errorName}): ${errorMessage}`;
      document.body.prepend(startupError);
    }
  });
}

window.initializeMapRenderer = initializeMapRenderer;
