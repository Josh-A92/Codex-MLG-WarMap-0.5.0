# Phase 4 Manual Operations Handoff

## Current committed boundary

Baseline after this work: `f751aa1`.

Completed Phase 4 slices:

- archived Season 1 state is protected from ordinary mutations;
- territory, structure, and strategic-node ownership capture is user-reachable;
- capture supports Now, Exact, and Bounded Window event times;
- evidence IDs are season/server validated and linked to the confirmed fact;
- projection is rebuilt through the canonical ownership-history resolver;
- bounded events remain uncertainty and do not enter current projection;
- authoritative history, verification, projection, audit, and generation commit share rollback boundaries;
- exact replacement requires a correction reason and writes `ownership_corrected` audit details;
- a bounded session-operation history foundation exists for queued undo/redo callbacks.
- PNG/JPEG screenshot evidence is copied into hash-addressed managed storage through a fixed Electron IPC bridge;
- the renderer can register the managed asset plus a confirmed manual evidence attachment in one durable application transaction and insert the resulting evidence-record ID into the ownership form.

End-of-slice evidence:

- all 119 test files passed after the managed-evidence implementation;
- focused correction, audit, uncertainty, persistence rollback, and session-history tests passed afterward;
- Electron opened without a startup error banner in first-run/no-active-season state;
- working tree was clean after each commit.

An isolated fresh-profile Electron walkthrough also proved:

- first-run Season 1 activation completes without a persistence-mode error;
- the activated eight-server workspace displays the real ownership capture form and managed screenshot button;
- closing and reopening the same isolated profile returns `legacy_ready` / `aligned` and restores all eight server workspaces;
- no startup/bootstrap error banner appears on either launch.

That walkthrough exposed and fixed two first-run persistence defects: the startup
gate now accepts the readiness result's trusted `classification` field, and the
legacy writer now stores the union, strategic, and evidence documents in the
single combined Data Management envelope expected by restart classification.

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

Integration must register an operation only after its original durable commit.
Each undo/redo callback must itself use the application persistence facade and
write an explicit audit intent.

### Blocking authority question

Undoing a first-ever ownership capture has no prior exact ownership record. The
current projection represents an explicit `null` as Unclaimed, while absence can
fall back to package map state, and an exact `unknown` authoritative record is not
separately representable in the projection. Therefore an implementation must not
choose among these behaviours implicitly:

1. append an exact Unknown compensating record and extend projection semantics;
2. restore package fallback by deleting an immediate record (conflicts with the
   append-only/audited history model unless explicitly authorized);
3. refuse undo and require historical correction (does not satisfy first-action
   immediate undo).

This is an engineering/product authority decision required before wiring the
session history to ownership controls. Established records continue to use the
committed correction workflow.

## Notes and objectives boundary

`ServerStateService` currently preserves arbitrary initial server fields in
memory, but `persistence-state-serializer.js` strictly allows only:

```text
id, label, ownership
```

Its transaction snapshot also captures only ownership. Adding notes/objectives
to the renderer now would make them non-transactional and drop them on reopen.
The next coherent slice must therefore:

1. define strict note/objective record shapes and size limits;
2. version or compatibly extend the server-state persistence document;
3. include operational context in capture/restore transaction snapshots;
4. update the application document codec restoration path;
5. add edit, failure rollback, close/reopen, archived-read-only, and isolation tests;
6. only then expose renderer controls.

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

1. Resolve the first-capture undo compensation rule.
2. Integrate session undo/redo through compensating durable operations and audit.
3. Add the versioned notes/objectives persistence slice described above.
4. Add operator conflict-resolution flow for contradictory evidence.
5. Repeat the supported lifecycle/manual-operation matrix for Season 2 only after
   its package is promoted from Draft through the existing readiness process.
6. Run the Phase 4 release matrix, active-season evidence walkthrough, backup/restore checks, and
   update the Completion Plan only after the Definition of Done is evidenced.

Contradictory exact ownership terminals currently fail closed inside the
canonical history resolver before projection adoption. They therefore require a
recovery-mode resolution design; they must not be routed through the ordinary
proposal review queue or silently converted into a normal correction.

## Explicit exclusions

Phase 5 scoring research and Phase 6 scoring/reconciliation remain excluded.
The exact Season 2 hourly-scoring rule remains research-blocked.
