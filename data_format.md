# Map and Server Data Format

Version context: v0.5.0

## Data Files

- data/season1-map.json: shared Season 1 base map
- data/unions.json: union registry
- data/season1-servers.json: per-server workspace records

## Shared Base Map

season1-map.json provides:
- grid size and tile objects
- structure objects and footprints
- tile ownerId fields used as fallback ownership values when no server override exists

## Union Registry

unions.json provides:
- union id
- display metadata
- ownership color

Renderer behavior:
- owner labels and overlay colors resolve via union id lookups.

## Season 1 Server Workspace Schema

season1-servers.json provides eight records:
- server-366 to server-373

Per-server fields currently present:
- id
- label
- baseMapId
- activeUnionId
- ownership
- notes
- objectives
- history
- lastUpdated

This schema preserves the intended shared-base-map plus per-server-state architecture.

## Current Runtime Ownership Flow

Implemented runtime:
- Server State Service reads and writes per-server ownership through server.ownership.
- Renderer ownership reads and writes flow through service boundaries.
- Ownership remains isolated per server workspace.
- Shared base-map tile objects are not mutated during normal ownership editing.

Fallback behavior:
- Base-map tile ownerId is read only as a fallback value when a server-specific ownership value is missing.

Current limits:
- Ownership state is in-memory only and is lost when the application closes.

## Dashboard Summary Data

Current state:
- Command Centre summary fields are placeholders.
- src/services/summary-service.js exists but is not loaded/integrated.

Not implemented:
- Real scoring calculations
- Persistent summary snapshots
