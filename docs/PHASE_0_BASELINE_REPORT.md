# Phase 0 Baseline Report

**Audit date:** 2026-08-12  
**Phase 0 audit completion:** **VERIFIED**  
**Current application readiness:** **PARTIALLY IMPLEMENTED / NOT RELEASE-READY**

This is a read-only Phase 0 audit. No application code, tests, data, assets, or skills were modified; no dependencies were installed; no migrations were run; and no fixes or refactoring were implemented.

## Repository Identity

- Repository path: `C:\Users\josh_\OneDrive\Documents\GitHub\Codex-MLG-WarMap-0.5.0`
- Branch: `main`
- Audited commit: `0d2752379eb71d1a2198d54fa9990f0d548bd834`
- Commit message: `chore: add WarMap engineering skills`
- Working tree at audit start: clean
- Application version: `0.5.0` in [package.json](../package.json#L2)
- Latest documented milestone: `Unreleased` in [changelog.md](../changelog.md#L1), above `v0.5.0`

## Audit Scope and Method

The audit used the repository-scoped `verify-work` and `code-review` skills. It inspected the Completion Plan, decisions, architecture, data format, testing documentation, README, changelog, package scripts, source, data, tests, and the existing Windows installer artifact.

The audit distinguished:

- **User-facing capability:** visibly reachable and usable in the application.
- **Implementation foundation:** proven through services, bootstrap paths, validators, persistence composition, or contract tests, but not yet accepted as a complete visible workflow.
- **Present / Partial / Absent / Reported Elsewhere / Unverifiable:** the Completion Plan classification vocabulary.

## User-Facing Capability Baseline

### Present or visibly reachable

- Command Centre default workspace and data-driven cards.
- Eight Season 1 server workspaces for servers 366-373.
- Season 1 20x20 map with 400 tiles and 80 structures.
- Tile and structure selection with a detail panel.
- Hover feedback.
- Zoom, pan, fit, reset, centre-on-selection, and touch/pinch camera controls.
- Per-server ownership editing and ownership overlays.
- Automatic ownership persistence and restoration.
- Season setup flow with package selection, confirmation, activation, participating-server updates, and completion.
- Season 2 read-only strategic-network preview with resource-mine selection.

Direct evidence: [index.html](../index.html#L18-L84), [index.html](../index.html#L88-L160), [testing.md](../testing.md#L20-L44), and [src/map-renderer.js](../src/map-renderer.js#L924-L973).

### Implementation foundations, requiring visible runtime verification

The following are proven by services, bootstrap composition, validators, persistence tests, or contract tests. They are not classified as complete user-facing workflows until Phase 1 verifies them visibly at runtime:

- Union registry, stable IDs, matching, relations, native assignment, and active-status services.
- Data Management runtime contracts and union registration services.
- Manual observation and combat-strength observation services.
- Evidence metadata, records, management, review-queue, and proposal services.
- Confirmed snapshots and activity-fact history.
- Strategic, evidence, and union-registry persistence composition.
- Season administration lifecycle services.
- Authorization policy and operation-level authorization.

### Partial or absent user-facing workflows

- Data Management has runtime/rendering support, but complete evidence, review, and union-management presentation is not established as a complete visible workflow.
- Season 2 remains draft/preview-only; no live interactive ownership workspace is established.
- Evidence intake and review screens are incomplete.
- Real scoring totals and breakdowns are unavailable.
- Search, filters, history playback, and descriptive notes workflows remain pending.

## Season Status

| Area | Classification | Direct evidence |
|---|---|---|
| Season 1 package and map | **Present** | [src/seasons/season1-package.js](../src/seasons/season1-package.js#L44-L162); focused package tests passed |
| Season 1 activation and persistence | **Present foundation; runtime verification required** | `test:season-administration`, persistence, and bootstrap suites passed |
| Season 1 scoring | **Partial** | Package contains a resource/scoring model, but README states scoring is unconfigured: [readme.md](../readme.md#L40-L43) |
| Season 2 package and topology | **Present foundation; preview runtime verified by tests** | `test:season2-package` and `test:season2-map` passed |
| Season 2 servers | **Partial / Draft** | [data/season2-servers.json](../data/season2-servers.json#L1-L4) contains zero servers |
| Season 2 activation | **Partial** | Administration supports lifecycle validation, but draft Season 2 remains preview-only |
| Season 2 scoring | **Partial** | Dark Oil is configured; Red Copper and Holy Water are explicitly unconfigured: [src/seasons/season2-package.js](../src/seasons/season2-package.js#L96-L121) |
| Season 2 hourly rule | **Unverifiable and release-blocking** | Completion Plan marks Decision 54 as release-blocking research: [MLG_WarMap_Completion_Plan.md](../MLG_WarMap_Completion_Plan.md#L183-L189) |

## Technical Capability Classification

| Capability | Classification | Evidence |
|---|---|---|
| Server registration and server switching | **Present foundation; visible workflow verification required** | Services/tests and renderer paths |
| Union registry and stable identity | **Present foundation; visible workflow verification required** | Services/tests |
| Union creation/editing UI | **Partial / Absent** | No complete visible workflow established |
| Per-server ownership isolation | **Present foundation; runtime smoke verification required** | Focused server-state tests passed |
| Ownership persistence | **Present foundation; runtime smoke verification required** | Persistence storage/service/state/controller tests passed |
| Confirmed snapshots and activity history | **Present foundation** | Domain services/tests |
| Scoring execution service | **Absent** | No score calculation execution service was found |
| Score checkpoints and reconciliation | **Absent** | No implementation found |
| Evidence metadata and records | **Present foundation** | Evidence validator, service, management, and persistence tests passed |
| Evidence byte-storage integration | **Partial** | Adapter only forwards `loadEnvelope`/`saveEnvelope`: [src/services/electron-file-storage-adapter.js](../src/services/electron-file-storage-adapter.js#L10-L24) |
| Manual observations and combat-strength observations | **Present foundation** | Services and focused tests |
| Backup and rotating copies | **Absent** | No backup implementation found |
| Portable export/import | **Absent** | No export/import implementation found |
| Restore workflow | **Absent as a user-facing recovery feature** | No recovery workflow found |
| Migration framework and rollback path | **Absent** | No migration service or framework found |
| Transactional persistence primitives | **Partial** | Atomic operation and temporary-file write paths exist |
| Rotating technical logs | **Absent** | No rotating technical logging implementation found |
| Service-level errors | **Present foundation** | Error classes and messages exist |
| Complete user-facing error/recovery UI | **Partial** | Technical errors exist; complete operational UI is not established |
| Automated tests | **Present** | 78 test files were inventoried |
| Full regression | **Blocked** | `npm test` stopped at a failing test; see below |
| Electron startup and persistence bridge | **Present foundation** | [main.js](../main.js#L1-L44) and focused persistence tests |
| Windows installer artifact | **Stale historical evidence** | Existing `dist/codex-mlg-warmap Setup 0.5.0.exe` predates the audited commit |
| Current-source build verification | **Unverifiable / not performed** | No current build was run during this read-only audit |

## Completion Plan Classification

| Requirement group | Classification |
|---|---|
| Verified Season 1 and Season 2 packages | **Present foundations; Season 2 remains draft** |
| Draft/Active/Archived lifecycle | **Partial** |
| Persistent server and union identity | **Present foundations** |
| Event/evidence/observation domain foundations | **Present foundations** |
| Rebuildable derived state | **Partial** |
| Manual capture and correction workflows | **Partial / Absent** |
| Explainable scoring | **Absent** |
| Season 2 hourly scoring | **Unverifiable and release-blocking** |
| Score checkpoints/reconciliation | **Absent** |
| Local persistence | **Present foundation** |
| Backup/export/import/restore | **Absent** |
| Protected migrations and rollback | **Absent** |
| Rotating logs | **Absent** |
| Command Centre operational summaries | **Partial** |
| Complete data/evidence/season-management UI | **Partial** |
| Manual Windows packaging process | **Partial** |
| Release-gate readiness | **Absent** |

The governing requirements are stated in [MLG_WarMap_Completion_Plan.md](../MLG_WarMap_Completion_Plan.md#L104-L190) and [MLG_WarMap_Completion_Plan.md](../MLG_WarMap_Completion_Plan.md#L271-L322).

## Documentation Disagreements

1. The Completion Plan still describes the supplied v0.5 snapshot as lacking Season 2, persistence, observations, and evidence, while the current `main` source contains those systems. Those statements are historical baseline text, not current-state classifications.
2. [readme.md](../readme.md#L59) says version 1 persistence stores per-server territory ownership only, while [testing.md](../testing.md#L60-L63) and current source include strategic, evidence, and union-registry persistence.
3. `package.json` remains `0.5.0`, while the changelog has an `Unreleased` section containing the current architecture work.

## Test and Command Evidence

Declared project commands are in [package.json](../package.json#L7-L18):

- `npm test`
- `npm start`
- `npm run build`
- Numerous focused `npm run test:*` commands

### Full regression

`npm test` failed with exit code `1` at [tests/atomic-operation-executor.test.js](../tests/atomic-operation-executor.test.js#L248-L277).

Observed failure:

```text
UnionRegistrationCoordinatorError: Union Registration Coordinator requires options.relationService.
```

The implementation requires that dependency in [src/services/union-registration-coordinator.js](../src/services/union-registration-coordinator.js#L121-L144), while the failing test fixture omits it. This is a **test-suite blocker**. Its production impact is **not yet established**. Phase 1 must determine whether the test fixture is stale or whether the production dependency contract is wrong.

The test runner intentionally stops at the first failing test: [tests/run-all-tests.js](../tests/run-all-tests.js#L15-L33).

### Focused suites passed

Focused suites passed for:

- Season 1 and Season 2 packages/maps.
- Season administration.
- Application bootstrap.
- Data Management and Season Setup contracts.
- Persistence storage/service/state/controller.
- Evidence assets, records, management, and persistence.
- Summary service.
- Server state.

These results establish implementation foundations and contract behavior; they do not by themselves establish complete visible user-facing workflows.

## Critical and Major Baseline Risks

**P1 Major: Full regression is blocked.**  
The atomic-operation test cannot construct the union registration coordinator. This blocks a clean regression baseline. Production impact is not established; Phase 1 must resolve whether the fixture or production contract is wrong.

**P1 Major: Scoring is incomplete.**  
There is no score calculation execution service, Season 1 scoring remains unconfigured in the user-facing state, and Season 2 has only Dark Oil configured. Decision 54 remains unresolved.

**P1 Major: Recovery requirements are absent.**  
No rotating backups, portable export/import, restore workflow, migration framework, or retained rollback path was found.

**P1 Major: Production diagnostics are incomplete.**  
No rotating technical logging implementation was found; service errors alone do not satisfy the operational gate.

**P1 Major: Evidence workflow is incomplete.**  
Evidence domain services exist, but the file-storage adapter is only an envelope bridge and the complete evidence intake/review UI is not established.

**P1 Major: Release artifact provenance is unclear.**  
A Windows installer exists, but it predates the audited commit. No current-source build or runtime/package smoke test was performed during this read-only audit.

## Recommended Phase 1 Scope

Phase 1 should remain a stability and correctness baseline, without architecture refactoring:

1. Determine whether the `relationService` failure is a stale test fixture or a production dependency-contract defect; do not assume production impact from the test failure alone.
2. Run the complete test suite to completion and record every failure.
3. Execute the development startup smoke path using the audited commit.
4. Execute a packaged Windows smoke test against a package explicitly built from this commit.
5. Verify Season 1 activation, server switching, ownership edit, save, close/reopen, and restoration.
6. Verify Season 2 remains safely draft/preview-only and does not expose unconfigured scoring as zero.
7. Record the current package/artifact hash and provenance.
8. Triage failures as Critical/Major/Minor.
9. Do not begin scoring, backup, migration, logging, or architecture refactoring in Phase 1; those belong to later bounded phases after this baseline is stable.

## Audit Completion

Phase 0 audit completion is **VERIFIED** because the repository identity, source/test/documentation inventory, requirement classifications, test results, documentation conflicts, risks, and Phase 1 scope were recorded from direct read-only evidence.

Current application readiness is **PARTIALLY IMPLEMENTED / NOT RELEASE-READY** because scoring, recovery, migration, logging, complete evidence workflows, and release-gate verification remain incomplete.

No files were modified during the audit itself. This report is the documentation artifact produced from that audit.

**Report prepared:** 2026-08-12  
**Audited commit:** `0d2752379eb71d1a2198d54fa9990f0d548bd834`
