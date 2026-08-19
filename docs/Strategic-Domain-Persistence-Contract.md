# Strategic Domain Persistence Contract

## Purpose

Define the storage-neutral version 2 contract for mutable, season-scoped strategic domain state.

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

Version 2 persists:

- known union/server/season relations;
- native-union assignment history;
- active-union status history;
- server observation history;
- canonical territory ownership history;
- canonical logical-structure ownership history;
- append-only ownership-retraction history;
- target-verification history;
- confirmed server-snapshot history;
- confirmed-presence facts;
- qualifying full-map confirmation facts.

Version 2 does not persist:

- season packages, rules, structure values, phases, or map definitions;
- union identities or presentation metadata;
- evidence assets or screenshot binaries;
- calculated summaries, activity projections, map freshness projections, or dashboard totals;
- UI, camera, selection, workspace, or authentication state;
- the existing legacy Server State Service ownership map.

## Union registry boundary

Union identity is global and may be referenced by more than one season. It must therefore not be duplicated into each season envelope.

Before restoring a strategic envelope, the application must load the authoritative global Union Registry Service. Every `unionId` referenced by restored strategic state must resolve through that registry.

User-created or edited global union identities use the separate global Union
Registry persistence contract. Its serializer and storage-neutral persistence
coordinator are implemented; application-startup and concrete storage-adapter
integration remain separate work. Until that integration is completed,
`data/unions.json` remains the live application’s registry source.

## Transitional ownership boundary

Canonical ownership records and append-only ownership retractions are the authoritative ownership history. The Server State Service ownership map is a derived projection rebuilt from that history.

- Legacy ownership state may be read only through the explicit migration and startup compatibility path.
- Missing ownership keys, explicit null or unclaimed values, and resolved ownership values remain distinct states and must not be collapsed during projection or migration.
- No independent dual-write authority is permitted; canonical history remains the sole ownership authority.

## Logical storage identity

Version 2 defines exactly one current strategic envelope per `seasonId`.

The logical storage key is:

```text
strategic-domain / seasonId
```

Named slots, environments, branches, and multiple concurrent envelopes are future contract versions.

## Canonical version 2 envelope

```json
{
  "schemaVersion": 2,
  "seasonId": "season-1",
  "savedAt": "2026-07-30T22:30:00.000Z",
  "state": {
    "relations": [],
    "nativeAssignments": [],
    "activeStatuses": [],
    "combatStrengthObservations": [],
    "serverObservations": [],
    "territoryOwnershipRecords": [],
    "structureOwnershipRecords": [],
    "ownershipRetractions": [],
    "targetVerifications": [],
    "confirmedSnapshots": [],
    "confirmedPresenceFacts": [],
    "qualifyingFullMapConfirmations": []
  }
}
```

## Required fields

Top level:

- `schemaVersion`: integer `2`.
- `seasonId`: non-empty, non-whitespace string.
- `savedAt`: canonical UTC timestamp in `YYYY-MM-DDTHH:mm:ss.sssZ` form.
- `state`: plain object containing every version 2 state collection.

State collections:

- `relations`
- `nativeAssignments`
- `activeStatuses`
- `combatStrengthObservations`
- `serverObservations`
- `territoryOwnershipRecords`
- `structureOwnershipRecords`
- `ownershipRetractions`
- `targetVerifications`
- `confirmedSnapshots`
- `confirmedPresenceFacts`
- `qualifyingFullMapConfirmations`

Every state collection is required and must be an array. Empty arrays are valid.

Unknown top-level or `state` fields are rejected in version 2.

## Canonical service mapping

| Persisted collection | Runtime authority |
|---|---|
| `relations` | Union Server Season Relation Service |
| `nativeAssignments` | Native Union Assignment Service |
| `activeStatuses` | Active Union Status Service |
| `combatStrengthObservations` | Combat Strength Observation Service |
| `serverObservations` | Server Observation Service |
| `territoryOwnershipRecords` | Ownership Record Service |
| `structureOwnershipRecords` | Ownership Record Service |
| `ownershipRetractions` | Ownership Retraction Service |
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
- The storage-neutral Strategic Domain Persistence Service coordinates load,
  serialization, restoration, and save using the logical season identity.
- Before candidate runtime construction or save, every direct `unionId` and
  non-null `ownerUnionId` in the canonical collections must resolve through the
  loaded global Union Registry Service.
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

## Versioning and migration

- `schemaVersion` must equal integer `2` for the canonical persisted envelope.
- Version `1` envelopes are accepted as a legacy input and migrated to version `2` by adding an empty `state.ownershipRetractions` collection and changing `schemaVersion` to `2`.
- The v1 migration is structural only. It does not invent retractions, ownership facts, evidence, review state, or projection values.
- Migrated state is validated under the complete version 2 contract before runtime replacement or save.
- Other versions fail as unsupported.
- Breaking field or semantic changes require a new schema version.
- Future optional extension data must not be added outside a versioned contract.

## Explicitly deferred work

- Global Union Registry persistence integration with application startup and a
  concrete storage adapter.
- Evidence metadata and screenshot-asset persistence.
- Canonical ownership migration from the current Server State Service.
- Database schema, API endpoints, authentication provider, and authorization roles.
- Multi-writer concurrency and conflict-resolution protocol.
- Autosave/debounce/manual-save policy for strategic state.
- Strategic persistence bootstrap integration.

No unresolved version 2 envelope-shape questions remain.
