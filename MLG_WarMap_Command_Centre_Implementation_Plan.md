# MLG WarMap Command Centre Implementation Status

Version context: v0.5.0

This file remains a broad implementation plan with current-status notes.

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

Status: Completed
- Runtime ownership edits are routed through Server State Service.
- Ownership is isolated between server workspaces.
- Shared base-map tile ownerId is fallback-only and shared tile objects are not mutated by normal ownership editing.

### Milestone 7: Persistence and Strategic Workflows

Status: Pending
- Persistence/save
- Real scoring
- History workflows
- Notes workflows
- Objectives workflows
- Search and filters

## Current Priorities

1. Integrate summary-service (or equivalent) into runtime dashboard rendering.
2. Replace placeholders with verified computed values after scoring rules are defined.
3. Implement persistence for server state and ownership history workflows.
