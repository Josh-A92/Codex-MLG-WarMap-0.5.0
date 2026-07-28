# Server State Data Model

## 1. Purpose and Scope
This document defines the season-neutral authoritative model for mutable, server-specific state in MLG WarMap.

It covers:
- server definition
- current server state
- territory ownership
- structures
- confirmed snapshots
- data completeness
- server observations
- proposed changes
- derived values
- mapping from the current schema

The model is descriptive, not prescriptive. It records and relates mutable facts about one server in one season. It does not recommend actions, assign priority, or encode strategic judgments.

Out of scope:
- shared base-map definitions
- union identity
- season rules themselves
- UI styling
- application implementation details
- prescriptive or AI-generated conclusions

## 2. Design Principles
1. Keep shared base maps immutable.
2. Isolate mutable state by server and season.
3. Treat proposed changes as reviewable, not authoritative.
4. Preserve historical confirmed snapshots.
5. Distinguish unknown from confirmed unclaimed.
6. Derive summaries from authoritative records rather than storing opaque totals.
7. Keep evidence references valid when records are superseded.
8. Avoid MLG-specific assumptions in shared state fields.
9. Keep the model persistence-implementation neutral.
10. Do not mutate shared base-map objects to store server ownership.
11. Confirmed records are immutable and replaced by versioned successors rather than edited in place.
12. Current state may reference immutable records, but it must not become a second competing authority.

## 3. Entity Overview
The model is organized around seven core entities.

| Entity | Purpose | Primary key | Notes |
| --- | --- | --- | --- |
| ServerDefinition | Stable server identity and static configuration | `serverId` | Does not contain calculated dashboard totals |
| CurrentServerState | Operational aggregate for one server and season | `serverStateId` | Points to the authoritative confirmed snapshot and tracks drafts and observations |
| TerritoryOwnershipRecord | Immutable, versioned ownership fact for a normal map cell | `ownershipRecordId` | Separates owned, unclaimed, and unknown/not yet verified |
| StructureOwnershipRecord | Ownership fact for a logical structure | `structureOwnershipId` | Projected to footprint cells for rendering and area calculations |
| ConfirmedServerSnapshot | Immutable confirmed snapshot of server state | `snapshotId` | Drives dashboards and comparisons |
| ServerObservation | Short factual server note or observation | `observationId` | Descriptive only |
| ProposedChange | Reviewable proposed update from extraction or import | `proposalId` | Never becomes confirmed without review |

## 4. Server Definition
ServerDefinition describes stable and mostly static server identity.

### Fields
- `serverId` - stable server identifier
- `displayNumber` - human-visible server number
- `seasonId` - season identifier
- `baseMapRef` - reference to the shared base map definition
- `staticConfig` - static per-server configuration

### Rules
- ServerDefinition must not contain calculated dashboard totals.
- ServerDefinition must not contain mutable ownership state.
- ServerDefinition must not contain confirmed snapshot history.
- ServerDefinition may reference static configuration such as workspace labels or registry flags.
- Shared base-map objects remain immutable definitions.

### Example
```json
{
  "serverId": "server-366",
  "displayNumber": 366,
  "seasonId": "season-1",
  "baseMapRef": "season1-map",
  "staticConfig": {
    "displayLabel": "Server 366"
  }
}
```

## 5. Current Server State
CurrentServerState is the operational aggregate for a server and season. Its `currentConfirmedSnapshotId` points to the authoritative confirmed truth.

### Fields
- `serverStateId`
- `serverId`
- `seasonId`
- `schemaVersion`
- `currentConfirmedSnapshotId`
- `relationIds`
- `observationIds`
- `draftProposalIds`
- `operationalTimestamps`

### Rules
- CurrentServerState remains separate from the shared base map and the Game Rules Engine.
- CurrentServerState stores references, not a duplicate of the shared map definition.
- Operational timestamps do not replace snapshot, observation, or evidence timestamps.
- Draft edits and proposed screenshot changes must not alter the current confirmed snapshot until approved.
- A single snapshot is current for a server/season.
- Earlier snapshots remain historical.
- `currentConfirmedSnapshotId` is the authoritative pointer for confirmed server truth.
- CurrentServerState may reference draft proposals, observations, union relationships, and operational metadata.
- CurrentServerState must not contain a second competing authoritative ownership collection.

### Example
```json
{
  "serverStateId": "server-state-366-season-1",
  "serverId": "server-366",
  "seasonId": "season-1",
  "schemaVersion": 1,
  "currentConfirmedSnapshotId": "snapshot-2026-07-25-a",
  "relationIds": ["relation-366-mlg"],
  "observationIds": ["obs-501", "obs-777"],
  "draftProposalIds": ["proposal-44"],
  "operationalTimestamps": {
    "lastReviewAt": "2026-07-25T09:40:00Z"
  }
}
```

## 6. Ownership Model
Territory ownership records represent the authoritative state for map-cell ownership.

### Ownership states
- `owned`
- `unclaimed`
- `unknown`

### Review states
- `proposed`
- `confirmed`
- `rejected`
- `superseded`

### Fields
- `ownershipRecordId`
- `serverId`
- `seasonId`
- `territoryRef`
- `ownerUnionId`
- `ownershipState`
- `reviewState`
- `effectiveAt`
- `evidenceIds`
- `actorId`
- `reviewerId`
- `supersedesOwnershipRecordId`

### Rules
- Unknown territory is not the same as confirmed unclaimed territory.
- Each territory ownership fact identifies one normal, non-structure map cell.
- Owner union ID is present where the territory is owned.
- Ownership state and review state are separate concepts.
- The shared base map must never be mutated to store server ownership.
- Proposed changes remain proposal records until confirmed.
- Confirming a proposal creates a new immutable ownership record and a new immutable snapshot.
- Confirmed ownership records are immutable.
- Historical ownership records remain historically traceable.
- A replacement record should point backward using `supersedesOwnershipRecordId`.

### Example
```json
{
  "ownershipRecordId": "own-9001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "territoryRef": {
    "type": "map_cell",
    "row": 5,
    "col": 8
  },
  "ownerUnionId": "union-0001",
  "ownershipState": "owned",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "supersedesOwnershipRecordId": null
}
```

## 7. Structure-Ownership Boundary
Structure ownership relates to individual map cells, multi-cell structure footprints, and logical structure identity.

### Boundary rules
- Logical structure identity is the authoritative source for structure ownership.
- A structure has one owner state per server/season at a given effective time.
- Its multi-cell footprint is defined by the immutable active-season map definition.
- Footprint-cell ownership is projected from the logical structure owner for rendering and territory-area calculations.
- Structure footprint cells must not also hold independently editable ownership records.
- Normal non-structure map cells continue to use territory ownership records.
- A structure ownership change applies consistently to its full footprint.
- Structure ownership and ordinary cell ownership must never compete for authority over the same footprint cell.

### Authority note
Logical structure identity is the confirmed target authority. The current runtime ownership flow remains a compatibility implementation until migration to this model.

### Structure record fields
- `structureOwnershipId`
- `serverId`
- `seasonId`
- `structureId`
- `ownerUnionId`
- `ownershipState`
- `reviewState`
- `effectiveAt`
- `evidenceIds`
- `actorId`
- `reviewerId`
- `supersedesStructureOwnershipRecordId`

### Example
```json
{
  "structureOwnershipId": "structure-own-201",
  "serverId": "server-366",
  "seasonId": "season-1",
  "structureId": "structure-frost-mine-2",
  "ownerUnionId": "union-0001",
  "ownershipState": "owned",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "supersedesStructureOwnershipRecordId": null
}
```

## 8. Confirmed Snapshot Model
A confirmed snapshot is an immutable authoritative record of server state at a point in time.

### Fields
- `snapshotId`
- `serverId`
- `seasonId`
- `snapshotTimestamp`
- `ownershipRecordIds`
- `structureOwnershipRecordIds`
- `unionStatusRecordIds`
- `evidenceIds`
- `creatorId`
- `reviewerId`
- `reviewState`
- `completenessRecordIds`
- `previousConfirmedSnapshotId`

### Rules
- Confirmed snapshots are immutable.
- The latest confirmed snapshot drives Command Centre ownership statistics.
- The latest confirmed snapshot drives “Last updated”.
- The latest confirmed snapshot drives comparison with the previous confirmed snapshot.
- The latest confirmed snapshot drives territory-change calculations.
- Draft edits and proposed screenshot changes must not alter the latest confirmed snapshot until approved.
- Confirming reviewed changes creates immutable confirmed records and a new immutable snapshot.
- Evidence included in the snapshot must remain referenceable after supersession.
- Confirmed snapshots must reference immutable confirmed normal-cell ownership records.
- Confirmed snapshots must reference immutable confirmed logical-structure ownership records.
- Confirmed snapshots must reference the exact confirmed union relationship/status records effective at that time.
- Confirmed snapshots must reference the preceding confirmed snapshot.
- Historical snapshots must continue resolving to the exact facts confirmed at creation.

### Example
```json
{
  "snapshotId": "snapshot-2026-07-25-a",
  "serverId": "server-366",
  "seasonId": "season-1",
  "snapshotTimestamp": "2026-07-25T09:15:00Z",
  "ownershipRecordIds": ["own-9001", "own-9002"],
  "structureOwnershipRecordIds": ["structure-own-201"],
  "unionStatusRecordIds": ["native-assign-0142", "active-status-0281"],
  "evidenceIds": ["evidence-9001", "evidence-9002"],
  "creatorId": "user-01",
  "reviewerId": "user-01",
  "reviewState": "confirmed",
  "completenessRecordIds": [
    "complete-366-territory",
    "complete-366-structure",
    "complete-366-native",
    "complete-366-active",
    "complete-366-combat",
    "complete-366-review"
  ],
  "previousConfirmedSnapshotId": "snapshot-2026-07-20-b"
}
```

## 9. Data-Completeness Model
Data completeness is expressed through separate categories rather than a single opaque confidence percentage.

### Categories
- verified territory coverage
- structure verification
- native-union verification
- active-union information
- combat-strength coverage
- evidence awaiting review

### Fields
- `completenessId`
- `serverId`
- `seasonId`
- `snapshotId`
- `category`
- `value`
- `basis`
- `reviewState`
- `updatedAt`
- `evidenceIds`

### Rules
- Completeness is represented as immutable snapshot-bound derived records.
- A snapshot references completeness records by ID rather than duplicating the same values inline.
- Completeness records remain reproducible from confirmed snapshot state and evidence/review state.

### Reporting categories
- verified territory coverage
- structure verification
- native-union verification
- active-union information
- combat-strength coverage
- evidence awaiting review

### Example
```json
{
  "completenessId": "complete-366-territory",
  "serverId": "server-366",
  "seasonId": "season-1",
  "snapshotId": "snapshot-2026-07-25-a",
  "category": "verified_territory_coverage",
  "value": "376 / 400",
  "basis": "confirmed_snapshot",
  "reviewState": "confirmed",
  "updatedAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9002"]
}
```

## 10. Server-Observation Model
Server observations are short factual notes with provenance.

### Fields
- `observationId`
- `serverId`
- `seasonId`
- `text`
- `authorId`
- `observedAt`
- `evidenceIds`
- `reviewState`
- `archivedState`

### Rules
- Observations must be short, factual, and descriptive.
- Observations exclude objectives, recommendations, priorities, and suggested actions.
- Observations may be archived or superseded.
- Observation timestamps are separate from snapshot timestamps.
- Notes do not make the map appear freshly verified.
- Factual notes may be short and reviewable, but they do not become snapshot authority.

### Example
```json
{
  "observationId": "obs-501",
  "serverId": "server-366",
  "seasonId": "season-1",
  "text": "Confirmed native union updated after screenshot review.",
  "authorId": "user-01",
  "observedAt": "2026-07-25T09:40:00Z",
  "evidenceIds": ["evidence-9001"],
  "reviewState": "confirmed",
  "archivedState": "active"
}
```

## 11. Proposed-Change Workflow
Screenshot extraction and imports must create reviewable proposals rather than directly changing confirmed state.

### Supported proposal types
- proposed ownership change
- proposed union presence
- proposed native assignment
- proposed combat-strength observation
- ambiguous extraction requiring review

### Workflow
1. Capture the proposed value and raw source asset.
2. Store it as a proposal linked to evidence.
3. Mark it proposed or ambiguous.
4. Require confirmation, rejection, or supersession before it becomes authoritative.
5. Preserve the historical proposal after supersession.

### Example
```json
{
  "proposalId": "proposal-44",
  "serverId": "server-366",
  "seasonId": "season-1",
  "proposalType": "proposed_ownership_change",
  "targetRef": { "type": "map_cell", "row": 5, "col": 8 },
  "proposedValue": {
    "ownershipState": "owned",
    "ownerUnionId": "union-0001"
  },
  "reviewState": "proposed",
  "sourceType": "screenshot_extraction",
  "sourceAssetRef": "shot-2026-07-25-a",
  "evidenceIds": ["evidence-9002"],
  "reviewerId": null,
  "supersedesProposalId": null
}
```

## 12. Derived-Value Rules
These values are calculated, not stored as independent authoritative totals.

### Derived values
- controlled-territory percentage
- designated-player-union percentage
- resource value or production
- structure ownership totals
- active-union counts
- changes since the previous confirmed snapshot

### Rules
- Derived values must be reproducible from confirmed state and active-season rules.
- Calculated summaries must not become authoritative state in their own right.
- If the confirmed snapshot changes, derived values should be recomputable from that snapshot.
- Unknown territory must not be folded into confirmed unclaimed totals.
- Resource value or production remains derived from active-season rules and confirmed state.

## 13. Data Invariants
- Shared base maps remain immutable definitions.
- Mutable state is isolated by server and season.
- Unknown and confirmed unclaimed are different states.
- Proposed changes never silently become confirmed state.
- Historical confirmed snapshots are immutable.
- Calculated summaries are reproducible from confirmed state and active-season rules.
- Only one snapshot is current for a server/season, while earlier snapshots remain historical.
- Evidence references remain valid when state records are superseded.
- No MLG-specific behaviour is hard-coded into the shared model.
- The model remains persistence-implementation neutral.
- Review state never substitutes for the value of the fact being reviewed.
- Derived relation summaries must be reproducible from authoritative records.
- Automated extraction cannot create a confirmed record without an explicit trusted-source policy.
- Union identities are archived rather than destructively deleted when historical records reference them.
- Historical effective periods cannot overlap for the same status type and relationship.
- Logical structure identity is authoritative for structure ownership.
- Structure footprint cells cannot have an independent ownership authority.

## 14. Example JSON Records
### Server definition
```json
{
  "serverId": "server-366",
  "displayNumber": 366,
  "seasonId": "season-1",
  "baseMapRef": "season1-map",
  "staticConfig": {
    "displayLabel": "Server 366"
  }
}
```

### Current server state
```json
{
  "serverStateId": "server-state-366-season-1",
  "serverId": "server-366",
  "seasonId": "season-1",
  "schemaVersion": 1,
  "currentConfirmedSnapshotId": "snapshot-2026-07-25-a",
  "relationIds": ["relation-366-mlg"],
  "observationIds": ["obs-501", "obs-777"],
  "draftProposalIds": ["proposal-44"],
  "operationalTimestamps": {
    "lastReviewAt": "2026-07-25T09:40:00Z"
  }
}
```

### Ownership record
```json
{
  "ownershipRecordId": "own-9001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "territoryRef": {
    "type": "map_cell",
    "row": 5,
    "col": 8
  },
  "ownerUnionId": "union-0001",
  "ownershipState": "owned",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "supersedesOwnershipRecordId": null
}
```

### Structure ownership record
```json
{
  "structureOwnershipId": "structure-own-201",
  "serverId": "server-366",
  "seasonId": "season-1",
  "structureId": "structure-frost-mine-2",
  "ownerUnionId": "union-0001",
  "ownershipState": "owned",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "supersedesStructureOwnershipRecordId": null
}
```

### Snapshot
```json
{
  "snapshotId": "snapshot-2026-07-25-a",
  "serverId": "server-366",
  "seasonId": "season-1",
  "snapshotTimestamp": "2026-07-25T09:15:00Z",
  "ownershipRecordIds": ["own-9001", "own-9002"],
  "structureOwnershipRecordIds": ["structure-own-201"],
  "unionStatusRecordIds": ["native-assign-0142", "active-status-0281"],
  "evidenceIds": ["evidence-9001", "evidence-9002"],
  "creatorId": "user-01",
  "reviewerId": "user-01",
  "reviewState": "confirmed",
  "completenessRecordIds": [
    "complete-366-territory",
    "complete-366-structure",
    "complete-366-native",
    "complete-366-active",
    "complete-366-combat",
    "complete-366-review"
  ],
  "previousConfirmedSnapshotId": "snapshot-2026-07-20-b"
}
```

### Observation
```json
{
  "observationId": "obs-501",
  "serverId": "server-366",
  "seasonId": "season-1",
  "text": "Confirmed native union updated after screenshot review.",
  "authorId": "user-01",
  "observedAt": "2026-07-25T09:40:00Z",
  "evidenceIds": ["evidence-9001"],
  "reviewState": "confirmed",
  "archivedState": "active"
}
```

### Proposal
```json
{
  "proposalId": "proposal-44",
  "serverId": "server-366",
  "seasonId": "season-1",
  "proposalType": "proposed_ownership_change",
  "targetRef": { "type": "map_cell", "row": 5, "col": 8 },
  "proposedValue": {
    "ownershipState": "owned",
    "ownerUnionId": "union-0001"
  },
  "reviewState": "proposed",
  "sourceType": "screenshot_extraction",
  "sourceAssetRef": "shot-2026-07-25-a",
  "evidenceIds": ["evidence-9002"],
  "reviewerId": null,
  "supersedesProposalId": null
}
```

## 15. Mapping From the Current Schema
### Current `data/season1-servers.json`
The current server file maps to a mix of server definition, current server state, and legacy workspace fields.

Observed fields:
- `id` maps to `serverId`
- `label` maps to the server display number and display label context
- `baseMapId` maps to `baseMapRef`
- `activeUnionId` is a legacy server workspace shortcut whose current meaning must be verified before reuse
- `ownership` is the current per-server ownership store used by runtime editing
- `notes` maps to server observations or observation-adjacent content
- `objectives` is legacy and does not belong to the authoritative server-state model
- `history` is legacy and may overlap with confirmed snapshots, proposals, and observations depending on migration strategy
- `lastUpdated` is a server record timestamp and should not be treated as a complete authoritative snapshot timestamp without verification

### Current `data/season1-map.json`
The current base map maps to the immutable shared base-map definition.

Observed fields:
- `kingdomNumber` maps to a season/map identity field
- `seasonName` maps to a season label
- `gridSize` maps to base-map dimensions
- `tiles` map to immutable shared base-map cells
- `ownerId` exists in the shared tile schema as a base-definition/fallback field; normal runtime editing does not mutate it
- `structures` map to base-map structure definitions and footprints

### Current runtime behavior to preserve cautiously
- Ownership editing is isolated per server.
- Runtime edits are routed to the active server’s ownership state.
- Switching servers displays the appropriate server-specific ownership.
- The shared base map is no longer mutated by normal ownership editing.
- Base-map ownership may remain a fallback concept, but current default ownership seeds have been cleared.
- Structure ownership is currently resolved through the existing runtime ownership flow.
- Summary calculations should be based on confirmed server state, not the shared base map.

### Schema implications
- The proposed model introduces authoritative server-scoped ownership, snapshots, proposals, and observations.
- Shared base-map objects remain immutable definitions during normal runtime editing.
- Legacy fields must be preserved until migration strategy decides otherwise.
- The target model makes logical structure identity authoritative for structure ownership.

## 16. Explicit Exclusions
The following are intentionally excluded from this model:
- Objectives
- Alerts
- Server priority or status ratings
- Recommended actions
- Suggested targets
- Estimated enemy-strength labels
- AI-generated strategic judgments
- Prescriptive server rankings
- Shared base-map mutation as authoritative server state

## 17. Genuine Unresolved Questions
No unresolved questions remain after the recorded decisions above.
