# Hosted Scalability Boundaries

## 1. Purpose

This document defines how MLG WarMap should evolve from the current local Electron application into a hosted, multi-user application without coupling domain behavior to one storage mechanism.

The goal is architectural adaptability. It does not commit the project to building hosted infrastructure immediately.

## 2. Confirmed Direction

- The hosted application will use a central API and database as the authority for shared state.
- The current Electron file store remains a local development and desktop persistence adapter.
- Local save envelopes are not the intended collaboration mechanism.
- Import/export and backup workflows are not current requirements.
- Application and domain services must remain independent of the final storage backend.
- The application remains descriptive rather than prescriptive.

## 3. Current Runtime Position

The current desktop runtime separates:

- canonical Season Package definition and validation
- Game Rules Engine
- authoritative Server State Service
- pure Summary Service calculations
- persistence serialization and validation
- persistence coordination
- Electron file storage
- application bootstrap and renderer composition

This separation is a valid foundation for future hosting.

The current version 1 persistence envelope stores per-server territory ownership as one local snapshot. It is suitable for:

- validating save and restoration behavior
- local desktop operation
- testing persistence boundaries

It is not the final shared-state model because whole-envelope replacement does not support safe concurrent editing.

## 4. Target Hosted Shape

```text
Web or Desktop Client
        |
        v
Application Commands and Queries
        |
        v
Hosted API
        |
        v
Domain Validation and Authorization
        |
        v
Central Database
        |
        +-- Audit History
        +-- Evidence Metadata
        +-- Real-Time Update Delivery
```

Clients display state and submit explicit operations. They do not directly modify database records or become authoritative for shared validation.

## 5. State Categories

### Locked season configuration

Examples:

- structure catalogue
- structure point or resource values
- resource definitions
- capture and scoring rules
- phase and unlock definitions
- map references

This state is validated, initialized, locked, and versioned deliberately. Ordinary server updates must not silently change it.

### Shared registry data

Examples:

- union identity
- union tag
- aliases
- presentation color
- archived status

Union identity remains separate from server-specific activity, native status, strength, and ownership.

### Mutable shared server state

Examples:

- territory and structure ownership
- native-union assignments
- active-union status
- combat-strength observations
- factual server observations
- confirmed evidence-derived changes

Hosted storage is authoritative for this state.

### Derived data

Examples:

- territory percentages
- controlled territory totals
- structure totals
- resource values
- server comparisons
- completeness calculations

Derived data must be reproducible from authoritative state and rules. It must not become an independent competing authority.

### User-specific state

Examples:

- camera position
- layout preference
- selected workspace
- personal display settings

User-specific state must not be confused with shared strategic data.

## 6. Application Operations

User interfaces should call explicit application operations rather than editing storage objects.

Examples:

```text
SetTerritoryOwner
SetStructureOwner
CreateUnionIdentity
UpdateUnionIdentity
AssignNativeUnion
RecordUnionServerAssociation
RecordCombatStrengthObservation
CreateServerObservation
ConfirmProposedChange
InitializeSeasonConfiguration
CorrectLockedSeasonConfiguration
```

Each operation should:

- identify the season and affected server where applicable
- identify the actor when authentication is available
- validate required fields
- enforce domain rules
- carry an expected record or aggregate version when shared concurrency applies
- produce a clear success, validation failure, authorization failure, or conflict result

The same operation contract should be usable by a local implementation during development and a hosted API implementation later.

### Authorisation policy

The hosted backend must authorise every state-changing operation. Client-side visibility or disabled controls may improve usability but must never be treated as security.

Each authenticated account receives scoped capabilities. Roles bundle common capabilities without forcing domain services to depend on broad checks such as `isAdmin`.

Initial role bundles:

- Viewer: read confirmed information.
- Contributor: enter manual facts and create proposals within an allowed scope.
- Reviewer: confirm or reject proposals and corrections within an allowed scope.
- Season Administrator: manage unions, servers, season configuration, and scoring rules.
- System Administrator: manage accounts, roles, capabilities, and platform settings.

Initial capability vocabulary:

- `server_state.edit`
- `proposal.review`
- `union_registry.manage`
- `season_rules.manage`
- `user_access.manage`

Capabilities may be scoped to selected seasons or servers. An account can therefore hold different effective access on different servers.

Manual facts entered by an authorised user become confirmed when explicitly saved. The operation records the actor and time. Automated and screenshot-derived facts remain proposed until reviewed unless a later trusted-source policy explicitly permits automatic confirmation.

The current desktop application remains a single-trusted-user environment because it has no authentication system. A storage-neutral capability policy and authorised Data Management operation boundary now exist, including season/server scoping. The trusted local actor is a temporary adapter-level identity and does not bypass those operation checks.

### Season structure-value operations

Simple season resource and scoring values are authored through structured fields or tables. For example, an authorised user may assign value X to the Royal City structure type and value Y to the Town structure type.

The operation targets the stable structure type or code. Placed logical structures reference that type, and footprint tiles remain projections of the logical structure rather than independent rule records.

The hosted system must:

- validate the structure type, resource, unit, metric type, and calculation-model references;
- store the versioned season rule centrally;
- apply the rule through the Game Rules Engine and summary pipeline;
- calculate server and union totals from confirmed ownership;
- avoid persisting independently editable calculated totals;
- avoid multiplying a per-structure value once per footprint cell unless the declared rule explicitly defines a per-cell calculation.

Complex mechanics may reference reusable calculation rules while simple structure values remain directly editable. This hybrid model keeps ordinary authoring accessible without limiting future season mechanics.

### Season initialization and locking

The normal hosted workflow assumes that season rules and required setup are known before operational tracking begins.

```text
Complete season configuration
        ↓
Validate
        ↓
Initialize
        ↓
Lock
        ↓
Record mutable server intelligence
```

The hosted database does not require a general-purpose incomplete-draft workflow for normal season initialization. A season becomes operational only after the complete configuration validates.

Locked season setup includes the participating server definitions and stable identities, shared map, structures, structure values, resources, scoring, phases, unlocks, capture rules, and buffs.

Union involvement is not part of the locked server roster. Native assignments, active status, combat strength, ownership, observations, evidence, and review outcomes remain mutable operational intelligence.

The normal application must not expose routine editing of locked season rules after initialization. An exceptional correction:

- requires `season_rules.manage`;
- creates a new immutable configuration version;
- records the actor, time, and reason;
- preserves the earlier version;
- keeps historical snapshots linked to the configuration version used for their calculations.

This correction path exists for verified mistakes, later clarification, or an external game-rule change. It is not a routine season-management workflow.

### Known unions and activity derivation

Server association and activity are separate facts. A union may be known on a server while inactive.

The hosted domain operation must apply the following rule consistently:

- a known union without confirmed ownership history is inactive;
- confirmed ownership makes the union active;
- losing the final territory starts a fourteen-day verified zero-territory period while the union remains active;
- confirmed recapture cancels the period;
- a later final-territory loss starts a new period;
- fourteen full verified days without ownership changes the union to inactive;
- missing or stale server verification prevents automatic inactivity and produces stale or unverified activity evidence instead;
- retrospectively discovered unions may receive evidence-backed historical activity records.

The backend, not the UI, owns this derivation. It must preserve the confirmed ownership events, activity-status intervals, evidence coverage, and timestamps needed to reproduce the result.

### Manual provenance

The hosted backend automatically records the authenticated actor, entry timestamp, and `manual_entry` source type for manual facts.

Observation time defaults to entry time but may be supplied explicitly for retrospective data. Ordinary current manual entry does not require supporting evidence.

A correction that supersedes an existing confirmed fact requires a reason. Backdated historical information requires either supporting evidence or an explanatory note.

The backend validates and records these fields. Clients must not be trusted to substitute another actor identity or silently replace server-generated audit timestamps.

### Evidence storage and observation time

Screenshot source files belong in private object or file storage. The database stores stable EvidenceRecords and asset references rather than embedding image binaries in authoritative domain records.

The hosted boundary must:

- accept JPEG and PNG initially;
- detect and validate media type automatically;
- record exact upload time using the backend clock;
- accept user-friendly approximate observation input such as `2 hours ago`;
- resolve relative observation input to a fixed timestamp at submission;
- preserve whether the observation time is approximate;
- record uploader, file size, and an automatic integrity hash;
- keep the original asset immutable;
- prevent deletion while confirmed or historical facts reference the evidence.

An integrity hash verifies the preserved asset and supports duplicate detection. It is not a review or approval state.

Asset processing status and extracted-fact review state are separate:

- assets may be uploaded, processed, or failed;
- extracted proposals may be pending, confirmed, corrected, rejected, or superseded.

The current evidence policy does not introduce import/export or backup workflows.

### Screenshot intelligence service

Screenshot extraction is a replaceable supporting service behind the evidence-ingestion boundary.

```text
Upload adapters
        ↓
Evidence ingestion
        ↓
Private asset storage
        ↓
Extraction orchestrator
        ├── map-specific geometry and alignment
        ├── computer vision
        ├── OCR
        ├── cloud multimodal provider
        └── future specialised or local provider
        ↓
Normalized proposals
        ↓
Human review
        ↓
Authoritative application operations
```

The core domain does not depend on a specific cloud model. Providers return normalized candidate facts with evidence references, affected entities or coordinates, confidence, and ambiguity information.

The extraction boundary must account for:

- arbitrary supported zoom levels and viewport crops;
- map markers, menus, minimaps, and other obstructions;
- similar or identical colours;
- colour meanings that vary between servers or viewing contexts;
- small or partially obscured union tags;
- multi-cell structure footprints;
- partial screenshots and overlapping evidence;
- newly discovered unions;
- regions that cannot be observed reliably.

Colour segmentation may identify visible regions but cannot independently establish stable union identity. Obscured and ambiguous areas remain unknown until resolved by other evidence or user review.

Direct application upload should be the first client of this pipeline. Discord is added later as a thin ingestion adapter that submits attachments and source metadata through the same API. Discord-specific code must not contain extraction, ownership, scoring, or confirmation rules.

Only the architecture and provider-neutral contract are prepared before this milestone. Model-specific implementations are added after representative screenshots can be labelled and evaluated.

## 7. Persistence Boundaries

### Current local path

```text
Application Service
        |
        v
Persistence Service
        |
        v
Electron File Adapter
```

### Target hosted path

```text
Application Service
        |
        v
Hosted API Client
        |
        v
Hosted Application Service
        |
        v
Database Repository
```

The hosted API must not simply reproduce unrestricted whole-envelope overwrites. Shared updates should operate on the smallest meaningful domain record or aggregate.

The existing local snapshot serializer may remain useful for the desktop adapter and tests without defining the hosted database shape.

## 8. Concurrency and Conflict Safety

Multi-user updates require version-aware writes.

Conceptual request:

```json
{
  "operation": "SetTerritoryOwner",
  "seasonId": "season-1",
  "serverId": "server-366",
  "territoryKey": "10-11",
  "ownerUnionId": "union-0001",
  "expectedVersion": 42
}
```

If the stored aggregate remains at version 42, the update may be accepted and produce version 43.

If another user has already changed the relevant state, the operation must return a conflict rather than silently overwriting newer work.

Conflict behavior must be explicit. Last-write-wins must not be assumed for authoritative strategic data.

## 9. Audit and Provenance

Shared changes should eventually preserve:

- actor
- timestamp
- operation
- affected season and server
- previous value
- accepted value
- resulting version
- evidence reference where applicable
- review or confirmation state where applicable

Combat strength and other observations remain historical records. A new observation does not erase the previous observation.

## 10. Real-Time Updates

Real-time delivery is a hosted synchronization concern, not a renderer responsibility.

A future hosted client may receive accepted changes through WebSocket, server-sent events, or another subscription mechanism.

Incoming changes should update application state through the same state and application-service boundaries used by local actions. Renderers should react to supplied state rather than interpret transport messages directly.

## 11. Data Management UI Implications

The Data Management workspace must submit domain operations, not edit JSON files or persistence envelopes.

It should eventually provide:

- Season Setup for complete validation, initialization, locking, and exceptional correction
- Union Registry management
- Server Intelligence entry for native unions, activity, strength, and observations
- Evidence Review for proposed extracted data

The UI should distinguish:

- locked season configuration
- confirmed shared facts
- proposed changes
- historical observations
- derived values

For the initial local implementation, one trusted operator may have full editing access. The operation boundaries must still allow authorization rules to be added later without rewriting the UI.

## 12. Incremental Migration

The project should evolve without a full rewrite:

1. Define Data Management workflows and application operations.
2. Implement storage-neutral services for those operations.
3. Use local or in-memory adapters during desktop development.
4. Extract renderer responsibilities as new workspaces are introduced.
5. Introduce hosted API and repository implementations behind the established operations.
6. Add authentication, authorization, concurrency checks, audit history, and real-time delivery.
7. Retire Electron-only bootstrap assumptions when the web host is introduced.

Existing ownership, rules, state, and summary services should remain usable throughout this migration.

## 13. Current Scaling Assessment

### Strong foundations

- season-neutral package and validation boundary
- rules isolated from UI
- authoritative server-state boundary
- pure summary calculations
- storage adapter separation
- dependency composition through bootstrap

### Areas requiring planned improvement

- map-renderer.js currently holds too many UI and orchestration responsibilities
- bootstrap currently requires an Electron persistence bridge
- version 1 persistence replaces a complete local ownership snapshot
- capability authorization and Data Management operations are implemented as
  storage-neutral application services; authentication, durable account storage,
  concurrency, and transactional audit history remain planned
- Union and Server Intelligence read models are implemented as runtime-neutral
  application services; hosted API integration and operator-facing UI remain
  planned

## 14. Explicit Non-Goals

The following are not current requirements:

- import/export workflows
- user-managed backup files
- direct JSON editing as an end-user workflow
- database selection
- hosting-provider selection
- authentication-provider selection
- real-time transport selection
- collaborative editing implementation

These decisions should be made only when their implementation milestone is ready and the application operations are sufficiently defined.
