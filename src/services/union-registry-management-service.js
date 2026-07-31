(function initializeUnionRegistryManagementServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["authorizationPolicyService", "unionRegistryService"]);

  class UnionRegistryManagementServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "UnionRegistryManagementServiceError";
      this.code = code;
    }
  }

  function fail(message) {
    throw new UnionRegistryManagementServiceError("invalid_factory", message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(`Union Registry Management Service requires ${path} to be an object.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail(`Union Registry Management Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function createUnionRegistryManagementService(options) {
    if (!isRecord(options)) fail("Union Registry Management Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail(`Union Registry Management Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail(`Union Registry Management Service requires options.${field}.`);
      }
    });

    const authorization = bindInterface(
      options.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const registry = bindInterface(
      options.unionRegistryService,
      "options.unionRegistryService",
      [
        "createUnionIdentity",
        "updateUnionIdentity",
        "archiveUnionIdentity",
        "restoreUnionIdentity"
      ]
    );

    function authorize(actor) {
      return authorization.requireAuthorized(actor, "union_registry.manage", {});
    }

    function createUnionIdentity(actor, identity) {
      authorize(actor);
      return registry.createUnionIdentity(identity);
    }

    function updateUnionIdentity(actor, unionId, changes) {
      authorize(actor);
      return registry.updateUnionIdentity(unionId, changes);
    }

    function archiveUnionIdentity(actor, unionId) {
      authorize(actor);
      return registry.archiveUnionIdentity(unionId);
    }

    function restoreUnionIdentity(actor, unionId) {
      authorize(actor);
      return registry.restoreUnionIdentity(unionId);
    }

    return Object.freeze({
      createUnionIdentity,
      updateUnionIdentity,
      archiveUnionIdentity,
      restoreUnionIdentity
    });
  }

  const exportsObject = {
    createUnionRegistryManagementService,
    UnionRegistryManagementServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
