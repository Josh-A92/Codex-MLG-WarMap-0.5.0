# MLG WarMap Data Input Requirements Matrix

## 1. Purpose

This document translates the confirmed data specifications into operator-input requirements.

It identifies:

- which facts a user must be able to enter or correct;
- which facts may be proposed from screenshots or integrations;
- which records require confirmation;
- which values are supplied by a season package;
- which values are calculated and must not be entered manually;
- which workflow decisions remain unresolved.

This document does not prescribe a particular screen layout, tab structure, storage backend, or publishing workflow.

## 2. Input Classifications

| Classification | Meaning |
| --- | --- |
| Manual fact | A user can enter or correct the value directly |
| Assisted proposal | Screenshot extraction, a bot, an import, or a future API may propose the value |
| Confirmed record | An accepted fact that may contribute to authoritative state and calculations |
| Season definition | Stable map or game-rule information supplied by the active season package |
| System metadata | Identifier, timestamp, actor, version, or relationship information recorded by the application |
| Calculated value | Reproduced from confirmed state and season rules; never maintained as a separate manual total |
| Contextual note | Factual free-text context that must remain descriptive rather than prescriptive |

Automated proposals do not silently become confirmed facts unless a future trusted-source policy explicitly permits that source to do so.

## 3. Season and Application Configuration

These inputs describe the season and application context. They are not mutable server observations.

| Data point | Authority | Manual authoring required | Assisted proposal | Confirmation or validation | Primary consumers | Current implementation |
| --- | --- | --- | --- | --- | --- | --- |
| Season identity, label, status, and metadata | Season definition | Yes, when creating or maintaining a season package | Possible future import | Package validation | Bootstrap, Command Centre, Game Rules Engine | Canonical package exists |
| Shared map definition and dimensions | Season definition | Yes, unless generated from a verified source | Possible future import/extraction | Package and referenced-map validation | Renderer, calculations | Season 1 definition exists |
| Capturable and non-playable cell rules | Season definition | Yes | Possible future import | Package validation | Territory denominators and map behaviour | Contract exists |
| Structure types, codes, levels, categories, and capturability | Season definition | Yes | Possible future import/extraction | Package validation and reference integrity | Renderer, structure summaries, rules engine | Catalogue exists |
| Structure placement and footprints | Season definition / referenced map | Yes, unless generated from verified map data | Possible future extraction | Map reference and footprint validation | Renderer and territory calculations | Season 1 map exists |
| Resource identity, label, unit, and metric type | Season definition | Yes | Possible future import | Package validation | Summary Service and UI | Season 1 resource identity exists |
| Resource outputs and scoring rules | Season definition | Yes, when verified rules are available | Possible future import | Package validation and reference integrity | Game Rules Engine and Summary Service | Contract exists; Season 1 scoring is intentionally unconfigured |
| Phases, unlocks, capture rules, and buffs | Season definition | Yes | Possible future import | Package validation and reference integrity | Game Rules Engine | Contract and initial Season 1 definitions exist |
| Designated player union | Application configuration | Yes, or omitted explicitly | No requirement | Must reference a valid union when configured | Summary Service and Command Centre | Season 1 uses MLG |
| Workspace and data-source configuration | Application configuration | Yes during package authoring | No requirement | Required-field validation; no silent fallbacks | Bootstrap and navigation | Implemented |

Season rules are configuration, not live server state. A user-facing authoring system may eventually manage them, but the confirmed specifications do not yet define its exact interface or publication lifecycle.

### Confirmed structure-value authoring model

Structure resource and scoring values use a hybrid authoring model:

- Simple values are entered through structured fields or tables.
- A value is assigned to a stable structure type or code, such as Royal City or Town.
- Individual placed structures reference that structure type; they do not each require the same value to be re-entered.
- Structure footprint tiles do not store independent copies of the structure value.
- The active season package identifies the resource, unit, metric type, and calculation model.
- The Game Rules Engine interprets the rule, and summary services apply it to confirmed per-server ownership.
- More complex mechanics may reference reusable calculation rules rather than forcing a single numeric field to represent every season mechanic.
- The backend validates identifiers and references before accepting the configuration.

Example:

```text
Royal City -> X resource units
Town       -> Y resource units

Placed Royal City -> references Royal City type
Placed Town       -> references Town type

Confirmed structure ownership
        +
Season structure-value table
        ↓
Calculated union/server resource total
```

The database stores the authoritative season rule and structure relationships. It does not persist independently editable totals for every tile, union, or dashboard card. Multi-cell footprints are counted according to the declared calculation rule and must not accidentally multiply a per-structure value once per occupied cell.

### Confirmed season-initialization lifecycle

WarMap begins operational use only after the season rules and required season setup are known.

Normal lifecycle:

```text
Collect complete season information
        ↓
Enter complete season configuration
        ↓
Validate the entire configuration
        ↓
Initialize the season
        ↓
Lock the configuration
        ↓
Begin recording mutable server intelligence
```

The live database does not need to preserve incomplete season drafts as part of the normal workflow. A season cannot be initialized until its complete required configuration validates successfully.

Once initialized, the season configuration is immutable during normal operation. An exceptional correction for incorrect or subsequently clarified rules creates a new immutable configuration version, records the actor and reason, and preserves the earlier version for historical reproducibility.

### Locked season setup versus mutable intelligence

Locked season setup includes:

- season identity and metadata;
- participating server definitions and stable server identities;
- shared map definition and structure placements;
- structure catalogue and structure values;
- resource and scoring rules;
- phases and unlock rules;
- capture rules and buffs;
- required workspace and data-source configuration.

Mutable operational intelligence includes:

- union identities and presentation metadata, subject to audit/history rules;
- which unions are native to a server;
- which unions are active on a server;
- combat-strength observations;
- territory and structure ownership;
- factual server observations;
- evidence, proposals, and review outcomes;
- confirmed snapshots and completeness records.

The fact that Server 366 participates in the season is locked setup. Which unions are involved on Server 366, and their observed state during the season, remain editable variables.

## 4. Union Registry Inputs

Union identity is global presentation and matching data. It must remain separate from server- and season-specific facts.

| Data point | Authority | Manual entry | Screenshot or integration proposal | Confirmation/review | Historical treatment | Current implementation |
| --- | --- | --- | --- | --- | --- | --- |
| Stable union identity | Union registry | Required for a genuinely new union | Extraction may propose a match or a new identity | Ambiguous and proposed-new matches require review | Referenced identities are archived, not destructively deleted | Basic registry exists |
| Display name | Union registry | Yes | Extraction may propose normalization | Review when a proposal changes identity | Rename history should remain evidence-backed | Basic field exists |
| Tag or abbreviation | Union registry | Yes | Extraction may propose or match | Ambiguous matches require review | Earlier values may remain aliases | Basic field exists |
| Aliases and previous names | Union registry | Yes | Entity matching may propose additions | Review before changing matching behaviour | Preserved on identity and through rename evidence | Target model documented |
| Default colour | Union registry | Yes | Not required | Normal field validation | Current value may change without changing identity | Basic field exists |
| Emblem, icon, or presentation metadata | Union registry | Optional | Possible future extraction/import | Normal field validation | Does not alter server facts | Partially represented |

The registry must not treat a global `active` flag as proof that a union is active on a particular server.

## 5. Union, Server, and Season Relationship Inputs

These facts belong to a particular union on a particular server in a particular season.

| Data point | Manual entry/correction | Assisted proposal | Confirmation rule | System-managed context | Calculated or displayed from |
| --- | --- | --- | --- | --- | --- |
| Native-union assignment | Required capability | Screenshot extraction may propose | Proposed assignments remain reviewable until confirmed; native state and review state stay separate | Assignment ID, union/server/season IDs, effective period, source, evidence, actor/reviewer | Current confirmed native assignment |
| Active-union status | Required capability for evidence-based correction | Ownership and screenshot evidence may propose or support status | Confirmed ownership or confirmed presence establishes active status; presence-only data must not silently become inactive when stale | Status ID, effective period, source, evidence, actor/reviewer, derivation | Current effective confirmed status |
| Combat-strength observation | Required capability | Screenshot extraction, bot, import, or future API may propose | Preserve numeric/explicit recorded value, timestamp, source, and review state | Observation ID, union/server/season IDs, unit, observed time, evidence, actor/reviewer | Latest confirmed observation for display; all observations remain historical |
| Manual relationship override | Required capability where automated proposals are wrong | Not applicable | Manual correction overrides an automated proposal but must retain provenance | Actor, timestamp, reason/evidence where supplied | Current confirmed relationship state |
| Presence timestamps | No direct total-entry requirement | Derived from confirmed observations/status records | Must be reproducible from authoritative records | First and most recent confirmed-presence timestamps may be cached | Confirmed relationship history |

Only one effective current native-status record and one effective current active-status record may exist for the same union/server/season relationship. Earlier records remain historical.

### Confirmed known-union and activity policy

A union being known on a server is separate from its activity state.

- Adding a union to a server means the union is known to be associated with that server.
- A newly added known union with no confirmed ownership history is inactive.
- Confirmed ownership of at least one territory makes the union active.
- If an active union loses its final territory, it remains active during a fourteen-day verified zero-territory period.
- The period begins at the timestamp of the confirmed observation in which the final territory was lost.
- Fourteen full days must elapse before the union becomes inactive.
- Confirmed observations throughout the period must continue to show that the union owns no territory.
- If the required server information is missing or stale, the union must not be marked inactive automatically; its activity evidence becomes stale or unverified.
- Any confirmed recapture cancels the zero-territory period and keeps or restores the union to active.
- If the union subsequently loses its final territory again, a new fourteen-day period begins from that confirmed loss.
- A newly discovered union may be added retrospectively, with earlier activity periods recorded only where supporting confirmed evidence exists.

Example:

```text
Known union with no ownership history
        ↓
Inactive

Confirmed territory captured
        ↓
Active

Final territory lost
        ↓
Active during verified fourteen-day zero-territory period
        ├── Territory recaptured -> period cancelled; Active
        ├── Verification missing -> Stale or unverified; not automatically Inactive
        └── Fourteen full verified days -> Inactive
```

Activity changes are derived from confirmed ownership history and the fourteen-day rule. The application must preserve the status records and timestamps needed to explain why the current state was assigned.

## 6. Server Identity and Context Inputs

| Data point | Classification | Manual entry | Assisted proposal | Confirmation/validation | Notes |
| --- | --- | --- | --- | --- | --- |
| Server stable ID | Stored definition | Required when configuring a server | Possible future import | Must be unique and non-empty | Used for relationships and persistence |
| Display number and label | Stored definition | Required | Screenshot extraction may propose | Must remain linked to the stable server ID | Display number is not the persistence identity |
| Season and base-map references | Stored definition | Required | No current requirement | Must resolve to the active season/package context | Shared map remains immutable |
| Short factual server observation | Contextual note | Required capability | Extraction or integration may propose factual text | Must remain descriptive and retain author/source/time where practical | No objectives, priorities, or recommendations |

## 7. Territory and Structure State Inputs

| Data point | Manual entry/correction | Assisted proposal | Confirmation rule | Authority | Historical/provenance requirement | Current implementation |
| --- | --- | --- | --- | --- | --- | --- |
| Normal territory owner | Required and implemented on map | Screenshot extraction or integration may propose | Proposed changes must not alter confirmed state until accepted | Per-server territory ownership | Target model preserves evidence, actor, effective time, supersession, and snapshots | Authoritative isolated ownership with persistence |
| Explicit unclaimed state | Required capability | Extraction may propose | Must remain distinct from unknown/unverified | Per-server territory ownership | Preserve confirmation and evidence | Runtime supports explicit `null` override |
| Unknown or not-yet-verified territory | Required state distinction in target model | Extraction may leave unresolved | Must not be treated as confirmed unclaimed | Completeness/review state, not invented ownership | Reflected in completeness and proposals | Target model documented |
| Remove ownership override | Required service operation | Not applicable | Direct operation restores base-map fallback | Server State Service | Operation must not rewrite the base map | Implemented at service level |
| Logical structure owner | Required capability | Screenshot extraction may propose | Proposed changes require confirmation | Logical structure identity per server/season | Target model preserves immutable ownership records and snapshots | Current map editing works; full target record model remains future work |
| Structure footprint ownership | No separate manual input | Derived from logical structure owner | Not independently confirmable | Projection from logical structure identity | Must not compete with logical structure authority | Boundary documented |
| Confirmed server snapshot | Confirmation action rather than raw field entry | May be assembled from reviewed proposals | Becomes authoritative only when confirmed | Immutable snapshot | Must retain previous snapshot link, creator/reviewer, evidence, completeness, and timestamp | Target model documented; current persistence stores present ownership state |

## 8. Evidence and Review Inputs

| Data point | Source | User action required | System action | Authority effect |
| --- | --- | --- | --- | --- |
| Screenshot or other source asset | User upload or integration | Supply/select source | Preserve a stable source reference | Evidence only |
| Raw extracted text/data | Extraction service | Review where relevant | Preserve without silently rewriting it | Evidence only |
| Normalized proposed entity/value | Extraction and matching | Confirm, correct, reject, or leave pending | Link proposal to evidence and candidate entity | Not authoritative until confirmed |
| Match outcome | User or trusted matching policy | Resolve ambiguous and proposed-new matches | Record exact, alias, ambiguous, or new-identity route | Determines which identity a reviewed fact references |
| Review state | Reviewer action | Confirm, reject, or supersede | Record reviewer/actor and transition time | Controls whether a record may contribute to confirmed state |
| Evidence link | Manual or automated association | Add/correct when needed | Preserve relationship after supersession | Provides provenance, not a strategic score |
| Observation timestamp | Visible source time or manual entry | Supply/correct if unavailable or misread | Normalize and retain source time | Determines freshness of that observation |

### Confirmed manual-entry policy

- A manual fact entered by an authorised user becomes confirmed when that user explicitly saves it.
- The save operation must record the acting user and time.
- A user does not need to perform a second approval of their own permitted manual entry.
- Bulk changes must present a review summary before the user confirms the save.
- Screenshot-derived and other automated material remains proposed until reviewed, unless an explicit trusted-source policy is introduced later.
- Permissions may restrict which data types and server or season scopes a user may confirm.

### Authorisation policy

The hosted backend determines whether a user is authorised. A client-side button being visible, hidden, enabled, or disabled is not an authorisation decision.

Each authenticated account receives scoped capabilities. Roles are convenient bundles of those capabilities rather than hard-coded conditions scattered through the application.

Initial role bundles:

| Role | Intended capability |
| --- | --- |
| Viewer | Read confirmed information |
| Contributor | Enter manual facts and create proposals within an allowed scope |
| Reviewer | Confirm or reject proposals and corrections within an allowed scope |
| Season Administrator | Manage unions, servers, season configuration, and scoring rules |
| System Administrator | Manage users, roles, capabilities, and platform settings |

Example capability identifiers:

- `server_state.edit`
- `proposal.review`
- `union_registry.manage`
- `season_rules.manage`
- `user_access.manage`

Capabilities may be scoped to particular seasons or servers. For example, an account may review Server 366 while having read-only access to other servers.

The current desktop build has no account system and therefore operates as a single-trusted-user environment. This is a temporary runtime assumption, not the final hosted authorisation model.

### Confirmed manual provenance policy

For manual facts:

- the authenticated acting user is recorded automatically;
- the entry timestamp is recorded automatically;
- the source type is recorded automatically as `manual_entry`;
- the observation timestamp defaults to the entry time;
- the user may provide an earlier observation timestamp for retrospective data;
- supporting evidence is optional for an ordinary current manual entry;
- a reason is required when correcting or superseding an existing confirmed fact;
- supporting evidence or an explanatory note is required when backdating historical information.

Record-specific required values still apply. For example, a combat-strength observation requires the recorded strength value, and an ownership change requires the affected server, territory or structure, and owner state.

Automatically populated provenance remains visible in the audit history and must not be silently replaced by the client.

### Confirmed evidence-asset storage policy

- Screenshot files are stored in dedicated file or object storage rather than embedded directly in database records.
- The database stores the EvidenceRecord and a stable reference to the preserved source image.
- The original uploaded image is immutable.
- A corrected or replacement image becomes a new evidence asset.
- Evidence referenced by confirmed or historical facts cannot be deleted while those references remain valid.
- Hosted evidence access is private and authorised.
- A future desktop implementation may use a local evidence folder behind the same storage interface.
- This policy does not create an import/export or backup requirement.

The application initially accepts JPEG and PNG screenshots. Users do not select or enter the file type. The backend detects and validates it automatically.

Automatically recorded asset metadata includes:

- stable evidence and storage references;
- detected media type;
- file size;
- uploader;
- exact upload timestamp;
- integrity hash.

The integrity hash is an automatic file fingerprint used to verify that the preserved source has not changed and to identify duplicate uploads. It is not a user confirmation step.

Observation time is separate from upload time. The user may enter an approximate expression such as `2 hours ago`, `yesterday`, or a chosen date and time. At submission, the backend resolves that input against its clock and stores a fixed observation timestamp together with an indication that the time is approximate where applicable.

The screenshot itself has an upload or processing status such as uploaded, processed, or failed. Review state belongs to facts and proposals extracted from the screenshot, not to the image as though the image itself were true or false.

### Confirmed screenshot-extraction boundary

Screenshot interpretation is an optional supporting intelligence service. It is not the authority for game state.

All upload sources use the same source-neutral evidence-ingestion boundary:

```text
Direct application upload
Discord adapter
Future API or bot
        ↓
Evidence ingestion and storage
        ↓
Screenshot extraction providers
        ↓
Normalized proposals
        ↓
Human review
        ↓
Authoritative WarMap operations
```

The extraction service may combine:

- deterministic grid and map alignment;
- colour, border, and pattern detection;
- OCR;
- known map, structure, union, and server context;
- a cloud multimodal model;
- a future specialised or locally hosted model.

The provider is replaceable. WarMap consumes a normalized proposal contract rather than model-specific output.

Extraction rules:

- colour may help identify regions but must not be treated as a permanent union identity;
- colour relationships are interpreted within the screenshot and server context;
- different zoom levels, crops, and offsets must be aligned against known map geometry where possible;
- overlays and markers create obscured regions that remain unknown unless another source resolves them;
- ambiguous map position or union identity must be presented for user clarification rather than guessed;
- each proposal links back to the relevant source image and evidence region;
- extraction confidence and reasoning belong to the proposal;
- extracted proposals cannot directly mutate confirmed state;
- accepted proposals are applied through the same validated application operations used by manual entry.

Discord integration is a later ingestion adapter. Discord-specific code must not contain OCR, ownership, scoring, or confirmation logic. Direct application upload should prove the common evidence and extraction pipeline before a Discord adapter is added.

The architecture and normalized contracts are prepared before extraction implementation. Unused model-specific runtime code is not added merely to anticipate a future provider.

## 9. Values the User Must Not Enter as Independent Totals

The following are calculated from confirmed facts and season rules. They must not be independently edited or persisted as competing authorities.

| Display value | Calculation source |
| --- | --- |
| Total controlled territory count | Confirmed per-server ownership plus active season map definition |
| Total controlled territory percentage | Controlled capturable cells divided by all capturable cells |
| Designated-union territory count and percentage | Confirmed ownership filtered by configured designated union |
| Territory resource value | Confirmed ownership plus active season resource/scoring model |
| Structure ownership totals by type | Confirmed logical structure ownership plus structure catalogue |
| Controlled and uncontrolled territory breakdown | Confirmed ownership plus capturable-cell rules |
| Active union inferred from ownership | Confirmed ownership and union/server/season relationship rules |
| Latest combat strength | Selection of latest confirmed observation, not an overwritten union attribute |
| Changes since previous update | Difference between current and previous confirmed snapshots |
| Last updated for map statistics | Timestamp of the confirmed snapshot used for those statistics |
| Territory, structure, union, and combat-strength completeness | Required-record coverage and confirmation/review state |
| Pending-review count | Reviewable proposals/evidence not yet resolved |

## 10. Input-to-Display Traceability

| User-facing information | Required underlying input |
| --- | --- |
| Server number | Server definition |
| Native unions | Union identities plus confirmed native assignments |
| Active unions | Union identities plus confirmed ownership/presence or manual correction |
| Combat strength | Confirmed time-stamped combat-strength observations |
| Territory controlled | Confirmed territory and logical structure ownership |
| Designated-union territory | Confirmed ownership plus designated union configuration |
| Territory resource value | Confirmed ownership plus verified season resource/scoring rules |
| Last updated | Confirmed snapshot timestamp used for displayed map statistics |
| Data completeness | Expected season/map scope plus confirmed, proposed, stale, and unknown records |
| Factual notes | Manual or evidence-backed server observations |
| Territory changes | Two consecutive confirmed server snapshots |
| Evidence history | Preserved evidence records, proposals, and review transitions |

## 11. Current Runtime Gap

The current application already supports:

- canonical Season 1 configuration;
- a union registry;
- isolated per-server ownership editing;
- explicit ownership overrides;
- local persistence and restoration;
- calculated Command Centre ownership summaries.

It does not yet provide a complete operator interface for:

- creating and editing union identities;
- managing native and active union records;
- recording combat-strength observations;
- maintaining factual server observations;
- reviewing screenshot-derived proposals and evidence;
- authoring and validating season structure, resource, and scoring rules;
- confirming immutable server snapshots and detailed completeness records.

These are input-surface gaps, not reasons to move their data into renderers or hard-coded constants.

## 12. Workflow Decision Status

No unresolved workflow decisions remain in this matrix at this stage.

Future implementation design must still define the detailed API schemas, screen layouts, selected storage technology, extraction providers, and measured acceptance thresholds. Those are implementation choices within the confirmed boundaries above rather than unresolved data-authority decisions.

## 13. Explicit Exclusions

This matrix does not add:

- objectives;
- alerts;
- strategic priorities;
- recommended actions;
- threat labels;
- AI-generated judgments;
- import/export or backup requirements;
- a chosen hosted database;
- a final administration-screen layout;
- a requirement that every automated source be trusted.
