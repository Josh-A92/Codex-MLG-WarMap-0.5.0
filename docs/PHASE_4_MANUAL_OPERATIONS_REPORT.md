# Phase 4 Season Lifecycle and Manual Operations Report

## Assessment

**VERDICT: PARTIALLY VERIFIED**

**Committed baseline:** `dda19c9c5578b4a8b86abe79adb7a4794dc94e0c`

This report includes the current uncommitted factual-note, audit-hardening, and
ownership-conflict recovery slice. It does not close Phase 4 or change the
Completion Plan.

Season 1 lifecycle and manual operations are substantially implemented and
covered. Season 2 remains intentionally Draft, so the plan's requirement that a
user activate, operate, archive, reopen, and view both verified seasons is not
yet evidenced. The plan also says `notes/objectives`, while the accepted product
boundary keeps WarMap descriptive and explicitly excludes objectives,
priorities, recommendations, and strategic-task authority. That wording needs an
explicit product decision before Phase 4 can be closed.

## Capability Matrix

| Capability | Evidence | Result |
|---|---|---|
| Draft/Active/Archived lifecycle | Season Administration service/UI tests cover setup, activation, completion, archived history, and single-active-season rules. | VERIFIED for Season 1 |
| Archived mutation protection | Persistence coordinator/facade and Season Administration tests reject ordinary mutations after archive while permitting lifecycle transactions. | VERIFIED |
| Server participation and stable union identity | Season Administration, union registry, Data Management, and persistence tests cover stable IDs and scoped participation. | VERIFIED |
| Territory, strategic-node, and structure capture | Map ownership coordinator/UI tests cover normal cells, stable strategic-node IDs, structures, scope, evidence, and projection rebuild. | VERIFIED |
| Event timing | Temporal contract and capture tests cover Now/exact/bounded/unknown without promoting uncertainty into current projection. | VERIFIED |
| Managed evidence attachment | Evidence file store, IPC, management, renderer, and persistence tests cover PNG/JPEG import, managed hashes, linked evidence records, and rollback. | VERIFIED |
| Historical correction | Exact corrections require a reason, preserve superseded history, rebuild projection, audit, persist, and roll back atomically. | VERIFIED |
| Undo/redo | Session history invokes durable append-only retractions and fresh-record redo operations; failed callbacks retain stack state. | VERIFIED |
| Factual server notes | Confirmed Server Observation history provides bounded descriptive notes, required correction reasons, audit, rollback, serialization, and reopen. | VERIFIED |
| Objectives/priorities | Deliberately absent because WarMap is descriptive and must not become strategic-task authority. | PLAN WORDING DECISION REQUIRED |
| Contradictory ownership recovery | Unresolved conflicts fail closed. Recovery UI requires one retained record and reason, append-only retracts all competing terminals, rebuilds projection, audits, and rolls back on durable failure. | VERIFIED at service/UI-test boundary |
| Season/server isolation | Broad service and persistence tests pass; real Season 2 migration covers all strategic-node identities. | VERIFIED for data boundaries |
| Active Season 2 manual-operation journey | Season 2 package is valid but explicitly `draft`; activation remains blocked. | UNVERIFIED / INTENTIONALLY BLOCKED |

## Current Verification Evidence

- `node tests/application-audit-record.test.js` passed.
- `node tests/server-intelligence-management-service.test.js` passed 10 scenarios.
- `node tests/server-note-persistence.test.js` passed real-service create,
  correction, rollback, audit, and reopen behavior.
- `node tests/ownership-history-resolver.test.js` passed 12 scenarios.
- `node tests/map-ownership-coordinator.test.js` passed 12 scenarios, including
  territory, structure, three-way, and retraction-chain conflict recovery.
- `node tests/ownership-capture-persistence.test.js` passed durable rollback and
  matching domain/audit transaction checks.
- `node tests/data-management-ui.test.js` passed factual-note and recovery-UI
  source checks.
- `npm test` passed all **122 test files**.
- `git diff --check` passed with line-ending warnings only.

## Runtime Evidence

An isolated disposable Electron profile was used so the normal user profile was
not changed. The walkthrough directly confirmed:

- Season 1 activation with all eight default servers;
- creation and correction of a factual server note in Data Management;
- persistence of the corrected observation after closing and reopening Electron;
- Season 1 archival through the user-facing lifecycle controls;
- restoration of archived observation history after another restart;
- an archived read-only banner, disabled note-entry controls, and no correction
  action for archived history; and
- no startup or bootstrap error banner during the journey.

A second isolated fresh-profile walkthrough directly confirmed the ownership
operation path in the real Electron renderer:

- a Now capture completed and enabled session Undo;
- Undo accepted an inline reason, appended the durable retraction, and enabled
  Redo without using the unsupported browser `prompt()` API;
- Redo appended a fresh ownership record, superseded the surviving current
  target verification, and returned the operation stack to Undo-ready state;
- a PNG selected through the native dialog was copied into hash-addressed
  managed storage, registered as one evidence asset and one evidence record,
  inserted into the ownership form, and linked by both the confirmed ownership
  record and target verification; and
- no ownership/evidence error banner remained after either successful journey.

The walkthrough exposed and fixed four integration defects that focused source
tests alone had not caught: canonical `eventAt` captures still required legacy
`effectiveAt`, Undo used unsupported `prompt()`, the renderer supplied a string
clock to the map coordinator, and Redo attempted a duplicate current target
verification. A separate managed-evidence run exposed a fifth defect: the
strict audit vocabulary omitted the renderer's
`ownership_evidence_attached`/`ownership_target` pair. All five boundaries now
have focused regressions.

The walkthrough exposed two real integration defects which are fixed in this
slice. The renderer originally derived Data Management servers only from an
active season, hiding archived panels. More importantly, startup treated a
profile with completed history but no active season as first-run and therefore
did not restore the archived domain envelope. The renderer now derives archived
server context from the latest matching completed season, and the main-process
legacy loader restores that completed season for read-only use while keeping
migration context active-season-only.

The conflict UI additionally requires deliberately contradictory authoritative
history. Such corruption must be created in an isolated test profile, never in a
normal user profile.

Protected legacy-to-generation adoption is now implemented for trusted
`rebuildable_projection` classification. Real-filesystem composition coverage
proves that validated legacy envelopes are loaded into an isolated graph, the
rebuilt projection is used without rewriting legacy inputs, provenance is
generated with `legacy_migration` source evidence, the candidate is verified
with an exact `ready` startup gate, and publication/retry behavior is
deterministic. Verification refusal leaves the generation head missing.

## Remaining Phase 4 Exit Work

1. Decide whether the Completion Plan's `notes/objectives` wording should be
   narrowed to factual notes, or whether a separate non-strategic objective model
   is genuinely required.
2. Keep Season 2 Draft unless and until its verification prerequisites are
   explicitly approved; do not infer approval from an announced schedule.
3. Run an isolated corrupted-profile walkthrough for ownership conflict recovery.
4. Reconcile the Completion Plan and mark Phase 4 complete only when the Season 2
   and objectives decisions above are settled with evidence.

## Exclusions Preserved

No Season 2 scoring assumption, Phase 5 research conclusion, Phase 6 scoring
implementation, Command Centre scoring summary, backup/export feature, or
release packaging change is included in this Phase 4 slice.
