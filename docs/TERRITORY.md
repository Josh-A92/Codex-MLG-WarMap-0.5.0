# Territory and Ownership Notes

Version context: v0.5.0

## Status

Completed:
- Ownership overlays are implemented
- Tile owner editing in selection panel is implemented (in-memory)
- Structure footprint owner editing is implemented (in-memory)
- Ownership labels/colors resolve from union registry

## Ownership Model

Current runtime model:
- Shared base map for geometry and structure footprints
- Per-server ownership state stored separately in season1-servers.json and managed by Server State Service at runtime

- Renderer ownership reads and writes route through Server State Service
- Shared base-map tile ownerId is fallback-only when no server-specific ownership value exists
- Ownership edits do not leak between server workspaces
- Shared base-map runtime tile objects are not mutated by normal ownership editing

Current limitations:
- State remains in memory and is lost when the application closes

## Structure Ownership

- Structure ownership is derived from footprint tile ownership.
- Logical-structure ownership records are not a separate runtime authority in current implementation.
- Uniform footprints resolve as owned.
- Mixed footprints resolve as contested/partial in selection editing state.

## Pending Territory Work

- Persistence of edits
- History timeline integration
