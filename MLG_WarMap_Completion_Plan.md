# MLG WarMap Completion Plan

**Target:** MLG WarMap v1.0.0  
**Release model:** Option A - a complete, reliable personal Windows desktop application  
**Architectural constraint:** keep clean seams for later Option B private collaboration and Option C public/multi-alliance use, without building those products into v1.0  
**Status:** definitive product and delivery plan; implementation status must be refreshed in Phase 0 against the actual current repository

## 1. Governing direction

WarMap v1.0 is finished only when a user can install the Windows application, create or load Season 1 and Season 2 operational data, manage servers and unions, record evidence-backed game events, obtain explainable scores, close and reopen safely, restore from backup, and pass all four release gates.

Settled features are not to be redesigned. Implementation may be refactored where necessary to satisfy the locked architecture, correctness, or operational requirements.

The authoritative hierarchy is:

1. Verified game information and the verified map blueprint.
2. Locked product decisions, including Decisions 1-63.
3. Current source behaviour that conforms to those decisions.
4. Older roadmaps and documents, which are historical context where they conflict with later decisions.

The central data rule is:

> **Authoritative:** game events + observations/evidence + versioned season rules + time.  
> **Derived and rebuildable:** current state + scores + summaries + dashboard views.

The cleanup rule is:

> **Future-proofing is allowed. Future clutter is not.**

During architecture review, questionable code is classified as **KEEP / REFACTOR / REMOVE / DEFER-PRESERVE**.

## 2. Reconciled evidence baseline

### 2.1 What the supplied artifacts prove

The supplied v0.5 source archive contains a valid 20 x 20 Season 1 map with 400 tiles and 80 structures, an 11-entry union registry, eight Season 1 server records (366-373), approved sprite assets, an Electron shell, and a browser-rendered UI. Its changelog records implementation through v0.4.3 even though `package.json` reports v0.5.0.

The code visibly contains:

- Data-driven Season 1 rendering from JSON.
- Tile and structure selection, hover behaviour, and multi-tile structure footprints.
- Zoom, pan, fit, reset, centre-on-selection, and touch/pointer camera behaviour.
- Stable union IDs and a central ownership service.
- In-memory ownership editing and ownership overlays.
- A Command Centre shell, eight data-generated server buttons/cards, and shared Season 1 base-map navigation.
- A strategic summary service file, although the supplied UI does not load or use it.
- A packaged Windows v0.4.0 artifact.

The supplied source does **not** contain automated tests, a Season 2 package, a season lifecycle engine, database/persistence code, event or observation storage, evidence management, backup/restore, migrations, a functioning score engine, or rotating technical logs.

### 2.2 Evidence conflict that Phase 0 must resolve

The design interrogation reports that a later build already includes Season 2 loading/activation, server registration, ownership, scoring, and persistence, and that the Season 2 loading fault was fixed elsewhere. That later implementation is not present in the supplied source snapshot.

Therefore:

- Those systems are **reported implemented, verification pending**.
- They must not be counted as complete or rebuilt from scratch until the actual current repository/commit is inspected.
- The v0.5 archive is a reliable lower bound on implementation, not necessarily the latest build.
- Phase 0 is a release-blocking source-of-truth reconciliation, not a new design exercise.

### 2.3 Documentation reconciliation

The foundation PDFs and root text documents correctly establish the blueprint, data-driven renderer, modularity, approved assets, small milestones, and accuracy-before-appearance principles. Their roadmaps are now historical: several listed future features are already present in the supplied snapshot, while the later decisions substantially deepen seasons, scoring, evidence, persistence, and release requirements.

The v0.5 documentation is also internally inconsistent:

- Roadmap Phase 2.5 says Command Centre/server workspaces are next, while the changelog says their shell and data model are implemented.
- `known_issues` claims no debt, despite an unwired summary service, a large renderer/controller module, duplicate packaged source, and no automated test suite.
- Architecture text describes per-server ownership, but the renderer edits the loaded shared base-map tile objects and does not rebind ownership when servers change.
- The Command Centre explicitly remains a placeholder and says scoring/persistence are absent.

Documentation must be rewritten after the current code baseline is confirmed, then maintained as part of every phase's Definition of Done.

## 3. Completion classification

### A. Already implemented and needs verification

These items are present in the supplied artifacts. Preserve their settled behaviour unless testing or architecture review identifies a concrete defect.

| Capability | Required verification |
|---|---|
| Verified Season 1 blueprint, 20 x 20 grid, 80 structures | Compare against the canonical blueprint; verify coordinates, structure types, footprints, and sprite placement. Remove operational ownership test data from the blueprint if it is not canonical. |
| Approved Sprite Pack v3 and Ice Mist/MLG Purple direction | Confirm all assets package correctly, filename case is consistent, and no approved artwork has been redesigned. |
| Data-driven map renderer | Load validated map data without Season 1-specific layout rules; verify error handling for malformed/missing data. |
| Selection, hover, detail panel, and multi-tile structures | Full mouse, keyboard where supported, pointer, and regression checks across all footprint sizes. |
| Camera controls | Verify zoom, pan, pinch, fit, reset, centre-on-selection, constraints, resizing, and server/workspace switching. |
| Union registry and stable IDs | Verify IDs, aliases where present, name display, colour presentation, and no use of visible names as foreign keys. |
| Ownership service, overlays, and in-memory editor | Verify tile/structure ownership semantics, mixed/partial footprints, and display precedence. Persistence and server isolation are separate required work. |
| Command Centre/server navigation shell | Verify Command Centre default, eight Season 1 servers, bottom-left dock, correct active state, navigation, responsive layout, and shared blueprint use. |
| Season 1 server-state JSON foundation | Validate schema and ensure ownership, notes, objectives, history, scoring, and timestamps are actually isolated by season participation and server. |
| Electron desktop shell and v0.4 package artifact | Verify current development startup and produce a fresh package from the actual current source; the old package is evidence of packaging only, not a v1 release candidate. |

The following are **reported implemented elsewhere and must be inventoried before any replacement work**: Season 2 loading, preview/activation, server registration, scoring, persistence, and the resolved loading fix.

### B. Existing but needs modification or refactor

| Area | Required outcome |
|---|---|
| Renderer/controller concentration | Split map rendering, camera, selection, workspace navigation, editing, and application orchestration behind clear interfaces. Business rules and persistence must not live in UI code. |
| Ownership source of truth | Stop treating mutable ownership on the shared Season 1 blueprint as operational server state. Keep the blueprint immutable; resolve ownership from season/server current state derived from events. |
| Server switching | Ensure switching servers swaps all server-specific ownership, notes, objectives, scoring, observations, and selection context with no leakage. |
| Strategic summary service | Either wire it through the agreed current-state boundary and test it, or remove/replace it. It must not become a second authoritative scoring path. |
| Placeholder Command Centre | Replace placeholders with derived, explainable summaries and contextual editing shortcuts while retaining its primarily read-only role. |
| Union model | Extend stable IDs with aliases, season-scoped identity/colour rules, mid-season rename auditing, and administrator-confirmed matching. Do not infer cross-season identity automatically. |
| Electron boundary | Make desktop hosting, file access, logging, and database access explicit behind a narrow application API. Review security settings and keep the Season Engine independent of BrowserWindow/renderer lifecycle. |
| Test ownership data | Move any seeded Royal City ownership out of the canonical map into fixtures/demo data unless the blueprint verifies it as permanent map data. |
| Duplicate/transitional files | Triage `packaged-test-v040`, `village_old.png`, orphaned services, compatibility code, and obsolete documents as KEEP/REFACTOR/REMOVE/DEFER-PRESERVE. |
| Documentation/versioning | Reconcile README, architecture, data format, roadmap, decisions, testing, known issues, changelog, package version, and the definitive completion plan with the actual repository. |

### C. Required to build or complete for v1.0

#### Domain and season foundation

- Season packages for verified Season 1 and Season 2 data only; no invented Season 3 data.
- Lifecycle **Draft -> Active -> Archived**, with only one active season and protected read-only archived seasons.
- Persistent server identity separated from season-specific server participation.
- Persistent union IDs within deliberately recognised contexts, with aliases and season/server observations separated from canonical identity.
- Reusable, composable scoring components selected by a season package: Season 1 fixed-holding and Season 2 timed-production requirements, without a monolithic season switch scattered through the app.
- Real-world UTC timestamps interpreted through a configurable season timeline; the operating-system clock is the v1 time source.

#### Authoritative records and current state

- Authoritative game events, application audit events, observations, evidence links, and versioned rules.
- Separate event, observed, and recorded timestamps; exact time, bounded time window, and explicitly unknown values.
- Fact-level source, confidence, and freshness; derived server-level data-quality summary.
- Valid-but-conflicting evidence retained and flagged; structurally invalid input rejected.
- Derived current-state snapshots that can be discarded and rebuilt from authoritative records.
- Targeted recalculation after corrections, plus a full rebuild/integrity fallback.

#### Editing and operational workflow

- Fast live capture: **Capture -> Union -> Now**.
- Alternatives for earlier exact capture time and bounded uncertain capture time.
- Manual server registration and union creation/editing using stable IDs.
- Notes and objectives required for the personal operational workflow.
- Undo/redo for immediate session mistakes, distinct from permanent application audit history.
- Historical correction through compensating/correction records; established history is not silently deleted.
- Confirmed actions persisted immediately and transactionally; unconfirmed form fields are not authoritative.
- Unknown values represented explicitly and never silently converted to zero.

#### Evidence and observation workflow

- Attach screenshots to manual observation records without automatic interpretation.
- Store one managed copy in WarMap's user-data area with original metadata, import time, observation time, cryptographic file hash, and season/server/observation links.
- Detect duplicate files by hash and allow reuse of existing evidence.
- Observation batches distinguish reconfirmation, exact changes, bounded changes, conflicts, and approved resulting events.
- Portable export/backup can include evidence and preserve references.

#### Scoring and reconciliation

- Explainable current totals and useful breakdown for every known union, plus explicit Unattributed/Unknown production.
- Derived score caches with provenance; a clean rebuild wins over a conflicting cache.
- Uncertain ownership/capture periods yield confirmed and possible ranges rather than invented timestamps.
- No production before a structure is verified as captured/activated.
- Immediate recalculation after meaningful changes, catch-up calculation after reopening, and scheduled open-app refresh only after the exact Season 2 rule is verified.
- Optional in-game score checkpoints recording season, server, union, observation time, evidence, calculated score at that time, difference, and reconciliation status.
- In-game score is the factual benchmark; WarMap retains its explainable calculation, marks mismatch uncertainty, and never overwrites it with an unexplained manual total.
- Compact discrepancy status in Command Centre and fuller server/union detail.

#### Persistence, recovery, and operations

- Local database for normal operation, with authoritative and derived data clearly separated.
- Automatic rotating local backups and optional user-selected secondary backup location.
- Portable, human-readable export package and tested import/restore.
- Protected database migration: **backup -> validate -> migrate -> verify -> retain rollback copy**.
- Failed writes and imports are transactional and do not partially modify authoritative data.
- Useful rotating technical logs and understandable in-app errors.
- Application installation files separated from user database, evidence, exports, backups, and logs.
- Manual Windows release/install process for v1.0.

#### User-facing completion

- Command Centre remains primarily read-only and shows season/server/union operational summaries, score breakdowns, data quality/freshness, last calculation time, and reconciliation status.
- Contextual shortcuts open the correct editing location instead of turning the dashboard into a second editor.
- Completed seasons can be closed, protected, reopened, and viewed reliably.
- Documentation describes actual behaviour, data ownership, recovery, and release operations.

### D. Research and blocking unknowns

| Unknown | Status and resolution |
|---|---|
| **Exact Season 2 hourly scoring mechanic** | **RELEASE-BLOCKING RESEARCH REQUIRED. Do not assume the rule.** Establish whether production is continuous but displayed hourly, awarded after complete ownership intervals, or paid at global checkpoints. Verify first award timing, partial hours, ownership changes near boundaries, structure-type differences, season start/end treatment, and display update timing. Evidence must be recorded as Verified Fact / Observed Behaviour / Working Assumption / Unknown, then converted into behaviour tests. |
| Actual current source/commit | Phase 0 blocker. Obtain the repository containing the reported Season 2, server registration, scoring, and persistence work. Record the exact commit/build and compare it to the supplied v0.5 snapshot. |
| Verified Season 1 and Season 2 rule data | Confirm point values, eligible structure types, activation conditions, and season timelines from authoritative or reproducible evidence. Unknown values stay unconfigured rather than becoming zero. |
| Golden scoring checkpoints | Collect representative in-game totals and their supporting capture/ownership evidence, especially boundary cases, to validate the Season 2 model. |
| Canonical operational data locations | Confirm Windows user-data, evidence, backup, export, rollback, and log locations during architecture work and prove updates cannot overwrite them. This is an engineering verification, not a product redesign. |

Research may run alongside foundation work, but unresolved Season 2 mechanics block completion of the Season 2 scoring engine and the Correctness gate.

### E. v1.1

The committed v1.1 headline is **automated screenshot ingestion**:

- Analyse stored screenshots and produce staged observation batches.
- Propose structures, ownership, unions, strengths, and other facts with confidence/source metadata.
- Suggest alias matches; unknown unions remain administrator-created or administrator-approved.
- Require human approval for score-affecting findings.
- Reuse the v1 evidence, observation, event, uncertainty, and audit architecture.

Suitable v1.1 candidates, after v1.0 is stable, are a richer Score Explorer, dedicated cross-server reconciliation workspace, advanced historical-correction UI, one-click diagnostic packages, and carefully proven low-risk auto-approval of reconfirmations. They are not v1.0 release blockers.

### F. Later Option B/C

These capabilities remain explicitly outside v1.0 and v1.1 unless separately promoted:

- Accounts, authentication, roles, permissions, approval policy, and actor identity.
- Shared hosted database/API, real-time or asynchronous multi-user sync, conflict handling, and server-side scheduling.
- Private MLG deployment, hosting, monitoring, security operations, and collaboration administration (Option B).
- Multiple organisations/alliances, tenant isolation, self-service onboarding, public configuration, stronger privacy/security controls, support, usage controls, and possible billing (Option C).
- Automatic application updates when distribution scale justifies them.

v1 architecture keeps these viable by making the Season Engine host-independent, using stable IDs, placing persistence behind adapters, keeping UI state non-authoritative, allowing audit records to gain an actor later, and keeping Electron/file-system concerns outside domain logic.

## 4. Decision traceability

### Decisions 1-32

| Decisions | Plan consequence |
|---|---|
| 1-5 | Option A desktop is the first finish line; establish a whole-workflow development regression and packaged smoke baseline; severity triage makes data risk Critical. |
| 6-8 | Automatic transactional saving, recoverable undo/redo, permanent application audit history, and separate game history are foundational. |
| 9-15 | Preserve event/observed/recorded time, UTC plus season timeline, closed-app derivation, missing-event uncertainty, fact-level confidence, and configurable freshness. |
| 16-21 | Events and rules are authoritative; snapshots and scores are derived; conflicts and uncertain windows remain explicit; recalculation is targeted with full rebuild fallback; rules and score provenance are versioned. |
| 22-29 | Rule locking/correction UI may mature after v1, but v1 data must support versioning; v1 scores need totals plus breakdown; production starts only after capture/activation; all unions and Unknown are accounted for; manual and batch observations preserve uncertainty; AI output is staged. |
| 30-32 | Archived seasons are protected and viewable; lifecycle is Draft/Active/Archived with only one active season; no Season 3 invention; reusable scoring models serve verified seasons. |

### Decisions 33-63

| Decision | Locked consequence in this plan |
|---:|---|
| 33 | Scoring is composable when verified mechanics require multiple components. |
| 34 | Server identity persists independently of season participation and state. |
| 35 | Union identity is separated from changing seasonal/server facts. |
| 36 | Stable union IDs, aliases, suggested matches, human confirmation, and future protected merge. |
| 37 | Between-season rename means a new identity; mid-season rename preserves ID and is audited. |
| 38 | Union colour is season-scoped presentation only and never affects identity or scoring. |
| 39 | v1 has one trusted Local Administrator and no authentication system. |
| 40 | Normal operation uses a local database; portable human-readable export protects ownership and migration. |
| 41 | Rotating backups, optional secondary location, portable export, tested restore, and derived-state regeneration are v1 requirements. |
| 42 | Every migration follows backup, validation, migration, verification, and retained rollback copy. |
| 43 | Existing season server-registration/map-instance behaviour is verified, not redesigned, if present in the actual current source. |
| 44 | Unknown screenshot unions use administrator-approved creation/matching; existing design is verified rather than reopened. |
| 45 | v1 stores screenshots as evidence with manual entry; automated interpretation is v1.1. |
| 46 | WarMap manages its own evidence copy and metadata; backups/exports can include it. |
| 47 | Hash-based duplicate detection stores evidence once and lets observations reuse it. |
| 48 | Command Centre is primarily read-only with contextual editing shortcuts. |
| 49 | Immediate mistakes use undo; established records use historical correction and recalculation. |
| 50 | Unknown is valid explicit data; missing required input is not silently treated as unknown or zero. |
| 51 | v1 uses the operating-system clock; the Season Engine interprets UTC timestamps through the season timeline. |
| 52 | Closed-app production is recomputed from timestamps and known state on reopen. |
| 53 | Recalculation is immediate after events and catches up after reopening; hourly refresh behaviour remains contingent on verified rules. |
| 54 | Exact Season 2 hourly scoring remains open and is a blocking research task. |
| 55 | In-game score is authoritative evidence; WarMap's reconstruction remains explainable and discrepancies are investigated. |
| 56 | v1 supports optional in-game score checkpoints with evidence and reconciliation data. |
| 57 | v1 displays a compact reconciliation status and fuller server/union detail; a dedicated workspace is later. |
| 58 | Invalid data is rejected; contradictory but valid evidence is retained, flagged, and excluded from authoritative scoring until resolved. |
| 59 | Confirmed actions persist immediately and transactionally; there is no global Save step. |
| 60 | v1 uses manual Windows releases and isolates application files from user data. |
| 61 | v1 has rotating technical logs, understandable errors, and safe failure; one-click diagnostic packaging is later. |
| 62 | v1.0.0 requires Feature, Correctness, Architecture, and Operational gates. |
| 63 | Architecture findings use KEEP/REFACTOR/REMOVE/DEFER-PRESERVE; useful seams stay, future clutter goes. |

## 5. Phased route to v1.0.0

Each phase is a bounded milestone. No later phase may rely on an unverified claim from an earlier one.

| Phase | Work | Dependencies | Concise Definition of Done |
|---:|---|---|---|
| Prerequisite. Skills Enablement | **Purpose:** install and validate the seven repository-scoped WarMap skills under `.agents/skills` before codebase work begins. **Skills:** `improve-codebase-architecture`, `code-review`, `warmap-behaviour-tests`, `verify-work`, `simplify-codebase`, `research-game-rule`, `design-feature`. **Dependencies:** none. | None | Exactly seven skills are present; every skill has valid `SKILL.md` and `agents/openai.yaml` files; folder and frontmatter names match; no template placeholders remain; Codex discovers the skills in the IDE; a representative read-only verification succeeds; no application code, authoritative data, or approved assets were modified. |
| 0. Establish authoritative baseline | Obtain the actual current repository/commit; inventory features, tests, packages, schemas, migrations, and docs; reconcile it with this plan and the supplied archives. Use `verify-work` and `code-review`. | Skills Enablement | One named commit/build is the source of truth; every claimed existing capability is marked Present/Partial/Absent with evidence; no implementation is duplicated from an older snapshot. |
| 1. Stability baseline | Run the full development workflow regression, then a smaller packaged Windows smoke test. Triage failures Critical/Major/Minor. | Phase 0 | All implemented workflows have recorded results; no open Critical defect; Major defects are fixed or explicitly block Phase 2; current package starts and survives its core open/edit/save/reopen journey. |
| 2. Code and architecture review | Run implementation review and architecture review; map boundaries among UI, renderer, Season Engine, scoring, data model, persistence, evidence, derived state, and Electron; classify questionable code. | Phase 1 | Every significant finding is KEEP/REFACTOR/REMOVE/DEFER-PRESERVE with rationale; blocking coupling/duplicated authority has an accepted remediation backlog; no speculative feature redesign. |
| 3. Authoritative data and persistence foundation | Implement/refactor stable identities, season participation, events, observations, evidence metadata, histories, rule versions, database transactions, and rebuildable snapshots. Establish migration and repository boundaries. | Phase 2 | A confirmed edit commits atomically; event/observed/recorded times and unknown windows round-trip; current state can be deleted and rebuilt; server/season data cannot leak; the persistence schema—including Option A generation manifest/document schemas—is migrated safely in tests. |
| 4. Season lifecycle and manual operations | Complete verified Season 1/2 packages, Draft/Active/Archived lifecycle, server registration, union management, ownership/capture workflows, notes/objectives, undo/redo, historical correction, evidence attachment, and conflict handling. | Phase 3 | A user can create/load, activate, operate, archive, reopen, and view both verified seasons; manual evidence-backed captures support now/exact/window time; corrections preserve history; archived seasons are protected. |
| 5. Season 2 rule research gate | Gather official or reproducible observations for hourly scoring and produce a versioned rule specification plus golden scenarios. May run in parallel after Phase 0, but integrates against Phase 3 contracts. | Phase 0; integrates with Phase 3 | Every required timing question in Decision 54 is answered with evidence or explicitly bounded; rule version and fixtures are approved; no working assumption is presented as fact. |
| 6. Scoring and reconciliation | Implement Season 1 and Season 2 scoring components, uncertainty ranges, all-union/Unknown accounting, provenance, cache/rebuild checks, refresh/catch-up behaviour, checkpoints, and discrepancy display. | Phases 3, 4, 5 | Golden scenarios pass exactly; uncertain scenarios produce correct ranges; close/reopen and historical correction reproduce results; clean rebuild equals cache; observed in-game checkpoints reconcile or show an explainable unresolved difference. |
| 7. Command Centre completion | Replace placeholders with derived season/server/union summaries, breakdowns, data quality, freshness, calculation time, and reconciliation status; add contextual editing navigation. | Phases 4 and 6 | Every displayed value traces to the derived-state/query layer; server switching never leaks data; summary fixtures match source events; dashboard remains primarily read-only and usable at supported window sizes. |
| 8. Recovery and operational hardening | Add managed evidence storage, duplicate hashes, rotating backups/logs, optional secondary backup, portable export/import, restore, protected migrations, safe errors, and user-data/install separation. | Phases 3-7 | Controlled backup/restore reproduces authoritative records, evidence, current state, and scores; failed migration/import preserves the last good data; logs rotate; errors are understandable; reinstall/update leaves user data intact. |
| 9. Quality convergence | Repeat code review, behaviour tests, controlled simplification, dependency/security review, performance checks, accessibility/usability checks, and complete documentation reconciliation. | Phases 6-8 | No Critical or Major defect remains; accepted Minor defects are documented; obsolete paths are removed or intentionally preserved; automated behaviour suite and docs describe the shipped system; fresh setup/build instructions work. |
| 10. Release candidate and v1 gates | Freeze v1 scope, build from a clean state, execute formal gates, create release notes and rollback/restore instructions, then tag v1.0.0. | Phase 9 | All four gates below are signed off with evidence from the same release candidate; installer/package hash and version are recorded; v1.1/later work is absent or safely DEFER-PRESERVE. |

### Critical path

The main dependency chain is:

**Skills Enablement -> authoritative-source baseline (Phase 0) -> stability -> architecture -> authoritative data/persistence -> manual season operations -> verified scoring -> Command Centre -> recovery/hardening -> quality convergence -> release gates.**

Season 2 rule research should start as soon as Phase 0 identifies the current scoring code and evidence, but it cannot be allowed to delay unrelated foundation work. It blocks Phase 6, not Phases 1-4.

## 6. The four v1.0 release gates

### Feature gate

Pass when every item classified as v1.0 is implemented in the release candidate, every user journey has acceptance coverage, and unfinished or experimental code is removed or explicitly DEFER-PRESERVE. v1.1 and Option B/C items do not block release.

### Correctness gate

Pass when:

- Season 1 and verified Season 2 scoring rules pass golden behaviour scenarios.
- Exact captures, ownership changes, uncaptured structures, uncertain windows, corrections, all-union/Unknown accounting, and season boundaries behave correctly.
- Score checkpoints and discrepancy handling work without masking differences.
- Close/reopen, archive/reopen, backup/restore, export/import, cache rebuild, and database migration preserve or correctly regenerate results.
- No unknown value silently becomes zero and no conflicting evidence silently alters authoritative scoring.

Decision 54 must be resolved with evidence before this gate can pass.

### Architecture gate

Pass when:

- Authoritative events/rules/evidence are distinct from derived state and UI state.
- Renderer/UI, Season Engine, scoring components, persistence, evidence storage, and Electron host have enforced boundaries.
- The Season Engine does not depend on the desktop window or application uptime.
- Stable IDs, season/server isolation, rule versioning, rebuilds, migrations, and future actor fields are consistent.
- No serious duplicated authority, obsolete path, or coupling threatens correctness, completion, or later Option B/C hosting.
- Decision 63 triage is complete and all release-blocking REFACTOR/REMOVE items are closed.

### Operational gate

Pass using the actual packaged Windows release candidate, not only development mode. The test must cover install/start, Season 1/2 load, season activation, server registration, union/ownership/capture entry, evidence attachment, score and checkpoint display, close/reopen, archive/view, backup/export, restore/import, migration/rollback where applicable, logs/errors, and safe update/reinstall with user data preserved.

## 7. Suggested Skills

Keep the agreed skill set small and make every skill produce evidence:

| Skill | Purpose | Required use |
|---|---|---|
| `improve-codebase-architecture` | Find exposed complexity, misplaced authority, leaky layers, and host coupling; propose bounded improvements rather than automatic rewrites. | Phase 2 and before the Architecture gate. |
| `code-review` | Review implementation against both repository standards and the accepted phase specification; prioritise correctness, unsafe mutation, validation, async/persistence failures, Electron security, and misleading tests. | Phase 1, after each substantial phase, and Phase 9. |
| `warmap-behaviour-tests` | Express game/application rules as implementation-independent Given/When/Then scenarios across seasons, uncertainty, corrections, persistence, migration, and recovery. | Build continuously from Phase 1; mandatory for Phases 4, 6, 8, and the Correctness gate. |
| `verify-work` | Confirm files changed as claimed, scope matches, commands genuinely ran, builds/tests are real, behaviour exists, dependencies are legitimate, and no secrets or unrelated changes were introduced. | Every AI coding task and every phase exit. |
| `simplify-codebase` | Reduce duplicated concepts, dead paths, unnecessary dependencies, and cognitive load without simplifying merely for line count. Apply Decision 63 classifications. | Only after a milestone is behaviourally stable, especially Phases 2 and 9. |
| `research-game-rule` | Separate Verified Fact, Observed Behaviour, Working Assumption, and Unknown; retain sources/evidence and translate approved rules into fixtures. | Mandatory for Decision 54 and any other unverified mechanic before implementation. |
| `design-feature` | Bound a feature through purpose, existing architecture, authoritative data affected, UI behaviour, edge cases, tests, and release scope. | Before each significant implementation item; it may clarify implementation but must not reopen locked product decisions. |

The standard implementation loop is:

**`design-feature` -> implementation -> `code-review` -> `warmap-behaviour-tests` -> `verify-work`**

Use `research-game-rule` before that loop whenever game facts are uncertain. Use `improve-codebase-architecture` at major structural milestones and `simplify-codebase` only after behaviour is stable.

## 8. Final v1.0 Definition of Done

MLG WarMap v1.0.0 is done when the same packaged Windows release candidate passes all four gates; both verified seasons work end to end; Season 2 scoring is based on researched mechanics rather than assumption; authoritative records survive correction, closure, migration, backup, restore, and reinstall; derived state and scores rebuild reproducibly; documentation matches the release; and every non-v1 item is explicitly assigned to v1.1 or later Option B/C work.
