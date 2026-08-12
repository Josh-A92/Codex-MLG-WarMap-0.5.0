---
name: simplify-codebase
description: Simplify a stable MLG WarMap milestone by removing unnecessary complexity, duplication, dead paths, and dependency surface without changing behaviour or reopening settled design. Use after tests establish a baseline or during controlled technical-debt work. Do not use before behaviour is verified or merely to reduce line count.
---

# Simplify WarMap Codebase

Preserve behaviour, data safety, and architectural seams. Simplicity means clearer ownership and fewer concepts, not fewer characters.

## Preconditions

1. Confirm the target behaviour is stable and covered by relevant tests.
2. Record the current commands and results as a baseline.
3. Identify the exact scope. Do not combine simplification with feature development.

## Find candidates

Look for:

- duplicate concepts or calculations
- dead, unreachable, abandoned, or superseded paths
- unused dependencies and compatibility code with no supported consumer
- wrappers that expose rather than hide complexity
- scattered season-specific conditionals
- multiple representations of authoritative state
- oversized modules with several unrelated owners
- stale comments and documents that misdirect future agents

Classify each candidate `KEEP`, `REFACTOR`, `REMOVE`, or `DEFER-PRESERVE`.

## Change rules

- Make small, reversible steps.
- Preserve public/domain behaviour and data formats unless an approved migration is part of scope.
- Do not remove a clean Option B/C seam merely because v1 does not use it.
- Remove speculative groundwork when it complicates v1 and Git already preserves it.
- Prefer one authoritative path over synchronized duplicates.
- Run focused tests after each coherent step and the relevant regression suite at the end.
- Stop if tests expose undocumented behaviour; classify it before continuing.

## Output

Report candidates and classifications, changes made, behaviour-preservation evidence, complexity/dependency reduction, commands/results, and anything deliberately left intact. Do not claim improvement based on line-count reduction.
