const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_BYTES = 25 * 1024 * 1024;

class EvidenceFileStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvidenceFileStoreError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new EvidenceFileStoreError(code, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${label} must be non-empty.`);
  return value;
}

function pngMetadata(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 45
      || bytes.subarray(0, 8).toString("hex") !== signature
      || bytes.readUInt32BE(8) !== 13
      || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
      || bytes.readUInt32BE(bytes.length - 12) !== 0
      || bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") !== "IEND") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { mediaType: "image/png", extension: "png", pixelWidth: width, pixelHeight: height } : null;
}

function jpegMetadata(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (segmentLength < 7) break;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { mediaType: "image/jpeg", extension: "jpg", pixelWidth: width, pixelHeight: height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function detectImage(bytes) {
  return pngMetadata(bytes) || jpegMetadata(bytes);
}

function createEvidenceFileStore(options) {
  if (!isPlainObject(options)) fail("invalid_factory", "options must be a plain object.");
  const unknown = Object.keys(options).filter((field) => !["rootDirectory", "readFile", "writeFile", "mkdir", "stat", "link", "unlink"].includes(field)).sort();
  if (unknown.length > 0) fail("invalid_factory", `options.${unknown[0]} is not supported.`);
  const rootDirectory = path.resolve(requiredString(options.rootDirectory, "options.rootDirectory"));
  const readFile = options.readFile || fs.promises.readFile.bind(fs.promises);
  const writeFile = options.writeFile || fs.promises.writeFile.bind(fs.promises);
  const mkdir = options.mkdir || fs.promises.mkdir.bind(fs.promises);
  const stat = options.stat || fs.promises.stat.bind(fs.promises);
  const link = options.link || fs.promises.link.bind(fs.promises);
  const unlink = options.unlink || fs.promises.unlink.bind(fs.promises);
  [readFile, writeFile, mkdir, stat, link, unlink].forEach((dependency) => {
    if (typeof dependency !== "function") fail("invalid_factory", "Evidence file dependencies must be functions.");
  });
  let queueTail = Promise.resolve();

  async function importFile(input) {
    if (!isPlainObject(input) || Object.keys(input).some((field) => field !== "sourcePath")) {
      fail("invalid_input", "importFile input must contain only sourcePath.");
    }
    const sourcePath = path.resolve(requiredString(input.sourcePath, "input.sourcePath"));
    let sourceStat;
    try { sourceStat = await stat(sourcePath); } catch (_error) { fail("source_unavailable", "Evidence source file could not be read."); }
    if (!sourceStat.isFile()) fail("source_unavailable", "Evidence source must be a file.");
    if (sourceStat.size < 1 || sourceStat.size > MAX_BYTES) fail("invalid_size", `Evidence source must be between 1 and ${MAX_BYTES} bytes.`);
    let bytes;
    try { bytes = await readFile(sourcePath); } catch (_error) { fail("source_unavailable", "Evidence source file could not be read."); }
    let verifiedSourceStat;
    try { verifiedSourceStat = await stat(sourcePath); } catch (_error) { fail("source_changed", "Evidence source changed while it was being imported."); }
    if (!Buffer.isBuffer(bytes)
        || bytes.length !== sourceStat.size
        || !verifiedSourceStat.isFile()
        || verifiedSourceStat.size !== sourceStat.size
        || verifiedSourceStat.mtimeMs !== sourceStat.mtimeMs
        || verifiedSourceStat.ctimeMs !== sourceStat.ctimeMs) {
      fail("source_changed", "Evidence source changed while it was being imported.");
    }
    const image = detectImage(bytes);
    if (!image) fail("unsupported_media", "Evidence source must be a valid PNG or JPEG image.");
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const integrityHash = `sha256:${digest}`;
    const fileName = `${digest}.${image.extension}`;
    const targetDirectory = path.join(rootDirectory, "evidence");
    const targetPath = path.join(targetDirectory, fileName);
    const temporaryPath = path.join(targetDirectory, `.${digest}.${crypto.randomUUID()}.tmp`);
    const storageRef = `evidence/${fileName}`;
    await mkdir(targetDirectory, { recursive: true });
    let reused = false;
    try {
      const existing = await readFile(targetPath);
      const existingHash = crypto.createHash("sha256").update(existing).digest("hex");
      if (existingHash !== digest) fail("managed_copy_conflict", "Managed evidence path contains different bytes.");
      reused = true;
    } catch (error) {
      if (error instanceof EvidenceFileStoreError) throw error;
      let publishError = null;
      try {
        await writeFile(temporaryPath, bytes, { flag: "wx" });
        await link(temporaryPath, targetPath);
      } catch (writeError) {
        publishError = writeError;
      }
      try { await unlink(temporaryPath); } catch (_cleanupError) { /* best effort after publish or failure */ }
      if (publishError) {
        if (["EEXIST", "EPERM"].includes(publishError.code)) {
          const existing = await readFile(targetPath);
          if (crypto.createHash("sha256").update(existing).digest("hex") !== digest) {
            fail("managed_copy_conflict", "Managed evidence path contains different bytes.");
          }
          reused = true;
        } else {
          fail("managed_copy_failed", "Evidence could not be copied into managed storage.");
        }
      }
    }
    return Object.freeze({
      storageRef,
      integrityHash,
      mediaType: image.mediaType,
      byteSize: bytes.length,
      pixelWidth: image.pixelWidth,
      pixelHeight: image.pixelHeight,
      originalFileName: path.basename(sourcePath),
      originalModifiedAt: sourceStat.mtime.toISOString(),
      reused
    });
  }

  function enqueueImport(input) {
    const queued = queueTail.then(() => importFile(input), () => importFile(input));
    queueTail = queued.catch(() => undefined);
    return queued;
  }

  return Object.freeze({ importFile: enqueueImport });
}

module.exports = { createEvidenceFileStore, EvidenceFileStoreError, MAX_BYTES };
