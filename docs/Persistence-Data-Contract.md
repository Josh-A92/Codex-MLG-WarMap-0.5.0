# Persistence Data Contract

## Purpose
Define the first storage-neutral persistence contract for the currently implemented mutable Server State Service runtime.

This contract standardizes what is saved and restored so local files, browser storage, databases, or remote APIs can implement the same boundary later.

## Scope
Version 1 persistence scope is limited to the server identities required to address mutable per-server territory ownership state, plus that ownership state itself.

In scope:
- Persist per-server `ownership` maps keyed by territory key (`"row-col"` style key such as `"10-11"`).
- Persist explicit `null` ownership overrides.
- Preserve the distinction between:
  - missing ownership key (use base-map fallback at runtime)
  - explicit ownership key with `null` value (suppress base-map fallback)
- Require an explicit Server State Service operation for override removal.
- Override removal deletes the ownership key and re-enables base-map fallback.
- Setting ownership to `null` remains distinct from removal: `null` suppresses fallback and represents unclaimed ownership.
- Scope each payload to exactly one `seasonId` and one `baseMapId`.
- Identify each server by stable server `id`.
- Preserve user-registered server display labels across restarts.
- Support exactly one current envelope per `seasonId` + `baseMapId` combination.

## Authority boundaries
- Server State Service owns live mutable state in memory.
- Persistence payloads are snapshots of service state, not a second live authority.
- Shared base-map tile data remains immutable definition data and is not persistence-owned mutable state.
- Renderer must use runtime services and must never read or write persistence storage directly.
- This contract requires service-level capability for explicit ownership override removal; UI exposure is a later integration decision.

## Canonical version 1 envelope
```json
{
  "schemaVersion": 1,
  "seasonId": "season-1",
  "baseMapId": "season1-map",
  "savedAt": "2026-07-28T12:00:00.000Z",
  "servers": [
    {
      "id": "server-366",
      "label": "Server 366",
      "ownership": {
        "10-10": "union-0001",
        "10-11": null
      }
    }
  ]
}
```

## Field definitions
Top level:
- `schemaVersion`: integer `1` in this contract version.
- `seasonId`: non-empty, non-whitespace string. Must match active runtime season.
- `baseMapId`: non-empty, non-whitespace string. Must match active runtime base map.
- `savedAt`: UTC ISO-8601 timestamp string in canonical format `YYYY-MM-DDTHH:mm:ss.sssZ`.
- `servers`: array of server ownership records.

Server record:
- `id`: non-empty, non-whitespace stable server ID string.
- `label`: optional non-empty, non-whitespace display label. It is persisted for user-registered servers; its omission remains accepted for older version 1 saves.
- `ownership`: plain object keyed by non-empty, non-whitespace territory keys.

Ownership map entry:
- key: non-empty territory key string.
- value: either:
  - non-empty, non-whitespace union-ID string, or
  - `null` (explicit override that suppresses base-map fallback).

## Validation rules
- `schemaVersion` must equal integer `1`.
- Any other `schemaVersion` value fails as unsupported.
- `seasonId`, `baseMapId`, and server `id` values must be non-empty, non-whitespace strings.
- `savedAt` must be a valid UTC ISO-8601 timestamp in canonical format `YYYY-MM-DDTHH:mm:ss.sssZ`.
- `servers` must be an array.
- Server IDs must be unique within one payload.
- A present server `label` must be a non-empty, non-whitespace string.
- Each server `ownership` must be a plain object.
- Ownership keys must be non-empty, non-whitespace strings.
- Ownership values must be `null` or non-empty, non-whitespace union-ID strings.
- Unknown fields at top level are rejected in version 1.
- Unknown fields other than the optional server `label` inside each server record are rejected in version 1.
- Invalid payloads fail as a whole and are not partially applied.
- Loading must not mutate the supplied payload.
- Saving must serialize safe copies, not live mutable references.

## Missing, malformed, and incompatible save behavior
- Missing save data is a normal first-run condition and is not an error.
- Missing save data must leave the already initialized Server State Service unchanged.
- Malformed save data (shape/type/validation failures) must fail clearly.
- Incompatible save data (unsupported `schemaVersion`) must fail clearly.
- Version 1 does not define migrations. Migration behavior is future work.

## Restoration rules
- Restoration requires active runtime context from Server State Service (`seasonId`, `baseMapId`, and its server-registration boundary).
- Persisted `seasonId` must match active runtime `seasonId` before apply.
- Persisted `baseMapId` must match active runtime `baseMapId` before apply.
- Persisted server IDs that do not yet exist in the runtime are registered through the Server State Service before ownership is restored. Their persisted `label` is used when present; older payloads without a label fall back to the server ID.
- A runtime that does not expose server registration must still reject unknown persisted server IDs clearly rather than silently ignoring them.
- Successful restoration replaces complete per-server ownership state atomically rather than merging individual keys.
- Active servers omitted from persisted `servers` must receive empty ownership maps (`{}`) as part of that same successful atomic replacement.
- Restoration applies atomically after full validation succeeds. If ownership replacement fails, servers created solely for that restoration attempt are removed again.

## Storage-adapter boundary
Persistence responsibilities are split without selecting a backend:
- Server State Service:
  - owns live mutable state and server ownership APIs.
- Serializer/validator:
  - converts between live service state and canonical persistence envelope.
  - performs strict versioned validation.
- Persistence service:
  - coordinates load/validate/restore/save flow.
  - handles missing-save vs malformed/incompatible outcomes.
  - generates `savedAt` using an injected clock.
- Storage adapter:
  - performs actual read/write operations against chosen storage backend.
  - preserves the canonical envelope unchanged and must not replace `savedAt`.
  - may store backend-native timestamps only as adapter metadata outside the canonical envelope.
- Application Bootstrap:
  - coordinates initialization order and when restoration is attempted.
- Renderer:
  - never reads or writes storage directly.

## Explicit exclusions
Version 1 must not persist:
- Shared base-map definitions.
- Season packages or rules.
- Union registry presentation data.
- Base-map fallback `ownerId` values.
- Calculated summaries or dashboard totals.
- Renderer, camera, selection, or workspace UI state.
- Placeholder objectives, history, or notes.
- Target snapshot/evidence records that are not implemented yet.

## Future evolution
Planned later, not part of this contract version:
- Schema migration strategy and multi-version compatibility rules.
- Optional integrity metadata (for example checksums) if needed.
- Explicit conflict behavior for multi-writer scenarios.
- Expansion beyond ownership once runtime authorities exist for additional mutable domains.
- Named slots, environments, multiple save envelopes, and save-selection indexes.

Save timing is intentionally out of scope for this contract.
Manual save, change-triggered save, debounced save, and shutdown save are integration decisions to be defined later.
