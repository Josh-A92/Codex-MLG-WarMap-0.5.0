# Union Data Model

## 1. Purpose and Scope
This document defines a season-neutral union data model for MLG WarMap.

It supports:
- manual entry
- screenshot-assisted extraction
- evidence review
- server relationships
- historical combat-strength observations

The model is descriptive, not prescriptive. It stores and relates facts about unions and their season/server context. It does not assign threat ratings, recommend actions, rank priorities, or create strategic judgments.

Out of scope:
- territory ownership calculations inside union identity
- season-specific rules encoded as shared constants
- prescriptive or AI-generated conclusions
- replacement of the existing application schemas

## 2. Design Principles
1. Keep global union identity separate from season and server state.
2. Store historical observations instead of overwriting prior values.
3. Treat extraction as proposal, not confirmation.
4. Preserve provenance for user-entered and screenshot-derived facts.
5. Allow a union to relate to multiple servers and multiple seasons.
6. Avoid MLG-specific assumptions in shared model fields.
7. Preserve historical references even if a union is renamed or removed from the registry.
8. Keep calculated territory statistics outside union identity.
9. Review state never substitutes for the value of the fact being reviewed.
10. Derived relation summaries must be reproducible from authoritative records.
11. Automated extraction cannot create a confirmed record without an explicit trusted-source policy.
12. Union identities are archived rather than destructively deleted when historical records reference them.
13. Historical effective periods cannot overlap for the same status type and relationship.

## 3. Entity Overview
The model is organized around six core entities.

| Entity | Purpose | Primary key | Notes |
| --- | --- | --- | --- |
| UnionIdentity | Stable global identity for a union | `unionId` | Holds presentation metadata only, not server state |
| UnionServerSeasonRelation | Context link between a union, server, and season | composite of `unionId`, `serverId`, `seasonId` | Holds current status references and derived cache fields |
| NativeUnionAssignment | Reviewable native-union fact | `assignmentId` | Separates `nativeState` from `reviewState` |
| ActiveUnionStatus | Reviewable active-status fact | `statusId` | Separates `activityState` from `reviewState` |
| CombatStrengthObservation | Historical strength observation | `observationId` | Preserves every observation separately |
| EvidenceRecord | Evidence and review wrapper | `evidenceId` | Stores source asset references, raw extraction, normalization, and review state |

## 4. Union Identity Model
Union identity describes a union as a stable registry entry.

### Fields
- `unionId` - stable union identifier
- `displayName` - current display name
- `tag` or `abbreviation` - short label such as a tag
- `aliases` - known aliases or previous names
- `defaultColor` - presentation color
- `presentationMetadata` - optional presentation fields such as emblem, icon, or note

### Identity rules
- Identity must not contain server-specific combat strength.
- Identity must not contain server-specific activity state.
- Identity must not contain calculated territory statistics.
- Identity can be reused across many server and season relations.
- A rename changes display fields, not the stable `unionId`.
- Current aliases remain on UnionIdentity for matching and display.
- Evidence-backed rename events preserve name history outside identity.

### Example
```json
{
  "unionId": "union-0001",
  "displayName": "Moonlight Guillotine",
  "tag": "MLG",
  "aliases": ["Moonlight G", "Moonlight Guillotine Guild"],
  "defaultColor": "#8FCEFF",
  "presentationMetadata": {
    "emblem": "crescent-blade"
  }
}
```

## 5. Union/Server/Season Relationship Model
A relation records how a union appears within a specific server and season context.

### Fields
- `unionId`
- `serverId`
- `seasonId`
- `currentNativeStatusId`
- `currentActiveStatusId`
- `firstConfirmedPresenceAt` - derived, non-authoritative cache value
- `mostRecentConfirmedPresenceAt` - derived, non-authoritative cache value
- `evidenceIds`
- `manualOverride`

### Relationship rules
- A union may relate to multiple servers or seasons.
- The model must not assume one permanent native server.
- Native and active status are contextual facts, not identity fields.
- Presence and ownership observations belong to the relation, not the union identity.
- Manual correction can override automated proposals at the relationship level.
- Historical native and active-status records are preserved.
- Only one effective current native-status record and one effective current active-status record may exist for a given union/server/season relationship.
- `currentNativeStatusId` points only to the current effective confirmed native assignment.
- `currentActiveStatusId` is a non-authoritative cache/reference to the current active-status record.
- Historical records remain closed or superseded.
- Effective time ranges must not overlap.
- The relation may reference the current records.
- Presence timestamps and evidence references should be derived from confirmed observations or status records wherever practical.
- Cached summary fields such as presence timestamps are non-authoritative and must be reproducible from underlying records.

### Example
```json
{
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "currentNativeStatusId": "native-assign-0142",
  "currentActiveStatusId": "active-status-0281",
  "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
  "mostRecentConfirmedPresenceAt": "2026-07-25T09:15:00Z",
  "evidenceIds": ["evidence-9001", "evidence-9002"],
  "manualOverride": null
}
```

## 6. Native-Status Model
Native-union assignment records whether a union is native to a server for a season.

### Fact values
- `nativeState`: `native`, `not_native`, `unknown`

### Review states
- `reviewState`: `proposed`, `confirmed`, `rejected`, `superseded`

### Fields
- `assignmentId`
- `unionId`
- `serverId`
- `seasonId`
- `nativeState`
- `reviewState`
- `sourceType`
- `rawExtractedValue`
- `normalizedValue`
- `confidence`
- `evidenceId`
- `observedAt`
- `effectiveFrom`
- `effectiveTo`
- `reviewer`
- `reviewedAt`
- `supersededBy`

### Rules
- Fact state and review state are separate dimensions.
- `nativeState` records the fact value; `reviewState` records its lifecycle state.
- Effective periods use half-open intervals: `[effectiveFrom, effectiveTo)`.
- Proposed and rejected records are not effective: both `effectiveFrom` and `effectiveTo` are null.
- A current confirmed record has non-null `effectiveFrom` and null `effectiveTo`.
- A superseded record retains its original `effectiveFrom`, has non-null `effectiveTo`, and references its replacement through `supersededBy`.
- `effectiveTo` must not precede `effectiveFrom`.
- Only one effective current confirmed native assignment may exist per `unionId` + `serverId` + `seasonId` relationship.
- Confirming a replacement must atomically supersede and close the previous current record.
- The previous record's `effectiveTo` equals the replacement's `effectiveFrom`.
- Effective periods for the same relationship must not overlap.
- Rejecting a proposal does not change the current confirmed assignment.
- Source types are `manual_entry`, `screenshot_extraction`, `imported_data`, `api_integration`, `bot_integration`.
- An authorized manual entry may be created directly as confirmed.
- Screenshot/import/API/bot extraction creates a proposed record unless a future explicit trusted-source policy says otherwise.
- No trusted-source auto-confirmation policy exists currently.
- `evidenceId` may be null for manual entry.
- Non-manual proposals require a non-null `evidenceId`.
- `rawExtractedValue` is nullable and preserves source text where applicable.
- `normalizedValue` is nullable and contains the matched canonical union ID where applicable.
- `confidence` is null for manual entry or a number from 0 to 1 for assisted extraction.
- Confirmed, rejected, and superseded records require non-empty `reviewer` and non-null `reviewedAt`.
- Proposed records have null `reviewer` and null `reviewedAt`.
- `reviewedAt` cannot precede `observedAt`.
- `supersededBy` is required only for superseded records.
- `supersededBy` is null for proposed, confirmed, and rejected records.
- Historical records are preserved and not destructively deleted.

### Example
```json
{
  "assignmentId": "native-assign-0142",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "nativeState": "native",
  "reviewState": "confirmed",
  "sourceType": "manual_entry",
  "rawExtractedValue": null,
  "normalizedValue": "union-0001",
  "confidence": null,
  "evidenceId": null,
  "observedAt": "2026-07-10T18:42:00Z",
  "effectiveFrom": "2026-07-10T18:42:00Z",
  "effectiveTo": null,
  "reviewer": "user-01",
  "reviewedAt": "2026-07-10T19:05:00Z",
  "supersededBy": null
}
```

## 7. Active-Status Model
Active-union status records authoritative activity facts for one exact relationship key: `unionId + serverId + seasonId`.

### Scope and activity authority
- Activity is scoped independently by exact `unionId + serverId + seasonId`.
- Activity on one server never affects the same union on another server.
- A new season has independent activity history.
- A known union with no confirmed ownership history is considered inactive.
- Confirmed ownership of at least one territory makes the union active.
- Losing its final territory starts a verified zero-territory process while the union remains active.
- Confirmed recapture cancels that process.
- A later final loss starts a new process.

### Authoritative activity state values
- `activityState`:
  - `active`
  - `inactive`

### Review states
- `reviewState`:
  - `confirmed`
  - `superseded`

### Derivation source values
- `derivedFrom`:
  - `known_relation_without_confirmed_ownership`
  - `confirmed_ownership`
  - `verified_zero_territory_period`

### Derived verification health (read-model only)
`verificationHealth` is not stored as the authoritative status fact. It is a derived read-model concern that may change over time without rewriting historical authoritative records.

- `verificationHealth`:
  - `current`
  - `monitoring`
  - `stale`
  - `unverified`
- Meanings:
  - `current`: the recorded active or inactive state has sufficiently recent confirmed support.
  - `monitoring`: an active union is inside a valid zero-territory verification window that has not completed.
  - `stale`: previously supported activity information is no longer sufficiently current, or an open verification window exceeded its permitted gap.
  - `unverified`: a status exists by the known-union default but has no qualifying confirmed ownership/map evidence.
- These meanings apply to both active and inactive records where appropriate.
- `verificationHealth` is calculated using an evaluation time and is not stored in the authoritative record.

Deterministic calculation using `evaluatedAt`:
1. `derivedFrom = known_relation_without_confirmed_ownership` -> `unverified`.
2. For every other derivation, missing `verificationThrough` is invalid record state.
3. If `evaluatedAt` precedes `verificationThrough`, evaluation fails as invalid input.
4. If more than five full 24-hour periods have elapsed since `verificationThrough`, health is `stale`.
5. Otherwise, an active `verified_zero_territory_period` record whose window is incomplete is `monitoring`.
6. Otherwise, health is `current`.

Exactly five full days remains valid; it becomes stale only when the gap exceeds five full days.

### Canonical fields, types, and nullability
All IDs are non-empty, non-whitespace strings.

| Field | Type | Nullability | Notes |
| --- | --- | --- | --- |
| `statusId` | string | non-null | stable status record identity |
| `unionId` | string | non-null | canonical union identity |
| `serverId` | string | non-null | server scope |
| `seasonId` | string | non-null | season scope |
| `activityState` | enum | non-null | `active` or `inactive` |
| `reviewState` | enum | non-null | `confirmed` or `superseded` |
| `derivedFrom` | enum | non-null | one of the canonical derivation source values |
| `firstConfirmedPresenceAt` | UTC ISO-8601 `Z` timestamp | nullable | confirmed territorial ownership start marker |
| `mostRecentConfirmedPresenceAt` | UTC ISO-8601 `Z` timestamp | nullable | last confirmed time territory was owned |
| `zeroTerritorySince` | UTC ISO-8601 `Z` timestamp | nullable | confirmed final-loss marker |
| `verificationWindowStartedAt` | UTC ISO-8601 `Z` timestamp | nullable | start of current zero-territory verification window |
| `verificationThrough` | UTC ISO-8601 `Z` timestamp | nullable | most recent counted qualifying confirmation in the current evaluation |
| `verificationSnapshotIds` | string[] | non-null | unique non-empty snapshot IDs in chronological order |
| `effectiveFrom` | UTC ISO-8601 `Z` timestamp | non-null | status period start |
| `effectiveTo` | UTC ISO-8601 `Z` timestamp | state-dependent | null for current; non-null for superseded |
| `supersededBy` | string | state-dependent | null for current; non-null for superseded |

Timestamp format uses canonical UTC ISO-8601 `Z` timestamps with zero to three fractional-second digits.

### Canonical rules
- Active status is derived only from confirmed relationship/ownership/snapshot facts.
- Screenshot or automated extraction proposes underlying ownership evidence; it does not directly propose an active-status record.
- Direct manual activity overrides are not allowed.
- Corrections must update the underlying confirmed ownership/evidence timeline and cause activity to be derived again.
- `verificationSnapshotIds` contains the distinct confirmed full-map snapshots supporting the evaluated period.
- Snapshot references provide indirect evidence provenance.
- `firstConfirmedPresenceAt` and `mostRecentConfirmedPresenceAt` describe confirmed territorial ownership, not merely known relationship presence.
- `firstConfirmedPresenceAt` and `mostRecentConfirmedPresenceAt` are both null when the union has never had confirmed ownership.
- Once confirmed ownership history exists, both are non-null and `firstConfirmedPresenceAt <= mostRecentConfirmedPresenceAt`.
- When `zeroTerritorySince` is non-null, `mostRecentConfirmedPresenceAt <= zeroTerritorySince`.
- `verificationThrough` cannot precede `verificationWindowStartedAt`.

### State-specific field matrix
1. `known_relation_without_confirmed_ownership`
   - `activityState: inactive`
   - presence timestamps null
  - `zeroTerritorySince: null`
  - `verificationWindowStartedAt: null`
  - `verificationThrough: null`
   - `verificationSnapshotIds: []`
   - derived verification health is `unverified`
2. `confirmed_ownership`
   - `activityState: active`
   - presence timestamps non-null
  - `zeroTerritorySince: null`
  - `verificationWindowStartedAt: null`
   - `verificationThrough` references the latest supporting confirmation time
   - `verificationSnapshotIds` contains at least one confirmed supporting snapshot
  - recapture discards prior zero-territory snapshot references and replaces them with the recapture-supporting confirmed snapshot reference(s); the replacement active record must not have an empty provenance list
3. `verified_zero_territory_period` while monitoring
   - `activityState: active`
   - ownership history/presence timestamps non-null
   - `zeroTerritorySince`, `verificationWindowStartedAt`, and `verificationThrough` non-null
  - at least one qualifying snapshot ID
  - snapshot list contains the qualifying confirmations accumulated in the current window
4. `verified_zero_territory_period` after completion
   - `activityState: inactive`
   - the three zero-territory verification timestamps remain non-null
   - at least five qualifying snapshot IDs
   - all fourteen-day, spacing, coverage, and terminal-confirmation rules satisfied

### Fourteen-day inactivity rule
- Fourteen full 24-hour periods must elapse.
- The verification window begins with the counted confirmed final-loss confirmation.
- At least five counted qualifying full-map zero confirmations are required.
- The initial final-loss counted confirmation and the terminal counted confirmation may count.
- Counted qualifying confirmations must be separated from the previously counted confirmation by at least 24 full hours.
- A qualifying zero confirmation inside 24 hours is valid evidence but is not counted and does not replace the last counted confirmation.
- No gap between consecutive counted confirmations may exceed five full days.
- The terminal counted confirmation must occur at or after the fourteen-day threshold.
- A qualifying confirmation must come from a confirmed complete server-ownership snapshot covering all capturable territory needed to establish zero ownership on that server.
- Partial screenshots may contribute to confirmed facts and confirmed snapshots, but cannot independently prove inactivity.
- All qualifying full-map confirmations must match the same union/server/season scope being evaluated.
- If the gap from the last counted confirmation exceeds five full days, that verification window fails and the current zero confirmation starts a new window.
- `verificationWindowStartedAt` becomes the restart confirmation time.
- `verificationSnapshotIds` resets to confirmations counted in the new window.
- The new window must independently satisfy fourteen days, at least five counted confirmations, no over-five-day counted gaps, and a terminal counted confirmation at or after its own fourteen-day threshold.
- `zeroTerritorySince` may retain the original post-presence zero timestamp when no recapture occurred.
- Any confirmed recapture clears the process; a later final loss starts a new process.
- Inactivity cannot be created until a complete qualifying window succeeds.
- During an open zero-territory process, the union remains active with `derivedFrom = verified_zero_territory_period`.

### Snapshot-Resolved Active Status Evaluator Contract
The Snapshot-Resolved Active Status Evaluator is a pure descriptive evaluator. It derives canonical active-status output from already-confirmed facts and never writes status history.

Authoritative boundaries:
- The evaluator does not mutate input objects or external state.
- The evaluator does not accept direct manual activity overrides.
- The evaluator does not accept raw screenshots, OCR proposals, unreviewed ownership, incomplete zero-territory claims, or other unconfirmed sources.
- Positive presence proof and zero-territory proof are distinct inputs.
- Runtime integration, persistence, screenshot extraction, status-ID allocation, and snapshot-resolution mechanics remain outside this evaluator contract.

Evaluator input contract:
1. `identity`
  - `statusId`, `unionId`, `serverId`, `seasonId`, `evaluatedAt`
2. `currentStatus`
  - `null` or the current confirmed non-superseded `ActiveUnionStatus` for the exact `unionId + serverId + seasonId` scope
3. `confirmedPresenceFacts`
  - array of confirmed positive-ownership facts
  - each fact contains `factId`, `unionId`, `serverId`, `seasonId`, `observedAt`, `ownershipRecordId`, `snapshotId` (nullable)
  - partial updates may provide these facts because one confirmed owned target is sufficient to prove presence
4. `qualifyingFullMapConfirmations`
  - array of already-resolved qualifying snapshots
  - each item contains `snapshotId`, `unionId`, `serverId`, `seasonId`, `fullConfirmationAt`, `ownedTerritoryCount` (non-negative integer)
  - `ownedTerritoryCount` is the owned-territory count for that exact `unionId + serverId + seasonId` snapshot scope
  - only these confirmations may prove zero territory or advance/reset a zero-territory inactivity window

Input validation expectations:
- All facts must exactly match input identity `unionId`, `serverId`, and `seasonId`.
- All IDs must be unique non-empty non-whitespace strings in their collection domain.
- Timestamps must be UTC ISO-8601 `Z` with zero to three fractional digits.
- Input order is non-authoritative.
- Evaluation sorts by parsed timestamp instant, then by stable ID tie-break.
- Equivalent fractional forms such as `.1Z` and `.100Z` compare equal by parsed instant.
- Inputs are treated as immutable.
- A qualifying full-map item with `ownedTerritoryCount > 0` is a positive-presence event at `fullConfirmationAt` for the input union.
- When a logical positive-presence event is represented in both `confirmedPresenceFacts` and `qualifyingFullMapConfirmations`, the evaluator must deduplicate by `snapshotId` and parsed instant.
- If duplicate representations for the same logical event disagree on normalized scope/time identity, evaluation fails deterministically with `invalid_fact_set`.

Deterministic evaluation rules:
1. No confirmed presence ever
  - `activityState = inactive`
  - `derivedFrom = known_relation_without_confirmed_ownership`
  - `verificationHealth = unverified`
  - if `currentStatus` is null, `effectiveFrom = evaluatedAt` and `replacementEffectiveFrom = evaluatedAt`
  - if `currentStatus` already has identical no-presence factual state, do not replace it and preserve existing `effectiveFrom`
2. Any confirmed presence makes the union active.
  - `firstConfirmedPresenceAt` and `mostRecentConfirmedPresenceAt` derive from all positive-presence facts, including qualifying confirmations with `ownedTerritoryCount > 0`
3. Recapture/reset behavior
  - any positive presence after a zero-territory window starts is recapture
  - recapture clears zero-window timestamps and zero-window snapshot IDs
  - a later qualifying zero confirmation starts a new zero-territory process
4. Zero-territory window eligibility
  - only a qualifying confirmation with `ownedTerritoryCount = 0` may establish final loss, set `zeroTerritorySince`, or enter/advance a zero-territory window
  - begin from the first qualifying zero confirmation after the most recent positive presence
5. Counted confirmation rules
  - process zero confirmations chronologically
  - a counted confirmation must be at least 24 full hours after the previously counted confirmation
  - a qualifying zero confirmation inside 24 hours is valid but ignored for count advancement
6. Gap failure and restart
  - if the gap from the last counted confirmation exceeds five full days, that window fails
  - the current qualifying zero confirmation starts a new window
  - `zeroTerritorySince` retains the original post-presence zero timestamp when no recapture occurred
7. Inactivity completion
  - requires at least five counted confirmations
  - requires at least fourteen full days from `verificationWindowStartedAt`
  - requires a final counted confirmation at or after the fourteen-day threshold
  - exactly 24-hour spacing counts
  - exactly five days remains valid
  - exactly fourteen days qualifies
8. State while incomplete
  - until completion, `activityState = active` and `derivedFrom = verified_zero_territory_period`
9. State on completion
  - on completion, `activityState = inactive` and `derivedFrom = verified_zero_territory_period`
10. Qualifying positive snapshot behavior
  - a qualifying confirmation with `ownedTerritoryCount > 0` is confirmed presence and immediately cancels any zero window
11. Isolation
  - the same union is evaluated independently per server and season

Late historical evidence behavior:
- The evaluator does not retroactively repair status history.
- If newly supplied confirmed facts would change canonical factual state but the causative fact time precedes `currentStatus.effectiveFrom`, evaluation fails with `invalid_fact_set` and `evaluation = null`.
- Re-evaluating unchanged older facts remains valid with `requiresReplacement = false`.

Verification-health computation at `evaluatedAt`:
1. known relation without confirmed ownership presence -> `unverified`
2. if `evaluatedAt < verificationThrough` -> invalid input
3. if more than five full days elapsed since `verificationThrough` -> `stale`
4. otherwise, active and in incomplete zero window -> `monitoring`
5. otherwise -> `current`

Evaluator output contract:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "evaluation": {
   "canonicalStatus": {
    "statusId": "active-status-0001",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "active",
    "reviewState": "confirmed",
    "derivedFrom": "confirmed_ownership",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-25T09:15:00Z",
    "zeroTerritorySince": null,
    "verificationWindowStartedAt": null,
    "verificationThrough": "2026-07-25T09:15:00Z",
    "verificationSnapshotIds": ["snapshot-366-2026-07-25"],
    "effectiveFrom": "2026-07-25T09:15:00Z",
    "effectiveTo": null,
    "supersededBy": null
   },
   "verificationHealth": "current",
   "requiresReplacement": true,
   "replacementEffectiveFrom": "2026-07-25T09:15:00Z",
   "countedConfirmationIds": ["snapshot-366-2026-07-25"],
   "ignoredConfirmationIds": [],
   "windowRestartCount": 0
  }
}
```

Output requirements:
- `evaluation` is `null` when `valid = false`.
- `errors` entries use `{ code, path, message }`.
- `canonicalStatus` must contain the exact sixteen `ActiveUnionStatus` fields.
- `canonicalStatus` must validate under the existing active-status validator.
- `requiresReplacement` compares only canonical factual fields after parsed-time normalization and deterministic array normalization:
  - `unionId`
  - `serverId`
  - `seasonId`
  - `activityState`
  - `derivedFrom`
  - `firstConfirmedPresenceAt`
  - `mostRecentConfirmedPresenceAt`
  - `zeroTerritorySince`
  - `verificationWindowStartedAt`
  - `verificationThrough`
  - `verificationSnapshotIds`
- Factual equality excludes `statusId`, `reviewState`, `effectiveFrom`, `effectiveTo`, and `supersededBy`.
- `requiresReplacement` is `false` only when those factual fields are unchanged.
- Otherwise `requiresReplacement` is `true`.
- `replacementEffectiveFrom` is the fact time that caused the state:
  - first evaluation time for unknown inactive
  - latest recapture/presence time for confirmed ownership
  - window start while monitoring
  - final qualifying counted confirmation time when becoming inactive
- If replacement would be required but that causative fact time precedes `currentStatus.effectiveFrom`, evaluation fails with `invalid_fact_set` and `evaluation = null`.
- When replacement is required, canonical output uses supplied `statusId`, `reviewState = confirmed`, `effectiveTo = null`, and `supersededBy = null`.
- When replacement is not required, `canonicalStatus` is a safe normalized copy of `currentStatus` unchanged and supplied `statusId` is unused.
- `verificationThrough` is the latest parsed instant among confirmed evidence actually supporting the evaluated factual state.
- `verificationSnapshotIds` contains unique deterministically ordered snapshot IDs supporting the active zero window, or supporting the latest confirmed positive state when `derivedFrom = confirmed_ownership`.
- `countedConfirmationIds` and `ignoredConfirmationIds` contain unique IDs and are deterministically ordered by parsed instant then stable ID.

Error expectations:
- `invalid_input` for malformed identity, timestamps, ID uniqueness, scope mismatch, or `evaluatedAt < verificationThrough`.
- `invalid_fact_set` for contradictory facts that cannot produce deterministic progression.
- `invalid_current_status` when provided `currentStatus` is not the current confirmed non-superseded record for scope.
- `invalid_output` when produced canonical status would fail validator requirements.

Concise state-transition table:

| Trigger condition | Resulting `activityState` | Resulting `derivedFrom` | Window effect |
| --- | --- | --- | --- |
| No confirmed presence ever | `inactive` | `known_relation_without_confirmed_ownership` | no window |
| Any confirmed presence and no active zero window | `active` | `confirmed_ownership` | window cleared |
| Qualifying zero confirmation starts/advances incomplete window | `active` | `verified_zero_territory_period` | window open |
| Completion satisfied (5 counted + 14 days + terminal counted confirmation) | `inactive` | `verified_zero_territory_period` | window complete |
| Any confirmed positive presence during zero window | `active` | `confirmed_ownership` | window canceled/reset |

Boundary examples:
1. 24-hour counting boundary
  - counted at `2026-08-01T00:00:00Z`
  - next at `2026-08-02T00:00:00Z` counts (exactly 24h)
  - next at `2026-08-02T12:00:00Z` is valid evidence but ignored for counted progression
2. 5-day gap boundary
  - previous counted at `2026-08-01T00:00:00Z`
  - next at `2026-08-06T00:00:00Z` is still valid (exactly 5d)
  - next at `2026-08-06T00:00:01Z` restarts window (>5d)
3. 14-day completion boundary
  - window start `2026-08-01T00:00:00Z`
  - final counted at `2026-08-15T00:00:00Z` qualifies (exactly 14d)

Recapture/reset example:
- zero window started at `2026-08-01T00:00:00Z`
- qualifying zero confirmations counted through `2026-08-05T00:00:00Z`
- confirmed positive presence at `2026-08-06T10:00:00Z` cancels window and zero snapshot IDs
- later qualifying zero confirmation at `2026-08-08T00:00:00Z` starts a new window

Server-isolation example:
- `union-0001` on `server-366` can be inactive from a completed zero window
- the same `union-0001` on `server-367` can remain active from confirmed ownership
- one server's facts never advance, reset, or invalidate the other server's evaluation

### Timestamp and history invariants
- `effectiveTo` cannot precede `effectiveFrom`.
- `verificationWindowStartedAt` cannot precede `zeroTerritorySince`.
- `verificationThrough` cannot precede `verificationWindowStartedAt`.
- `verificationSnapshotIds` must not contain duplicates.
- `statusId` must be unique across a history.
- `supersededBy` must reference another active-status record in the same `unionId + serverId + seasonId` group.
- The referenced replacement must be `confirmed` or `superseded`.
- Supersession chains cannot contain cycles.
- A superseded record cannot reference itself.
- Supersession boundary equality compares parsed timestamp instants, so equivalent forms such as `.1Z` and `.100Z` are equal.
- History grouping must use collision-safe tuple encoding for `seasonId`, `serverId`, and `unionId`.
- At most one current confirmed record exists per group.

### Validation layers
1. Record-shape validation:
  - canonical fields, enums, types, nullability, timestamp format
  - local ordering constraints
  - snapshot-ID uniqueness and state-dependent minimum counts
2. History validation:
  - unique status IDs
  - grouping
  - current-record uniqueness
  - non-overlap
  - supersession references
  - exact parsed-time boundary alignment
  - cycle detection
3. Snapshot-resolved derivation/evaluation:
  - use the Snapshot-Resolved Active Status Evaluator contract above
  - derive canonical status from confirmed presence facts plus qualifying full-map confirmations
  - enforce 24-hour counted spacing, five-day gap boundaries, fourteen-day completion, and deterministic restart behavior
  - compute `verificationHealth` at `evaluatedAt`

### Historical lifecycle
- Exactly one current confirmed active-status record exists per `unionId + serverId + seasonId`.
- Current record: non-null `effectiveFrom`, null `effectiveTo`, null `supersededBy`.
- Superseded record: retained original `effectiveFrom`, non-null `effectiveTo`, and `supersededBy` referencing its replacement.
- Effective periods are half-open intervals: `[effectiveFrom, effectiveTo)`.
- Periods for the same `unionId + serverId + seasonId` cannot overlap.
- Supersession boundary must align atomically: `previous.effectiveTo === replacement.effectiveFrom`.
- `currentActiveStatusId` on the relationship is a non-authoritative cache/reference; the active-status history remains authoritative.

### Examples
#### 1. Known union with no confirmed ownership history
```json
{
  "statusId": "active-status-0999",
  "unionId": "union-0009",
  "serverId": "server-366",
  "seasonId": "season-1",
  "activityState": "inactive",
  "reviewState": "confirmed",
  "derivedFrom": "known_relation_without_confirmed_ownership",
  "firstConfirmedPresenceAt": null,
  "mostRecentConfirmedPresenceAt": null,
  "zeroTerritorySince": null,
  "verificationWindowStartedAt": null,
  "verificationThrough": null,
  "verificationSnapshotIds": [],
  "effectiveFrom": "2026-07-01T00:00:00Z",
  "effectiveTo": null,
  "supersededBy": null
}
```
Derived `verificationHealth` outcome at `evaluatedAt = 2026-07-04T00:00:00Z`: `unverified`.

#### 2. Active with confirmed territory
```json
{
  "statusId": "active-status-1001",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "activityState": "active",
  "reviewState": "confirmed",
  "derivedFrom": "confirmed_ownership",
  "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
  "mostRecentConfirmedPresenceAt": "2026-07-25T09:15:00Z",
  "zeroTerritorySince": null,
  "verificationWindowStartedAt": null,
  "verificationThrough": "2026-07-25T09:15:00Z",
  "verificationSnapshotIds": [
    "snapshot-366-2026-07-25"
  ],
  "effectiveFrom": "2026-07-10T18:42:00Z",
  "effectiveTo": null,
  "supersededBy": null
}
```
Derived `verificationHealth` outcome at `evaluatedAt = 2026-07-28T09:15:00Z`: `current`.

#### 3. Active while valid zero-territory window is monitoring
```json
{
  "statusId": "active-status-1002",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "activityState": "active",
  "reviewState": "confirmed",
  "derivedFrom": "verified_zero_territory_period",
  "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
  "mostRecentConfirmedPresenceAt": "2026-07-30T09:00:00Z",
  "zeroTerritorySince": "2026-07-30T09:00:00Z",
  "verificationWindowStartedAt": "2026-07-30T09:00:00Z",
  "verificationThrough": "2026-08-02T09:00:00Z",
  "verificationSnapshotIds": [
    "snapshot-366-2026-07-30",
    "snapshot-366-2026-08-02"
  ],
  "effectiveFrom": "2026-07-30T09:00:00Z",
  "effectiveTo": null,
  "supersededBy": null
}
```
Derived `verificationHealth` outcome at `evaluatedAt = 2026-08-02T20:00:00Z`: `monitoring`.

#### 4. Inactive after completed fourteen-day/five-confirmation rule
```json
{
  "statusId": "active-status-1003",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "activityState": "inactive",
  "reviewState": "confirmed",
  "derivedFrom": "verified_zero_territory_period",
  "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
  "mostRecentConfirmedPresenceAt": "2026-07-30T09:00:00Z",
  "zeroTerritorySince": "2026-07-30T09:00:00Z",
  "verificationWindowStartedAt": "2026-07-30T09:00:00Z",
  "verificationThrough": "2026-08-13T10:00:00Z",
  "verificationSnapshotIds": [
    "snapshot-366-2026-07-30",
    "snapshot-366-2026-08-02",
    "snapshot-366-2026-08-05",
    "snapshot-366-2026-08-09",
    "snapshot-366-2026-08-13"
  ],
  "effectiveFrom": "2026-08-13T10:00:00Z",
  "effectiveTo": null,
  "supersededBy": null
}
```
Derived `verificationHealth` outcome at `evaluatedAt = 2026-08-14T10:00:00Z`: `current`.
The same record becomes `stale` only after more than five full days without a later qualifying confirmation.

#### 5. Same union active on Server 367 while independently inactive on Server 366
```json
[
  {
    "statusId": "active-status-2001",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "inactive",
    "reviewState": "confirmed",
    "derivedFrom": "verified_zero_territory_period",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-30T09:00:00Z",
    "zeroTerritorySince": "2026-07-30T09:00:00Z",
    "verificationWindowStartedAt": "2026-07-30T09:00:00Z",
    "verificationThrough": "2026-08-13T10:00:00Z",
    "verificationSnapshotIds": [
      "snapshot-366-2026-07-30",
      "snapshot-366-2026-08-02",
      "snapshot-366-2026-08-05",
      "snapshot-366-2026-08-09",
      "snapshot-366-2026-08-13"
    ],
    "effectiveFrom": "2026-08-13T10:00:00Z",
    "effectiveTo": null,
    "supersededBy": null
  },
  {
    "statusId": "active-status-2002",
    "unionId": "union-0001",
    "serverId": "server-367",
    "seasonId": "season-1",
    "activityState": "active",
    "reviewState": "confirmed",
    "derivedFrom": "confirmed_ownership",
    "firstConfirmedPresenceAt": "2026-07-18T12:00:00Z",
    "mostRecentConfirmedPresenceAt": "2026-08-13T10:00:00Z",
    "zeroTerritorySince": null,
    "verificationWindowStartedAt": null,
    "verificationThrough": "2026-08-13T10:00:00Z",
    "verificationSnapshotIds": [
      "snapshot-367-2026-08-13"
    ],
    "effectiveFrom": "2026-07-18T12:00:00Z",
    "effectiveTo": null,
    "supersededBy": null
  }
]
```
Derived `verificationHealth` outcomes at `evaluatedAt = 2026-08-14T10:00:00Z`:
- Server 366 record: `current`.
- Server 367 record: `current`.
Without later qualifying confirmations, either record becomes `stale` only after the gap exceeds five full days from its `verificationThrough` value.

## 8. Combat-Strength Observation Model
Combat strength is historical observed data attached to a union/server/season relationship.

### Rules
- Combat strength belongs to the relation, not the global union identity.
- Each observation is preserved rather than overwritten.
- The UI may select the latest confirmed observation for display.
- Combat strength must remain a measured observation, not a qualitative label.
- Review state never substitutes for the value of the fact being reviewed.

### Fields
- `observationId`
- `unionId`
- `serverId`
- `seasonId`
- `value`
- `unit`
- `displayFormat`
- `observedAt`
- `sourceType`
- `evidenceId`
- `extractionMethod`
- `rawExtractedValue`
- `normalizedValue`
- `confidence`
- `reviewState`
- `reviewer`
- `reviewedAt`

### Example
```json
{
  "observationId": "combat-5017",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "value": 128450,
  "unit": "combat strength",
  "displayFormat": "number",
  "observedAt": "2026-07-25T09:15:00Z",
  "sourceType": "screenshot_extraction",
  "evidenceId": "evidence-9002",
  "extractionMethod": "ocr",
  "rawExtractedValue": "128,450",
  "normalizedValue": 128450,
  "confidence": 0.91,
  "reviewState": "confirmed",
  "reviewer": "user-01",
  "reviewedAt": "2026-07-25T09:40:00Z"
}
```

## 9. Evidence and Review Model
Evidence records capture how a fact entered the system and how it was reviewed.

### Supported source types
- manual_entry
- screenshot_extraction
- imported_data
- api_integration
- bot_integration

### Supported review states
- proposed
- confirmed
- rejected
- superseded

### Fields
- `evidenceId`
- `sourceType`
- `sourceAssetRef`
- `rawExtractedValue`
- `normalizedValue`
- `confidence`
- `observedAt`
- `reviewState`
- `reviewer`
- `reviewedAt`
- `notes`
- `linkedEntityType`
- `linkedEntityId`

### Rules
- Automated extraction proposes facts; it does not silently confirm them.
- Evidence should retain both raw and normalized values where available.
- Confidence belongs to the evidence item or observation.
- Review state must be explicit.
- `evidenceId` is the internal record identifier.
- `sourceAssetRef` identifies the screenshot, file, import, API payload, or bot message being preserved.
- Evidence records may reference one or more related entities through `linkedEntityId`.
- Imported data is a source type and uses the same evidence and review lifecycle as other sources.

### Example
```json
{
  "evidenceId": "evidence-9002",
  "sourceType": "screenshot_extraction",
  "sourceAssetRef": "shot-2026-07-25-a",
  "rawExtractedValue": "128,450",
  "normalizedValue": 128450,
  "confidence": 0.91,
  "observedAt": "2026-07-25T09:15:00Z",
  "reviewState": "confirmed",
  "reviewer": "user-01",
  "reviewedAt": "2026-07-25T09:40:00Z",
  "notes": "OCR matched the server card text.",
  "linkedEntityType": "CombatStrengthObservation",
  "linkedEntityId": "combat-5017"
}
```

## 10. Union-Matching Workflow
Screenshot-extracted names or tags must be matched against the union registry without silently merging different unions.

### Workflow
1. Extract name, tag, and any supporting context.
2. Try exact ID or tag match.
3. Try alias match.
4. If one candidate remains, propose a linked union reference.
5. If no candidate fits, create a proposed new union identity.
6. If multiple candidates fit, mark the match ambiguous and require review.
7. Do not silently merge different unions with similar names.
8. Only a confirmed reviewer action may finalize a merge or link.

### Match outcomes
- `exact_match`
- `alias_match`
- `proposed_new_union`
- `ambiguous_match`
- `review_required`

### Example
```json
{
  "extractedName": "MLG",
  "extractedTag": "MLG",
  "matchOutcome": "exact_match",
  "candidateUnionIds": ["union-0001"],
  "linkedUnionId": "union-0001",
  "reviewState": "proposed"
}
```

## 11. Data Invariants
- Global union identity remains separate from season and server state.
- Combat strength is historical observed data, not a permanent union property.
- Automated extraction proposes facts; it does not silently confirm them.
- Calculated territory statistics do not belong inside union identity.
- Deleting or renaming a union must not break historical evidence references.
- A union can relate to multiple servers and seasons.
- Native and active statuses must preserve provenance and review state.
- Screenshot-derived facts must stay reviewable.
- Ambiguous matches must never be auto-merged.
- Historical observations must remain queryable even when a newer observation supersedes them.
- Review state never substitutes for the value of the fact being reviewed.
- Derived relation summaries must be reproducible from authoritative records.
- Automated extraction cannot create a confirmed record without an explicit trusted-source policy.
- Union identities are archived rather than destructively deleted when historical records reference them.
- Historical effective periods cannot overlap for the same status type and relationship.

## 12. Example Records
### Union identity
```json
{
  "unionId": "union-0001",
  "displayName": "Moonlight Guillotine",
  "tag": "MLG",
  "aliases": ["Moonlight G"],
  "defaultColor": "#8FCEFF"
}
```

### Relation record
```json
{
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "currentNativeStatusId": "native-assign-0142",
  "currentActiveStatusId": "active-status-0281"
}
```

### Native status history
```json
[
  {
    "assignmentId": "native-assign-0141",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "nativeState": "unknown",
    "reviewState": "superseded",
    "sourceType": "manual_entry",
    "rawExtractedValue": null,
    "normalizedValue": "union-0001",
    "confidence": null,
    "evidenceId": null,
    "observedAt": "2026-07-01T10:00:00Z",
    "effectiveFrom": "2026-07-01T10:00:00Z",
    "effectiveTo": "2026-07-10T18:42:00Z",
    "reviewer": "user-01",
    "reviewedAt": "2026-07-10T18:42:00Z",
    "supersededBy": "native-assign-0142"
  },
  {
    "assignmentId": "native-assign-0142",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "nativeState": "native",
    "reviewState": "confirmed",
    "sourceType": "screenshot_extraction",
    "rawExtractedValue": "MLG",
    "normalizedValue": "union-0001",
    "confidence": 0.94,
    "evidenceId": "evidence-9001",
    "observedAt": "2026-07-10T18:42:00Z",
    "effectiveFrom": "2026-07-10T18:42:00Z",
    "effectiveTo": null,
    "reviewer": "user-01",
    "reviewedAt": "2026-07-10T19:05:00Z",
    "supersededBy": null
  }
]
```

### Active status history
```json
[
  {
    "statusId": "active-status-0282",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "active",
    "reviewState": "superseded",
    "derivedFrom": "verified_zero_territory_period",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-30T09:00:00Z",
    "zeroTerritorySince": "2026-07-30T09:00:00Z",
    "verificationWindowStartedAt": "2026-07-30T09:00:00Z",
    "verificationThrough": "2026-08-13T10:00:00Z",
    "verificationSnapshotIds": [
      "snapshot-366-2026-07-30",
      "snapshot-366-2026-08-02",
      "snapshot-366-2026-08-05",
      "snapshot-366-2026-08-09",
      "snapshot-366-2026-08-13"
    ],
    "effectiveFrom": "2026-07-30T09:00:00Z",
    "effectiveTo": "2026-08-13T10:00:00Z",
    "supersededBy": "active-status-0283"
  },
  {
    "statusId": "active-status-0283",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "inactive",
    "reviewState": "confirmed",
    "derivedFrom": "verified_zero_territory_period",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-30T09:00:00Z",
    "zeroTerritorySince": "2026-07-30T09:00:00Z",
    "verificationWindowStartedAt": "2026-07-30T09:00:00Z",
    "verificationThrough": "2026-08-13T10:00:00Z",
    "verificationSnapshotIds": [
      "snapshot-366-2026-07-30",
      "snapshot-366-2026-08-02",
      "snapshot-366-2026-08-05",
      "snapshot-366-2026-08-09",
      "snapshot-366-2026-08-13"
    ],
    "effectiveFrom": "2026-08-13T10:00:00Z",
    "effectiveTo": null,
    "supersededBy": null
  },
  {
    "statusId": "active-status-0301",
    "unionId": "union-0001",
    "serverId": "server-367",
    "seasonId": "season-1",
    "activityState": "active",
    "reviewState": "confirmed",
    "derivedFrom": "confirmed_ownership",
    "firstConfirmedPresenceAt": "2026-07-18T12:00:00Z",
    "mostRecentConfirmedPresenceAt": "2026-08-13T10:00:00Z",
    "zeroTerritorySince": null,
    "verificationWindowStartedAt": null,
    "verificationThrough": "2026-08-13T10:00:00Z",
    "verificationSnapshotIds": [
      "snapshot-367-2026-08-13"
    ],
    "effectiveFrom": "2026-07-18T12:00:00Z",
    "effectiveTo": null,
    "supersededBy": null
  },
  {
    "statusId": "active-status-0401",
    "unionId": "union-0009",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "inactive",
    "reviewState": "confirmed",
    "derivedFrom": "known_relation_without_confirmed_ownership",
    "firstConfirmedPresenceAt": null,
    "mostRecentConfirmedPresenceAt": null,
    "zeroTerritorySince": null,
    "verificationWindowStartedAt": null,
    "verificationThrough": null,
    "verificationSnapshotIds": [],
    "effectiveFrom": "2026-07-01T00:00:00Z",
    "effectiveTo": null,
    "supersededBy": null
  }
]
```

### Combat observation history
```json
[
  {
    "observationId": "combat-5017",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "value": 128450,
    "reviewState": "confirmed",
    "observedAt": "2026-07-25T09:15:00Z"
  },
  {
    "observationId": "combat-5072",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "value": 129100,
    "reviewState": "confirmed",
    "observedAt": "2026-07-27T20:03:00Z"
  }
]
```

### Evidence record
```json
{
  "evidenceId": "evidence-9004",
  "sourceType": "manual_entry",
  "sourceAssetRef": "note-2026-07-25-server-366",
  "reviewState": "confirmed",
  "linkedEntityType": "ActiveUnionStatus",
  "linkedEntityId": "active-status-0281"
}
```

## 13. Mapping From the Current Data Files
### Current `data/unions.json`
The current registry maps to UnionIdentity.

Observed fields:
- `id` maps to `unionId`
- `displayName` maps to `displayName`
- `shortName` maps to `tag`
- `color` maps to `defaultColor`
- `emblem` maps to presentation metadata
- `notes` maps to presentation or editorial metadata
- `active` is a registry-management field whose current meaning must be verified before reuse
- `active` must never be interpreted as active presence on a particular server

Current shape example:
```json
{
  "id": "union-0001",
  "shortName": "MLG",
  "displayName": "Moonlight Guillotine",
  "color": "#8FCEFF",
  "emblem": "crescent-blade"
}
```

### Current `data/season1-servers.json`
The current server file maps to server-scoped relation data and server notes, not to union identity.

Observed fields:
- `id` maps to `serverId`
- `label` maps to a server display label
- `baseMapId` identifies the season map context
- `activeUnionId` is a relation shortcut, not a global union property
- `ownership` belongs to server state, not union identity
- `notes` belongs to server observations
- `objectives` and `history` are server-scoped collections
- `lastUpdated` is a server record timestamp and not a union identity field

### Schema implications
- The current data files already separate shared union registry data from server-scoped records.
- The proposed model extends that separation with explicit relation, evidence, and observation entities.
- Historical strength and status should be linked through relation records rather than copied into the union registry.
- `unions.json.active` must be treated as a registry-management field until its meaning is verified.

## 14. Explicit Exclusions
The following are intentionally excluded from this model:
- threat ratings
- strong/weak labels
- recommended actions
- strategic priority
- objectives
- diplomacy recommendations
- AI-generated judgments
- calculated territory summaries inside union identity
- prescriptive server rankings

## 15. Genuine Unresolved Questions
No unresolved questions remain after the recorded decisions above.
