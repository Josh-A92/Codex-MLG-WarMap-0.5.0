const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { createEvidenceFileStore } = require("../src/main/evidence-file-store.js");

function png(width, height) {
  const bytes = Buffer.alloc(45);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(0, 33);
  bytes.writeUInt32BE(0, 37);
  bytes.write("IEND", 37, "ascii");
  bytes.writeUInt32BE(0, 41);
  return bytes;
}

function jpeg(width, height) {
  return Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x0b,0x08,height>>8,height&255,width>>8,width&255,0x01,0x01,0x11,0x00,0xff,0xd9]);
}

(async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "warmap-evidence-store-"));
  try {
    const sourcePng = path.join(root, "capture.png");
    await fs.promises.writeFile(sourcePng, png(640, 480));
    const store = createEvidenceFileStore({ rootDirectory: path.join(root, "managed") });
    const first = await store.importFile({ sourcePath: sourcePng });
    assert.strictEqual(first.mediaType, "image/png");
    assert.strictEqual(first.pixelWidth, 640);
    assert.strictEqual(first.pixelHeight, 480);
    assert.strictEqual(first.reused, false);
    assert.strictEqual(first.integrityHash, `sha256:${crypto.createHash("sha256").update(png(640, 480)).digest("hex")}`);
    assert.deepStrictEqual(await fs.promises.readFile(path.join(root, "managed", first.storageRef)), png(640, 480));

    const duplicate = path.join(root, "same-image-renamed.png");
    await fs.promises.writeFile(duplicate, png(640, 480));
    const reused = await store.importFile({ sourcePath: duplicate });
    assert.strictEqual(reused.storageRef, first.storageRef);
    assert.strictEqual(reused.reused, true);
    console.log("PASS imports PNG into hash-addressed managed storage and reuses duplicates");

    const sourceJpeg = path.join(root, "capture.jpg");
    await fs.promises.writeFile(sourceJpeg, jpeg(320, 200));
    const jpegResult = await store.importFile({ sourcePath: sourceJpeg });
    assert.strictEqual(jpegResult.mediaType, "image/jpeg");
    assert.strictEqual(jpegResult.pixelWidth, 320);
    assert.strictEqual(jpegResult.pixelHeight, 200);
    console.log("PASS validates JPEG bytes and dimensions");

    const invalid = path.join(root, "fake.png");
    await fs.promises.writeFile(invalid, "not an image");
    await assert.rejects(store.importFile({ sourcePath: invalid }), (error) => error.code === "unsupported_media");
    const truncatedJpeg = path.join(root, "truncated.jpg");
    await fs.promises.writeFile(truncatedJpeg, jpeg(20, 10).subarray(0, jpeg(20, 10).length - 2));
    await assert.rejects(store.importFile({ sourcePath: truncatedJpeg }), (error) => error.code === "unsupported_media");
    const malformedPng = png(20, 10);
    malformedPng.writeUInt32BE(1, malformedPng.length - 12);
    const malformedPngPath = path.join(root, "malformed-iend.png");
    await fs.promises.writeFile(malformedPngPath, malformedPng);
    await assert.rejects(store.importFile({ sourcePath: malformedPngPath }), (error) => error.code === "unsupported_media");
    await assert.rejects(store.importFile({ sourcePath: path.join(root, "missing.png") }), (error) => error.code === "source_unavailable");
    await assert.rejects(store.importFile({ sourcePath: sourcePng, storageRef: "../escape" }), (error) => error.code === "invalid_input");
    console.log("PASS rejects missing, forged, and unsupported inputs");

    const failingRoot = path.join(root, "failing");
    const failingStore = createEvidenceFileStore({
      rootDirectory: failingRoot,
      async link() { const error = new Error("disk failure"); error.code = "EIO"; throw error; }
    });
    await assert.rejects(failingStore.importFile({ sourcePath: sourcePng }), (error) => error.code === "managed_copy_failed");
    assert.deepStrictEqual(await fs.promises.readdir(path.join(failingRoot, "evidence")), []);
    const digest = crypto.createHash("sha256").update(png(640, 480)).digest("hex");
    const conflictRoot = path.join(root, "conflict");
    await fs.promises.mkdir(path.join(conflictRoot, "evidence"), { recursive: true });
    await fs.promises.writeFile(path.join(conflictRoot, "evidence", `${digest}.png`), "different bytes");
    await assert.rejects(
      createEvidenceFileStore({ rootDirectory: conflictRoot }).importFile({ sourcePath: sourcePng }),
      (error) => error.code === "managed_copy_conflict"
    );
    console.log("PASS cleans failed temporary writes and refuses managed-path conflicts");

    let release;
    const block = new Promise((resolve) => { release = resolve; });
    let active = 0;
    let maximum = 0;
    const queuedStore = createEvidenceFileStore({
      rootDirectory: path.join(root, "queued"),
      async readFile(filePath) {
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          await block;
          return await fs.promises.readFile(filePath);
        } finally {
          active -= 1;
        }
      }
    });
    const one = queuedStore.importFile({ sourcePath: sourcePng });
    const two = queuedStore.importFile({ sourcePath: sourceJpeg });
    release();
    await Promise.all([one, two]);
    assert.strictEqual(maximum, 1);
    console.log("PASS serializes concurrent imports");
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
  console.log("5 evidence file store scenarios passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
