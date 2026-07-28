## v0.1.0
- Created project structure
- Added README
- Added AI development rules
## v0.1.1
- Verified Excel blueprint
- Finalised Ice Mist terrain palette
- Approved Sprite Pack v3 assets
- Created project documentation
## v0.1.2
- Refactored project structure
- Extracted CSS into src/styles.css
- Extracted renderer into src/map-renderer.js
- Reduced index.html to application shell
- Preserved existing functionality
## v0.2.0
- Moved embedded map data into data/season1-map.json
- Updated renderer to load map data from JSON
- Preserved existing map layout and visuals
## v0.2.1
- Added a tile selection engine that stores the clicked tile object in application state
- Added a visible single-tile highlight that moves when a different tile is clicked
## v0.2.2
- Added a selection information panel that shows tile details when a tile is selected
- Added an empty-state message for when no tile is selected
## v0.2.3
- Added a subtle hover highlight for map tiles without changing the selected tile behaviour
## v0.2.4
- Completed Phase 1 Interactive Map milestones for selection, selection details, and hover feedback
- Verified the map remains data-driven and continues to render 400 tiles with 80 marker structures
## v0.2.5
- Fixed marker interaction so sprites no longer block tile hover or selection across the full tile area
## v0.2.6
- Fixed structure selection so multi-tile markers such as Town, Metropolis, and Royal City highlight their full footprint
## v0.2.7
- Refined multi-tile selection styling so structure footprints display as one unified selection outline rather than separate tile borders
## v0.2.8
- Refined passive multi-tile structure background styling so large footprints read as one merged area while preserving the existing 20x20 grid, data model, and selection behavior
## v0.2.9
- Refined large structure footprints to appear as one user-facing tile by hiding internal seams and labels, showing one unified background and border, and preserving hover and selection behavior
## v0.2.10
- Fixed large-structure hover so only the unified footprint overlay shows hover and selection feedback, while internal footprint tiles no longer display individual tile highlights
## v0.2.11
- Updated project documentation to reflect the completed Phase 1 Interactive Map work and the upcoming Phase 2 Camera milestone
- Added the camera design note in docs/CAMERA.md covering input-independent, device-neutral camera behaviour and the 20x20 internal-grid visual model
## v0.2.12
- Added the internal camera state foundation with a single transformed camera surface, Royal City based default centering, and data-driven zoom bounds
- Kept selection, hover, and structure footprint behaviour unchanged while preparing for later camera controls
## v0.2.13
- Added continuous mouse wheel zoom and pinch zoom to the camera viewport, preserving cursor-centered zoom and existing selection and hover behaviour
## v0.2.14
- Tightened the camera minimum zoom so zooming out stops at a more practical view and the map remains the clear focus
## v0.2.15
- Retuned the camera minimum zoom to fit the full 20x20 map more neatly with only a small surrounding margin
## v0.2.16
- Added desktop mouse camera panning on empty map space with a drag threshold, while preserving existing click selection, zoom behavior, and instant stop on mouse release
## v0.2.17
- Fixed desktop pan so left-drag can start from tiles, markers, overlays, or empty map space, suppressing click selection after thresholded drag and preventing text/image drag artifacts
## v0.2.18
- Added touch camera pan with single-finger drag threshold, immediate stop on touch end, tap-to-select preservation, and coexistence with existing pinch zoom behavior
## v0.2.19
- Added adaptive camera pan constraints with approximately one-tile overscroll at each map edge, scaling with zoom and viewport size so the map cannot be dragged off-screen
## v0.2.20
- Added a floating camera toolbar foundation with placeholder icons and wired actions for zoom in/out, fit map, reset view, and centre on selection
## v0.2.21
- Added the Phase 3 territory design note in docs/TERRITORY.md defining ownership source-of-truth, structure ownership display rules, union color storage, overlay rendering guidance, and future compatibility for history/editing/reports/multi-kingdom support
## v0.2.22
- Updated docs/TERRITORY.md with a union registry model where tiles store ownership by union id and overlays, legends, and reports resolve display data from a centralized registry
## v0.2.23
- Added data/unions.json with Moonlight Guillotine as the first union registry entry and wired startup loading into application state for future ownership use
## v0.2.24
- Added ownerId to all logical tiles in data/season1-map.json (default null) and updated selection owner labels to resolve from the loaded union registry while preserving existing visuals and interactions
## v0.2.25
- Added src/services/ownership-service.js as a central ownership API for tile and structure owner resolution, and updated renderer owner labeling to consume the service
## v0.2.26
- Seeded a small Royal City-area tile ownership cluster with ownerId union-0001 in data/season1-map.json for Phase 3 ownership testing while keeping most tiles unassigned
## v0.2.27
- Added subtle ownership overlay rendering from tile ownerId and union colors, including unified large-structure footprint ownership tinting for Royal City while preserving existing camera, selection, and interaction behavior
## v0.2.28
- Added Phase 3.6 in-memory single-tile territory editing in the selection panel with a union-backed Owner dropdown that immediately updates tile ownerId, ownership overlays, and displayed owner label while keeping structure selections read-only
## v0.2.29
- Tuned ownership visuals for broader pastel territory readability by updating MLG to a clearer sky-blue and expanding data/unions.json with additional distinct inactive union entries for future testing while preserving stable union ids
- Increased tile and large-footprint ownership overlay strength to improve visibility while keeping sprite/label readability and maintaining stronger hover/selection emphasis
## v0.2.30
- Increased Phase 3.7 ownership overlay visibility to a stronger pastel intensity range so owned territory is identifiable at a glance on Ice Mist while preserving label/sprite readability
- Added subtle owned tile and footprint edge/glow tinting to improve territory legibility without overriding stronger hover and selection states
## v0.2.31
- Tuned owned tiles from subtle tint toward clear pastel territory fill by raising ownership colour strength and reducing Ice Mist diagonal texture visibility inside owned cells
- Increased large owned footprint fill intensity so owned multi-tile structures read as coherent pastel territory blocks while keeping selection and hover states visually dominant
## v0.2.32
- Extended territory editing to structure selections by showing the Owner dropdown for markers and applying ownership changes across every tile in the selected structure footprint
- Kept structure ownership fully derived from footprint tile ownerIds through the ownership service (including mixed/partial dropdown state handling) without storing ownerId on structure objects