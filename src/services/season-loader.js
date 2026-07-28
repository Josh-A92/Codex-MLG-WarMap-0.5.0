(function initializeSeasonLoader(globalScope) {
  const LOAD_ERROR_NAME = "SeasonPackageLoadError";

  class SeasonPackageLoadError extends Error {
    constructor(code, message, seasonId, options) {
      super(message);
      this.name = LOAD_ERROR_NAME;
      this.code = code;
      this.seasonId = seasonId;
      this.errors = options && Array.isArray(options.errors) ? options.errors : [];
      this.warnings = options && Array.isArray(options.warnings) ? options.warnings : [];

      if (options && Object.prototype.hasOwnProperty.call(options, "cause") && options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function createLoadError(code, message, seasonId, options) {
    return new SeasonPackageLoadError(code, message, seasonId, options);
  }

  function createSeasonLoader(dependencies) {
    const config = dependencies && typeof dependencies === "object" ? dependencies : null;
    const resolvePackage = config && typeof config.resolvePackage === "function" ? config.resolvePackage : null;
    const validateSeasonPackage = config && typeof config.validateSeasonPackage === "function" ? config.validateSeasonPackage : null;

    if (!resolvePackage || !validateSeasonPackage) {
      throw new TypeError("createSeasonLoader requires resolvePackage and validateSeasonPackage functions.");
    }

    async function load(seasonId) {
      if (!isNonEmptyString(seasonId)) {
        throw createLoadError("INVALID_SEASON_ID", "Season ID must be a non-empty string.", seasonId);
      }

      let candidate;

      try {
        candidate = await resolvePackage(seasonId);
      } catch (error) {
        throw createLoadError("PACKAGE_RESOLUTION_FAILED", `Failed to resolve season package '${seasonId}'.`, seasonId, {
          cause: error
        });
      }

      if (candidate === null || candidate === undefined) {
        throw createLoadError("PACKAGE_NOT_FOUND", `Season package '${seasonId}' was not found.`, seasonId);
      }

      let validationResult;

      try {
        validationResult = validateSeasonPackage(candidate);
      } catch (error) {
        throw createLoadError("PACKAGE_VALIDATION_FAILED", `Season package '${seasonId}' could not be validated.`, seasonId, {
          cause: error
        });
      }

      if (!validationResult || validationResult.valid !== true) {
        throw createLoadError("PACKAGE_VALIDATION_FAILED", `Season package '${seasonId}' is invalid.`, seasonId, {
          errors: validationResult && Array.isArray(validationResult.errors) ? validationResult.errors : [],
          warnings: validationResult && Array.isArray(validationResult.warnings) ? validationResult.warnings : []
        });
      }

      const packagedSeasonId = candidate && candidate.packageIdentity && candidate.packageIdentity.seasonId;
      if (packagedSeasonId !== seasonId) {
        throw createLoadError("SEASON_ID_MISMATCH", `Resolved package season ID '${packagedSeasonId}' does not match requested season ID '${seasonId}'.`, seasonId);
      }

      return candidate;
    }

    return {
      load
    };
  }

  globalScope.SeasonPackageLoadError = SeasonPackageLoadError;
  globalScope.createSeasonLoader = createSeasonLoader;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      SeasonPackageLoadError,
      createSeasonLoader
    };
  }
})(globalThis);