# AI Development Rules

This document defines the rules that every AI assistant should follow when contributing to the MLG WarMap project.

These rules take precedence over assumptions or creative interpretation.

---

# Core Principle

MLG WarMap is a software engineering project.

It is **not** an image-generation project.

AI should treat the codebase as a production application.

---

# Source of Truth

The Excel blueprint is the authoritative source for:

- Tile positions
- Structure footprints
- Map dimensions
- Frost Mine locations

If the renderer differs from the blueprint, the renderer must be corrected.

The blueprint should never be altered to match the renderer.

---

# Renderer Rules

The renderer should always be deterministic.

Do not:

- Randomly reposition structures.
- Adjust spacing for visual balance.
- Resize map footprints.
- Move buildings because they "look better".

The renderer should always produce the same output from the same map data.

---

# Visual Rules

Approved artwork should never be replaced without explicit approval.

Current approved assets:

- Village
- Mine
- Manor
- Factory
- Town
- Metropolis
- Royal City

The Ice Mist terrain is the approved terrain style.

Do not redesign the visual theme unless specifically requested.

---

# Development Workflow

Large changes should never be combined.

Every request should implement **one logical feature**.

Preferred workflow:

1. Explain the proposed change.
2. Wait for approval if the change affects appearance or behaviour.
3. Implement the change.
4. Verify that existing functionality still works.

---

# Code Structure

Keep responsibilities separate.

HTML

- Layout

CSS

- Appearance

JavaScript

- Behaviour

JSON

- Map data

Sprites

- Artwork

Avoid mixing responsibilities.

---

# Data Rules

Map data should be stored separately from rendering logic.

Avoid hard-coded coordinates where possible.

Future changes should only require updating the data files.

---

# User Interface

Preserve consistency.

Do not redesign:

- Navigation
- Colour palette
- Layout
- Panels

unless specifically instructed.

Small improvements are acceptable.

Large redesigns require approval.

---

# AI Behaviour

Do not assume.

If information is missing:

Ask.

If a requested change may alter existing behaviour:

Explain the impact before implementing it.

If uncertain:

Choose the option that preserves existing functionality.

---

# Testing

Every feature should be tested independently.

After each implementation:

- Verify layout.
- Verify map positions.
- Verify sprites.
- Verify interactions.

Do not begin another feature until the current one works correctly.

---

# Project Philosophy

Prioritise:

1. Accuracy
2. Maintainability
3. Readability
4. Performance
5. Appearance

Never sacrifice the first four for the fifth.

---

# Long-Term Goal

The objective is to build a maintainable, scalable strategic planning application.

Every contribution should move the project closer to that goal.