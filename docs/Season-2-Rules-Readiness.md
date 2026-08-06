# Season 2 Rules Readiness

## Purpose
Assess whether Season 2 has enough trustworthy evidence to assemble a canonical season package that is both structurally valid and safe to publish/use at runtime.

Scope of this audit:
- package requirements from docs/Season-Package-Schema.md
- current reconstructed map data from data/season2-map.json
- reconstruction notes from docs/Season-2-Map-Reconstruction.md
- Season 2 asset library register and referenced official/community assets in C:\Users\josh_\OneDrive\Documents\X-Clash\Season_2_Asset_Library

## Evidence Policy
Classifications used in this document:
1. confirmed_in_game
- Directly visible in supplied in-game screenshots or another primary in-game source.
2. confirmed_official
- Explicitly stated in identifiable official X-Clash material.
3. community_derived
- Supplied by community maps/guides/interpretation without primary confirmation.
4. unknown
- No sufficient evidence.

Policy constraints applied:
- Repetition across community documents is not treated as official confirmation.
- data/season2-map.json is treated as authoritative for verified strategic geometry and the user-confirmed resource-mine transcription recorded by its source evidence.
- Community map/resource/modifier claims remain non-calculation unless elevated by primary evidence.
- Files under Official_Artwork are treated as confirmed_official only when provenance is supported by X-Clash_Season_2_Asset_Register.xlsx (official X-Clash Facebook or equivalent official-source attribution).
- Community screenshots are classified as confirmed_in_game only for facts visibly shown in the captured in-game UI.

## Confirmed Facts

| Package area | Fact | Classification | Source | Package destination |
|---|---|---|---|---|
| Season identity and display name | Display name text "Season II: Desert Dynasty" is visible in in-game UI. | confirmed_in_game | Community_Guides/S2_InGame_Season_Start_Screen.jpg, Community_Guides/S2_InGame_Season_Rules.jpg | packageIdentity.displayName, rulesDefinition.seasonIdentity.seasonName |
| Map topology and dimensions | Season 2 map is represented as a strategic node network. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json, Community_Guides/S2_InGame_Season_Rules.jpg | rulesDefinition.mapDefinition.topologyType |
| Map topology and dimensions | Dimensions are 12 rows x 12 columns for grid layout coordinates. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition.mapDefinition.dimensions.rows, rulesDefinition.mapDefinition.dimensions.columns |
| Node levels and identities | Verified network includes 145 nodes (144 grid + 1 center objective). | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition.mapDefinition mapDataRef content, structureCatalog expected counts |
| Connections | Verified network includes 268 navigation connections and connections are not ownership targets. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition metadata/map-definition notes, downstream topology renderer contract |
| Resource-mine field | The distinct underlying field contains 168 resource-mine tiles in a 13 x 13 arrangement with the central objective position omitted. | confirmed_in_game | Maps_and_Reference/S2_Comprehensive_Map_01.jpg (user-confirmed transcription), docs/Season-2-Map-Reconstruction.md, data/season2-map.json | map data `mineFieldDimensions`, `resourceMineTiles` |
| Resource-mine identity and values | Resource-mine tiles explicitly carry Level 1-6, Gold/Food/Iron identity, and output-speed values from +1% to +6% matching level. | confirmed_in_game | Maps_and_Reference/S2_Comprehensive_Map_01.jpg (user-confirmed transcription), data/season2-map.json | map data `resourceMineTiles[].level`, `resourceId`, `outputSpeedPercent` |
| Mine entity boundary | Resource-mine tiles are distinct from strategic `M2` Level 2 Mine structures and from navigation connections. | confirmed_in_game | in-game screenshot sweep, Maps_and_Reference/S2_Comprehensive_Map_01.jpg, docs/Season-2-Map-Reconstruction.md | topology-specific projection/rendering and future ownership rules |
| Structure catalogue (map-resident types) | Non-Trade-Centre mapped type counts: V1=40, M2=32, MN3=24, F4=16, T5=8, BG6=1, MP6=3, MP7=1. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition.structureCatalog |
| Structure catalogue (Trade Centres) | Trade Centre identities, levels, and positions are explicit as TC1-TC5 with four of each level (20 total) in the verified screenshot-derived reconstruction. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition.structureCatalog |
| Structure catalogue (count population) | expectedCount values can be populated from verified node counts if the package chooses to include them (including TC1-TC5 at 4 each). | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json | rulesDefinition.structureCatalog.expectedCount |
| Contradiction resolution | Center objective resolved to Level 7 Metropolis (MP7), not Level 7 City. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json, Maps_and_Reference/S2_Comprehensive_Map_01.jpg | rulesDefinition.structureCatalog, map data node types |
| Contradiction resolution | r06-c06 resolved to Building Guild (BG6), not Level 6 Metropolis. | confirmed_in_game | docs/Season-2-Map-Reconstruction.md, data/season2-map.json, Maps_and_Reference/S2_Comprehensive_Map_02.jpg | rulesDefinition.structureCatalog, map data node types |
| Resource definitions (season systems) | Official FAQ provenance confirms Season 2 introduces Red Copper and Holy Water as season-resource context; the canonical package contract now supports an ordered resource list and ordered scoring calculations. | confirmed_official | Official_Artwork/S2_Facts_01.png, X-Clash_Season_2_Asset_Register.xlsx (S2-011 official X-Clash Facebook provenance) | rulesDefinition.resourceModel.resources, rulesDefinition.scoringModel.calculations |
| Capture-related rules (mine PvE gate) | Official FAQ states mine capture wave count tracks mine level above level 1 (L2->2 waves, L3->3 waves, etc.). | confirmed_official | Official_Artwork/S2_Facts_02.png, X-Clash_Season_2_Asset_Register.xlsx (S2-012) | rulesDefinition.captureRules metadata; requires exact rule formalization |
| Season status/timing (general) | In-game screen shows "Starting Soon" countdown state at capture time (snapshot only, not a canonical package lifecycle status). | confirmed_in_game | Community_Guides/S2_InGame_Season_Start_Screen.jpg, Community_Guides/S2_InGame_Season_Rules.jpg | packageIdentity metadata context |
| Season rules context | Official FAQ provenance confirms war/non-war distinction remains and faction switching has 12-hour cooldown. | confirmed_official | Official_Artwork/S2_Facts_03.png, X-Clash_Season_2_Asset_Register.xlsx (S2-013 official X-Clash Facebook provenance) | rulesDefinition.metadata, potential phase/capture constraints |

## Package Readiness Decisions

- Local canonical identifier decision: use seasonId "season-2" as a project/package identifier in packageIdentity and rulesDefinition.seasonIdentity. This is a canonical project decision, not an evidence-classified in-game claim.
- Capture baseline package-model inference: represent captureRules with defaultCapturable plus byCode/byType/phaseRestrictions containers derived from verified capturable node definitions. This is a package-model inference supported by verified catalogue data, not a directly observed in-game rule transcript.
- Structure catalogue readiness boundary: structure identity and levels are ready from verified nodeTypes; expectedCount can be populated from verified counts if included. firstCaptureReward, unlockWeek, resource references, scoring references, and functional effects remain unknown where evidence is absent.

## Provisional Community Claims

| claim | source | why it remains provisional | evidence needed for confirmation | whether it may enter calculations |
|---|---|---|---|---|
| Resource/output/collection modifiers attached to strategic structures. | Maps_and_Reference/S2_Comprehensive_Map_02.jpg, Maps_and_Reference/S2_Comprehensive_Map_03.jpg, X-Clash_Season_2_Asset_Register.xlsx (S2-016/S2-017 notes) | These claims concern strategic structures, not the now-confirmed resource-mine field. Some values were estimated and corrections requested. | Occupied-node in-game captures for each contested strategic structure class, or an official rule table. | No |
| Training/research/healing/building-speed effects attached to specific high-level nodes. | Maps_and_Reference/S2_Comprehensive_Map_02.jpg, Maps_and_Reference/S2_Comprehensive_Map_03.jpg | Community-only overlay data; not confirmed by primary in-game screenshot set used for geometry reconstruction. | Official rule reference or direct in-game captures showing each modifier on the exact node identity. | No |
| 56-day Greening Initiative and checklist sequencing details for operational planning. | Community_Guides/S2_Season_Preview_Community.png, Community_Guides/S2_Week_1_Checklist.png | Community guide graphics are secondary summaries, not authoritative rule tables. | Official schedule/rules page with explicit dates and mechanics per phase. | No |
| Community interpretation of Trade Centre functional effects/modifiers beyond identity, level, placement, and count. | Maps_and_Reference/S2_Comprehensive_Map_02.jpg, Maps_and_Reference/S2_Comprehensive_Map_03.jpg | Identity/levels/positions/counts are already confirmed in-game via reconstruction; functional effects still come from community interpretation only. | Official or in-game rule panel for Trade Centre effects and formulas. | No |

## Contradictions

1. Central objective identity
- Competing claims:
  - Community map labels center as Level 7 City.
  - In-game reconstruction labels center as Level 7 Metropolis.
- Sources:
  - Maps_and_Reference/S2_Comprehensive_Map_01.jpg
  - docs/Season-2-Map-Reconstruction.md
  - data/season2-map.json
- Current resolution:
  - Resolved to MP7 (Level 7 Metropolis) per in-game evidence.

2. r06-c06 structure identity
- Competing claims:
  - Community map labels r06-c06 as Level 6 Metropolis.
  - In-game reconstruction labels r06-c06 as Building Guild.
- Sources:
  - Maps_and_Reference/S2_Comprehensive_Map_02.jpg
  - docs/Season-2-Map-Reconstruction.md
  - data/season2-map.json
- Current resolution:
  - Resolved to BG6 per in-game evidence.

3. Strategic-node modifier precision
- Competing claims:
  - Community maps provide exact output/collection/speed values for strategic structures.
  - Asset register note says some mine buffs were estimated and corrections requested.
- Sources:
  - Maps_and_Reference/S2_Comprehensive_Map_01.jpg
  - Maps_and_Reference/S2_Comprehensive_Map_02.jpg
  - X-Clash_Season_2_Asset_Register.xlsx (S2-015/S2-016/S2-017 notes)
- Current resolution:
  - Unresolved for strategic-structure rules; remains community_derived and excluded from calculations. This does not invalidate the separately confirmed resource-mine field values.

## Missing Package Information

| Required area | Missing information | Why required | Blocks package validation | Blocks publication/runtime |
|---|---|---|---|---|
| packageIdentity | Chosen package status value for this package build (draft/planned/active/completed/archived). startDate/endDate are optional and not required for validation. | schema requires seasonStatus; draft is structurally valid while final publication status is a product/configuration choice. | Yes (if seasonStatus missing) | Yes |
| rulesDefinition.seasonIdentity | Decision on optional seasonName and optional kingdomNumber fields, if consumers need them. | seasonIdentity container is required; seasonName/kingdomNumber are optional under current validator. | No (if container present and seasonId valid) | Possibly |
| rulesDefinition.structureCatalog | Unknown optional functional fields: firstCaptureReward, unlockWeek, resource references, scoring references, and any unverified functional effects. expectedCount is available from verified counts if we choose to include it. | Structure identity and expectedCount are already derivable from verified nodeTypes and counts; remaining optional fields require stronger evidence. | No (for identity + optional-count catalogue) | Conditional |
| rulesDefinition.resourceModel | Canonical Red Copper/Holy Water rule entries and authoritative strategic-structure outputs/scoring relationships for Season 2. The Gold/Food/Iron resource-mine map layer is known, but it does not by itself define the season scoring model. | Required container and required core fields exist in schema/validator; strategic outputs/scoring remain the principal evidence gap. | Yes (if container or required fields missing) | Yes |
| rulesDefinition.scoringModel | Trustworthy Season 2 scoring formulas/relationships for calculated totals. | Validator supports explicitly unconfigured scoring (configured=false) with valid required fields; unknown formulas therefore do not inherently block structural validation. | No (if valid scoring container is present, including configured=false) | Yes |
| rulesDefinition.phaseModel | Evidence-backed phase entries (if any). Empty array is structurally valid; unknown whether non-empty phase rules are required for truthful publication. | Required container exists even when empty. | No (if array exists, even empty) | Conditional |
| rulesDefinition.structureUnlocks | Evidence-backed unlock entries (if any). Empty object is structurally valid; unknown whether non-empty unlock rules are required for truthful publication. | Required container exists even when empty. | No (if object exists, even empty) | Conditional |
| rulesDefinition.captureRules extensions | Evidence-backed advanced capture overrides/restrictions (beyond baseline capturable-node shape). | Baseline required capture container shape is representable from verified capturable node definitions; advanced mechanics require stronger evidence when claimed. | No (if required capture container shape exists) | Conditional |
| rulesDefinition.buffDefinitions | Evidence-backed buff entries (if any). Empty array is structurally valid; unknown whether non-empty buff rules are required for truthful publication. | Required container exists even when empty. | No (if array exists, even empty) | Conditional |
| applicationConfig.dataSources | Product/runtime-selected map/server-state/unions source paths for this deployment. | Startup wiring input, not core game-rule evidence. | Yes (if required fields missing) | Yes |
| applicationConfig.workspace | Product/runtime-selected workspace homeId/mapLabel. | Startup wiring input, not core game-rule evidence. | Yes (if required fields missing) | Yes |
| participating-server configuration | Product/runtime-selected participating-server scope and rollout mapping for this package deployment. | Operational configuration for runtime publication and environment behavior. | No | Yes |
| resource-model evidence coverage | Official evidence confirms Red Copper and Holy Water as Season 2 resource context, and the package contract now supports multiple declared resources. The remaining gap is authoritative evidence for which resource entries, outputs, and scoring calculations should be published in Season 2. | Required to avoid forcing placeholders or incorrect semantics in Season 2 resource/scoring modeling. | No (if a structurally valid model is chosen) | Yes |

## Package Readiness Verdict
not_ready

Reason:
- A structurally valid draft package now exists for Season 2 and is represented by a canonical schema-version-2 package with the verified geometry, structure catalogue, and ordered resource identities.
- Dark Oil is now treated as the union progression/ranking resource in the package data, while the distinct strategic structure outputs record Dark Oil production for cities and the separate resource-mine layer remains a distinct domain from those strategic outputs.
- Resource mines are represented as the source of Red Copper in the map layer, while Trade Centre discount and tax values remain outside application scope for this package revision.
- The remaining technical gap is runtime support for production-rate calculations, not missing Season 2 evidence.
- Geometry and structure identity catalogue are ready from verified reconstruction (including 145 strategic nodes, 268 connections, 168 resource-mine tiles, and explicit Trade Centre levels/counts/positions).
- Confirmed Dark Oil production rates for strategic structures are now populated in the package. The related production-rate calculations remain deliberately unconfigured because that calculation model is not yet implemented at runtime; this is a technical integration gap rather than a missing-evidence gap.
- Runtime configuration inputs (data-source paths, workspace, participating-server scope) are the next blocker for runnable publication.
- Unknown optional rule details do not automatically fail schema validation when required containers are present and valid; they still block trustworthy publication if left unjustified.

## Minimum Next Evidence Required
1. Official or in-game authoritative rule table for map-output/scoring relationships for the declared resources (structure outputs, modifiers, and scoring formulas) before any calculated Season 2 totals are published.
2. Authoritative evidence for advanced capture/unlock/phase/buff behavior where non-empty entries are expected; otherwise explicit product sign-off that empty containers are semantically intentional.
3. Product/runtime configuration decisions for runnable publication: data-source paths, workspace values, participating-server scope, and chosen package seasonStatus for this release.
