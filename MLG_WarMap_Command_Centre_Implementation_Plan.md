# MLG WarMap Command Centre Implementation Status

Version context: v0.5.0

This file now tracks delivery status instead of future-only planning language.

## Milestone Status

### Milestone 1: Documentation Direction

Status: Completed
- Command Centre and eight server workspaces are documented as active implementation.
- Shared-base-map plus per-server-state architecture is documented as intended model.

### Milestone 2: Workspace Navigation Shell

Status: Completed
- Command Centre loads as default workspace.
- Server dock supports server workspace switching.

### Milestone 3: Command Centre Cards

Status: Completed
- One card per server is rendered from season1-servers data.
- Card click and Open Map actions route to server workspaces.

Status detail: Partial
- Card metrics are placeholders, not computed strategic values.

### Milestone 4: Server Data Model Foundation

Status: Completed
- data/season1-servers.json exists with eight server records.
- Per-server fields for ownership, notes, objectives, history, and metadata exist.

### Milestone 5: Strategic Summary Calculations

Status: Partial
- src/services/summary-service.js exists as a service file.
- Service is not loaded or integrated in runtime.
- Dashboard values remain placeholders.

### Milestone 6: Per-Server Ownership Isolation

Status: Partial
- Architecture and schema support per-server ownership.
- Runtime edits currently mutate shared season1-map tile ownerId.
- Ownership leaks between servers and must be corrected.

### Milestone 7: Persistence and Strategic Workflows

Status: Pending
- Persistence/save
- Real scoring
- History workflows
- Notes workflows
- Objectives workflows
- Search and filters

## Current Priorities

1. Route territory editing to per-server ownership state instead of shared base map tiles.
2. Integrate summary-service (or equivalent) into runtime dashboard rendering.
3. Replace placeholders with verified computed values after scoring rules are defined.
