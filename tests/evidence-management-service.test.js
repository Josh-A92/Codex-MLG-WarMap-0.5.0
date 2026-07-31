const assert = require("assert");
const {
  createEvidenceManagementService,
  EvidenceManagementServiceError
} = require("../src/services/evidence-management-service.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function setup() {
  const calls = [];
  const stored = new Map();
  let next = 0;
  const service = createEvidenceManagementService({
    authorizationPolicyService: {
      requireAuthorized(actor, capability, scope) {
        calls.push(["authorize", actor.actorId, capability, scope]);
        return { actorId: actor.actorId };
      }
    },
    evidenceAssetService: {
      getAsset(id) { return stored.get(id) || null; },
      addUploadedAsset(asset) {
        calls.push(["asset", asset]);
        stored.set(asset.assetId, asset);
        return asset;
      }
    },
    evidenceRecordService: {
      addEvidenceRecord(record) { calls.push(["record", record]); return record; }
    },
    clock: () => "2026-07-31T10:00:00.000Z",
    createId(kind) { next += 1; return `${kind}-${next}`; }
  });
  return { calls, stored, service };
}

const actor = { actorId: "contributor-1" };
const upload = {
  seasonId: "season-1",
  serverId: "366",
  storageRef: "storage://asset-1",
  mediaType: "image/jpeg",
  byteSize: 200000,
  pixelWidth: 1080,
  pixelHeight: 1920,
  observedAt: "2026-07-31T08:00:00Z",
  observationTimePrecision: "approximate",
  integrityHash: `sha256:${"a".repeat(64)}`
};

test("registers uploaded evidence with authoritative actor, time, and scope", () => {
  const { calls, service } = setup();
  const result = service.registerUploadedAsset(actor, {
    ...upload,
    sourceContext: { note: "Map screenshot" }
  });
  assert.strictEqual(result.assetId, "evidence_asset-1");
  assert.strictEqual(result.uploadedBy, "contributor-1");
  assert.strictEqual(result.uploadedAt, "2026-07-31T10:00:00.000Z");
  assert.strictEqual(result.processingState, "uploaded");
  assert.deepStrictEqual(result.sourceContext, {
    note: "Map screenshot",
    seasonId: "season-1",
    serverId: "366"
  });
  assert.deepStrictEqual(calls[0], [
    "authorize",
    "contributor-1",
    "server_state.edit",
    { seasonId: "season-1", serverId: "366" }
  ]);
});

test("creates a screenshot extraction proposal from registered asset scope", () => {
  const { service } = setup();
  const asset = service.registerUploadedAsset(actor, upload);
  const proposal = service.createExtractionProposal(actor, {
    assetId: asset.assetId,
    linkedEntityType: "CombatStrengthObservation",
    linkedEntityId: "combat-proposal-1",
    rawExtractedValue: "1.84B",
    normalizedValue: 1840000000,
    confidence: 0.92,
    notes: "Automated extraction"
  });
  assert.strictEqual(proposal.evidenceId, "evidence_record-2");
  assert.strictEqual(proposal.sourceType, "screenshot_extraction");
  assert.strictEqual(proposal.reviewState, "proposed");
  assert.strictEqual(proposal.actorId, "contributor-1");
  assert.strictEqual(proposal.observedAt, upload.observedAt);
  assert.strictEqual(proposal.reviewerId, null);
});

test("resolves evidence scope from trusted asset metadata", () => {
  const { service } = setup();
  const asset = service.registerUploadedAsset(actor, upload);
  assert.deepStrictEqual(
    service.resolveEvidenceScope({ assetId: asset.assetId }),
    { seasonId: "season-1", serverId: "366" }
  );
});

test("caller source context cannot override authorized season or server scope", () => {
  const { service } = setup();
  const asset = service.registerUploadedAsset(actor, {
    ...upload,
    sourceContext: { seasonId: "other", serverId: "999" }
  });
  assert.strictEqual(asset.sourceContext.seasonId, "season-1");
  assert.strictEqual(asset.sourceContext.serverId, "366");
});

test("unknown assets and unscoped assets fail clearly", () => {
  const { service, stored } = setup();
  assert.throws(
    () => service.createExtractionProposal(actor, {
      assetId: "missing",
      linkedEntityType: "X",
      linkedEntityId: "Y",
      rawExtractedValue: "",
      normalizedValue: null,
      confidence: 0.5
    }),
    (error) => error instanceof EvidenceManagementServiceError && error.code === "unknown_asset"
  );
  stored.set("unscoped", { assetId: "unscoped", sourceContext: {} });
  assert.throws(
    () => service.resolveEvidenceScope({ assetId: "unscoped" }),
    (error) => error instanceof EvidenceManagementServiceError
      && error.code === "invalid_input"
  );
});

test("operation inputs and factory dependencies are strict", () => {
  const { service } = setup();
  assert.throws(
    () => service.registerUploadedAsset(actor, { ...upload, extra: true }),
    (error) => error instanceof EvidenceManagementServiceError && error.code === "invalid_input"
  );
  assert.throws(
    () => createEvidenceManagementService({}),
    (error) => error instanceof EvidenceManagementServiceError && error.code === "invalid_factory"
  );
});

let passed = 0;
tests.forEach(({ name, fn }) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
});
console.log(`${passed} tests passed`);
