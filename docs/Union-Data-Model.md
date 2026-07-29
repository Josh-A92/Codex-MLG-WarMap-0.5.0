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
Active-union status records whether a union is active within a server and season context.

### Active-state rules
- A union being known on a server is separate from its activity state.
- A known union with no confirmed ownership history is inactive.
- A union becomes active when it owns confirmed territory.
- Losing the final territory begins a fourteen-day verified zero-territory period while the union remains active.
- Confirmed recapture cancels the period.
- Losing the final territory again begins a new period.
- Fourteen full verified days without ownership changes the union to inactive.
- Missing or stale verification prevents automatic inactivity and produces stale or unverified activity evidence.
- Presence-only evidence can establish a known server association but cannot independently make a union active.
- Confirmed ownership remains valid until superseded.
- Manual correction of the confirmed ownership or evidence timeline takes precedence over automated proposals and causes activity to be derived again.
- A union/server/season relationship may preserve historical active-status records while keeping only one effective current active-status record.

### Fact values
- `activityState`: `active`, `inactive`, `unknown`, or `stale`

### Review states
- `reviewState`: `proposed`, `confirmed`, `rejected`, or `superseded`

### Fields
- `statusId`
- `unionId`
- `serverId`
- `seasonId`
- `activityState`
- `reviewState`
- `derivedFrom`
- `sourceType`
- `evidenceId`
- `firstConfirmedPresenceAt`
- `mostRecentConfirmedPresenceAt`
- `zeroTerritorySince`
- `verificationThrough`
- `effectiveFrom`
- `effectiveTo`
- `manualOverride`

### Rules
- The relation may reference the current record.
- Historical records remain closed or superseded.
- Effective time ranges must not overlap.
- Presence timestamps and evidence references should be derived from confirmed observations or status records wherever practical.
- Cached summary fields such as `firstConfirmedPresenceAt` and `mostRecentConfirmedPresenceAt` are non-authoritative and must be reproducible from underlying records.
- `zeroTerritorySince` records the confirmed loss of the final territory when a zero-territory period exists.
- `verificationThrough` records how far the zero-territory period is supported by confirmed server observations.

### Example
```json
{
  "statusId": "active-status-0281",
  "unionId": "union-0001",
  "serverId": "server-366",
  "seasonId": "season-1",
  "activityState": "active",
  "reviewState": "confirmed",
  "derivedFrom": "confirmed_ownership",
  "sourceType": "manual_entry",
  "evidenceId": "evidence-9004",
  "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
  "mostRecentConfirmedPresenceAt": "2026-07-25T09:15:00Z",
  "effectiveFrom": "2026-07-10T18:42:00Z",
  "effectiveTo": null,
  "manualOverride": null
}
```

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
    "statusId": "active-status-0280",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "stale",
    "reviewState": "superseded",
    "derivedFrom": "ownership_verification_gap",
    "sourceType": "manual_entry",
    "evidenceId": "evidence-9003",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-20T09:00:00Z",
    "zeroTerritorySince": "2026-07-20T09:00:00Z",
    "verificationThrough": "2026-07-22T09:00:00Z",
    "effectiveFrom": "2026-07-10T18:42:00Z",
    "effectiveTo": "2026-07-25T09:14:59Z",
    "manualOverride": null
  },
  {
    "statusId": "active-status-0281",
    "unionId": "union-0001",
    "serverId": "server-366",
    "seasonId": "season-1",
    "activityState": "active",
    "reviewState": "confirmed",
    "derivedFrom": "confirmed_ownership",
    "sourceType": "manual_entry",
    "evidenceId": "evidence-9004",
    "firstConfirmedPresenceAt": "2026-07-10T18:42:00Z",
    "mostRecentConfirmedPresenceAt": "2026-07-25T09:15:00Z",
    "zeroTerritorySince": null,
    "verificationThrough": "2026-07-25T09:15:00Z",
    "effectiveFrom": "2026-07-25T09:15:00Z",
    "effectiveTo": null,
    "manualOverride": null
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
