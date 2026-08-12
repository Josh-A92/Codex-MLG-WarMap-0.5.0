---
name: verify-work
description: Independently verify that a claimed MLG WarMap implementation, refactor, fix, test, or release task was genuinely completed. Use at every AI coding handoff and phase exit to inspect actual changes, run relevant checks, and compare behaviour with requested scope. Do not accept summaries or passing claims without primary evidence.
---

# Verify WarMap Work

Assume claims are unproven until corroborated.

## Workflow

1. Restate the requested outcome, exclusions, and acceptance criteria.
2. Resolve the exact repository, branch/commit, working-tree state, and relevant diff.
3. Confirm expected files actually changed and identify unrelated changes.
4. Read the implementation paths, not only the diff summary.
5. Verify data and architecture invariants affected by the task.
6. Run the smallest meaningful checks, then broader regression/build checks justified by risk.
7. Inspect raw command exit status and output. Distinguish not run, failed, skipped, and passed.
8. Where UI or packaging matters, verify visible behaviour in development and/or the packaged Windows app rather than relying only on unit tests.
9. Check documentation, schema/migration, and test updates when behaviour changed.
10. Check for secrets, fabricated APIs/dependencies, debug artifacts, temporary files, and accidental source-data changes.

## Evidence standard

Require direct evidence for:

- implementation exists at the claimed location
- requested behaviour is reachable
- negative and edge cases are handled
- tests would fail without the change where practical
- build/package is produced from the inspected source
- authoritative data remains safe
- unrelated behaviour was not silently redesigned

Do not modify code during a verification-only request. If a check cannot run, state exactly why and reduce confidence accordingly.

## Output

Return one verdict:

- `VERIFIED`
- `PARTIALLY VERIFIED`
- `NOT VERIFIED`

Then provide:

1. acceptance criterion matrix with evidence
2. commands/checks and results
3. discrepancies or unverified claims
4. regression and data-safety assessment
5. precise next action

Never equate "files changed" or "tests pass" with completion by itself.
