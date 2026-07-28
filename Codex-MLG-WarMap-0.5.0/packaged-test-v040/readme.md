# MLG WarMap

> An interactive, data-driven strategic map for X-Clash.

---

# Vision

MLG WarMap aims to become the definitive strategic planning and intelligence platform for X-Clash.

Rather than simply displaying the game world, the application provides a live strategic overview of an entire Kingdom, allowing players to visualise ownership, analyse territory, review historical changes and coordinate large-scale operations.

The project is designed around one core principle:

> Accuracy before appearance.

If a choice must be made between making the map look better or making it more accurate to the game, accuracy always wins.

---

# Current Development Status

Current Version

**v0.2.11 - Phase 1 Interactive Map Complete**

Completed

- ✅ Season 1 blueprint verified against Excel
- ✅ 20 × 20 map layout confirmed
- ✅ Structure locations verified
- ✅ Ice Mist terrain selected
- ✅ Initial sprite artwork completed
- ✅ Interactive map renderer with tile selection
- ✅ Selection information panel
- ✅ Hover states for tiles and structures
- ✅ Sprite and marker interaction fixes
- ✅ Multi-tile structure footprint selection
- ✅ Unified large structure visual cells for Town, Metropolis and Royal City

Current Focus

- Phase 2 Camera implementation
- Device-neutral camera controls and interaction design
- Camera design note in docs/CAMERA.md

---

# Project Objectives

The finished application should provide:

- Accurate strategic map
- Interactive UI
- Ownership visualisation
- Historical playback
- Intelligence notes
- Strategic reports
- Search
- Zoom and camera controls
- Future support for automated updates

---

# Design Philosophy

## 1. Data Driven

The renderer is generated from structured map data.

The renderer should never rely on manually positioning structures.

---

## 2. Accuracy First

The Excel blueprint remains the source of truth.

If the renderer differs from the blueprint, the renderer is wrong.

---

## 3. Modular Design

Project components remain independent.

- HTML controls layout.
- CSS controls appearance.
- JavaScript controls behaviour.
- JSON stores map data.
- Sprites provide artwork.

Each layer remains separate.

---

## 4. Incremental Development

Large rewrites are avoided.

Every change is:

- small
- testable
- reversible

---

## 5. Consistent Visual Style

All buildings use the approved Sprite Pack.

Visual consistency is preferred over adding unnecessary detail.

---

## 6. Camera Design Principle

The camera system is being designed to be input-independent and device-neutral.

Zoom, pan, fit, reset and focus actions should be available through mouse, keyboard, trackpad, touch and UI buttons.

The internal map grid remains 20 × 20, while large structures can be presented to the user as single merged visual cells.

---

# Project Structure

```
MLG WarMap/
│
├── assets/
│    └── sprites/
│
├── data/
│
├── docs/
│
├── src/
│
├── index.html
│
└── README.md
```

---

# Structure Codes

| Code | Structure |
|------|-----------|
| V1 | Village |
| C2 | Mine |
| MN3 | Manor |
| F4 | Factory |
| T5 | Town |
| MP6 | Metropolis |
| RC7 | Royal City |
| FM1-FM10 | Frost Mine |

---

# Development Roadmap

## Phase 1 - Interactive Map

Completed

- Tile selection
- Selection information panel
- Hover states
- Sprite and marker interaction fixes
- Multi-tile structure footprint selection
- Unified large structure visual cells

## Phase 2 - Camera

Next

- Zoom
- Pan
- Fit and reset
- Focus on tiles and structures
- Device-neutral camera controls
- Design note in docs/CAMERA.md

## Phase 3 - Ownership and Territory

Planned

- Territory colours
- Borders
- Legend
- Ownership overlays

## Phase 4 - History and Intelligence

Planned

- Timeline
- Playback
- Search and filters
- Reports

---

# Development Rules

The following rules should always be respected.

1. Preserve the verified Excel blueprint.
2. Never move structures without updating the blueprint.
3. Never redesign approved artwork without approval.
4. Keep code modular.
5. Prioritise readability over cleverness.
6. Build features incrementally.
7. Test each change before moving on.

---

# About This Project

This project is developed as both a strategic planning tool and a long-term software engineering project.

Every feature should improve either:

- accuracy
- usability
- maintainability
- strategic value

without sacrificing the others.