(function initializeAuthorizationPolicyServiceFactory(globalScope) {
  const CAPABILITIES = Object.freeze([
    "server_state.edit",
    "proposal.review",
    "union_registry.manage",
    "season_rules.manage",
    "user_access.manage"
  ]);
  const CAPABILITY_SET = new Set(CAPABILITIES);
  const ACTOR_FIELDS = new Set(["actorId", "grants"]);
  const GRANT_FIELDS = new Set(["capability", "seasonId", "serverId"]);
  const SCOPE_FIELDS = new Set(["seasonId", "serverId"]);

  class AuthorizationPolicyError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "AuthorizationPolicyError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new AuthorizationPolicyError(code, message, details);
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

  function requireRecord(value, path) {
    if (!isRecord(value)) fail("invalid_input", `Authorization Policy requires ${path} to be a plain object.`);
    return value;
  }

  function requireExactFields(value, fields, path, requireAll) {
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Authorization Policy does not recognize ${path}.${unknown[0]}.`);
    }
    if (requireAll) {
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          fail("invalid_input", `Authorization Policy requires ${path}.${field}.`);
        }
      });
    }
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Authorization Policy requires ${path} to be a non-empty string.`);
    }
    return value;
  }

  function requireNullableString(value, path) {
    if (value === null) return null;
    return requireString(value, path);
  }

  function requireCapability(value, path) {
    const capability = requireString(value, path);
    if (!CAPABILITY_SET.has(capability)) {
      fail("invalid_input", `Authorization Policy does not recognize capability '${capability}'.`);
    }
    return capability;
  }

  function normalizeGrant(value, path) {
    const grant = requireRecord(value, path);
    requireExactFields(grant, GRANT_FIELDS, path, true);
    const normalized = {
      capability: requireCapability(grant.capability, `${path}.capability`),
      seasonId: requireNullableString(grant.seasonId, `${path}.seasonId`),
      serverId: requireNullableString(grant.serverId, `${path}.serverId`)
    };
    if (normalized.serverId !== null && normalized.seasonId === null) {
      fail("invalid_input", `Authorization Policy requires ${path}.seasonId when serverId is scoped.`);
    }
    return normalized;
  }

  function grantKey(grant) {
    return JSON.stringify([grant.capability, grant.seasonId, grant.serverId]);
  }

  function normalizeActor(value) {
    const actor = requireRecord(value, "actor");
    requireExactFields(actor, ACTOR_FIELDS, "actor", true);
    if (!Array.isArray(actor.grants)) {
      fail("invalid_input", "Authorization Policy requires actor.grants to be an array.");
    }
    const seen = new Set();
    const grants = actor.grants.map((grant, index) => {
      const normalized = normalizeGrant(grant, `actor.grants[${index}]`);
      const key = grantKey(normalized);
      if (seen.has(key)) {
        fail("invalid_input", `Authorization Policy requires actor.grants[${index}] to be unique.`);
      }
      seen.add(key);
      return normalized;
    });
    return {
      actorId: requireString(actor.actorId, "actor.actorId"),
      grants
    };
  }

  function normalizeScope(value) {
    const scope = value === undefined ? {} : requireRecord(value, "scope");
    requireExactFields(scope, SCOPE_FIELDS, "scope", false);
    const normalized = {
      seasonId: Object.prototype.hasOwnProperty.call(scope, "seasonId")
        ? requireNullableString(scope.seasonId, "scope.seasonId")
        : null,
      serverId: Object.prototype.hasOwnProperty.call(scope, "serverId")
        ? requireNullableString(scope.serverId, "scope.serverId")
        : null
    };
    if (normalized.serverId !== null && normalized.seasonId === null) {
      fail("invalid_input", "Authorization Policy requires scope.seasonId when serverId is scoped.");
    }
    return normalized;
  }

  function grantMatches(grant, capability, scope) {
    if (grant.capability !== capability) return false;
    if (scope.seasonId === null) {
      return grant.seasonId === null && grant.serverId === null;
    }
    if (grant.seasonId !== null && grant.seasonId !== scope.seasonId) return false;
    if (scope.serverId === null) return grant.serverId === null;
    return grant.serverId === null || grant.serverId === scope.serverId;
  }

  function createAuthorizationPolicyService() {
    function authorize(actorValue, capabilityValue, scopeValue) {
      const actor = normalizeActor(actorValue);
      const capability = requireCapability(capabilityValue, "capability");
      const scope = normalizeScope(scopeValue);
      const matchingGrant = actor.grants.find((grant) => grantMatches(grant, capability, scope)) || null;
      return {
        authorized: matchingGrant !== null,
        actorId: actor.actorId,
        capability,
        scope: clone(scope),
        matchingGrant: matchingGrant === null ? null : clone(matchingGrant)
      };
    }

    function requireAuthorized(actor, capability, scope) {
      const decision = authorize(actor, capability, scope);
      if (!decision.authorized) {
        fail(
          "authorization_denied",
          `Actor '${decision.actorId}' is not authorized for '${decision.capability}'.`,
          decision
        );
      }
      return decision;
    }

    return Object.freeze({ authorize, requireAuthorized });
  }

  function createTrustedLocalActor(actorId) {
    const normalizedActorId = requireString(actorId, "actorId");
    return {
      actorId: normalizedActorId,
      grants: CAPABILITIES.map((capability) => ({
        capability,
        seasonId: null,
        serverId: null
      }))
    };
  }

  const exportsObject = {
    AUTHORIZATION_CAPABILITIES: CAPABILITIES,
    createAuthorizationPolicyService,
    createTrustedLocalActor,
    AuthorizationPolicyError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
