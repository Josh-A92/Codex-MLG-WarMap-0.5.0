(function initializeServerDataCompletenessServiceFactory(globalScope) {
  const INPUT_FIELDS = new Set([
    "serverIntelligenceView",
    "snapshotProjection",
    "pendingReviewCount"
  ]);
  const SNAPSHOT_COUNT_FIELDS = [
    "requiredTerritoryTargetCount",
    "verifiedTerritoryTargetCount",
    "requiredStructureTargetCount",
    "verifiedStructureTargetCount"
  ];

  class ServerDataCompletenessServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "ServerDataCompletenessServiceError";
      this.code = code;
    }
  }
  function fail(code, message) {
    throw new ServerDataCompletenessServiceError(code, message);
  }
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function requireCount(value, path) {
    if (!Number.isInteger(value) || value < 0) {
      fail("invalid_input", `Server Data Completeness Service requires ${path} to be a non-negative integer.`);
    }
    return value;
  }
  function category(verified, required) {
    return {
      verified,
      required,
      complete: verified === required
    };
  }

  function createServerDataCompletenessService() {
    function evaluate(input) {
      if (!isRecord(input)) {
        fail("invalid_input", "Server Data Completeness Service requires input to be a plain object.");
      }
      INPUT_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(input, field)) {
          fail("invalid_input", `Server Data Completeness Service requires input.${field}.`);
        }
      });
      const unknown = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
      if (unknown.length > 0) {
        fail("invalid_input", `Server Data Completeness Service does not recognize input.${unknown[0]}.`);
      }
      if (!isRecord(input.serverIntelligenceView)
          || !Array.isArray(input.serverIntelligenceView.unions)
          || !isRecord(input.snapshotProjection)) {
        fail("invalid_input", "Server Data Completeness Service requires valid intelligence and snapshot projections.");
      }
      SNAPSHOT_COUNT_FIELDS.forEach((field) => requireCount(
        input.snapshotProjection[field],
        `input.snapshotProjection.${field}`
      ));
      const pendingReviewCount = requireCount(input.pendingReviewCount, "input.pendingReviewCount");
      const territoryVerified = input.snapshotProjection.verifiedTerritoryTargetCount;
      const territoryRequired = input.snapshotProjection.requiredTerritoryTargetCount;
      const structureVerified = input.snapshotProjection.verifiedStructureTargetCount;
      const structureRequired = input.snapshotProjection.requiredStructureTargetCount;
      if (territoryVerified > territoryRequired || structureVerified > structureRequired) {
        fail("inconsistent_state", "Verified target counts cannot exceed required target counts.");
      }

      let knownUnions = 0;
      let nativeConfirmed = 0;
      let activityVerified = 0;
      let activeUnions = 0;
      let combatStrengthConfirmed = 0;
      input.serverIntelligenceView.unions.forEach((result, index) => {
        if (!isRecord(result) || typeof result.valid !== "boolean") {
          fail("invalid_input", `Server Data Completeness Service received invalid union result at index ${index}.`);
        }
        knownUnions += 1;
        if (!result.valid || !isRecord(result.view)) return;
        if (result.view.currentNativeAssignment !== null) nativeConfirmed += 1;
        if (isRecord(result.view.activity)
            && (result.view.activity.verificationHealth === "current"
              || result.view.activity.verificationHealth === "monitoring")) {
          activityVerified += 1;
        }
        const canonicalStatus = isRecord(result.view.activity)
          ? result.view.activity.canonicalStatus
          : null;
        if (isRecord(canonicalStatus) && canonicalStatus.activityState === "active") {
          activeUnions += 1;
          if (result.view.latestCombatStrengthObservation !== null
              && isRecord(result.view.latestCombatStrengthObservation)) {
            combatStrengthConfirmed += 1;
          }
        }
      });

      return {
        territoryCoverage: category(territoryVerified, territoryRequired),
        structureVerification: category(structureVerified, structureRequired),
        nativeUnionVerification: category(nativeConfirmed, knownUnions),
        activeUnionInformation: category(activityVerified, knownUnions),
        combatStrengthCoverage: category(combatStrengthConfirmed, activeUnions),
        evidenceAwaitingReview: { count: pendingReviewCount }
      };
    }
    return { evaluate };
  }

  const exportsObject = {
    createServerDataCompletenessService,
    ServerDataCompletenessServiceError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
