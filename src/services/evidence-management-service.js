(function initializeEvidenceManagementServiceFactory(globalScope) {
  const FACTORY_FIELDS = new Set([
    "authorizationPolicyService",
    "evidenceAssetService",
    "evidenceRecordService",
    "clock",
    "createId"
  ]);
  const ASSET_INPUT_FIELDS = new Set([
    "seasonId", "serverId", "storageRef", "ingestionSource", "mediaType", "byteSize",
    "pixelWidth", "pixelHeight", "observedAt", "observationTimePrecision",
    "integrityHash", "sourceContext"
  ]);
  const PROPOSAL_INPUT_FIELDS = new Set([
    "assetId", "linkedEntityType", "linkedEntityId", "rawExtractedValue",
    "normalizedValue", "confidence", "notes"
  ]);
  const ATTACHMENT_INPUT_FIELDS = new Set([
    "assetId", "linkedEntityType", "linkedEntityId", "notes"
  ]);

  class EvidenceManagementServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "EvidenceManagementServiceError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new EvidenceManagementServiceError(code, message);
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
    if (!isRecord(value)) fail("invalid_input", `Evidence Management Service requires ${path}.`);
    return value;
  }

  function requireFields(value, allowed, required, path) {
    const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_input", `Evidence Management Service does not recognize ${path}.${unknown[0]}.`);
    }
    required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail("invalid_input", `Evidence Management Service requires ${path}.${field}.`);
      }
    });
  }

  function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_input", `Evidence Management Service requires ${path} to be non-empty.`);
    }
    return value;
  }

  function bindInterface(value, path, methods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Evidence Management Service requires ${path}.`);
    }
    return methods.reduce((output, method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Evidence Management Service requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
      return output;
    }, {});
  }

  function createEvidenceManagementService(options) {
    if (!isRecord(options)) fail("invalid_factory", "Evidence Management Service requires options.");
    const unknown = Object.keys(options).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Evidence Management Service does not recognize options.${unknown[0]}.`);
    }
    FACTORY_FIELDS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(options, field)) {
        fail("invalid_factory", `Evidence Management Service requires options.${field}.`);
      }
    });
    if (typeof options.clock !== "function" || typeof options.createId !== "function") {
      fail("invalid_factory", "Evidence Management Service requires clock and createId functions.");
    }

    const authorization = bindInterface(
      options.authorizationPolicyService,
      "options.authorizationPolicyService",
      ["requireAuthorized"]
    );
    const assets = bindInterface(
      options.evidenceAssetService,
      "options.evidenceAssetService",
      ["getAsset", "addUploadedAsset"]
    );
    const evidence = bindInterface(
      options.evidenceRecordService,
      "options.evidenceRecordService",
      ["addEvidenceRecord"]
    );
    const clock = options.clock.bind(options);
    const createId = options.createId.bind(options);

    function now() {
      const value = clock();
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
        fail("invalid_dependency", "Evidence Management Service requires clock to return a timestamp.");
      }
      return value;
    }

    function nextId(kind) {
      return requireString(createId(kind), `createId('${kind}')`);
    }

    function requireScope(value, path) {
      return {
        seasonId: requireString(value.seasonId, `${path}.seasonId`),
        serverId: requireString(value.serverId, `${path}.serverId`)
      };
    }

    function authorize(actor, scope) {
      return authorization.requireAuthorized(actor, "server_state.edit", scope);
    }

    function registerUploadedAsset(actor, input) {
      const value = requireRecord(input, "input");
      requireFields(
        value,
        ASSET_INPUT_FIELDS,
        new Set([
          "seasonId", "serverId", "storageRef", "mediaType", "byteSize", "pixelWidth",
          "pixelHeight", "observedAt", "observationTimePrecision", "integrityHash"
        ]),
        "input"
      );
      const scope = requireScope(value, "input");
      const decision = authorize(actor, scope);
      const uploadedAt = now();
      const extraContext = value.sourceContext === undefined ? {} : requireRecord(value.sourceContext, "input.sourceContext");
      const sourceContext = clone(extraContext);
      defineOwn(sourceContext, "seasonId", scope.seasonId);
      defineOwn(sourceContext, "serverId", scope.serverId);
      return assets.addUploadedAsset({
        assetId: nextId("evidence_asset"),
        storageRef: value.storageRef,
        ingestionSource: value.ingestionSource || "application_upload",
        mediaType: value.mediaType,
        byteSize: value.byteSize,
        pixelWidth: value.pixelWidth,
        pixelHeight: value.pixelHeight,
        uploadedBy: decision.actorId,
        uploadedAt,
        observedAt: value.observedAt,
        observationTimePrecision: value.observationTimePrecision,
        integrityHash: value.integrityHash,
        processingState: "uploaded",
        processedAt: null,
        failureReason: null,
        sourceContext
      });
    }

    function scopeFromAsset(asset) {
      if (!isRecord(asset.sourceContext)) {
        fail("invalid_evidence_scope", `Evidence asset '${asset.assetId}' has no server scope.`);
      }
      return requireScope(asset.sourceContext, "asset.sourceContext");
    }

    function resolveEvidenceScope(record) {
      const value = requireRecord(record, "record");
      const assetId = requireString(value.assetId, "record.assetId");
      const asset = assets.getAsset(assetId);
      if (!asset) fail("unknown_asset", `Evidence Management Service could not find asset '${assetId}'.`);
      return scopeFromAsset(asset);
    }

    function createExtractionProposal(actor, input) {
      const value = requireRecord(input, "input");
      requireFields(
        value,
        PROPOSAL_INPUT_FIELDS,
        new Set([
          "assetId", "linkedEntityType", "linkedEntityId", "rawExtractedValue",
          "normalizedValue", "confidence"
        ]),
        "input"
      );
      const assetId = requireString(value.assetId, "input.assetId");
      const asset = assets.getAsset(assetId);
      if (!asset) fail("unknown_asset", `Evidence Management Service could not find asset '${assetId}'.`);
      const scope = scopeFromAsset(asset);
      const decision = authorize(actor, scope);
      return evidence.addEvidenceRecord({
        evidenceId: nextId("evidence_record"),
        assetId,
        sourceType: "screenshot_extraction",
        rawExtractedValue: value.rawExtractedValue,
        normalizedValue: clone(value.normalizedValue),
        confidence: value.confidence,
        observedAt: asset.observedAt,
        reviewState: "proposed",
        actorId: decision.actorId,
        reviewerId: null,
        reviewedAt: null,
        notes: value.notes === undefined ? null : value.notes,
        linkedEntityType: value.linkedEntityType,
        linkedEntityId: value.linkedEntityId,
        supersededBy: null
      });
    }

    function createManualAttachment(actor, input) {
      const value = requireRecord(input, "input");
      requireFields(
        value,
        ATTACHMENT_INPUT_FIELDS,
        new Set(["assetId", "linkedEntityType", "linkedEntityId"]),
        "input"
      );
      const assetId = requireString(value.assetId, "input.assetId");
      const asset = assets.getAsset(assetId);
      if (!asset) fail("unknown_asset", `Evidence Management Service could not find asset '${assetId}'.`);
      const scope = scopeFromAsset(asset);
      const decision = authorize(actor, scope);
      const reviewedAt = now();
      return evidence.addEvidenceRecord({
        evidenceId: nextId("evidence_record"),
        assetId,
        sourceType: "manual_entry",
        rawExtractedValue: null,
        normalizedValue: null,
        confidence: null,
        observedAt: asset.observedAt,
        reviewState: "confirmed",
        actorId: decision.actorId,
        reviewerId: decision.actorId,
        reviewedAt,
        notes: value.notes === undefined ? null : value.notes,
        linkedEntityType: requireString(value.linkedEntityType, "input.linkedEntityType"),
        linkedEntityId: requireString(value.linkedEntityId, "input.linkedEntityId"),
        supersededBy: null
      });
    }

    return Object.freeze({
      registerUploadedAsset,
      createExtractionProposal,
      createManualAttachment,
      resolveEvidenceScope
    });
  }

  const exportsObject = {
    createEvidenceManagementService,
    EvidenceManagementServiceError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
