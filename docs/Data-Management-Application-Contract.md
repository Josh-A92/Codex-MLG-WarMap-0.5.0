# Data Management Application Contract

## 1. Purpose

This document defines the application-service boundary used by an authorised Data
Management workspace.

The boundary allows a desktop screen, hosted web client, API endpoint, bot, or
other trusted adapter to request the same domain operations without:

- editing JSON files or persistence envelopes;
- supplying its own authoritative actor identity or audit time;
- implementing domain lifecycle rules;
- deciding whether an operation is authorised;
- interpreting screenshot extraction as confirmed fact;
- depending directly on a future database or authentication provider.

The services are storage-neutral and UI-neutral.

## 2. Runtime Composition

`DataManagementRuntime` composes:

- `AuthorizationPolicyService`
- `UnionRegistryManagementService`
- `ServerIntelligenceManagementService`
- `UnionRegistrationCoordinator`

The runtime creates the coordinator's transaction executor from the Union
Registry, union/server/season relationship, and Native-Union Assignment
services. A failed multi-record registration restores all three participants
before the operation rejects. The UI does not supply or emulate this
transaction boundary.
- `EvidenceManagementService`
- `ReviewQueueService`
- `ProposalReviewManagementService`
- `DataManagementQueryService`

It consumes the existing global Union Registry, Strategic Domain Runtime, and
Evidence Domain Runtime. It does not replace them or create competing sources of
truth.

The application bootstrap now supplies the Evidence Domain and Data Management
module contracts and runtime factories to the renderer. The renderer composes
the Data Management Runtime after the Union Registry, Strategic Domain Runtime,
and Evidence Domain Runtime are available. User-facing controls remain a
separate workspace milestone.

## 3. Actor and Capability Contract

An authenticated adapter supplies an actor context:

```json
{
  "actorId": "user-01",
  "grants": [
    {
      "capability": "server_state.edit",
      "seasonId": "season-1",
      "serverId": "366"
    }
  ]
}
```

Each grant contains `capability`, `seasonId`, and `serverId`.

`seasonId: null` means all seasons. `serverId: null` means every server allowed by
the grant's season scope. A server-scoped grant must also identify its season.

The initial capability vocabulary is:

- `server_state.edit`
- `proposal.review`
- `union_registry.manage`
- `season_rules.manage`
- `user_access.manage`

Roles remain authentication/account-layer bundles. Application services authorize
capabilities, never role names.

The current desktop build may create a trusted local actor with all capabilities.
That is an adapter decision and does not bypass application authorization checks.

## 4. Authorization Rules

- Global Union Registry changes require global `union_registry.manage`.
- Known-union association and manual server intelligence require
  `server_state.edit` for the affected season and server.
- Evidence upload registration and extraction proposal creation require
  `server_state.edit` for the evidence season and server.
- Proposal confirmation or rejection requires `proposal.review` for the
  proposal's resolved season and server.
- Evidence review scope is resolved from trusted registered asset metadata, not
  from client-supplied review parameters.
- Authorization occurs before clocks, ID creation, or state-changing domain calls.
- Client-side visibility and disabled controls are never authorization decisions.

Authentication, account storage, password/session handling, and token validation
remain hosted-adapter concerns.

## 5. Global Union Registry Operations

`UnionRegistryManagementService` exposes:

- `createUnionIdentity(actor, identity)`
- `updateUnionIdentity(actor, unionId, changes)`
- `archiveUnionIdentity(actor, unionId)`
- `restoreUnionIdentity(actor, unionId)`

These operations preserve stable union identity, canonical aliases and presentation
metadata, archival history, and safe-copy behavior. Archiving a global identity
does not delete historical server intelligence.

## 6. Server Intelligence Operations

`ServerIntelligenceManagementService` exposes:

- `addKnownUnion(actor, input)`
- `recordManualNativeAssignment(actor, input)`
- `recordManualCombatStrength(actor, input)`
- `recordManualServerObservation(actor, input)`
- `recordManualTerritoryOwnership(actor, input)`
- `recordManualStructureOwnership(actor, input)`

The service owns:

- authorization scope;
- server-generated record identifiers;
- acting user attribution;
- confirmation and review timestamps;
- `manual_entry` provenance;
- observation-time defaults;
- creation of confirmed manual records;
- separation of territory targets and logical structure targets.

The client supplies factual values only. It cannot substitute another actor,
reviewer, source type, review state, or server-generated timestamp.

A union must be a current global identity before it can become known on a server.
Union-scoped intelligence then requires that known server relationship. This
preserves the distinction between global identity, known association, native
status, active status, ownership, and other observations.

## 7. Evidence Ingestion Operations

`EvidenceManagementService` exposes:

- `registerUploadedAsset(actor, input)`
- `createExtractionProposal(actor, input)`
- `resolveEvidenceScope(record)`

Asset registration records a stable asset ID, storage reference, server scope,
media metadata, upload actor/time, observation time/precision, integrity hash, and
initial processing state.

Actual byte transfer, object storage, Discord ingestion, and cloud-model invocation
remain adapter responsibilities. An extraction result becomes a proposed Evidence
Record and never becomes confirmed strategic state automatically.

## 8. Proposal Review Operations

`ProposalReviewManagementService` exposes:

- `confirmProposal(actor, itemType, itemId)`
- `rejectProposal(actor, itemType, itemId)`

Supported item types:

- `native_assignment`
- `combat_strength_observation`
- `server_observation`
- `territory_ownership`
- `structure_ownership`
- `evidence_record`

The service loads the canonical proposal, resolves its trusted scope, authorizes
the reviewer, supplies reviewer identity/time, preserves factual fields, and calls
the correct typed transition. A review screen therefore does not construct
lifecycle records.

## 9. Screen-Ready Read Projections

`DataManagementQueryService` exposes:

- `getUnionRegistryWorkspace()`
- `getEvidenceWorkspace()`
- `getServerWorkspace(request)`

The Union Registry projection includes current and archived identities.

The global Evidence projection includes all Evidence Assets and Evidence Records,
including manual evidence without an uploaded asset or server scope.

The server projection includes:

- current confirmed server intelligence;
- Native-Status history;
- combat-strength history;
- server-observation history;
- territory and logical-structure ownership history;
- evidence assets and records scoped to the server;
- pending reviews scoped to the server.

Returned data is copied and cannot mutate domain state.

Unscoped manual evidence remains available in the global Evidence workspace and is
not incorrectly attributed to a server.

## 10. Approved Screen Areas

The first user-facing Data Management design is now defined in
`docs/User-Interface-Design-Specification.md`.

Its approved navigation order is:

1. Territory & Evidence
2. Evidence Intake
3. Review Queue
4. Union Registry

Territory & Evidence is an evidence-approval and freshness workspace. Direct
territory and structure ownership changes remain map actions.

Evidence Intake treats screenshots as partial views, requires server scope, and
does not ask users to enter file metadata or coverage.

Union Registry exposes name, tag, colour, map pattern, and native server. Stable
union IDs and initial alias state are application-managed.

The UI may derive available actions from actor capabilities for usability, while
the application service remains authoritative.

Season Setup remains separate. The initial interface selects a prepared season
package, confirms its map/structure and resource/value configuration, then
activates it as read-only for normal use.

## 11. Corrections and Audit Boundary

Existing domain services preserve superseded records and typed correction paths.
Manual entry of a later confirmed Native-Status or ownership fact also supersedes
the prior current fact through those services.

A complete hosted correction workflow must additionally persist its required
reason in an application-operation audit record and apply the correction plus audit
append in one repository transaction.

That transaction and durable audit journal are intentionally not simulated inside
the current in-memory management services. They belong with the hosted repository
and concurrency milestone. A correction screen must not be presented as complete
until that audit transaction exists.

## 12. Unified Persistence Boundary

The desktop runtime persists the global Union Registry, active season Strategic
Domain, and Evidence Domain in one versioned Data Management envelope. One
storage identity selects the envelope by season. All three sub-envelopes share
one `savedAt` value and are restored together before the Data Management Runtime
is created.

This prevents a completed multi-record Union Registration from being split
across unrelated save files. The renderer sees only a persistence controller;
it does not construct envelopes or access the Electron storage bridge.

The current file adapter is a local implementation of that storage-neutral
boundary. A hosted database may replace it without changing the runtime or UI
operation contracts.

## 13. Deferred Hosted Concerns

The following are not embedded in these management services:

- authentication-provider selection;
- account and role storage;
- database selection;
- HTTP/API routing;
- durable operation audit journal;
- optimistic concurrency and version conflicts;
- real-time delivery;
- uploaded-byte storage;
- cloud-model or Discord adapter implementation.

These concerns must call the established application operations rather than bypass
them.

## 14. Current Status

The storage-neutral, authorized Data Management backend, atomic Union
Registration transaction, unified durable state envelope, and renderer startup
composition are implemented and tested.

The first user-facing Data Management, responsive map, and prepared Season Setup
designs are approved and documented.

The remaining application coordination gap before the approved screens can be
considered complete is one canonical map-ownership operation that creates
ownership history and refreshes the current map projection without competing
authorities. User-facing controls also remain unimplemented.
