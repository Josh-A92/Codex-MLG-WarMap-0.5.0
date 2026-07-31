# Development Roadmap

Version context: current main following v0.5.0

## Phase 0 - Foundation

Status: Completed
- Project structure and baseline documentation
- Data-driven renderer foundation

## Phase 1 - Interactive Map

Status: Completed
- Tile and structure selection
- Selection panel and hover behavior
- Multi-tile footprint handling

## Phase 2 - Camera

Status: Completed
- Zoom, pan, fit, reset, center-selection controls
- Device-neutral interaction support

## Phase 2.5 - Command Centre and Server Workspaces

Status: Completed
- Command Centre default workspace
- Eight Season 1 server workspaces from data/season1-servers.json
- Data-driven server dock and dashboard cards
- Shared-base-map plus per-server-state architecture documented and represented in schema

## Phase 3 - Territory Ownership

Status: Completed
- Ownership overlays are implemented
- In-memory tile and structure footprint ownership editing is implemented
- Server State Service is integrated as the runtime ownership authority
- Application Bootstrap injects the Server State Service factory into renderer startup context
- Renderer ownership reads and writes route through the Server State Service
- Runtime ownership edits are isolated to the active server workspace
- Shared base-map runtime objects are not mutated by ownership editing
- Base-map tile ownerId is fallback-only when no server-specific ownership value exists
- Ownership changes are saved automatically and restored on startup

## Phase 4 - Persistence and Real Summaries

Status: Partial

Completed:
- Version 1 persistence contract for per-server territory ownership
- Electron local-storage boundary
- Automatic startup restoration and queued save behavior
- Summary Service integration
- Computed controlled-territory, designated-union territory, and structure values on Command Centre cards
- Season-defined unconfigured scoring display

Pending:
- Verified scoring and resource-value calculations
- Operator input and startup persistence integration for native-union,
  active-union, combat-strength, server-observation, and evidence records
- Command Centre and Server Overview integration of canonical intelligence,
  freshness, completeness, and pending-review projections
- User-facing Data Management workspace design and renderer integration

Domain foundations completed:
- Native and active union histories, activity evaluation, and read-time projection
- Combat-strength and factual server-observation histories
- Canonical ownership, verification, snapshots, and map freshness projections
- Evidence asset/record runtime and storage-neutral persistence
- Server Intelligence and Pending Review read models
- Capability-based authorization with season/server scopes
- Storage-neutral Union Registry, Server Intelligence, Evidence, and Proposal
  Review management operations
- Screen-ready Union Registry and per-server Data Management query projections

## Phase 5 - History and Descriptive Notes

Status: Partial

Completed domain foundations:
- Chronological confirmed-snapshot timeline with explicit previous-snapshot
  baselines and factual territory/structure/union change sets
- Canonical descriptive Server Observation history and read model

Pending:
- History playback UI
- Descriptive server-observation input and review UI

## Phase 6 - Search and Filters

Status: Pending
- Search
- Strategic filters
