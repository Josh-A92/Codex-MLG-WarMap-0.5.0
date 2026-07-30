# MLG WarMap

Interactive, data-driven strategic map tooling for X-Clash.

## Current Version

v0.5.0 tag, with additional architecture work on current main

## Current State

Completed:
- 20x20 Season 1 map render from JSON
- Camera controls (zoom, pan, fit, reset, center-selection)
- Tile and structure selection panel
- Ownership overlays from union color + tile owner data
- Territory editing for tiles and structure footprints
- Command Centre workspace and eight server map workspaces (366-373)
- Server dock and Command Centre cards generated from data/season1-servers.json
- Canonical Season 1 startup path via season package, validator, loader, and asynchronous bootstrap
- Per-server ownership isolation in runtime editing
- Fresh unclaimed map behavior at runtime with no legacy seeded ownership defaults
- Server State Service is loaded at runtime and used as the mutable per-server ownership authority
- Automatic local persistence and restoration of per-server territory ownership
- Runtime Summary Service integration for controlled territory, designated-union territory, structures, and season-defined scoring status
- Designated-union selection from canonical season application configuration
- Isolated strategic-domain foundations for union relationships, native status, confirmed snapshots, map-specific activity evaluation, and union matching
- Strategic domain modules loaded in the browser and exposed through bootstrap as a frozen dependency bundle

Pending:
- Verified season scoring and resource-value calculations
- Runtime instantiation plus UI/persistence integration for native-union and active-union records
- Combat-strength, completeness, evidence, and observation workflows
- History playback
- Descriptive server notes integration
- Search and filters

## Important Implementation Notes

- src/services/summary-service.js is loaded through the runtime bootstrap path and calculates Command Centre card data from the active map, rules, union registry, and authoritative Server State Service.
- Command Centre territory and structure values are calculated at runtime and refresh after ownership edits.
- Per-server ownership is saved automatically through the persistence controller and restored before initial map and summary rendering.
- Scoring remains unconfigured in the canonical season package.
- The repository implementation is authoritative over historical planning text.

WarMap behavior remains descriptive, not prescriptive.

## Architectural Direction

Season 1 remains a shared-base-map model:
- Base map: data/season1-map.json
- Per-server state: data/season1-servers.json

Current behavior is isolated per-server ownership/state with no cross-server leakage during runtime editing.

Ownership fallback behavior:
- Base-map tile ownerId is used only when no server-specific ownership override exists.

Current limits:
- Version 1 persistence stores per-server territory ownership only.
- Scoring values remain unavailable until verified season scoring rules and calculations are configured.
