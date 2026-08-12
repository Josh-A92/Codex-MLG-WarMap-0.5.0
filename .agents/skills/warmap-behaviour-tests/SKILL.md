---
name: warmap-behaviour-tests
description: Design, implement, or review implementation-independent behaviour and regression tests for MLG WarMap. Use for game rules, Season 1/2 scoring, uncertain capture times, observations, corrections, persistence, migrations, backup/restore, or release-gate scenarios. Do not encode unverified game mechanics as expected results.
---

# WarMap Behaviour Tests

Test externally meaningful rules, not private implementation details.

## Preconditions

1. Identify the locked requirement or verified game rule.
2. Label every rule input as `Verified Fact`, `Observed Behaviour`, `Working Assumption`, or `Unknown`.
3. Stop expected-value test design when the required mechanic is Unknown. Route it through `$research-game-rule`.
4. Treat the exact Season 2 hourly-scoring mechanic as research-blocked until evidence resolves Decision 54.

## Design scenarios

Write Given/When/Then scenarios with explicit:

- season, server, union IDs, rule version, and clock/timezone
- starting authoritative events and observations
- exact timestamps or bounded uncertainty windows
- action or correction
- expected authoritative records
- expected derived current state, score, range, or reconciliation status
- persistence boundary such as close/reopen, rebuild, migration, or restore

Cover happy paths, boundaries, invalid input, contradictions, and recovery. Prefer small fixture builders over giant opaque fixture files.

## Mandatory behavioural families

- Season 1 and Season 2 load/activation/isolation.
- Capture, recapture, uncaptured structures, and all-union/Unknown accounting.
- Exact capture time and bounded uncertain time.
- Historical correction and targeted/full recalculation.
- In-game checkpoints and visible discrepancies.
- Transactional save, close/reopen, cache deletion/rebuild.
- Database migration success and failure rollback.
- Backup/export and restore/import including evidence references.
- Archived-season protection.

## Implementation rules

- Assert through stable public/domain boundaries where possible.
- Freeze or inject time; never depend on wall-clock timing in deterministic tests.
- Use verified golden checkpoints for score assertions.
- Prove that unknown is not zero and derived caches are disposable.
- Add a regression test that fails for every confirmed defect before or with its fix.
- Run the narrow test first, then the relevant suite, then the release-level suite when appropriate.

## Output

Report scenario-to-decision traceability, tests added or proposed, commands actually run, results, and unresolved evidence gaps. Never claim correctness from test count alone.
