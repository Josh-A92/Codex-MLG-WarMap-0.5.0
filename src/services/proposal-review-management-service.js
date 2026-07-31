(function initializeProposalReviewManagementServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "authorizationPolicyService",
    "nativeAssignmentService",
    "combatStrengthObservationService",
    "serverObservationService",
    "ownershipRecordService",
    "evidenceRecordService",
    "resolveEvidenceScope",
    "clock"
  ]);
  const ITEM_TYPES = new Set([
    "native_assignment",
    "combat_strength_observation",
    "server_observation",
    "territory_ownership",
    "structure_ownership",
    "evidence_record"
  ]);

  class ProposalReviewManagementServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ProposalReviewManagementServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ProposalReviewManagementServiceError(code, message);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    const output = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(output, key, {
        value: clone(value[key]),
        enumerable: true,
        configurable: true,
        writable: true
      });
    });
    return output;
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Proposal Review Management Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Proposal Review Management Service requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Proposal Review Management Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function createProposalReviewManagementService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Proposal Review Management Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Proposal Review Management Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Proposal Review Management Service requires options.${field}.`);
      }
    });
    if (typeof options.resolveEvidenceScope !== "function") {
      fail("invalid_factory", "Proposal Review Management Service requires options.resolveEvidenceScope.");
    }
    if (typeof options.clock !== "function") {
      fail("invalid_factory", "Proposal Review Management Service requires options.clock.");
    }

    const authorization = bindInterface(
      options.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const nativeAssignments = bindInterface(
      options.nativeAssignmentService,
      "options.nativeAssignmentService",
      ["getAssignment", "confirmProposal", "rejectProposal"]
    );
    const combat = bindInterface(
      options.combatStrengthObservationService,
      "options.combatStrengthObservationService",
      ["getObservation", "reviewProposal"]
    );
    const observations = bindInterface(
      options.serverObservationService,
      "options.serverObservationService",
      ["getObservation", "reviewProposal"]
    );
    const ownership = bindInterface(
      options.ownershipRecordService,
      "options.ownershipRecordService",
      [
        "getTerritoryRecord",
        "confirmTerritoryProposal",
        "rejectTerritoryProposal",
        "getStructureRecord",
        "confirmStructureProposal",
        "rejectStructureProposal"
      ]
    );
    const evidence = bindInterface(
      options.evidenceRecordService,
      "options.evidenceRecordService",
      ["getEvidenceRecord", "reviewProposal"]
    );
    const resolveEvidenceScope = options.resolveEvidenceScope.bind(options);
    const clock = options.clock.bind(options);

    function reviewedAt() {
      const value = clock();
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
        fail("invalid_dependency", "Proposal Review Management Service requires clock to return a timestamp.");
      }
      return value;
    }

    function requireProposal(record, itemType, itemId) {
      if (!isRecord(record)) {
        fail("unknown_proposal", `Proposal Review Management Service could not find ${itemType} '${itemId}'.`);
      }
      if (record.reviewState !== "proposed") {
        fail("invalid_transition", `Proposal Review Management Service requires '${itemId}' to be proposed.`);
      }
      return record;
    }

    function scopeFromRecord(record) {
      return {
        seasonId: requireString(record.seasonId, "proposal.seasonId"),
        serverId: requireString(record.serverId, "proposal.serverId")
      };
    }

    function normalizeEvidenceScope(record) {
      const value = resolveEvidenceScope(clone(record));
      if (!isRecord(value)) {
        fail("invalid_dependency", "Proposal Review Management Service requires resolveEvidenceScope to return a scope.");
      }
      const keys = Object.keys(value).sort();
      if (keys.length !== 2 || keys[0] !== "seasonId" || keys[1] !== "serverId") {
        fail(
          "invalid_dependency",
          "Proposal Review Management Service requires evidence scope to contain seasonId and serverId."
        );
      }
      return {
        seasonId: requireString(value.seasonId, "evidenceScope.seasonId"),
        serverId: requireString(value.serverId, "evidenceScope.serverId")
      };
    }

    function load(itemType, itemId) {
      switch (itemType) {
        case "native_assignment":
          return { record: nativeAssignments.getAssignment(itemId), scope: null };
        case "combat_strength_observation":
          return { record: combat.getObservation(itemId), scope: null };
        case "server_observation":
          return { record: observations.getObservation(itemId), scope: null };
        case "territory_ownership":
          return { record: ownership.getTerritoryRecord(itemId), scope: null };
        case "structure_ownership":
          return { record: ownership.getStructureRecord(itemId), scope: null };
        case "evidence_record": {
          const record = evidence.getEvidenceRecord(itemId);
          return { record, scope: record === null ? null : normalizeEvidenceScope(record) };
        }
        default:
          fail("invalid_input", `Proposal Review Management Service does not recognize itemType '${itemType}'.`);
      }
      return null;
    }

    function applyReview(actor, itemTypeValue, itemIdValue, decision) {
      const itemType = requireString(itemTypeValue, "itemType");
      const itemId = requireString(itemIdValue, "itemId");
      if (!ITEM_TYPES.has(itemType)) {
        fail("invalid_input", `Proposal Review Management Service does not recognize itemType '${itemType}'.`);
      }
      const loaded = load(itemType, itemId);
      const record = requireProposal(loaded.record, itemType, itemId);
      const scope = loaded.scope || scopeFromRecord(record);
      const authorizationDecision = authorization.requireAuthorized(
        actor,
        "proposal.review",
        scope
      );
      const time = reviewedAt();
      const reviewerId = authorizationDecision.actorId;

      if (itemType === "native_assignment") {
        return decision === "confirm"
          ? nativeAssignments.confirmProposal(itemId, {
              reviewer: reviewerId,
              reviewedAt: time,
              effectiveFrom: record.observedAt
            })
          : nativeAssignments.rejectProposal(itemId, {
              reviewer: reviewerId,
              reviewedAt: time
            });
      }
      if (itemType === "territory_ownership") {
        return decision === "confirm"
          ? ownership.confirmTerritoryProposal(itemId, { reviewerId, reviewedAt: time })
          : ownership.rejectTerritoryProposal(itemId, { reviewerId, reviewedAt: time });
      }
      if (itemType === "structure_ownership") {
        return decision === "confirm"
          ? ownership.confirmStructureProposal(itemId, { reviewerId, reviewedAt: time })
          : ownership.rejectStructureProposal(itemId, { reviewerId, reviewedAt: time });
      }

      const reviewedRecord = clone(record);
      reviewedRecord.reviewState = decision === "confirm" ? "confirmed" : "rejected";
      reviewedRecord.reviewerId = reviewerId;
      reviewedRecord.reviewedAt = time;
      if (itemType === "combat_strength_observation") {
        return combat.reviewProposal(itemId, reviewedRecord);
      }
      if (itemType === "server_observation") {
        return observations.reviewProposal(itemId, reviewedRecord);
      }
      return evidence.reviewProposal(itemId, reviewedRecord);
    }

    function confirmProposal(actor, itemType, itemId) {
      return applyReview(actor, itemType, itemId, "confirm");
    }

    function rejectProposal(actor, itemType, itemId) {
      return applyReview(actor, itemType, itemId, "reject");
    }

    return Object.freeze({ confirmProposal, rejectProposal });
  }

  const exportsObject = {
    createProposalReviewManagementService,
    ProposalReviewManagementServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
