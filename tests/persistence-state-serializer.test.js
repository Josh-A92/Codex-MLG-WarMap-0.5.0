const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  validatePersistenceEnvelope,
  serializeServerState,
  deserializePersistenceEnvelope
} = require("../src/services/persistence-state-serializer.js");

function createCanonicalEnvelope() {
  return {
    schemaVersion: 1,
    seasonId: "season-1",
    baseMapId: "season1-map",
    savedAt: "2026-07-28T12:00:00.000Z",
    servers: [
      {
        id: "server-366",
        ownership: {
          "10-10": "union-0001",
          "10-11": null
        }
      },
      {
        id: "server-367",
        ownership: {}
      }
    ]
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertError(result, code, path) {
  assert.ok(result.errors.some((error) => error.code === code && error.path === path), `Expected ${code} at ${path}`);
}

function createFakeServerStateService() {
  const internalState = {
    seasonId: "season-1",
    baseMapId: "season1-map",
    servers: [
      {
        id: "server-366",
        label: "Server 366",
        activeUnionId: "union-0001",
        notes: { a: 1 },
        objectives: ["x"],
        history: [],
        lastUpdated: null,
        ownership: {
          "10-10": "union-0001",
          "10-11": null
        }
      },
      {
        id: "server-367",
        label: "Server 367",
        ownership: {}
      }
    ]
  };

  return {
    internalState,
    service: {
      getSeasonId() {
        return internalState.seasonId;
      },
      getBaseMapId() {
        return internalState.baseMapId;
      },
      listServers() {
        return internalState.servers;
      }
    }
  };
}

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

runTest("canonical valid envelope passes validation", () => {
  const result = validatePersistenceEnvelope(createCanonicalEnvelope());

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.warnings, []);
});

runTest("validator is pure and does not mutate input", () => {
  const candidate = createCanonicalEnvelope();
  const before = clone(candidate);

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(candidate, before);
});

runTest("missing required top-level fields are reported", () => {
  const candidate = createCanonicalEnvelope();
  delete candidate.baseMapId;
  delete candidate.servers;

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "MISSING_REQUIRED_FIELD", "baseMapId");
  assertError(result, "MISSING_REQUIRED_FIELD", "servers");
});

runTest("unknown top-level and server fields are rejected", () => {
  const candidate = createCanonicalEnvelope();
  candidate.extra = true;
  candidate.servers[0].extra = "Not allowed";

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNKNOWN_FIELD", "extra");
  assertError(result, "UNKNOWN_FIELD", "servers[0].extra");
});

runTest("optional server labels are validated", () => {
  const candidate = createCanonicalEnvelope();
  candidate.servers[0].label = "Server 366";
  assert.strictEqual(validatePersistenceEnvelope(candidate).valid, true);

  candidate.servers[0].label = "   ";
  const result = validatePersistenceEnvelope(candidate);
  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "servers[0].label");
});

runTest("unsupported schema version is rejected", () => {
  const candidate = createCanonicalEnvelope();
  candidate.schemaVersion = 2;

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "UNSUPPORTED_SCHEMA_VERSION", "schemaVersion");
});

runTest("duplicate server ids are rejected", () => {
  const candidate = createCanonicalEnvelope();
  candidate.servers.push({
    id: "server-366",
    ownership: {}
  });

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "DUPLICATE_SERVER_ID", "servers[2].id");
});

runTest("invalid and whitespace ids, keys, and values are rejected", () => {
  const candidate = createCanonicalEnvelope();
  candidate.seasonId = "   ";
  candidate.servers[0].id = "";
  candidate.servers[0].ownership[""] = "union-0001";
  candidate.servers[0].ownership["   "] = "union-0002";
  candidate.servers[0].ownership["12-12"] = "   ";

  const result = validatePersistenceEnvelope(candidate);

  assert.strictEqual(result.valid, false);
  assertError(result, "INVALID_STRING", "seasonId");
  assertError(result, "INVALID_STRING", "servers[0].id");
  assert.ok(result.errors.some((error) => error.code === "INVALID_OWNERSHIP_KEY"));
  assertError(result, "INVALID_OWNERSHIP_VALUE", "servers[0].ownership.12-12");
});

runTest("invalid ownership containers are rejected", () => {
  const candidateArray = createCanonicalEnvelope();
  candidateArray.servers[0].ownership = [];
  const arrayResult = validatePersistenceEnvelope(candidateArray);
  assert.strictEqual(arrayResult.valid, false);
  assertError(arrayResult, "INVALID_OBJECT", "servers[0].ownership");

  const candidateDate = createCanonicalEnvelope();
  candidateDate.servers[0].ownership = new Date("2026-07-28T12:00:00.000Z");
  const dateResult = validatePersistenceEnvelope(candidateDate);
  assert.strictEqual(dateResult.valid, false);
  assertError(dateResult, "INVALID_OBJECT", "servers[0].ownership");

  class OwnershipContainer {
    constructor() {
      this["10-10"] = "union-0001";
    }
  }

  const candidateClassInstance = createCanonicalEnvelope();
  candidateClassInstance.servers[0].ownership = new OwnershipContainer();
  const classResult = validatePersistenceEnvelope(candidateClassInstance);
  assert.strictEqual(classResult.valid, false);
  assertError(classResult, "INVALID_OBJECT", "servers[0].ownership");
});

runTest("invalid timestamp variants are rejected", () => {
  const nonCanonical = createCanonicalEnvelope();
  nonCanonical.savedAt = "2026-07-28T12:00:00Z";
  const nonCanonicalResult = validatePersistenceEnvelope(nonCanonical);
  assert.strictEqual(nonCanonicalResult.valid, false);
  assertError(nonCanonicalResult, "INVALID_TIMESTAMP_FORMAT", "savedAt");

  const impossibleDate = createCanonicalEnvelope();
  impossibleDate.savedAt = "2026-02-30T12:00:00.000Z";
  const impossibleDateResult = validatePersistenceEnvelope(impossibleDate);
  assert.strictEqual(impossibleDateResult.valid, false);
  assertError(impossibleDateResult, "INVALID_TIMESTAMP", "savedAt");

  const offsetTimestamp = createCanonicalEnvelope();
  offsetTimestamp.savedAt = "2026-07-28T12:00:00.000+01:00";
  const offsetResult = validatePersistenceEnvelope(offsetTimestamp);
  assert.strictEqual(offsetResult.valid, false);
  assertError(offsetResult, "INVALID_TIMESTAMP_FORMAT", "savedAt");

  const missingMilliseconds = createCanonicalEnvelope();
  missingMilliseconds.savedAt = "2026-07-28T12:00:00Z";
  const millisResult = validatePersistenceEnvelope(missingMilliseconds);
  assert.strictEqual(millisResult.valid, false);
  assertError(millisResult, "INVALID_TIMESTAMP_FORMAT", "savedAt");
});

runTest("validator never throws for ordinary invalid payload data", () => {
  const candidate = {
    schemaVersion: 2,
    seasonId: "",
    baseMapId: "",
    savedAt: "bad",
    servers: "not-an-array"
  };

  const result = validatePersistenceEnvelope(candidate);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

runTest("serialization from fake service produces canonical envelope", () => {
  const { service } = createFakeServerStateService();

  const envelope = serializeServerState(service, "2026-07-28T12:00:00.000Z");

  assert.strictEqual(envelope.schemaVersion, 1);
  assert.strictEqual(envelope.seasonId, "season-1");
  assert.strictEqual(envelope.baseMapId, "season1-map");
  assert.strictEqual(envelope.savedAt, "2026-07-28T12:00:00.000Z");
  assert.strictEqual(envelope.servers[0].label, "Server 366");
  assert.deepStrictEqual(envelope.servers[0].ownership["10-11"], null);
});

runTest("only permitted fields are serialized", () => {
  const { service } = createFakeServerStateService();

  const envelope = serializeServerState(service, "2026-07-28T12:00:00.000Z");

  assert.deepStrictEqual(Object.keys(envelope).sort(), ["baseMapId", "savedAt", "schemaVersion", "seasonId", "servers"]);
  envelope.servers.forEach((serverRecord) => {
    assert.deepStrictEqual(Object.keys(serverRecord).sort(), ["id", "label", "ownership"]);
  });
});

runTest("serialization preserves explicit null and missing ownership keys", () => {
  const { service } = createFakeServerStateService();

  const envelope = serializeServerState(service, "2026-07-28T12:00:00.000Z");

  assert.strictEqual(Object.prototype.hasOwnProperty.call(envelope.servers[0].ownership, "10-11"), true);
  assert.strictEqual(envelope.servers[0].ownership["10-11"], null);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(envelope.servers[1].ownership, "10-11"), false);
});

runTest("generated envelope does not share references with service data", () => {
  const { service, internalState } = createFakeServerStateService();

  const envelope = serializeServerState(service, "2026-07-28T12:00:00.000Z");

  internalState.servers[0].ownership["10-10"] = "union-9999";
  internalState.servers[0].ownership["10-12"] = "union-9998";

  assert.strictEqual(envelope.servers[0].ownership["10-10"], "union-0001");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(envelope.servers[0].ownership, "10-12"), false);

  envelope.servers[0].ownership["10-13"] = "union-1111";
  assert.strictEqual(Object.prototype.hasOwnProperty.call(internalState.servers[0].ownership, "10-13"), false);
});

runTest("serializer requires expected service methods", () => {
  assert.throws(() => serializeServerState({}, "2026-07-28T12:00:00.000Z"), /getSeasonId/);

  assert.throws(() => serializeServerState({
    getSeasonId() {
      return "season-1";
    },
    getBaseMapId() {
      return "season1-map";
    },
    listServers: "nope"
  }, "2026-07-28T12:00:00.000Z"), /listServers/);
});

runTest("serializer validates generated envelope and throws clear errors", () => {
  const badService = {
    getSeasonId() {
      return "season-1";
    },
    getBaseMapId() {
      return "season1-map";
    },
    listServers() {
      return [
        {
          id: "server-366",
          ownership: {
            "10-10": "   "
          }
        }
      ];
    }
  };

  assert.throws(() => serializeServerState(badService, "2026-07-28T12:00:00.000Z"), (error) => {
    assert.strictEqual(error.name, "PersistenceSerializationError");
    assert.strictEqual(Array.isArray(error.validationErrors), true);
    assert.ok(error.validationErrors.length > 0);
    return true;
  });
});

runTest("deserialize validates and returns a deep safe copy", () => {
  const candidate = createCanonicalEnvelope();

  const deserialized = deserializePersistenceEnvelope(candidate);

  assert.deepStrictEqual(deserialized, candidate);

  deserialized.servers[0].ownership["10-10"] = "union-9999";
  assert.strictEqual(candidate.servers[0].ownership["10-10"], "union-0001");

  candidate.servers[0].ownership["10-11"] = "union-0005";
  assert.strictEqual(deserialized.servers[0].ownership["10-11"], null);
});

runTest("deserialize throws with structured validation errors when invalid", () => {
  const candidate = createCanonicalEnvelope();
  candidate.schemaVersion = 99;

  assert.throws(() => deserializePersistenceEnvelope(candidate), (error) => {
    assert.strictEqual(error.name, "PersistenceDeserializationError");
    assert.strictEqual(error.code, "PERSISTENCE_DESERIALIZATION_FAILED");
    assert.strictEqual(Array.isArray(error.validationErrors), true);
    assert.ok(error.validationErrors.some((entry) => entry.code === "UNSUPPORTED_SCHEMA_VERSION"));
    return true;
  });
});

runTest("browser-global and CommonJS exports are available", () => {
  assert.strictEqual(typeof validatePersistenceEnvelope, "function");
  assert.strictEqual(typeof serializeServerState, "function");
  assert.strictEqual(typeof deserializePersistenceEnvelope, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "persistence-state-serializer.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.validatePersistenceEnvelope, "function");
  assert.strictEqual(typeof sandbox.globalThis.serializeServerState, "function");
  assert.strictEqual(typeof sandbox.globalThis.deserializePersistenceEnvelope, "function");
});

runTest("source has no DOM filesystem network electron storage or season-specific assumptions", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "persistence-state-serializer.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/ipcRenderer|ipcMain|electron/.test(source));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(source));
  assert.ok(!/require\(['\"]fs['\"]\)/.test(source));
  assert.ok(!/season-1|season1-map|server-366/.test(source));
});

async function executeTests() {
  for (const test of runTest.tests) {
    try {
      await test.fn();
      process.stdout.write(`PASS ${test.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${test.name}\n`);
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

executeTests();
