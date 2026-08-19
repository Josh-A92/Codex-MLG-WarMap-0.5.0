# Phase 4 Manual Operations Handoff

## Current committed boundary

Baseline after this work: `17f3f1b3548ef8fde3ed3975e8c215cf1511676e`.

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

End-of-slice evidence:

- all 116 test files passed after the capture implementation;
- focused correction, audit, uncertainty, persistence rollback, and session-history tests passed afterward;
- Electron opened without a startup error banner in first-run/no-active-season state;
- working tree was clean after each commit.

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

## Remaining Phase 4 sequence

1. Resolve the first-capture undo compensation rule.
2. Integrate session undo/redo through compensating durable operations and audit.
3. Add the versioned notes/objectives persistence slice described above.
4. Complete managed screenshot evidence import/copy/hash/reuse and ownership linking.
5. Add operator conflict-resolution flow for contradictory evidence.
6. Repeat the supported lifecycle/manual-operation matrix for Season 2 only after
   its package is promoted from Draft through the existing readiness process.
7. Run the Phase 4 release matrix, visual walkthrough, backup/restore checks, and
   update the Completion Plan only after the Definition of Done is evidenced.

## Explicit exclusions

Phase 5 scoring research and Phase 6 scoring/reconciliation remain excluded.
The exact Season 2 hourly-scoring rule remains research-blocked.
