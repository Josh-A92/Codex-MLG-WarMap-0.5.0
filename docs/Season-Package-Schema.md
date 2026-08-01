# Season Package Schema

## 1. Purpose and Scope
This document defines the formal, season-neutral contract that every MLG WarMap season package must satisfy.

A season package is a definition bundle, not live server state. It describes the rules, map concepts, and application configuration needed to start the application for a season. It does not contain mutable server ownership, persistence behavior, or UI concerns.

This contract is descriptive, not prescriptive. It exists to define the package shape and the validation expectations for future season packages while preserving the current architecture boundaries:
- season packages contain definitions, not live server state
- shared map definitions remain immutable
- mutable ownership is stored separately per server and season
- the Game Rules Engine receives rules only
- bootstrap receives application configuration separately
- structure IDs and cell IDs must be stable
- references must resolve within the package or an explicitly declared external registry
- future seasons are added through packages and rules, not shared-engine conditionals
- no MLG-specific behavior is hard-coded
- the contract remains storage-implementation neutral

Out of scope:
- JSON Schema generation
- loader implementation
- validation code
- persistence design
- Season 2 data
- UI styling
- strategic logic
- screenshot ingestion rules beyond package shape

## 2. Package Overview
A season package is the authoritative season definition consumed by application bootstrap.

The canonical package shape is nested:
- `packageIdentity`
- `rulesDefinition`
- `applicationConfig`
- optional `externalRegistries`
- optional `extensions`

Bootstrap may inspect the full canonical package, but it must pass only the rules definition to the Game Rules Engine. Application configuration must be resolved separately and injected into bootstrap/application services.

The canonical Season 1 startup path now uses `SEASON_1_PACKAGE` via the validator and loader.

The former flat `SEASON_1_DEFINITION` shape was a legacy pre-loader structure and has been removed from active startup.

The package should be considered versioned, self-describing, and complete enough for startup without relying on silent defaults.

## 3. Top-Level Schema
A conforming package contains these top-level sections:
- `packageIdentity`
- `rulesDefinition`
- `applicationConfig`
- optional `externalRegistries`
- optional `extensions`

Conceptual top-level shape:
```json
{
  "packageIdentity": {
    "schemaVersion": 1,
    "packageVersion": "1.0.0",
    "seasonId": "season-1",
    "displayName": "Season 1",
    "description": "Optional season summary",
    "seasonStatus": "active",
    "startDate": "2026-07-01T00:00:00Z",
    "endDate": null
  },
  "rulesDefinition": {
    "seasonIdentity": {},
    "metadata": {},
    "mapDefinition": {},
    "structureCatalog": [],
    "resourceModel": {},
    "scoringModel": {},
    "phaseModel": [],
    "structureUnlocks": {},
    "captureRules": {},
    "buffDefinitions": []
  },
  "applicationConfig": {
    "designatedUnionId": "union-0001",
    "dataSources": {
      "mapDataUrl": "",
      "seasonServerStateDataUrl": "",
      "unionsDataUrl": ""
    },
    "workspace": {
      "homeId": "",
      "mapLabel": ""
    }
  },
  "externalRegistries": [],
  "extensions": {}
}
```

## 4. Identity and Metadata
This section defines the package identity contract.

Required fields:
- `schemaVersion`
- `seasonId`
- `displayName`
- `seasonStatus`

Optional fields:
- `packageVersion`
- `description`
- `startDate`
- `endDate`

Expected types:
- `schemaVersion`: positive integer major version
- `packageVersion`: optional string revision token
- `seasonId`: stable string identifier
- `displayName`: human-readable string
- `description`: optional string
- `seasonStatus`: one of `draft`, `planned`, `active`, `completed`, `archived`
- `startDate` / `endDate`: optional timestamp strings

Identifier uniqueness:
- `seasonId` must be unique within the package registry or season catalog
- `schemaVersion` must be explicit and comparable across packages

Reference integrity:
- identity fields must not depend on runtime state
- dates must remain optional if the season is not time-bounded

Failure behavior:
- missing required identity fields must fail package validation
- duplicate `seasonId` values must be rejected by the package registry or loader layer
- unsupported `schemaVersion` values must fail clearly

## 5. Rules Definition
The rules definition is the part of the package that the Game Rules Engine consumes.

It must include:
- season identity
- metadata
- map definition
- structure catalogue
- resource model
- scoring model
- phase model
- unlock rules
- capture rules
- buff definitions

It must not include application configuration or live server state.

Required fields:
- `seasonIdentity`
- `metadata`
- `mapDefinition`
- `structureCatalog`
- `resourceModel`
- `scoringModel`
- `phaseModel`
- `structureUnlocks`
- `captureRules`
- `buffDefinitions`

Optional fields:
- additional season-rule metadata that does not change application configuration boundaries

Expected types:
- objects for rule groups
- arrays for catalog and phase lists
- stable identifiers inside each rule group

Identifier uniqueness:
- structure codes must be unique within the structure catalogue
- structure IDs, phase IDs, and other rule identifiers must be unique within the package section that owns them

Reference integrity:
- all rule references must resolve to identifiers defined in the package or to a declared external registry reference
- rule data must not rely on silent defaults for required references

Failure behavior:
- missing rules groups must fail validation
- unresolved rule references must fail validation
- rules data must be rejected if it is incomplete enough that the Game Rules Engine cannot interpret it deterministically

## 6. Application Configuration
Application configuration is separate from rules and must not be passed into the Game Rules Engine.

It must include:
- `mapDataUrl`
- `seasonServerStateDataUrl`
- `unionsDataUrl`
- `workspace.homeId`
- `workspace.mapLabel`

Optional fields:
- `designatedUnionId` as a non-empty string identifier for the designated/player-union summary scope
- additional application-only routing or UI startup data, provided it does not become rules input

`applicationConfig.designatedUnionId` is a display/calculation selection used by summary services across servers. It must not be interpreted as native status, active status, ownership confirmation, diplomacy, or strategic importance.
Omitting `applicationConfig.designatedUnionId` is valid and means no designated union is configured. Consumers must not hard-code or infer a fallback union identifier.

Expected types:
- URLs or path-like strings for data sources
- strings for workspace settings

Identifier uniqueness:
- application configuration must refer to a single active workspace home per package
- map label values should be stable and season-specific

Reference integrity:
- data source references must point to declared package assets or declared external registries
- application configuration must not be inferred from the rules definition

Failure behavior:
- missing required application configuration must fail validation
- bootstrap must stop before renderer initialization when required configuration is absent
- no silent fallbacks are allowed for required application configuration

## 7. Map-Definition Contract
The map definition describes the season-specific shared map model.

It must support season-defined:
- stable map ID
- dimensions
- capturable-cell rules
- non-playable, decorative, and blocked cells
- logical structures
- multi-cell footprints
- stable cell and structure identifiers
- map-data reference
- a declared contract for interpreting external map data

Required fields:
- a stable map identifier
- `dimensions.rows`
- `dimensions.columns`
- cell classification rules
- structure footprint rules
- cell and structure identifiers that remain stable across the season package
- `mapDataContract`
- `mapDataRef`

The map-data contract is nested and discriminated so cell collections and logical structure collections can be described independently:

```json
{
  "mapDataContract": {
    "cells": {
      "collectionField": "tiles",
      "collectionShape": "row_arrays",
      "identity": {
        "mode": "coordinates",
        "rowField": "row",
        "columnField": "col"
      },
      "structureTypeRefField": "code"
    },
    "structures": {
      "collectionField": "structures",
      "idField": "id",
      "typeRefField": "code",
      "footprint": {
        "mode": "rectangle",
        "rowField": "row",
        "columnField": "col",
        "rowSpanField": "rows",
        "columnSpanField": "cols"
      }
    }
  }
}
```

Both supported representations normalize into the same internal model:
- stable logical cell identity
- stable logical structure identity
- structure-type references
- resolved footprint cell identities

Optional fields:
- additional map annotations
- decorative metadata
- region labels
- season-specific map notes

Expected types:
- identifier fields: strings
- dimensions: object with numeric `rows` and `columns`
- cell and structure lists: arrays of objects
- rule definitions: objects
- `mapDataContract`: object defining how external map data collections and identity/footprint modes are interpreted

Identifier uniqueness:
- cell IDs must be unique and stable within the map definition
- structure IDs must be unique and stable within the map definition
- footprint cells must resolve to one logical structure where applicable

Reference integrity:
- structure footprints must resolve to valid cell identifiers
- capturable-cell rules must resolve to map cells defined in the package
- the map-data reference must resolve to a declared map asset or file
- `mapDataContract` only declares field names and modes; it does not validate the referenced map file contents

Failure behavior:
- map definitions with ambiguous cell identity must fail validation
- structure footprints that cannot be resolved must fail validation
- a package cannot assume shared-map mutation to repair invalid map structure

Shared map definitions remain immutable.

## 8. Structure-Catalogue Contract
The structure catalogue defines the season-specific structure vocabulary.

It must support structure catalogue entries with:
- unique non-empty `structureTypeId`
- unique non-empty `code`
- non-empty `type`
- boolean `capturable`

Optional fields:
- `level`
- `expectedCount` for the authoritative number of logical structures or map cells of that catalogue type
- `firstCaptureReward` for the season-defined first-capture reward value
- `unlockWeek` for a structure type that becomes capturable during a numbered season week
- `categories`
- `assetKeys`
- `spriteKeys`
- `resourceReferences`
- `scoringReferences`
- `metadata`

Expected types:
- object records in an array catalogue
- string identifiers for cross references
- numeric `level` values where present
- positive-integer `expectedCount` and `unlockWeek` values where present
- non-negative-integer `firstCaptureReward` values where present
- arrays of non-empty strings for `categories`, `assetKeys`, `spriteKeys`, `resourceReferences`, and `scoringReferences`
- plain-object `metadata` containers with free-form contents

Identifier uniqueness:
- structureTypeId values must be unique within the package
- if both type and level participate in lookup, the package must define the lookup key explicitly

Reference integrity:
- resource/scoring references must resolve to the rule groups declared in the same package or to a declared external registry entry
- asset and sprite references must resolve to declared package assets when used by the runtime

Failure behavior:
- duplicate structure identifiers must fail validation
- catalogue entries with unresolved required references must fail validation
- the contract must not assume the Season 1 catalogue as a default shared vocabulary

## 9. Resource and Scoring Contract
The resource and scoring model describes how the season measures resource value and related statistics.

It must support:
- stable resource ID
- display name
- unit
- metric type
- calculation-model identifier
- structure or territory rules
- holding value, production rate, accumulated total, or other season-defined measures

Required fields:
- stable resource identity
- display name
- unit
- metric type
- a calculation-model identifier or equivalent rule anchor
- the season's resource/scoring model definition

Optional fields:
- structure output tables
- territory weighting rules
- accumulation rules
- display formatting hints
- unconfigured or placeholder states

Expected types:
- object definitions for the model
- string identifiers for resource and metric names
- arrays or maps for rule references and outputs

Identifier uniqueness:
- resource identifiers must be unique within the package
- calculation model identifiers must be unique where more than one model exists

Reference integrity:
- structure references must resolve to the structure catalogue and the map definition
- territory references must resolve to the map definition and ownership rules

Failure behavior:
- missing resource identity or scoring identity must fail validation when the season depends on them
- the package must not invent scoring values that are not explicitly defined by the season
- unresolved resource or scoring references must fail validation

## 10. Phase and Unlock Contract
The phase and unlock model defines season progression and rule availability.

It must support season-defined phases and rule availability without hard-coded checks such as `if (seasonId === "season-2")`.

Required fields:
- phase identifier
- phase label
- phase status

Optional fields:
- `activationMode` with values `manual`, `scheduled`, or `evidence_confirmed`
- `startAt` as a timestamp string or `null`
- `endAt` as a timestamp string or `null`
- `notes` as a string

Expected types:
- phase records in an array
- identifiers as strings
- `status` as a non-empty string for now
- timing fields as optional timestamp strings or `null`

Validation rules:
- unknown phase fields must fail validation
- `endAt` must not precede `startAt`
- phase dates must not be invented by the schema or validator

Identifier uniqueness:
- phase IDs must be unique within the package

Reference integrity:
- phase unlocks must resolve to rule identifiers or structure identifiers declared in the same package, or to declared external registry references

Failure behavior:
- a phase that cannot be resolved to a valid rule target must fail validation
- timing fields must remain optional where a phase is manually activated or confirmed later

## 11. Capture and Buff Contract
This section defines the shape required for capture behavior and buff definitions.

It must support:
- default capture behavior
- per-structure overrides
- per-type overrides
- phase restrictions
- buff definitions and affected targets

Required fields:
- default capture behavior
- per-code or per-structure override container
- per-type override container
- buff definition container

Optional fields:
- phase-gated capture rules
- season-specific buff metadata
- affected-target lists
- buff durations or activation notes

Expected types:
- object-based rule maps
- boolean capture flags or equivalent rule values
- arrays for buff definitions and target lists

Identifier uniqueness:
- override keys must be unique within their rule map
- buff identifiers must be unique if buffs are individually addressable

Reference integrity:
- capture overrides must resolve to valid structure codes or structure types
- buff targets must resolve to valid structures, phases, resources, or other declared package identifiers

Failure behavior:
- missing default capture behavior must fail validation where capture is a supported rule class
- overrides that target unknown structures or types must fail validation
- buff rules must not invent Season 2 mechanics or other future content

## 12. Validation Rules
Every season package must be validated against the same general contract rules.

Required fields:
- every field explicitly marked required in this document

Optional fields:
- every field explicitly marked optional in this document

Expected type:
- values must match their declared type or a compatible structured representation

Identifier uniqueness:
- package identifiers must be unique at their owning scope
- rule-group identifiers must be unique at their owning scope
- map cell IDs and structure IDs must remain stable and unique

Reference-integrity requirements:
- references must resolve inside the package or through a declared external registry
- unresolved references must fail validation rather than silently fallback
- shared map data must remain immutable
- required containers may be empty only when the contract explicitly permits an empty collection

Failure behavior:
- missing required fields fail package validation
- invalid types fail package validation
- unresolved references fail package validation
- duplicate identifiers fail package validation
- invalid or unsupported package structure fails package validation before application startup

## 13. Compatibility and Versioning
The package schema must support explicit versioning.

Required rules:
- every package must declare a schema version
- `schemaVersion` is a positive integer major version
- `1` represents the first canonical package contract
- breaking schema changes increment the integer
- non-breaking additions use optional fields or `extensions`
- package/content revision may use an optional `packageVersion` string and must not overload `schemaVersion`
- unsupported versions must fail clearly
- required fields must not be silently synthesized
- unknown fields outside the documented contract must fail validation
- forward-compatible or provider-specific data must live under `extensions`
- consumers may preserve unrecognized extension namespaces without interpreting them
- required semantics must never be inferred from unknown fields
- migration responsibility belongs to the package authoring or loading layer, not the Game Rules Engine

Expected type:
- `schemaVersion` must be a positive integer
- `packageVersion` must be an optional string revision token

Compatibility policy:
- backward-compatible additions may be accepted when they do not alter required contract behavior
- breaking changes must be versioned explicitly
- loader or bootstrap code must not guess at schema interpretation

Failure behavior:
- unsupported schema versions must stop package use
- missing required fields must stop package use
- unknown required semantics must not be downgraded into silent defaults

## 14. Complete Minimal Example
The following example shows the minimum shape of a valid season package.

In this example, `structureTypeRef` appears only on logical structure instances inside the external map data referenced by `mapDataRef`. The `mapDataContract.structureTypeRefField` tells the loader which field name to read, and `structureUnlocks.V1` resolves to the declared catalogue code `V1`.

```json
{
  "packageIdentity": {
    "schemaVersion": 1,
    "packageVersion": "1.0.0",
    "seasonId": "season-1",
    "displayName": "Season 1",
    "description": "Season 1 canonical package example",
    "seasonStatus": "active",
    "startDate": "2026-07-01T00:00:00Z",
    "endDate": null
  },
  "rulesDefinition": {
    "seasonIdentity": {
      "seasonId": "season-1",
      "seasonName": "Season 1",
      "kingdomNumber": 1
    },
    "metadata": {
      "timelineModel": "seasonal"
    },
    "mapDefinition": {
      "baseMapId": "season1-map",
      "dimensions": {
        "rows": 20,
        "columns": 20
      },
      "mapDataContract": {
        "cells": {
          "collectionField": "tiles",
          "collectionShape": "row_arrays",
          "identity": {
            "mode": "coordinates",
            "rowField": "row",
            "columnField": "col"
          },
          "structureTypeRefField": "code"
        },
        "structures": {
          "collectionField": "structures",
          "idField": "id",
          "typeRefField": "code",
          "footprint": {
            "mode": "rectangle",
            "rowField": "row",
            "columnField": "col",
            "rowSpanField": "rows",
            "columnSpanField": "cols"
          }
        }
      },
      "cellClassification": {
        "capturable": true,
        "blockedCellRefs": [],
        "decorativeCellRefs": [],
        "nonPlayableCellRefs": []
      },
      "structureFootprints": {},
      "mapDataRef": "data/season1-map.json"
    },
    "structureCatalog": [
      {
        "structureTypeId": "structure-type-v1",
        "code": "V1",
        "type": "Village",
        "level": 1,
        "capturable": true
      }
    ],
    "resourceModel": {
      "resourceId": "ice-crystals",
      "displayName": "Ice Crystals",
      "unit": "crystals",
      "metricType": "season-resource",
      "structureOutputs": {}
    },
    "scoringModel": {
      "calculationModelId": "season1-scoring-model",
      "configured": false,
      "resourceLabel": "Ice Crystals",
      "serverField": "iceCrystals",
      "unconfiguredLabel": "Scoring rules not configured"
    },
    "phaseModel": [
      {
        "id": "phase-1",
        "label": "Interactive Map",
        "status": "completed"
      }
    ],
    "structureUnlocks": {
      "V1": true
    },
    "captureRules": {
      "defaultCapturable": true,
      "byCode": {},
      "byType": {},
      "phaseRestrictions": []
    },
    "buffDefinitions": []
  },
  "applicationConfig": {
    "designatedUnionId": "union-0001",
    "dataSources": {
      "mapDataUrl": "data/season1-map.json",
      "seasonServerStateDataUrl": "data/season1-servers.json",
      "unionsDataUrl": "data/unions.json"
    },
    "workspace": {
      "homeId": "command-centre",
      "mapLabel": "Season 1 Blueprint"
    }
  },
  "externalRegistries": [
    {
      "registryId": "union-registry",
      "registryType": "union-registry",
      "sourceRef": "data/unions.json",
      "required": true
    }
  ],
  "extensions": {
    "exampleProvider": {
      "note": "Optional provider-specific extension data"
    }
  }
}
```

## 15. Migration History: Mapping from Former Flat Season 1 Definition
This historical mapping documents the migration from the former flat `SEASON_1_DEFINITION` contract to the canonical nested package. It is migration history, not the current source contract.

| Current flat field | Canonical package path | Notes |
| --- | --- | --- |
| `seasonIdentity.seasonId` | `packageIdentity.seasonId` and `rulesDefinition.seasonIdentity.seasonId` | Stable season identifier copied into both identity and rules context |
| `seasonIdentity.seasonName` | `packageIdentity.displayName` and `rulesDefinition.seasonIdentity.seasonName` | Display name and rules identity name |
| `seasonIdentity.kingdomNumber` | `rulesDefinition.seasonIdentity.kingdomNumber` | Season-specific numeric metadata |
| `metadata.timelineModel` | `rulesDefinition.metadata.timelineModel` | Season metadata |
| `mapDefinition.baseMapId` | `rulesDefinition.mapDefinition.baseMapId` | Stable map identifier |
| `mapDefinition.gridSize` | `rulesDefinition.mapDefinition.dimensions.rows` and `rulesDefinition.mapDefinition.dimensions.columns` | `gridSize: 20` migrates to `dimensions.rows: 20` and `dimensions.columns: 20` |
| `structureCatalog` | `rulesDefinition.structureCatalog` | Current catalogue entries become package-owned structure definitions |
| `scoringModel` | `rulesDefinition.scoringModel` | Current scoring is configured as a season rule object |
| `resourceModel` | `rulesDefinition.resourceModel` | Primary resource and outputs |
| `phaseModel` | `rulesDefinition.phaseModel` | Current phase list |
| `structureUnlocks` | `rulesDefinition.structureUnlocks` | Season-specific unlock availability |
| `captureRules` | `rulesDefinition.captureRules` | Current default capture behavior and overrides |
| `buffDefinitions` | `rulesDefinition.buffDefinitions` | Current Season 1 definition has no buffs |
| `appConfig.dataSources.mapDataUrl` | `applicationConfig.dataSources.mapDataUrl` | Required application configuration |
| `appConfig.dataSources.seasonServerStateDataUrl` | `applicationConfig.dataSources.seasonServerStateDataUrl` | Required application configuration |
| `appConfig.dataSources.unionsDataUrl` | `applicationConfig.dataSources.unionsDataUrl` | Required application configuration |
| `appConfig.workspace.homeId` | `applicationConfig.workspace.homeId` | Required application configuration |
| `appConfig.workspace.mapLabel` | `applicationConfig.workspace.mapLabel` | Required application configuration |

`applicationConfig.designatedUnionId` is a new optional canonical configuration value introduced after migration. It was not present in the former flat Season 1 definition and is therefore not migrated legacy data.

The map-data contract normalizes both collections into one internal model:
- `rulesDefinition.mapDefinition.mapDataContract.cells` supplies the stable logical cell identity and optional per-cell type reference
- `rulesDefinition.mapDefinition.mapDataContract.structures` supplies the stable logical structure identity and footprint resolution

Current supporting data files remain external package inputs:
- `data/season1-map.json` provides the shared base map, tiles, and structure placements.
- `data/season1-servers.json` provides per-server workspace records.
- `data/unions.json` provides the union registry used by labels and colors.

## 16. Explicit Exclusions
The following are intentionally excluded from this schema:
- live server ownership state
- persistence format decisions
- Season Loader implementation details
- JSON Schema code generation
- UI styling or layout rules
- screenshot ingestion implementation
- dashboard summary calculations beyond package shape
- strategic recommendations
- Season 2 mechanics
- hard-coded season conditionals
- storage-engine coupling
- renderer implementation details

## 17. Genuine Unresolved Questions
At the package contract level, no unresolved questions remain after the decisions recorded above.

Any loader-authoring policy questions, such as how migration tooling is organized, belong to the loader/authoring layer rather than this package schema.
