# Command Centre Data Specification

## 1. Purpose and Scope
This document records the confirmed information requirements for the Command Centre and Server Overview in MLG WarMap.

Product principle: MLG WarMap is descriptive, not prescriptive. It collates and presents intelligence but does not recommend actions, assign priorities, create objectives, or make strategic judgments.

Scope:
- Define what is displayed
- Define where each value comes from
- Define whether each value is stored, observed, calculated, or a contextual note
- Define evidence, confirmation, and freshness requirements

Out of scope:
- UI styling
- Scoring values
- Game-rule invention
- Strategic recommendations

## 2. Command Centre Specification
The Command Centre provides a compact factual summary for each server.

| Field | Display location | Meaning | Source | Classification | Freshness/provenance requirements | MVP status |
| --- | --- | --- | --- | --- | --- | --- |
| Server number | Server card header | Human-readable server identity | Server metadata | Stored | Must match the server record used by the active workspace | Required |
| Native unions | Server card body | Unions native to the server | Season/server identity data, manual entry, or confirmed evidence | Stored | Native assignment must identify whether it is confirmed or proposed | Required |
| Active unions | Server card body | Known unions currently active under the confirmed ownership and fourteen-day inactivity rule | Confirmed ownership history and verified zero-territory periods | Stored | Active status must carry provenance, effective time, and the ownership history used to derive it | Required |
| Recorded combat strength for active unions, where available | Server card body | Latest confirmed combat strength tied to an active union | Time-stamped observation linked to union/server/season | Observed | Must preserve timestamp, source, and confirmation state; do not replace with qualitative ratings | Required |
| Percentage of all capturable territory currently controlled | Server card body | Share of capturable territory controlled on the server | Calculated from confirmed territory ownership and the active season map definition | Calculated | Must be derived from confirmed underlying state, not stored as an independent total | Required |
| Percentage of all capturable territory controlled by the designated player union | Server card body | Share of capturable territory controlled by the designated player union | Calculated from confirmed ownership and the designated union assignment | Calculated | Must be derived from confirmed underlying state, not stored as an independent total | Required |
| Resource value of the player union’s territory | Server card body | Total resource value of territory controlled by the designated player union using the active season’s resource/scoring model | Calculated from confirmed territory ownership and the active season resource/scoring model | Calculated | Must use the active season’s resource definition; do not hard-code a resource name or assume a per-territory value in shared architecture | Required |
| Last updated | Server card footer or metadata row | Most recent confirmed or observed update time for the server record | Observation timestamps, snapshot timestamps, or edit timestamps | Observed | Must expose the most recent relevant timestamp and its provenance | Required |
| Map/data completion | Server card footer or metadata row | Verified territory coverage for the server summary, shown as a confirmed count such as 376 / 400 and accompanied by related completeness signals | Latest confirmed server-map snapshot, required records, confirmations, and evidence | Calculated | Must be based on the latest confirmed server-map snapshot used for the displayed ownership statistics; unrelated observations must not make the map appear freshly verified | Required |
| Short factual server notes or observations | Server card footer or notes area | Brief non-prescriptive factual notes | Manual notes, confirmed observations, or evidence-backed annotations | Contextual note | Notes must remain descriptive and avoid recommendations or priority labels | Required |

## 3. Server Overview Specification
The Server Overview provides the detailed factual view for one server.

| Field | Display location | Meaning | Source | Classification | Freshness/provenance requirements | MVP status |
| --- | --- | --- | --- | --- | --- | --- |
| Server identity and native unions | Overview header | Server identity plus the current native-union assignment set | Server metadata, native-union records, and evidence | Stored | Identity must be stable; native unions must show confirmation state and provenance | Required |
| Last updated and data completion | Overview header or summary strip | Latest record time and the completeness state of the server record set | Observation timestamps, snapshot timestamps, completeness checks | Calculated | Must separate freshness from completeness and pending review state | Required |
| Current territory statistics | Overview summary panel | Current territorial control figures for the server | Confirmed ownership state and the active season map definition | Calculated | Must be derived from confirmed state; individual totals should not be stored independently | Required |
| Union comparison | Overview comparison section | Side-by-side factual presentation of unions on the server composed of stored, observed, and calculated fields | Union records, ownership state, combat observations, and territory calculations | Stored, observed, calculated | Comparison content must remain factual and non-prescriptive | Required |
| Union identity | Union comparison row | Union name or identifier | Union registry or confirmed union record | Stored | Identity should preserve the source record used to identify the union | Required |
| Native status | Union comparison row | Whether the union is native to the server | Native-union assignment record | Stored | Must preserve confirmation/proposal state where applicable | Required |
| Active status | Union comparison row | Whether a known union is currently active under the ownership and fourteen-day inactivity rule | Confirmed ownership history and verified zero-territory periods | Stored | Must preserve provenance and allow correction of the underlying confirmed history when evidence changes | Required |
| Latest confirmed combat strength | Union comparison row | Most recent confirmed combat strength observation for the union | Time-stamped combat-strength observation | Observed | Must preserve timestamp, source, and confirmation state; no qualitative rating substitute | Required |
| Territory count and percentage | Union comparison row | Number of territories controlled and share of capturable territory | Confirmed territory ownership and the active season map definition | Calculated | Must be derived from confirmed underlying state | Required |
| Changes since the previous confirmed server snapshot | Overview change section | Difference between the current confirmed state and the previous confirmed snapshot | Current confirmed snapshot plus previous confirmed snapshot baseline | Calculated | The initial baseline is the previous confirmed server snapshot; changes must identify that baseline explicitly | Required |
| Factual server notes or observations | Overview notes area | Brief descriptive notes about the server | Manual notes, confirmed observations, or evidence-backed annotations | Contextual note | Notes must remain descriptive and avoid recommendations or strategic judgments | Required |
| Screenshot/evidence history and review status | Overview evidence panel | Evidence trail and review state for server observations | Screenshot records, extracted observations, confirmations, and review metadata | Stored | Must show provenance, evidence linkage, and pending review state where relevant | Required |
| Detailed data completeness | Overview evidence or status panel | Completion state across required server data categories | Presence and confirmation status of required fields and evidence | Calculated | Must expose what is missing, provisional, or pending confirmation | Required |

### Data Completeness Breakdown

| Field | Display location | Meaning | Source | Classification | Freshness/provenance requirements | MVP status |
| --- | --- | --- | --- | --- | --- | --- |
| Territory coverage | Overview evidence or status panel | Confirmed territory coverage shown as a verified count and/or ratio | Latest confirmed server-map snapshot | Calculated | Must use the same confirmed snapshot as the displayed ownership statistics | Required |
| Structure verification | Overview evidence or status panel | Verified coverage of structure ownership data | Confirmed structure records and evidence | Calculated | Must show what is confirmed, pending, or unverified | Required |
| Native-union verification | Overview evidence or status panel | Verified coverage of native-union assignments | Native-union records and evidence | Calculated | Must show confirmed and proposed assignments separately where relevant | Required |
| Active-union information | Overview evidence or status panel | Verified coverage of activity information for known unions | Confirmed ownership history, zero-territory periods, and verification coverage | Calculated | Must distinguish active, inactive, stale, and unknown states where applicable | Required |
| Combat-strength coverage | Overview evidence or status panel | Verified coverage of combat-strength observations | Time-stamped combat-strength observations and evidence | Calculated | Must preserve individual observation timestamps and provenance | Required |
| Evidence awaiting review | Overview evidence or status panel | Evidence items that still need confirmation or review | Screenshot records, extracted observations, and review metadata | Stored | Must surface pending review without collapsing it into a vague score | Required |

### Controlled and Uncontrolled Territory Breakdown

| Field | Display location | Meaning | Source | Classification | Freshness/provenance requirements | MVP status |
| --- | --- | --- | --- | --- | --- | --- |
| Controlled territory | Overview comparison section | Territory in the comparison scope currently controlled by the union | Confirmed ownership state | Calculated | Must derive from confirmed state and the active season map definition | Required |
| Uncontrolled territory | Overview comparison section | Territory in the comparison scope not currently controlled by the union | Confirmed ownership state | Calculated | Must derive from confirmed state and the active season map definition | Required |

### Structure Ownership Breakdown

| Field | Display location | Meaning | Source | Classification | Freshness/provenance requirements | MVP status |
| --- | --- | --- | --- | --- | --- | --- |
| Structure ownership by type | Overview comparison section | Ownership state grouped by structure type defined by the active season | Structure definitions from the active season and confirmed ownership | Calculated | Must use structure types defined by the active season and preserve confirmation state | Required |
| Open Map | Overview action area | Opens the server map view | Navigation control | Navigation action | Action must navigate only; it must not imply recommendations or prioritization | Required |

## 4. Calculation Definitions
- Territory unit = one season-defined capturable map cell.
- Multi-cell structures contribute their occupied cells, and each cell is counted only once.
- Structure ownership remains a separate statistic.
- Territory percentage = controlled capturable territory / total capturable territory.
- Player-union territory percentage = territory controlled by the designated player union / total capturable territory.
- The designated player union is configurable, with MLG as the default at the application/season level.
- Territory resource value is season-defined and must follow the active season’s resource name, unit, calculation model, display label, and metric type.
- The active season must supply the resource definition used by shared UI and services.
- Territory resource value is calculated from the confirmed scope and the active season’s resource/scoring model, and the model may represent holding value, production rate, accumulated total, or another season-defined measure.
- Current territory statistics and comparison breakdowns must be derived from confirmed ownership state plus the active season map definition.
- Capturable denominator includes every valid map cell that can be captured at any point during the season, including temporarily locked cells.
- Capturable denominator excludes out-of-map, decorative, permanently blocked, and non-playable cells.
- A union being known on a server is separate from being active.
- A known union with no confirmed ownership history is inactive.
- Confirmed ownership of at least one territory makes a union active.
- Losing the final territory starts a fourteen-day verified zero-territory period during which the union remains active.
- A confirmed recapture cancels that period; a later final-territory loss starts a new period.
- After fourteen full verified days without ownership, the union becomes inactive.
- Missing or stale verification prevents automatic inactivity and makes the activity evidence stale or unverified.
- Confirmed ownership remains valid until superseded.
- Presence-only evidence may establish that a union is known on the server, but it does not independently make that union active.
- Manual corrections override automated proposals.
- Combat strength is a time-stamped observation attached to a union/server/season relationship.
- Territory-change comparisons must identify their baseline snapshot, with the previous confirmed server snapshot as the initial baseline.
- On server cards, last updated means the timestamp of the latest confirmed server-map snapshot used to calculate the displayed ownership statistics.
- Combat strength, notes, and other observations retain separate timestamps.
- Editing unrelated data must not make the map appear freshly verified.
- Data completeness should be expressed through freshness, completeness, and pending review information.

## 5. Evidence and Confirmation Rules
- Native-union assignments may be entered manually or proposed from screenshot extraction.
- Screenshot-derived assignments must remain proposed until confirmed where appropriate.
- Combat strength may be entered manually or extracted from screenshots.
- Combat strength measurements must remain numeric or otherwise explicitly recorded values; do not replace them with vague strength labels.
- Confidence and provenance belong to individual observations and evidence, not to a vague aggregate score.
- Manual corrections override automated proposals.
- Confirmed state is the basis for calculated percentages, resource totals, and change comparisons.
- Presence-only observations contribute to known-union evidence, not active status without confirmed ownership.
- Evidence history should preserve the source, timestamp, and review outcome for each observation where available.
- User-facing data health should distinguish freshness, completeness, and pending review.

## 6. Explicit Exclusions
The following are intentionally excluded from this specification:
- Objectives
- Alerts
- Server priority or status ratings
- Recommended actions
- Suggested targets
- Estimated enemy-strength labels
- AI-generated strategic judgments
- Detailed territory-change history on the main Command Centre screen

## 7. Open Questions
No unresolved questions remain. The decisions listed above are confirmed.
