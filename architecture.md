# MLG WarMap Architecture

## Scope

This document reflects current main after v0.5.0.

## Runtime Layers

1. Shell and workspace UI
- index.html defines the workspace shell, Command Centre view, map workspace, server dock container, and selection panel.

2. Season startup and validation
- src/seasons/season1-package.js is the canonical Season 1 package definition.
- src/services/season-package-validator.js validates package shape and references.
- src/services/season-loader.js resolves and loads validated season packages.
- src/app/application-bootstrap.js asynchronously loads the season package and passes only rulesDefinition to the Game Rules Engine.

3. Rendering and interaction
- src/map-renderer.js loads data, renders the 20x20 map, handles camera controls, workspace switching, selection, and in-memory ownership edits.

4. Ownership logic
- src/services/ownership-service.js provides tile/structure ownership lookup, label/color resolution, and owner mutation helpers.

5. Data
- data/season1-map.json stores shared map tiles and structures.
- data/unions.json stores union metadata and colors.
- data/season1-servers.json stores Season 1 server workspace records.

## Workspace Model

Implemented:
- command-centre workspace
- server-map workspace
- eight servers: 366 to 373 from data/season1-servers.json

Implemented architecture:
- Shared base map remains authoritative.
- Per-server strategic state remains isolated in server records.

Verified runtime behavior:
- Ownership edits are written to the active server ownership store.
- Ownership edits do not leak between server workspaces.
- Shared base-map runtime tile objects are not mutated by ownership editing.
- Maps start unclaimed unless a server ownership override is explicitly set.
- Persistence is not implemented, so ownership edits remain session-only.

## Camera and Selection

Implemented:
- Zoom in/out, wheel zoom, pinch zoom
- Pan with drag input
- Fit map, reset view, center on selection toolbar actions
- Tile and structure selection with detail panel updates

## Command Centre and Dashboard

Implemented:
- Command Centre default workspace on load
- Data-driven server dock buttons
- Data-driven Command Centre cards
- Open Map actions and card click navigation

Current behavior:
- Dashboard metrics are static placeholders.
- No real scoring calculations are wired into cards.
- Scoring remains unconfigured in the canonical package.

## Summary Service Status

- src/services/summary-service.js exists.
- It is not loaded by index.html and is not integrated into map-renderer.js.
- Runtime summaries therefore remain placeholder-only.

## Persistence and Analytics Status

Not implemented:
- Persistence/save layer
- Real scoring pipeline
- History playback
- Descriptive server notes integration
- Search and filters
