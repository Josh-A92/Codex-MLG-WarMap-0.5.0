# Testing Checklist

Version context: v0.5.0

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

Partial:
- Per-server ownership isolation
  - Expected: ownership edits remain server-local
  - Current: edits mutate shared season1-map ownerId and leak across servers

## Dashboard Summaries

Partial:
- Static dashboard cards are present
- Values are placeholders by design in current runtime

Pending:
- Real scoring-backed values
- Integrated computed summaries from a runtime summary service

## Persistence and Strategic Workflows

Pending:
- Persistence/save
- History timeline/playback
- Notes workflows
- Objectives workflows
- Search and filters

## Documentation Validation

Completed:
- v0.5.0 reconciliation recorded in changelog.md
- Version and milestone status aligned across docs
