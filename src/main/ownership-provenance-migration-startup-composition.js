const { createApplicationDocumentCodec } = require("../services/application-document-codec.js");
const { createIsolatedApplicationGraphLoader } = require("../services/isolated-application-graph-loader.js");
const { createCommittedGenerationMigrationSnapshotAdapter } = require("../services/committed-generation-migration-snapshot-adapter.js");
const { createLegacyOwnershipProvenanceMigrationSnapshotAdapter } = require("../services/legacy-ownership-provenance-migration-snapshot-adapter.js");
const { createOwnershipMigrationInputAdapter } = require("../services/ownership-migration-input-adapter.js");
const { createOwnershipHistoryResolver } = require("../services/ownership-history-resolver.js");
const { createOwnershipProjectionComparator } = require("../services/ownership-projection-comparator.js");
const { createOwnershipHistoryCompletenessEvaluator } = require("../services/ownership-history-completeness-evaluator.js");
const { createOwnershipProvenanceMigrationDecisionService } = require("../services/ownership-provenance-migration-decision-service.js");
const { createOwnershipProvenanceCandidateDocumentBuilder } = require("../services/ownership-provenance-candidate-document-builder.js");
const { createOwnershipProvenanceMigrationPreparationCoordinator } = require("../services/ownership-provenance-migration-preparation-coordinator.js");
const { createOwnershipProvenanceCandidateVerifier } = require("../services/ownership-provenance-candidate-verifier.js");
const { createOwnershipHistoryStartupDecisionService } = require("../services/ownership-history-startup-decision-service.js");
const { createOwnershipProvenanceMigrationExecutionCoordinator } = require("../services/ownership-provenance-migration-execution-coordinator.js");
const { createOwnershipProvenanceMigrationStartup } = require("./ownership-provenance-migration-startup.js");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../services/ownership-history-provenance-document-serializer.js");

const FACTORY_FIELDS = new Set([
  "generationStore",
  "seasonId",
  "baseMapId",
  "resolveSeasonPackage",
  "createTargetCatalog",
  "createFreshServices",
  "createApplicationDocumentCodec",
  "codecOptionsFactory",
  "clock",
  "createTransactionId",
  "legacyInput"
]);

class OwnershipProvenanceMigrationStartupCompositionError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "OwnershipProvenanceMigrationStartupCompositionError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function fail(code, message, cause) {
  throw new OwnershipProvenanceMigrationStartupCompositionError(code, message, cause);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(value, fields, path) {
  if (!isRecord(value)) fail("invalid_factory", `${path} must be a plain object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (unknown.length > 0) fail("invalid_factory", `${path}.${unknown[0]} is not supported.`);
}

function requireFunction(value, path) {
  if (typeof value !== "function") fail("invalid_factory", `${path} must be a function.`);
}

function requireMethod(value, path, method) {
  if (!isRecord(value) || typeof value[method] !== "function") fail("invalid_factory", `${path}.${method} must be a function.`);
}

function createOwnershipProvenanceMigrationStartupComposition(options) {
  rejectUnknown(options, FACTORY_FIELDS, "options");
  requireMethod(options.generationStore, "options.generationStore", "loadCommittedGeneration");
  requireMethod(options.generationStore, "options.generationStore", "prepare");
  requireMethod(options.generationStore, "options.generationStore", "publish");
  ["resolveSeasonPackage", "createTargetCatalog", "createFreshServices", "createApplicationDocumentCodec", "codecOptionsFactory", "clock", "createTransactionId"].forEach((field) => requireFunction(options[field], `options.${field}`));
  if (typeof options.seasonId !== "string" || options.seasonId.trim() === "") fail("invalid_factory", "options.seasonId must be a non-empty string.");
  if (typeof options.baseMapId !== "string" || options.baseMapId.trim() === "") fail("invalid_factory", "options.baseMapId must be a non-empty string.");

  const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
  const freshServices = async () => {
    const fresh = await options.createFreshServices();
    if (!isRecord(fresh) || !isRecord(fresh.services)) fail("invalid_factory", "options.createFreshServices must return services.");
    const codecOptions = options.codecOptionsFactory(fresh, provenanceSerializer);
    if (!isRecord(codecOptions)) fail("invalid_factory", "options.codecOptionsFactory must return codec options.");
    return { services: fresh.services, codecOptions };
  };
  const graphLoader = createIsolatedApplicationGraphLoader({
    createFreshServices: freshServices,
    createApplicationDocumentCodec: options.createApplicationDocumentCodec
  });
  const snapshotAdapter = options.legacyInput
    ? createLegacyOwnershipProvenanceMigrationSnapshotAdapter({ legacyInput: options.legacyInput })
    : createCommittedGenerationMigrationSnapshotAdapter({
      generationStore: options.generationStore,
      seasonId: options.seasonId,
      baseMapId: options.baseMapId
    });
  const inputAdapter = createOwnershipMigrationInputAdapter({
    resolveSeasonPackage: options.resolveSeasonPackage,
    createTargetCatalog: options.createTargetCatalog
  });
  const evaluatorFactory = (evaluatorOptions) => createOwnershipHistoryCompletenessEvaluator({
    ...evaluatorOptions,
    ownershipHistoryResolver: createOwnershipHistoryResolver(evaluatorOptions),
    ownershipProjectionComparator: createOwnershipProjectionComparator()
  });
  const migrationDecisionService = createOwnershipProvenanceMigrationDecisionService({ createCompletenessEvaluator: evaluatorFactory });
  const startupDecisionService = createOwnershipHistoryStartupDecisionService({ createCompletenessEvaluator: evaluatorFactory });
  const preparationCoordinator = createOwnershipProvenanceMigrationPreparationCoordinator({
    generationStore: options.generationStore,
    snapshotAdapter,
    isolatedGraphLoader: graphLoader,
    migrationInputAdapter: inputAdapter,
    migrationDecisionService,
    provenanceSerializer,
    candidateDocumentBuilder: createOwnershipProvenanceCandidateDocumentBuilder(),
    clock: options.clock,
    createTransactionId: options.createTransactionId
  });
  const verifier = createOwnershipProvenanceCandidateVerifier({
    isolatedGraphLoader: graphLoader,
    resolveSeasonPackage: options.resolveSeasonPackage,
    createTargetCatalog: options.createTargetCatalog,
    createContextDecisionService: () => startupDecisionService
  });
  const executionCoordinator = createOwnershipProvenanceMigrationExecutionCoordinator({
    generationStore: options.generationStore,
    preparationCoordinator,
    candidateVerifier: verifier
  });
  const startupCoordinator = createOwnershipProvenanceMigrationStartup({
    generationStore: options.generationStore,
    executionCoordinator,
    allowMissingGeneration: Boolean(options.legacyInput)
  });
  return Object.freeze({ resolve: startupCoordinator.resolve });
}

module.exports = {
  createOwnershipProvenanceMigrationStartupComposition,
  OwnershipProvenanceMigrationStartupCompositionError
};
