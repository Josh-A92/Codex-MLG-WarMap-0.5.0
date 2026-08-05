(function initializeUnionRegistrationCoordinatorFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "authorizationPolicyService",
    "unionRegistryManagementService",
    "serverIntelligenceManagementService",
    "relationService",
    "executeAtomically",
    "createId"
  ]);
  const INPUT_FIELDS = new Set([
    "seasonId",
    "serverId",
    "displayName",
    "tag",
    "defaultColor",
    "mapPattern"
  ]);
  const NATIVE_SERVER_INPUT_FIELDS = new Set(["seasonId", "serverId", "unionId"]);
  const MAP_PATTERNS = new Set(["solid", "diagonal", "crosshatch", "dots"]);

  class UnionRegistrationCoordinatorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionRegistrationCoordinatorError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new UnionRegistrationCoordinatorError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
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

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => defineOwn(output, key, clone(value[key])));
    return output;
  }

  function requireRecord(value, path, code = "invalid_input") {
    if (!isRecord(value)) {
      fail(code, `Union Registration Coordinator requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireExactFields(value, fields, path, code) {
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail(code, `Union Registration Coordinator does not recognize ${path}.${unknown[0]}.`);
    }
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(code, `Union Registration Coordinator requires ${path}.${field}.`);
      }
    });
  }

  function requireString(value, path, code = "invalid_input") {
    if (typeof value !== "string" || value.trim() === "") {
      fail(code, `Union Registration Coordinator requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireColor(value, path) {
    const color = requireString(value, path);
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      fail("invalid_input", `Union Registration Coordinator requires ${path} to be a #RRGGBB string.`);
    }
    return color;
  }

  function requirePattern(value, path) {
    const pattern = requireString(value, path);
    if (!MAP_PATTERNS.has(pattern)) {
      fail(
        "invalid_input",
        `Union Registration Coordinator requires ${path} to be solid, diagonal, crosshatch, or dots.`
      );
    }
    return pattern;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Union Registration Coordinator requires ${path} to be an object.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Union Registration Coordinator requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function requireFunction(value, path) {
    if (typeof value !== "function") {
      fail("invalid_factory", `Union Registration Coordinator requires ${path} to be a function.`);
    }
    return value;
  }

  function createUnionRegistrationCoordinator(options) {
    const input = requireRecord(options, "options", "invalid_factory");
    requireExactFields(input, FACTORY_FIELDS, "options", "invalid_factory");

    const authorization = bindInterface(
      input.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const registry = bindInterface(
      input.unionRegistryManagementService,
      "options.unionRegistryManagementService",
      ["createUnionIdentity"]
    );
    const intelligence = bindInterface(
      input.serverIntelligenceManagementService,
      "options.serverIntelligenceManagementService",
      ["addKnownUnion", "recordManualNativeAssignment"]
    );
    const relations = bindInterface(
      input.relationService,
      "options.relationService",
      ["hasRelation"]
    );
    const executeAtomically = requireFunction(
      input.executeAtomically,
      "options.executeAtomically"
    ).bind(input);
    const createId = requireFunction(input.createId, "options.createId").bind(input);

    function normalizeRegistration(value) {
      const registration = requireRecord(value, "input");
      requireExactFields(registration, INPUT_FIELDS, "input", "invalid_input");
      return {
        seasonId: requireString(registration.seasonId, "input.seasonId"),
        serverId: requireString(registration.serverId, "input.serverId"),
        displayName: requireString(registration.displayName, "input.displayName"),
        tag: requireString(registration.tag, "input.tag"),
        defaultColor: requireColor(registration.defaultColor, "input.defaultColor"),
        mapPattern: requirePattern(registration.mapPattern, "input.mapPattern")
      };
    }

    function normalizeNativeServerAssignment(value) {
      const assignment = requireRecord(value, "input");
      requireExactFields(assignment, NATIVE_SERVER_INPUT_FIELDS, "input", "invalid_input");
      return {
        seasonId: requireString(assignment.seasonId, "input.seasonId"),
        serverId: requireString(assignment.serverId, "input.serverId"),
        unionId: requireString(assignment.unionId, "input.unionId")
      };
    }

    function nextUnionId() {
      return requireString(createId("union"), "createId('union')", "invalid_dependency");
    }

    async function registerUnion(actor, registrationValue) {
      const registration = normalizeRegistration(registrationValue);

      authorization.requireAuthorized(actor, "union_registry.manage", {});
      authorization.requireAuthorized(actor, "server_state.edit", {
        seasonId: registration.seasonId,
        serverId: registration.serverId
      });

      const unionId = nextUnionId();
      let operationCalls = 0;
      let operationResult = null;

      const operation = () => {
        operationCalls += 1;
        if (operationCalls > 1) {
          fail(
            "invalid_dependency",
            "Union Registration Coordinator requires executeAtomically to invoke its operation once."
          );
        }

        const identity = registry.createUnionIdentity(actor, {
          unionId,
          displayName: registration.displayName,
          tag: registration.tag,
          aliases: [],
          defaultColor: registration.defaultColor,
          presentationMetadata: {
            mapPattern: registration.mapPattern
          },
          registryStatus: "current"
        });
        const relation = intelligence.addKnownUnion(actor, {
          seasonId: registration.seasonId,
          serverId: registration.serverId,
          unionId
        });
        const nativeAssignment = intelligence.recordManualNativeAssignment(actor, {
          seasonId: registration.seasonId,
          serverId: registration.serverId,
          unionId,
          nativeState: "native"
        });

        operationResult = {
          identity: clone(identity),
          relation: clone(relation),
          nativeAssignment: clone(nativeAssignment)
        };
        return clone(operationResult);
      };

      await executeAtomically(operation);

      if (operationCalls !== 1 || operationResult === null) {
        fail(
          "invalid_dependency",
          "Union Registration Coordinator requires executeAtomically to complete its operation."
        );
      }

      return clone(operationResult);
    }

    async function assignNativeServer(actor, assignmentValue) {
      const assignment = normalizeNativeServerAssignment(assignmentValue);

      authorization.requireAuthorized(actor, "server_state.edit", {
        seasonId: assignment.seasonId,
        serverId: assignment.serverId
      });

      let operationCalls = 0;
      let operationResult = null;
      const operation = () => {
        operationCalls += 1;
        if (operationCalls > 1) {
          fail(
            "invalid_dependency",
            "Union Registration Coordinator requires executeAtomically to invoke its operation once."
          );
        }

        const relation = relations.hasRelation(
          assignment.seasonId,
          assignment.serverId,
          assignment.unionId
        )
          ? clone(assignment)
          : intelligence.addKnownUnion(actor, assignment);
        const nativeAssignment = intelligence.recordManualNativeAssignment(actor, {
          ...assignment,
          nativeState: "native"
        });

        operationResult = {
          relation: clone(relation),
          nativeAssignment: clone(nativeAssignment)
        };
        return clone(operationResult);
      };

      await executeAtomically(operation);
      if (operationCalls !== 1 || operationResult === null) {
        fail(
          "invalid_dependency",
          "Union Registration Coordinator requires executeAtomically to complete its operation."
        );
      }
      return clone(operationResult);
    }

    return Object.freeze({ registerUnion, assignNativeServer });
  }

  const exportsObject = {
    UNION_REGISTRATION_MAP_PATTERNS: Object.freeze(Array.from(MAP_PATTERNS)),
    createUnionRegistrationCoordinator,
    UnionRegistrationCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
