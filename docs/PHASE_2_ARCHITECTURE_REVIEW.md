# Phase 2 Architecture Review

**Review completion:** **VERIFIED**  
**Application release readiness:** incomplete; the application is not release-ready.  
**Review mode:** read-only; no application code, tests, data, assets, skills, Completion Plan, or existing reports were modified.

**Audit baseline:** branch `main`, commit `70324ae59209fe226b3e000c7f35a51f0c5d73af`, clean working tree. The full regression and Phase 1 development/package runtime checks had already passed at this commit.

## Scope

This review synthesizes the original Phase 2 architecture audit and its focused evidence refinement. The refined findings take precedence where they differ. It inspected the repository instructions, Completion Plan, Phase 0 report, decisions, package and Electron entry points, application composition, renderer, season packages, domain services, persistence contracts, tests, and focused boundary suites.

## Current Architecture Summary

MLG WarMap is an Option A Windows-first Electron application:

- `main.js` owns the `BrowserWindow`, persistence IPC handlers, and the filesystem-backed envelope store.
- `preload.js` exposes a narrow `loadEnvelope`/`saveEnvelope` bridge with `contextIsolation: true` and `nodeIntegration: false`: [main.js](../main.js#L24-L36), [preload.js](../preload.js#L1-L14).
- `application-bootstrap.js` validates packages and injected factories, initializes Season Administration, loads the requested package, and composes the domain runtimes and persistence controllers: [src/app/application-bootstrap.js](../src/app/application-bootstrap.js#L150-L330).
- `map-renderer.js` owns workspace navigation, map rendering, selection, camera behavior, Season Management, Data Management UI, mutation orchestration, and persistence requests. It is 3,777 lines in the audited source.
- Season packages provide immutable setup definitions consumed by the Game Rules Engine. Season Administration owns prepared-package and activation lifecycle: [src/services/season-administration-service.js](../src/services/season-administration-service.js#L231-L247), [src/services/game-rules-engine.js](../src/services/game-rules-engine.js#L95-L190).
- Strategic, evidence, and Data Management runtimes are composed through frozen module registries and expose host-neutral services: [src/app/strategic-domain-module-registry.js](../src/app/strategic-domain-module-registry.js#L1-L67), [src/app/evidence-domain-module-registry.js](../src/app/evidence-domain-module-registry.js#L1-L34), [src/app/data-management-module-registry.js](../src/app/data-management-module-registry.js#L1-L40).
- `ServerStateService` owns the current per-server ownership projection. Strategic ownership records and histories are the authoritative ownership facts; summaries consume the current projection as derived operational state: [src/services/map-ownership-coordinator.js](../src/services/map-ownership-coordinator.js#L216-L270), [src/services/summary-service.js](../src/services/summary-service.js#L187-L210).
- Persistence currently stores separate server-state and Data Management envelopes through the same storage-neutral Electron file boundary.

## Boundary and Authority Map

| Boundary | Owner | Inputs and outputs | Authority and persistence | Host/UI dependency | Coverage |
|---|---|---|---|---|---|
| Electron host/storage | `main.js`, `preload.js`, `src/main/persistence-file-store.js` | IPC envelope requests and JSON files | Storage only; hashed JSON envelopes under `userData/warmap-state` | Electron-only at host boundary | Persistence storage tests |
| Application composition | `src/app/application-bootstrap.js` | Packages, factories, bridge; bootstrap context | No domain authority | Browser bootstrap plus preload bridge | Bootstrap tests |
| Season lifecycle and rules | `season-administration-service.js`, season packages, `game-rules-engine.js` | Prepared packages and activation requests | Package rules and lifecycle state; activation envelope persisted | Storage adapter injected | Package, loader, administration tests |
| Server-state projection | `server-state-service.js` | Server registration and ownership overrides | Current operational projection, not ownership fact authority; server-state envelope | Host-neutral service | Server-state and persistence tests |
| Strategic authoritative facts/history | Strategic domain runtime and ownership/verification/snapshot services | Scoped ownership facts, observations, relations, confirmations | Authoritative fact/history services; Data Management envelope | Host-neutral services | Domain and ownership tests |
| Evidence metadata | Evidence domain runtime and evidence services | Asset metadata and evidence records | Metadata/review authority; no managed bytes | Host-neutral services | Evidence service/persistence tests |
| Renderer/orchestration | `src/map-renderer.js` | DOM events, services, map data; rendered workspaces | UI/transient state; initiates mutations and persistence | Direct DOM and browser APIs | UI contracts and runtime smoke tests |
| Derived summaries | `src/services/summary-service.js` | Rules, map, union registry, server projection | Rebuildable calculated output; no stored dashboard authority | Host-neutral | Summary tests |
| Scoring | Package calculation metadata and summary calculation paths | Rules and ownership projection | Incomplete; no independent score execution, provenance, checkpoint, or reconciliation authority | Host-neutral | Summary tests only |
| In-memory transactions | `atomic-operation-executor.js` | Snapshot-capable participants | Snapshot/restore rollback in memory | Host-neutral | Atomic and ownership tests |
| Durable transactions | Per-domain persistence controllers and file store | Separate envelope writes | Per-file atomic rename only; no cross-envelope transaction | Electron storage boundary | Independent persistence tests; no cross-envelope failure test |
| Option B/C seams | Injected factories, host-neutral services, storage adapters, scoped authorization model | Runtime contracts can be hosted elsewhere | No collaboration infrastructure added | Desktop-specific only at Electron boundary | Factory/source-boundary tests |

## Existing Architecture Defects

### Major: Separate durable envelope writes for one confirmed multi-domain mutation

**Classification:** `REFACTOR`

A territory ownership mutation begins in the renderer and enters `MapOwnershipCoordinator`, which creates the strategic ownership fact/history and verification, then updates the `ServerStateService` projection inside one in-memory atomic operation: [src/map-renderer.js](../src/map-renderer.js#L2825-L2859), [src/services/map-ownership-coordinator.js](../src/services/map-ownership-coordinator.js#L103-L160).

The renderer then queues two independent persistence requests in parallel:

```js
Promise.all([
  serverStatePersistenceController.requestSave(),
  dataManagementPersistenceController.requestSave()
])
```

Evidence: [src/map-renderer.js](../src/map-renderer.js#L2856-L2859).

The two persisted identities are separate:

- Server-state: `{ seasonId, baseMapId }`, written by `PersistenceService`: [src/services/persistence-service.js](../src/services/persistence-service.js#L250-L330).
- Data Management: `{ scope: "data_management", seasonId }`, containing registry, strategic, and evidence domains: [src/services/data-management-state-persistence-service.js](../src/services/data-management-state-persistence-service.js#L157-L199), [src/services/data-management-state-persistence-service.js](../src/services/data-management-state-persistence-service.js#L250-L290).

The file store gives each file its own hashed path and temporary-file-plus-rename behavior: [src/main/persistence-file-store.js](../src/main/persistence-file-store.js#L15-L70), [src/main/persistence-file-store.js](../src/main/persistence-file-store.js#L105-L145). It provides no generation, journal, cross-envelope commit, or reconciliation mechanism.

Close/reopen loads the Data Management runtime and server state separately: [src/map-renderer.js](../src/map-renderer.js#L3569-L3588). There is no startup comparison or repair of the pair.

**Reachable consequence:** if the Data Management write succeeds and the server-state write fails, strategic ownership history can persist while the current server projection remains old. If the reverse occurs, the projection can persist while strategic history does not. Reopen can therefore produce mismatched durable state without an explicit recovery result.

**Smallest behavior-first scenario required before implementation:**

> Given a confirmed ownership mutation that changes strategic history and the server projection, when the second envelope write fails after the first succeeds, close and reopen must restore both changes or neither, with an explicit recovery error.

No fault-injection test currently exists, and this defect has not been repaired.

**Severity:** Major. **Blocks Phase 3:** yes, once Phase 3 expands authoritative event/history persistence beyond the current snapshot arrangement.

### Major structural risk: Renderer concentration and persistence orchestration

**Classification:** `REFACTOR`

`map-renderer.js` owns global application state, workspace rendering, map rendering, selection, camera state, Season Management, Data Management UI, mutation coordination, and persistence requests: [src/map-renderer.js](../src/map-renderer.js#L1-L190), [src/map-renderer.js](../src/map-renderer.js#L1580-L1645), [src/map-renderer.js](../src/map-renderer.js#L2850-L2865).

**Reachable consequence:** adding authoritative event, evidence, correction, or review workflows requires changing the same large module and risks coupling transient UI state to durable writes. This is a structural completion risk, not evidence that current Phase 1 behavior is already broken.

**Smallest direction:** extract application mutation/persistence orchestration and workspace controllers while preserving the existing service boundaries. Do not redesign settled behavior.

**Severity:** Major. **Blocks Phase 3:** conditional; it becomes a blocker if Phase 3 adds new authoritative workflows through this renderer boundary.

### Minor: Incomplete composition-time method-contract validation

**Classification:** `REFACTOR`

`data-management-runtime.js` validates several strategic and evidence members as objects but does not validate all required methods before wiring coordinators: [src/app/data-management-runtime.js](../src/app/data-management-runtime.js#L94-L124).

**Reachable consequence:** a malformed future runtime can fail on the first operation instead of during composition, making missing service wiring harder to diagnose.

**Smallest direction:** validate the method interfaces required by each injected runtime member at composition time.

**Severity:** Minor. **Blocks Phase 3:** no, but should precede adding more domain operations.

## Required v1 Capabilities Absent or Partial

These are planned capabilities, not regressions in existing implemented behavior:

| Capability | Classification | Current status |
|---|---|---|
| Managed evidence-byte storage | `DEFER-PRESERVE` | Metadata, hashes, and `storageRef` exist; no byte copy/read/delete path is wired |
| Complete evidence/review UI | `DEFER-PRESERVE` | Domain services exist; complete visible workflow is absent |
| Scoring execution and reconciliation | `DEFER-PRESERVE` | Package metadata and summary calculations exist; no full score authority |
| Backup/restore | `DEFER-PRESERVE` | Not implemented |
| Export/import | `DEFER-PRESERVE` | Not implemented |
| Migrations and rollback retention | `DEFER-PRESERVE` | Not implemented |
| Rotating technical logs | `DEFER-PRESERVE` | Not implemented |

The evidence metadata groundwork should be preserved. `EvidenceManagementService` accepts metadata, a caller-supplied `storageRef`, and a caller-supplied hash, but no service accepts bytes or performs copying: [src/services/evidence-management-service.js](../src/services/evidence-management-service.js#L150-L205), [src/services/evidence-asset-service.js](../src/services/evidence-asset-service.js#L70-L145). The Electron bridge only supports JSON envelope load/save: [preload.js](../preload.js#L1-L14), [src/main/persistence-file-store.js](../src/main/persistence-file-store.js#L88-L145).

## Classification Table

| System/path | Classification | Severity | Phase 3 impact |
|---|---|---:|---|
| Electron isolation and preload bridge | `KEEP` | — | No |
| Application bootstrap composition | `KEEP` | — | No |
| Frozen module registries | `KEEP` | — | No |
| Season package/administration authority | `KEEP` | — | No |
| Game Rules Engine immutability | `KEEP` | — | No |
| Server identity/state scoping | `KEEP` | — | No |
| Stable union identity/matching | `KEEP` | — | No |
| Host-neutral domain services | `KEEP` | — | No |
| In-memory atomic executor | `KEEP` | — | No |
| Pure summary service | `KEEP` | — | No |
| Cross-envelope durable transaction boundary | `REFACTOR` | Major | Yes |
| Renderer orchestration concentration | `REFACTOR` | Major | Conditional |
| Data Management interface validation | `REFACTOR` | Minor | No |
| Managed evidence-byte storage | `DEFER-PRESERVE` | Major | No |
| Score execution/reconciliation | `DEFER-PRESERVE` | Major | No |
| Backup/restore/export/import | `DEFER-PRESERVE` | Major | No |
| Migrations and rollback | `DEFER-PRESERVE` | Major | No |
| Rotating logs | `DEFER-PRESERVE` | Major | No |

No `REMOVE` item is included. The alleged legacy startup implementation was not found in tracked source. The former `SEASON_1_DEFINITION` appears only in a deliberate negative-test fixture and historical documentation: [tests/application-bootstrap.test.js](../tests/application-bootstrap.test.js#L101-L112), [tests/application-bootstrap.test.js](../tests/application-bootstrap.test.js#L740-L760), [docs/Season-Package-Schema.md](Season-Package-Schema.md#L40-L48). It is not an active compatibility fallback or an Option B/C preparation path.

## Dependency-Ordered Remediation Backlog

1. Define the authoritative event/current-state durable transaction boundary.
2. Add the behavior-first cross-envelope failure scenario described above.
3. Implement atomic or journaled durable persistence for confirmed multi-domain operations.
4. Add composition-time method-interface validation.
5. Extract mutation/persistence orchestration from the renderer before expanding authoritative workflows.
6. Add managed evidence-byte storage, hash/deduplication behavior, retention, and reopen/read semantics.
7. Research Decision 54 and approve versioned scoring rules.
8. Implement score execution, provenance, rebuilds, checkpoints, and reconciliation.
9. Implement backup/restore, export/import, migration/rollback, and rotating logs.
10. Re-run architecture review and remove only proven obsolete transitional paths.

## Exact Phase 3 Blockers

Phase 3 should not be marked complete for the v1 authoritative-record model until:

- a confirmed multi-domain mutation cannot leave its durable envelopes mismatched;
- authoritative event/history persistence is defined separately from current projections;
- close/reopen behavior detects or prevents partial durable commits;
- new authoritative workflows no longer coordinate independent durable writes directly from the renderer.

The current territory-only path is operationally tested, but that does not prove the broader v1 persistence contract.

## Non-Findings and Remaining Evidence Gaps

### Non-findings

- No current legacy startup path was found.
- No direct renderer filesystem or IPC access was found.
- No current cross-server ownership leakage was found.
- No union identity dependence on visible names or colours was found.
- No host dependency in reviewed domain services was found.
- No circular runtime dependency was established.
- No evidence that the current summary service stores independent dashboard authority was found.

### Evidence gaps

- No fault-injection test currently proves cross-envelope durable failure behavior.
- Managed evidence-byte persistence is not implemented and therefore cannot be runtime-verified.
- Backup, restore, export, import, migrations, and rotating logs remain unimplemented.
- Full hosted Option B/C deployment behavior remains unverified.
- Complete evidence/review UI remains unverified.

## Season 2 Research Boundary

Decision 54 remains explicitly research-blocked. This review does not state or infer the Season 2 hourly-scoring mechanic. Any scoring implementation must wait for evidence-backed rule classification and approved behavior fixtures.

## Option A and Options B/C

Option A Windows desktop remains the first target. The review recommends preserving host-neutral domain services, injected factories, storage adapters, scoped authorization contracts, and application composition boundaries so later Options B/C remain viable.

No hosted backend, authentication, collaboration, or multi-user implementation is recommended for v1. Those are later hosting concerns and must not be introduced as speculative architecture now.

## Phase 2 Definition of Done Assessment

| Criterion | Assessment |
|---|---|
| Real dependency and data-flow boundaries traced | Met |
| Authority, derived-state, and persistence responsibilities identified | Met |
| Required invariants checked against source | Met, with durable cross-envelope defect retained |
| Significant systems classified KEEP/REFACTOR/REMOVE/DEFER-PRESERVE | Met; no unsupported REMOVE item remains |
| Non-KEEP findings include severity, evidence, consequence, direction, and Phase 3 impact | Met |
| Planned missing capabilities separated from existing defects | Met |
| Decision 54 preserved as research-blocked | Met |
| No speculative redesign introduced | Met |
| Read-only review completed | Met |

Phase 2 architecture review is ready to be used as the permanent report.

## Verification Record

- Exact audited commit: `70324ae59209fe226b3e000c7f35a51f0c5d73af`.
- Branch: `main`.
- Git state before this report was created: clean.
- Focused checks used during the audit: `npm run test:map-ownership`, `npm run test:persistence-service`, `npm run test:data-management-state-persistence`, `npm run test:evidence-assets`, `npm run test:evidence-management`, `npm run test:evidence-domain-persistence`, and `npm run test:summary-service`.
- The full 77-file regression and Phase 1 development/package runtime checks had already passed at the named commit.
- No missing capability was claimed as runtime-tested. No fault-injection test was claimed or created.
- This report was created as documentation-only work after the clean baseline was confirmed.
