# Season 2 Map Reconstruction

## Status

The Season 2 strategic-node geometry has been reconstructed from ten overlapping in-game screenshots (`IMG_7618.PNG` through `IMG_7627.PNG`). The reconstruction is stored in `data/season2-map.json`.

This milestone records verified geometry in canonical loader-ready network form (`nodes` and `connections`). It does not yet integrate Season 2 into runtime startup, loader wiring, or renderer behavior.

## Confirmed Geometry

- The regular network contains 12 rows and 12 columns (144 grid nodes).
- One Level 7 Metropolis sits between the four central Level 6 nodes, producing 145 ownership targets in total.
- The grid contains 20 Trade Centres: four each at Level 1, Level 2, Level 3, Level 4, and Level 5.
- Regular grid connections are orthogonal: each grid node connects to its immediate horizontal and vertical neighbours.
- The central Level 7 Metropolis connects to the four surrounding Level 6 nodes.
- Connections are navigation relationships and are not independent ownership targets.
- Every listed node is an independent capturable ownership target.

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

Trade Centre levels are explicit in canonical data (`TC1` through `TC5`) and are not inferred by renderer logic or coordinate-derived rules.

`S2_Comprehensive_Map_02.jpg` was used as a transcription guide because it presents the same network without ownership overlays. It is not authoritative where it conflicts with the in-game screenshots.

## Resolved Discrepancies

1. The community reference describes the central objective as a Level 7 City. The game labels it as a Level 7 Metropolis, so the canonical type is `MP7`.
2. The community reference describes `r06-c06` as a Level 6 Metropolis with a building-speed effect. The game labels it Building Guild, so the canonical type is `BG6` and no modifier is inferred.

## Deliberately Provisional Information

The community reference also assigns Gold, Food, Iron, output-speed, collection-speed, training-speed, research-speed, and healing-speed properties. These properties are not readable from the supplied in-game sweep after ownership labels are applied.

They remain recorded as provisional claims and must not drive summaries, scoring, or other calculations until verified by stronger in-game evidence.

## Runtime Boundary

Season 1 remains a rectangular territory-cell map. Season 2 is a strategic node-and-connection network. The current renderer and package contract must therefore gain an explicit map-topology distinction before this dataset is wired into runtime behavior.

The canonical Season 2 map data is now loader-ready, but runtime loading/rendering integration remains future work.

The recommended boundary is:

```text
Season package
    -> map topology: territory_grid | strategic_node_network
    -> topology-specific map definition
    -> shared ownership and evidence services
    -> topology-specific renderer
```

This keeps ownership, evidence, history, union activity, and persistence reusable while allowing each season to render its actual map design.
