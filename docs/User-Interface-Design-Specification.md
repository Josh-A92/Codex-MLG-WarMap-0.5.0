# User Interface Design Specification

## 1. Purpose

This document records the approved first user-facing design for:

- Data Management;
- the responsive server-map workspace;
- prepared Season Setup confirmation and activation.

It translates the agreed screens into application-service responsibilities. It
does not authorize renderers to mutate persistence envelopes, create audit
metadata, infer permissions, or reproduce domain lifecycle logic.

The designs remain descriptive rather than prescriptive. They help users record,
review, and understand game state without recommending strategy.

## 2. Shared Interface Principles

### 2.1 Active season context

The user selects or enters a season before opening the subordinate workspaces in
this specification.

Consequently:

- Data Management does not contain another season selector;
- the map workspace does not contain another season selector;
- all requests inherit the active `seasonId` from trusted application context;
- a server selector remains available where moving between server maps is useful;
- a client must not use a hidden or disabled selector as an authorization check.

### 2.2 Union neutrality

The application is usable by any union.

Examples, descriptions, empty states, configuration labels, and administrative
text must not assume MLG or another designated union unless the active
configuration explicitly identifies one for a factual display.

### 2.3 Responsive direction

The application uses a vertical, mobile-first reading flow.

- The page itself must not require horizontal scrolling.
- Wide data tables may use a contained responsive table region.
- Map pan and zoom remain inside the map viewport.
- Permanent left and right information panels must not reduce smartphone
  usability.
- Controls stack or wrap at narrow widths.
- Touch, mouse, and keyboard interaction remain supported.

### 2.4 Authority and audit

- Visible controls reflect capabilities for usability only.
- Application services enforce authorization.
- Actor identity and audit timestamps come from trusted runtime context.
- Automated extraction produces proposals, not confirmed state.
- Confirm and reject actions call typed domain transitions.
- Calculated totals are never maintained through independent UI inputs.

## 3. Data Management Workspace

### 3.1 Navigation order

The approved navigation order is:

1. Territory & Evidence
2. Evidence Intake
3. Review Queue
4. Union Registry

The first three areas form one evidence and confirmation workflow. Union Registry
is placed last because it manages global identity rather than one evidence-review
sequence.

### 3.2 Territory & Evidence

This is the default server-scoped Data Management area.

Its purpose is to:

- show map confirmation freshness;
- list evidence-derived proposals awaiting approval;
- link each evidence asset to the Review Queue;
- show a compact list of recently confirmed territory or structure facts.

It does not provide general manual fact entry. Territory and structure ownership
are edited from the map workspace.

When every proposal associated with an evidence asset has been confirmed or
rejected, that asset must disappear from the awaiting-approval list. The asset
remains preserved in evidence history.

Initial displayed values:

- map confirmed through;
- most recent evidence time;
- number of proposals awaiting approval;
- uploaded/observed time for each pending evidence asset;
- remaining proposal count for each asset.

### 3.3 Evidence Intake

The initial evidence form contains:

- screenshot file;
- server tag;
- observation time;
- optional factual context note.

Rules:

- screenshots are treated as partial views;
- there is no coverage selector;
- accepted initial formats are JPEG and PNG;
- the user does not enter media type, byte size, pixel dimensions, storage
  reference, integrity hash, uploader, or upload time;
- the adapter detects or creates those values;
- observation time may be approximate, such as "2 hours ago";
- an upload remains evidence and does not change confirmed ownership.

Recent assets remain visible as history after processing or review.

### 3.4 Review Queue

The Review Queue lists normalized proposals across supported domain types.

Each row shows enough information to decide whether to inspect it:

- observed time;
- proposal type;
- proposed factual value;
- evidence or extraction context;
- review action.

The detail view supports:

- confirm;
- reject;
- reviewer note where supported by the operation contract.

Removing a row directly is not a valid review action. A row disappears only
after its owning domain service completes the confirmed or rejected transition.

### 3.5 Union Registry

The user-facing create and edit fields are:

- union name;
- tag;
- colour;
- map pattern;
- native server.

The UI does not request:

- an internal union ID;
- aliases.

The application must generate the stable union ID. The initial alias collection
is empty unless a later matching workflow explicitly records an alias.

Colour and pattern jointly identify a union on the map. Initial pattern choices
may include:

- solid;
- diagonal stripes;
- crosshatch;
- dots.

The registry table shows:

- tag;
- union name;
- a sufficiently large colour-and-pattern preview;
- native server;
- current or archived status;
- edit or restore action.

Existing current identities can be edited. Archived identities can be restored.
Archive and restore preserve historical relationships and observations.

### 3.6 Union registration transaction

The approved create form represents one user action but crosses more than one
domain boundary:

1. create the global union identity;
2. associate it as a known union on the selected server and season;
3. create the confirmed native assignment for that server and season.

The renderer must not perform these calls independently. The implemented Union
Registration Coordinator:

- require `union_registry.manage` and appropriate server/season authority;
- generate the stable union ID;
- store colour as canonical `defaultColor` and map pattern in
  `presentationMetadata`;
- use an empty alias collection initially;
- applies global identity, known association, and native assignment through the
  shared atomic-operation boundary;
- return one screen-ready result;
- avoid leaving a partial identity or relationship if a later step fails.

The Data Management Runtime now composes this coordinator. The remaining work is
the approved form/table UI and a future hosted transaction adapter; the renderer
must continue to call the coordinator rather than recreate its steps.

## 4. Responsive Server-Map Workspace

### 4.1 Layout

The structure legend is removed. It consumes significant width, repeats codes
already displayed on the map, and does not provide a working interaction.

The approved layout order is:

1. server selection;
2. map controls;
3. full-width map viewport;
4. selected-target details.

The existing vertical server dock is replaced by a compact selector or wrapping
server controls above the map.

The map viewport:

- uses the available page width;
- contains its own pan and zoom;
- retains zoom in, zoom out, fit map, reset view, and center selection;
- does not cause page-level sideways scrolling;
- remains usable on smartphone screens.

### 4.2 Selected-target details

On larger screens, details remain below the map. On smartphones they may use a
collapsible bottom panel, while preserving the vertical page flow.

The default detail content is limited to:

- selected tile or structure identity;
- structure type and level where applicable;
- current owner with union colour and pattern;
- last confirmed time;
- last ownership change;
- season-defined structure value where applicable;
- ownership editing control.

The map detail panel does not show:

- tile coordinates;
- evidence source;
- complete evidence history;
- complete ownership history;
- review confidence;
- objectives, alerts, or recommendations.

Evidence and full history belong in Data Management and Server Overview.

### 4.3 Time semantics

`Last confirmed` and `Last ownership change` are distinct.

- A later observation confirming the same owner updates `Last confirmed`.
- It does not create an ownership change.
- `Last ownership change` identifies the most recent factual transition from one
  ownership state to another.
- Relative time may be displayed with the exact time available alongside it.

### 4.4 Ownership editing

The ownership editor remains a direct factual action by an authorized user.

The production action must:

- identify whether the selection is a normal map cell or logical structure;
- call the corresponding authorized ownership operation;
- create a confirmed manual ownership record with trusted actor/time metadata;
- refresh the current map projection;
- refresh affected summaries and freshness;
- queue persistence only after the domain operation succeeds.

The current renderer routes territory and structure edits through the
`MapOwnershipCoordinator`. One atomic operation creates canonical ownership and
target-verification records, updates the current `ServerStateService` projection,
and then allows persistence to be queued. Canonical history is therefore the
factual authority while server state remains the current render projection.

### 4.5 Selected-target read projection

The renderer should not scan and interpret complete history collections.

A selected-target query or projection should return:

- target identity and structure metadata from the active season package;
- current confirmed ownership record;
- current union presentation identity;
- most recent confirmation time;
- most recent actual ownership transition;
- applicable season-defined value.

The implemented `SelectedMapTargetViewService` composes ownership history,
verification, union registry data, and Game Rules Engine output. It remains
read-only, returns safe copies, and is used by the current map detail flow.

## 5. Prepared Season Setup

### 5.1 Purpose

Season setup is administration, not ordinary Data Management.

The user does not manually construct map geometry, structure catalogues, resource
definitions, or structure values in the initial UI. A prepared, validated,
season-specific package supplies them.

The administrator verifies and activates the package.

### 5.2 Approved flow

The approved three-step flow is:

1. Season & Servers
2. Confirm Loaded Setup
3. Review & Activate

#### Step 1: Season & Servers

The administrator:

- selects an available prepared season setup;
- supplies the season display name where necessary;
- confirms or manages the participating server list.

Descriptions remain union-neutral.

#### Step 2: Confirm Loaded Setup

The UI presents read-only package content:

- map dimensions and definition;
- structure types, codes, levels, and capturability;
- resource name and unit;
- structure values or scoring values supplied by the package.

The resource label is dynamic. The UI must not assume Ice Crystals or another
resource.

The administrator separately confirms:

- map and structure configuration;
- resource and structure-value configuration.

Both confirmations are required before continuing.

#### Step 3: Review & Activate

The final view summarizes:

- season identity;
- server count/list;
- selected package;
- map and structure confirmation;
- resource and value confirmation.

Activation makes the setup read-only during normal operation.

### 5.3 Optional package rules

Phase/unlock, capture, and buff configuration are not part of the initial
confirmation screen.

They appear only if:

- the selected package contains verified rules that materially affect WarMap;
- the Game Rules Engine consumes them;
- the confirmation view can describe them in clear game language.

The UI must not invent configurable mechanics merely because the package schema
can represent them.

### 5.4 Season administration implementation status

The implemented `SeasonAdministrationService`, application bootstrap, and
activation persistence boundary now:

- list the prepared Season 1 and Season 2 packages;
- validate prepared packages through the existing package boundary;
- authorize `season_rules.manage`;
- require the approved map/structure and resource/value confirmations;
- activate one package and selected server set;
- persist and restore activation state;
- expose the active season context to the renderer;
- prevent ordinary replacement after activation.

Season 2 remains a non-activatable draft until its authoritative rules are
complete. A later controlled, versioned correction workflow remains outside the
current milestone.

## 6. UI-to-Service Mapping

| User action or display | Existing boundary | Production mapping or gap |
| --- | --- | --- |
| Load Union Registry | `DataManagementQueryService.getUnionRegistryWorkspace()` | Ready for UI composition |
| Create union | `UnionRegistrationCoordinator.registerUnion()` | Domain/runtime boundary ready; approved UI still required |
| Edit union | `UnionRegistryManagementService.updateUnionIdentity()` | Ready once UI adapter maps name/tag/colour/pattern to canonical changes |
| Archive union | `UnionRegistryManagementService.archiveUnionIdentity()` | Ready |
| Restore union | `UnionRegistryManagementService.restoreUnionIdentity()` | Ready |
| Load server evidence/reviews | `DataManagementQueryService.getServerWorkspace()` | Ready for screen projection |
| Load global evidence history | `DataManagementQueryService.getEvidenceWorkspace()` | Ready |
| Register screenshot metadata | `EvidenceManagementService.registerUploadedAsset()` | Needs adapter-owned byte storage, metadata detection, and stable storage reference |
| Create extraction proposal | `EvidenceManagementService.createExtractionProposal()` | Ready for a future extraction adapter; not a direct user form |
| Confirm proposal | `ProposalReviewManagementService.confirmProposal()` | Ready |
| Reject proposal | `ProposalReviewManagementService.rejectProposal()` | Ready |
| Edit territory owner on map | `MapOwnershipCoordinator.setTerritoryOwnership()` | Integrated into the current renderer |
| Edit logical structure owner | `MapOwnershipCoordinator.setStructureOwnership()` | Integrated into the current renderer |
| Display current owner | `SelectedMapTargetViewService` plus current server-state projection | Integrated into the current detail flow |
| Display last confirmed/change | `SelectedMapTargetViewService` | Implemented read projection; final responsive detail presentation remains |
| Display structure value | Active season package and Game Rules Engine | Must use dynamic resource/scoring model; no invented values |
| Load prepared season package | `SeasonLoader.load()` plus package validator | Existing low-level boundary |
| Confirm and activate season setup | `SeasonAdministrationService.activateSeason()` | Implemented with authorization and persistence; Season 2 remains draft |

## 7. Implementation Sequence

The production sequence and current status are:

1. Add this design specification to the authoritative documentation.
2. Reconcile Data Management navigation and current-status documentation.
3. Completed: implement the Union Registration Coordinator and tests.
4. Completed: integrate Data Management Runtime, persistence, and query
   projections into application bootstrap and renderer initialization.
5. Next UI milestone: implement Territory & Evidence, Evidence Intake, Review
   Queue, and Union Registry screens.
6. Completed: implement and integrate the Map Ownership Coordinator and
   Selected Map Target View Service.
7. Remaining UI milestone: apply the responsive map layout and finish the
   simplified detail presentation.
8. Completed: implement prepared-package listing, confirmation, activation, and
   activation persistence. Season 2 correctly remains a draft preview.

The Data Management UI may be delivered before hosted authentication by using the
existing trusted-local-actor adapter. That temporary adapter must continue to
exercise the same capability checks used by a future hosted client.

## 8. Acceptance Criteria

### Data Management

- Navigation order matches the approved four areas.
- No subordinate season selector is shown.
- Evidence uploads require a server tag and do not ask for coverage.
- Completing every review for an asset removes it from awaiting approval.
- Union create/edit fields match the approved visible field set.
- Map patterns are visible at a useful size.
- Archived unions can be restored.
- Internal IDs and aliases are not user inputs.

### Map

- The non-functional structure legend is absent.
- Server selection is above the map.
- The page does not scroll sideways at smartphone width.
- Map pan and zoom remain contained.
- Details follow the approved compact field list.
- Ownership editing produces canonical history as well as current projection.
- Last confirmation and last change remain distinct.

### Season Setup

- A prepared package supplies map, structures, resource, and values.
- Loaded content is read-only during confirmation.
- Resource labels are package-driven.
- Both confirmation groups are required.
- Activation is authorized and persisted outside renderer state.
- Activated rules are read-only during normal use.
- Union-specific wording is absent.
