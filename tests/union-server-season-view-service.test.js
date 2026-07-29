const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createUnionServerSeasonViewService,
  UnionServerSeasonViewServiceError
} = require("../src/services/union-server-season-view-service.js");

function runTest(name, fn) {
  runTest.tests.push({ name, fn });
}

runTest.tests = [];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStubDependencies() {
  const unionIdentities = new Map();
  const relations = [];
  const assignments = new Map();

  function relationKey(seasonId, serverId, unionId) {
    return JSON.stringify([seasonId, serverId, unionId]);
  }

  const unionRegistryService = {
    getUnionIdentity(unionId) {
      return unionIdentities.has(unionId) ? deepClone(unionIdentities.get(unionId)) : null;
    }
  };

  const relationService = {
    getRelation(seasonId, serverId, unionId) {
      const key = relationKey(seasonId, serverId, unionId);
      const relation = relations.find((item) => relationKey(item.seasonId, item.serverId, item.unionId) === key);
      return relation ? deepClone(relation) : null;
    },
    listRelations(filter) {
      if (filter === undefined) {
        return relations.map((item) => deepClone(item));
      }

      return relations
        .filter((item) => {
          const keys = Object.keys(filter);
          for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (item[key] !== filter[key]) {
              return false;
            }
          }

          return true;
        })
        .map((item) => deepClone(item));
    }
  };

  const nativeAssignmentService = {
    getCurrentAssignment(seasonId, serverId, unionId) {
      const key = relationKey(seasonId, serverId, unionId);
      return assignments.has(key) ? deepClone(assignments.get(key)) : null;
    }
  };

  return {
    unionRegistryService,
    relationService,
    nativeAssignmentService,
    unionIdentities,
    relations,
    assignments,
    relationKey
  };
}

function createRelation(overrides) {
  return Object.assign({
    seasonId: "season-1",
    serverId: "server-1",
    unionId: "union-0001",
    currentNativeStatusId: null,
    currentActiveStatusId: null,
    firstConfirmedPresenceAt: null,
    mostRecentConfirmedPresenceAt: null,
    evidenceIds: [],
    manualOverride: null
  }, overrides || {});
}

function createUnionIdentity(overrides) {
  return Object.assign({
    unionId: "union-0001",
    displayName: "Moonlight Guillotine",
    tag: "MLG",
    aliases: ["Moonlight G"],
    defaultColor: "#8FCEFF",
    presentationMetadata: {},
    registryStatus: "current"
  }, overrides || {});
}

function createCurrentAssignment(overrides) {
  return Object.assign({
    assignmentId: "assign-1001",
    unionId: "union-0001",
    serverId: "server-1",
    seasonId: "season-1",
    nativeState: "native",
    reviewState: "confirmed",
    sourceType: "manual_entry",
    rawExtractedValue: null,
    normalizedValue: "union-0001",
    confidence: null,
    evidenceId: null,
    observedAt: "2026-07-10T10:00:00Z",
    effectiveFrom: "2026-07-10T10:00:00Z",
    effectiveTo: null,
    reviewer: "reviewer-1",
    reviewedAt: "2026-07-10T10:10:00Z",
    supersededBy: null
  }, overrides || {});
}

function expectServiceError(fn, code, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof UnionServerSeasonViewServiceError);
    assert.strictEqual(error.code, code);
    if (messagePattern) {
      assert.match(error.message, messagePattern);
    }

    return true;
  });
}

runTest("successful three-service composition", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation());
  deps.assignments.set(deps.relationKey("season-1", "server-1", "union-0001"), createCurrentAssignment());

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const view = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(view.relation.unionId, "union-0001");
  assert.strictEqual(view.unionIdentity.displayName, "Moonlight Guillotine");
  assert.strictEqual(view.currentNativeAssignment.assignmentId, "assign-1001");
});

runTest("getView returns null for unknown relationship", () => {
  const deps = createStubDependencies();
  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  assert.strictEqual(service.getView("season-1", "server-1", "union-0001"), null);
});

runTest("known relation with no native assignment", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation({ currentNativeStatusId: "stale-ref" }));

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const view = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(view.currentNativeAssignment, null);
});

runTest("known relation with confirmed current native assignment", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation({ currentNativeStatusId: null }));
  deps.assignments.set(deps.relationKey("season-1", "server-1", "union-0001"), createCurrentAssignment({ assignmentId: "assign-current" }));

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const view = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(view.currentNativeAssignment.assignmentId, "assign-current");
});

runTest("native assignment service remains authoritative over relation currentNativeStatusId", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation({ currentNativeStatusId: "native-old-cache-id" }));
  deps.assignments.set(deps.relationKey("season-1", "server-1", "union-0001"), createCurrentAssignment({ assignmentId: "assign-authoritative" }));

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const view = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(view.currentNativeAssignment.assignmentId, "assign-authoritative");
});

runTest("missing canonical union identity produces inconsistent_state", () => {
  const deps = createStubDependencies();
  deps.relations.push(createRelation({ unionId: "union-missing" }));

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  expectServiceError(
    () => service.getView("season-1", "server-1", "union-missing"),
    "inconsistent_state",
    /without a canonical union identity/
  );
});

runTest("filter forwarding and relation ordering in listViews", () => {
  const deps = createStubDependencies();
  const relationA = createRelation({ unionId: "union-0001" });
  const relationB = createRelation({ seasonId: "season-1", serverId: "server-2", unionId: "union-0002" });
  deps.relations.push(relationB);
  deps.relations.push(relationA);

  deps.unionIdentities.set("union-0001", createUnionIdentity({ unionId: "union-0001" }));
  deps.unionIdentities.set("union-0002", createUnionIdentity({ unionId: "union-0002", displayName: "Alpha" }));

  const capturedFilters = [];
  deps.relationService.listRelations = function captureFilter(filter) {
    capturedFilters.push(filter);
    return [deepClone(relationB), deepClone(relationA)];
  };

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const filter = { seasonId: "season-1" };
  const views = service.listViews(filter);

  assert.strictEqual(capturedFilters.length, 1);
  assert.strictEqual(capturedFilters[0], filter);
  assert.strictEqual(views.length, 2);
  assert.strictEqual(views[0].relation.unionId, "union-0002");
  assert.strictEqual(views[1].relation.unionId, "union-0001");
});

runTest("safe-copy behavior", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation());
  deps.assignments.set(deps.relationKey("season-1", "server-1", "union-0001"), createCurrentAssignment());

  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const first = service.getView("season-1", "server-1", "union-0001");
  first.relation.unionId = "mutated";
  first.unionIdentity.displayName = "mutated";
  first.currentNativeAssignment.assignmentId = "mutated";

  const second = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(second.relation.unionId, "union-0001");
  assert.strictEqual(second.unionIdentity.displayName, "Moonlight Guillotine");
  assert.strictEqual(second.currentNativeAssignment.assignmentId, "assign-1001");
});

runTest("strict factory options and missing or non-callable dependencies", () => {
  const deps = createStubDependencies();

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: deps.relationService,
      nativeAssignmentService: deps.nativeAssignmentService,
      extra: true
    }),
    "invalid_input",
    /field 'extra'/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: deps.relationService
    }),
    "invalid_input",
    /nativeAssignmentService/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: { getUnionIdentity: 1 },
      relationService: deps.relationService,
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /getUnionIdentity/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: { getRelation() { return null; }, listRelations: 1 },
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /listRelations/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: deps.relationService,
      nativeAssignmentService: { getCurrentAssignment: null }
    }),
    "invalid_input",
    /getCurrentAssignment/
  );
});

runTest("function-valued dependencies are rejected across all dependency fields", () => {
  const deps = createStubDependencies();

  const functionRegistry = function functionRegistry() {};
  functionRegistry.getUnionIdentity = function getUnionIdentity() {
    return createUnionIdentity();
  };

  const functionRelations = function functionRelations() {};
  functionRelations.getRelation = function getRelation() {
    return null;
  };
  functionRelations.listRelations = function listRelations() {
    return [];
  };

  const functionAssignments = function functionAssignments() {};
  functionAssignments.getCurrentAssignment = function getCurrentAssignment() {
    return null;
  };

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: functionRegistry,
      relationService: deps.relationService,
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /input\.unionRegistryService/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: functionRelations,
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /input\.relationService/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: deps.relationService,
      nativeAssignmentService: functionAssignments
    }),
    "invalid_input",
    /input\.nativeAssignmentService/
  );
});

runTest("array-valued dependencies are rejected across all dependency fields", () => {
  const deps = createStubDependencies();

  const arrayRegistry = [];
  arrayRegistry.getUnionIdentity = function getUnionIdentity() {
    return createUnionIdentity();
  };

  const arrayRelations = [];
  arrayRelations.getRelation = function getRelation() {
    return null;
  };
  arrayRelations.listRelations = function listRelations() {
    return [];
  };

  const arrayAssignments = [];
  arrayAssignments.getCurrentAssignment = function getCurrentAssignment() {
    return null;
  };

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: arrayRegistry,
      relationService: deps.relationService,
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /input\.unionRegistryService/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: arrayRelations,
      nativeAssignmentService: deps.nativeAssignmentService
    }),
    "invalid_input",
    /input\.relationService/
  );

  expectServiceError(
    () => createUnionServerSeasonViewService({
      unionRegistryService: deps.unionRegistryService,
      relationService: deps.relationService,
      nativeAssignmentService: arrayAssignments
    }),
    "invalid_input",
    /input\.nativeAssignmentService/
  );
});

runTest("null and primitive dependencies are rejected across all dependency fields", () => {
  const deps = createStubDependencies();
  const primitiveCandidates = [null, 1, "x", true];
  const dependencyFields = ["unionRegistryService", "relationService", "nativeAssignmentService"];

  dependencyFields.forEach((fieldName) => {
    primitiveCandidates.forEach((candidate) => {
      const options = {
        unionRegistryService: deps.unionRegistryService,
        relationService: deps.relationService,
        nativeAssignmentService: deps.nativeAssignmentService
      };

      options[fieldName] = candidate;

      expectServiceError(
        () => createUnionServerSeasonViewService(options),
        "invalid_input",
        new RegExp(`input\\.${fieldName}`)
      );
    });
  });
});

runTest("dependency errors are preserved", () => {
  const boom = new Error("boom");
  const service = createUnionServerSeasonViewService({
    unionRegistryService: {
      getUnionIdentity() {
        return createUnionIdentity();
      }
    },
    relationService: {
      getRelation() {
        throw boom;
      },
      listRelations() {
        return [];
      }
    },
    nativeAssignmentService: {
      getCurrentAssignment() {
        return null;
      }
    }
  });

  assert.throws(() => service.getView("season-1", "server-1", "union-0001"), (error) => error === boom);
});

runTest("class-based dependency objects bind method context", () => {
  class Registry {
    constructor(identity) {
      this.identity = identity;
      this.calls = 0;
    }

    getUnionIdentity() {
      this.calls += 1;
      return this.identity;
    }
  }

  class Relations {
    constructor(relation) {
      this.relation = relation;
      this.calls = 0;
    }

    getRelation() {
      this.calls += 1;
      return this.relation;
    }

    listRelations() {
      this.calls += 1;
      return [this.relation];
    }
  }

  class Assignments {
    constructor(assignment) {
      this.assignment = assignment;
      this.calls = 0;
    }

    getCurrentAssignment() {
      this.calls += 1;
      return this.assignment;
    }
  }

  const registry = new Registry(createUnionIdentity());
  const relation = createRelation();
  const relations = new Relations(relation);
  const assignments = new Assignments(createCurrentAssignment());

  const service = createUnionServerSeasonViewService({
    unionRegistryService: registry,
    relationService: relations,
    nativeAssignmentService: assignments
  });

  service.getView("season-1", "server-1", "union-0001");
  service.listViews();

  assert.ok(registry.calls >= 2);
  assert.ok(relations.calls >= 2);
  assert.ok(assignments.calls >= 2);
});

runTest("plain and null-prototype factory options", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation());

  const plainService = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  const nullPrototypeOptions = Object.create(null);
  nullPrototypeOptions.unionRegistryService = deps.unionRegistryService;
  nullPrototypeOptions.relationService = deps.relationService;
  nullPrototypeOptions.nativeAssignmentService = deps.nativeAssignmentService;

  const nullPrototypeService = createUnionServerSeasonViewService(nullPrototypeOptions);

  assert.strictEqual(plainService.getView("season-1", "server-1", "union-0001").relation.unionId, "union-0001");
  assert.strictEqual(nullPrototypeService.getView("season-1", "server-1", "union-0001").relation.unionId, "union-0001");
});

runTest("ordinary null-prototype and class dependency objects remain accepted", () => {
  const deps = createStubDependencies();
  deps.unionIdentities.set("union-0001", createUnionIdentity());
  deps.relations.push(createRelation());
  deps.assignments.set(deps.relationKey("season-1", "server-1", "union-0001"), createCurrentAssignment({ assignmentId: "assign-ok" }));

  const nullProtoRegistry = Object.create(null);
  nullProtoRegistry.getUnionIdentity = function getUnionIdentity(unionId) {
    return deps.unionRegistryService.getUnionIdentity(unionId);
  };

  const nullProtoRelations = Object.create(null);
  nullProtoRelations.getRelation = function getRelation(seasonId, serverId, unionId) {
    return deps.relationService.getRelation(seasonId, serverId, unionId);
  };
  nullProtoRelations.listRelations = function listRelations(filter) {
    return deps.relationService.listRelations(filter);
  };

  class AssignmentDependency {
    getCurrentAssignment(seasonId, serverId, unionId) {
      return deps.nativeAssignmentService.getCurrentAssignment(seasonId, serverId, unionId);
    }
  }

  const service = createUnionServerSeasonViewService({
    unionRegistryService: nullProtoRegistry,
    relationService: nullProtoRelations,
    nativeAssignmentService: new AssignmentDependency()
  });

  const view = service.getView("season-1", "server-1", "union-0001");
  assert.strictEqual(view.currentNativeAssignment.assignmentId, "assign-ok");
});

runTest("identity argument validation", () => {
  const deps = createStubDependencies();
  const service = createUnionServerSeasonViewService({
    unionRegistryService: deps.unionRegistryService,
    relationService: deps.relationService,
    nativeAssignmentService: deps.nativeAssignmentService
  });

  expectServiceError(() => service.getView("", "server-1", "union-1"), "invalid_input", /seasonId/);
  expectServiceError(() => service.getView("season-1", "   ", "union-1"), "invalid_input", /serverId/);
  expectServiceError(() => service.getView("season-1", "server-1", ""), "invalid_input", /unionId/);
});

runTest("browser-global and CommonJS exports", () => {
  assert.strictEqual(typeof createUnionServerSeasonViewService, "function");
  assert.strictEqual(typeof UnionServerSeasonViewServiceError, "function");

  const sourcePath = path.join(__dirname, "..", "src", "services", "union-server-season-view-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const sandbox = {
    globalThis: {},
    module: undefined,
    window: undefined
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.strictEqual(typeof sandbox.globalThis.createUnionServerSeasonViewService, "function");
  assert.strictEqual(typeof sandbox.globalThis.UnionServerSeasonViewServiceError, "function");
});

runTest("infrastructure-free source boundary", () => {
  const sourcePath = path.join(__dirname, "..", "src", "services", "union-server-season-view-service.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.ok(!/\bdocument\b/.test(source));
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket/.test(source));
  assert.ok(!/require\(['"]fs['"]\)/.test(source));
  assert.ok(!/electron|ipcRenderer|ipcMain|localStorage|indexedDB|activeUnionId/.test(source));
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
