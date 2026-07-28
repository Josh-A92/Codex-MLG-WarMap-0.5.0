const mapDataUrl = "data/season1-map.json";
const unionsDataUrl = "data/unions.json";

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
const colheads = document.getElementById("colheads");
const colheadsBottom = document.getElementById("colheadsBottom");
const rowheads = document.getElementById("rowheads");
const rowheadsRight = document.getElementById("rowheadsRight");
const selectionPanel = document.getElementById("selection-panel");

const selectionState = {
  selectedItem: null,
  selectedElements: []
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
const appState = {
  unionRegistry: [],
  ownershipService: null
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

function initializeOwnershipService() {
  if (typeof window.createOwnershipService !== "function") {
    return;
  }

  ownershipService = window.createOwnershipService({
    getUnionRegistry: () => appState.unionRegistry,
    getTileByPosition: getTileDataAt
  });

  appState.ownershipService = ownershipService;
}

function getStructureOwnerLabel(structure) {
  if (!ownershipService) {
    return "Unassigned";
  }

  const result = ownershipService.getStructureOwner(structure);

  if (result.state === "owned") {
    const union = ownershipService.getUnionById(result.ownerId);
    return union ? union.shortName || union.displayName || result.ownerId : result.ownerId;
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
  option.value = union.id;
  option.textContent = union.shortName || union.displayName || union.id;
  option.selected = union.id === selectedOwnerId;
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
    if (!union || !union.id) {
      return;
    }

    ownerSelect.appendChild(buildOwnerOption(union, editorState.selectedOwnerId));
  });

  editorRow.appendChild(ownerLabel);
  editorRow.appendChild(ownerSelect);
  territorySection.appendChild(editorRow);
  selectionPanel.appendChild(territorySection);
}

function applyStructureFootprintOwner(structure, ownerId) {
  if (!ownershipService || !structure) {
    return;
  }

  const rows = Number(structure.rows || 1);
  const cols = Number(structure.cols || 1);
  const startRow = Number(structure.row);
  const startCol = Number(structure.col);

  for (let row = startRow; row < startRow + rows; row += 1) {
    for (let col = startCol; col < startCol + cols; col += 1) {
      const tile = getTileDataAt(row, col);
      ownershipService.setTileOwner(tile, ownerId);
    }
  }
}

function handleSelectionPanelChange(event) {
  const ownerSelect = event.target.closest("[data-owner-select='true']");

  if (!ownerSelect || !ownershipService) {
    return;
  }

  const selectedItem = selectionState.selectedItem;
  const isStructure = isStructureSelection(selectedItem);

  if (!selectedItem) {
    return;
  }

  const ownerId = ownerSelect.value || null;

  if (isStructure) {
    applyStructureFootprintOwner(selectedItem, ownerId);
  } else {
    ownershipService.setTileOwner(selectedItem, ownerId);
  }

  applyOwnershipOverlays((loadedMapData && loadedMapData.structures) || []);
  renderSelectionPanel(selectedItem);
}

function attachSelectionPanelHandlers() {
  if (!selectionPanel) {
    return;
  }

  selectionPanel.addEventListener("change", handleSelectionPanelChange);
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
  const structureValue = tile.code && tile.type ? `${tile.code} · ${tile.type}` : tile.code || "None";
  const isStructure = isStructureSelection(tile);
  const ownerValue = ownershipService
    ? (isStructure ? getStructureOwnerLabel(tile) : ownershipService.getTileOwnerLabel(tile))
    : "Unassigned";

  selectionPanel.innerHTML = `
    <h2>Tile Details</h2>
    <div class="selection-summary">
      <div class="selection-title">${tile.code || "Unknown"} · ${terrainValue}</div>
      <div class="selection-meta">
        <div class="selection-row"><span class="selection-label">Coordinate</span><span>Row ${tile.row}, Col ${tile.col}</span></div>
        <div class="selection-row"><span class="selection-label">Terrain</span><span>${terrainValue}</span></div>
        <div class="selection-row"><span class="selection-label">Structure</span><span>${structureValue}</span></div>
        <div class="selection-row"><span class="selection-label">Owner</span><span>${ownerValue}</span></div>
      </div>
      <div class="selection-secondary">
        <div class="selection-row selection-row--subtle"><span class="selection-label">Code</span><span>${tile.code || "Unknown"}</span></div>
        <div class="selection-row selection-row--subtle"><span class="selection-label">Row</span><span>${tile.row}</span></div>
        <div class="selection-row selection-row--subtle"><span class="selection-label">Column</span><span>${tile.col}</span></div>
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
  });
}

function clearStructureOwnershipOverlays() {
  map.querySelectorAll(".footprint-overlay.ownership-owned").forEach((overlayElement) => {
    overlayElement.classList.remove("ownership-owned");
    overlayElement.style.removeProperty("--ownership-color");
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

    if (!ownerColor) {
      return;
    }

    tileElement.classList.add("ownership-owned");
    tileElement.style.setProperty("--ownership-color", ownerColor);
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
    });

    const owner = ownershipService.getStructureOwner(marker);
    if (owner.state !== "owned") {
      return;
    }

    const union = ownershipService.getUnionById(owner.ownerId);
    const ownerColor = union && union.color ? union.color : null;
    if (!ownerColor) {
      return;
    }

    const overlayElement = getFootprintOverlay(marker);
    if (!overlayElement) {
      return;
    }

    overlayElement.classList.add("ownership-owned");
    overlayElement.style.setProperty("--ownership-color", ownerColor);
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

function renderMap(data) {
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
}

function initializeCamera(data) {
  setCameraState(getDefaultCameraState(data));
}

function ensureTileOwnerIds(data) {
  if (!data || !Array.isArray(data.tiles)) {
    return data;
  }

  data.tiles.forEach((row) => {
    if (!Array.isArray(row)) {
      return;
    }

    row.forEach((tile) => {
      if (!tile || typeof tile !== "object") {
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(tile, "ownerId")) {
        tile.ownerId = null;
      }
    });
  });

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
      const unions = Array.isArray(data.unions) ? data.unions : [];
      appState.unionRegistry = unions;
      return unions;
    });
}

function initializeMap() {
  Promise.all([loadMapData(), loadUnionRegistry()])
    .then(([mapData]) => {
      loadedMapData = mapData;
      initializeOwnershipService();
      renderMap(mapData);
      initializeCamera(mapData);
      attachCameraInputHandlers();
      attachCameraToolbarHandlers();
      attachSelectionPanelHandlers();
    })
    .catch((error) => {
      console.error("Unable to load application data", error);
    });
}

initializeMap();
