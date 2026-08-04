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
- Prepared Season Setup lists bundled packages and participating servers
- Season 1 can be confirmed, activated, persisted, and restored
- Season 2 remains an inspectable draft with a strategic-network map preview
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
- Native-union, active-union, combat-strength, freshness, completeness, and evidence UI fields

## Strategic Domain Logic

Completed as domain and runtime boundaries:
- Canonical union registry and deterministic ID/tag/alias matching
- Union/server/season relationships and rebuildable Active-Status cache projection
- Native-union assignment validation and lifecycle service
- Ownership-record and target-verification validation and lifecycle services
- Confirmed snapshot validation, assembly, storage, and activity-fact resolution
- Map-specific activity-fact history
- Active-Status evaluation, immutable status history, update coordination, and read-time verification-health projection
- End-to-end held territory -> verified inactivity -> recapture regression
- Browser script loading and frozen bootstrap exposure of the complete strategic module bundle
- Coherent strategic, evidence, and union-registry persistence and restoration
- Authorized Data Management Runtime composition
- Atomic union registration across identity, relation, and native assignment
- Canonical map-ownership coordination and selected-target read projection

Pending:
- Territory & Evidence, Evidence Intake, Review Queue, and Union Registry screens
- Command Centre and Server Overview presentation of canonical intelligence
- Screenshot byte-storage adapter integration

## Persistence and Strategic Workflows

Completed:
- Per-server territory ownership saves automatically
- Saved ownership restores on application startup
- Strategic, evidence, and union-registry histories restore as one coherent state
- Season activation state saves and restores
- Missing saves are handled as normal first-run state
- Ownership remains isolated after save and restart

Pending:
- History timeline/playback
- Descriptive notes workflows
- Search and filters

## Current Regression Commands

Full repository regression:

- `npm test`

This command discovers every `tests/*.test.js` file, runs them in stable filename
order, and stops on the first failure. Individual `npm run test:*` scripts in
`package.json` remain available for focused development.

Manual regression:
- Edit ownership on one server and confirm other servers remain unchanged
- Close and reopen the application and confirm ownership restores
- Confirm Command Centre totals match restored and newly edited map ownership
- Confirm Season 1 activation survives restart
- Confirm the Season 2 draft preview remains horizontally scrollable on a phone-sized window

## Documentation Validation

Completed:
- Architecture and UI implementation status distinguish completed runtime
  boundaries from the remaining operator screens
