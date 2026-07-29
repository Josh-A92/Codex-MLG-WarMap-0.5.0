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

Status:
- Superseded by ADR-008.

Decision:
- src/services/summary-service.js was treated as inactive until loaded and integrated.

Reason:
- At that point, runtime did not load or call the service and dashboard values were placeholders.

## ADR-007: Cross-server ownership leakage defect is resolved

Decision:
- Runtime ownership editing is isolated per server workspace through the Server State Service.

Reason:
- Ownership reads and writes now route through server-scoped service APIs, preventing cross-server leakage and avoiding shared base-map mutation during normal edits.

Superseded history note:
- The former leakage behavior remains recorded in changelog v0.5.0 as historical context.

## ADR-008: Summary calculations consume authoritative state

Decision:
- Summary Service is an active, pure runtime calculation boundary.
- It receives ownership through the Server State Service and receives rules, map data, union data, and designated-union configuration through injected dependencies.
- It does not own mutable state or accept stored dashboard totals as authority.

Reason:
- Keeps calculated Command Centre values reproducible and prevents summary data from drifting away from map ownership.

## ADR-009: Territory ownership persists through a storage-neutral service boundary

Decision:
- Per-server territory ownership is serialized in a versioned envelope, coordinated by the Persistence Service, and stored through an Electron adapter.
- Restoration completes before initial workspace, map, and summary rendering.

Reason:
- Preserves server-state authority while keeping storage format, application orchestration, and Electron file access separated.

## ADR-010: Season setup is complete, validated, initialized, and locked

Decision:
- Operational use begins only after the complete season configuration validates.
- Participating server definitions, the shared map, structures, values, resources, scoring, phases, unlocks, capture rules, and buffs become locked season setup.
- Union involvement, ownership, combat strength, observations, evidence, and completeness remain mutable operational intelligence.
- A verified correction creates a new immutable configuration version rather than editing the active version in place.

Reason:
- Season rules are expected to be known before tracking begins, while server intelligence continues changing throughout the season.

## ADR-011: Hosted authorization uses backend-enforced scoped capabilities

Decision:
- The hosted backend authorizes every state-changing operation.
- Roles bundle explicit capabilities that may be scoped to selected seasons or servers.
- Client-side control visibility is not a security boundary.
- The desktop application remains a temporary single-trusted-user environment.

Reason:
- Supports safe multi-user hosting without coupling domain services to hard-coded administrator checks.

## ADR-012: Screenshot interpretation produces reviewable proposals

Decision:
- Screenshot extraction is a replaceable supporting service behind a source-neutral evidence-ingestion boundary.
- Direct upload, Discord, bots, and future APIs submit evidence through the same core path.
- Extraction may combine map-specific geometry, computer vision, OCR, cloud models, or future specialised models.
- Extracted results cannot directly mutate confirmed state and must remain linked to preserved evidence for human review.

Reason:
- Real screenshots vary in zoom, crop, overlays, colour meaning, label visibility, and completeness; no single model or colour mapping is sufficiently authoritative.

## ADR-013: Active-union status derives from confirmed ownership history

Decision:
- Known server association and active status are separate.
- Confirmed ownership activates a union.
- Losing the final territory starts a fourteen-day verified zero-territory period while the union remains active.
- Recapture cancels the period; a later final-territory loss restarts it.
- Fourteen full verified days produce inactivity.
- Missing verification produces stale or unverified activity evidence rather than automatic inactivity.

Reason:
- Represents observed participation without treating a known union as active prematurely or declaring inactivity from missing data.
