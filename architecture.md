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
- src/app/application-bootstrap.js asynchronously loads the season package, passes only rulesDefinition to the Game Rules Engine, and composes the renderer, state, persistence, and summary dependencies.

3. Rendering and interaction
- src/map-renderer.js loads data, renders the 20x20 map, handles camera controls, workspace switching, selection, ownership edits, and Command Centre presentation.

4. Ownership logic
- src/services/ownership-service.js provides tile/structure ownership lookup, label/color resolution, and owner mutation helpers.
- src/services/server-state-service.js is the runtime authority for mutable per-server tile ownership state.

5. Persistence
- src/services/persistence-state-serializer.js validates and serializes the version 1 ownership envelope.
- src/services/persistence-service.js coordinates atomic save and restoration against the Server State Service.
- src/app/server-state-persistence-controller.js restores ownership during startup and queues runtime saves.
- src/services/electron-file-storage-adapter.js and src/main/persistence-file-store.js provide the Electron storage boundary.

6. Summaries
- src/services/summary-service.js calculates controlled territory, designated-union territory, structure totals, and season-defined scoring status.
- Summary calculations consume authoritative server ownership and do not own or persist mutable state.

7. Strategic domain logic
- Canonical union identity, union/server/season relationships, and native/active status histories have isolated validators and services.
- Confirmed ownership, target verification, and immutable server snapshots feed the snapshot activity fact resolver.
- The Activity Fact History Service retains map-specific presence and qualifying-full-map facts.
- The Active-Status Update Coordinator evaluates new snapshot facts, appends immutable status replacements, and refreshes rebuildable relation cache fields.
- The Active-Status Projection Service recalculates verification health at read time without mutating factual status.
- The Union/Server/Season Intelligence View Service composes identity, relationship, native assignment, and read-time activity into a UI-neutral view.
- The Server Intelligence View Service composes per-union intelligence and
  confirmed factual server observations for a future Server Overview.
- Combat-strength and server-observation histories have canonical validators,
  services, and season-scoped strategic persistence.
- Evidence assets and reviewable EvidenceRecords compose through a separate
  global Evidence Domain Runtime with a versioned storage-neutral envelope.
- The Pending Review Queue provides a read-only normalized view across proposed
  domain records without becoming an authority.
- The Union Matching Service resolves canonical IDs, tags, display names, and aliases deterministically and surfaces ambiguity without creating or merging identities.
- Strategic modules are browser-loaded and exposed through application bootstrap as one frozen module registry.
- Application bootstrap restores the canonical strategic, evidence, union
  registry, and activation state before renderer initialization.
- The renderer composes the authorized Data Management Runtime over those
  restored services. Operator screens and Command Centre/Server Overview
  consumption remain integration work.

8. Data Management application boundary
- The Authorization Policy Service enforces capability grants with optional
  season and server scopes without depending on role names or an authentication
  provider.
- Union Registry, Server Intelligence, Evidence, and Proposal Review management
  services expose explicit authorized operations instead of storage mutation.
- The Data Management Query Service returns safe, screen-ready global-registry
  and per-server management projections.
- The Data Management Runtime composes those operations over the existing
  Union Registry, Strategic Domain Runtime, and Evidence Domain Runtime.
- The approved Data Management, responsive map, and prepared Season Setup
  interfaces are defined in docs/User-Interface-Design-Specification.md.
- Application bootstrap exposes the Data Management Runtime factory, and the
  renderer instantiates the runtime after restored domain state is available.
- The Union Registration Coordinator atomically composes global identity,
  known-server association, and confirmed native assignment.
- The Map Ownership Coordinator creates canonical ownership and verification
  history, then refreshes the current server-state projection. The renderer now
  routes territory and structure edits through this coordinator.
- The Selected Map Target View Service supplies current ownership, confirmation
  time, ownership-change time, union presentation identity, and season-defined
  values without making the renderer interpret history collections.
- The Season Administration Service lists prepared packages, enforces
  authorization and confirmation, persists one activation, and restores the
  active season context at startup.
- The remaining Data Management application work is the approved operator UI,
  upload-byte adapter integration, and broader intelligence presentation.

9. Data
- data/season1-map.json stores shared map tiles and structures.
- data/unions.json stores union metadata and colors.
- data/season1-servers.json stores Season 1 server workspace records.

## Workspace Model

Implemented:
- command-centre workspace
- server-map workspace
- prepared season-setup workspace
- eight servers: 366 to 373 from data/season1-servers.json

Implemented architecture:
- Shared base map remains authoritative.
- Per-server strategic state remains isolated in server records.

Verified runtime behavior:
- Ownership edits are written to the active server ownership store.
- Ownership edits do not leak between server workspaces.
- Shared base-map runtime tile objects are not mutated by ownership editing.
- Base-map tile ownerId is used only as fallback when no server-specific ownership value exists.
- Structure ownership editing applies through the existing footprint tile flow across all tiles in the selected structure footprint.
- Ownership changes are saved automatically and restored before workspace navigation, map rendering, and summary calculation.

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
- Territory, designated-union, and structure metrics are calculated from authoritative runtime state.
- Cards refresh after completed ownership edits and reflect restored ownership on startup.
- Resource/scoring presentation uses the active season definition without inventing values.
- Scoring remains unconfigured in the canonical package.

## Summary Service Status

- src/services/summary-service.js is loaded by index.html and injected through application bootstrap.
- It resolves effective ownership through the Server State Service with base-map ownerId fallback.
- It remains a pure calculation boundary and returns renderer-ready plain data.

## Persistence and Analytics Status

Implemented:
- Automatic local save and startup restoration of per-server territory ownership
- Versioned persistence serialization and validation
- Computed Command Centre territory and structure summaries

Not implemented:
- Real scoring pipeline
- History playback
- Descriptive server-note UI integration (the canonical Server Observation
  validator, service, persistence collection, and read-only Server Intelligence
  View now exist)
- Operator UI for the implemented authorized native-union, combat-strength,
  server-observation, evidence, review, and union-registry operations
- Screenshot byte storage and upload adapter integration
- Command Centre and Server Overview consumption of canonical intelligence and
  completeness projections
- Search and filters

Design note:
- docs/Server-State-Data-Model.md defines the target snapshot/evidence model.
  Ownership editing and selected-target reads are integrated into the current
  renderer. Snapshot/activity foundations are persisted and available through
  the Data Management Runtime, but their full operator and intelligence views
  are not yet implemented.
