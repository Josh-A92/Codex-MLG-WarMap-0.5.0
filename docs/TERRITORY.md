# Territory and Ownership Notes

Version context: v0.5.0

## Status

Completed:
- Ownership overlays are implemented
- Tile owner editing in selection panel is implemented (in-memory)
- Structure footprint owner editing is implemented (in-memory)
- Ownership labels/colors resolve from union registry

## Ownership Model

Intended model:
- Shared base map for geometry and structure footprints
- Per-server ownership state stored separately in season1-servers.json

Current runtime model:
- Ownership edits mutate tile ownerId on shared season1-map runtime tile objects

Known issue:
- Ownership edits leak between server workspaces because per-server ownership overrides are not the active edit target.

## Structure Ownership

- Structure ownership is derived from footprint tile ownership.
- Uniform footprints resolve as owned.
- Mixed footprints resolve as contested/partial in selection editing state.

## Pending Territory Work

- Per-server ownership isolation during editing
- Persistence of edits
- History timeline integration
