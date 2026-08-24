import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  PLATFORM_FIELD_SHAPES,
  assembleSnapshot,
  buildConfigSummary,
  buildSnapshot,
  computeMetrics,
  configFromSettingsRow,
  draftExecution,
  draftToReviewItem,
  evaluateDraft,
  normalizeDraftRow,
  normalizeProductRow,
  ruleCatalog,
  scoreChecks,
  slugify,
  statusForVerdict,
} from "../app/js/listing-model.js";

test("statusForVerdict maps every decision action, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "revise" only edits fields/note: status stays whatever it was.
  assert.equal(statusForVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("revise", "approved"), "approved");
  assert.deepEqual([...DECISION_ACTIONS], ["approve", "request_changes", "block", "revise"]);
});

function amazonDraft(fields = {}) {
  return {
    draft_id: "d-test",
    platform: "amazon",
    fields: {
      title: "Nimbus Home Collapsible Lunch Box, Leakproof 3-Compartment Bento Box",
      bullets: ["a", "b", "c", "d", "e"],
      description: "Packs flat in seconds.",
      search_terms: "collapsible lunch box bento",
      ...fields,
    },
  };
}

test("evaluateDraft: required_fields fails when a required amazon field is missing", () => {
  const draft = amazonDraft({ description: "" });
  const results = evaluateDraft(draft, null, {}, "en", null);
  const check = results.find((item) => item.rule_id === "required_fields");
  assert.equal(check.result, "fail");
  assert.match(check.evidence, /description/);
});

test("evaluateDraft: title_length fails only when the title exceeds the platform cap (200 for amazon)", () => {
  const shortTitle = amazonDraft({ title: "Short title" });
  assert.equal(evaluateDraft(shortTitle, null, {}, "en").find((r) => r.rule_id === "title_length").result, "pass");
  const overLong = amazonDraft({ title: "x".repeat(210) });
  const overResult = evaluateDraft(overLong, null, {}, "en").find((r) => r.rule_id === "title_length");
  assert.equal(overResult.result, "fail");
  assert.match(overResult.evidence, /210/);
});

test("evaluateDraft: banned_words fails on a banned word, matches ASCII words with boundaries", () => {
  const config = { banned_words: ["FDA approved"] };
  const clean = amazonDraft({ description: "Food-contact safe stainless steel." });
  assert.equal(evaluateDraft(clean, null, config, "en").find((r) => r.rule_id === "banned_words").result, "pass");
  const dirty = amazonDraft({ description: "This product is FDA approved for kitchen use." });
  const dirtyResult = evaluateDraft(dirty, null, config, "en").find((r) => r.rule_id === "banned_words");
  assert.equal(dirtyResult.result, "fail");
  assert.match(dirtyResult.evidence, /FDA approved/);
});

test("evaluateDraft: bullet_count requires exactly 5 bullets on amazon", () => {
  const tooFew = amazonDraft({ bullets: ["only one"] });
  assert.equal(evaluateDraft(tooFew, null, {}, "en").find((r) => r.rule_id === "bullet_count").result, "fail");
  const exact = amazonDraft({ bullets: ["1", "2", "3", "4", "5"] });
  assert.equal(evaluateDraft(exact, null, {}, "en").find((r) => r.rule_id === "bullet_count").result, "pass");
});

test("evaluateDraft: search_terms_bytes fails when backend search terms exceed the byte cap", () => {
  const rules = { platforms: [{ platform: "amazon", rules: { search_terms_max_bytes: 10 } }] };
  const over = amazonDraft({ search_terms: "this is definitely over ten bytes" });
  const result = evaluateDraft(over, null, rules, "en").find((r) => r.rule_id === "search_terms_bytes");
  assert.equal(result.result, "fail");
});

test("evaluateDraft: selling_points_count applies only to tiktok_shop, requires the configured minimum", () => {
  const tiktokDraft = {
    draft_id: "d-tiktok",
    platform: "tiktok_shop",
    fields: { title: "Folds flat after lunch", selling_points: ["only one"] },
  };
  const result = evaluateDraft(tiktokDraft, null, {}, "en").find((r) => r.rule_id === "selling_points_count");
  assert.equal(result.result, "fail");
  const enough = { ...tiktokDraft, fields: { ...tiktokDraft.fields, selling_points: ["a", "b", "c"] } };
  assert.equal(evaluateDraft(enough, null, {}, "en").find((r) => r.rule_id === "selling_points_count").result, "pass");
});

test("evaluateDraft: keyword_stuffing warns when a product keyword repeats past the threshold", () => {
  const product = { keywords: ["lunch box"] };
  const draft = amazonDraft({
    title: "lunch box lunch box lunch box lunch box lunch box",
    bullets: ["a", "b", "c", "d", "e"],
  });
  const result = evaluateDraft(draft, product, { keyword_stuffing: { max_repeats: 3 } }, "en").find(
    (r) => r.rule_id === "keyword_stuffing",
  );
  assert.equal(result.result, "warn");
});

test("evaluateDraft: image_checklist warns on a pending image, passes when all are ready", () => {
  const draft = amazonDraft();
  const pending = { images: [{ name: "Main image", status: "needs_edit" }] };
  assert.equal(evaluateDraft(draft, pending, {}, "en").find((r) => r.rule_id === "image_checklist").result, "warn");
  const ready = { images: [{ name: "Main image", status: "ready" }] };
  assert.equal(evaluateDraft(draft, ready, {}, "en").find((r) => r.rule_id === "image_checklist").result, "pass");
});

test("evaluateDraft: claims_registry fails on a banned-word rule phrase or an unapproved claim in the corpus", () => {
  const claims = {
    claims: [{ claim_id: "c-1", text: "antibacterial", status: "rejected" }],
    rules: [{ rule_id: "r-1", phrase: "medical grade", type: "restricted_phrase" }],
  };
  const clean = amazonDraft();
  assert.equal(
    evaluateDraft(clean, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry").result,
    "pass",
  );
  const hitsRule = amazonDraft({ description: "Made from medical grade silicone." });
  const ruleResult = evaluateDraft(hitsRule, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry");
  assert.equal(ruleResult.result, "fail");
  assert.deepEqual(ruleResult.refs.rules, ["r-1"]);
  const hitsClaim = amazonDraft({ description: "This lunch box is antibacterial." });
  const claimResult = evaluateDraft(hitsClaim, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry");
  assert.equal(claimResult.result, "fail");
  assert.deepEqual(claimResult.refs.claims, ["c-1"]);
});

test("scoreChecks scores pass=1/warn=0.5/fail=0 over resolvable checks", () => {
  assert.equal(scoreChecks([{ result: "pass" }, { result: "pass" }]), 100);
  assert.equal(scoreChecks([{ result: "pass" }, { result: "fail" }]), 50);
  assert.equal(scoreChecks([{ result: "pass" }, { result: "warn" }]), 75);
});

test("computeMetrics counts drafts by status/platform and the compliance pass rate over resolved checks", () => {
  const snapshot = {
    products: [{}, {}],
    drafts: [
      { platform: "amazon", status: "approved" },
      { platform: "shopify", status: "done" },
      { platform: "shopify", status: "changes_requested" },
      { platform: "tiktok_shop", status: "needs_review" },
    ],
    checks: [{ result: "pass" }, { result: "pass" }, { result: "fail" }],
  };
  const metrics = computeMetrics(snapshot);
  assert.equal(metrics.product_count, 2);
  assert.equal(metrics.draft_count, 4);
  assert.deepEqual(metrics.drafts_by_platform, { amazon: 1, shopify: 2, tiktok_shop: 1 });
  assert.equal(metrics.drafts_approved, 2);
  assert.equal(metrics.drafts_in_revision, 1);
  assert.equal(metrics.drafts_needs_review, 1);
  assert.equal(metrics.checks_failed, 1);
  assert.equal(metrics.compliance_pass_rate, 67);
});

test("draftToReviewItem folds a draft's own review fields into the review-item shape", () => {
  const draft = {
    draft_id: "d-1",
    ref: 3,
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Trim backend terms"],
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.deepEqual(draftToReviewItem(draft), {
    review_id: "d-1",
    ref: 3,
    draft_id: "d-1",
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Trim backend terms"],
    created_at: "2026-01-01T00:00:00.000Z",
  });
});

test("normalizeProductRow / normalizeDraftRow parse JSON-encoded arrays off a raw Busabase row", () => {
  const product = normalizeProductRow({
    product_id: "prod-1",
    ref: 2,
    name: "Collapsible Lunch Box",
    keywords: JSON.stringify(["lunch box", "bento"]),
    images: JSON.stringify([{ name: "Main image", status: "ready" }]),
  });
  assert.equal(product.ref, 2);
  assert.deepEqual(product.keywords, ["lunch box", "bento"]);
  assert.deepEqual(product.images, [{ name: "Main image", status: "ready" }]);

  const draft = normalizeDraftRow({
    draft_id: "d-1",
    ref: 1,
    platform: "amazon",
    bullets: JSON.stringify(["Packs flat"]),
    compliance_score: 82,
  });
  assert.deepEqual(draft.fields.bullets, ["Packs flat"]);
  assert.equal(draft.compliance_score, 82);
});

test("buildConfigSummary parses JSON-encoded platforms/banned_words off a raw Settings row and sanitizes counts", () => {
  const summary = buildConfigSummary({
    settings: {
      seller_brand: "Nimbus Home",
      banned_words: JSON.stringify(["FDA approved", "cure"]),
      platforms: JSON.stringify([
        { platform: "amazon", enabled: true, locales: ["US"], rules: { title_max_chars: 200 } },
      ]),
      keyword_stuffing_max_repeats: "4",
    },
  });
  assert.equal(summary.seller.brand, "Nimbus Home");
  assert.equal(summary.banned_words_count, 2);
  assert.equal(summary.platforms[0].platform, "amazon");
  assert.equal(summary.keyword_stuffing.max_repeats, 4);
});

test("configFromSettingsRow returns the full unsanitized rule-evaluation config", () => {
  const config = configFromSettingsRow({
    banned_words: JSON.stringify(["FDA approved"]),
    platforms: JSON.stringify([{ platform: "amazon", rules: {} }]),
  });
  assert.deepEqual(config.banned_words, ["FDA approved"]);
  assert.equal(config.platforms[0].platform, "amazon");
});

test("assembleSnapshot sorts products/drafts by ref and folds every draft into review_items", () => {
  const snapshot = assembleSnapshot({
    products: [],
    drafts: [
      { draft_id: "b", ref: 2, status: "needs_review" },
      { draft_id: "a", ref: 1, status: "approved" },
    ],
    checks: [],
    configSummary: { seller: { brand: "X" } },
  });
  assert.deepEqual(
    snapshot.drafts.map((draft) => draft.draft_id),
    ["a", "b"],
  );
  assert.equal(snapshot.review_items.length, 2);
  assert.equal(snapshot.seller.brand, "X");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    products: [{ product_id: "prod-1", name: "Collapsible Lunch Box" }],
    drafts: [{ draft_id: "d-1", ref: "1", platform: "amazon", status: "needs_review", bullets: JSON.stringify(["x"]) }],
    checks: [{ check_id: "chk-1", draft_id: "d-1", rule_id: "bullet_count", result: "fail" }],
    settings: { seller_brand: "Nimbus" },
  });
  assert.equal(snapshot.products[0].name, "Collapsible Lunch Box");
  assert.deepEqual(snapshot.drafts[0].fields.bullets, ["x"]);
  assert.equal(snapshot.seller.brand, "Nimbus");
});

test("ruleCatalog returns every rule id with severity and applicable platforms", () => {
  const catalog = ruleCatalog({}, "en");
  assert.equal(catalog.length, 12);
  const claimsRule = catalog.find((rule) => rule.rule_id === "claims_registry");
  assert.equal(claimsRule.severity, "error");
  assert.ok(claimsRule.platforms.includes("amazon"));
});

test("PLATFORM_FIELD_SHAPES declares the field shape for every marketplace, no legal/other domain platforms leaked in", () => {
  assert.deepEqual(Object.keys(PLATFORM_FIELD_SHAPES).sort(), ["amazon", "ebay", "shopify", "tiktok_shop"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.amazon.default_required, ["title", "bullets", "description", "search_terms"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.shopify.default_required, [
    "title",
    "description",
    "seo_title",
    "seo_description",
  ]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.tiktok_shop.default_required, ["title", "selling_points"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.ebay.default_required, ["title", "description"]);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Nimbus Home Lunch Box"), "nimbus-home-lunch-box");
  assert.equal(slugify("可折叠硅胶饭盒"), "可折叠硅胶饭盒");
});

// draftExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see listing-model.js's doc comment.
test("draftExecution maps approve -> export_listing and request_changes -> request_revision", () => {
  const draft = { draft_id: "d-1", platform: "amazon", locale: "US" };
  const dryRun = draftExecution(draft, { action: "approve" }, "Nimbus Lunch Box", { apply: false });
  assert.equal(dryRun.operation, "export_listing");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/nimbus-lunch-box-amazon-us\.md$/);

  const applied = draftExecution(draft, { action: "approve" }, "Nimbus Lunch Box", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_listings\.mjs/);

  const revision = draftExecution(draft, { action: "request_changes" }, "Nimbus Lunch Box", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "d-1");

  assert.equal(draftExecution(draft, { action: "block" }, "Nimbus Lunch Box", { apply: false }), null);
});
