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
- Territory owner edits update overlays in memory

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

Partial:
- Static dashboard cards are present
- Values are placeholders by design in current runtime

Pending:
- Real scoring-backed values
- Integrated computed summaries from a runtime summary service (summary-service remains unintegrated)

## Persistence and Strategic Workflows

Pending:
- Persistence/save
- History timeline/playback
- Descriptive notes workflows
- Search and filters

## Current Regression Commands

- npm run test:application-bootstrap
- npm run test:season1-package
- npm run test:season-package
- npm run test:season-loader
- npm run test:server-state

## Documentation Validation

Completed:
- Current-main reconciliation recorded in changelog.md
- Version and milestone status aligned across docs
