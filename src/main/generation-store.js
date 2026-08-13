const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CURRENT_FILE = "CURRENT";
const PREVIOUS_FILE = "PREVIOUS";
const DOCUMENT_DIRECTORY = "documents";
const MANIFEST_DIRECTORY = "manifests";
const SCHEMA_VERSION = 1;
const CANDIDATE_SCHEMA_VERSION = 1;
const CANDIDATE_PREFIX = "candidate-";

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

function requireCandidateString(value, pathName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GenerationStoreError("invalid_candidate", `${pathName} must be a non-empty string.`);
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

  function candidateDocumentPath(candidateId, documentId) {
    return path.join(documentsDirectory, `${CANDIDATE_PREFIX}${candidateId}-${hashName(documentId)}.json`);
  }

  function candidateManifestPath(candidateId) {
    return path.join(manifestsDirectory, `${CANDIDATE_PREFIX}${candidateId}.json`);
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

  function normalizeCurrentIdentity(value, pathName) {
    if (value === null) return null;
    if (!isRecord(value)) throw new GenerationStoreError("invalid_candidate", `${pathName} must be null or an object.`);
    const fields = new Set(["generation", "manifestFile", "manifestSha256"]);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) throw new GenerationStoreError("invalid_candidate", `${pathName}.${unknown[0]} is not supported.`);
    requireGeneration(value.generation, `${pathName}.generation`);
    requireCandidateString(value.manifestFile, `${pathName}.manifestFile`);
    requireCandidateString(value.manifestSha256, `${pathName}.manifestSha256`);
    if (path.basename(value.manifestFile) !== value.manifestFile) throw new GenerationStoreError("invalid_candidate", `${pathName}.manifestFile must be a basename.`);
    return { generation: value.generation, manifestFile: value.manifestFile, manifestSha256: value.manifestSha256 };
  }

  function currentIdentity(committed) {
    return committed.status === "committed"
      ? { generation: committed.manifest.generation, manifestFile: committed.pointer.manifestFile, manifestSha256: committed.pointer.manifestSha256 }
      : null;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (!isRecord(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function candidateId(transactionId, expectedCurrent, createdAt, documents) {
    return hashName(canonical({ transactionId, expectedCurrent, createdAt, documents: documents.map((document) => ({ documentId: document.documentId, sha256: document.sha256, storage: document.storage })) }));
  }

  function validateCandidateDescriptor(value) {
    if (!isRecord(value)) throw new GenerationStoreError("invalid_candidate", "candidate descriptor must be an object.");
    const fields = new Set(["schemaVersion", "candidateId", "expectedCurrent", "transactionId", "createdAt", "generation", "manifestFile", "manifestSha256", "documents"]);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) throw new GenerationStoreError("invalid_candidate", `candidate.${unknown[0]} is not supported.`);
    if (value.schemaVersion !== CANDIDATE_SCHEMA_VERSION) throw new GenerationStoreError("invalid_candidate", "candidate.schemaVersion is unsupported.");
    const candidateIdValue = requireCandidateString(value.candidateId, "candidate.candidateId");
    const expectedCurrent = normalizeCurrentIdentity(value.expectedCurrent, "candidate.expectedCurrent");
    const transactionId = requireCandidateString(value.transactionId, "candidate.transactionId");
    const createdAt = requireCandidateString(value.createdAt, "candidate.createdAt");
    const generation = requireGeneration(value.generation, "candidate.generation");
    const manifestFile = requireCandidateString(value.manifestFile, "candidate.manifestFile");
    const manifestSha256 = requireCandidateString(value.manifestSha256, "candidate.manifestSha256");
    if (manifestFile !== `${CANDIDATE_PREFIX}${candidateIdValue}.json`) throw new GenerationStoreError("invalid_candidate", "candidate.manifestFile does not match candidateId.");
    const documents = Array.isArray(value.documents) ? value.documents.map((document, index) => {
      if (!isRecord(document)) throw new GenerationStoreError("invalid_candidate", `candidate.documents[${index}] must be an object.`);
      const documentFields = new Set(["documentId", "scope", "type", "fileName", "sha256", "storage"]);
      const documentUnknown = Object.keys(document).filter((field) => !documentFields.has(field)).sort();
      if (documentUnknown.length > 0) throw new GenerationStoreError("invalid_candidate", `candidate.documents[${index}].${documentUnknown[0]} is not supported.`);
      const normalized = {
        documentId: requireCandidateString(document.documentId, `candidate.documents[${index}].documentId`),
        scope: requireCandidateString(document.scope, `candidate.documents[${index}].scope`),
        type: requireCandidateString(document.type, `candidate.documents[${index}].type`),
        fileName: requireCandidateString(document.fileName, `candidate.documents[${index}].fileName`),
        sha256: requireCandidateString(document.sha256, `candidate.documents[${index}].sha256`),
        storage: document.storage
      };
      if (!["candidate", "reference"].includes(normalized.storage)) throw new GenerationStoreError("invalid_candidate", `candidate.documents[${index}].storage is invalid.`);
      if (path.basename(normalized.fileName) !== normalized.fileName) throw new GenerationStoreError("invalid_candidate", `candidate.documents[${index}].fileName must be a basename.`);
      if (normalized.storage === "candidate" && normalized.fileName !== `${CANDIDATE_PREFIX}${candidateIdValue}-${hashName(normalized.documentId)}.json`) {
        throw new GenerationStoreError("invalid_candidate", `candidate.documents[${index}].fileName does not match candidateId.`);
      }
      return normalized;
    }) : null;
    if (!documents || documents.length === 0) throw new GenerationStoreError("invalid_candidate", "candidate.documents must be a non-empty array.");
    const ids = new Set();
    documents.forEach((document) => {
      if (ids.has(document.documentId)) throw new GenerationStoreError("invalid_candidate", "candidate.documents contain duplicate document IDs.");
      ids.add(document.documentId);
    });
    const expectedCandidateId = candidateId(transactionId, expectedCurrent, createdAt, documents);
    if (expectedCandidateId !== candidateIdValue) throw new GenerationStoreError("invalid_candidate", "candidateId does not match candidate contents.");
    return { schemaVersion: CANDIDATE_SCHEMA_VERSION, candidateId: candidateIdValue, expectedCurrent, transactionId, createdAt, generation, manifestFile, manifestSha256, documents };
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

  function validateCandidateManifest(manifest) {
    if (!isRecord(manifest)) throw new GenerationStoreError("candidate_invalid", "Candidate manifest must be an object.");
    const fields = new Set(["schemaVersion", "generation", "transactionId", "createdAt", "documents"]);
    const unknown = Object.keys(manifest).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) throw new GenerationStoreError("candidate_invalid", `Candidate manifest.${unknown[0]} is not supported.`);
    return validateManifest(manifest);
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

  async function loadCandidate(candidateValue) {
    const candidate = validateCandidateDescriptor(candidateValue);
    const manifestTarget = candidateManifestPath(candidate.candidateId);
    let manifestBytes;
    try {
      manifestBytes = await fileSystem.readFile(manifestTarget);
    } catch (error) {
      throw new GenerationStoreError("candidate_missing", "Candidate manifest could not be read.", error);
    }
    const manifestHash = hashBytes(Buffer.from(manifestBytes));
    if (manifestHash !== candidate.manifestSha256) throw new GenerationStoreError("candidate_checksum_mismatch", "Candidate manifest checksum does not match the descriptor.");

    let manifest;
    try {
      manifest = validateCandidateManifest(JSON.parse(Buffer.from(manifestBytes).toString("utf8")));
    } catch (error) {
      throw new GenerationStoreError("candidate_invalid", "Candidate manifest is malformed.", error);
    }
    if (manifest.generation !== candidate.generation || manifest.transactionId !== candidate.transactionId || manifest.createdAt !== candidate.createdAt) {
      throw new GenerationStoreError("candidate_mismatch", "Candidate manifest does not match the descriptor.");
    }
    if (manifest.documents.length !== candidate.documents.length) throw new GenerationStoreError("candidate_mismatch", "Candidate manifest document count does not match the descriptor.");
    manifest.documents.forEach((document, index) => {
      const expected = candidate.documents[index];
      if (canonical({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: document.fileName, sha256: document.sha256 })
          !== canonical({ documentId: expected.documentId, scope: expected.scope, type: expected.type, fileName: expected.fileName, sha256: expected.sha256 })) {
        throw new GenerationStoreError("candidate_mismatch", `Candidate manifest document ${index} does not match the descriptor.`);
      }
    });

    const documents = [];
    for (const document of manifest.documents) {
      const fileName = path.basename(document.fileName);
      if (fileName !== document.fileName) throw new GenerationStoreError("candidate_invalid", "Candidate document path escaped the document directory.");
      let bytes;
      try {
        bytes = await fileSystem.readFile(path.join(documentsDirectory, fileName));
      } catch (error) {
        throw new GenerationStoreError("candidate_missing", `Candidate document '${document.documentId}' could not be read.`, error);
      }
      if (hashBytes(Buffer.from(bytes)) !== document.sha256) throw new GenerationStoreError("candidate_checksum_mismatch", `Candidate document '${document.documentId}' checksum does not match.`);
      try {
        documents.push({ ...document, value: JSON.parse(Buffer.from(bytes).toString("utf8")) });
      } catch (error) {
        throw new GenerationStoreError("candidate_invalid", `Candidate document '${document.documentId}' is malformed.`, error);
      }
    }
    return { status: "prepared", candidate: clone(candidate), manifest: clone(manifest), documents: clone(documents) };
  }

  function prepare(value) {
    return queueCommit(async () => {
      if (!isRecord(value)) throw new GenerationStoreError("invalid_input", "prepare value must be an object.");
      const fields = new Set(["expectedCurrent", "transactionId", "createdAt", "documents"]);
      const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
      if (unknown.length > 0) throw new GenerationStoreError("invalid_input", `prepare.${unknown[0]} is not supported.`);
      const expectedCurrent = normalizeCurrentIdentity(value.expectedCurrent, "prepare.expectedCurrent");
      const transactionId = requireString(value.transactionId, "transactionId");
      const createdAt = requireString(value.createdAt, "createdAt");
      if (!Array.isArray(value.documents) || value.documents.length === 0) throw new GenerationStoreError("invalid_input", "prepare.documents must be a non-empty array.");
      value.documents.forEach(validateDocumentInput);
      const logicalKeys = new Set(value.documents.map((document) => document.documentId));
      if (logicalKeys.size !== value.documents.length) throw new GenerationStoreError("invalid_input", "prepare.documents must contain unique logical document IDs.");

      const existing = await loadCommittedGeneration();
      if (existing.status === "recovery_required") throw new GenerationStoreError("recovery_required", "Cannot prepare a candidate while no valid committed generation is available.");
      const actualCurrent = currentIdentity(existing);
      if (canonical(actualCurrent) !== canonical(expectedCurrent)) throw new GenerationStoreError("stale_generation", "Expected current generation does not match the store.");

      const preparedDocuments = [];
      for (const document of value.documents) {
        if (document.reference) {
          const referencedFileName = path.basename(document.reference.fileName);
          if (referencedFileName !== document.reference.fileName) throw new GenerationStoreError("invalid_input", "Referenced document path escaped the document directory.");
          let referencedBytes;
          try {
            referencedBytes = await fileSystem.readFile(path.join(documentsDirectory, referencedFileName));
          } catch (error) {
            throw new GenerationStoreError("invalid_input", `Referenced document '${document.documentId}' could not be read.`, error);
          }
          if (hashBytes(Buffer.from(referencedBytes)) !== document.reference.sha256) throw new GenerationStoreError("invalid_input", `Referenced document '${document.documentId}' checksum does not match.`);
          try { JSON.parse(Buffer.from(referencedBytes).toString("utf8")); } catch (error) { throw new GenerationStoreError("invalid_input", `Referenced document '${document.documentId}' is malformed.`, error); }
          preparedDocuments.push({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: referencedFileName, sha256: document.reference.sha256, storage: "reference" });
          continue;
        }
        let bytes;
        try {
          bytes = Buffer.from(JSON.stringify(document.value), "utf8");
        } catch (error) {
          throw new GenerationStoreError("invalid_input", `Document '${document.documentId}' could not be serialized.`, error);
        }
        if (bytes.length === 0) throw new GenerationStoreError("invalid_input", `Document '${document.documentId}' could not be serialized.`);
        preparedDocuments.push({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: null, sha256: hashBytes(bytes), storage: "candidate", bytes });
      }

      const descriptorDocuments = preparedDocuments.map(({ bytes, ...document }) => document);
      const candidateIdValue = candidateId(transactionId, expectedCurrent, createdAt, descriptorDocuments);
      const generation = expectedCurrent === null ? 1 : expectedCurrent.generation + 1;
      await fileSystem.mkdir(documentsDirectory);
      await fileSystem.mkdir(manifestsDirectory);
      const manifestDocuments = [];
      for (let index = 0; index < preparedDocuments.length; index += 1) {
        const document = preparedDocuments[index];
        if (document.storage === "reference") {
          manifestDocuments.push({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: document.fileName, sha256: document.sha256 });
          continue;
        }
        const target = candidateDocumentPath(candidateIdValue, document.documentId);
        const temp = temporaryPath(target, transactionId);
        await fileSystem.writeFile(temp, document.bytes);
        await fileSystem.flush(temp);
        await fileSystem.rename(temp, target);
        document.fileName = path.basename(target);
        manifestDocuments.push({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: document.fileName, sha256: document.sha256 });
      }
      const manifest = { schemaVersion: SCHEMA_VERSION, generation, transactionId, createdAt, documents: manifestDocuments };
      validateManifest(manifest);
      const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
      const manifestTarget = candidateManifestPath(candidateIdValue);
      const manifestTemp = temporaryPath(manifestTarget, transactionId);
      await fileSystem.writeFile(manifestTemp, manifestBytes);
      await fileSystem.flush(manifestTemp);
      await fileSystem.rename(manifestTemp, manifestTarget);
      const descriptor = validateCandidateDescriptor({
        schemaVersion: CANDIDATE_SCHEMA_VERSION,
        candidateId: candidateIdValue,
        expectedCurrent,
        transactionId,
        createdAt,
        generation,
        manifestFile: path.basename(manifestTarget),
        manifestSha256: hashBytes(manifestBytes),
        documents: preparedDocuments.map((document) => ({ documentId: document.documentId, scope: document.scope, type: document.type, fileName: document.fileName, sha256: document.sha256, storage: document.storage }))
      });
      return { status: "prepared", candidate: descriptor };
    });
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

  return Object.freeze({ commit, loadCommittedGeneration, prepare, loadCandidate });
}

module.exports = { createGenerationStore, GenerationStoreError };
