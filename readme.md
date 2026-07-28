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
- In-memory territory editing for tile and structure footprints
- Command Centre workspace and eight server map workspaces (366-373)
- Server dock and Command Centre cards generated from data/season1-servers.json
- Canonical Season 1 startup path via season package, validator, loader, and asynchronous bootstrap
- Per-server ownership isolation in runtime editing
- Fresh unclaimed map behavior at runtime with no legacy seeded ownership defaults
- Server State Service is loaded at runtime and used as the mutable per-server ownership authority

Pending:
- Persistence/save
- Real scoring and computed dashboard values
- History playback
- Descriptive server notes integration
- Search and filters

## Important Implementation Notes

- src/services/summary-service.js exists but is not loaded in index.html and is not integrated into runtime workflows.
- Command Centre dashboard values are currently static placeholders.
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
- State is runtime memory only and is lost when the application closes.
