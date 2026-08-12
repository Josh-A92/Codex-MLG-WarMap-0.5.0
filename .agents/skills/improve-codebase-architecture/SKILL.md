---
name: improve-codebase-architecture
description: Inspect MLG WarMap's codebase architecture and propose bounded structural improvements. Use for architecture reviews, milestone gates, or when UI, map rendering, Season Engine, scoring, persistence, evidence, derived state, or Electron responsibilities appear coupled. Do not use for cosmetic cleanup, speculative redesign, or automatic large refactors.
---

# Improve WarMap Codebase Architecture

Review architecture before editing it. Treat the Completion Plan and repository decisions as authoritative product constraints.

## Workflow

1. Identify the exact repository commit, requested scope, and relevant decisions.
2. Trace real dependencies and data flows from source; do not infer architecture from filenames or documentation alone.
3. Inspect boundaries among:
   - application orchestration and UI
   - workspace navigation and map rendering
   - Season Engine and scoring components
   - authoritative events, observations, evidence, and rules
   - derived state, score caches, summaries, and UI state
   - persistence, migrations, backups, and exports
   - Electron/platform hosting
4. Look for duplicated authoritative state, hidden business rules, scattered persistence, season-specific branching, mutable shared blueprints, circular dependencies, leaky abstractions, and host-dependent domain logic.
5. Classify each significant system or finding as `KEEP`, `REFACTOR`, `REMOVE`, or `DEFER-PRESERVE`.
6. Rank findings:
   - Critical: risks data integrity, correctness, or release safety.
   - Major: materially obstructs v1 completion or Options B/C viability.
   - Minor: worthwhile but non-blocking.
7. Recommend the smallest coherent change sequence. Do not implement unless explicitly asked.

## Architectural invariants

- Authoritative: events, observations/evidence, versioned season rules, and time.
- Derived and rebuildable: current state, scores, summaries, and dashboard views.
- The Season Engine must not depend on Electron, a renderer window, or application uptime.
- The verified map blueprint is immutable operational reference data.
- Server identity is separate from season participation and server state.
- Stable IDs, not visible names or colours, carry identity.
- Option A desktop is first; preserve clean hosting and persistence seams for Options B/C without building collaboration now.

## Output

Produce:

1. Scope and evidence inspected.
2. Current architecture summary.
3. Findings ordered by severity, each with files, evidence, consequence, classification, and bounded recommendation.
4. Dependency-aware remediation order.
5. Explicit non-findings or assumptions that still require verification.

Do not praise speculative abstractions. Prefer fewer, deeper modules with clear ownership.
