const assert = require("assert");
const { createOwnershipHistoryProvenanceDocumentSerializer } = require("../src/services/ownership-history-provenance-document-serializer.js");
const { createOwnershipProvenanceCandidateDocumentBuilder, OwnershipProvenanceCandidateDocumentBuilderError } = require("../src/services/ownership-provenance-candidate-document-builder.js");

const seasonId = "season-1";
const baseMapId = "season1-map";
const provenanceSerializer = createOwnershipHistoryProvenanceDocumentSerializer();
const provenanceDocument = provenanceSerializer.serialize({ seasonId, baseMapId, activeSeasonId: seasonId, records: [] });

function snapshot(documents) {
  return { status: "loaded", manifest: { generation: 3, documents } };
}
function committedDocuments(includeProvenance = false) {
  const documents = [
    { documentId: "union-registry-global", scope: "global", type: "union-registry", fileName: "generation-3-union.json", sha256: "sha256:union" },
    { documentId: "strategic-season-1", scope: seasonId, type: "strategic-domain", fileName: "generation-3-strategic.json", sha256: "sha256:strategic" },
    { documentId: "projection-season-1-season1-map", scope: `${seasonId}/${baseMapId}`, type: "server-state", fileName: "generation-3-projection.json", sha256: "sha256:projection" },
    { documentId: "application-audit-global", scope: "global", type: "application-audit", fileName: "generation-3-audit.json", sha256: "sha256:audit" }
  ];
  if (includeProvenance) documents.push({ documentId: provenanceDocument.documentId, scope: `${seasonId}/${baseMapId}`, type: "ownership-history-provenance", fileName: "generation-3-provenance.json", sha256: "sha256:old-provenance" });
  return documents;
}
function input(includeProvenance = false) { return { snapshot: snapshot(committedDocuments(includeProvenance)), provenanceDocument }; }
function assertCode(callback, code) { return assert.throws(callback, (error) => error instanceof OwnershipProvenanceCandidateDocumentBuilderError && error.code === code); }

const builder = createOwnershipProvenanceCandidateDocumentBuilder();
const appended = builder.build(input());
assert.deepStrictEqual(appended.documents.map((document) => document.documentId), ["union-registry-global", "strategic-season-1", "projection-season-1-season1-map", "application-audit-global", provenanceDocument.documentId]);
assert.deepStrictEqual(appended.documents.slice(0, 4).map((document) => document.reference.fileName), ["generation-3-union.json", "generation-3-strategic.json", "generation-3-projection.json", "generation-3-audit.json"]);
assert.strictEqual(appended.documents[4].value.documentId, provenanceDocument.documentId);
console.log("PASS provenance document appends with complete references");

const replaced = builder.build(input(true));
assert.strictEqual(replaced.documents.length, 5);
assert.strictEqual(replaced.documents[4].value.proofVersion, provenanceDocument.proofVersion);
assert.strictEqual(replaced.documents.filter((document) => document.documentId === provenanceDocument.documentId).length, 1);
assert.strictEqual(replaced.documents[4].reference, undefined);
console.log("PASS existing provenance document is replaced in place");

assert.deepStrictEqual(replaced.documents.map((document) => document.documentId), replaced.documents.slice().sort((left, right) => committedDocuments(true).findIndex((document) => document.documentId === left.documentId) - committedDocuments(true).findIndex((document) => document.documentId === right.documentId)).map((document) => document.documentId));
console.log("PASS candidate ordering is deterministic");

const invalidCases = [
  ["provenance_scope_mismatch", { provenanceDocument: { ...provenanceDocument, baseMapId: "other-map" } }],
  ["duplicate_provenance_document", { snapshot: snapshot(committedDocuments(true).concat([{ ...committedDocuments(true)[4], documentId: "provenance-copy" }]) ) }],
  ["invalid_input", { snapshot: snapshot(committedDocuments().map((document) => document.documentId === "union-registry-global" ? { ...document, sha256: "" } : document)) }],
  ["scope_mismatch", { snapshot: snapshot(committedDocuments().map((document) => document.documentId === "projection-season-1-season1-map" ? { ...document, scope: "season-2/other-map" } : document)) }]
];
invalidCases.forEach(([code, overrides]) => assertCode(() => builder.build({ ...input(), ...overrides }), code));
console.log("PASS validation failures reject closed");

const beforeSnapshot = JSON.stringify(input());
const beforeProvenance = JSON.stringify(provenanceDocument);
const safe = builder.build(input());
safe.documents[0].reference.fileName = "changed";
assert.strictEqual(JSON.stringify(input()), beforeSnapshot);
assert.strictEqual(JSON.stringify(provenanceDocument), beforeProvenance);
assert.ok(Object.isFrozen(safe));
assert.ok(Object.isFrozen(safe.documents));
assert.ok(Object.isFrozen(safe.documents[safe.documents.length - 1].value.records));
console.log("PASS inputs and result are isolated and immutable");

console.log("5 ownership provenance candidate document builder scenarios passed");
