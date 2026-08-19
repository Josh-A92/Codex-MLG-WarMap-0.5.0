# Phase 4 Manual Operations Handoff

## Current committed boundary

Committed baseline before the current uncommitted slice: `dda19c9c5578b4a8b86abe79adb7a4794dc94e0c`.

Completed Phase 4 slices:

- archived Season 1 state is protected from ordinary mutations;
- territory, structure, and strategic-node ownership capture is user-reachable;
- capture supports Now, Exact, and Bounded Window event times;
- evidence IDs are season/server validated and linked to the confirmed fact;
- projection is rebuilt through the canonical ownership-history resolver;
- bounded events remain uncertainty and do not enter current projection;
- authoritative history, verification, projection, audit, and generation commit share rollback boundaries;
- exact replacement requires a correction reason and writes `ownership_corrected` audit details;
- durable ownership undo/redo is wired through append-only retractions, audit, projection rebuild, and generation rollback;
- factual server notes use confirmed observation history with bounded text, audited correction reasons, rollback, and reopen coverage;
- contradictory territory, strategic-node, or structure terminals have a recovery-only UI that retains one selected record and append-only retracts every competing terminal atomically;
- PNG/JPEG screenshot evidence is copied into hash-addressed managed storage through a fixed Electron IPC bridge;
- the renderer can register the managed asset plus a confirmed manual evidence attachment in one durable application transaction and insert the resulting evidence-record ID into the ownership form.

End-of-slice evidence:

- all 119 test files passed after the managed-evidence implementation;
- focused correction, audit, uncertainty, persistence rollback, and session-history tests passed afterward;
- Electron opened without a startup error banner in first-run/no-active-season state;
- working tree was clean after each commit.

The current uncommitted Phase 4 slice raises the full suite to 122 test files and
adds audited factual notes plus append-only ownership-conflict recovery. It also
contains a protected legacy-to-generation adoption path covered by real-filesystem
composition scenarios.

An isolated fresh-profile Electron walkthrough also proved:

- first-run Season 1 activation completes without a persistence-mode error;
- the activated eight-server workspace displays the real ownership capture form and managed screenshot button;
- closing and reopening the same isolated profile returns `legacy_ready` / `aligned` and restores all eight server workspaces;
- no startup/bootstrap error banner appears on either launch.

A later isolated active/archive walkthrough additionally proved:

- a factual server note can be created and corrected through Data Management;
- the corrected observation survives an Electron restart;
- completing Season 1 archives the season through the normal UI;
- archived observation history survives a further restart and is visible in
  Data Management with disabled creation controls and no correction action; and
- the normal user profile remains untouched.

Two further isolated fresh-profile walkthroughs proved the live ownership path:

- Now capture, inline-reason Undo, and fresh-record Redo complete through the
  real renderer and persistence facade;
- Redo supersedes the surviving target verification rather than creating a
  same-instant duplicate;
- native-dialog PNG import creates a managed hash-addressed file, one evidence
  asset, and one linked evidence record;
- the evidence ID is inserted into the capture form and persists on the
  ownership record and target verification; and
- the strict audit contract now recognizes the evidence-attachment action and
  target vocabulary used by the renderer.

That walkthrough exposed and fixed archived-history restoration gaps. Renderer
context now falls back to the latest matching completed season for read-only
panels, while main-process startup restores the latest completed legacy season
when no season is active. Migration context remains active-season-only, so the
fallback cannot authorize migration or writes.

That walkthrough exposed and fixed two first-run persistence defects: the startup
gate now accepts the readiness result's trusted `classification` field, and the
legacy writer now stores the union, strategic, and evidence documents in the
single combined Data Management envelope expected by restart classification.

### First-run audit compatibility

First-run legacy writes persist the application-audit document through a separate,
strict `application_audit` storage identity. Startup loads that envelope into the
existing application document codec, defaulting to an empty version-1 history only
when the envelope is absent. This preserves audit records without weakening or
silently extending the strict legacy Data Management schema.

## Authority and data flow

```text
renderer capture form
  -> ApplicationPersistenceFacade.execute(mutation, auditIntent)
  -> MapOwnershipCoordinator
  -> OwnershipRecordService (authoritative append/supersession)
  -> OwnershipHistoryResolver (canonical current-state derivation)
  -> ServerStateService projection replacement
  -> ApplicationMutationCoordinator audit append
  -> GenerationStore durable commit
```

The renderer supplies user intent only. Ownership history remains authoritative;
server-state ownership remains a replaceable projection.

## Undo/redo boundary

`SessionOperationHistoryService` is intentionally session-only. It stores bounded
operation IDs and caller-provided compensating callbacks, serializes undo/redo,
and moves an entry between stacks only after the callback succeeds. It does not:

- capture or restore domain snapshots;
- delete authoritative events;
- write audit records;
- commit generations;
- decide what Unknown, Unclaimed, or absence means.

Operations are registered only after their original durable commit. Undo appends
a manual retraction; redo appends a fresh confirmed ownership record with a fresh
record ID. Both callbacks use the application persistence facade, receive the
coordinator-owned transaction ID, write explicit audit intents, rebuild the
projection, and retain stack state when persistence fails. A first-capture undo
therefore restores absence/package fallback without deleting authoritative
history.

## Factual server notes boundary

Factual server notes now use the existing authoritative `ServerObservationService`
history instead of extending the derived server-state projection. Operators can
add a confirmed descriptive note or correct one with a required reason. Creation,
correction, audit, rollback, serialization, and reopen are covered with real
services. Archived seasons render the history read-only.

Objectives, priorities, recommendations, and planning directives remain explicit
non-goals: WarMap records descriptive facts and must not become a strategic-task
authority.

## Managed screenshot evidence boundary

The main process owns file selection, validation, hashing, and managed copying.
Renderer code receives only managed metadata; it never receives a source path or
filesystem capability. The current evidence path is:

```text
renderer Import screenshot
  -> fixed preload IPC method
  -> main-process file dialog and EvidenceFileStore
  -> hash-addressed managed PNG/JPEG copy
  -> ApplicationPersistenceFacade.execute()
  -> EvidenceManagementService.registerUploadedAsset()
  -> EvidenceManagementService.createManualAttachment()
  -> evidence-record ID inserted into the ownership capture form
```

Asset and evidence-record changes roll back together if generation persistence
fails. A copied hash-addressed file can remain unreferenced when that later
domain transaction fails; no deletion is attempted because the same digest may
already be referenced elsewhere. A future maintenance/cleanup slice may remove
unreferenced blobs only after scanning committed evidence assets.

The managed file store rejects structurally truncated JPEGs, PNGs with an
invalid terminal IEND length, and source files whose size or filesystem change
identity differs after the read. These checks run before hashing or copying.

## Remaining Phase 4 sequence

1. Repeat the supported lifecycle/manual-operation matrix for Season 2 only after
   its package is promoted from Draft through the existing readiness process.
2. Finish the remaining isolated contradictory-history walkthrough; run the Phase 4 release matrix and
   backup/restore checks; then update the Completion Plan only after the
   Definition of Done is evidenced.

The contradictory-history walkthrough is now evidenced as blocked before the
renderer: strict isolated graph reconstruction rejects two confirmed exact
terminals for one target with `preparation_failed`, preserving the committed
generation and preventing ordinary writes. Recovery UI remains unverified. Do
not weaken the resolver or startup gate; the next safe slice requires a
quarantined recovery-mode loader and a publish-after-retraction candidate gate.

Contradictory exact ownership terminals still fail closed when unresolved. The
resolver applies validated append-only retractions before terminal conflict
classification. The future recovery-only Data Management action must require an
explicit record to retain and reason, retract every competing terminal in one
transaction, rebuild projection, and write `ownership_conflict_resolved` audit
history. It must not be routed through the ordinary proposal review queue or
converted into a normal correction.

## Explicit exclusions

Phase 5 scoring research and Phase 6 scoring/reconciliation remain excluded.
The exact Season 2 hourly-scoring rule remains research-blocked.
