const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CURRENT_FILE = "CURRENT";
const PREVIOUS_FILE = "PREVIOUS";
const DOCUMENT_DIRECTORY = "documents";
const MANIFEST_DIRECTORY = "manifests";
const SCHEMA_VERSION = 1;

class GenerationStoreError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "GenerationStoreError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, pathName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GenerationStoreError("invalid_input", `${pathName} must be a non-empty string.`);
  }
  return value;
}

function requireGeneration(value, pathName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GenerationStoreError("invalid_input", `${pathName} must be a non-negative safe integer.`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function hashBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function hashName(value) {
  return crypto.createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function isMissingError(error) {
  return Boolean(error && (error.code === "ENOENT" || isMissingError(error.cause)));
}

function createDefaultFileSystem() {
  return {
    async mkdir(directory) { return fs.promises.mkdir(directory, { recursive: true }); },
    async readFile(filePath) { return fs.promises.readFile(filePath); },
    async writeFile(filePath, data) { return fs.promises.writeFile(filePath, data); },
    async rename(from, to) { return fs.promises.rename(from, to); },
    async unlink(filePath) { return fs.promises.unlink(filePath); },
    async readdir(directory) { return fs.promises.readdir(directory); },
    async access(filePath) { return fs.promises.access(filePath); },
    async flush(filePath) {
      let handle;
      try {
        handle = await fs.promises.open(filePath, "r+");
        await handle.sync();
      } finally {
        if (handle) await handle.close();
      }
    }
  };
}

function createGenerationStore(options) {
  if (!isRecord(options)) {
    throw new GenerationStoreError("invalid_factory", "options must be a plain object.");
  }
  const baseDirectory = path.resolve(requireString(options.baseDirectory, "options.baseDirectory"));
  const fileSystem = options.fileSystem || createDefaultFileSystem();
  const requiredMethods = ["mkdir", "readFile", "writeFile", "rename", "unlink", "readdir", "access", "flush"];
  requiredMethods.forEach((method) => {
    if (typeof fileSystem[method] !== "function") {
      throw new GenerationStoreError("invalid_factory", `options.fileSystem.${method} must be a function.`);
    }
  });
  let commitTail = Promise.resolve();

  const documentsDirectory = path.join(baseDirectory, DOCUMENT_DIRECTORY);
  const manifestsDirectory = path.join(baseDirectory, MANIFEST_DIRECTORY);
  const pointerPath = (name) => path.join(baseDirectory, name);

  function documentPath(generation, transactionId, documentId) {
    return path.join(
      documentsDirectory,
      `generation-${generation}-${hashName(transactionId)}-${hashName(documentId)}.json`
    );
  }

  function manifestPath(generation, transactionId) {
    return path.join(manifestsDirectory, `generation-${generation}-${hashName(transactionId)}.json`);
  }

  function temporaryPath(target, transactionId) {
    return `${target}.${hashName(transactionId)}.${process.pid}.tmp`;
  }

  function validateDocumentInput(document, index) {
    if (!isRecord(document)) throw new GenerationStoreError("invalid_input", `documents[${index}] must be an object.`);
    requireString(document.documentId, `documents[${index}].documentId`);
    requireString(document.scope, `documents[${index}].scope`);
    requireString(document.type, `documents[${index}].type`);
    const hasValue = Object.prototype.hasOwnProperty.call(document, "value");
    const hasReference = isRecord(document.reference);
    if (hasValue === hasReference) {
      throw new GenerationStoreError("invalid_input", `documents[${index}] must provide exactly one of value or reference.`);
    }
    if (hasReference) {
      requireString(document.reference.fileName, `documents[${index}].reference.fileName`);
      requireString(document.reference.sha256, `documents[${index}].reference.sha256`);
    }
  }

  function validateManifest(manifest) {
    if (!isRecord(manifest) || manifest.schemaVersion !== SCHEMA_VERSION) {
      throw new GenerationStoreError("invalid_manifest", "Manifest schemaVersion is unsupported.");
    }
    requireGeneration(manifest.generation, "manifest.generation");
    requireString(manifest.transactionId, "manifest.transactionId");
    requireString(manifest.createdAt, "manifest.createdAt");
    if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
      throw new GenerationStoreError("invalid_manifest", "Manifest documents must be a non-empty array.");
    }
    const seen = new Set();
    manifest.documents.forEach((document, index) => {
      if (!isRecord(document)) throw new GenerationStoreError("invalid_manifest", `manifest.documents[${index}] must be an object.`);
      requireString(document.documentId, `manifest.documents[${index}].documentId`);
      requireString(document.scope, `manifest.documents[${index}].scope`);
      requireString(document.type, `manifest.documents[${index}].type`);
      requireString(document.fileName, `manifest.documents[${index}].fileName`);
      requireString(document.sha256, `manifest.documents[${index}].sha256`);
      if (seen.has(document.documentId)) throw new GenerationStoreError("invalid_manifest", "Manifest document IDs must be unique.");
      seen.add(document.documentId);
    });
    return manifest;
  }

  function validatePointer(pointer) {
    if (!isRecord(pointer) || pointer.schemaVersion !== SCHEMA_VERSION) {
      throw new GenerationStoreError("invalid_pointer", "Pointer schemaVersion is unsupported.");
    }
    requireGeneration(pointer.generation, "pointer.generation");
    requireString(pointer.manifestFile, "pointer.manifestFile");
    requireString(pointer.manifestSha256, "pointer.manifestSha256");
    return pointer;
  }

  async function readJson(filePath, code) {
    let bytes;
    try {
      bytes = await fileSystem.readFile(filePath);
    } catch (error) {
      throw new GenerationStoreError(code, `Unable to read '${filePath}'.`, error);
    }
    try {
      return JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch (error) {
      throw new GenerationStoreError(code, `Invalid JSON in '${filePath}'.`, error);
    }
  }

  async function readPointer(name) {
    try {
      return validatePointer(await readJson(pointerPath(name), "invalid_pointer"));
    } catch (error) {
      if (isMissingError(error)) return null;
      throw error;
    }
  }

  async function validatePointedGeneration(pointer) {
    if (!pointer) return null;
    const manifestFile = path.basename(pointer.manifestFile);
    if (manifestFile !== pointer.manifestFile) throw new GenerationStoreError("invalid_pointer", "Manifest path escaped the manifest directory.");
    const manifestFilePath = path.join(manifestsDirectory, manifestFile);
    let manifestBytes;
    try {
      manifestBytes = await fileSystem.readFile(manifestFilePath);
    } catch (error) {
      throw new GenerationStoreError("invalid_generation", "Pointer references a missing manifest.", error);
    }
    if (hashBytes(Buffer.from(manifestBytes)) !== pointer.manifestSha256) {
      throw new GenerationStoreError("invalid_generation", "Manifest hash does not match pointer.");
    }
    const manifest = validateManifest(JSON.parse(Buffer.from(manifestBytes).toString("utf8")));
    if (manifest.generation !== pointer.generation) throw new GenerationStoreError("invalid_generation", "Manifest generation does not match pointer.");
    const documents = [];
    for (const document of manifest.documents) {
      const fileName = path.basename(document.fileName);
      if (fileName !== document.fileName) throw new GenerationStoreError("invalid_generation", "Document path escaped the document directory.");
      const bytes = await fileSystem.readFile(path.join(documentsDirectory, fileName));
      if (hashBytes(Buffer.from(bytes)) !== document.sha256) throw new GenerationStoreError("invalid_generation", `Document '${document.documentId}' hash does not match manifest.`);
      documents.push({ ...document, value: JSON.parse(Buffer.from(bytes).toString("utf8")) });
    }
    return { pointer: clone(pointer), manifest: clone(manifest), documents: clone(documents) };
  }

  async function loadCommittedGeneration() {
    let current = null;
    try { current = await readPointer(CURRENT_FILE); } catch (error) { current = { error }; }
    if (current) {
      try { return { status: "committed", source: "current", ...await validatePointedGeneration(current) }; } catch (error) { current = { error }; }
    }
    let previous = null;
    try { previous = await readPointer(PREVIOUS_FILE); } catch (error) { previous = { error }; }
    if (previous) {
      try { return { status: "committed", source: "previous", ...await validatePointedGeneration(previous), recovery: "current_invalid" }; } catch (error) { previous = { error }; }
    }
    if (!current && !previous) return { status: "missing" };
    return { status: "recovery_required", errorCode: "no_valid_commit_pointer" };
  }

  function queueCommit(task) {
    const queued = commitTail.then(task, task);
    commitTail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  function commit(value) {
    return queueCommit(async () => {
      if (!isRecord(value)) throw new GenerationStoreError("invalid_input", "commit value must be an object.");
      const expectedGeneration = requireGeneration(value.expectedGeneration, "expectedGeneration");
      const transactionId = requireString(value.transactionId, "transactionId");
      const createdAt = requireString(value.createdAt, "createdAt");
      if (!Array.isArray(value.documents) || value.documents.length === 0) throw new GenerationStoreError("invalid_input", "documents must be a non-empty array.");
      value.documents.forEach(validateDocumentInput);
      const logicalKeys = new Set(value.documents.map((document) => document.documentId));
      if (logicalKeys.size !== value.documents.length) {
        throw new GenerationStoreError("invalid_input", "documents must contain unique logical document IDs.");
      }
      const existing = await loadCommittedGeneration();
      const currentGeneration = existing.status === "committed" ? existing.manifest.generation : 0;
      if (currentGeneration !== expectedGeneration) throw new GenerationStoreError("stale_generation", `Expected generation ${expectedGeneration}, current generation is ${currentGeneration}.`);
      const generation = currentGeneration + 1;
      await fileSystem.mkdir(documentsDirectory);
      await fileSystem.mkdir(manifestsDirectory);
      const manifestDocuments = [];
      for (const document of value.documents) {
        if (document.reference) {
          const referencedFileName = path.basename(document.reference.fileName);
          if (referencedFileName !== document.reference.fileName) {
            throw new GenerationStoreError("invalid_input", "Referenced document path escaped the document directory.");
          }
          const referencedPath = path.join(documentsDirectory, referencedFileName);
          const referencedBytes = await fileSystem.readFile(referencedPath);
          if (hashBytes(Buffer.from(referencedBytes)) !== document.reference.sha256) {
            throw new GenerationStoreError("invalid_input", `Referenced document '${document.documentId}' hash does not match.`);
          }
          JSON.parse(Buffer.from(referencedBytes).toString("utf8"));
          manifestDocuments.push({
            documentId: document.documentId,
            scope: document.scope,
            type: document.type,
            fileName: referencedFileName,
            sha256: document.reference.sha256
          });
          continue;
        }
        const target = documentPath(generation, transactionId, document.documentId);
        const temp = temporaryPath(target, transactionId);
        const bytes = Buffer.from(JSON.stringify(document.value), "utf8");
        await fileSystem.writeFile(temp, bytes);
        await fileSystem.flush(temp);
        await fileSystem.rename(temp, target);
        manifestDocuments.push({
          documentId: document.documentId,
          scope: document.scope,
          type: document.type,
          fileName: path.basename(target),
          sha256: hashBytes(bytes)
        });
      }
      const manifest = {
        schemaVersion: SCHEMA_VERSION,
        generation,
        transactionId,
        createdAt,
        documents: manifestDocuments
      };
      validateManifest(manifest);
      const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
      const manifestTarget = manifestPath(generation, transactionId);
      const manifestTemp = temporaryPath(manifestTarget, transactionId);
      await fileSystem.writeFile(manifestTemp, manifestBytes);
      await fileSystem.flush(manifestTemp);
      await fileSystem.rename(manifestTemp, manifestTarget);
      const oldPointer = existing.status === "committed" ? existing.pointer : null;
      if (oldPointer) {
        const previousTemp = temporaryPath(pointerPath(PREVIOUS_FILE), transactionId);
        await fileSystem.writeFile(previousTemp, Buffer.from(JSON.stringify(oldPointer), "utf8"));
        await fileSystem.flush(previousTemp);
        await fileSystem.rename(previousTemp, pointerPath(PREVIOUS_FILE));
      }
      const nextPointer = {
        schemaVersion: SCHEMA_VERSION,
        generation,
        manifestFile: path.basename(manifestTarget),
        manifestSha256: hashBytes(manifestBytes)
      };
      const currentTemp = temporaryPath(pointerPath(CURRENT_FILE), transactionId);
      await fileSystem.writeFile(currentTemp, Buffer.from(JSON.stringify(nextPointer), "utf8"));
      await fileSystem.flush(currentTemp);
      await fileSystem.rename(currentTemp, pointerPath(CURRENT_FILE));
      const visible = await loadCommittedGeneration();
      if (visible.status !== "committed" || visible.source !== "current" || visible.manifest.generation !== generation) {
        throw new GenerationStoreError("commit_verification_failed", "New generation was not visible after CURRENT replacement.");
      }
      return { status: "committed", generation, transactionId, manifest: clone(manifest) };
    });
  }

  return Object.freeze({ commit, loadCommittedGeneration });
}

module.exports = { createGenerationStore, GenerationStoreError };
