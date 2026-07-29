const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

function territory(overrides) {
  return Object.assign({
    ownershipRecordId: "territory-own-1",
    serverId: "server-366",
    seasonId: "season-1",
    territoryRef: { type: "normal_map_cell", row: 4, col: 7 },
    ownerUnionId: "union-mlg",
    ownershipState: "owned",
    reviewState: "confirmed",
    effectiveAt: "2026-07-29T08:00:00Z",
    sourceType: "manual_entry",
    evidenceIds: [],
    actorId: "user-1",
    reviewerId: "user-2",
    reviewedAt: "2026-07-29T08:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function structure(overrides) {
  return Object.assign({
    structureOwnershipId: "structure-own-1",
    serverId: "server-366",
    seasonId: "season-1",
    structureId: "structure-royal-city-1",
    ownerUnionId: null,
    ownershipState: "unclaimed",
    reviewState: "confirmed",
    effectiveAt: "2026-07-29T08:00:00Z",
    sourceType: "screenshot_extraction",
    evidenceIds: ["evidence-1"],
    actorId: "user-1",
    reviewerId: "user-2",
    reviewedAt: "2026-07-29T08:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function supersededTerritory(id, replacementId, overrides) {
  return territory(Object.assign({
    ownershipRecordId: id,
    reviewState: "superseded",
    supersededBy: replacementId
  }, overrides || {}));
}

function assertError(result, code, pathValue) {
  assert.ok(
    result.errors.some((error) => error.code === code && (!pathValue || error.path === pathValue)),
    `Expected ${code}${pathValue ? ` at ${pathValue}` : ""}; got ${JSON.stringify(result.errors)}`
  );
}

runTest("accepts canonical territory and structure ownership records", () => {
  assert.strictEqual(validateTerritoryOwnershipRecord(territory()).valid, true);
  assert.strictEqual(validateStructureOwnershipRecord(structure()).valid, true);
});

runTest("accepts all four review lifecycle shapes", () => {
  const proposed = territory({
    reviewState: "proposed",
    reviewerId: null,
    reviewedAt: null,
    supersededBy: null
  });
  const rejected = territory({
    reviewState: "rejected",
    supersededBy: null
  });
  const superseded = supersededTerritory("old", "new");

  assert.strictEqual(validateTerritoryOwnershipRecord(proposed).valid, true);
  assert.strictEqual(validateTerritoryOwnershipRecord(rejected).valid, true);
  assert.strictEqual(validateTerritoryOwnershipRecord(superseded).valid, true);
});

runTest("accepts ordinary and null-prototype records", () => {
  const source = territory();
  const record = Object.assign(Object.create(null), source);
  record.territoryRef = Object.assign(Object.create(null), source.territoryRef);
  assert.strictEqual(validateTerritoryOwnershipRecord(record).valid, true);
});

runTest("rejects non-record inputs and exotic objects", () => {
  class Candidate {}
  [null, [], new Date(), new Map(), new Set(), new Candidate(), function candidate() {}].forEach((value) => {
    assertError(validateTerritoryOwnershipRecord(value), "INVALID_OBJECT");
  });
});

runTest("requires exact canonical fields and rejects unknown fields deterministically", () => {
  const record = territory({ extraZ: true, extraA: true });
  delete record.actorId;
  const result = validateTerritoryOwnershipRecord(record);
  assertError(result, "MISSING_REQUIRED_FIELD", "actorId");
  assert.deepStrictEqual(
    result.errors.filter((error) => error.code === "UNKNOWN_FIELD").map((error) => error.path),
    ["extraA", "extraZ"]
  );
});

runTest("enforces ownership-state and owner correspondence", () => {
  assertError(
    validateTerritoryOwnershipRecord(territory({ ownerUnionId: null })),
    "INVALID_LIFECYCLE",
    "ownerUnionId"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ ownershipState: "unclaimed" })),
    "INVALID_LIFECYCLE",
    "ownerUnionId"
  );
  assert.strictEqual(
    validateTerritoryOwnershipRecord(territory({ ownershipState: "unknown", ownerUnionId: null })).valid,
    true
  );
});

runTest("accepts each canonical source type with required evidence", () => {
  const sourceTypes = [
    "manual_entry",
    "screenshot_extraction",
    "imported_data",
    "api_integration",
    "bot_integration"
  ];
  sourceTypes.forEach((sourceType) => {
    const evidenceIds = sourceType === "manual_entry" ? [] : [`evidence-${sourceType}`];
    assert.strictEqual(validateTerritoryOwnershipRecord(territory({ sourceType, evidenceIds })).valid, true);
  });
});

runTest("rejects missing, duplicate, and malformed evidence", () => {
  assertError(
    validateTerritoryOwnershipRecord(territory({ sourceType: "api_integration", evidenceIds: [] })),
    "MISSING_EVIDENCE",
    "evidenceIds"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ evidenceIds: ["evidence-1", "evidence-1"] })),
    "DUPLICATE_ID",
    "evidenceIds[1]"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ evidenceIds: ["   "] })),
    "INVALID_STRING",
    "evidenceIds[0]"
  );
});

runTest("validates canonical territory references strictly", () => {
  assertError(
    validateTerritoryOwnershipRecord(territory({ territoryRef: { type: "structure_footprint", row: 1, col: 1 } })),
    "INVALID_ENUM",
    "territoryRef.type"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ territoryRef: { type: "normal_map_cell", row: 0, col: 1 } })),
    "INVALID_INTEGER",
    "territoryRef.row"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({
      territoryRef: { type: "normal_map_cell", row: 1, col: 1, extra: true }
    })),
    "UNKNOWN_FIELD",
    "territoryRef.extra"
  );
});

runTest("requires stable non-whitespace logical structure identity", () => {
  assertError(validateStructureOwnershipRecord(structure({ structureId: "  " })), "INVALID_STRING", "structureId");
});

runTest("accepts UTC timestamps with zero to three fractional digits", () => {
  [
    "2026-07-29T08:00:00Z",
    "2026-07-29T08:00:00.1Z",
    "2026-07-29T08:00:00.12Z",
    "2026-07-29T08:00:00.123Z"
  ].forEach((effectiveAt) => {
    assert.strictEqual(validateTerritoryOwnershipRecord(territory({
      effectiveAt,
      reviewedAt: "2026-07-29T08:10:00Z"
    })).valid, true);
  });
});

runTest("rejects malformed, offset, over-precise, and impossible timestamps", () => {
  [
    "2026-07-29T08:00:00",
    "2026-07-29T08:00:00+01:00",
    "2026-07-29T08:00:00.1234Z",
    "2026-02-30T08:00:00Z"
  ].forEach((effectiveAt) => {
    assertError(validateTerritoryOwnershipRecord(territory({ effectiveAt })), "INVALID_TIMESTAMP", "effectiveAt");
  });
});

runTest("requires review audit time not earlier than fact time", () => {
  assertError(
    validateTerritoryOwnershipRecord(territory({ reviewedAt: "2026-07-29T07:59:59Z" })),
    "INVALID_LIFECYCLE",
    "reviewedAt"
  );
});

runTest("enforces proposed and reviewed lifecycle nullability", () => {
  assertError(
    validateTerritoryOwnershipRecord(territory({ reviewState: "proposed" })),
    "INVALID_LIFECYCLE",
    "reviewerId"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ reviewerId: null })),
    "INVALID_LIFECYCLE",
    "reviewerId"
  );
  assertError(
    validateTerritoryOwnershipRecord(territory({ supersededBy: "unexpected" })),
    "INVALID_LIFECYCLE",
    "supersededBy"
  );
});

runTest("accepts empty histories and canonical structure history", () => {
  assert.strictEqual(validateTerritoryOwnershipHistory([]).valid, true);
  assert.strictEqual(validateStructureOwnershipHistory([structure()]).valid, true);
});

runTest("rejects non-array history and duplicate record IDs", () => {
  assertError(validateTerritoryOwnershipHistory({}), "INVALID_ARRAY", "records");
  const result = validateTerritoryOwnershipHistory([
    territory({ ownershipRecordId: "duplicate" }),
    territory({ ownershipRecordId: "duplicate", territoryRef: { type: "normal_map_cell", row: 5, col: 7 } })
  ]);
  assertError(result, "DUPLICATE_RECORD_ID", "records[1].ownershipRecordId");
});

runTest("allows only one current confirmed record per exact target", () => {
  const result = validateTerritoryOwnershipHistory([
    territory({ ownershipRecordId: "current-1" }),
    territory({ ownershipRecordId: "current-2", effectiveAt: "2026-07-29T09:00:00Z", reviewedAt: "2026-07-29T09:05:00Z" })
  ]);
  assertError(result, "MULTIPLE_CURRENT_OWNERSHIP_RECORDS", "records[1].reviewState");
});

runTest("current-record uniqueness is scoped to server season and target", () => {
  const records = [
    territory({ ownershipRecordId: "a" }),
    territory({ ownershipRecordId: "b", serverId: "server-367" }),
    territory({ ownershipRecordId: "c", seasonId: "season-2" }),
    territory({ ownershipRecordId: "d", territoryRef: { type: "normal_map_cell", row: 4, col: 8 } })
  ];
  assert.strictEqual(validateTerritoryOwnershipHistory(records).valid, true);
});

runTest("tuple grouping is collision-safe when IDs contain null characters", () => {
  const records = [
    territory({ ownershipRecordId: "tuple-a", serverId: "a", seasonId: "b\u0000c" }),
    territory({ ownershipRecordId: "tuple-b", serverId: "a\u0000b", seasonId: "c" })
  ];
  assert.strictEqual(validateTerritoryOwnershipHistory(records).valid, true);
});

runTest("requires supersession replacement to exist and differ from source", () => {
  assertError(
    validateTerritoryOwnershipHistory([supersededTerritory("old", "missing")]),
    "INVALID_SUPERSESSION_REFERENCE",
    "records[0].supersededBy"
  );
  assertError(
    validateTerritoryOwnershipHistory([supersededTerritory("same", "same")]),
    "INVALID_SUPERSESSION_REFERENCE",
    "records[0].supersededBy"
  );
});

runTest("requires supersession replacement to match server season and target", () => {
  const variants = [
    { serverId: "server-367" },
    { seasonId: "season-2" },
    { territoryRef: { type: "normal_map_cell", row: 4, col: 8 } }
  ];
  variants.forEach((replacementOverrides) => {
    const records = [
      supersededTerritory("old", "new"),
      territory(Object.assign({ ownershipRecordId: "new" }, replacementOverrides))
    ];
    assertError(validateTerritoryOwnershipHistory(records), "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
  });
});

runTest("requires confirmed or superseded replacement records", () => {
  const result = validateTerritoryOwnershipHistory([
    supersededTerritory("old", "new"),
    territory({
      ownershipRecordId: "new",
      reviewState: "proposed",
      reviewerId: null,
      reviewedAt: null
    })
  ]);
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("enforces replacement fact and review audit ordering", () => {
  const earlierFact = validateTerritoryOwnershipHistory([
    supersededTerritory("old", "new"),
    territory({
      ownershipRecordId: "new",
      effectiveAt: "2026-07-29T07:59:59Z",
      reviewedAt: "2026-07-29T08:10:00Z"
    })
  ]);
  assertError(earlierFact, "INVALID_SUPERSESSION_ORDER", "records[0].supersededBy");

  const earlierReview = validateTerritoryOwnershipHistory([
    supersededTerritory("old", "new", { reviewedAt: "2026-07-29T08:20:00Z" }),
    territory({
      ownershipRecordId: "new",
      effectiveAt: "2026-07-29T08:05:00Z",
      reviewedAt: "2026-07-29T08:15:00Z"
    })
  ]);
  assertError(earlierReview, "INVALID_SUPERSESSION_ORDER", "records[0].supersededBy");
});

runTest("compares equivalent fractional timestamp forms by parsed instant", () => {
  const result = validateTerritoryOwnershipHistory([
    supersededTerritory("old", "new", {
      effectiveAt: "2026-07-29T08:00:00.1Z",
      reviewedAt: "2026-07-29T08:10:00.12Z"
    }),
    territory({
      ownershipRecordId: "new",
      effectiveAt: "2026-07-29T08:00:00.100Z",
      reviewedAt: "2026-07-29T08:10:00.120Z"
    })
  ]);
  assert.strictEqual(result.valid, true);
});

runTest("accepts a valid immutable supersession chain", () => {
  const records = [
    supersededTerritory("first", "second"),
    supersededTerritory("second", "third", {
      effectiveAt: "2026-07-29T09:00:00Z",
      reviewedAt: "2026-07-29T09:10:00Z"
    }),
    territory({
      ownershipRecordId: "third",
      effectiveAt: "2026-07-29T10:00:00Z",
      reviewedAt: "2026-07-29T10:10:00Z"
    })
  ];
  assert.strictEqual(validateTerritoryOwnershipHistory(records).valid, true);
});

runTest("detects supersession cycles", () => {
  const records = [
    supersededTerritory("first", "second"),
    supersededTerritory("second", "first")
  ];
  assertError(validateTerritoryOwnershipHistory(records), "SUPERSESSION_CYCLE");
});

runTest("invalid records do not create current-state conflicts", () => {
  const invalid = territory({
    ownershipRecordId: "invalid-current",
    sourceType: "api_integration",
    evidenceIds: []
  });
  const result = validateTerritoryOwnershipHistory([
    territory({ ownershipRecordId: "valid-current" }),
    invalid
  ]);
  assertError(result, "MISSING_EVIDENCE", "records[1].evidenceIds");
  assert.ok(!result.errors.some((error) => error.code === "MULTIPLE_CURRENT_OWNERSHIP_RECORDS"));
});

runTest("invalid replacement records cannot satisfy supersession references", () => {
  const result = validateTerritoryOwnershipHistory([
    supersededTerritory("old", "new"),
    territory({
      ownershipRecordId: "new",
      sourceType: "screenshot_extraction",
      evidenceIds: []
    })
  ]);
  assertError(result, "INVALID_SUPERSESSION_REFERENCE", "records[0].supersededBy");
});

runTest("proposed and rejected records do not count as current ownership", () => {
  const proposed = territory({
    ownershipRecordId: "proposed",
    reviewState: "proposed",
    reviewerId: null,
    reviewedAt: null
  });
  const rejected = territory({ ownershipRecordId: "rejected", reviewState: "rejected" });
  assert.strictEqual(validateTerritoryOwnershipHistory([proposed, rejected, territory()]).valid, true);
});

runTest("validation is deterministic pure and retains no input references", () => {
  const record = territory({ extraB: true, extraA: true });
  const before = clone(record);
  const first = validateTerritoryOwnershipRecord(record);
  const second = validateTerritoryOwnershipRecord(record);

  assert.deepStrictEqual(record, before);
  assert.deepStrictEqual(first, second);
  first.errors.push({ code: "MUTATED", path: "x", message: "x" });
  assert.ok(!second.errors.some((error) => error.code === "MUTATED"));
});

runTest("exports all four functions through CommonJS and browser globals", () => {
  [
    validateTerritoryOwnershipRecord,
    validateTerritoryOwnershipHistory,
    validateStructureOwnershipRecord,
    validateStructureOwnershipHistory
  ].forEach((exported) => assert.strictEqual(typeof exported, "function"));

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "ownership-record-validator.js"),
    "utf8"
  );
  const sandbox = { globalThis: {}, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  [
    "validateTerritoryOwnershipRecord",
    "validateTerritoryOwnershipHistory",
    "validateStructureOwnershipRecord",
    "validateStructureOwnershipHistory"
  ].forEach((name) => assert.strictEqual(typeof sandbox.globalThis[name], "function"));
});

runTest("validator has no runtime IO or platform dependencies", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "ownership-record-validator.js"),
    "utf8"
  );
  assert.ok(!/\brequire\s*\(/.test(source));
  assert.ok(!/\b(fetch|XMLHttpRequest|localStorage|document|window|electron|ipcRenderer|fs\.)\b/.test(source));
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
