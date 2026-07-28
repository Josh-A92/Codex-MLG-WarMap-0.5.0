# MLG WarMap Architecture

## Scope

This document reflects the repository state at v0.5.0.

## Runtime Layers

1. Shell and workspace UI
- index.html defines the workspace shell, Command Centre view, map workspace, server dock container, and selection panel.

2. Rendering and interaction
- src/map-renderer.js loads data, renders the 20x20 map, handles camera controls, workspace switching, selection, and in-memory ownership edits.

3. Ownership logic
- src/services/ownership-service.js provides tile/structure ownership lookup, label/color resolution, and owner mutation helpers.

4. Data
- data/season1-map.json stores shared map tiles and structures.
- data/unions.json stores union metadata and colors.
- data/season1-servers.json stores Season 1 server workspace records.

## Workspace Model

Implemented:
- command-centre workspace
- server-map workspace
- eight servers: 366 to 373 from data/season1-servers.json

Intended architecture:
- Shared base map remains authoritative.
- Per-server strategic state remains isolated in server records.

Current gap:
- Ownership edits currently update base tile ownerId in season1-map runtime objects.
- server.ownership records are present in schema but not used for isolation during editing.
- Result: ownership leaks between servers.

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

## Summary Service Status

- src/services/summary-service.js exists.
- It is not loaded by index.html and is not integrated into map-renderer.js.
- Runtime summaries therefore remain placeholder-only.

## Persistence and Analytics Status

Not implemented:
- Persistence/save layer
- Real scoring pipeline
- History playback
- Notes and objectives workflows
- Search and filters
