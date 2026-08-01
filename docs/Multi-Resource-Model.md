# Multi-Resource Model

## Purpose
This document defines the approved replacement for the current single-resource Season Package model.

The target is a breaking contract change that allows a season to define more than one resource without inventing a mandatory primary resource or a global hard-coded resource name.

The document is intentionally forward-looking. It describes the canonical version-2 shape that Season Package consumers should converge on, and it does not propose a permanent version-1 compatibility branch.

## Confirmed Decisions
- The canonical package must support multiple resources per season.
- There is no mandatory or implicit primary resource.
- Resources are season-owned; no resource name is hard-coded globally.
- Resource display order follows the package resource array order.
- A structure may affect zero, one, or multiple resources.
- Scoring calculations explicitly reference their resource.
- Unconfigured calculations remain valid and must not invent totals.
- Season 1 migrates to one Ice Crystal resource.
- Season 2 may declare both Red Copper and Holy Water.
- Persistence and live server ownership remain unaffected.
- No contract-level unresolved questions remain.

## Canonical Schema
The approved version-2 target shape is:

```json
{
  "packageIdentity": {
    "schemaVersion": 2
  },
  "rulesDefinition": {
    "resourceModel": {
      "resources": [
        {
          "resourceId": "ice-crystals",
          "displayName": "Ice Crystals",
          "unit": "crystals",
          "metricType": "season-resource"
        }
      ],
      "structureOutputs": {
        "V1": [
          {
            "resourceId": "ice-crystals",
            "value": 100000
          }
        ]
      }
    },
    "scoringModel": {
      "calculations": [
        {
          "calculationModelId": "season1-ice-crystal-holdings",
          "resourceId": "ice-crystals",
          "configured": true,
          "displayLabel": "Ice Crystals",
          "serverField": "iceCrystals",
          "unconfiguredLabel": "Scoring rules not configured"
        }
      ]
    }
  }
}
```

### Canonical shape rules
- `resourceModel.resources` is an array.
- `resourceModel.structureOutputs` maps structure codes to arrays of resource-output entries.
- `scoringModel.calculations` is an array.
- Each calculation explicitly references one resource via `resourceId`.
- No implicit primary resource or fallback selection is allowed.
- Empty `resources`, `calculations`, and per-structure output arrays are structurally permitted when the season genuinely defines none.

## Validation Rules
These rules define the intended version-2 validator behavior.

### Resource model
- `resources` must be an array.
- Each resource entry requires `resourceId`, `displayName`, `unit`, and `metricType`.
- Every required resource field must be a non-empty, non-whitespace string.
- Resource IDs must be unique.
- Resource display order follows the array order in the package.
- Unknown fields fail validation.
- Inputs remain immutable.
- No implicit primary resource or fallback resource is allowed.

### Structure outputs
- `structureOutputs` must be an object/map keyed by structure code.
- Each structure-output value must be an array.
- Every structure-output key must resolve to a declared structure catalogue code, type ID, or explicitly supported structure reference.
- Every structure-output entry must resolve its `resourceId` to a declared resource.
- A structure cannot contain duplicate output entries for the same resource.
- Output values must be finite numbers.
- Unknown fields fail validation.
- Inputs remain immutable.
- A structure may have zero outputs, one output, or multiple outputs.

### Scoring model
- `calculations` must be an array.
- Each calculation requires `calculationModelId`, `resourceId`, and `configured`.
- `displayLabel`, `serverField`, and `unconfiguredLabel` are optional strings unless runtime behavior genuinely requires them.
- Calculation IDs must be unique.
- Every calculation `resourceId` must resolve to a declared resource.
- `configured` must remain an explicit boolean decision.
- When `configured: false`, the calculation is structurally valid but must not invent derived totals.
- Calculation order follows the package array order.
- Unknown fields fail validation.
- Inputs remain immutable.

### Cross-reference integrity
- Every calculation `resourceId` must resolve to a declared resource.
- Every structure-output `resourceId` must resolve to a declared resource.
- If `resources` is empty, `structureOutputs` and `calculations` must also be empty because no resource references can resolve.

### Versioning
- This is a breaking contract change and requires `packageIdentity.schemaVersion: 2`.
- All active packages, validator, loader fixtures, engine, summary, administration, selected-target view, renderer, and tests migrate together before version 1 is rejected.
- Do not add a permanent version-1 compatibility branch.
- Do not silently convert legacy fields into the new shape.
- Version 1 must fail clearly after migration is completed.

## Game Rules Engine API Implications
The Game Rules Engine currently exposes single-object accessors such as `getResourceModel()` and `getScoringModel()` in [src/services/game-rules-engine.js](../src/services/game-rules-engine.js).

Version 2 implies the engine must stop assuming a single resource and must normalize or expose plural collections instead.

Required API implications:
- resource access must become array-aware.
- scoring access must support plural calculations.
- structure-to-resource profiles must support zero, one, or many outputs.
- unconfigured calculations must be representable without fabricated totals.
- resource lookup must be explicit and keyed by `resourceId`.

Implementation must preserve purity and clone safety, because downstream services expect immutable snapshots.

## Summary Service Implications
The summary layer currently resolves a singular resource model and a singular scoring model in [src/services/summary-service.js](../src/services/summary-service.js).

Version 2 implies the summary service must:
- stop assuming one global resource name.
- show resource summaries in package order.
- consume plural calculations instead of a single scoring model.
- avoid inventing totals when a calculation is unconfigured.
- keep designated-union calculations separate from the resource-model shape.

Summary views must be able to present multiple season resources without collapsing them into a fallback primary label.

## Season Administration Implications
The season administration flow in [src/services/season-administration-service.js](../src/services/season-administration-service.js) currently serializes a single resource summary from the canonical package.

Version 2 implies the admin service must:
- preserve package-order resource display.
- show multiple resources when they exist.
- treat unconfigured scoring as valid but not total-producing.
- avoid assuming a single `resourceId` as the season-wide truth source.
- continue to keep persistence and live server ownership unchanged.

The service should remain a consumer of package facts, not the place where resource semantics are invented.

## Selected-Map Detail Implications
The selected-map detail surface in [src/services/selected-map-target-view-service.js](../src/services/selected-map-target-view-service.js) currently exposes a single season-defined value for a selected structure.

Version 2 implies selected-map detail views must:
- show per-resource outputs when a structure affects multiple resources.
- preserve package order when presenting resource effects.
- avoid collapsing multiple outputs into a single primary value.
- distinguish explicit season-defined outputs from absent or unconfigured ones.

This view must remain a detail surface, not a source of invented gameplay formulas.

## Renderer/UI Implications
Renderer and UI consumers must treat resources as plural and ordered.

Implications:
- resource badges, panels, and summaries should iterate package resources in order.
- structures with zero outputs should render as having no resource effect rather than as having a default effect.
- unconfigured calculations should display their unconfigured label rather than invented totals.
- Season 2 UI must be able to show Red Copper and Holy Water context without assuming one of them is a hidden primary.
- no UI layer should infer fallback values from resource absence.

## Season 1 Migration Example
Season 1 should migrate to a single explicit Ice Crystal resource.

Example target for Season 1:

```json
{
  "packageIdentity": {
    "schemaVersion": 2
  },
  "rulesDefinition": {
    "resourceModel": {
      "resources": [
        {
          "resourceId": "ice-crystals",
          "displayName": "Ice Crystals",
          "unit": "crystals",
          "metricType": "season-resource"
        }
      ],
      "structureOutputs": {
        "V1": [
          {
            "resourceId": "ice-crystals",
            "value": 100000
          }
        ]
      }
    },
    "scoringModel": {
      "calculations": [
        {
          "calculationModelId": "season1-ice-crystal-holdings",
          "resourceId": "ice-crystals",
          "configured": true,
          "displayLabel": "Ice Crystals",
          "serverField": "iceCrystals",
          "unconfiguredLabel": "Scoring rules not configured"
        }
      ]
    }
  }
}
```

Season 1 already has a canonical single-resource narrative, but under version 2 it becomes explicit and array-backed rather than a hidden single-resource assumption.

## Season 2 Readiness Implications
The resource-plurality architecture decision is resolved.
Season 2 may declare both Red Copper and Holy Water.
The remaining gaps are their precise roles, structure-output relationships, modifiers, and scoring formulas.

Readiness implication:
- geometry is ready.
- the canonical structure catalogue is ready.
- the resource-output and scoring evidence is not yet ready.
- runtime configuration still depends on deployment inputs.

The approved replacement therefore cannot be published for Season 2 until the outstanding evidence gaps are closed.

## Exact Affected-File Inventory
The version-2 migration will touch these implementation surfaces:
- [Season-Package-Schema.md](Season-Package-Schema.md)
- [src/services/season-package-validator.js](../src/services/season-package-validator.js)
- [src/seasons/season1-package.js](../src/seasons/season1-package.js)
- [src/services/game-rules-engine.js](../src/services/game-rules-engine.js)
- [src/services/summary-service.js](../src/services/summary-service.js)
- [src/services/season-administration-service.js](../src/services/season-administration-service.js)
- [src/services/selected-map-target-view-service.js](../src/services/selected-map-target-view-service.js)
- [src/map-renderer.js](../src/map-renderer.js)
- [tests/season-package-validator.test.js](../tests/season-package-validator.test.js)
- [tests/season1-package.test.js](../tests/season1-package.test.js)
- [tests/summary-service.test.js](../tests/summary-service.test.js)
- [tests/season-administration-service.test.js](../tests/season-administration-service.test.js)
- [tests/selected-map-target-view-service.test.js](../tests/selected-map-target-view-service.test.js)
- [tests/season-loader.test.js](../tests/season-loader.test.js)
- [tests/application-bootstrap.test.js](../tests/application-bootstrap.test.js) for renderer and Game Rules Engine source-boundary coverage
- [tests/season-setup-ui.test.js](../tests/season-setup-ui.test.js) for renderer source-boundary coverage
- [tests/server-state-service.test.js](../tests/server-state-service.test.js) for renderer source-boundary coverage
- `tests/game-rules-engine.test.js` (new dedicated Game Rules Engine test file if none currently exists)

## Staged Implementation and Test Plan
1. Update schema documentation and all active packages to the plural resource contract with `packageIdentity.schemaVersion: 2`.
2. Update validator rules, loader fixtures, and tests to enforce plural resource, calculation, and output arrays.
3. Update the Game Rules Engine, summary, administration, selected-map detail, and renderer layers to consume plural resource and calculation data in package order.
4. Update Season 1 package data to the explicit single-resource Ice Crystal shape.
5. Reject version 1 only after the full migration lands together across packages, validator, loader fixtures, engine, summary, administration, selected-target view, renderer, and tests.
6. Add tests for:
- plural resource definitions
- duplicate resource IDs
- calculation resource resolution
- per-structure multi-resource outputs
- empty collections where genuinely allowed
- immutability
- version-1 failure after migration
- Season 1 migration example
- Season 2 multi-resource readiness boundaries

## Explicit Exclusions
- No permanent version-1 compatibility shim.
- No silent conversion of legacy single-resource fields.
- No hidden primary-resource fallback.
- No invented outputs, formulas, or scoring values.
- No persistence redesign.
- No live-server ownership redesign.
- No Season 2 runtime integration claim.
- No claim that exact Season 2 resource outputs or formulas are already fully evidenced.

## Evidence Gaps
No contract-level unresolved questions remain.

The remaining Season 2 gaps are evidence gaps, not architecture questions:
- exact structure-output relationships
- exact resource modifiers
- exact scoring formulas
