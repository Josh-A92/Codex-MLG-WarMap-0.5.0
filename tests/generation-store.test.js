const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createGenerationStore,
  GenerationStoreError
} = require("../src/main/generation-store.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function createTempDirectory() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-generation-store-"));
}

function realFileSystem() {
  return {
    async mkdir(directory) { return fs.promises.mkdir(directory, { recursive: true }); },
    async readFile(filePath) { return fs.promises.readFile(filePath); },
    async writeFile(filePath, data) { return fs.promises.writeFile(filePath, data); },
    async rename(from, to) { return fs.promises.rename(from, to); },
    async unlink(filePath) { return fs.promises.unlink(filePath); },
    async readdir(directory) { return fs.promises.readdir(directory); },
    async access(filePath) { return fs.promises.access(filePath); },
    async flush() {}
  };
}

function failingFileSystem(failurePredicate) {
  const delegate = realFileSystem();
  const operation = async (name, args, action) => {
    if (failurePredicate(name, args)) throw new Error(`injected ${name} failure`);
    return action();
  };
  return {
    mkdir: (...args) => delegate.mkdir(...args),
    readFile: (...args) => delegate.readFile(...args),
    writeFile: (...args) => operation("writeFile", args, () => delegate.writeFile(...args)),
    rename: (...args) => operation("rename", args, () => delegate.rename(...args)),
    unlink: (...args) => delegate.unlink(...args),
    readdir: (...args) => delegate.readdir(...args),
    access: (...args) => delegate.access(...args),
    flush: (...args) => operation("flush", args, () => delegate.flush(...args))
  };
}

function documentSet(value = "one", extra = {}) {
  return [
    { documentId: "shared", scope: "global", type: "union-registry", value: { value, ...extra } },
    { documentId: "season-1", scope: "season-1", type: "data-management", value: { value } },
    { documentId: "projection-season-1-map-a", scope: "season-1/map-a", type: "server-state", value: { value } }
  ];
}

async function withStore(run, options = {}) {
  const directory = await createTempDirectory();
  try {
    await run(directory, createGenerationStore({
      baseDirectory: directory,
      fileSystem: options.fileSystem || realFileSystem()
    }));
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function commitInitial(store, value = "one") {
  return store.commit({
    expectedGeneration: 0,
    transactionId: `tx-${value}`,
    createdAt: "2026-08-12T12:00:00.000Z",
    documents: documentSet(value)
  });
}

test("first successful commit and load", async () => {
  await withStore(async (_directory, store) => {
    const committed = await commitInitial(store);
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(committed.generation, 1);
    assert.strictEqual(loaded.status, "committed");
    assert.strictEqual(loaded.source, "current");
    assert.deepStrictEqual(loaded.documents[0].value, { value: "one" });
  });
});

test("second commit advances generation and retains unchanged references", async () => {
  await withStore(async (_directory, store) => {
    await commitInitial(store);
    const first = await store.loadCommittedGeneration();
    const shared = first.manifest.documents.find((entry) => entry.documentId === "shared");
    const committed = await store.commit({
      expectedGeneration: 1,
      transactionId: "tx-two",
      createdAt: "2026-08-12T12:01:00.000Z",
      documents: [
        { documentId: "shared", scope: "global", type: "union-registry", reference: shared },
        { documentId: "season-1", scope: "season-1", type: "data-management", value: { value: "two" } },
        { documentId: "projection-season-1-map-a", scope: "season-1/map-a", type: "server-state", value: { value: "two" } }
      ]
    });
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(committed.generation, 2);
    assert.strictEqual(loaded.manifest.documents.find((entry) => entry.documentId === "shared").fileName, shared.fileName);
    assert.deepStrictEqual(loaded.documents.find((entry) => entry.documentId === "season-1").value, { value: "two" });
  });
});

test("stale expected generation is rejected", async () => {
  await withStore(async (_directory, store) => {
    await commitInitial(store);
    await assert.rejects(
      () => store.commit({ expectedGeneration: 0, transactionId: "stale", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") }),
      (error) => error instanceof GenerationStoreError && error.code === "stale_generation"
    );
  });
});

test("simultaneous commits serialize and reject the stale second request", async () => {
  await withStore(async (_directory, store) => {
    const results = await Promise.allSettled([
      commitInitial(store, "first"),
      commitInitial(store, "second")
    ]);
    assert.strictEqual(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.strictEqual(results.filter((result) => result.status === "rejected")[0].reason.code, "stale_generation");
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
  });
});

test("each pre-publication failure retains the previous committed generation", async () => {
  const failureTargets = [
    "documents/generation-2",
    "manifests/generation-2",
    "PREVIOUS",
    "CURRENT"
  ];
  for (const target of failureTargets) {
    await withStore(async (directory) => {
      const baseStore = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
      await commitInitial(baseStore);
      const failingStore = createGenerationStore({
        baseDirectory: directory,
        fileSystem: failingFileSystem((_name, args) => args.some((arg) => String(arg).includes(target)))
      });
      await assert.rejects(
        () => failingStore.commit({ expectedGeneration: 1, transactionId: `failure-${target}`, createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") }),
        /injected/
      );
      const loaded = await baseStore.loadCommittedGeneration();
      assert.strictEqual(loaded.status, "committed", target);
      assert.strictEqual(loaded.manifest.generation, 1, target);
      assert.deepStrictEqual(loaded.documents.find((entry) => entry.documentId === "shared").value, { value: "one" }, target);
    });
  }
});

test("document, manifest, and pointer flush failures retain the previous generation", async () => {
  for (const flushNumber of [1, 4, 6]) {
    await withStore(async (directory) => {
      const baseStore = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
      await commitInitial(baseStore);
      let flushCalls = 0;
      const failingFileSystem = failingFileSystemForFlush(flushNumber);
      const failingStore = createGenerationStore({ baseDirectory: directory, fileSystem: failingFileSystem });
      await assert.rejects(
        () => failingStore.commit({ expectedGeneration: 1, transactionId: `flush-${flushNumber}`, createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") }),
        /injected flush failure/
      );
      const loaded = await baseStore.loadCommittedGeneration();
      assert.strictEqual(loaded.manifest.generation, 1, `flush ${flushNumber}`);

      function failingFileSystemForFlush(targetFlush) {
        const delegate = realFileSystem();
        return {
          ...delegate,
          async flush(filePath) {
            flushCalls += 1;
            if (flushCalls === targetFlush) throw new Error("injected flush failure");
            return delegate.flush(filePath);
          }
        };
      }
    });
  }
});

test("default flush syncs and closes file handles on success and failure", async () => {
  await withStore(async (directory) => {
    const originalOpen = fs.promises.open;
    const events = [];
    let syncCount = 0;
    fs.promises.open = async (...args) => {
      const handle = await originalOpen(...args);
      return {
        async sync() {
          syncCount += 1;
          events.push("sync");
          if (syncCount === 11) throw new Error("injected handle sync failure");
          return handle.sync();
        },
        async close() {
          events.push("close");
          return handle.close();
        }
      };
    };
    try {
      const store = createGenerationStore({ baseDirectory: directory });
      await commitInitial(store);
      await assert.rejects(
        () => store.commit({ expectedGeneration: 1, transactionId: "handle-failure", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") }),
        /injected handle sync failure/
      );
    } finally {
      fs.promises.open = originalOpen;
    }
    assert.strictEqual(events.filter((event) => event === "sync").length, events.filter((event) => event === "close").length);
    assert.ok(events.includes("sync"));
    assert.ok(events.includes("close"));
  });
});

test("distinct logical keys cannot alias physical document files", async () => {
  await withStore(async (directory, store) => {
    const documents = [
      { documentId: "a/b", scope: "scope", type: "type", value: { key: "slash" } },
      { documentId: "a_b", scope: "scope", type: "type", value: { key: "underscore" } },
      { documentId: "雪", scope: "scope", type: "type", value: { key: "unicode" } }
    ];
    await store.commit({ expectedGeneration: 0, transactionId: "identity", createdAt: "2026-08-12T12:00:00.000Z", documents });
    const loaded = await store.loadCommittedGeneration();
    assert.deepStrictEqual(
      loaded.documents.map((document) => [document.documentId, document.value.key]),
      [["a/b", "slash"], ["a_b", "underscore"], ["雪", "unicode"]]
    );
    assert.strictEqual(new Set(loaded.manifest.documents.map((document) => document.fileName)).size, 3);
  });
});

test("physical filenames are stable across fresh store instances", async () => {
  const firstDirectory = await createTempDirectory();
  const secondDirectory = await createTempDirectory();
  try {
    const commit = {
      expectedGeneration: 0,
      transactionId: "stable-transaction",
      createdAt: "2026-08-12T12:00:00.000Z",
      documents: documentSet("stable")
    };
    const first = createGenerationStore({ baseDirectory: firstDirectory, fileSystem: realFileSystem() });
    const second = createGenerationStore({ baseDirectory: secondDirectory, fileSystem: realFileSystem() });
    await first.commit(commit);
    await second.commit(commit);
    const firstManifest = (await first.loadCommittedGeneration()).manifest;
    const secondManifest = (await second.loadCommittedGeneration()).manifest;
    assert.deepStrictEqual(
      firstManifest.documents.map((document) => document.fileName),
      secondManifest.documents.map((document) => document.fileName)
    );
  } finally {
    await fs.promises.rm(firstDirectory, { recursive: true, force: true });
    await fs.promises.rm(secondDirectory, { recursive: true, force: true });
  }
});

test("empty and duplicate logical keys are rejected", async () => {
  await withStore(async (_directory, store) => {
    await assert.rejects(
      () => store.commit({ expectedGeneration: 0, transactionId: "empty", createdAt: "2026-08-12T12:00:00.000Z", documents: [{ documentId: "", scope: "scope", type: "type", value: {} }] }),
      (error) => error instanceof GenerationStoreError && error.code === "invalid_input"
    );
    await assert.rejects(
      () => store.commit({ expectedGeneration: 0, transactionId: "duplicate", createdAt: "2026-08-12T12:00:00.000Z", documents: [{ documentId: "same", scope: "scope", type: "type", value: 1 }, { documentId: "same", scope: "scope", type: "type", value: 2 }] }),
      (error) => error instanceof GenerationStoreError && error.code === "invalid_input"
    );
  });
});

test("manifest created without CURRENT is not promoted", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    const manifestDirectory = path.join(directory, "manifests");
    await fs.promises.writeFile(path.join(manifestDirectory, "generation-99-orphan.json"), JSON.stringify({ schemaVersion: 1, generation: 99, transactionId: "orphan", createdAt: "2026-08-12T12:00:00.000Z", documents: [] }));
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.manifest.generation, 1);
  });
});

test("missing CURRENT falls back to valid PREVIOUS", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    await fs.promises.unlink(path.join(directory, "CURRENT"));
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.status, "committed");
    assert.strictEqual(loaded.source, "previous");
    assert.strictEqual(loaded.manifest.generation, 1);
  });
});

test("corrupt CURRENT or missing manifest falls back to PREVIOUS", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    await fs.promises.writeFile(path.join(directory, "CURRENT"), "{broken", "utf8");
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
    const current = JSON.parse(await fs.promises.readFile(path.join(directory, "PREVIOUS"), "utf8"));
    const invalidCurrent = { ...current, generation: 2, manifestFile: "missing.json" };
    await fs.promises.writeFile(path.join(directory, "CURRENT"), JSON.stringify(invalidCurrent), "utf8");
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.manifest.generation, 1);
  });
});

test("valid CURRENT remains usable when PREVIOUS is corrupt", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    await fs.promises.writeFile(path.join(directory, "PREVIOUS"), "{broken", "utf8");
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.source, "current");
    assert.strictEqual(loaded.manifest.generation, 2);
  });
});

test("invalid PREVIOUS and both invalid pointers produce explicit recovery", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    await fs.promises.writeFile(path.join(directory, "CURRENT"), "{broken", "utf8");
    await fs.promises.writeFile(path.join(directory, "PREVIOUS"), "{broken", "utf8");
    const loaded = await store.loadCommittedGeneration();
    assert.deepStrictEqual(loaded, { status: "recovery_required", errorCode: "no_valid_commit_pointer" });
  });
});

test("manifest missing or corrupt document is rejected and previous generation remains usable", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    const current = JSON.parse(await fs.promises.readFile(path.join(directory, "CURRENT"), "utf8"));
    const manifestPath = path.join(directory, "manifests", current.manifestFile);
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
    await fs.promises.writeFile(path.join(directory, "documents", manifest.documents[0].fileName), "corrupt", "utf8");
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
  });
});

test("temporary files and unreferenced newer documents are ignored", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    await fs.promises.writeFile(path.join(directory, "CURRENT.tmp"), "temporary", "utf8");
    await fs.promises.writeFile(path.join(directory, "documents", "generation-99-orphan.json"), "{}", "utf8");
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.manifest.generation, 1);
  });
});

test("fresh store instances repeatedly reopen the committed generation", async () => {
  await withStore(async (directory) => {
    await commitInitial(createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() }));
    const reopened = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    assert.strictEqual((await reopened.loadCommittedGeneration()).manifest.generation, 1);
  });
});

test("managed paths do not escape the state directory", async () => {
  await withStore(async (directory, store) => {
    await store.commit({
      expectedGeneration: 0,
      transactionId: "../escape",
      createdAt: "2026-08-12T12:00:00.000Z",
      documents: [{ documentId: "../outside", scope: "scope", type: "type", value: {} }]
    });
    const outside = path.resolve(directory, "..", "outside");
    assert.strictEqual(fs.existsSync(outside), false);
    assert.strictEqual((await store.loadCommittedGeneration()).status, "committed");
  });
});

function generationIdentity(loaded) {
  return {
    generation: loaded.manifest.generation,
    manifestFile: loaded.pointer.manifestFile,
    manifestSha256: loaded.pointer.manifestSha256
  };
}

test("prepare creates an unpublished candidate that a fresh store can reopen", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store, "one");
    await store.commit({ expectedGeneration: 1, transactionId: "tx-two", createdAt: "2026-08-12T12:01:00.000Z", documents: documentSet("two") });
    const current = await store.loadCommittedGeneration();
    const currentBytes = await fs.promises.readFile(path.join(directory, "CURRENT"));
    const previousBytes = await fs.promises.readFile(path.join(directory, "PREVIOUS"));
    const shared = current.manifest.documents.find((document) => document.documentId === "shared");
    const prepared = await store.prepare({
      expectedCurrent: generationIdentity(current),
      transactionId: "candidate-three",
      createdAt: "2026-08-12T12:02:00.000Z",
      documents: [
        { documentId: "shared", scope: "global", type: "union-registry", reference: shared },
        { documentId: "season-1", scope: "season-1", type: "data-management", value: { value: "three" } },
        { documentId: "projection-season-1-map-a", scope: "season-1/map-a", type: "server-state", value: { value: "three" } }
      ]
    });
    assert.strictEqual(prepared.status, "prepared");
    assert.strictEqual(prepared.candidate.schemaVersion, 1);
    assert.strictEqual(prepared.candidate.expectedCurrent.generation, 2);
    assert.strictEqual(prepared.candidate.transactionId, "candidate-three");
    assert.ok(prepared.candidate.manifestSha256.startsWith("sha256:"));
    assert.deepStrictEqual(prepared.candidate.documents.map((document) => document.storage), ["reference", "candidate", "candidate"]);
    assert.deepStrictEqual(await fs.promises.readFile(path.join(directory, "CURRENT")), currentBytes);
    assert.deepStrictEqual(await fs.promises.readFile(path.join(directory, "PREVIOUS")), previousBytes);

    const reopened = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    const committed = await reopened.loadCommittedGeneration();
    assert.strictEqual(committed.manifest.generation, 2);
    const candidate = await reopened.loadCandidate(prepared.candidate);
    assert.strictEqual(candidate.status, "prepared");
    assert.deepStrictEqual(candidate.documents.map((document) => document.value.value), ["two", "three", "three"]);
    assert.strictEqual(candidate.documents[0].fileName, shared.fileName);
  });
});

test("candidate descriptors reject mismatched, modified, missing, and malformed content", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    const current = await store.loadCommittedGeneration();
    const prepared = await store.prepare({
      expectedCurrent: generationIdentity(current),
      transactionId: "candidate-invalid",
      createdAt: "2026-08-12T12:01:00.000Z",
      documents: documentSet("two")
    });
    const candidateDocument = prepared.candidate.documents.find((document) => document.documentId === "season-1");
    const candidatePath = path.join(directory, "documents", candidateDocument.fileName);
    const modified = structuredClone(prepared.candidate);
    modified.transactionId = "different-transaction";
    await assert.rejects(() => store.loadCandidate(modified), /[Cc]andidate/);
    await fs.promises.writeFile(candidatePath, "not-json", "utf8");
    await assert.rejects(() => store.loadCandidate(prepared.candidate), /checksum/);
    await fs.promises.unlink(candidatePath);
    await assert.rejects(() => store.loadCandidate(prepared.candidate), /[Cc]andidate/);
    await fs.promises.writeFile(candidatePath, "not-json", "utf8");
    const malformed = structuredClone(prepared.candidate);
    malformed.documents = malformed.documents.map((document) => document.documentId === "season-1"
      ? { ...document, sha256: `sha256:${"0".repeat(64)}` }
      : document);
    await assert.rejects(() => store.loadCandidate(malformed), /[Cc]andidate/);
  });
});

test("preparation failures leave the prior generation current", async () => {
  await withStore(async (directory) => {
    const baseStore = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    await commitInitial(baseStore);
    const current = await baseStore.loadCommittedGeneration();
    const currentBytes = await fs.promises.readFile(path.join(directory, "CURRENT"));
    const failingStore = createGenerationStore({
      baseDirectory: directory,
      fileSystem: failingFileSystem((_name, args) => args.some((arg) => String(arg).includes("candidate-")))
    });
    await assert.rejects(() => failingStore.prepare({
      expectedCurrent: generationIdentity(current),
      transactionId: "candidate-failure",
      createdAt: "2026-08-12T12:01:00.000Z",
      documents: documentSet("two")
    }));
    const loaded = await baseStore.loadCommittedGeneration();
    assert.strictEqual(loaded.manifest.generation, 1);
    assert.deepStrictEqual(await fs.promises.readFile(path.join(directory, "CURRENT")), currentBytes);
  });
});

test("ordinary committed loading ignores candidate and temporary files", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    const current = await store.loadCommittedGeneration();
    await store.prepare({
      expectedCurrent: generationIdentity(current),
      transactionId: "candidate-ignored",
      createdAt: "2026-08-12T12:01:00.000Z",
      documents: documentSet("candidate")
    });
    await fs.promises.writeFile(path.join(directory, "CURRENT.tmp"), "temporary", "utf8");
    await fs.promises.writeFile(path.join(directory, "documents", "candidate-unreferenced.tmp"), "temporary", "utf8");
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.status, "committed");
    assert.strictEqual(loaded.source, "current");
    assert.strictEqual(loaded.manifest.generation, 1);
  });
});

async function prepareCandidate(store, expectedCurrent, value = "candidate") {
  return store.prepare({
    expectedCurrent: generationIdentity(expectedCurrent),
    transactionId: `publish-${value}`,
    createdAt: "2026-08-12T12:02:00.000Z",
    documents: documentSet(value)
  });
}

test("publish requires fresh verification and preserves the prior generation on rejection", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    const current = await store.loadCommittedGeneration();
    const prepared = await prepareCandidate(store, current);
    let verificationCalls = 0;
    await assert.rejects(
      () => store.publish(prepared.candidate, async (candidate) => {
        verificationCalls += 1;
        const fresh = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
        const reopened = await fresh.loadCandidate(candidate.candidate);
        assert.strictEqual(reopened.status, "prepared");
        return false;
      }),
      (error) => error instanceof GenerationStoreError && error.code === "verification_rejected"
    );
    assert.strictEqual(verificationCalls, 1);
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
  });
});

test("publish rejects candidate tampering and missing files before head movement", async () => {
  await withStore(async (directory, store) => {
    await commitInitial(store);
    const current = await store.loadCommittedGeneration();
    const prepared = await prepareCandidate(store, current, "tamper");
    const candidateDocument = prepared.candidate.documents.find((document) => document.documentId === "season-1");
    const candidatePath = path.join(directory, "documents", candidateDocument.fileName);
    await assert.rejects(() => store.publish(prepared.candidate, async () => {
      await fs.promises.writeFile(candidatePath, JSON.stringify({ changed: true }), "utf8");
      return true;
    }), (error) => error instanceof GenerationStoreError && error.code === "candidate_checksum_mismatch");
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);

    const missingPrepared = await prepareCandidate(store, current, "missing");
    const missingDocument = missingPrepared.candidate.documents.find((document) => document.documentId === "season-1");
    await fs.promises.unlink(path.join(directory, "documents", missingDocument.fileName));
    await assert.rejects(() => store.publish(missingPrepared.candidate, async () => true), /Candidate document/);
    assert.strictEqual((await store.loadCommittedGeneration()).manifest.generation, 1);
  });
});

test("publish rejects a changed current generation and concurrent publication is idempotent", async () => {
  await withStore(async (directory) => {
    const first = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    await commitInitial(first);
    const current = await first.loadCommittedGeneration();
    const prepared = await prepareCandidate(first, current, "stale");
    const concurrent = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    await concurrent.commit({ expectedGeneration: 1, transactionId: "concurrent", createdAt: "2026-08-12T12:03:00.000Z", documents: documentSet("concurrent") });
    await assert.rejects(() => first.publish(prepared.candidate, async () => true), (error) => error instanceof GenerationStoreError && error.code === "stale_candidate");
    assert.strictEqual((await first.loadCommittedGeneration()).manifest.generation, 2);

    const retryCurrent = await concurrent.loadCommittedGeneration();
    const retryCandidate = await prepareCandidate(concurrent, retryCurrent, "retry");
    const published = await concurrent.publish(retryCandidate.candidate, async () => true);
    assert.strictEqual(published.status, "published");
    const retry = await concurrent.publish(retryCandidate.candidate, async () => { throw new Error("must not reverify an already current candidate"); });
    assert.strictEqual(retry.status, "already_published");
  });
});

test("publish pointer failures leave the prior generation current and readable", async () => {
  for (const target of ["PREVIOUS", "CURRENT"]) {
    await withStore(async (directory) => {
      const baseStore = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
      await commitInitial(baseStore);
      const current = await baseStore.loadCommittedGeneration();
      const prepared = await prepareCandidate(baseStore, current, `pointer-${target}`);
      const failingStore = createGenerationStore({
        baseDirectory: directory,
        fileSystem: failingFileSystem((_name, args) => args.some((arg) => String(arg).includes(target)))
      });
      await assert.rejects(() => failingStore.publish(prepared.candidate, async () => true), /injected/);
      const loaded = await baseStore.loadCommittedGeneration();
      assert.strictEqual(loaded.status, "committed", target);
      assert.strictEqual(loaded.manifest.generation, 1, target);
      assert.deepStrictEqual(loaded.documents.find((document) => document.documentId === "shared").value, { value: "one" }, target);
    });
  }
});

test("successful publication moves CURRENT and preserves PREVIOUS as fallback", async () => {
  await withStore(async (directory) => {
    const store = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
    await commitInitial(store);
    const current = await store.loadCommittedGeneration();
    const prepared = await prepareCandidate(store, current, "success");
    const published = await store.publish(prepared.candidate, async (candidate) => {
      const fresh = createGenerationStore({ baseDirectory: directory, fileSystem: realFileSystem() });
      const loaded = await fresh.loadCandidate(candidate.candidate);
      assert.deepStrictEqual(loaded.documents.find((document) => document.documentId === "season-1").value, { value: "success" });
      return true;
    });
    assert.strictEqual(published.status, "published");
    const loaded = await store.loadCommittedGeneration();
    assert.strictEqual(loaded.source, "current");
    assert.strictEqual(loaded.manifest.generation, 2);
    assert.deepStrictEqual(loaded.documents.find((document) => document.documentId === "season-1").value, { value: "success" });
    await fs.promises.unlink(path.join(directory, "CURRENT"));
    const fallback = await store.loadCommittedGeneration();
    assert.strictEqual(fallback.source, "previous");
    assert.strictEqual(fallback.manifest.generation, 1);
  });
});

(async () => {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      throw error;
    }
  }
  console.log(`${passed} tests passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
