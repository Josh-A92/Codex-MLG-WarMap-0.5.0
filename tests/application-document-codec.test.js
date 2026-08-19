const assert = require("assert");
const { createApplicationDocumentCodec } = require("../src/services/application-document-codec.js");
const { createWarMapApplicationPersistenceCoordinator } = require("../src/services/warmap-application-persistence-composition.js");

const context = { seasonId: "season-1", baseMapId: "season1-map" };
const provenanceDocumentId = `ownership-provenance:${context.seasonId}:${context.baseMapId}`;

function participant(name, calls, state) {
  return {
    restoreTransactionState(value) {
      calls.push(name);
      state.value = structuredClone(value);
    }
  };
}

function graph(includeProvenance = true) {
  const calls = [];
  const state = {};
  const strategicDomainRuntime = {
    relationService: participant("relations", calls, state),
    nativeAssignmentService: participant("nativeAssignments", calls, state),
    activeStatusService: participant("activeStatuses", calls, state),
    combatStrengthObservationService: participant("combatStrengthObservations", calls, state),
    serverObservationService: participant("serverObservations", calls, state),
    ownershipRecordService: participant("ownershipRecords", calls, state),
    ownershipRetractionService: participant("ownershipRetractions", calls, state),
    targetVerificationService: participant("targetVerifications", calls, state),
    confirmedSnapshotService: participant("confirmedSnapshots", calls, state),
    activityFactHistoryService: participant("activityFacts", calls, state)
  };
  const evidenceDomainRuntime = {
    evidenceAssetService: participant("evidenceAssets", calls, state),
    evidenceRecordService: participant("evidenceRecords", calls, state)
  };
  const services = {
    unionRegistryService: participant("unionRegistry", calls, state),
    strategicDomainRuntime,
    evidenceDomainRuntime,
    serverStateService: {
      hasServer: (id) => Boolean(state.servers && state.servers.some((server) => server.id === id)),
      registerServer(server) { calls.push("registerServer"); state.servers = (state.servers || []).concat([server]); },
      replaceTerritoryOwnership(value) { calls.push("projection",); state.ownership = structuredClone(value); }
    },
    seasonAdministrationService: participant("seasonAdministration", calls, state),
    applicationAuditRecordService: participant("applicationAudit", calls, state)
  };
  if (includeProvenance) services.ownershipHistoryProvenanceStateService = {
    restoreState(value) { calls.push("provenance"); state.provenance = structuredClone(value); }
  };
  return { calls, state, services };
}

function serializers() {
  return {
    deserializeUnionRegistryEnvelope: (value) => value,
    deserializeStrategicDomainEnvelope: (value) => {
      if (value === null) throw new Error("malformed strategic document");
      return value;
    },
    deserializeEvidenceEnvelope: (value) => value,
    deserializeServerState: (value) => value,
    deserializeApplicationAuditEnvelope: (value) => value,
    provenanceSerializer: {
      createDocumentId: () => provenanceDocumentId,
      deserialize: (value) => ({ status: "present", document: value })
    }
  };
}

function documents({ includeAudit = true, includeProvenance = true } = {}) {
  const result = [
    { documentId: "union-registry-global", value: { identities: ["union-1"] } },
    { documentId: "strategic-season-1", value: { state: {
      relations: ["relation"], nativeAssignments: ["assignment"], activeStatuses: ["status"],
      combatStrengthObservations: ["strength"], serverObservations: ["observation"],
      territoryOwnershipRecords: ["territory"], structureOwnershipRecords: ["structure"],
      ownershipRetractions: ["retraction"],
      targetVerifications: ["verification"], confirmedSnapshots: ["snapshot"],
      confirmedPresenceFacts: ["presence"], qualifyingFullMapConfirmations: ["confirmation"]
    } } },
    { documentId: "evidence-season-1", value: { assets: ["asset"], evidenceRecords: ["evidence"] } },
    { documentId: "projection-season-1-season1-map", value: { servers: [{ id: "server-366", label: "366", ownership: { "1-1": "union-1" } }] } },
    { documentId: "season-administration", value: { schemaVersion: 2, activeSeason: null, completedSeasons: [] } }
  ];
  if (includeAudit) result.push({ documentId: "application-audit-global", value: { records: ["audit"] } });
  if (includeProvenance) result.push({ documentId: provenanceDocumentId, value: { documentId: provenanceDocumentId, records: ["provenance"] } });
  return result;
}

function codecFor(target) {
  return createApplicationDocumentCodec({
    seasonId: context.seasonId,
    baseMapId: context.baseMapId,
    services: target.services,
    ...serializers()
  });
}

async function captureCompositionCodec(target) {
  let captured;
  createWarMapApplicationPersistenceCoordinator({
    generationStore: { loadCommittedGeneration: async () => ({ status: "missing" }), commit: async () => ({ generation: 1 }) },
    mutationCoordinator: { execute: async (mutation) => mutation() },
    legacyStateClassifier: { classify: () => ({ status: "first_run" }) },
    ...target.services,
    applicationAuditRecordService: target.services.applicationAuditRecordService,
    serializeApplicationAuditRecords: () => ({}),
    deserializeApplicationAuditEnvelope: serializers().deserializeApplicationAuditEnvelope,
    serializeUnionRegistry: () => ({}),
    deserializeUnionRegistryEnvelope: serializers().deserializeUnionRegistryEnvelope,
    serializeStrategicDomainRuntime: () => ({}),
    deserializeStrategicDomainEnvelope: serializers().deserializeStrategicDomainEnvelope,
    serializeEvidenceRuntime: () => ({}),
    deserializeEvidenceEnvelope: serializers().deserializeEvidenceEnvelope,
    serializeServerState: () => ({}),
    deserializeServerState: serializers().deserializeServerState,
    seasonId: context.seasonId,
    baseMapId: context.baseMapId,
    createTransactionId: () => "tx",
    clock: () => new Date("2026-08-13T00:00:00.000Z"),
    ownershipHistoryProvenanceSerializer: serializers().provenanceSerializer,
    createApplicationPersistenceCoordinator: (options) => {
      captured = options;
      return options;
    }
  });
  return captured;
}

async function runParity(includeAudit = true, includeProvenance = true) {
  const compositionGraph = graph(includeProvenance);
  const extractedGraph = graph(includeProvenance);
  const composition = await captureCompositionCodec(compositionGraph);
  const direct = codecFor(extractedGraph);
  const input = documents({ includeAudit, includeProvenance });
  const compositionState = await composition.deserializeDocuments(input);
  const directState = await direct.deserializeDocuments(input);
  await composition.applyState(compositionState);
  await direct.applyState(directState);
  return { compositionGraph, extractedGraph, compositionState, directState };
}

(async () => {
  const parity = await runParity();
  assert.deepStrictEqual(parity.compositionState, parity.directState);
  assert.deepStrictEqual(parity.compositionGraph.state, parity.extractedGraph.state);
  assert.deepStrictEqual(parity.compositionGraph.calls, parity.extractedGraph.calls);
  assert.deepStrictEqual(parity.compositionGraph.calls, [
    "unionRegistry", "relations", "nativeAssignments", "activeStatuses", "combatStrengthObservations",
    "serverObservations", "ownershipRecords", "ownershipRetractions", "targetVerifications", "confirmedSnapshots", "activityFacts",
    "evidenceAssets", "evidenceRecords", "registerServer", "projection", "seasonAdministration",
    "applicationAudit", "provenance"
  ]);
  console.log("PASS extracted codec matches production composition restoration");

  const optional = await runParity(false, false);
  assert.deepStrictEqual(optional.compositionState, optional.directState);
  assert.deepStrictEqual(optional.compositionState.applicationAudit, { schemaVersion: 1, records: [] });
  assert.strictEqual(optional.compositionState.ownershipHistoryProvenance, null);
  assert.deepStrictEqual(optional.compositionGraph.state, optional.extractedGraph.state);
  console.log("PASS missing audit and provenance defaults remain compatible");

  const malformed = graph();
  const codec = codecFor(malformed);
  const badDocuments = documents();
  badDocuments.find((document) => document.documentId === "strategic-season-1").value = null;
  await assert.rejects(() => codec.deserializeDocuments(badDocuments));
  console.log("PASS malformed document rejection remains delegated to deserializers");

  assert.strictEqual(typeof codec.serializeDocuments, "undefined");
  assert.strictEqual(typeof codec.commit, "undefined");
  assert.strictEqual(typeof codec.prepare, "undefined");
  assert.strictEqual(typeof codec.publish, "undefined");
  console.log("PASS codec exposes restoration only");

  console.log("4 application document codec scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
