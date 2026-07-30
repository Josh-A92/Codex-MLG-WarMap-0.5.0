# Strategic Domain Persistence Contract

## Purpose

Define the storage-neutral version 1 contract for mutable, season-scoped strategic domain state.

The contract allows the same canonical state to be stored by a local adapter during desktop development or by a hosted database/API later. It does not select a backend.

## Authority boundary

- Season packages remain immutable rules and definitions.
- The global union registry remains the authority for reusable union identities.
- This envelope owns editable union/server/season relations and their factual histories.
- Runtime services own live in-memory state.
- A persisted envelope is a restorable snapshot, not a second live authority.
- Derived dashboard values and read-time projections are never persisted as independent facts.
- Renderer and UI code must not access storage directly.

## Scope

Version 1 persists:

- known union/server/season relations;
- native-union assignment history;
- active-union status history;
- canonical territory ownership history;
- canonical logical-structure ownership history;
- target-verification history;
- confirmed server-snapshot history;
- confirmed-presence facts;
- qualifying full-map confirmation facts.

Version 1 does not persist:

- season packages, rules, structure values, phases, or map definitions;
- union identities or presentation metadata;
- evidence assets or screenshot binaries;
- combat-strength observations, which do not yet have a runtime authority;
- calculated summaries, activity projections, map freshness projections, or dashboard totals;
- UI, camera, selection, workspace, or authentication state;
- the existing legacy Server State Service ownership map.

## Union registry boundary

Union identity is global and may be referenced by more than one season. It must therefore not be duplicated into each season envelope.

Before restoring a strategic envelope, the application must load the authoritative global Union Registry Service. Every `unionId` referenced by restored strategic state must resolve through that registry.

Persistence for user-created or edited global union identities requires a separate global Union Registry persistence contract. Until that boundary is implemented, `data/unions.json` remains the application’s registry source.

## Transitional ownership boundary

The current map editor writes and persists Server State Service ownership overrides. The canonical strategic runtime separately exposes immutable ownership-record histories.

These must not both be treated as authoritative.

Until map editing is migrated to canonical ownership records:

- canonical strategic ownership histories must remain empty in the live application;
- the existing Server State Service remains the temporary runtime authority for map ownership;
- no automatic conversion from the legacy ownership map may invent evidence, review, observation, or confirmation history.

After migration:

- confirmed canonical ownership records and snapshots become authoritative;
- the displayed map becomes a projection of confirmed canonical state;
- the legacy ownership persistence envelope is retired or migrated explicitly;
- no dual-write period may be introduced without a documented reconciliation rule.

## Logical storage identity

Version 1 defines exactly one current strategic envelope per `seasonId`.

The logical storage key is:

```text
strategic-domain / seasonId
```

Named slots, environments, branches, and multiple concurrent envelopes are future contract versions.

## Canonical version 1 envelope

```json
{
  "schemaVersion": 1,
  "seasonId": "season-1",
  "savedAt": "2026-07-30T22:30:00.000Z",
  "state": {
    "relations": [],
    "nativeAssignments": [],
    "activeStatuses": [],
    "territoryOwnershipRecords": [],
    "structureOwnershipRecords": [],
    "targetVerifications": [],
    "confirmedSnapshots": [],
    "confirmedPresenceFacts": [],
    "qualifyingFullMapConfirmations": []
  }
}
```

## Required fields

Top level:

- `schemaVersion`: integer `1`.
- `seasonId`: non-empty, non-whitespace string.
- `savedAt`: canonical UTC timestamp in `YYYY-MM-DDTHH:mm:ss.sssZ` form.
- `state`: plain object containing every version 1 state collection.

State collections:

- `relations`
- `nativeAssignments`
- `activeStatuses`
- `territoryOwnershipRecords`
- `structureOwnershipRecords`
- `targetVerifications`
- `confirmedSnapshots`
- `confirmedPresenceFacts`
- `qualifyingFullMapConfirmations`

Every state collection is required and must be an array. Empty arrays are valid.

Unknown top-level or `state` fields are rejected in version 1.

## Canonical service mapping

| Persisted collection | Runtime authority |
|---|---|
| `relations` | Union Server Season Relation Service |
| `nativeAssignments` | Native Union Assignment Service |
| `activeStatuses` | Active Union Status Service |
| `territoryOwnershipRecords` | Ownership Record Service |
| `structureOwnershipRecords` | Ownership Record Service |
| `targetVerifications` | Target Verification Service |
| `confirmedSnapshots` | Confirmed Server Snapshot Service |
| `confirmedPresenceFacts` | Activity Fact History Service |
| `qualifyingFullMapConfirmations` | Activity Fact History Service |

Serialization reads safe copies through each service’s public list/read API. It must not access internal service state.

## Validation

Envelope validation occurs in layers:

1. Validate the strict versioned envelope shape.
2. Require every record’s `seasonId` to match the envelope `seasonId`.
3. Validate each canonical history with its existing domain validator where one exists.
4. Validate relation and activity-fact collections through their owning service constructors.
5. Require every referenced `unionId` to exist in the loaded global union registry.
6. Construct the complete candidate strategic runtime.
7. Validate cross-service references and projections.
8. Only after all validation succeeds may the candidate replace the active runtime.

Individually invalid records must not participate in cross-record or cross-service resolution.

Validation and restoration are atomic. No collection may be partially applied.

## Serialization rules

- `savedAt` is supplied by the persistence coordinator using an injected clock.
- Storage adapters preserve the canonical envelope unchanged.
- Serialization must not mutate runtime services or retain live references.
- Collection ordering must be deterministic and preserve the owning service’s canonical list order.
- The serializer must not invent, normalize, confirm, reject, or supersede domain records.
- Derived relation cache fields may be stored only as part of the canonical relation record and must remain reproducible from authoritative histories.

## Restoration rules

- Missing storage is a normal first-run condition and leaves the empty initialized runtime unchanged.
- Unsupported schema versions fail clearly.
- The envelope `seasonId` must match the active season.
- All input is validated before any active runtime reference changes.
- Restoration creates a new candidate runtime from the envelope; it does not merge records into the active runtime.
- On success, orchestration replaces the active runtime reference atomically.
- On failure, the previous runtime remains active and unchanged.
- Input envelopes and returned state must be safe copies.

## Hosted multi-user evolution

This snapshot contract is a portability and restoration boundary, not the final multi-user write protocol.

A hosted implementation may store the collections as normalized database records rather than one JSON document, provided that:

- the same canonical fields and invariants are preserved;
- server-side authorization controls mutations;
- writes use transactions or equivalent atomic guarantees;
- concurrency and conflict detection are explicit;
- confirmed and superseded histories remain immutable and auditable;
- the API can reconstruct an envelope conforming to this contract.

Authentication determines identity. Authorization determines which domain actions that identity may perform. Neither belongs inside the persistence envelope.

## Versioning

- `schemaVersion` must equal integer `1`.
- Other versions fail as unsupported.
- Version 1 defines no migration behavior.
- Breaking field or semantic changes require a new schema version.
- Future optional extension data must not be added outside a versioned contract.

## Explicitly deferred work

- Global Union Registry persistence.
- Evidence metadata and screenshot-asset persistence.
- Combat-strength observation persistence.
- Canonical ownership migration from the current Server State Service.
- Database schema, API endpoints, authentication provider, and authorization roles.
- Multi-writer concurrency and conflict-resolution protocol.
- Autosave/debounce/manual-save policy for strategic state.
- Strategic persistence bootstrap integration.

No unresolved version 1 envelope-shape questions remain.
