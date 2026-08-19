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

test("renderer persists a scoped ownership audit intent with capture metadata", () => {
  assert.match(renderer, /actionType: "ownership_confirmed"/);
  assert.match(renderer, /targetType: "ownership_record"/);
  assert.match(renderer, /applicationPersistenceFacade\.execute\(async \(\) => \{[\s\S]*\}, auditIntent\)/);
  assert.match(renderer, /details: \{[\s\S]*ownerUnionId: ownerId,[\s\S]*eventAt,[\s\S]*evidenceIds: evidenceIds\.slice\(\)/);
});
