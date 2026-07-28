# Development Roadmap

Version context: v0.5.0

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

Status detail: Partial
- Per-server ownership isolation is not complete in runtime behavior.
- Ownership edits still mutate shared season1-map tile ownerId.

## Phase 3 - Territory Ownership

Status: Partial
- Ownership overlays are implemented
- In-memory tile and structure footprint ownership editing is implemented
- Cross-server ownership leakage remains open

## Phase 4 - Persistence and Real Summaries

Status: Pending
- Persistence/save
- Real scoring integration
- Replace dashboard placeholders with computed values

## Phase 5 - History, Notes, Objectives

Status: Pending
- History timeline/playback
- Notes workflows
- Objectives workflows

## Phase 6 - Search and Filters

Status: Pending
- Search
- Strategic filters
