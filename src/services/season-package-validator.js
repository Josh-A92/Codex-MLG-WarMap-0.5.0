(function initializeSeasonPackageValidator(globalScope) {
  const SUPPORTED_SCHEMA_VERSION = 1;
  const ALLOWED_TOP_LEVEL_KEYS = ["packageIdentity", "rulesDefinition", "applicationConfig", "externalRegistries", "extensions"];
  const ALLOWED_PACKAGE_IDENTITY_KEYS = ["schemaVersion", "packageVersion", "seasonId", "displayName", "description", "seasonStatus", "startDate", "endDate"];
  const ALLOWED_RULES_KEYS = ["seasonIdentity", "metadata", "mapDefinition", "structureCatalog", "resourceModel", "scoringModel", "phaseModel", "structureUnlocks", "captureRules", "buffDefinitions"];
  const ALLOWED_SEASON_IDENTITY_KEYS = ["seasonId", "seasonName", "kingdomNumber"];
  const ALLOWED_MAP_DEFINITION_KEYS = ["baseMapId", "topologyType", "dimensions", "mapDataContract", "cellClassification", "structureFootprints", "mapDataRef", "additionalMapAnnotations", "decorativeMetadata", "regionLabels", "seasonNotes"];
  const ALLOWED_DIMENSIONS_KEYS = ["rows", "columns"];
  const ALLOWED_MAP_DATA_CONTRACT_TERRITORY_GRID_KEYS = ["cells", "structures"];
  const ALLOWED_MAP_DATA_CELL_KEYS = ["collectionField", "collectionShape", "identity", "structureTypeRefField"];
  const ALLOWED_MAP_DATA_CELL_IDENTITY_KEYS = ["mode", "idField", "rowField", "columnField"];
  const ALLOWED_MAP_DATA_STRUCTURE_KEYS = ["collectionField", "idField", "typeRefField", "footprint"];
  const ALLOWED_MAP_DATA_STRUCTURE_FOOTPRINT_KEYS = ["mode", "cellRefsField", "rowField", "columnField", "rowSpanField", "columnSpanField"];
  const ALLOWED_MAP_DATA_CONTRACT_STRATEGIC_NODE_NETWORK_KEYS = ["nodes", "connections"];
  const ALLOWED_NETWORK_NODE_CONTRACT_KEYS = ["collectionField", "identityField", "typeRefField", "positionField"];
  const ALLOWED_NETWORK_CONNECTION_CONTRACT_KEYS = ["collectionField", "identityField", "fromNodeRefField", "toNodeRefField"];
  const ALLOWED_TOPOLOGY_TYPES = ["territory_grid", "strategic_node_network"];
  const ALLOWED_COLLECTION_SHAPES = ["flat_array", "row_arrays"];
  const ALLOWED_CELL_IDENTITY_MODES = ["field", "coordinates"];
  const ALLOWED_FOOTPRINT_MODES = ["cell_refs", "rectangle"];
  const ALLOWED_CELL_CLASSIFICATION_KEYS = ["capturable", "blockedCellRefs", "decorativeCellRefs", "nonPlayableCellRefs"];
  const ALLOWED_STRUCTURE_CATALOG_KEYS = ["structureTypeId", "code", "type", "level", "capturable", "expectedCount", "firstCaptureReward", "unlockWeek", "categories", "assetKeys", "spriteKeys", "resourceReferences", "scoringReferences", "metadata"];
  const ALLOWED_RESOURCE_MODEL_KEYS = ["resourceId", "displayName", "unit", "metricType", "structureOutputs"];
  const ALLOWED_SCORING_MODEL_KEYS = ["calculationModelId", "configured", "resourceLabel", "serverField", "unconfiguredLabel"];
  const ALLOWED_PHASE_KEYS = ["id", "label", "status", "activationMode", "startAt", "endAt", "notes"];
  const ALLOWED_CAPTURE_RULES_KEYS = ["defaultCapturable", "byCode", "byType", "phaseRestrictions"];
  const ALLOWED_APPLICATION_CONFIG_KEYS = ["dataSources", "workspace", "designatedUnionId"];
  const ALLOWED_DATA_SOURCE_KEYS = ["mapDataUrl", "seasonServerStateDataUrl", "unionsDataUrl"];
  const ALLOWED_WORKSPACE_KEYS = ["homeId", "mapLabel"];
  const ALLOWED_EXTERNAL_REGISTRY_KEYS = ["registryId", "registryType", "sourceRef", "required", "expectedSchemaVersion"];

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function pushError(errors, code, path, message) {
    errors.push({
      code,
      path,
      message
    });
  }

  function checkUnknownFields(errors, value, allowedKeys, path) {
    Object.keys(value).forEach((key) => {
      if (!allowedKeys.includes(key)) {
        pushError(errors, "UNKNOWN_FIELD", path ? `${path}.${key}` : key, `Unknown field '${key}'.`);
      }
    });
  }

  function validateNonEmptyString(errors, value, path, label) {
    if (typeof value !== "string" || value.trim() === "") {
      pushError(errors, "INVALID_STRING", path, `${label} must be a non-empty string.`);
      return false;
    }

    return true;
  }

  function validateString(errors, value, path, label) {
    if (typeof value !== "string") {
      pushError(errors, "INVALID_STRING", path, `${label} must be a string.`);
      return false;
    }

    return true;
  }

  function validateBoolean(errors, value, path, label) {
    if (typeof value !== "boolean") {
      pushError(errors, "INVALID_BOOLEAN", path, `${label} must be a boolean.`);
      return false;
    }

    return true;
  }

  function validatePositiveInteger(errors, value, path, label) {
    if (!Number.isInteger(value) || value <= 0) {
      pushError(errors, "INVALID_INTEGER", path, `${label} must be a positive integer.`);
      return false;
    }

    return true;
  }

  function validateNonNegativeInteger(errors, value, path, label) {
    if (!Number.isInteger(value) || value < 0) {
      pushError(errors, "INVALID_INTEGER", path, `${label} must be a non-negative integer.`);
      return false;
    }

    return true;
  }

  function validateOptionalStringOrNull(errors, value, path, label) {
    if (value === null) {
      return true;
    }

    return validateString(errors, value, path, label);
  }

  function parseTimestamp(value) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }

  function validateStringArray(errors, value, path, label) {
    if (!Array.isArray(value)) {
      pushError(errors, "INVALID_ARRAY", path, `${label} must be an array.`);
      return false;
    }

    value.forEach((entry, index) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        pushError(errors, "INVALID_STRING", `${path}[${index}]`, `${label} items must be non-empty strings.`);
      }
    });

    return true;
  }

  function validateStringEnum(errors, value, path, label, allowedValues, errorCode) {
    if (!validateNonEmptyString(errors, value, path, label)) {
      return false;
    }

    if (!allowedValues.includes(value)) {
      pushError(errors, errorCode, path, `${label} must be one of ${allowedValues.join(", ")}.`);
      return false;
    }

    return true;
  }

  function validateTimestampOrNull(errors, value, path, label) {
    if (value === null) {
      return null;
    }

    if (!validateString(errors, value, path, label)) {
      return undefined;
    }

    const time = parseTimestamp(value);
    if (time === null) {
      pushError(errors, "INVALID_TIMESTAMP", path, `${label} must be a valid timestamp string or null.`);
      return undefined;
    }

    return time;
  }

  function validatePackageIdentity(packageIdentity, errors) {
    checkUnknownFields(errors, packageIdentity, ALLOWED_PACKAGE_IDENTITY_KEYS, "packageIdentity");

    if (!Object.prototype.hasOwnProperty.call(packageIdentity, "schemaVersion")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "packageIdentity.schemaVersion", "packageIdentity.schemaVersion is required.");
    } else if (validatePositiveInteger(errors, packageIdentity.schemaVersion, "packageIdentity.schemaVersion", "packageIdentity.schemaVersion")) {
      if (packageIdentity.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        pushError(errors, "UNSUPPORTED_SCHEMA_VERSION", "packageIdentity.schemaVersion", `Only schema version ${SUPPORTED_SCHEMA_VERSION} is supported.`);
      }
    }

    if (!Object.prototype.hasOwnProperty.call(packageIdentity, "seasonId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "packageIdentity.seasonId", "packageIdentity.seasonId is required.");
    } else {
      validateNonEmptyString(errors, packageIdentity.seasonId, "packageIdentity.seasonId", "packageIdentity.seasonId");
    }

    if (!Object.prototype.hasOwnProperty.call(packageIdentity, "displayName")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "packageIdentity.displayName", "packageIdentity.displayName is required.");
    } else {
      validateNonEmptyString(errors, packageIdentity.displayName, "packageIdentity.displayName", "packageIdentity.displayName");
    }

    if (!Object.prototype.hasOwnProperty.call(packageIdentity, "seasonStatus")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "packageIdentity.seasonStatus", "packageIdentity.seasonStatus is required.");
    } else {
      const seasonStatus = packageIdentity.seasonStatus;
      const allowedStatuses = ["draft", "planned", "active", "completed", "archived"];
      if (!validateNonEmptyString(errors, seasonStatus, "packageIdentity.seasonStatus", "packageIdentity.seasonStatus")) {
        return;
      }
      if (!allowedStatuses.includes(seasonStatus)) {
        pushError(errors, "INVALID_SEASON_STATUS", "packageIdentity.seasonStatus", "packageIdentity.seasonStatus must be one of draft, planned, active, completed, or archived.");
      }
    }

    if (Object.prototype.hasOwnProperty.call(packageIdentity, "packageVersion") && packageIdentity.packageVersion !== undefined) {
      validateString(errors, packageIdentity.packageVersion, "packageIdentity.packageVersion", "packageIdentity.packageVersion");
    }

    if (Object.prototype.hasOwnProperty.call(packageIdentity, "description") && packageIdentity.description !== undefined) {
      validateString(errors, packageIdentity.description, "packageIdentity.description", "packageIdentity.description");
    }

    const startDatePresent = Object.prototype.hasOwnProperty.call(packageIdentity, "startDate");
    const endDatePresent = Object.prototype.hasOwnProperty.call(packageIdentity, "endDate");
    let startDateTime = null;
    let endDateTime = null;

    if (startDatePresent) {
      const startDate = packageIdentity.startDate;
      if (validateOptionalStringOrNull(errors, startDate, "packageIdentity.startDate", "packageIdentity.startDate") && typeof startDate === "string") {
        startDateTime = parseTimestamp(startDate);
        if (startDateTime === null) {
          pushError(errors, "INVALID_DATE", "packageIdentity.startDate", "packageIdentity.startDate must be a valid timestamp string.");
        }
      }
    }

    if (endDatePresent) {
      const endDate = packageIdentity.endDate;
      if (validateOptionalStringOrNull(errors, endDate, "packageIdentity.endDate", "packageIdentity.endDate") && typeof endDate === "string") {
        endDateTime = parseTimestamp(endDate);
        if (endDateTime === null) {
          pushError(errors, "INVALID_DATE", "packageIdentity.endDate", "packageIdentity.endDate must be a valid timestamp string.");
        }
      }
    }

    if (startDateTime !== null && endDateTime !== null && startDateTime > endDateTime) {
      pushError(errors, "INVALID_DATE_ORDER", "packageIdentity.endDate", "packageIdentity.endDate must not be earlier than packageIdentity.startDate.");
    }
  }

  function validateSeasonIdentity(seasonIdentity, packageIdentity, errors) {
    checkUnknownFields(errors, seasonIdentity, ALLOWED_SEASON_IDENTITY_KEYS, "rulesDefinition.seasonIdentity");

    if (!Object.prototype.hasOwnProperty.call(seasonIdentity, "seasonId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.seasonIdentity.seasonId", "rulesDefinition.seasonIdentity.seasonId is required.");
      return;
    }

    if (!validateNonEmptyString(errors, seasonIdentity.seasonId, "rulesDefinition.seasonIdentity.seasonId", "rulesDefinition.seasonIdentity.seasonId")) {
      return;
    }

    if (packageIdentity && seasonIdentity.seasonId !== packageIdentity.seasonId) {
      pushError(errors, "MISMATCHED_SEASON_ID", "rulesDefinition.seasonIdentity.seasonId", "rulesDefinition.seasonIdentity.seasonId must match packageIdentity.seasonId.");
    }

    if (Object.prototype.hasOwnProperty.call(seasonIdentity, "seasonName") && seasonIdentity.seasonName !== undefined) {
      validateString(errors, seasonIdentity.seasonName, "rulesDefinition.seasonIdentity.seasonName", "rulesDefinition.seasonIdentity.seasonName");
    }

    if (Object.prototype.hasOwnProperty.call(seasonIdentity, "kingdomNumber") && seasonIdentity.kingdomNumber !== undefined) {
      validatePositiveInteger(errors, seasonIdentity.kingdomNumber, "rulesDefinition.seasonIdentity.kingdomNumber", "rulesDefinition.seasonIdentity.kingdomNumber");
    }
  }

  function validateMapDefinition(mapDefinition, errors) {
    checkUnknownFields(errors, mapDefinition, ALLOWED_MAP_DEFINITION_KEYS, "rulesDefinition.mapDefinition");

    if (!Object.prototype.hasOwnProperty.call(mapDefinition, "baseMapId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.baseMapId", "rulesDefinition.mapDefinition.baseMapId is required.");
    } else {
      validateNonEmptyString(errors, mapDefinition.baseMapId, "rulesDefinition.mapDefinition.baseMapId", "rulesDefinition.mapDefinition.baseMapId");
    }

    if (!Object.prototype.hasOwnProperty.call(mapDefinition, "dimensions") || !isPlainObject(mapDefinition.dimensions)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.dimensions", "rulesDefinition.mapDefinition.dimensions is required and must be an object.");
    } else {
      checkUnknownFields(errors, mapDefinition.dimensions, ALLOWED_DIMENSIONS_KEYS, "rulesDefinition.mapDefinition.dimensions");

      if (!Object.prototype.hasOwnProperty.call(mapDefinition.dimensions, "rows")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.dimensions.rows", "rulesDefinition.mapDefinition.dimensions.rows is required.");
      } else {
        validatePositiveInteger(errors, mapDefinition.dimensions.rows, "rulesDefinition.mapDefinition.dimensions.rows", "rulesDefinition.mapDefinition.dimensions.rows");
      }

      if (!Object.prototype.hasOwnProperty.call(mapDefinition.dimensions, "columns")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.dimensions.columns", "rulesDefinition.mapDefinition.dimensions.columns is required.");
      } else {
        validatePositiveInteger(errors, mapDefinition.dimensions.columns, "rulesDefinition.mapDefinition.dimensions.columns", "rulesDefinition.mapDefinition.dimensions.columns");
      }
    }

    let topologyType = null;
    if (!Object.prototype.hasOwnProperty.call(mapDefinition, "topologyType")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.topologyType", "rulesDefinition.mapDefinition.topologyType is required.");
    } else if (validateStringEnum(
      errors,
      mapDefinition.topologyType,
      "rulesDefinition.mapDefinition.topologyType",
      "rulesDefinition.mapDefinition.topologyType",
      ALLOWED_TOPOLOGY_TYPES,
      "INVALID_TOPOLOGY_TYPE"
    )) {
      topologyType = mapDefinition.topologyType;
    }

    if (!Object.prototype.hasOwnProperty.call(mapDefinition, "mapDataContract") || !isPlainObject(mapDefinition.mapDataContract)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.mapDataContract", "rulesDefinition.mapDefinition.mapDataContract is required and must be an object.");
    } else if (topologyType === "territory_grid") {
      validateTerritoryGridMapDataContract(mapDefinition.mapDataContract, errors, "rulesDefinition.mapDefinition.mapDataContract");
    } else if (topologyType === "strategic_node_network") {
      validateStrategicNodeNetworkMapDataContract(mapDefinition.mapDataContract, errors, "rulesDefinition.mapDefinition.mapDataContract");
    }

    if (topologyType === "territory_grid") {
      if (!Object.prototype.hasOwnProperty.call(mapDefinition, "cellClassification") || !isPlainObject(mapDefinition.cellClassification)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.cellClassification", "rulesDefinition.mapDefinition.cellClassification is required and must be an object.");
      } else {
        checkUnknownFields(errors, mapDefinition.cellClassification, ALLOWED_CELL_CLASSIFICATION_KEYS, "rulesDefinition.mapDefinition.cellClassification");

        if (!Object.prototype.hasOwnProperty.call(mapDefinition.cellClassification, "capturable")) {
          pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.cellClassification.capturable", "rulesDefinition.mapDefinition.cellClassification.capturable is required.");
        } else {
          validateBoolean(errors, mapDefinition.cellClassification.capturable, "rulesDefinition.mapDefinition.cellClassification.capturable", "rulesDefinition.mapDefinition.cellClassification.capturable");
        }

        ["blockedCellRefs", "decorativeCellRefs", "nonPlayableCellRefs"].forEach((fieldName) => {
          if (!Object.prototype.hasOwnProperty.call(mapDefinition.cellClassification, fieldName)) {
            pushError(errors, "MISSING_REQUIRED_FIELD", `rulesDefinition.mapDefinition.cellClassification.${fieldName}`, `rulesDefinition.mapDefinition.cellClassification.${fieldName} is required.`);
            return;
          }

          validateStringArray(errors, mapDefinition.cellClassification[fieldName], `rulesDefinition.mapDefinition.cellClassification.${fieldName}`, `rulesDefinition.mapDefinition.cellClassification.${fieldName}`);
        });
      }

      if (!Object.prototype.hasOwnProperty.call(mapDefinition, "structureFootprints") || !isPlainObject(mapDefinition.structureFootprints)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.structureFootprints", "rulesDefinition.mapDefinition.structureFootprints is required and must be an object.");
      }
    }

    if (topologyType === "strategic_node_network") {
      if (Object.prototype.hasOwnProperty.call(mapDefinition, "cellClassification")) {
        pushError(errors, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.cellClassification", "cellClassification is not allowed for strategic_node_network topology.");
      }

      if (Object.prototype.hasOwnProperty.call(mapDefinition, "structureFootprints")) {
        pushError(errors, "UNKNOWN_FIELD", "rulesDefinition.mapDefinition.structureFootprints", "structureFootprints is not allowed for strategic_node_network topology.");
      }
    }

    if (!Object.prototype.hasOwnProperty.call(mapDefinition, "mapDataRef")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition.mapDataRef", "rulesDefinition.mapDefinition.mapDataRef is required.");
    } else {
      validateNonEmptyString(errors, mapDefinition.mapDataRef, "rulesDefinition.mapDefinition.mapDataRef", "rulesDefinition.mapDefinition.mapDataRef");
    }
  }

  function validateStructureCatalog(structureCatalog, errors) {
    if (!Array.isArray(structureCatalog)) {
      pushError(errors, "INVALID_ARRAY", "rulesDefinition.structureCatalog", "rulesDefinition.structureCatalog must be an array.");
      return {
        codes: new Set(),
        typeIds: new Set(),
        types: new Set()
      };
    }

    const seenStructureTypeIds = new Set();
    const seenCodes = new Set();
    const seenTypes = new Set();

    structureCatalog.forEach((entry, index) => {
      const path = `rulesDefinition.structureCatalog[${index}]`;

      if (!isPlainObject(entry)) {
        pushError(errors, "INVALID_OBJECT", path, "Structure catalogue entries must be objects.");
        return;
      }

      checkUnknownFields(errors, entry, ALLOWED_STRUCTURE_CATALOG_KEYS, path);

      if (!Object.prototype.hasOwnProperty.call(entry, "structureTypeId")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.structureTypeId`, `${path}.structureTypeId is required.`);
      } else if (validateNonEmptyString(errors, entry.structureTypeId, `${path}.structureTypeId`, `${path}.structureTypeId`)) {
        if (seenStructureTypeIds.has(entry.structureTypeId)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.structureTypeId`, `Duplicate structureTypeId '${entry.structureTypeId}'.`);
        }
        seenStructureTypeIds.add(entry.structureTypeId);
      }

      if (!Object.prototype.hasOwnProperty.call(entry, "code")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.code`, `${path}.code is required.`);
      } else if (validateNonEmptyString(errors, entry.code, `${path}.code`, `${path}.code`)) {
        if (seenCodes.has(entry.code)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.code`, `Duplicate structure code '${entry.code}'.`);
        }
        seenCodes.add(entry.code);
      }

      if (!Object.prototype.hasOwnProperty.call(entry, "type")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.type`, `${path}.type is required.`);
      } else {
        validateNonEmptyString(errors, entry.type, `${path}.type`, `${path}.type`);
        if (typeof entry.type === "string" && entry.type.trim() !== "") {
          seenTypes.add(entry.type);
        }
      }

      if (Object.prototype.hasOwnProperty.call(entry, "level") && entry.level !== undefined) {
        validatePositiveInteger(errors, entry.level, `${path}.level`, `${path}.level`);
      }

      if (Object.prototype.hasOwnProperty.call(entry, "expectedCount") && entry.expectedCount !== undefined) {
        validatePositiveInteger(errors, entry.expectedCount, `${path}.expectedCount`, `${path}.expectedCount`);
      }

      if (Object.prototype.hasOwnProperty.call(entry, "firstCaptureReward") && entry.firstCaptureReward !== undefined) {
        validateNonNegativeInteger(errors, entry.firstCaptureReward, `${path}.firstCaptureReward`, `${path}.firstCaptureReward`);
      }

      if (Object.prototype.hasOwnProperty.call(entry, "unlockWeek") && entry.unlockWeek !== undefined) {
        validatePositiveInteger(errors, entry.unlockWeek, `${path}.unlockWeek`, `${path}.unlockWeek`);
      }

      if (!Object.prototype.hasOwnProperty.call(entry, "capturable")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.capturable`, `${path}.capturable is required.`);
      } else {
        validateBoolean(errors, entry.capturable, `${path}.capturable`, `${path}.capturable`);
      }

      if (Object.prototype.hasOwnProperty.call(entry, "structureTypeRef")) {
        pushError(errors, "UNKNOWN_FIELD", `${path}.structureTypeRef`, "Catalogue entries must not contain structureTypeRef.");
      }

      ["categories", "assetKeys", "spriteKeys", "resourceReferences", "scoringReferences"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(entry, fieldName) && entry[fieldName] !== undefined) {
          validateStringArray(errors, entry[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`);
        }
      });

      if (Object.prototype.hasOwnProperty.call(entry, "metadata") && entry.metadata !== undefined) {
        if (!isPlainObject(entry.metadata)) {
          pushError(errors, "INVALID_OBJECT", `${path}.metadata`, `${path}.metadata must be a plain object.`);
        }
      }
    });

    return {
      codes: seenCodes,
      typeIds: seenStructureTypeIds,
      types: seenTypes
    };
  }

  function validateMapDataContractCells(cells, errors, path) {
    checkUnknownFields(errors, cells, ALLOWED_MAP_DATA_CELL_KEYS, path);

    if (!Object.prototype.hasOwnProperty.call(cells, "collectionField")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.collectionField`, `${path}.collectionField is required.`);
    } else {
      validateNonEmptyString(errors, cells.collectionField, `${path}.collectionField`, `${path}.collectionField`);
    }

    if (!Object.prototype.hasOwnProperty.call(cells, "collectionShape")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.collectionShape`, `${path}.collectionShape is required.`);
    } else {
      validateStringEnum(errors, cells.collectionShape, `${path}.collectionShape`, `${path}.collectionShape`, ALLOWED_COLLECTION_SHAPES, "INVALID_COLLECTION_SHAPE");
    }

    if (!Object.prototype.hasOwnProperty.call(cells, "identity") || !isPlainObject(cells.identity)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.identity`, `${path}.identity is required and must be an object.`);
      return;
    }

    checkUnknownFields(errors, cells.identity, ALLOWED_MAP_DATA_CELL_IDENTITY_KEYS, `${path}.identity`);

    if (!Object.prototype.hasOwnProperty.call(cells.identity, "mode")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.identity.mode`, `${path}.identity.mode is required.`);
      return;
    }

    if (!validateStringEnum(errors, cells.identity.mode, `${path}.identity.mode`, `${path}.identity.mode`, ALLOWED_CELL_IDENTITY_MODES, "UNKNOWN_IDENTITY_MODE")) {
      return;
    }

    if (cells.identity.mode === "field") {
      if (!Object.prototype.hasOwnProperty.call(cells.identity, "idField")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.identity.idField`, `${path}.identity.idField is required when mode is field.`);
      } else {
        validateNonEmptyString(errors, cells.identity.idField, `${path}.identity.idField`, `${path}.identity.idField`);
      }

      ["rowField", "columnField"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(cells.identity, fieldName)) {
          pushError(errors, "FIELD_NOT_ALLOWED_FOR_MODE", `${path}.identity.${fieldName}`, `${path}.identity.${fieldName} is not allowed when mode is field.`);
        }
      });
    }

    if (cells.identity.mode === "coordinates") {
      ["rowField", "columnField"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(cells.identity, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.identity.${fieldName}`, `${path}.identity.${fieldName} is required when mode is coordinates.`);
        } else {
          validateNonEmptyString(errors, cells.identity[fieldName], `${path}.identity.${fieldName}`, `${path}.identity.${fieldName}`);
        }
      });

      if (Object.prototype.hasOwnProperty.call(cells.identity, "idField")) {
        pushError(errors, "FIELD_NOT_ALLOWED_FOR_MODE", `${path}.identity.idField`, `${path}.identity.idField is not allowed when mode is coordinates.`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(cells, "structureTypeRefField") && cells.structureTypeRefField !== undefined) {
      validateNonEmptyString(errors, cells.structureTypeRefField, `${path}.structureTypeRefField`, `${path}.structureTypeRefField`);
    }
  }

  function validateMapDataContractStructures(structures, errors, path) {
    checkUnknownFields(errors, structures, ALLOWED_MAP_DATA_STRUCTURE_KEYS, path);

    ["collectionField", "idField", "typeRefField"].forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(structures, fieldName)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.${fieldName}`, `${path}.${fieldName} is required.`);
        return;
      }

      validateNonEmptyString(errors, structures[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`);
    });

    if (!Object.prototype.hasOwnProperty.call(structures, "footprint") || !isPlainObject(structures.footprint)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.footprint`, `${path}.footprint is required and must be an object.`);
      return;
    }

    checkUnknownFields(errors, structures.footprint, ALLOWED_MAP_DATA_STRUCTURE_FOOTPRINT_KEYS, `${path}.footprint`);

    if (!Object.prototype.hasOwnProperty.call(structures.footprint, "mode")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.footprint.mode`, `${path}.footprint.mode is required.`);
      return;
    }

    if (!validateStringEnum(errors, structures.footprint.mode, `${path}.footprint.mode`, `${path}.footprint.mode`, ALLOWED_FOOTPRINT_MODES, "UNKNOWN_FOOTPRINT_MODE")) {
      return;
    }

    if (structures.footprint.mode === "cell_refs") {
      if (!Object.prototype.hasOwnProperty.call(structures.footprint, "cellRefsField")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.footprint.cellRefsField`, `${path}.footprint.cellRefsField is required when mode is cell_refs.`);
      } else {
        validateNonEmptyString(errors, structures.footprint.cellRefsField, `${path}.footprint.cellRefsField`, `${path}.footprint.cellRefsField`);
      }

      ["rowField", "columnField", "rowSpanField", "columnSpanField"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(structures.footprint, fieldName)) {
          pushError(errors, "FIELD_NOT_ALLOWED_FOR_MODE", `${path}.footprint.${fieldName}`, `${path}.footprint.${fieldName} is not allowed when mode is cell_refs.`);
        }
      });
    }

    if (structures.footprint.mode === "rectangle") {
      ["rowField", "columnField", "rowSpanField", "columnSpanField"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(structures.footprint, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.footprint.${fieldName}`, `${path}.footprint.${fieldName} is required when mode is rectangle.`);
        } else {
          validateNonEmptyString(errors, structures.footprint[fieldName], `${path}.footprint.${fieldName}`, `${path}.footprint.${fieldName}`);
        }
      });

      if (Object.prototype.hasOwnProperty.call(structures.footprint, "cellRefsField")) {
        pushError(errors, "FIELD_NOT_ALLOWED_FOR_MODE", `${path}.footprint.cellRefsField`, `${path}.footprint.cellRefsField is not allowed when mode is rectangle.`);
      }
    }
  }

  function validateTerritoryGridMapDataContract(mapDataContract, errors, path) {
    checkUnknownFields(errors, mapDataContract, ALLOWED_MAP_DATA_CONTRACT_TERRITORY_GRID_KEYS, path);

    if (!Object.prototype.hasOwnProperty.call(mapDataContract, "cells") || !isPlainObject(mapDataContract.cells)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.cells`, `${path}.cells is required and must be an object.`);
    } else {
      validateMapDataContractCells(mapDataContract.cells, errors, `${path}.cells`);
    }

    if (!Object.prototype.hasOwnProperty.call(mapDataContract, "structures") || !isPlainObject(mapDataContract.structures)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.structures`, `${path}.structures is required and must be an object.`);
    } else {
      validateMapDataContractStructures(mapDataContract.structures, errors, `${path}.structures`);
    }
  }

  function validateStrategicNodeNetworkSection(section, errors, path, requiredFields) {
    checkUnknownFields(errors, section, requiredFields, path);

    requiredFields.forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(section, fieldName)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.${fieldName}`, `${path}.${fieldName} is required.`);
        return;
      }

      validateNonEmptyString(errors, section[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`);
    });
  }

  function validateStrategicNodeNetworkMapDataContract(mapDataContract, errors, path) {
    checkUnknownFields(errors, mapDataContract, ALLOWED_MAP_DATA_CONTRACT_STRATEGIC_NODE_NETWORK_KEYS, path);

    if (!Object.prototype.hasOwnProperty.call(mapDataContract, "nodes") || !isPlainObject(mapDataContract.nodes)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.nodes`, `${path}.nodes is required and must be an object.`);
    } else {
      validateStrategicNodeNetworkSection(
        mapDataContract.nodes,
        errors,
        `${path}.nodes`,
        ALLOWED_NETWORK_NODE_CONTRACT_KEYS
      );
    }

    if (!Object.prototype.hasOwnProperty.call(mapDataContract, "connections") || !isPlainObject(mapDataContract.connections)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.connections`, `${path}.connections is required and must be an object.`);
    } else {
      validateStrategicNodeNetworkSection(
        mapDataContract.connections,
        errors,
        `${path}.connections`,
        ALLOWED_NETWORK_CONNECTION_CONTRACT_KEYS
      );
    }
  }

  function validateResourceModel(resourceModel, errors) {
    checkUnknownFields(errors, resourceModel, ALLOWED_RESOURCE_MODEL_KEYS, "rulesDefinition.resourceModel");

    ["resourceId", "displayName", "unit", "metricType"].forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(resourceModel, fieldName)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `rulesDefinition.resourceModel.${fieldName}`, `rulesDefinition.resourceModel.${fieldName} is required.`);
        return;
      }

      validateNonEmptyString(errors, resourceModel[fieldName], `rulesDefinition.resourceModel.${fieldName}`, `rulesDefinition.resourceModel.${fieldName}`);
    });

    if (!Object.prototype.hasOwnProperty.call(resourceModel, "structureOutputs") || !isPlainObject(resourceModel.structureOutputs)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.resourceModel.structureOutputs", "rulesDefinition.resourceModel.structureOutputs is required and must be an object.");
    }
  }

  function validateScoringModel(scoringModel, errors) {
    checkUnknownFields(errors, scoringModel, ALLOWED_SCORING_MODEL_KEYS, "rulesDefinition.scoringModel");

    if (!Object.prototype.hasOwnProperty.call(scoringModel, "calculationModelId")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.scoringModel.calculationModelId", "rulesDefinition.scoringModel.calculationModelId is required.");
    } else {
      validateNonEmptyString(errors, scoringModel.calculationModelId, "rulesDefinition.scoringModel.calculationModelId", "rulesDefinition.scoringModel.calculationModelId");
    }

    if (!Object.prototype.hasOwnProperty.call(scoringModel, "configured")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.scoringModel.configured", "rulesDefinition.scoringModel.configured is required.");
    } else {
      validateBoolean(errors, scoringModel.configured, "rulesDefinition.scoringModel.configured", "rulesDefinition.scoringModel.configured");
    }

    if (Object.prototype.hasOwnProperty.call(scoringModel, "resourceLabel") && scoringModel.resourceLabel !== undefined) {
      validateString(errors, scoringModel.resourceLabel, "rulesDefinition.scoringModel.resourceLabel", "rulesDefinition.scoringModel.resourceLabel");
    }

    if (Object.prototype.hasOwnProperty.call(scoringModel, "serverField") && scoringModel.serverField !== undefined) {
      validateString(errors, scoringModel.serverField, "rulesDefinition.scoringModel.serverField", "rulesDefinition.scoringModel.serverField");
    }

    if (Object.prototype.hasOwnProperty.call(scoringModel, "unconfiguredLabel") && scoringModel.unconfiguredLabel !== undefined) {
      validateString(errors, scoringModel.unconfiguredLabel, "rulesDefinition.scoringModel.unconfiguredLabel", "rulesDefinition.scoringModel.unconfiguredLabel");
    }
  }

  function validatePhaseModel(phaseModel, errors) {
    if (!Array.isArray(phaseModel)) {
      pushError(errors, "INVALID_ARRAY", "rulesDefinition.phaseModel", "rulesDefinition.phaseModel must be an array.");
      return new Set();
    }

    const seenPhaseIds = new Set();

    phaseModel.forEach((phase, index) => {
      const path = `rulesDefinition.phaseModel[${index}]`;

      if (!isPlainObject(phase)) {
        pushError(errors, "INVALID_OBJECT", path, "Phase entries must be objects.");
        return;
      }

      checkUnknownFields(errors, phase, ALLOWED_PHASE_KEYS, path);

      ["id", "label", "status"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(phase, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.${fieldName}`, `${path}.${fieldName} is required.`);
          return;
        }

        validateNonEmptyString(errors, phase[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`);
      });

      if (typeof phase.id === "string" && phase.id.trim() !== "") {
        if (seenPhaseIds.has(phase.id)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.id`, `Duplicate phase id '${phase.id}'.`);
        }
        seenPhaseIds.add(phase.id);
      }

      if (Object.prototype.hasOwnProperty.call(phase, "activationMode") && phase.activationMode !== undefined) {
        if (validateNonEmptyString(errors, phase.activationMode, `${path}.activationMode`, `${path}.activationMode`)) {
          const allowedActivationModes = ["manual", "scheduled", "evidence_confirmed"];
          if (!allowedActivationModes.includes(phase.activationMode)) {
            pushError(errors, "INVALID_PHASE_ACTIVATION_MODE", `${path}.activationMode`, `${path}.activationMode must be manual, scheduled, or evidence_confirmed.`);
          }
        }
      }

      let startAtTime = null;
      let endAtTime = null;

      if (Object.prototype.hasOwnProperty.call(phase, "startAt") && phase.startAt !== undefined) {
        startAtTime = validateTimestampOrNull(errors, phase.startAt, `${path}.startAt`, `${path}.startAt`);
      }

      if (Object.prototype.hasOwnProperty.call(phase, "endAt") && phase.endAt !== undefined) {
        endAtTime = validateTimestampOrNull(errors, phase.endAt, `${path}.endAt`, `${path}.endAt`);
      }

      if (startAtTime !== null && startAtTime !== undefined && endAtTime !== null && endAtTime !== undefined && endAtTime < startAtTime) {
        pushError(errors, "INVALID_DATE_ORDER", `${path}.endAt`, `${path}.endAt must not be earlier than ${path}.startAt.`);
      }

      if (Object.prototype.hasOwnProperty.call(phase, "notes") && phase.notes !== undefined) {
        validateString(errors, phase.notes, `${path}.notes`, `${path}.notes`);
      }
    });

    return seenPhaseIds;
  }

  function validateStructureUnlocks(structureUnlocks, structureCatalogLookup, errors) {
    Object.keys(structureUnlocks).forEach((key) => {
      if (!validateNonEmptyString(errors, key, `rulesDefinition.structureUnlocks.${key}`, `rulesDefinition.structureUnlocks.${key}`)) {
        return;
      }

      const isKnownCode = structureCatalogLookup.codes.has(key);
      const isKnownTypeId = structureCatalogLookup.typeIds.has(key);
      if (!isKnownCode && !isKnownTypeId) {
        pushError(errors, "UNRESOLVED_UNLOCK_REFERENCE", `rulesDefinition.structureUnlocks.${key}`, `structureUnlocks key '${key}' does not resolve to a declared structure code or structureTypeId.`);
      }

      if (typeof structureUnlocks[key] !== "boolean") {
        pushError(errors, "INVALID_BOOLEAN", `rulesDefinition.structureUnlocks.${key}`, `structureUnlocks['${key}'] must be a boolean.`);
      }
    });
  }

  function resolveStructureReference(reference, structureCatalogLookup) {
    if (structureCatalogLookup.codes.has(reference) || structureCatalogLookup.typeIds.has(reference) || structureCatalogLookup.types.has(reference)) {
      return true;
    }

    return false;
  }

  function validateCaptureRules(captureRules, structureCatalogLookup, phaseIds, errors) {
    checkUnknownFields(errors, captureRules, ALLOWED_CAPTURE_RULES_KEYS, "rulesDefinition.captureRules");

    if (!Object.prototype.hasOwnProperty.call(captureRules, "defaultCapturable")) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.captureRules.defaultCapturable", "rulesDefinition.captureRules.defaultCapturable is required.");
    } else {
      validateBoolean(errors, captureRules.defaultCapturable, "rulesDefinition.captureRules.defaultCapturable", "rulesDefinition.captureRules.defaultCapturable");
    }

    ["byCode", "byType"].forEach((fieldName) => {
      if (!Object.prototype.hasOwnProperty.call(captureRules, fieldName) || !isPlainObject(captureRules[fieldName])) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `rulesDefinition.captureRules.${fieldName}`, `rulesDefinition.captureRules.${fieldName} is required and must be an object.`);
        return;
      }

      Object.keys(captureRules[fieldName]).forEach((key) => {
        if (!resolveStructureReference(key, structureCatalogLookup)) {
          pushError(errors, "UNRESOLVED_CAPTURE_OVERRIDE_REFERENCE", `rulesDefinition.captureRules.${fieldName}.${key}`, `Capture override key '${key}' does not resolve to a declared structure code, type, or structureTypeId.`);
        }

        if (typeof captureRules[fieldName][key] !== "boolean") {
          pushError(errors, "INVALID_BOOLEAN", `rulesDefinition.captureRules.${fieldName}.${key}`, `Capture override '${key}' must be a boolean.`);
        }
      });
    });

    if (!Object.prototype.hasOwnProperty.call(captureRules, "phaseRestrictions") || !Array.isArray(captureRules.phaseRestrictions)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.captureRules.phaseRestrictions", "rulesDefinition.captureRules.phaseRestrictions is required and must be an array.");
      return;
    }

    captureRules.phaseRestrictions.forEach((restriction, index) => {
      const path = `rulesDefinition.captureRules.phaseRestrictions[${index}]`;
      if (!isPlainObject(restriction)) {
        pushError(errors, "INVALID_OBJECT", path, "Capture phase restriction entries must be objects.");
        return;
      }

      if (Object.prototype.hasOwnProperty.call(restriction, "phaseId") && restriction.phaseId !== undefined) {
        if (!validateNonEmptyString(errors, restriction.phaseId, `${path}.phaseId`, `${path}.phaseId`)) {
          return;
        }

        if (!phaseIds.has(restriction.phaseId)) {
          pushError(errors, "UNRESOLVED_CAPTURE_OVERRIDE_REFERENCE", `${path}.phaseId`, `phaseId '${restriction.phaseId}' does not resolve to a declared phase id.`);
        }
      }

      ["structureCode", "structureTypeId", "structureTypeRef", "type", "structureId"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(restriction, fieldName) && restriction[fieldName] !== undefined) {
          if (!validateNonEmptyString(errors, restriction[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`)) {
            return;
          }

          if (!resolveStructureReference(restriction[fieldName], structureCatalogLookup)) {
            pushError(errors, "UNRESOLVED_CAPTURE_OVERRIDE_REFERENCE", `${path}.${fieldName}`, `${fieldName} '${restriction[fieldName]}' does not resolve to a declared structure identifier.`);
          }
        }
      });
    });
  }

  function validateApplicationConfig(applicationConfig, errors) {
    checkUnknownFields(errors, applicationConfig, ALLOWED_APPLICATION_CONFIG_KEYS, "applicationConfig");

    if (Object.prototype.hasOwnProperty.call(applicationConfig, "designatedUnionId")) {
      validateNonEmptyString(
        errors,
        applicationConfig.designatedUnionId,
        "applicationConfig.designatedUnionId",
        "applicationConfig.designatedUnionId"
      );
    }

    if (!Object.prototype.hasOwnProperty.call(applicationConfig, "dataSources") || !isPlainObject(applicationConfig.dataSources)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "applicationConfig.dataSources", "applicationConfig.dataSources is required and must be an object.");
    } else {
      checkUnknownFields(errors, applicationConfig.dataSources, ALLOWED_DATA_SOURCE_KEYS, "applicationConfig.dataSources");

      ["mapDataUrl", "seasonServerStateDataUrl", "unionsDataUrl"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(applicationConfig.dataSources, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `applicationConfig.dataSources.${fieldName}`, `applicationConfig.dataSources.${fieldName} is required.`);
          return;
        }

        validateNonEmptyString(errors, applicationConfig.dataSources[fieldName], `applicationConfig.dataSources.${fieldName}`, `applicationConfig.dataSources.${fieldName}`);
      });
    }

    if (!Object.prototype.hasOwnProperty.call(applicationConfig, "workspace") || !isPlainObject(applicationConfig.workspace)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "applicationConfig.workspace", "applicationConfig.workspace is required and must be an object.");
    } else {
      checkUnknownFields(errors, applicationConfig.workspace, ALLOWED_WORKSPACE_KEYS, "applicationConfig.workspace");

      ["homeId", "mapLabel"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(applicationConfig.workspace, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `applicationConfig.workspace.${fieldName}`, `applicationConfig.workspace.${fieldName} is required.`);
          return;
        }

        validateNonEmptyString(errors, applicationConfig.workspace[fieldName], `applicationConfig.workspace.${fieldName}`, `applicationConfig.workspace.${fieldName}`);
      });
    }
  }

  function validateExternalRegistries(externalRegistries, errors) {
    if (externalRegistries === undefined) {
      return;
    }

    if (!Array.isArray(externalRegistries)) {
      pushError(errors, "INVALID_ARRAY", "externalRegistries", "externalRegistries must be an array when present.");
      return;
    }

    const seenRegistryIds = new Set();

    externalRegistries.forEach((registry, index) => {
      const path = `externalRegistries[${index}]`;

      if (!isPlainObject(registry)) {
        pushError(errors, "INVALID_OBJECT", path, "External registry entries must be objects.");
        return;
      }

      checkUnknownFields(errors, registry, ALLOWED_EXTERNAL_REGISTRY_KEYS, path);

      ["registryId", "registryType", "sourceRef"].forEach((fieldName) => {
        if (!Object.prototype.hasOwnProperty.call(registry, fieldName)) {
          pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.${fieldName}`, `${path}.${fieldName} is required.`);
          return;
        }

        validateNonEmptyString(errors, registry[fieldName], `${path}.${fieldName}`, `${path}.${fieldName}`);
      });

      if (!Object.prototype.hasOwnProperty.call(registry, "required")) {
        pushError(errors, "MISSING_REQUIRED_FIELD", `${path}.required`, `${path}.required is required.`);
      } else {
        validateBoolean(errors, registry.required, `${path}.required`, `${path}.required`);
      }

      if (Object.prototype.hasOwnProperty.call(registry, "expectedSchemaVersion") && registry.expectedSchemaVersion !== undefined) {
        validatePositiveInteger(errors, registry.expectedSchemaVersion, `${path}.expectedSchemaVersion`, `${path}.expectedSchemaVersion`);
      }

      if (typeof registry.registryId === "string" && registry.registryId.trim() !== "") {
        if (seenRegistryIds.has(registry.registryId)) {
          pushError(errors, "DUPLICATE_IDENTIFIER", `${path}.registryId`, `Duplicate external registry id '${registry.registryId}'.`);
        }
        seenRegistryIds.add(registry.registryId);
      }
    });
  }

  function validateSeasonPackage(candidate) {
    const errors = [];

    if (!isPlainObject(candidate)) {
      pushError(errors, "INVALID_CANDIDATE_TYPE", "", "Season package candidate must be a plain object.");
      return {
        valid: false,
        errors,
        warnings: []
      };
    }

    checkUnknownFields(errors, candidate, ALLOWED_TOP_LEVEL_KEYS, "");

    if (!Object.prototype.hasOwnProperty.call(candidate, "packageIdentity") || !isPlainObject(candidate.packageIdentity)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "packageIdentity", "packageIdentity is required and must be an object.");
    } else {
      validatePackageIdentity(candidate.packageIdentity, errors);
    }

    if (!Object.prototype.hasOwnProperty.call(candidate, "rulesDefinition") || !isPlainObject(candidate.rulesDefinition)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition", "rulesDefinition is required and must be an object.");
    }

    if (!Object.prototype.hasOwnProperty.call(candidate, "applicationConfig") || !isPlainObject(candidate.applicationConfig)) {
      pushError(errors, "MISSING_REQUIRED_FIELD", "applicationConfig", "applicationConfig is required and must be an object.");
    }

    if (candidate.rulesDefinition && isPlainObject(candidate.rulesDefinition)) {
      checkUnknownFields(errors, candidate.rulesDefinition, ALLOWED_RULES_KEYS, "rulesDefinition");

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "seasonIdentity") || !isPlainObject(candidate.rulesDefinition.seasonIdentity)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.seasonIdentity", "rulesDefinition.seasonIdentity is required and must be an object.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "metadata") || !isPlainObject(candidate.rulesDefinition.metadata)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.metadata", "rulesDefinition.metadata is required and must be an object.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "mapDefinition") || !isPlainObject(candidate.rulesDefinition.mapDefinition)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.mapDefinition", "rulesDefinition.mapDefinition is required and must be an object.");
      }

      const structureCatalogLookup = validateStructureCatalog(candidate.rulesDefinition.structureCatalog, errors);

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "resourceModel") || !isPlainObject(candidate.rulesDefinition.resourceModel)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.resourceModel", "rulesDefinition.resourceModel is required and must be an object.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "scoringModel") || !isPlainObject(candidate.rulesDefinition.scoringModel)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.scoringModel", "rulesDefinition.scoringModel is required and must be an object.");
      }

      const phaseIds = validatePhaseModel(candidate.rulesDefinition.phaseModel, errors);

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "structureUnlocks") || !isPlainObject(candidate.rulesDefinition.structureUnlocks)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.structureUnlocks", "rulesDefinition.structureUnlocks is required and must be an object.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "captureRules") || !isPlainObject(candidate.rulesDefinition.captureRules)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.captureRules", "rulesDefinition.captureRules is required and must be an object.");
      }

      if (!Object.prototype.hasOwnProperty.call(candidate.rulesDefinition, "buffDefinitions") || !Array.isArray(candidate.rulesDefinition.buffDefinitions)) {
        pushError(errors, "MISSING_REQUIRED_FIELD", "rulesDefinition.buffDefinitions", "rulesDefinition.buffDefinitions is required and must be an array.");
      }

      if (candidate.rulesDefinition.seasonIdentity && isPlainObject(candidate.rulesDefinition.seasonIdentity)) {
        validateSeasonIdentity(candidate.rulesDefinition.seasonIdentity, candidate.packageIdentity || {}, errors);
      }

      if (candidate.rulesDefinition.mapDefinition && isPlainObject(candidate.rulesDefinition.mapDefinition)) {
        validateMapDefinition(candidate.rulesDefinition.mapDefinition, errors);
      }

      if (candidate.rulesDefinition.resourceModel && isPlainObject(candidate.rulesDefinition.resourceModel)) {
        validateResourceModel(candidate.rulesDefinition.resourceModel, errors);
      }

      if (candidate.rulesDefinition.scoringModel && isPlainObject(candidate.rulesDefinition.scoringModel)) {
        validateScoringModel(candidate.rulesDefinition.scoringModel, errors);
      }

      if (candidate.rulesDefinition.structureUnlocks && isPlainObject(candidate.rulesDefinition.structureUnlocks)) {
        validateStructureUnlocks(candidate.rulesDefinition.structureUnlocks, structureCatalogLookup, errors);
      }

      if (candidate.rulesDefinition.captureRules && isPlainObject(candidate.rulesDefinition.captureRules)) {
        validateCaptureRules(candidate.rulesDefinition.captureRules, structureCatalogLookup, phaseIds, errors);
      }
    }

    if (candidate.applicationConfig && isPlainObject(candidate.applicationConfig)) {
      validateApplicationConfig(candidate.applicationConfig, errors);
    }

    validateExternalRegistries(candidate.externalRegistries, errors);

    if (Object.prototype.hasOwnProperty.call(candidate, "extensions") && candidate.extensions !== undefined && !isPlainObject(candidate.extensions)) {
      pushError(errors, "INVALID_OBJECT", "extensions", "extensions must be an object when present.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  globalScope.validateSeasonPackage = validateSeasonPackage;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateSeasonPackage
    };
  }
})(globalThis);
