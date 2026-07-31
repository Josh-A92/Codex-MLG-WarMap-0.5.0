(function initializeUnionRegistryStateSerializer(globalScope) {
  const SCHEMA_VERSION = 1;
  const TOP_LEVEL_FIELDS = ["schemaVersion", "savedAt", "identities"];
  const IDENTITY_FIELDS = [
    "unionId",
    "displayName",
    "tag",
    "aliases",
    "defaultColor",
    "presentationMetadata",
    "registryStatus"
  ];
  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwn(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function cloneJsonValue(value, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
      const clone = value.map((item) => cloneJsonValue(item, seen));
      seen.delete(value);
      return clone.some((item) => item === undefined) ? undefined : clone;
    }
    if (!isPlainObject(value) || seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const key of Object.keys(value)) {
      const clonedValue = cloneJsonValue(value[key], seen);
      if (clonedValue === undefined) {
        seen.delete(value);
        return undefined;
      }
      defineOwn(clone, key, clonedValue);
    }
    seen.delete(value);
    return clone;
  }

  function deepClone(value) {
    return cloneJsonValue(value, new Set());
  }

  function result() {
    return { valid: true, errors: [], warnings: [] };
  }

  function error(output, code, path, message) {
    output.valid = false;
    output.errors.push({ code, path, message });
  }

  function nonEmpty(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function exactFields(output, value, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        error(output, "MISSING_REQUIRED_FIELD", `${path}.${field}`, `${path}.${field} is required.`);
      }
    });
    Object.keys(value).sort().forEach((field) => {
      if (!fields.includes(field)) {
        error(output, "UNKNOWN_FIELD", `${path}.${field}`, `Unknown field '${field}'.`);
      }
    });
  }

  function validateIdentity(output, identity, index, unionIds) {
    const path = `identities[${index}]`;
    if (!isPlainObject(identity)) {
      error(output, "INVALID_OBJECT", path, `${path} must be a plain object.`);
      return;
    }
    exactFields(output, identity, IDENTITY_FIELDS, path);

    ["unionId", "displayName", "tag"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(identity, field) && !nonEmpty(identity[field])) {
        error(output, "INVALID_STRING", `${path}.${field}`, `${path}.${field} must be non-empty.`);
      }
    });
    if (nonEmpty(identity.unionId)) {
      if (unionIds.has(identity.unionId)) {
        error(output, "DUPLICATE_UNION_ID", `${path}.unionId`, `Duplicate unionId '${identity.unionId}'.`);
      } else {
        unionIds.add(identity.unionId);
      }
    }

    if (Object.prototype.hasOwnProperty.call(identity, "aliases")) {
      if (!Array.isArray(identity.aliases)) {
        error(output, "INVALID_ARRAY", `${path}.aliases`, `${path}.aliases must be an array.`);
      } else {
        const aliases = new Set();
        identity.aliases.forEach((alias, aliasIndex) => {
          const aliasPath = `${path}.aliases[${aliasIndex}]`;
          if (!nonEmpty(alias)) {
            error(output, "INVALID_STRING", aliasPath, `${aliasPath} must be non-empty.`);
          } else {
            const key = alias.toLocaleLowerCase("en-US");
            if (aliases.has(key)) {
              error(output, "DUPLICATE_ALIAS", aliasPath, `${path}.aliases must be unique.`);
            } else {
              aliases.add(key);
            }
          }
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(identity, "defaultColor")
        && (typeof identity.defaultColor !== "string"
          || !/^#[0-9A-Fa-f]{6}$/.test(identity.defaultColor))) {
      error(output, "INVALID_COLOR", `${path}.defaultColor`, `${path}.defaultColor must be #RRGGBB.`);
    }

    if (Object.prototype.hasOwnProperty.call(identity, "presentationMetadata")
        && cloneJsonValue(identity.presentationMetadata, new Set()) === undefined) {
      error(
        output,
        "INVALID_METADATA",
        `${path}.presentationMetadata`,
        `${path}.presentationMetadata must be a JSON-compatible plain object.`
      );
    } else if (Object.prototype.hasOwnProperty.call(identity, "presentationMetadata")
        && !isPlainObject(identity.presentationMetadata)) {
      error(
        output,
        "INVALID_METADATA",
        `${path}.presentationMetadata`,
        `${path}.presentationMetadata must be a plain object.`
      );
    }

    if (Object.prototype.hasOwnProperty.call(identity, "registryStatus")
        && identity.registryStatus !== "current"
        && identity.registryStatus !== "archived") {
      error(
        output,
        "INVALID_REGISTRY_STATUS",
        `${path}.registryStatus`,
        `${path}.registryStatus must be current or archived.`
      );
    }
  }

  function validateUnionRegistryEnvelope(candidate) {
    const output = result();
    if (!isPlainObject(candidate)) {
      error(output, "INVALID_OBJECT", "", "Union Registry envelope must be a plain object.");
      return output;
    }
    exactFields(output, candidate, TOP_LEVEL_FIELDS, "");

    if (Object.prototype.hasOwnProperty.call(candidate, "schemaVersion")) {
      if (!Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion <= 0) {
        error(output, "INVALID_SCHEMA_VERSION", "schemaVersion", "schemaVersion must be positive.");
      } else if (candidate.schemaVersion !== SCHEMA_VERSION) {
        error(output, "UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", "Only schema version 1 is supported.");
      }
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "savedAt")) {
      if (typeof candidate.savedAt !== "string" || !TIMESTAMP_PATTERN.test(candidate.savedAt)) {
        error(output, "INVALID_TIMESTAMP_FORMAT", "savedAt", "savedAt must match YYYY-MM-DDTHH:mm:ss.sssZ.");
      } else {
        const parsed = new Date(candidate.savedAt);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== candidate.savedAt) {
          error(output, "INVALID_TIMESTAMP", "savedAt", "savedAt must be a real UTC timestamp.");
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(candidate, "identities")) {
      if (!Array.isArray(candidate.identities)) {
        error(output, "INVALID_ARRAY", "identities", "identities must be an array.");
      } else {
        const unionIds = new Set();
        candidate.identities.forEach((identity, index) => {
          validateIdentity(output, identity, index, unionIds);
        });
      }
    }
    return output;
  }

  function serializationError(message, errors) {
    const exception = new Error(message);
    exception.name = "UnionRegistrySerializationError";
    exception.code = "UNION_REGISTRY_SERIALIZATION_FAILED";
    exception.validationErrors = Array.isArray(errors) ? errors.map((entry) => ({ ...entry })) : [];
    return exception;
  }

  function serializeUnionRegistry(unionRegistryService, savedAt) {
    if (unionRegistryService === null
        || typeof unionRegistryService !== "object"
        || Array.isArray(unionRegistryService)
        || typeof unionRegistryService.listUnionIdentities !== "function") {
      throw serializationError("serializeUnionRegistry requires a Union Registry Service.", [{
        code: "INVALID_DEPENDENCY",
        path: "unionRegistryService",
        message: "listUnionIdentities must be available."
      }]);
    }
    const identities = unionRegistryService.listUnionIdentities.call(
      unionRegistryService,
      { includeArchived: true }
    );
    if (!Array.isArray(identities)) {
      throw serializationError("Union Registry Service returned an invalid identity list.", [{
        code: "INVALID_DEPENDENCY_RESULT",
        path: "unionRegistryService.listUnionIdentities",
        message: "listUnionIdentities must return an array."
      }]);
    }
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      savedAt,
      identities
    };
    const validation = validateUnionRegistryEnvelope(envelope);
    if (!validation.valid) {
      throw serializationError("serializeUnionRegistry produced an invalid envelope.", validation.errors);
    }
    return deepClone(envelope);
  }

  function deserializeUnionRegistryEnvelope(candidate) {
    const validation = validateUnionRegistryEnvelope(candidate);
    if (!validation.valid) {
      throw serializationError("deserializeUnionRegistryEnvelope rejected an invalid envelope.", validation.errors);
    }
    return deepClone(candidate);
  }

  const exportsObject = {
    validateUnionRegistryEnvelope,
    serializeUnionRegistry,
    deserializeUnionRegistryEnvelope
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
