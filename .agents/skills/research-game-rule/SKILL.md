---
name: research-game-rule
description: Research and classify uncertain X-Clash mechanics before MLG WarMap implements or tests them. Use when scoring, capture eligibility, timing, season boundaries, structure behaviour, or displayed totals are not verified, especially Season 2 hourly scoring. Produces an evidence-backed rule specification; it must not choose a convenient assumption.
---

# Research X-Clash Game Rule

Prevent assumptions from silently becoming product facts.

## Define the question

1. State the exact implementation decision the rule will control.
2. Break vague language into discriminating questions and observable outcomes.
3. Record current competing hypotheses without selecting one.

For Season 2 hourly scoring, distinguish at minimum:

- continuous accrual displayed hourly
- a full award after each completed ownership hour
- fixed global payout checkpoints

Also determine first award timing, partial hours, ownership changes near boundaries, structure-type differences, season start/end behaviour, and display refresh timing.

## Gather evidence

Prefer, in order:

1. official in-game rules or official publisher material
2. reproducible in-game observations with timestamps/screenshots
3. multiple independent observations
4. community explanations only as leads

Retain source, capture date, game/season version, server context, timestamps, screenshots or checkpoint values, and any ambiguity. Do not treat a search snippet or recollection as evidence.

## Classify every claim

- `Verified Fact`: directly supported by authoritative or conclusive reproducible evidence.
- `Observed Behaviour`: directly witnessed but not yet proven universal.
- `Working Assumption`: useful hypothesis awaiting confirmation.
- `Unknown`: insufficient or conflicting evidence.

Conflicting valid evidence stays visible. Do not average it into certainty.

## Validate

Design discriminating observation scenarios. Compare predicted results for each hypothesis with in-game checkpoints. Seek boundary cases rather than repeated easy examples.

## Output

Produce:

1. research question and implementation consequence
2. evidence register
3. claim classification table
4. rejected and surviving hypotheses
5. versioned rule statement, only where supported
6. golden Given/When/Then scenarios for `$warmap-behaviour-tests`
7. unresolved unknowns and whether they block implementation or release

If evidence is insufficient, return `RESEARCH INCOMPLETE` and do not authorize an exact-value implementation.
