const assert = require("assert");
const {
  createTemporalMetadataContract,
  TemporalMetadataError,
  validateEventAt,
  validateRuleVersionRef
} = require("../src/services/temporal-metadata-contract.js");

const clockValue = new Date("2026-08-12T12:00:00.000Z");
const contract = createTemporalMetadataContract({ clock: () => clockValue });
const ruleVersionRef = { seasonId: "season-1", packageVersion: "0.5.0", rulesVersion: "rules-v1" };

function record(extra = {}) {
  return {
    recordId: "ownership-1",
    seasonId: "season-1",
    serverId: "server-366",
    eventAt: { precision: "exact", at: "2026-08-12T10:00:00.000Z" },
    ...extra
  };
}

assert.deepStrictEqual(contract.normalizeNew(record({ observedAt: "2026-08-12T10:05:00.000Z", reviewedAt: "2026-08-12T10:06:00.000Z", ruleVersionRef })), {
  ...record({ observedAt: "2026-08-12T10:05:00.000Z", reviewedAt: "2026-08-12T10:06:00.000Z", ruleVersionRef }),
  recordedAt: "2026-08-12T12:00:00.000Z",
  recordedAtLegacyUnknown: false
});
assert.deepStrictEqual(validateEventAt({ precision: "bounded", earliestAt: "2026-08-12T09:00:00Z", latestAt: "2026-08-12T11:00:00Z" }), {
  precision: "bounded", earliestAt: "2026-08-12T09:00:00Z", latestAt: "2026-08-12T11:00:00Z"
});
assert.deepStrictEqual(validateEventAt({ precision: "unknown" }), { precision: "unknown" });
assert.throws(() => validateEventAt({ precision: "exact", at: "not-a-time" }), (error) => error.code === "invalid_timestamp");
assert.throws(() => validateEventAt({ precision: "exact", at: "2026-02-30T00:00:00Z" }), (error) => error.code === "invalid_timestamp");
assert.throws(() => validateEventAt({ precision: "bounded", earliestAt: "2026-08-12T12:00:00Z", latestAt: "2026-08-12T11:00:00Z" }), (error) => error.code === "invalid_event_time");
assert.throws(() => contract.normalizeNew(record({ recordedAt: "2026-08-12T11:00:00.000Z" })), (error) => error.code === "caller_recorded_at");
assert.throws(() => contract.normalizeNew(record({ ruleVersionRef: { seasonId: "season-1" } })), (error) => error.code === "invalid_rule_version");
assert.deepStrictEqual(contract.normalizeLegacy({
  recordId: "legacy-1", seasonId: "season-1", serverId: "server-366", effectiveAt: "2026-08-10T08:00:00Z",
  observedAt: "2026-08-10T09:00:00Z", reviewedAt: "2026-08-10T10:00:00Z"
}), {
  recordId: "legacy-1", seasonId: "season-1", serverId: "server-366",
  eventAt: { precision: "exact", at: "2026-08-10T08:00:00Z" },
  observedAt: "2026-08-10T09:00:00Z", reviewedAt: "2026-08-10T10:00:00Z",
  recordedAt: null, recordedAtLegacyUnknown: true
});
assert.deepStrictEqual(contract.normalizeLegacy({
  recordId: "legacy-2", seasonId: "season-1", serverId: "server-366", eventAt: { precision: "unknown" }, recordedAt: "2026-08-11T10:00:00Z"
}).recordedAt, "2026-08-11T10:00:00Z");
assert.strictEqual(contract.normalizeLegacy({
  recordId: "legacy-3", seasonId: "season-1", serverId: "server-366", eventAt: { precision: "unknown" }
}).eventAt.precision, "unknown");
assert.strictEqual(contract.normalizeLegacy({
  recordId: "legacy-4", seasonId: "season-1", serverId: "server-366"
}).eventAt.precision, "unknown");
assert.strictEqual(validateRuleVersionRef(ruleVersionRef).rulesVersion, "rules-v1");
assert.strictEqual(TemporalMetadataError.prototype instanceof Error, true);
console.log("13 temporal metadata contract scenarios passed");
