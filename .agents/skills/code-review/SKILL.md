---
name: code-review
description: Review MLG WarMap changes or existing implementation for concrete defects, regressions, unsafe data handling, and non-compliance with an accepted specification. Use after substantial implementation, for stability audits, pull requests, or milestone gates. Do not implement fixes unless explicitly requested.
---

# Review WarMap Code

Review from evidence, not intent or confident prose.

## Establish scope

1. Resolve the exact repository, commit, base revision, diff, or files under review.
2. Read applicable repository instructions, the Completion Plan, decisions, data contracts, tests, and task specification.
3. Separate two questions:
   - Standards: does the code follow repository rules and architectural invariants?
   - Specification: does it deliver the requested behaviour and exclusions?

## Inspect

Prioritise:

- data loss, corruption, partial writes, and unsafe migrations
- incorrect scoring, time, uncertainty, or season assumptions
- mutation of authoritative data or shared map blueprints
- server/season state leakage
- unknown values silently becoming zero
- contradictory evidence silently changing authoritative state
- missing validation and unsafe error recovery
- stale caches treated as authoritative
- asynchronous and Electron lifecycle failures
- security problems relevant to local Electron/file access
- tests that pass without proving behaviour
- duplicate, unreachable, obsolete, or misleading code

Trace affected call paths. Run focused read-only checks or tests where useful. Never report a theoretical concern as a defect without showing the reachable condition or violated invariant.

## Severity

- `P0 Critical`: data loss/corruption, unsafe migration, startup/release failure, or materially wrong authoritative results.
- `P1 Major`: important workflow failure or correctness defect that must be fixed before the next milestone.
- `P2 Minor`: bounded non-critical defect worth fixing before v1 where appropriate.

## Output

Lead with actionable findings, highest severity first. For each include:

- concise title
- file and tight line location
- triggering scenario
- observable consequence
- violated requirement or invariant
- smallest credible correction direction

Then list open questions and a brief review scope. If there are no actionable findings, say so and state residual testing gaps. Avoid summaries that bury findings.
