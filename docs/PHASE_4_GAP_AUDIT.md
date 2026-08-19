# Phase 4 Gap Audit: Season Lifecycle and Manual Operations

## Baseline and Verdict

**Commit:** `7517a5cee757115f421d29956286af39e5b8646c`

**Baseline:** clean before this audit. No production, test, data, asset, skill, Completion Plan, or report files were modified before creating this report.

**Verdict: PARTIALLY VERIFIED.**

The repository has a substantial Season Administration service, real package validation, activation/completion persistence, server registration, union management, ownership entry, evidence/review surfaces, correction history, transactional persistence, and strategic-node identity support. Phase 4 is not complete because the user-reachable workflows do not yet provide a complete, coherent lifecycle and manual-operations journey for both seasons, archived mutation protection is not enforced as a global authority, evidence attachment and correction audit boundaries are incomplete, and undo/redo is not implemented as a distinct user operation layer.

Scoring rules are intentionally excluded; they remain Phase 5/6 work.

## Capability Matrix

Legend: `PRESENT` = implemented and reachable with direct evidence; `PARTIAL` = meaningful implementation exists but the Phase 4 requirement is incomplete; `ABSENT` = no verified implementation; `BLOCKED` = cannot safely claim completion because a prerequisite or authoritative boundary is missing.

### Season 1

| Requirement | Classification | Direct evidence and gap |
|---|---|---|
| Verified package completeness | PRESENT | `src/seasons/season1-package.js`, `season-package-validator.js`, `season1-package.test.js`; package validates and supplies map, structure, resource, and scoring metadata. |
| Create/load workflow | PARTIAL | `application-bootstrap.js` loads prepared packages and persistence; `season-administration-service.js` initializes state. There is no complete user workflow for creating a new operational Season 1 workspace from empty state beyond first-run setup. |
| Draft/Active/Archived lifecycle | PARTIAL | `season-administration-service.js` supports prepared package status and active/completed state, but has no explicit Draft/Archived state machine or archive entity. |
| Activation | PRESENT | `SeasonAdministrationService.activateSeason()` validates package status, server IDs, confirmations, authorization, and persists atomically; `season-setup-ui.test.js` and `season-administration-service.test.js` cover the path. |
| Archive/complete | PARTIAL | `completeActiveSeason()` clears active state and appends `completedSeasons`; it is completion history, not explicit archive protection or archived package/state handling. |
| Reopen and historical viewing | PARTIAL | Completed administrations are loaded/listed; generation close/reopen tests pass. No complete renderer workflow opens an archived season for historical viewing while preventing live-operation controls. |
| Archived-season mutation protection | ABSENT | No global authorization/read-only guard blocks ownership, evidence, union, or server mutations based on archived season state. |
| Server registration and participation | PRESENT | Renderer Season Management exposes registration and participating-server controls; `server-state-service.js`, `season-administration-service.js`, and `season-setup-ui.test.js` cover registration/participation separation. |
| Union registration and management | PRESENT | Data Management UI calls registration, identity update, native-server assignment, archive/restore services; `data-management-ui.test.js`, union registration/management tests cover paths. |
| Territory ownership/capture entry | PRESENT | Map selection flow and `map-ownership-coordinator.js` use stable IDs and ownership services; `map-ownership-coordinator.test.js` and renderer tests cover entry. |
| Structure ownership | PARTIAL | Structure targets and ownership service/validator support exist, but a complete user-facing capture workflow for structure ownership, review, and persistence is not demonstrated for all structure operations. |
| Now/exact/bounded event times | PARTIAL | Temporal contracts and exact/bounded/unknown tests exist; the normal map capture UI proves ownership mutation but does not expose a complete user-facing now/exact/bounded capture workflow. |
| Evidence attachment | PARTIAL | Evidence Intake/review services and UI surfaces exist; screenshot attachment to a confirmed ownership action with managed evidence copy and linked audit is not complete. |
| Historical corrections/supersession | PRESENT at domain boundary | Ownership record service/resolver preserve supersession and correction chains; resolver and ownership-service tests pass. User-facing correction workflow plus required reason/audit transaction is incomplete. |
| Notes/objectives | PARTIAL | Server-state model includes notes/objectives and renderer state displays operational context, but complete create/edit/persist/reopen controls are not demonstrated as a stable Phase 4 workflow. |
| Undo/redo | ABSENT | No distinct undo/redo coordinator or reachable undo/redo controls were found. Transaction rollback is not user undo. |
| Contradictory evidence/conflict handling | PARTIAL | Validators, resolver, review queue, and conflict diagnostics fail closed or retain conflict metadata; no complete operator workflow resolves a contradiction into a confirmed correction with durable reason/audit. |
| Server/season isolation | PRESENT | Stable server/season scopes are enforced across services, resolvers, views, and tests; renderer filters active participation and committed persistence checks scope. |
| Persistence across close/reopen | PRESENT | Generation, persistence, audit/provenance, and application bootstrap tests pass; Electron fresh/restart smoke previously passed at the committed baseline. |
| User-reachable renderer/UI paths | PARTIAL | Season Setup, Data Management, map ownership, Command Centre, and review surfaces are reachable, but they do not form a complete end-to-end manual lifecycle. |
| Behavioral/integration coverage | PARTIAL | Broad focused coverage exists, including persistence and migration integration; Phase 4 acceptance coverage for archive protection, evidence-backed capture, correction UI, and undo/redo is missing. |

### Season 2

| Requirement | Classification | Direct evidence and gap |
|---|---|---|
| Verified package completeness | PARTIAL | `season2-package.js`, package validator, and `season2-package.test.js` pass structural validation. The package is explicitly `draft`, and exact Season 2 scoring remains outside this audit. |
| Create/load workflow | PARTIAL | Loader and package context work; no complete user-facing Season 2 creation/load/operation journey is verified. |
| Draft/Active/Archived lifecycle | PARTIAL | Draft activation is correctly refused unless package status is active; active/completed administration exists. No full Season 2 archive lifecycle is available. |
| Activation | BLOCKED | The registered Season 2 package is draft by design; `activateSeason()` rejects it with `inactive_prepared_package`. This is correct safety behavior, but prevents a completed Season 2 lifecycle claim. |
| Archive/complete | PARTIAL | Generic completion logic exists, but no verified Season 2 active lifecycle can reach it through the current draft package. |
| Reopen and historical viewing | PARTIAL | Season 2 package/map context and strategic-node identity are tested; full historical season view/reopen workflow is not user-verified. |
| Archived-season mutation protection | ABSENT | Same missing global archived-state guard as Season 1. |
| Server registration and participation | PARTIAL | Server registration and participation APIs are generic; `data/season2-servers.json` contains no invented servers, so usable Season 2 participation requires explicit registration and activation after package promotion. |
| Union registration and management | PRESENT at shared domain/UI boundary | Shared Data Management services and renderer paths are season-neutral, with Season 2 package context available. Full Season 2 active workflow is blocked by draft status. |
| Territory/strategic-node ownership/capture entry | PARTIAL | `strategic_node` identity is production-supported and the Season 2 migration integration covers all 145 nodes including `s2-center-metropolis`; a complete user-facing strategic-node capture workflow is not demonstrated. |
| Structure ownership | PARTIAL | Domain structure ownership exists; Season 2 structure-operation UI and active lifecycle are not complete. |
| Now/exact/bounded event times | PARTIAL | Shared temporal ownership contracts support these values; no complete Season 2 operator workflow is verified. |
| Evidence attachment | PARTIAL | Shared evidence/review services exist; no Season 2 active evidence-backed capture journey is verified. |
| Historical corrections/supersession | PARTIAL | Shared ownership history supports correction chains; no complete Season 2 active correction workflow is reachable because activation is blocked by draft status. |
| Notes/objectives | PARTIAL | Shared server-state shape can carry them; no verified Season 2 operational editing path exists. |
| Undo/redo | ABSENT | No distinct user undo/redo implementation. |
| Contradictory evidence/conflict handling | PARTIAL | Shared validation/resolution/review boundaries exist; no complete active Season 2 resolution journey. |
| Server/season isolation | PRESENT at domain boundary | Package/context and strategic-node integration tests prove Season 2 package, map, active servers, and target identity do not use Season 1 defaults. |
| Persistence across close/reopen | PARTIAL | Generation and migration tests prove Season 2 context/provenance reopen; renderer-level active Season 2 reopen is blocked by draft package lifecycle. |
| User-reachable renderer/UI paths | PARTIAL | Season Setup preview supports strategic-node topology and shared management surfaces, but activation is correctly unavailable for the draft package. |
| Behavioral/integration coverage | PARTIAL | Season 2 package/context and real provenance migration tests pass; lifecycle/manual-operation tests for active Season 2 are absent because the package is draft. |

## Reachable End-to-End Workflow Map

```text
Electron main startup
  -> trusted readiness and persistence mode
  -> renderer application bootstrap
  -> load map/union/server resources
  -> restore generation or classified legacy state
  -> initialize Season Administration
  -> render Season Management / Data Management / map workspaces

Season Management
  -> select prepared package
  -> review package preview
  -> select participating servers
  -> confirm map/structure and resource/value setup
  -> activate active package
  -> update participating servers
  -> complete active season

Data Management
  -> register union
  -> edit/archive/restore union identity
  -> assign native server where allowed
  -> review evidence/observations

Map workflow
  -> select target
  -> enter ownership mutation
  -> persist through application mutation/persistence coordinator
  -> rebuild derived projection on reopen
```

The gaps are concentrated after the domain boundaries: explicit archive protection, full evidence-to-capture workflow, corrections with durable audit reason, and undo/redo are not one coherent user journey.

## Critical/Major/Minor Gaps

### Major

1. **Season 2 package is draft, so Season 2 activation and active manual operations are blocked.** This is intentional safety behavior, but it prevents a Phase 4 claim that both seasons can be activated and operated.
2. **No global archived-season mutation guard.** Completion history exists, but ownership/evidence/server/union mutation services do not consistently enforce read-only archived context.
3. **No complete evidence-backed capture workflow.** Evidence, review, and ownership services exist separately; the operator flow that attaches evidence to a capture and commits the resulting fact transactionally is incomplete.
4. **No complete historical correction workflow with durable reason/audit transaction.** Supersession works in domain tests, but the UI and durable operation/audit boundary are not complete.
5. **No user undo/redo.** Application rollback protects failed transactions but does not provide recoverable user operations.

### Minor

1. Notes/objectives are represented in server state but their complete operator edit/reopen path is not evidenced.
2. Structure ownership UI coverage is thinner than territory ownership coverage.
3. Season 2 strategic-node UI has preview/render support, but operational node capture needs explicit acceptance scenarios once the package becomes active.
4. Renderer adoption still reopens the selected source through the persistence coordinator after trusted startup; the Phase 3 audit records this as a residual authority seam.

## Dependencies on Completed Phase 3 Contracts

Phase 4 must retain and build on:

- GenerationStore candidate validation, atomic CURRENT publication, PREVIOUS fallback, and exact identity checks.
- Application mutation coordinator snapshots and participant rollback.
- Stable IDs and scope keys for seasons, servers, unions, structures, grid cells, and strategic nodes.
- Ownership history resolver and completeness evaluator as authoritative-history/rebuild boundaries.
- Projection comparator/serializer/replacement coordinator as derived-state boundaries.
- Provenance document serializer and candidate verifier.
- Main-process trusted startup composition/readiness and mode-specific persistence gate.
- Application document codec and isolated graph loader.

## Explicit Phase 5/6 Exclusions

This audit does not assess or approve:

- exact Season 2 hourly scoring mechanics;
- scoring component correctness;
- uncertainty score ranges;
- score checkpoints/reconciliation correctness;
- refresh/catch-up scoring behavior;
- Command Centre score breakdown completion.

Those belong to Phase 5 research and Phase 6 scoring/reconciliation.

## Dependency-Ordered Implementation Slices

1. **Lifecycle authority:** add explicit Draft/Active/Archived state and a shared archived read-only mutation guard for every operation service.
2. **Season 1 manual operations:** complete Season 1 structure/territory capture with now/exact/bounded time selection, notes/objectives, and persistence/reopen acceptance tests.
3. **Evidence-backed capture:** connect evidence intake/review to ownership proposals and confirmed records with durable provenance and operation audit requirements.
4. **Correction workflow:** expose supersession/correction UI with required reason, atomic authoritative update, projection rebuild, and audit transaction.
5. **Undo/redo:** add a user-operation history layer distinct from transaction rollback, with bounded session semantics and tests.
6. **Season 2 readiness:** promote only after package/rules readiness is verified; activate and repeat manual-operation scenarios using strategic-node IDs.
7. **Cross-season regression:** run the same lifecycle/manual-operation acceptance matrix independently for Season 1 and Season 2.

## Smallest Coherent First Phase 4 Slice

**Season 1 lifecycle and archive protection.**

Implement the explicit archived read-only authority and complete the existing Season 1 Season Management path for activate, participate, complete, reopen, and historical view. Add behavior tests proving:

- one active season;
- completion moves state to archived/history;
- archived records remain viewable;
- ownership, evidence, server participation, union, and notes/objective writes are rejected for archived season;
- close/reopen preserves the lifecycle state;
- no Season 2 behavior is silently introduced.

This slice uses completed Phase 3 contracts and leaves scoring, evidence ingestion automation, and Season 2 rule research outside its boundary.

## Definition of Done Checklist

- [ ] Season 1 package and map are validated and loaded from the package boundary.
- [ ] Season 2 package remains explicitly classified as Draft until verified activation prerequisites are met.
- [ ] Draft, Active, and Archived states are explicit and persisted.
- [ ] Only one season is Active at a time.
- [ ] Activation requires package, server participation, and setup confirmations.
- [ ] Completion/archive preserves historical state and prevents mutation.
- [ ] Archived seasons reopen and remain viewable.
- [ ] Server identity and season participation remain separate.
- [ ] Union registration/management uses stable IDs and atomic persistence.
- [ ] Territory and structure ownership operations are user-reachable and scoped.
- [ ] Strategic-node ownership uses stable node IDs; visual coordinates are not identity.
- [ ] Now, exact, bounded, and unknown time semantics are represented and tested.
- [ ] Evidence attachment/review links to confirmed manual facts.
- [ ] Historical corrections preserve superseded history and durable reasons.
- [ ] Notes/objectives persist and reopen.
- [ ] Undo/redo is distinct from transaction rollback and tested.
- [ ] Contradictory evidence is retained/flagged and cannot silently alter authority.
- [ ] Season/server/union isolation has independent Season 1 and Season 2 scenarios.
- [ ] Focused behavior tests cover each supported manual workflow and failure path.
- [ ] Phase 5 scoring research and Phase 6 scoring implementation remain excluded from this DoD.
