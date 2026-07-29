# Server State Data Model

## 1. Purpose and Scope
This document defines the season-neutral target model for mutable, server-specific state in MLG WarMap.

It covers:
- server definition
- current server state
- ownership records
- target verification records
- confirmed snapshots
- derived freshness and qualification projections
- observations and proposals
- validation boundaries
- mapping from the current schema

The model is descriptive and storage-neutral. It records and relates facts about one server in one season. It does not recommend actions, assign priority, or encode strategic judgments.

Out of scope:
- shared base-map definitions
- union identity registry
- season rule policy
- UI styling
- implementation details
- prescriptive or AI-generated conclusions

## 2. Design Principles
1. Keep shared base maps immutable.
2. Isolate mutable state by server and season.
3. Treat proposals as reviewable, not authoritative.
4. Preserve immutable history for confirmed records.
5. Distinguish ownership facts from verification facts.
6. Distinguish unknown from confirmed unclaimed.
7. Keep evidence references valid when records are superseded.
8. Derive freshness and qualification from authoritative records.
9. Keep the model persistence-implementation neutral.
10. Do not mutate shared base-map objects to store server ownership.
11. Replace confirmed facts with versioned successors rather than editing in place.
12. Current state may reference immutable records but must not become a second competing authority.

## 3. Core Distinction: Ownership vs Verification
Ownership records answer: Who owns this target?

Verification records answer: When was that ownership last observed and confirmed?

Rules:
- Confirming unchanged ownership creates a new verification record, not a false ownership-change record.
- Confirming changed ownership creates the appropriate new ownership record plus a verification record.
- Partial updates refresh only the affected targets.
- Carried-forward ownership remains visible as last-known state but does not become freshly verified.
- Freshness uses verification observation time, not upload or audit confirmation time.

## 4. Entity Overview
The model uses eight core entities.

| Entity | Purpose | Primary key | Notes |
| --- | --- | --- | --- |
| ServerDefinition | Stable server identity and static configuration | serverId | No calculated dashboard totals |
| CurrentServerState | Operational aggregate for one server and season | serverStateId | References current confirmed snapshot and operational pointers |
| TerritoryOwnershipRecord | Immutable ownership fact for one normal capturable cell | ownershipRecordId | Fact value only |
| StructureOwnershipRecord | Immutable ownership fact for one logical structure | structureOwnershipId | Projected to structure footprint |
| TargetVerificationRecord | Immutable verification fact for one canonical target | verificationId | Observation and confirmation provenance |
| ConfirmedServerSnapshot | Immutable selected confirmed-state set | snapshotId | May be partial freshness |
| ServerObservation | Short descriptive server note | observationId | Not ownership authority |
| ProposedChange | Reviewable proposed update | proposalId | Never authoritative until confirmed |

## 5. Server Definition
ServerDefinition describes stable and mostly static server identity.

### Fields
- serverId
- displayNumber
- seasonId
- baseMapRef
- staticConfig

### Rules
- Must not contain calculated dashboard totals.
- Must not contain mutable ownership state.
- Must not contain snapshot history.
- May reference static configuration such as workspace labels.

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

## 6. Current Server State
CurrentServerState is the operational aggregate for a server and season. currentConfirmedSnapshotId points to the authoritative current confirmed state.

### Fields
- serverStateId
- serverId
- seasonId
- schemaVersion
- currentConfirmedSnapshotId
- relationIds
- observationIds
- draftProposalIds
- operationalTimestamps

### Rules
- Stores references, not a duplicate of shared map definitions.
- A single snapshot is current for one server and season.
- Earlier snapshots remain historical and immutable.
- Drafts/proposals must not alter current confirmed snapshot authority until reviewed and confirmed.
- Operational timestamps do not replace observation or verification timestamps.

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

## 7. Ownership Model
Ownership records define fact values for authoritative ownership state.

All fields listed below are required, including nullable fields.

### Ownership states
- owned
- unclaimed
- unknown

### Review states
- proposed
- confirmed
- rejected
- superseded

### TerritoryOwnershipRecord fields
- ownershipRecordId
- serverId
- seasonId
- territoryRef
- ownerUnionId
- ownershipState
- reviewState
- effectiveAt
- sourceType
- evidenceIds
- actorId
- reviewerId
- reviewedAt
- supersededBy

### StructureOwnershipRecord fields
- structureOwnershipId
- serverId
- seasonId
- structureId
- ownerUnionId
- ownershipState
- reviewState
- effectiveAt
- sourceType
- evidenceIds
- actorId
- reviewerId
- reviewedAt
- supersededBy

### Territory target identity
Territory ownership targetRef uses exactly:

```json
{
  "type": "normal_map_cell",
  "row": 5,
  "col": 8
}
```

Rules:
- type is exactly normal_map_cell.
- row and col are positive integers.
- Structure footprint cells are not independent territory ownership targets.
- Structure ownership uses stable non-empty structureId.

### Rules
- Unknown is not the same as confirmed unclaimed.
- TerritoryOwnershipRecord identifies one normal capturable non-structure cell.
- StructureOwnershipRecord identifies one logical structure.
- Ownership and review states are separate dimensions.
- Territory and structure records are scoped to one exact server and season.

### Ownership fact rules
- ownershipState is exactly owned, unclaimed, or unknown.
- owned requires ownerUnionId to be a non-empty, non-whitespace union ID.
- unclaimed requires ownerUnionId to be null.
- unknown requires ownerUnionId to be null.
- Unknown and confirmed unclaimed remain distinct facts.

### Source and evidence rules
sourceType is exactly one of:
- manual_entry
- screenshot_extraction
- imported_data
- api_integration
- bot_integration

Rules:
- evidenceIds is an array of unique non-empty, non-whitespace IDs.
- manual_entry may use an empty evidenceIds array.
- Every non-manual source requires at least one evidence ID.
- actorId is always a non-empty, non-whitespace ID.

### Timestamp meanings
- effectiveAt is when the ownership fact applies to the observed game state.
- reviewedAt is audit time when an authorised reviewer confirmed or rejected the record.
- effectiveAt and reviewedAt use real UTC ISO-8601 timestamps ending in Z with zero to three fractional digits.
- When reviewedAt is non-null, reviewedAt must not be earlier than effectiveAt.
- Upload time is not ownership fact time.

### Review lifecycle
reviewState is exactly:
- proposed
- confirmed
- rejected
- superseded

Proposed:
- reviewerId is null.
- reviewedAt is null.
- supersededBy is null.

Confirmed:
- reviewerId is a non-empty ID.
- reviewedAt is a valid timestamp.
- supersededBy is null.

Rejected:
- reviewerId is a non-empty ID.
- reviewedAt is a valid timestamp.
- supersededBy is null.
- Rejected records never become current ownership authority.

Superseded:
- reviewerId and reviewedAt remain populated.
- When a confirmed ownership record transitions to superseded, its existing reviewerId and reviewedAt remain unchanged.
- reviewerId and reviewedAt on the superseded record continue to identify the reviewer and time of the original confirmation.
- Superseded record reviewerId and reviewedAt must not be overwritten with replacement reviewer or replacement confirmation time.
- Supersession audit reviewer and audit time are derived from the replacement record referenced by supersededBy.
- Replacement reviewerId and reviewedAt identify who confirmed the replacement and when.
- No separate supersededAt field is required in this contract version.
- supersededBy is a non-empty ownership-record ID identifying the replacement.
- The replacement is the same record type and belongs to the same server, season, and canonical target.
- The replacement may be confirmed or may itself later be superseded.
- Supersession chains are cycle-free.
- A record cannot supersede itself.
- Superseded record reviewedAt must still be greater than or equal to its own effectiveAt.
- Replacement effectiveAt must not be earlier than the superseded record effectiveAt.
- Replacement reviewedAt must not be earlier than the superseded record reviewedAt.
- Equivalent timestamp representations compare by parsed instant.

### Immutability clarification
Immutable factual fields:
- record identity
- serverId
- seasonId
- territoryRef or structureId
- ownerUnionId
- ownershipState
- effectiveAt
- sourceType
- evidenceIds
- actorId

Review metadata transitions are limited to:
- proposed to confirmed
- proposed to rejected
- confirmed to superseded

No other transition is valid. Supersession changes review metadata but must never rewrite the historical ownership fact.

When a confirmed record becomes superseded, reviewerId and reviewedAt on that superseded record remain the original confirmation audit fields and are not rewritten.
Supersession audit attribution comes from the replacement record identified by supersededBy, whose reviewerId and reviewedAt record the replacement confirmation.

### History invariants
For each exact server, season, and canonical target:
- Record IDs are globally unique within their record collection.
- Proposed and rejected records do not participate in current-state selection.
- At most one non-superseded confirmed record is current.
- Historical superseded records are preserved.
- The current ownership record is the unique confirmed record with supersededBy null.
- Different servers, seasons, cells, and structures remain independent.
- Grouping uses collision-safe tuple identity, not delimiter joining.
- Individually invalid records do not participate in cross-record history resolution.
- A history may contain no current confirmed record when it contains only proposed or rejected records.

### Territory ownership example
```json
{
  "ownershipRecordId": "own-9001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "territoryRef": {
    "type": "normal_map_cell",
    "row": 5,
    "col": 8
  },
  "ownerUnionId": "union-0001",
  "ownershipState": "owned",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "sourceType": "manual_entry",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "reviewedAt": "2026-07-25T09:20:00Z",
  "supersededBy": null
}
```

### Structure ownership example
```json
{
  "structureOwnershipId": "structure-own-201",
  "serverId": "server-366",
  "seasonId": "season-1",
  "structureId": "structure-royal-city-1",
  "ownerUnionId": null,
  "ownershipState": "unclaimed",
  "reviewState": "confirmed",
  "effectiveAt": "2026-07-25T09:15:00Z",
  "sourceType": "screenshot_extraction",
  "evidenceIds": ["evidence-9002"],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "reviewedAt": "2026-07-25T09:20:00Z",
  "supersededBy": null
}
```

## 8. Canonical Verification Target
A verification target is exactly one of:

```text
normal_map_cell
logical_structure
```

Rules:
- Normal capturable cells are verified individually.
- A logical structure is verified once by stable structureId.
- Its footprint inherits the logical structure verification.
- Structure footprint cells must not become separate competing verification targets.
- Required verification targets come from the immutable active-season map definition.

Canonical targetRef examples:

```json
{
  "type": "normal_map_cell",
  "row": 5,
  "col": 8
}
```

```json
{
  "type": "logical_structure",
  "structureId": "structure-royal-city-1"
}
```

## 9. Target Verification Record
TargetVerificationRecord captures immutable verification history for one canonical verification target.

### Canonical fields
- verificationId
- serverId
- seasonId
- targetRef
- verifiedOwnershipRef
- observedAt
- confirmedAt
- sourceType
- evidenceIds
- actorId
- reviewerId
- reviewState
- supersededBy

### Source type values
Use existing canonical source-type values:
- manual_entry
- screenshot_extraction
- imported_data
- api_integration
- bot_integration

### Rules
- targetRef uses type, not targetType.
- verifiedOwnershipRef is a typed object and identifies the immutable ownership record whose value was checked.
- verifiedOwnershipRef must be exactly one of:

```json
{
  "type": "territory_ownership_record",
  "recordId": "own-9001"
}
```

```json
{
  "type": "structure_ownership_record",
  "recordId": "structure-own-9001"
}
```

- targetRef and verifiedOwnershipRef correspondence is required.
- normal_map_cell targetRef must reference territory_ownership_record for the same serverId, seasonId, row, and col.
- logical_structure targetRef must reference structure_ownership_record for the same serverId, seasonId, and structureId.
- Mismatched targetRef and verifiedOwnershipRef types are invalid.
- All IDs are non-empty, non-whitespace strings.
- evidenceIds contains unique non-empty IDs.
- observedAt and confirmedAt are real UTC ISO-8601 timestamps ending in Z with zero to three fractional digits.
- confirmedAt must not be earlier than observedAt.
- reviewState is exactly confirmed or superseded.
- confirmed reviewState requires supersededBy null.
- superseded reviewState requires supersededBy to reference its correcting verification.
- The correcting verification must concern the same serverId, seasonId, and canonical targetRef.
- Supersession chains must be cycle-free.
- Verification records are immutable.
- observedAt is when the game state was actually seen.
- confirmedAt is when an authorised reviewer accepted it into WarMap.
- Freshness calculations use observedAt, never upload time and never confirmedAt.
- confirmedAt and reviewer fields are audit information.
- A user may supply relative observation input such as two hours ago; it must be normalized to an exact UTC timestamp before storage.
- Evidence is optional for permitted manual confirmation and required according to existing proposal/evidence policy for non-manual sources.
- Ordinary later verification does not erase earlier verification history.
- Correction of an erroneous verification is represented by supersession.
- Routine later verification is historical confirmation, not supersession.

### Example
```json
{
  "verificationId": "verify-366-0007",
  "serverId": "server-366",
  "seasonId": "season-1",
  "targetRef": {
    "type": "normal_map_cell",
    "row": 5,
    "col": 8
  },
  "verifiedOwnershipRef": {
    "type": "territory_ownership_record",
    "recordId": "own-9001"
  },
  "observedAt": "2026-07-29T07:00:00Z",
  "confirmedAt": "2026-07-29T07:08:00Z",
  "sourceType": "manual_entry",
  "evidenceIds": [],
  "actorId": "user-01",
  "reviewerId": "user-01",
  "reviewState": "confirmed",
  "supersededBy": null
}
```

## 10. Per-Target Freshness
Per-target freshness is derived from verification history per required target.

Terminology:
- partial update means an input event where only a subset of targets receives new observations or confirmations.
- current confirmed snapshot means the complete resolved selection of available current confirmed facts.
- incomplete coverage means one or more required targets have never been validly confirmed.
- qualifying full-map confirmation means complete required-target coverage within the 24-hour observation window.

Rules:
- Select the latest non-superseded confirmed verification by observedAt.
- Display that observedAt as the target Last confirmed value.
- UI may render relative or absolute form, but the exact UTC timestamp remains authoritative.
- If no confirmed verification exists for a required target, that target is unverified.
- confirmedAt must not replace observedAt for freshness.
- For one serverId, seasonId, and canonical targetRef, multiple routine confirmed records are allowed when observedAt values differ.
- For one serverId, seasonId, and canonical targetRef, two non-superseded confirmed records with identical parsed observedAt are invalid.
- Equivalent timestamp forms such as .1Z and .100Z represent the same parsed instant.
- A correcting supersession must resolve same-instant conflicts.
- The current freshness record is the unique non-superseded confirmed record with the greatest parsed observedAt.
- A partial update refreshes observedAt only for affected targets.
- Unaffected targets retain their previous selected confirmed observedAt.

Example display strings:

```text
Royal City - Last confirmed 2 hours ago
Town - Last confirmed 28 Jul 2026, 23:00
```

## 11. Map Freshness Projection
Map freshness is derived data, not independent stored authority.

From the latest confirmed verification for every required target:

```text
oldestTargetObservedAt = minimum observedAt
newestTargetObservedAt = maximum observedAt
mapDataConfirmedThrough = oldestTargetObservedAt
latestPartialConfirmationAt = newestTargetObservedAt
```

Rules:
- mapDataConfirmedThrough is the minimum observedAt across all required targets selected as current confirmed verifications.
- If any required target has no valid confirmed verification, mapDataConfirmedThrough is null and map freshness is unverified.
- Updating one target changes only that target freshness and may update newestTargetObservedAt.
- The map must never display the newest partial update as if all targets were refreshed.
- User-facing overall label is Map data confirmed through.
- If one corner is three days old while everything else is newer, the map is confirmed through three days ago.
- These values are reproducible from verification history.

## 12. Confirmed Snapshot Model
A ConfirmedServerSnapshot is an immutable selected set of confirmed facts for one server and season.

### Canonical fields
- snapshotId
- serverId
- seasonId
- createdAt
- ownershipRecordIds
- structureOwnershipRecordIds
- verificationRecordIds
- unionStatusRecordIds
- evidenceIds
- creatorId
- reviewerId
- completenessRecordIds
- previousConfirmedSnapshotId

### Rules
- Snapshots are immutable.
- A snapshot captures exact ownership and verification record references selected at confirmation.
- A snapshot may contain partial freshness.
- A snapshot can update current authoritative state without necessarily qualifying as a full-map activity confirmation.
- A snapshot preserves previousConfirmedSnapshotId and provenance.
- createdAt is audit creation time.
- Observation and freshness time come from referenced verification records, not createdAt.
- Ambiguous snapshotTimestamp wording is replaced by createdAt.
- Every reference array contains unique IDs.
- All referenced records belong to the snapshot serverId and seasonId.
- At most one verificationRecordId may be selected per canonical targetRef.
- Each selected verification must resolve to the ownership record selected for that same target.
- createdAt must not be earlier than confirmedAt of any selected verification.
- previousConfirmedSnapshotId, when present, references an earlier snapshot for the same server and season.
- Snapshot chains are acyclic and createdAt is strictly increasing along the chain.
- The current confirmed snapshot selects the latest valid non-superseded confirmed verification for every required target that has ever been validly confirmed.
- Newly confirmed verifications from the latest update are selected for affected targets.
- Previously selected current verifications are carried forward for unaffected targets.
- A required target lacks a selected verification only when no valid confirmed verification has ever existed for it, or when prior verification was invalidated without a confirmed replacement.
- Partial update events do not erase, invalidate, or omit selected current verifications for unaffected targets.
- ownershipRecordIds selects territory ownership records.
- structureOwnershipRecordIds selects structure ownership records.
- A confirmed snapshot may reference only confirmed, non-superseded ownership records.
- Ownership target and server/season correspondence with verification records is resolved later by the snapshot/reference validator.
- This documentation milestone does not claim runtime implementation of that snapshot/reference resolution.

### Example
```json
{
  "snapshotId": "snapshot-2026-07-29-a",
  "serverId": "server-366",
  "seasonId": "season-1",
  "createdAt": "2026-07-29T07:10:00Z",
  "ownershipRecordIds": ["own-9001", "own-9002"],
  "structureOwnershipRecordIds": ["structure-own-201"],
  "verificationRecordIds": ["verify-366-0007", "verify-366-0011", "verify-366-0012"],
  "unionStatusRecordIds": ["native-assign-0142", "active-status-0281"],
  "evidenceIds": ["evidence-9001", "evidence-9002"],
  "creatorId": "user-01",
  "reviewerId": "user-01",
  "completenessRecordIds": [
    "complete-366-territory",
    "complete-366-structure",
    "complete-366-native",
    "complete-366-active",
    "complete-366-combat",
    "complete-366-review"
  ],
  "previousConfirmedSnapshotId": "snapshot-2026-07-25-a"
}
```

## 13. Qualifying Full-Map Confirmation
A confirmed snapshot qualifies for Active-Status inactivity evaluation only when all of the following are true:

- Every required normal-map-cell and logical-structure target has a selected confirmed verification.
- Every selected verification matches the snapshot serverId and seasonId.
- Every selected verification resolves to ownership represented by the snapshot.
- At qualification time, the snapshot contains exactly one valid selected verification for every required normal_map_cell and logical_structure target.
- The difference between oldest and newest selected observedAt values is no more than 24 full hours.
- No carried-forward verification older than that 24-hour window is counted.
- The snapshot establishes complete ownership coverage needed to test zero-territory status for unions.

Derived values:

```text
observationWindowStartedAt = oldest selected observedAt
observationWindowEndedAt = newest selected observedAt
fullConfirmationAt = observationWindowStartedAt
```

Rules:
- fullConfirmationAt is conservative and uses the oldest selected observedAt.
- fullConfirmationAt is the timestamp used for five-confirmation spacing, five-day gap, and fourteen-day inactivity evaluation.
- A snapshot produced after a partial update may still qualify when complete resolved target coverage exists and the selected observedAt window is within 24 hours.
- Qualification depends on resolved selected verification coverage and timestamps, not on whether information arrived in one upload or across multiple partial updates.
- A snapshot does not qualify when a required target has no selected valid verification.
- A snapshot does not qualify when carried-forward verification makes the oldest-to-newest selected observedAt span exceed 24 hours.
- Several screenshots or manual checks may contribute to one snapshot.
- Partial source images do not qualify independently; combined confirmed target coverage may qualify.
- One qualifying snapshot may support independent activity evaluation for multiple unions.
- Qualification must be reproducible from referenced records and map requirements, not stored as an unexplained boolean.

Distinct user-facing concepts:
- Map data confirmed through: freshness floor across latest target confirmations.
- Last qualifying full-map confirmation: most recent immutable snapshot satisfying complete coverage and 24-hour qualification.

## 14. Data-Completeness Model
Data completeness remains represented by derived categories rather than one opaque score.

### Categories
- verified territory coverage
- structure verification
- native-union verification
- active-union information
- combat-strength coverage
- evidence awaiting review

### Fields
- completenessId
- serverId
- seasonId
- snapshotId
- category
- value
- basis
- reviewState
- updatedAt
- evidenceIds

### Rules
- Completeness records are derived and snapshot-bound.
- A snapshot references completeness records by ID rather than duplicating values inline.
- Completeness remains reproducible from referenced authoritative records.

## 15. Server Observation and Proposal Models
Server observations and proposals remain non-authoritative support entities.

### Observation rules
- Observations are short, factual, and descriptive.
- Observation notes do not create verification freshness.
- Observation timestamps are separate from verification observedAt and snapshot createdAt.

### Proposal workflow rules
1. Capture proposed value and source asset.
2. Store proposal linked to evidence.
3. Mark proposal review state.
4. Require review transition before any authoritative record is added.
5. Preserve proposal history after supersession.

### Proposal example
```json
{
  "proposalId": "proposal-44",
  "serverId": "server-366",
  "seasonId": "season-1",
  "proposalType": "proposed_ownership_change",
  "targetRef": {
    "type": "normal_map_cell",
    "row": 5,
    "col": 8
  },
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

## 16. Validation Boundaries
Validation is layered in three boundaries.

1. Record validation
- Individual ownership-record field shape for TerritoryOwnershipRecord and StructureOwnershipRecord.
- Ownership IDs, enums, nullability, sourceType/evidence, and timestamp semantics.
- Ownership target identity shape for territoryRef and structureId.
- Ownership review lifecycle field constraints.
- Verification and snapshot field shape.
- Required IDs and canonical enums.
- Timestamp format and nullability.
- targetRef shape and canonical target type.
- verifiedOwnershipRef typed shape and targetRef correspondence.

2. History and reference validation
- Ownership history and supersession validation per server, season, and canonical target.
- Ownership current-state selection constraints and cycle-free supersession chains.
- Ownership grouping by collision-safe tuple identity.
- Invalid ownership records excluded from cross-record resolution.
- Ownership supersession audit ordering by parsed instant, including replacement reviewedAt greater than or equal to superseded reviewedAt.
- Record ID uniqueness.
- Supersession correctness for verification corrections.
- Correction stays within the same target identity.
- Supersession chains are cycle-free.
- previousConfirmedSnapshotId chain validity.
- Snapshot chain ordering by strictly increasing createdAt.
- Immutable reference integrity.

3. Resolved qualification validation
- Snapshot/reference resolution between ownershipRecordIds, structureOwnershipRecordIds, and verificationRecordIds.
- Resolve active-season required verification targets.
- Resolve ownership and verification references.
- Resolve the current confirmed snapshot as a complete carried-forward plus newly-confirmed selection.
- Compute per-target freshness from observedAt.
- Determine full coverage and 24-hour qualification.
- Calculate conservative fullConfirmationAt.
- Provide qualifying snapshots to Active-Status evaluation.

## 17. Data Invariants
- Shared base maps remain immutable definitions.
- Mutable state is isolated by server and season.
- Ownership records and verification records are separate authorities.
- Unknown and confirmed unclaimed remain distinct states.
- Proposed changes never silently become confirmed state.
- Confirmed snapshots are immutable historical records.
- Derived values are reproducible from authoritative references.
- Only one snapshot is current for a server and season.
- Evidence references remain valid after supersession.
- Review state never substitutes for the fact value itself.
- Structure identity is authoritative for structure targets and verification.
- Structure footprint cells do not become separate competing verification targets.
- Map data confirmed through is derived from oldest latest-target observedAt.
- Last qualifying full-map confirmation is derived from immutable snapshot references and required target coverage.

## 18. Mapping From Current Schema and Runtime Boundary
### Current data mapping notes
Observed fields in data/season1-servers.json still map across definition, current state, and legacy workspace concerns.

Observed fields:
- id maps to serverId
- label maps to server display context
- baseMapId maps to baseMapRef
- activeUnionId remains a legacy workspace shortcut
- ownership is the current runtime per-server ownership store
- notes map to observation-adjacent content
- objectives remain outside authoritative server-state model
- history remains legacy migration input
- lastUpdated is operational metadata, not verification freshness authority

### Current runtime persistence boundary
- Current runtime persistence stores current ownership state per server.
- Current runtime does not yet implement target verification history.
- Current runtime does not yet implement immutable confirmed snapshot history per this target model.
- This document defines the target contract and does not claim current full implementation.

### Storage neutrality and transport scope
- The model remains storage-neutral and suitable for a future hosted backend.
- No import/export requirement is introduced by this reconciliation.

## 19. Explicit Exclusions
The following remain intentionally excluded:
- objectives
- alerts
- server priority or status ratings
- recommended actions
- suggested targets
- estimated enemy-strength labels
- AI-generated strategic judgments
- prescriptive server rankings
- shared base-map mutation as authoritative server state

## 20. Genuine Unresolved Questions
No unresolved model questions remain in this document scope. Migration sequencing and runtime implementation order are delivery planning concerns rather than data-model ambiguities.
