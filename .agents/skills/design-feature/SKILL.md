---
name: design-feature
description: Convert a settled MLG WarMap product requirement into a bounded engineering specification before implementation. Use for significant v1, v1.1, refactor, or migration work to define purpose, affected authority, UI behaviour, edge cases, tests, exclusions, dependencies, and Definition of Done. Do not reopen locked Decisions 1-63 without an explicit new product decision.
---

# Design a WarMap Feature

Turn settled intent into implementable scope. This is engineering design, not product re-interrogation.

## Workflow

1. Identify the Completion Plan item, locked decisions, release classification, and current implementation evidence.
2. State the user outcome in plain language.
3. Inspect the existing architecture and name the modules/data contracts affected.
4. Identify authoritative data read or written. Separate it from derived state and transient UI state.
5. Define the user workflow, validation, confirmation boundary, errors, and safe failure behaviour.
6. Define exact/unknown/uncertain/conflicting data handling.
7. Specify dependencies, migrations, compatibility, logging, backup, and recovery impacts.
8. Write behaviour-first acceptance scenarios and verification steps.
9. State explicit exclusions and v1/v1.1/later scope.
10. Break implementation into the smallest dependency-ordered milestones that each leave the application coherent.

## Guardrails

- Do not invent game rules; invoke `$research-game-rule` for uncertain mechanics.
- Do not place domain or persistence logic in the renderer/UI.
- Do not mutate the verified map blueprint for operational state.
- Do not introduce authentication, hosting, or multi-user infrastructure into Option A v1 without a new explicit decision.
- Do not create a second authoritative path for convenience.
- Prefer adapting sound existing behaviour over redesigning it.

## Output specification

Include:

1. purpose and release scope
2. governing decisions
3. current-state evidence
4. proposed behaviour and data flow
5. authoritative/derived/UI data impact
6. validation, errors, uncertainty, and recovery
7. interfaces and migration needs
8. acceptance scenarios
9. exclusions and risks
10. dependency-ordered tasks and concise Definition of Done

End with unresolved engineering questions only. Do not ask product questions already settled by the decision register.
