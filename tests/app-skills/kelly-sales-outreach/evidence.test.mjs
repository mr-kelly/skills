import assert from "node:assert/strict";
import test from "node:test";

import {
  createSalesOutreachDesk,
  evidenceAgeDays,
  evidenceLabel,
  normalizeCompany,
} from "../../../skills/kelly-sales-outreach/content/kelly-sales-outreach-app/app/js/sales-outreach-model.js";

const company = (id, fields) => ({ id, baseKey: "companies", fields: { key: id, name: id, ...fields } });

test("sales evidence is normalized without promoting unknown sources", () => {
  assert.equal(normalizeCompany(company("a", { evidence_type: "first-party" })).evidenceType, "first-party");
  assert.equal(normalizeCompany(company("b", { evidence_type: "PUBLIC-DIRECTORY" })).evidenceType, "public-directory");
  assert.equal(normalizeCompany(company("c", { evidence_type: "linkedin" })).evidenceType, "");
  assert.equal(evidenceLabel("first-party"), "一方来源");
  assert.equal(evidenceLabel("market-signal"), "市场信号");
  assert.equal(evidenceLabel(""), "未标注");
});

test("evidence age is explicit and future dates are clamped", () => {
  const today = new Date("2026-08-12T09:30:00Z");
  assert.equal(evidenceAgeDays("2026-08-12", today), 0);
  assert.equal(evidenceAgeDays("2026-08-11", today), 1);
  assert.equal(evidenceAgeDays("2026-07-06", today), 37);
  assert.equal(evidenceAgeDays("", today), null);
  assert.equal(evidenceAgeDays("not-a-date", today), null);
  assert.equal(evidenceAgeDays("2026-09-01", today), 0);
});

test("first-party evidence outranks directories and hypotheses before ICP score", () => {
  const desk = createSalesOutreachDesk([
    company("directory-high", { match_score: 95, evidence_type: "public-directory", status: "draft" }),
    company("first-low", { match_score: 70, evidence_type: "first-party", status: "draft" }),
    company("first-high", { match_score: 88, evidence_type: "first-party", status: "draft" }),
    company("unlabelled-high", { match_score: 99, status: "draft" }),
    company("signal", { match_score: 80, evidence_type: "market-signal", status: "draft" }),
  ]);
  assert.deepEqual(
    desk.companies.map((row) => row.key),
    ["first-high", "first-low", "directory-high", "signal", "unlabelled-high"],
  );
  assert.equal(desk.companies[0].ref, "#1");
});
