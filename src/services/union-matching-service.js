(function initializeUnionMatchingServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["unionRegistryService"]);
  const INPUT_FIELDS = new Set(["value"]);

  class UnionMatchingServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionMatchingServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new UnionMatchingServiceError(code, message);
  }

  function isRecordObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineOwnDataProperty(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map(deepClone);
    }
    if (!isRecordObject(value)) {
      return value;
    }
    const clone = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwnDataProperty(clone, key, deepClone(value[key])));
    return clone;
  }

  function cloneIdentity(identity) {
    return deepClone(identity);
  }

  function requireRecord(value, path) {
    if (!isRecordObject(value)) {
      fail("invalid_input", `Union Matching Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireFields(record, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail("invalid_input", `Union Matching Service requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(record).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Union Matching Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function createUnionMatchingService(options) {
    const input = requireRecord(options, "options");
    requireFields(input, FACTORY_FIELDS, "options");
    const registry = input.unionRegistryService;
    if (registry === null || typeof registry !== "object" || Array.isArray(registry)) {
      fail("invalid_factory", "Union Matching Service requires options.unionRegistryService to be an object.");
    }
    if (typeof registry.listUnionIdentities !== "function") {
      fail(
        "invalid_factory",
        "Union Matching Service requires options.unionRegistryService.listUnionIdentities to be a function."
      );
    }
    const listUnionIdentities = registry.listUnionIdentities.bind(registry);

    function match(value) {
      const request = requireRecord(value, "input");
      requireFields(request, INPUT_FIELDS, "input");
      if (typeof request.value !== "string" || request.value.trim() === "") {
        fail("invalid_input", "Union Matching Service requires input.value to be a non-empty string.");
      }
      const rawValue = request.value;
      const normalizedValue = rawValue.trim().toLocaleLowerCase("en-US");
      const identities = listUnionIdentities({ includeArchived: false });
      if (!Array.isArray(identities)) {
        fail("invalid_dependency", "Union Matching Service received an invalid registry identity list.");
      }
      identities.forEach((identity) => {
        if (
          !isRecordObject(identity)
          || typeof identity.unionId !== "string"
          || typeof identity.displayName !== "string"
          || typeof identity.tag !== "string"
          || !Array.isArray(identity.aliases)
          || identity.aliases.some((alias) => typeof alias !== "string")
        ) {
          fail("invalid_dependency", "Union Matching Service received an invalid registry identity.");
        }
      });

      const stages = [
        {
          matchType: "exact_id",
          select(identity) {
            return identity.unionId === rawValue.trim();
          }
        },
        {
          matchType: "exact_tag",
          select(identity) {
            return identity.tag.toLocaleLowerCase("en-US") === normalizedValue;
          }
        },
        {
          matchType: "exact_name",
          select(identity) {
            return identity.displayName.toLocaleLowerCase("en-US") === normalizedValue;
          }
        },
        {
          matchType: "alias",
          select(identity) {
            return identity.aliases.some(
              (alias) => alias.toLocaleLowerCase("en-US") === normalizedValue
            );
          }
        }
      ];

      for (let index = 0; index < stages.length; index += 1) {
        const stage = stages[index];
        const candidates = identities.filter(stage.select).map(cloneIdentity);
        if (candidates.length === 1) {
          return {
            status: "matched",
            matchType: stage.matchType,
            normalizedValue,
            matchedUnion: cloneIdentity(candidates[0]),
            candidates: candidates.map(cloneIdentity)
          };
        }
        if (candidates.length > 1) {
          return {
            status: "ambiguous",
            matchType: stage.matchType,
            normalizedValue,
            matchedUnion: null,
            candidates
          };
        }
      }

      return {
        status: "unmatched",
        matchType: null,
        normalizedValue,
        matchedUnion: null,
        candidates: []
      };
    }

    return { match };
  }

  const exportsObject = {
    createUnionMatchingService,
    UnionMatchingServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
