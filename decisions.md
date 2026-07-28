# Architectural Decisions

Version context: v0.5.0

## ADR-001: Verified map data is authoritative

Decision:
- Season 1 map data remains the source of truth for map geometry and structure placement.

Reason:
- Preserves deterministic rendering and avoids drift from verified blueprint data.

## ADR-002: Renderer remains data-driven

Decision:
- Map rendering behavior is driven by JSON data rather than hard-coded map layout.

Reason:
- Keeps the renderer reusable and reduces map-specific coupling.

## ADR-003: Shared base map plus per-server state

Decision:
- Season 1 uses one shared base map with separate per-server strategic state records.

Reason:
- Avoids base-map duplication while supporting multiple server workspaces.

## ADR-004: Command Centre is the default workspace

Decision:
- App loads into Command Centre, then routes to server map workspaces as needed.

Reason:
- Supports season-level navigation before server-level map interaction.

## ADR-005: Ownership source of truth remains tile-level

Decision:
- Tile ownership is authoritative; structure ownership is derived from footprint tiles.

Reason:
- Keeps one ownership model for overlays, selection, and future summaries.

## ADR-006: summary-service is not active runtime behavior

Decision:
- src/services/summary-service.js is treated as inactive until loaded and integrated.

Reason:
- Current runtime does not load or call this service; dashboard values remain placeholders.

## ADR-007: Cross-server ownership leakage defect is resolved

Decision:
- Runtime ownership editing is isolated per server workspace through the Server State Service.

Reason:
- Ownership reads and writes now route through server-scoped service APIs, preventing cross-server leakage and avoiding shared base-map mutation during normal edits.

Superseded history note:
- The former leakage behavior remains recorded in changelog v0.5.0 as historical context.
