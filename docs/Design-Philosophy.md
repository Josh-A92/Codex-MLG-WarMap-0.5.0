# MLG WarMap Design Philosophy

## Status

Architectural principle for current and future MLG WarMap development.

## Purpose

MLG WarMap is an intelligence platform for collecting, verifying, calculating, preserving, and presenting information about X-Clash seasons and servers.

Its purpose is to give players and alliance leadership a clear, reliable view of the game state across multiple servers. It should help users understand what is known, what has changed, how complete the available information is, and when that information was last updated.

WarMap informs human decisions. It does not make those decisions.

## Descriptive, Not Prescriptive

MLG WarMap is a descriptive system rather than a prescriptive system.

A descriptive system answers questions such as:

- What exists?
- Which unions are native to this server?
- Which unions are currently active?
- What is each union's recorded combat strength?
- Who controls each territory or structure?
- What percentage of the map is controlled?
- What percentage is controlled by the player's union?
- What is the resource value of that territory under the active season's rules?
- What changed between confirmed observations?
- When was the information collected?
- How complete is the current dataset?

A prescriptive system attempts to answer questions such as:

- What should the union do next?
- Which server should receive priority?
- Which target should be attacked?
- Which union is the greatest threat?
- Which objective is most important?
- What is the optimal strategy?

Prescriptive decisions remain the responsibility of players and alliance leadership. WarMap may provide the evidence needed to make those decisions, but it must not present recommendations, priorities, or strategic judgments as facts.

## Guiding Principles

### 1. Record the game state faithfully

WarMap should preserve the best available representation of the observed game state without adding strategic interpretation that was not present in the source data.

### 2. Separate facts from interpretation

The system should distinguish between:

- observed data extracted from a screenshot or other source;
- user-confirmed facts;
- values calculated from confirmed state and season rules;
- contextual notes entered by a user.

These categories must not be presented as interchangeable.

### 3. Keep humans in control of uncertain data

Screenshot recognition and other automated extraction may propose:

- union identities;
- native-server assignments;
- combat-strength observations;
- territory ownership;
- structure ownership;
- other visible game data.

Automated proposals should be reviewable. Where recognition is uncertain or a proposed change affects authoritative state, a user should be able to confirm, correct, or reject it.

### 4. Attach provenance to evidence-backed facts

Where practical, observed or manually entered facts should retain enough context to answer:

- Where did this information come from?
- When was it observed?
- Was it entered manually or extracted automatically?
- Has it been confirmed?
- Has a newer observation superseded it?

Confidence belongs with the observation it describes. It should not become an independent strategic rating.

### 5. Store facts; calculate summaries

WarMap should store the underlying state needed to reproduce its summaries. Values that can be reliably calculated should not be maintained as separate manual totals.

For example:

- server number and native unions are stored;
- current ownership is stored per server;
- combat strength is stored as a time-stamped observation;
- controlled-territory percentage is calculated;
- the player's territory percentage is calculated;
- territory resource value is calculated using the active season's rules.

This prevents dashboard totals from drifting away from the map state.

### 6. Keep season rules separate from server state

Season packages describe maps, structures, resources, scoring, phases, capture rules, and other game rules.

Server state records mutable facts such as ownership and observed union information.

The Game Rules Engine interprets season rules but must not own live server state. Renderers display resolved information but must not invent rules or become the authority for mutable state.

### 7. Present information at the appropriate level

Information should appear where it best supports understanding:

- The Command Centre compares servers at a glance.
- The Server Overview explains the state and history of one server.
- The interactive map shows exact locations and ownership.
- Evidence views preserve screenshots, proposed changes, and review history.

Detailed history, territory changes, and evidence should not overload the main Command Centre screen.

### 8. Prefer transparent measurements over vague judgments

Where combat strength or another measured value is available, show the measurement rather than replacing it with labels such as "strong", "weak", or "dangerous".

WarMap should not create estimated enemy-strength ratings or importance rankings when the underlying data can be shown directly.

### 9. Treat freshness and completeness as properties of the data

Users need to know whether information is current and sufficiently complete.

Freshness and completeness should be communicated through fields such as:

- last updated;
- mapped territory count;
- ownership coverage;
- verified structure coverage;
- known combat-strength coverage;
- pending evidence review.

These signals may contribute to an overall data-health presentation, but the underlying reasons should remain visible.

### 10. Build integrations without duplicating their responsibilities

WarMap may later exchange information with bots, APIs, or other services. Those integrations should supply or consume data through clear boundaries.

For example, if an external bot already detects events and sends alerts, WarMap should not build a duplicate alert engine merely to reproduce that function. It may record or display imported event data where useful.

## Feature Inclusion Rule

A proposed feature belongs in MLG WarMap when it primarily helps users:

- collect game-state information;
- verify or correct collected information;
- preserve evidence and observation history;
- calculate values from confirmed state and season rules;
- compare servers, unions, territories, structures, or time periods;
- search, filter, summarise, or visualise known information;
- understand the freshness or completeness of the dataset;
- add factual context that cannot be represented cleanly elsewhere.

Before accepting a feature, ask:

> Does this help the user understand the state of the game, the quality of the available data, or how that state has changed?

If the answer is yes, the feature is likely within scope.

## Feature Exclusion Rule

A proposed feature should normally be excluded when its primary purpose is to:

- recommend an action;
- assign strategic priority;
- identify an attack target;
- decide which server matters most;
- rank threats using opaque interpretation;
- optimise alliance strategy;
- replace leadership judgment;
- duplicate a responsibility already owned by an external integrated system;
- add dashboard information that does not support a clear player question.

Before accepting such a feature, ask:

> Is this presenting evidence, or is it telling the player what to do?

If it tells the player what to do, it falls outside WarMap's core purpose unless the product philosophy is explicitly revised.

## Examples

### Features that fit the platform

| Feature | Why it belongs |
|---|---|
| Server number | Identifies the server being described. |
| Native unions | Records an important server relationship. |
| Active unions | Describes activity derived from confirmed ownership history and the verified fourteen-day inactivity rule; known association alone is separate. |
| Union combat strength | Preserves measured game data with observation time and source. |
| Total controlled territory | Calculates how much of the capturable map currently has an owner. |
| Player-union territory percentage | Calculates the player's share of the complete capturable map. |
| Territory resource value | Applies the active season's resource and scoring rules to confirmed ownership. |
| Last updated | Shows the freshness of the information. |
| Map progress | Shows how complete the current map data is. |
| Territory changes | Describes changes between clearly identified confirmed snapshots. |
| Structure ownership breakdown | Summarises confirmed ownership by season-defined structure type. |
| Server observations | Preserves factual context that does not fit a structured field. |
| Screenshot review | Lets users verify automatically proposed facts before applying them. |

### Features that do not fit the platform

| Feature | Why it does not belong |
|---|---|
| Recommended attack target | Prescribes strategy instead of describing state. |
| Highest-priority server | Assigns leadership priority rather than presenting comparative facts. |
| AI-generated objectives | Tells players what they should do. |
| Estimated enemy rating when combat strength is available | Replaces transparent measurements with interpretation. |
| Strategic importance score | Encodes an opaque judgment as if it were a fact. |
| Duplicate alert engine | Repeats another integrated system's responsibility without improving the intelligence record. |

### Context-dependent features

Some features belong only when framed descriptively:

| Acceptable | Not acceptable |
|---|---|
| "MLG lost 12 territories since the previous confirmed snapshot." | "MLG should immediately retake the northern sector." |
| "KOV combat strength was recorded as 1.52B at 18:00." | "KOV is the most dangerous enemy." |
| "The eastern map area has not been verified." | "The eastern area should be the next priority." |
| "The bridge unlocks on Friday under the active phase rules." | "Leadership should prepare an attack for Friday." |

## Product Boundary

The core product can be understood as four connected intelligence views:

1. **Command Centre** — compares the current state of all tracked servers.
2. **Server Overview** — examines one server's unions, ownership, resources, completeness, evidence, and changes.
3. **Interactive Map** — displays and edits exact territory and structure state.
4. **Evidence and History** — records observations, screenshots, confirmations, and changes over time.

All four views serve the same purpose: assemble and present reliable information while leaving strategic judgment with the player.

## Architectural Consequence

This philosophy should guide the boundaries between modules:

- Season packages define the rules and available game concepts.
- The Game Rules Engine interprets those rules.
- Server-state services own mutable, server-specific facts.
- Evidence services manage observations and review status.
- Summary services calculate descriptive metrics from rules and confirmed state.
- Renderers display prepared information.
- No renderer, summary service, or automated extraction process should independently invent strategic recommendations.

## Review Test for Future Work

Every new feature, data field, automated process, and dashboard element should pass these questions:

1. What player question does it answer?
2. Is the output observed, confirmed, calculated, or manually noted?
3. Can its source and observation time be preserved where relevant?
4. Does it describe the game state, or prescribe an action?
5. Is it shown at the correct information level?
6. Can the same outcome be produced from stored facts rather than a duplicated manual total?
7. Does another integrated system already own this responsibility?

If these questions cannot be answered clearly, the feature should remain outside the implementation until its purpose is better defined.
