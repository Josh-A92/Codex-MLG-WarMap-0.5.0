# MLG WarMap

Interactive, data-driven strategic map tooling for X-Clash.

## Current Version

v0.5.0

## Current State

Completed:
- 20x20 Season 1 map render from JSON
- Camera controls (zoom, pan, fit, reset, center-selection)
- Tile and structure selection panel
- Ownership overlays from union color + tile owner data
- In-memory territory editing for tile and structure footprints
- Command Centre workspace and eight server map workspaces (366-373)
- Server dock and Command Centre cards generated from data/season1-servers.json

Partial:
- Shared base map plus per-server state architecture is in place
- Per-server ownership schema exists in data/season1-servers.json
- Runtime ownership editing still mutates shared season1-map tile ownerId, so ownership changes leak across servers

Pending:
- Persistence/save
- Real scoring and computed dashboard values
- History playback
- Notes and objectives workflows
- Search and filters

## Important Implementation Notes

- src/services/summary-service.js exists but is not loaded in index.html and is not integrated into runtime workflows.
- Command Centre dashboard values are currently static placeholders.
- The repository implementation is authoritative over historical planning text.

## Architectural Direction

Season 1 remains a shared-base-map model:
- Base map: data/season1-map.json
- Per-server state: data/season1-servers.json

Target behavior is isolated per-server ownership/state with no cross-server leakage.

## Project Objectives

- Preserve map accuracy and deterministic rendering
- Keep behavior data-driven
- Support multi-server strategic workflows from one verified base map
- Incrementally add persistence, scoring, history, notes/objectives, and search/filtering
