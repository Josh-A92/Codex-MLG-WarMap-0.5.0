(function initializeServerIntelligenceViewServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "unionServerSeasonIntelligenceViewService",
    "serverObservationService"
  ]);
  const REQUEST_FIELDS = new Set(["seasonId", "serverId", "evaluatedAt"]);

  class ServerIntelligenceViewServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ServerIntelligenceViewServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ServerIntelligenceViewServiceError(code, message);
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
      fail(code, `Server Intelligence View Service requires ${path} to be a plain object.`);
    }
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Server Intelligence View Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function requireFields(value, fields, path) {
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Server Intelligence View Service requires ${path}.${field}.`);
      }
    });
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Server Intelligence View Service does not recognize ${path}.${unknown[0]}.`);
    }
  }

  function bindInterface(value, field, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Server Intelligence View Service requires options.${field} to be an object.`);
    }
    return methods.reduce((bound, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Server Intelligence View Service requires options.${field}.${method}.`);
      }
      bound[method] = value[method].bind(value);
      return bound;
    }, {});
  }

  function compareObservations(left, right) {
    const timeDifference = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    return timeDifference || left.observationId.localeCompare(right.observationId);
  }

  function createServerIntelligenceViewService(options) {
    const input = requireRecord(options, "options", "invalid_factory");
    requireFields(input, FACTORY_FIELDS, "options");
    const unionViews = bindInterface(
      input.unionServerSeasonIntelligenceViewService,
      "unionServerSeasonIntelligenceViewService",
      ["listViews"]
    );
    const observations = bindInterface(
      input.serverObservationService,
      "serverObservationService",
      ["listObservations"]
    );

    function getView(request) {
      const value = requireRecord(request, "input");
      requireFields(value, REQUEST_FIELDS, "input");
      REQUEST_FIELDS.forEach((field) => requireString(value[field], `input.${field}`));

      const unions = unionViews.listViews({
        seasonId: value.seasonId,
        serverId: value.serverId,
        evaluatedAt: value.evaluatedAt
      });
      const listedObservations = observations.listObservations({
        seasonId: value.seasonId,
        serverId: value.serverId,
        reviewState: "confirmed"
      });
      if (!Array.isArray(unions) || !Array.isArray(listedObservations)) {
        fail("invalid_dependency", "Server Intelligence View Service received an invalid dependency result.");
      }
      if (unions.some((entry) => !isRecord(entry))
          || listedObservations.some((entry) => !isRecord(entry))) {
        fail("invalid_dependency", "Server Intelligence View Service received a non-record list entry.");
      }

      return {
        seasonId: value.seasonId,
        serverId: value.serverId,
        evaluatedAt: value.evaluatedAt,
        unions: clone(unions),
        confirmedObservations: clone(listedObservations).sort(compareObservations)
      };
    }

    return { getView };
  }

  const exportsObject = {
    createServerIntelligenceViewService,
    ServerIntelligenceViewServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
