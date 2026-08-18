import assert from "node:assert/strict";
import test from "node:test";
import {
  compactArray,
  fieldsOf,
  governance,
  isPresent,
  metadataFields,
  needsGovernance,
  normalizeFeedback,
  normalizeFile,
  normalizeNews,
  normalizeQa,
  qualityScore,
  text,
} from "../app/js/insure-model.js";

test("isPresent treats empty strings, empty arrays, null, and undefined as missing", () => {
  assert.equal(isPresent(""), false);
  assert.equal(isPresent("  "), false);
  assert.equal(isPresent([]), false);
  assert.equal(isPresent(null), false);
  assert.equal(isPresent(undefined), false);
  assert.equal(isPresent("x"), true);
  assert.equal(isPresent(["x"]), true);
  assert.equal(isPresent(0), true);
});

test("governance computes completeness_pct, missing_fields, and a needs_metadata default status", () => {
  const result = governance({ question: "Q", answer: "" }, ["question", "answer", "carrier"]);
  assert.equal(result.completeness_pct, 33);
  assert.deepEqual(result.missing_fields, ["answer", "carrier"]);
  assert.equal(result.status, "needs_metadata");
});

test("governance is 100% complete and active when every required field is present and status is unset", () => {
  const result = governance({ question: "Q", answer: "A", carrier: "Example Life" }, ["question", "answer", "carrier"]);
  assert.equal(result.completeness_pct, 100);
  assert.deepEqual(result.missing_fields, []);
  assert.equal(result.status, "active");
});

test("governance with no required fields is always 100% complete", () => {
  assert.equal(governance({}, []).completeness_pct, 100);
});

test("text resolves locale-map objects to zh-CN, then zh, then en", () => {
  assert.equal(text("plain"), "plain");
  assert.equal(text(42), "42");
  assert.equal(text({ "zh-CN": "你好", en: "hi" }), "你好");
  assert.equal(text({ zh: "你好", en: "hi" }), "你好");
  assert.equal(text({ en: "hi" }), "hi");
  assert.equal(text(null), "");
});

test("compactArray splits comma/full-width-comma-separated strings and trims", () => {
  assert.deepEqual(compactArray(["a", "b"]), ["a", "b"]);
  assert.deepEqual(compactArray("a, b，c"), ["a", "b", "c"]);
  assert.deepEqual(compactArray(""), []);
  assert.deepEqual(compactArray(undefined), []);
});

test("fieldsOf reads headCommit.payload first, then headCommit.fields, then fields, then commit.fields", () => {
  assert.deepEqual(fieldsOf({ headCommit: { payload: { p: 0 }, fields: { a: 1 } } }), { p: 0 });
  assert.deepEqual(fieldsOf({ headCommit: { fields: { a: 1 } } }), { a: 1 });
  assert.deepEqual(fieldsOf({ fields: { b: 2 } }), { b: 2 });
  assert.deepEqual(fieldsOf({ commit: { fields: { c: 3 } } }), { c: 3 });
  assert.deepEqual(fieldsOf({}), {});
});

test("metadataFields turns a metadata object into key/value pairs", () => {
  assert.deepEqual(metadataFields({ owner: "Kelly", region: "HK" }), [
    { key: "owner", value: "Kelly" },
    { key: "region", value: "HK" },
  ]);
});

test("normalizeFile scores governance against the declared file_metadata_fields", () => {
  const file = {
    id: "file-1",
    displayName: "Plan.pdf",
    path: "/plans/plan.pdf",
    size: 1024,
    mimeType: "application/pdf",
    metadata: { policy_type: "medical", carrier: "Example Life", status: "active" },
  };
  const normalized = normalizeFile(file, ["policy_type", "carrier", "region", "effective_date", "status"]);
  assert.equal(normalized.id, "file-1");
  assert.equal(normalized.name, "Plan.pdf");
  assert.equal(normalized.governance.completeness_pct, 60);
  assert.deepEqual(normalized.governance.missing_fields, ["region", "effective_date"]);
});

test("normalizeQa maps the default field slugs and falls back to '(no question)'", () => {
  const mapping = { question: "question", answer: "answer", source: "carrier", status: "status" };
  const withQuestion = normalizeQa(
    { id: "rec-1", fields: { question: "Q?", answer: "A.", carrier: "Example Life" } },
    mapping,
  );
  assert.equal(withQuestion.question, "Q?");
  assert.equal(withQuestion.source, "Example Life");
  assert.equal(withQuestion.governance.completeness_pct, 100);

  const withoutQuestion = normalizeQa({ id: "rec-2", fields: {} }, mapping);
  assert.equal(withoutQuestion.question, "(no question)");
  assert.equal(withoutQuestion.governance.completeness_pct, 0);
});

test("normalizeNews tags the record with its collection and only requires title", () => {
  const mapping = { title: "title", summary: "content", url: "source_url", source: "carrier", status: "status" };
  const featured = normalizeNews({ id: "rec-1", fields: { title: "Headline" } }, mapping, "featured");
  assert.equal(featured.collection, "featured");
  assert.equal(featured.title, "Headline");
  assert.equal(featured.governance.completeness_pct, 100);

  const untitled = normalizeNews({ id: "rec-2", fields: {} }, mapping, "notice");
  assert.equal(untitled.collection, "notice");
  assert.equal(untitled.title, "(untitled)");
  assert.equal(untitled.governance.completeness_pct, 0);
});

test("normalizeFeedback requires title, content, source, created_at, and status", () => {
  const mapping = {
    title: "title",
    content: "content",
    source: "source",
    created_at: "created_at",
    status: "status",
  };
  const complete = normalizeFeedback(
    {
      id: "rec-1",
      fields: { title: "T", content: "C", source: "S", created_at: "2026-01-01T00:00:00.000Z", status: "new" },
    },
    mapping,
  );
  assert.equal(complete.governance.completeness_pct, 100);

  const partial = normalizeFeedback({ id: "rec-2", fields: { title: "T" } }, mapping);
  assert.equal(partial.governance.completeness_pct, 20);
  assert.deepEqual(partial.governance.missing_fields, ["content", "source", "created_at", "status"]);
});

test("qualityScore averages completeness across every governed item, and is 100 for an empty set", () => {
  assert.equal(qualityScore([]), 100);
  assert.equal(qualityScore([{ governance: { completeness_pct: 100 } }, { governance: { completeness_pct: 50 } }]), 75);
});

test("needsGovernance counts items with missing fields or a draft/review/needs_metadata/needs_review status", () => {
  const items = [
    { governance: { completeness_pct: 100, missing_fields: [], status: "active" } },
    { governance: { completeness_pct: 60, missing_fields: ["region"], status: "needs_metadata" } },
    { governance: { completeness_pct: 100, missing_fields: [], status: "needs_review" } },
  ];
  assert.equal(needsGovernance(items), 2);
});
