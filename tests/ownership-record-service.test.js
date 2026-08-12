const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createOwnershipRecordService,
  OwnershipRecordServiceError
} = require("../src/services/ownership-record-service.js");
const {
  validateTerritoryOwnershipRecord,
  validateTerritoryOwnershipHistory,
  validateStructureOwnershipRecord,
  validateStructureOwnershipHistory
} = require("../src/services/ownership-record-validator.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}
runTest.tests = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function territoryRecord(overrides) {
  return Object.assign({
    ownershipRecordId: "territory-1",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-07-01T00:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-07-01T00:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function structureRecord(overrides) {
  return Object.assign({
    structureOwnershipId: "structure-ownership-1",
    serverId: "server-366",
    seasonId: "season-1",
    structureId: "structure-royal-city-1",
    ownerUnionId: "union-1",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-07-01T00:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "actor-1",
    reviewerId: "reviewer-1",
    reviewedAt: "2026-07-01T00:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function territoryProposalRecord(overrides) {
  return territoryRecord(Object.assign({
    ownershipRecordId: "territory-proposal-1",
    reviewState: "proposed",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-1"],
    reviewerId: null,
    reviewedAt: null
  }, overrides || {}));
}

function structureProposalRecord(overrides) {
  return structureRecord(Object.assign({
    structureOwnershipId: "structure-proposal-1",
    reviewState: "proposed",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-1"],
    reviewerId: null,
    reviewedAt: null
  }, overrides || {}));
}

function serviceOptions(overrides) {
  return Object.assign({
    initialTerritoryRecords: [],
    initialStructureRecords: [],
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory,
       clock: () => new Date("2026-08-12T12:00:00.000Z"),
  }, overrides || {});
}

function createService(overrides) {
  return createOwnershipRecordService(serviceOptions(overrides));
}

function expectServiceError(fn, code, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof OwnershipRecordServiceError);
    assert.strictEqual(error.code, code);
    if (pattern) {
      assert.match(error.message, pattern);
    }
    return true;
  });
}

function territoryProposalInput(overrides) {
  return Object.assign({
    ownershipRecordId: "territory-proposal-new",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 2, col: 2 },
    ownerUnionId: "union-2",
    ownershipState: "owned",
    effectiveAt: "2026-07-02T00:00:00Z",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-2"],
    actorId: "actor-2"
  }, overrides || {});
}

function structureProposalInput(overrides) {
  return Object.assign({
    structureOwnershipId: "structure-proposal-new",
    serverId: "server-366",
    seasonId: "season-1",
    structureId: "structure-town-1",
    ownerUnionId: "union-2",
    ownershipState: "owned",
    effectiveAt: "2026-07-02T00:00:00Z",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-2"],
    actorId: "actor-2"
  }, overrides || {});
}

function territoryManualInput(overrides) {
  const input = territoryProposalInput(Object.assign({
    ownershipRecordId: "territory-manual-new",
    evidenceIds: [],
    reviewerId: "reviewer-2",
    reviewedAt: "2026-07-02T00:10:00Z"
  }, overrides || {}));
  delete input.sourceType;
  return input;
}

function structureManualInput(overrides) {
  const input = structureProposalInput(Object.assign({
    structureOwnershipId: "structure-manual-new",
    evidenceIds: [],
    reviewerId: "reviewer-2",
    reviewedAt: "2026-07-02T00:10:00Z"
  }, overrides || {}));
  delete input.sourceType;
  return input;
}

runTest("factory is strict accepts null-prototype options and binds validator this", () => {
  expectServiceError(() => createOwnershipRecordService({}), "invalid_input", /requires options/);
  expectServiceError(() => createOwnershipRecordService(serviceOptions({ extra: true })), "invalid_input", /field 'extra'/);
  expectServiceError(() => createOwnershipRecordService(serviceOptions({ validateTerritoryOwnershipRecord: null })), "invalid_input", /function/);
  expectServiceError(() => createOwnershipRecordService([]), "invalid_input", /plain object/);

  const options = Object.create(null);
  Object.assign(options, serviceOptions());
  let recordThis = null;
  let historyThis = null;
  options.validateTerritoryOwnershipRecord = function boundRecord(record) {
    recordThis = this;
    return validateTerritoryOwnershipRecord(record);
  };
  options.validateTerritoryOwnershipHistory = function boundHistory(records) {
    historyThis = this;
    return validateTerritoryOwnershipHistory(records);
  };

  const service = createOwnershipRecordService(options);
  service.proposeTerritoryRecord(territoryProposalInput());
  assert.strictEqual(recordThis, options);
  assert.strictEqual(historyThis, options);
  assert.deepStrictEqual(service.listTerritoryRecords().length, 1);
});

runTest("initialization list get has and current lookups work for both record types", () => {
  const service = createService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [structureRecord()]
  });

  assert.strictEqual(service.hasTerritoryRecord("territory-1"), true);
  assert.strictEqual(service.hasTerritoryRecord("missing"), false);
  assert.strictEqual(service.getTerritoryRecord("territory-1").ownerUnionId, "union-1");
  assert.strictEqual(service.getTerritoryRecord("missing"), null);
  assert.strictEqual(
    service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId,
    "territory-1"
  );

  assert.strictEqual(service.hasStructureRecord("structure-ownership-1"), true);
  assert.strictEqual(service.getStructureRecord("structure-ownership-1").structureId, "structure-royal-city-1");
  assert.strictEqual(
    service.getCurrentStructureRecord("server-366", "season-1", "structure-royal-city-1").structureOwnershipId,
    "structure-ownership-1"
  );
  assert.strictEqual(service.listTerritoryRecords().length, 1);
  assert.strictEqual(service.listStructureRecords().length, 1);
});

runTest("invalid initial histories fail construction", () => {
  expectServiceError(() => createService({
    initialTerritoryRecords: [
      territoryRecord({ ownershipRecordId: "duplicate" }),
      territoryRecord({ ownershipRecordId: "duplicate", territoryRef: { type: "normal_map_cell", row: 2, col: 2 } })
    ]
  }), "invalid_history");

  expectServiceError(() => createService({
    initialStructureRecords: [structureRecord({ reviewedAt: "2026-06-30T00:00:00Z" })]
  }), "invalid_history");
});

runTest("per-server per-season and per-target current records remain isolated", () => {
  const service = createService({
    initialTerritoryRecords: [
      territoryRecord({ ownershipRecordId: "a" }),
      territoryRecord({ ownershipRecordId: "b", serverId: "server-367" }),
      territoryRecord({ ownershipRecordId: "c", seasonId: "season-2" }),
      territoryRecord({ ownershipRecordId: "d", territoryRef: { type: "normal_map_cell", row: 1, col: 2 } })
    ],
    initialStructureRecords: [
      structureRecord({ structureOwnershipId: "sa" }),
      structureRecord({ structureOwnershipId: "sb", serverId: "server-367" }),
      structureRecord({ structureOwnershipId: "sc", structureId: "structure-town-2" })
    ]
  });

  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "a");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-367", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "b");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-2", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "c");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 2 }).ownershipRecordId, "d");
  assert.strictEqual(service.getCurrentStructureRecord("server-367", "season-1", "structure-royal-city-1").structureOwnershipId, "sb");
  assert.strictEqual(service.getCurrentStructureRecord("server-366", "season-1", "structure-town-2").structureOwnershipId, "sc");
});

runTest("tuple target keys are collision-safe", () => {
  const service = createService({
    initialTerritoryRecords: [
      territoryRecord({ ownershipRecordId: "tuple-a", seasonId: "a", serverId: "b\u0000c" }),
      territoryRecord({ ownershipRecordId: "tuple-b", seasonId: "a\u0000b", serverId: "c" })
    ],
    initialStructureRecords: [
      structureRecord({ structureOwnershipId: "tuple-sa", seasonId: "a", serverId: "b", structureId: "c\u0000d" }),
      structureRecord({ structureOwnershipId: "tuple-sb", seasonId: "a\u0000b", serverId: "c", structureId: "d" })
    ]
  });

  assert.strictEqual(service.getCurrentTerritoryRecord("b\u0000c", "a", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "tuple-a");
  assert.strictEqual(service.getCurrentTerritoryRecord("c", "a\u0000b", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "tuple-b");
  assert.strictEqual(service.getCurrentStructureRecord("b", "a", "c\u0000d").structureOwnershipId, "tuple-sa");
  assert.strictEqual(service.getCurrentStructureRecord("c", "a\u0000b", "d").structureOwnershipId, "tuple-sb");
});

runTest("safe copies input isolation and null-prototype targets are preserved", () => {
  const ref = Object.create(null);
  ref.type = "normal_map_cell";
  ref.row = 3;
  ref.col = 4;
  const initial = territoryRecord({ territoryRef: ref });
  const service = createService({ initialTerritoryRecords: [initial] });

  initial.ownerUnionId = "mutated";
  ref.row = 99;
  const first = service.getTerritoryRecord("territory-1");
  assert.strictEqual(first.ownerUnionId, "union-1");
  assert.strictEqual(first.territoryRef.row, 3);
  assert.strictEqual(Object.getPrototypeOf(first.territoryRef), null);

  first.ownerUnionId = "changed-output";
  assert.strictEqual(service.getTerritoryRecord("territory-1").ownerUnionId, "union-1");
});

runTest("__proto__ keys are cloned as safe own data properties", () => {
  const initial = territoryRecord();
  Object.defineProperty(initial, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    writable: true,
    configurable: true
  });
  const alwaysValid = () => ({ valid: true, errors: [], warnings: [] });
  const service = createService({
    initialTerritoryRecords: [initial],
    validateTerritoryOwnershipRecord: alwaysValid,
    validateTerritoryOwnershipHistory: alwaysValid
  });

  const output = service.getTerritoryRecord("territory-1");
  assert.strictEqual(Object.getPrototypeOf(output), Object.prototype);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(output, "__proto__"), true);
  assert.deepStrictEqual(output.__proto__, { polluted: true });
  assert.strictEqual({}.polluted, undefined);
});

runTest("strict filters support ownerUnionId null", () => {
  const service = createService({
    initialTerritoryRecords: [
      territoryRecord(),
      territoryRecord({
        ownershipRecordId: "territory-unclaimed",
        territoryRef: { type: "normal_map_cell", row: 2, col: 2 },
        ownerUnionId: null,
        ownershipState: "unclaimed"
      })
    ]
  });

  assert.deepStrictEqual(service.listTerritoryRecords({ ownerUnionId: null }).map((item) => item.ownershipRecordId), ["territory-unclaimed"]);
  assert.deepStrictEqual(service.listTerritoryRecords({ ownershipState: "owned" }).map((item) => item.ownershipRecordId), ["territory-1"]);
  expectServiceError(() => service.listTerritoryRecords({ unknown: true }), "invalid_input", /field 'unknown'/);
  expectServiceError(() => service.listTerritoryRecords({ reviewState: "other" }), "invalid_input");
  expectServiceError(() => service.listTerritoryRecords([]), "invalid_input");
});

runTest("territory and structure proposals are canonical and manual proposals are rejected", () => {
  const service = createService();
  const territory = service.proposeTerritoryRecord(territoryProposalInput());
  const structure = service.proposeStructureRecord(structureProposalInput());

  assert.strictEqual(territory.reviewState, "proposed");
  assert.strictEqual(territory.reviewerId, null);
  assert.strictEqual(territory.reviewedAt, null);
  assert.strictEqual(territory.supersededBy, null);
  assert.strictEqual(structure.reviewState, "proposed");
  assert.strictEqual(structure.sourceType, "screenshot_extraction");
  expectServiceError(() => service.proposeTerritoryRecord(territoryProposalInput({
    ownershipRecordId: "manual-proposal",
    sourceType: "manual_entry",
    evidenceIds: []
  })), "invalid_input", /manual_entry/);
});

runTest("manual confirmed replacement supersedes atomically and preserves original review audit", () => {
  const service = createService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [structureRecord()]
  });

  service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "territory-2",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    ownerUnionId: "union-2"
  }));
  service.addConfirmedManualStructureRecord(structureManualInput({
    structureOwnershipId: "structure-ownership-2",
    structureId: "structure-royal-city-1",
    ownerUnionId: "union-2"
  }));

  const oldTerritory = service.getTerritoryRecord("territory-1");
  assert.strictEqual(oldTerritory.reviewState, "superseded");
  assert.strictEqual(oldTerritory.supersededBy, "territory-2");
  assert.strictEqual(oldTerritory.reviewerId, "reviewer-1");
  assert.strictEqual(oldTerritory.reviewedAt, "2026-07-01T00:10:00Z");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "territory-2");

  const oldStructure = service.getStructureRecord("structure-ownership-1");
  assert.strictEqual(oldStructure.reviewState, "superseded");
  assert.strictEqual(oldStructure.reviewerId, "reviewer-1");
  assert.strictEqual(service.getCurrentStructureRecord("server-366", "season-1", "structure-royal-city-1").structureOwnershipId, "structure-ownership-2");
});

runTest("confirming proposals supersedes current records and rejecting proposals leaves current unchanged", () => {
  const service = createService({
    initialTerritoryRecords: [
      territoryRecord(),
      territoryProposalRecord({
        ownershipRecordId: "territory-proposal-replace",
        territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
        effectiveAt: "2026-07-02T00:00:00Z"
      }),
      territoryProposalRecord({
        ownershipRecordId: "territory-proposal-reject",
        territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
        effectiveAt: "2026-07-03T00:00:00Z"
      })
    ],
    initialStructureRecords: [
      structureRecord(),
      structureProposalRecord({
        structureOwnershipId: "structure-proposal-replace",
        structureId: "structure-royal-city-1",
        effectiveAt: "2026-07-02T00:00:00Z"
      })
    ]
  });

  service.confirmTerritoryProposal("territory-proposal-replace", {
    reviewerId: "reviewer-2",
    reviewedAt: "2026-07-02T00:10:00Z"
  });
  assert.strictEqual(service.getTerritoryRecord("territory-1").reviewState, "superseded");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "territory-proposal-replace");

  service.rejectTerritoryProposal("territory-proposal-reject", {
    reviewerId: "reviewer-3",
    reviewedAt: "2026-07-03T00:10:00Z"
  });
  assert.strictEqual(service.getTerritoryRecord("territory-proposal-reject").reviewState, "rejected");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 1, col: 1 }).ownershipRecordId, "territory-proposal-replace");

  service.confirmStructureProposal("structure-proposal-replace", {
    reviewerId: "reviewer-2",
    reviewedAt: "2026-07-02T00:10:00Z"
  });
  assert.strictEqual(service.getStructureRecord("structure-ownership-1").reviewState, "superseded");
});

runTest("duplicate unknown and invalid transition errors do not mutate state", () => {
  const service = createService({ initialTerritoryRecords: [territoryRecord()] });
  const before = service.listTerritoryRecords();

  expectServiceError(() => service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "territory-1"
  })), "duplicate_record_id");
  expectServiceError(() => service.confirmTerritoryProposal("missing", {
    reviewerId: "reviewer",
    reviewedAt: "2026-07-02T00:00:00Z"
  }), "unknown_record");
  expectServiceError(() => service.rejectTerritoryProposal("territory-1", {
    reviewerId: "reviewer",
    reviewedAt: "2026-07-02T00:00:00Z"
  }), "invalid_transition");
  assert.deepStrictEqual(service.listTerritoryRecords(), before);
});

runTest("invalid replacement history rolls back both record collections", () => {
  const service = createService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [structureRecord()]
  });
  const territoryBefore = service.listTerritoryRecords();
  const structureBefore = service.listStructureRecords();

  expectServiceError(() => service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "territory-too-early",
    territoryRef: { type: "normal_map_cell", row: 1, col: 1 },
    effectiveAt: "2026-06-30T00:00:00Z",
    reviewedAt: "2026-07-02T00:10:00Z"
  })), "invalid_history");

  assert.deepStrictEqual(service.listTerritoryRecords(), territoryBefore);
  assert.deepStrictEqual(service.listStructureRecords(), structureBefore);
});

runTest("validator throw and malformed history result roll back state", () => {
  const throwing = createService({
    validateTerritoryOwnershipRecord(record) {
      if (record.ownershipRecordId === "throw-record") {
        throw new Error("boom");
      }
      return validateTerritoryOwnershipRecord(record);
    }
  });
  expectServiceError(() => throwing.proposeTerritoryRecord(territoryProposalInput({
    ownershipRecordId: "throw-record"
  })), "invalid_history");
  assert.deepStrictEqual(throwing.listTerritoryRecords(), []);

  const malformed = createService({
    validateTerritoryOwnershipHistory(records) {
      if (records.length > 0) {
        return {};
      }
      return validateTerritoryOwnershipHistory(records);
    }
  });
  expectServiceError(() => malformed.proposeTerritoryRecord(territoryProposalInput()), "invalid_history");
  assert.deepStrictEqual(malformed.listTerritoryRecords(), []);
});

runTest("territory and structure mutation failures remain isolated", () => {
  const service = createService({
    initialStructureRecords: [structureRecord()]
  });
  const structureBefore = service.listStructureRecords();
  expectServiceError(() => service.proposeTerritoryRecord(territoryProposalInput({
    evidenceIds: []
  })), "invalid_history");
  assert.deepStrictEqual(service.listTerritoryRecords(), []);
  assert.deepStrictEqual(service.listStructureRecords(), structureBefore);
});

runTest("transaction snapshots restore territory and structure history atomically", () => {
  const service = createService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [structureRecord()]
  });
  const snapshot = service.captureTransactionState();

  service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "territory-2",
    territoryRef: { type: "normal_map_cell", row: 2, col: 2 }
  }));
  service.addConfirmedManualStructureRecord(structureManualInput({
    structureOwnershipId: "structure-ownership-2",
    structureId: "town-2"
  }));
  service.restoreTransactionState(snapshot);

  assert.deepStrictEqual(service.listTerritoryRecords(), snapshot.territoryRecords);
  assert.deepStrictEqual(service.listStructureRecords(), snapshot.structureRecords);
  snapshot.territoryRecords[0].ownerUnionId = "mutated";
  assert.strictEqual(service.getTerritoryRecord("territory-1").ownerUnionId, "union-1");
});

runTest("new ownership records receive recordedAt from the injected clock and preserve exact compatibility", () => {
  const service = createService();
  const created = service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "clocked",
    effectiveAt: "2026-08-12T10:00:00Z",
    observedAt: "2026-08-12T11:00:00Z",
    reviewedAt: "2026-08-12T12:10:00Z"
  }));
  assert.strictEqual(created.eventAt.precision, "exact");
  assert.strictEqual(created.eventAt.at, created.effectiveAt);
  assert.strictEqual(created.recordedAt, "2026-08-12T12:00:00.000Z");
  assert.strictEqual(created.observedAt, "2026-08-12T11:00:00Z");
  assert.strictEqual(created.recordedAtLegacyUnknown, false);
  assert.throws(() => service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "forged", recordedAt: "2026-08-12T11:00:00Z", reviewedAt: "2026-08-12T12:10:00Z"
  })), (error) => error.code === "caller_recorded_at");
});

runTest("ownership records retain bounded and unknown event times without entering current projection", () => {
  const service = createService();
  const bounded = service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "bounded", territoryRef: { type: "normal_map_cell", row: 4, col: 4 },
    eventAt: { precision: "bounded", earliestAt: "2026-08-12T09:00:00Z", latestAt: "2026-08-12T11:00:00Z" },
    reviewedAt: "2026-08-12T12:10:00Z"
  }));
  const unknown = service.addConfirmedManualTerritoryRecord(territoryManualInput({
    ownershipRecordId: "unknown", territoryRef: { type: "normal_map_cell", row: 5, col: 5 },
    eventAt: { precision: "unknown" }, reviewedAt: "2026-08-12T12:10:00Z"
  }));
  assert.strictEqual(bounded.eventAt.precision, "bounded");
  assert.strictEqual(unknown.eventAt.precision, "unknown");
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 4, col: 4 }), null);
  assert.strictEqual(service.getCurrentTerritoryRecord("server-366", "season-1", { type: "normal_map_cell", row: 5, col: 5 }), null);
});

runTest("invalid transaction snapshot leaves both ownership collections unchanged", () => {
  const service = createService({
    initialTerritoryRecords: [territoryRecord()],
    initialStructureRecords: [structureRecord()]
  });
  const before = service.captureTransactionState();
  const invalid = clone(before);
  invalid.structureRecords[0].structureId = "";

  expectServiceError(
    () => service.restoreTransactionState(invalid),
    "invalid_history"
  );
  assert.deepStrictEqual(service.captureTransactionState(), before);
});

runTest("plain-object boundaries reject class instances and invalid targets", () => {
  class InputRecord {}
  const service = createService();
  expectServiceError(() => service.proposeTerritoryRecord(new InputRecord()), "invalid_input");
  expectServiceError(() => service.getCurrentTerritoryRecord("server", "season", new Date()), "invalid_input");
  expectServiceError(() => service.getCurrentStructureRecord("server", "season", "  "), "invalid_input");
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createOwnershipRecordService, "function");
  assert.strictEqual(typeof OwnershipRecordServiceError, "function");

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-record-service.js"), "utf8");
  const sandbox = { globalThis: {}, module: undefined, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.strictEqual(typeof sandbox.globalThis.createOwnershipRecordService, "function");
  assert.strictEqual(typeof sandbox.globalThis.OwnershipRecordServiceError, "function");
});

runTest("source is infrastructure-free", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ownership-record-service.js"), "utf8");
  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB/.test(source));
});

if (require.main === module) {
  let passed = 0;
  runTest.tests.forEach(({ name, fn }) => {
    try {
      fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  });
  console.log(`\n${passed} tests passed`);
}
