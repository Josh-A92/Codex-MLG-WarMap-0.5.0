# Testing Checklist

Version context: current main following v0.5.0

Legend:
- Completed: behavior exists and should pass regression checks
- Partial: behavior exists with known defect or placeholder state
- Pending: behavior not implemented

## Core Map and Interaction

Completed:
- Map and data files load without console errors
- Camera controls work (zoom, pan, fit, reset, center-selection)
- Tile and structure selection work
- Ownership overlays render from tile ownership + union colors
- Territory owner edits update overlays and authoritative server state

## Workspaces

Completed:
- Command Centre is default workspace on load
- Eight server workspaces are available
- Server dock is data-driven from data/season1-servers.json
- Command Centre cards are data-driven from data/season1-servers.json
- Server dock and card navigation opens the correct server workspace
- Per-server ownership isolation is enforced during runtime editing
- Ownership edits do not leak between server workspaces
- Shared base-map runtime objects remain unmodified during ownership editing
- Fresh runtime maps begin unclaimed unless overridden by per-server ownership

## Dashboard Summaries

Completed:
- Summary Service is loaded and integrated
- Controlled territory count and percentage are calculated
- Designated-union territory count and percentage are calculated
- Structure controlled/available totals are calculated
- Cards refresh once after a completed ownership edit
- Restored ownership is reflected in cards during initial rendering
- Unconfigured scoring is displayed without invented values

Pending:
- Real scoring-backed values
- Native-union, active-union, combat-strength, freshness, completeness, and evidence fields

## Persistence and Strategic Workflows

Completed:
- Per-server territory ownership saves automatically
- Saved ownership restores on application startup
- Missing saves are handled as normal first-run state
- Ownership remains isolated after save and restart

Pending:
- History timeline/playback
- Descriptive notes workflows
- Search and filters

## Current Regression Commands

- npm run test:application-bootstrap
- npm run test:server-state-persistence-controller
- npm run test:persistence-storage
- npm run test:persistence-service
- npm run test:persistence-state
- npm run test:summary-service
- npm run test:server-state
- npm run test:season1-package
- npm run test:season-package
- npm run test:season-loader

Manual regression:
- Edit ownership on one server and confirm other servers remain unchanged
- Close and reopen the application and confirm ownership restores
- Confirm Command Centre totals match restored and newly edited map ownership

## Documentation Validation

Completed:
- Current-main reconciliation recorded in changelog.md
- Version and milestone status aligned across docs
