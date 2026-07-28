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
- Runtime ownership remains session-only until persistence is implemented

## Phase 4 - Persistence and Real Summaries

Status: Pending
- Persistence/save
- Real scoring integration
- Replace dashboard placeholders with computed values

## Phase 5 - History and Descriptive Notes

Status: Pending
- History timeline/playback
- Descriptive server notes workflows

## Phase 6 - Search and Filters

Status: Pending
- Search
- Strategic filters
