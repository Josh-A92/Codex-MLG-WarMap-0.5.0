# Evidence Data Model

## Purpose

Define the provider-neutral evidence boundary used by direct uploads, future Discord ingestion, and screenshot-extraction services.

Evidence preserves what was submitted. It does not decide game state.

## Entity separation

### EvidenceAsset

An immutable uploaded source asset plus operational processing status.

It answers:

- what file was preserved;
- who uploaded it and when;
- when its contents were observed;
- whether observation time is exact or approximate;
- whether processing succeeded;
- whether the preserved bytes still match their integrity hash.

### EvidenceRecord

A reviewable extracted or manually linked evidence item that references an `EvidenceAsset`.

It answers:

- what value or candidate fact was extracted;
- which entity or target it concerns;
- confidence and ambiguity;
- whether the proposal was confirmed, rejected, corrected, or superseded.

Asset processing state and fact review state are independent. A successfully processed screenshot can produce rejected or ambiguous proposals. A failed asset has no confirmed factual meaning.

## EvidenceAsset canonical fields

All fields are required, including nullable fields:

- `assetId`
- `storageRef`
- `ingestionSource`
- `mediaType`
- `byteSize`
- `pixelWidth`
- `pixelHeight`
- `uploadedBy`
- `uploadedAt`
- `observedAt`
- `observationTimePrecision`
- `integrityHash`
- `processingState`
- `processedAt`
- `failureReason`
- `sourceContext`

## EvidenceAsset rules

- `assetId` and `storageRef` are stable non-empty identifiers.
- `ingestionSource` is `application_upload`, `discord_upload`, `api_upload`, or `bot_upload`.
- Initial supported media types are `image/jpeg` and `image/png`.
- Media type is detected by the backend, not selected by the user.
- `byteSize`, `pixelWidth`, and `pixelHeight` are positive integers.
- `uploadedBy` is the authenticated actor or trusted integration identity.
- `uploadedAt` is backend-generated.
- `observedAt` is the resolved fixed observation timestamp and cannot be later than `uploadedAt`.
- `observationTimePrecision` is `exact` or `approximate`.
- Relative input such as `2 hours ago` is resolved before this record is created.
- `integrityHash` is canonical `sha256:` followed by 64 lowercase hexadecimal characters.
- `sourceContext` is a JSON-compatible plain object for ingestion metadata such as Discord message IDs.
- The original asset and its identity, storage, dimensions, provenance, observation time, and hash are immutable.

Processing lifecycle:

- `uploaded`: `processedAt` and `failureReason` are null.
- `processed`: `processedAt` is at or after `uploadedAt`; `failureReason` is null.
- `failed`: `processedAt` is at or after `uploadedAt`; `failureReason` is non-empty.
- Processing state may move from `uploaded` to `processed` or `failed`.
- A failed asset may be retried by returning to processing outside the canonical record, then producing `processed` or a later `failed` result through the service boundary.
- Processing state is operational metadata, not a human review outcome.

## EvidenceAsset example

```json
{
  "assetId": "asset-9002",
  "storageRef": "private/evidence/asset-9002",
  "ingestionSource": "application_upload",
  "mediaType": "image/png",
  "byteSize": 482193,
  "pixelWidth": 561,
  "pixelHeight": 968,
  "uploadedBy": "user-01",
  "uploadedAt": "2026-07-25T09:20:00.000Z",
  "observedAt": "2026-07-25T09:15:00.000Z",
  "observationTimePrecision": "approximate",
  "integrityHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "processingState": "uploaded",
  "processedAt": null,
  "failureReason": null,
  "sourceContext": {}
}
```

## EvidenceRecord boundary

EvidenceRecord uses the canonical contract in `docs/Union-Data-Model.md`. It:

- reference `assetId`, never embed image bytes;
- preserve raw and normalized candidate values;
- identify the proposed entity or canonical map target;
- preserve confidence and ambiguity information;
- use the standard proposed/confirmed/rejected/superseded review lifecycle;
- remain provider-neutral;
- prevent extracted proposals from directly mutating confirmed state.

## Storage and deletion

- Binary assets live in private object/file storage.
- EvidenceAsset metadata lives in the authoritative data store.
- Assets referenced by proposals, confirmed facts, or historical facts cannot be deleted.
- A corrected/replacement screenshot is a new EvidenceAsset.
- Integrity hashes support verification and duplicate detection but do not imply review or confirmation.

## Persistence boundary

Evidence metadata uses a storage-neutral version 1 envelope:

```json
{
  "schemaVersion": 1,
  "savedAt": "2026-07-30T23:30:00.000Z",
  "assets": [],
  "evidenceRecords": []
}
```

- `assets` contains canonical EvidenceAsset history.
- `evidenceRecords` contains canonical EvidenceRecord history.
- Every non-null EvidenceRecord `assetId` must resolve within the envelope.
- The envelope stores metadata and stable storage references, never image bytes.
- Both histories and their cross-references validate before a candidate Evidence
  Domain Runtime is constructed.
- Serialization and restoration use safe copies.
- This boundary does not select local files, object storage, a database, an
  extraction provider, or an ingestion adapter.

## Explicit exclusions

- OCR or multimodal provider implementation.
- Discord-specific extraction logic.
- Ownership, union matching, or scoring decisions.
- Review UI.
- Import/export or backup workflows.
- Storage provider selection.

No unresolved EvidenceAsset contract questions remain.
