const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function isStrictPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertIdentity(identity) {
  if (!isStrictPlainObject(identity)) {
    throw new TypeError("Identity must be a strict plain object.");
  }

  const keys = Object.keys(identity);
  if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(identity, "seasonId") || !Object.prototype.hasOwnProperty.call(identity, "baseMapId")) {
    throw new TypeError("Identity must contain exactly seasonId and baseMapId.");
  }

  if (!isNonEmptyString(identity.seasonId) || !isNonEmptyString(identity.baseMapId)) {
    throw new TypeError("Identity seasonId and baseMapId must be non-empty strings.");
  }
}

function assertEnvelope(envelope) {
  if (!isStrictPlainObject(envelope)) {
    throw new TypeError("Envelope must be a strict plain object.");
  }
}

function createIdentityHash(identity) {
  const canonicalIdentity = JSON.stringify({
    seasonId: identity.seasonId,
    baseMapId: identity.baseMapId
  });

  return crypto.createHash("sha256").update(canonicalIdentity, "utf8").digest("hex");
}

function resolveEnvelopeFilePath(baseDirectory, identity) {
  const hashedName = `${createIdentityHash(identity)}.json`;
  const resolvedBaseDirectory = path.resolve(baseDirectory);
  const resolvedFilePath = path.resolve(resolvedBaseDirectory, hashedName);

  const inBaseDirectory = resolvedFilePath === resolvedBaseDirectory
    || resolvedFilePath.startsWith(`${resolvedBaseDirectory}${path.sep}`);

  if (!inBaseDirectory) {
    throw new Error("Resolved file path escaped base directory.");
  }

  return {
    resolvedBaseDirectory,
    resolvedFilePath,
    hashedName
  };
}

function createTemporaryFilePath(resolvedBaseDirectory, hashedName) {
  const randomSegment = crypto.randomBytes(8).toString("hex");
  return path.join(
    resolvedBaseDirectory,
    `${hashedName}.${process.pid}.${Date.now()}.${randomSegment}.tmp`
  );
}

function createPersistenceFileStore(options) {
  const config = options && typeof options === "object" ? options : null;
  const baseDirectory = config && config.baseDirectory;

  if (!isNonEmptyString(baseDirectory)) {
    throw new TypeError("createPersistenceFileStore requires a non-empty baseDirectory string.");
  }

  async function loadEnvelope(identity) {
    assertIdentity(identity);

    const { resolvedFilePath } = resolveEnvelopeFilePath(baseDirectory, identity);

    try {
      const serialized = await fs.promises.readFile(resolvedFilePath, "utf8");
      return JSON.parse(serialized);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async function saveEnvelope(identity, envelope) {
    assertIdentity(identity);
    assertEnvelope(envelope);

    if (envelope.seasonId !== identity.seasonId || envelope.baseMapId !== identity.baseMapId) {
      throw new TypeError("Envelope seasonId and baseMapId must match identity.");
    }

    const { resolvedBaseDirectory, resolvedFilePath, hashedName } = resolveEnvelopeFilePath(baseDirectory, identity);
    const temporaryFilePath = createTemporaryFilePath(resolvedBaseDirectory, hashedName);
    const serialized = JSON.stringify(envelope);

    await fs.promises.mkdir(resolvedBaseDirectory, { recursive: true });

    try {
      await fs.promises.writeFile(temporaryFilePath, serialized, { encoding: "utf8" });
      await fs.promises.rename(temporaryFilePath, resolvedFilePath);
    } catch (error) {
      try {
        await fs.promises.unlink(temporaryFilePath);
      } catch (_cleanupError) {
        // Best-effort cleanup.
      }

      throw error;
    }
  }

  return {
    loadEnvelope,
    saveEnvelope
  };
}

module.exports = {
  createPersistenceFileStore
};
