# Phase 3 Territory Design Note

This note defines ownership and territory rules before implementation. It is a design baseline for future development and does not change runtime behavior.

## Ownership Model

Decision:
- The internal 20x20 grid is the ownership source of truth.
- Ownership is stored per logical grid cell as union ID only.
- Structures do not become the primary ownership store; they read ownership from the footprint cells they occupy.

Rationale:
- Keeps ownership consistent with existing tile-first architecture.
- Supports mixed cases (partial control, transitions, contested areas) without special structure-only exceptions.

## Union Registry Model

Decision:
- All union display and identity metadata lives in one registry.
- Tiles reference unions by `unionId` only.
- Adding, deactivating, or renaming a union should not require renderer/code changes, only data updates in the registry.

Required registry fields per union:
- id
- displayName
- shortName/tag
- color
- notes
- active/inactive status

Recommended shape:
- unionRegistry: array or map of union metadata objects keyed by stable ids (for example `union-0001`, `union-0002`).
- tile ownership: `{ ownerId: "union-0001" }` per logical tile (or null for neutral/unassigned states).

Example registry sketch:

```json
{
	"unionRegistry": {
		"union-0001": {
			"id": "union-0001",
			"displayName": "",
			"shortName": "",
			"color": "",
			"notes": "",
			"active": false
		},
		"union-0002": {
			"id": "union-0002",
			"displayName": "",
			"shortName": "",
			"color": "",
			"notes": "",
			"active": false
		}
	}
}
```

## Structure Ownership Display

Decision:
- Structures display ownership derived from occupied footprint cells.
- Single-cell structures read from their one grid cell.
- Multi-tile structures evaluate all occupied cells and present one user-facing ownership result, aligned with current unified footprint visuals.

Display rules for multi-tile structures:
- Uniform owner across footprint: show that owner.
- Mixed owners across footprint: show contested state.
- No owner across footprint: show unassigned/neutral state.

## Union Colour Storage

Decision:
- Store union colors in the union registry as union metadata, keyed by stable union id.
- Tile ownership stores union id references only, not duplicated color or label values.

Recommended shape:
- unionRegistry: map of union id -> metadata including display and color fields.
- tile ownership: union id reference per cell.

Rationale:
- Centralized color updates.
- Safer theming and reporting consistency.
- Easier multi-kingdom reuse.

## Overlay Rendering Strategy

Decision:
- Territory overlays render above terrain/background but below key structure sprite detail.
- Use alpha-tinted fills and optional borders so ownership is visible without hiding sprites.
- For large structures, overlay treatment follows unified footprint behavior (one user-facing ownership cell).
- Overlay color and labels should always resolve from union registry data via tile union ids.

Rendering guidance:
- Keep overlay opacity moderate.
- Preserve sprite readability and level badges.
- Prefer consistent layering rules over per-asset exceptions.

## Territory State Representation

Minimum states:
- Owned: assigned to a union/owner.
- Neutral: deliberately unclaimed gameplay state.
- Unassigned: missing/not yet set data state.
- Contested: mixed control within a logical area or active conflict marker.

Representation guidance:
- Owned uses union color.
- Neutral uses dedicated neutral styling.
- Unassigned uses subdued placeholder styling.
- Contested uses a distinct pattern or striped/double-tone treatment to avoid confusion with owned colors.

## Forward Compatibility

This model is designed to support later phases:
- History: per-cell ownership changes over time can be versioned by turn/date.
- Editing: cell-level edits can drive structure ownership display automatically.
- Reports: aggregation by owner/union comes directly from grid data joined to the union registry.
- Legends: legend entries should be generated from active union registry records, not hard-coded lists.
- Overlays: territory overlays should resolve display name/tag/color from union registry data.
- Multiple kingdoms: same schema can be partitioned by kingdom id and season snapshot.

## Implementation Principles for Phase 3

- Keep grid ownership as authoritative.
- Centralize ownership logic in src/services/ownership-service.js so overlays, legends, editing, reports, and history use one API.
- Derive structure display from footprint cells.
- Keep overlay rendering independent from sprite asset data.
- Prefer data-driven state and palette mappings over hard-coded visual conditions.
