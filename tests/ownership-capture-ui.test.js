const assert = require("assert");
const fs = require("fs");
const path = require("path");

const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "map-renderer.js"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("renderer exposes one submit-based ownership capture form", () => {
  assert.match(renderer, /data-ownership-capture-form/);
  assert.match(renderer, /selectionPanel\.addEventListener\("submit", handleSelectionPanelSubmit\)/);
  assert.doesNotMatch(renderer, /selectionPanel\.addEventListener\("change", handleSelectionPanelChange\)/);
});

test("renderer supports now exact and bounded window ownership event time", () => {
  assert.match(renderer, /\{ value: "now", label: "Now" \}/);
  assert.match(renderer, /\{ value: "exact", label: "Exact" \}/);
  assert.match(renderer, /\{ value: "window", label: "Bounded window" \}/);
  assert.match(renderer, /precision: "bounded"/);
  assert.match(renderer, /precision: "exact"/);
});

test("renderer sends evidence IDs and strategic-node targets to capture coordinator", () => {
  assert.match(renderer, /parseEvidenceIds\(/);
  assert.match(renderer, /topologyTargetType: "strategic_node"/);
  assert.match(renderer, /territoryRef:\s*\{\s*type: "strategic_node",\s*nodeId: selectedItem\.nodeId\s*\}/);
  assert.match(renderer, /eventAt,/);
  assert.match(renderer, /evidenceIds/);
});

test("renderer imports managed screenshots into durable evidence records before linking", () => {
  assert.match(renderer, /data-ownership-import-evidence/);
  assert.match(renderer, /window\.warMapEvidenceStorage/);
  assert.match(renderer, /bridge\.selectAndImport\(\)/);
  assert.match(renderer, /registerUploadedAsset\(localActor/);
  assert.match(renderer, /createManualAttachment\(localActor/);
  assert.match(renderer, /actionType: "ownership_evidence_attached"/);
  assert.match(renderer, /attachment\.evidenceId/);
  assert.match(renderer, /selectionPanel\.addEventListener\("click", handleSelectionPanelClick\)/);
});

test("renderer persists a scoped ownership audit intent with capture metadata", () => {
  assert.match(renderer, /actionType: correction \? "ownership_corrected" : "ownership_confirmed"/);
  assert.match(renderer, /targetType: "ownership_record"/);
  assert.match(renderer, /applicationPersistenceFacade\.execute\(\s*\(\) => executeOwnershipCapture\(captureSpec\),\s*auditIntent\s*\)/);
  assert.match(renderer, /registerOwnershipCaptureOperation\(captureSpec, captureResult\)/);
  assert.match(renderer, /details: \{[\s\S]*ownerUnionId: ownerId,[\s\S]*eventAt,[\s\S]*evidenceIds: evidenceIds\.slice\(\)/);
});

test("renderer requires and audits a reason for exact ownership corrections", () => {
  assert.match(renderer, /data-correction-of/);
  assert.match(renderer, /name = "correctionReason"/);
  assert.match(renderer, /Correction reason is required when replacing a confirmed ownership fact/);
  assert.match(renderer, /actionType: correction \? "ownership_corrected" : "ownership_confirmed"/);
  assert.match(renderer, /correctionOf: correction \? correction\.recordId : null/);
  assert.match(renderer, /correctionReason: correction \? correction\.reason : null/);
  assert.match(renderer, /eventAt\.precision === "exact"/);
});

test("renderer collects undo reasons inline without unsupported prompt dialogs", () => {
  assert.match(renderer, /data-ownership-undo-reason/);
  assert.match(renderer, /Why is the last capture being undone/);
  assert.match(renderer, /requestOwnershipUndoReason\(selectionPanel\)/);
  assert.doesNotMatch(renderer, /globalThis\.prompt|\.prompt\("Undo reason/);
});
