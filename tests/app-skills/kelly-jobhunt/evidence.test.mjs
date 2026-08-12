// A match score says how well a company fits. It cannot say whether the role is
// still open — the live run surfaced expired aggregator listings sorted above
// roles posted on a company's own careers page that same week.
import assert from "node:assert/strict";
import test from "node:test";

import {
  createJobhuntDesk,
  evidenceAgeDays,
  evidenceLabel,
  normalizeCompany,
} from "../../../skills/kelly-jobhunt/app/app/js/jobhunt-model.js";

const company = (id, fields) => ({ id, baseKey: "companies", fields: { key: id, name: id, ...fields } });

test("evidence is read back as declared, and anything else is blank", () => {
  assert.equal(normalizeCompany(company("a", { evidence_type: "official-site" })).evidenceType, "official-site");
  assert.equal(normalizeCompany(company("b", { evidence_type: "AGGREGATOR" })).evidenceType, "aggregator");
  // An unknown value is not silently promoted to a real one.
  assert.equal(normalizeCompany(company("c", { evidence_type: "linkedin" })).evidenceType, "");
  assert.equal(normalizeCompany(company("d", {})).evidenceType, "");
  assert.equal(evidenceLabel(""), "未标注");
  assert.equal(evidenceLabel("official-site"), "官网岗位");
});

test("age is counted in whole days, and an undated find has no age at all", () => {
  const today = new Date("2026-08-12T09:30:00Z");
  assert.equal(evidenceAgeDays("2026-08-12", today), 0);
  assert.equal(evidenceAgeDays("2026-08-11", today), 1);
  assert.equal(evidenceAgeDays("2026-07-06", today), 37);
  // Null, not zero: "no date" and "captured today" must not render alike.
  assert.equal(evidenceAgeDays("", today), null);
  assert.equal(evidenceAgeDays("not-a-date", today), null);
  // A date from the future is clamped rather than shown as negative days.
  assert.equal(evidenceAgeDays("2026-09-01", today), 0);
});

test("evidence outranks score, and score still breaks ties within a tier", () => {
  const desk = createJobhuntDesk([
    company("aggregator-high", { match_score: 95, evidence_type: "aggregator", status: "draft" }),
    company("official-low", { match_score: 70, evidence_type: "official-site", status: "draft" }),
    company("official-high", { match_score: 88, evidence_type: "official-site", status: "draft" }),
    company("unlabelled-high", { match_score: 99, status: "draft" }),
    company("hypothesis", { match_score: 80, evidence_type: "business-match", status: "draft" }),
  ]);

  assert.deepEqual(
    desk.companies.map((row) => row.key),
    // A 99-scoring company nobody labelled sorts last: it is the one the
    // operator most needs to look at before trusting the number.
    ["official-high", "official-low", "aggregator-high", "hypothesis", "unlabelled-high"],
  );
  // The stable #n the conversation refers to follows the same order.
  assert.equal(desk.companies[0].ref, "#1");
});
