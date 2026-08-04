# Season 2 Map Reconstruction

## Status

The Season 2 map has been reconstructed as two aligned layers and is stored in `data/season2-map.json`:

1. a strategic structure network reconstructed from ten overlapping in-game screenshots (`IMG_7618.PNG` through `IMG_7627.PNG`); and
2. a 13 by 13 resource-mine field transcribed from the user-confirmed `S2_Comprehensive_Map_01.jpg` reference.

The canonical data, validator, projection service, and SVG preview renderer now preserve both layers independently.

## Confirmed Geometry

- The regular network contains 12 rows and 12 columns (144 grid nodes).
- One Level 7 Metropolis sits between the four central Level 6 nodes, producing 145 ownership targets in total.
- The grid contains 20 Trade Centres: four each at Level 1, Level 2, Level 3, Level 4, and Level 5.
- Regular grid connections are orthogonal: each grid node connects to its immediate horizontal and vertical neighbours.
- The central Level 7 Metropolis connects to the four surrounding Level 6 nodes.
- Connections are navigation relationships and are not independent ownership targets.
- Every listed node is an independent capturable ownership target.

## Confirmed Resource-Mine Field

- The resource-mine layer contains a 13 by 13 field with 168 mine tiles.
- Row 7, column 7 is intentionally absent because the central Level 7 Metropolis occupies that position.
- Each resource-mine tile has an explicit stable identity, position, level, resource identity, and output-speed percentage.
- Resource-mine levels increase from Level 1 at the outer edge to Level 6 near the centre.
- The confirmed resource identities are `Gold`, `Food`, and `Iron`.
- A resource mine's output-speed percentage equals its level: Level 1 is `+1%` through Level 6 at `+6%`.
- Strategic structures are positioned between the resource-mine tiles, matching the in-game staggered/offset presentation.

The resource-mine field is not the connection network. Connections remain route relationships between strategic structures.

The strategic `M2` structure type (Level 2 Mine) is also not a resource-mine tile. These entities have separate identifiers and separate purposes even though both use the word "mine" in the game UI.

## Confirmed Structure Counts

| Code | Display type | Count |
|---|---|---:|
| `V1` | Level 1 Village | 40 |
| `M2` | Level 2 Mine | 32 |
| `MN3` | Level 3 Manor | 24 |
| `F4` | Level 4 Factory | 16 |
| `T5` | Level 5 Town | 8 |
| `TC1` | Level 1 Trade Centre | 4 |
| `TC2` | Level 2 Trade Centre | 4 |
| `TC3` | Level 3 Trade Centre | 4 |
| `TC4` | Level 4 Trade Centre | 4 |
| `TC5` | Level 5 Trade Centre | 4 |
| `BG6` | Level 6 Building Guild | 1 |
| `MP6` | Level 6 Metropolis | 3 |
| `MP7` | Level 7 Metropolis | 1 |

## Evidence Authority

The in-game screenshot sweep is authoritative for:

- node placement;
- connections;
- displayed structure type;
- central-objective identity;
- Trade Centres as independently ownable nodes.

The separately supplied and user-confirmed `S2_Comprehensive_Map_01.jpg` reference is authoritative for:

- resource-mine positions;
- resource-mine levels;
- Gold, Food, and Iron identity; and
- Level 1 through Level 6 output-speed percentages.

Trade Centre levels are explicit in canonical data (`TC1` through `TC5`) and are not inferred by renderer logic or coordinate-derived rules.

`S2_Comprehensive_Map_02.jpg` was used as a transcription guide because it presents the same network without ownership overlays. It is not authoritative where it conflicts with the in-game screenshots.

## Resolved Discrepancies

1. The community reference describes the central objective as a Level 7 City. The game labels it as a Level 7 Metropolis, so the canonical type is `MP7`.
2. The community reference describes `r06-c06` as a Level 6 Metropolis with a building-speed effect. The game labels it Building Guild, so the canonical type is `BG6` and no modifier is inferred.

## Deliberately Provisional Information

The confirmed resource-mine field values above are no longer provisional. They describe the distinct 13 by 13 resource-mine layer only.

Functional modifier claims attached to strategic structures remain provisional, including collection speed, training speed, research speed, healing speed, and any strategic-node Gold/Food/Iron output assignment. They must not drive summaries, scoring, or other calculations until verified by stronger evidence.

## Runtime Boundary

Season 1 remains a rectangular territory-cell map. Season 2 is a layered strategic network: a resource-mine field underneath an offset strategic structure-and-connection network.

The Season Setup preview now loads and renders this canonical layered map. Full active-season ownership interaction remains separate future runtime work.

The recommended boundary is:

```text
Season package
    -> map topology: territory_grid | strategic_node_network
    -> topology-specific map definition
    -> shared ownership and evidence services
    -> topology-specific renderer with optional topology-owned sublayers
```

This keeps ownership, evidence, history, union activity, and persistence reusable while allowing each season to render its actual map design.
