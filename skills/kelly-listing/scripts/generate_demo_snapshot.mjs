#!/usr/bin/env node
// Writes a small generic sample snapshot into app/.data/listing_snapshot.json
// for local development and validator testing. Checks and scores are computed
// by the shared engine so the sample is always schema- and rule-consistent.
// (Documentation screenshots use the richer in-memory demo scenes instead:
// /?demo=<scene> never touches app/.data/.)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "../app/server/rules.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "listing_snapshot.json");
const now = new Date().toISOString();

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const config =
  (await readJson(path.join(skillDir, "config.local.json"))) ||
  (await readJson(path.join(skillDir, "config.example.json"))) ||
  {};

const products = [
  {
    product_id: "prod-example-bottle",
    ref: 1,
    name: "Example Insulated Bottle",
    sku: "EX-BT-01",
    category: "Kitchen & Dining",
    source: "manual",
    platforms: ["amazon", "shopify"],
    locales: ["US"],
    specs: [
      { name: "Material", value: "18/8 stainless steel" },
      { name: "Capacity", value: "750 ml" },
    ],
    features: ["Keeps drinks cold 24h", "Leakproof sport cap"],
    keywords: ["insulated water bottle", "stainless steel bottle"],
    images: [
      { name: "Main image on white", status: "ready" },
      { name: "Lifestyle: gym", status: "ready" },
    ],
    notes: "",
    created_at: now,
    updated_at: now,
  },
  {
    product_id: "prod-example-mat",
    ref: 2,
    name: "Example Drying Mat",
    sku: "EX-DM-02",
    category: "Kitchen Storage",
    source: "kelly_picks",
    platforms: ["amazon"],
    locales: ["US"],
    specs: [{ name: "Size", value: "45 × 30 cm" }],
    features: ["Absorbs fast", "Machine washable"],
    keywords: ["dish drying mat"],
    images: [{ name: "Main image on white", status: "missing" }],
    notes: "Sample kelly-picks handoff.",
    created_at: now,
    updated_at: now,
  },
];

const drafts = [
  {
    draft_id: "d-example-bottle-amazon-us",
    ref: 1,
    product_id: "prod-example-bottle",
    platform: "amazon",
    locale: "US",
    variant_group: "example-bottle-amazon",
    status: "needs_review",
    compliance_score: 0,
    keyword_strategy: "Lead with 'insulated water bottle'; capacity and cap type as differentiators.",
    fields: {
      title:
        "Example Brand Insulated Water Bottle, 750ml Stainless Steel Sports Bottle with Leakproof Cap, Keeps Drinks Cold 24 Hours, BPA-Free for Gym Travel Office",
      bullets: [
        "Cold for a full day: double-wall vacuum insulation keeps water iced for 24 hours.",
        "Leakproof sport cap: one-hand open, silicone seal, carry loop.",
        "18/8 stainless steel inside and out — no metal aftertaste.",
        "Fits car cup holders and most bike cages at 7.3 cm diameter.",
        "Dishwasher-safe cap; hand-wash body to protect the finish.",
      ],
      description:
        "The Example Brand insulated bottle keeps 750 ml of water cold through a workday and then some. Double-wall vacuum insulation, a leakproof one-hand sport cap, and food-grade 18/8 stainless steel.",
      search_terms:
        "insulated water bottle stainless steel vacuum flask sports gym travel leak proof cold 24 hours bpa free",
      aplus_outline: ["Hero: 24h ice test", "Module: cap mechanism"],
    },
    created_at: now,
    updated_at: now,
  },
  {
    draft_id: "d-example-mat-amazon-us",
    ref: 2,
    product_id: "prod-example-mat",
    platform: "amazon",
    locale: "US",
    variant_group: "example-mat-amazon",
    status: "needs_review",
    compliance_score: 0,
    keyword_strategy: "Sample failing draft: banned word, 4 bullets, image checklist incomplete.",
    fields: {
      title: "Example Brand Dish Drying Mat, Absorbent Microfiber Kitchen Counter Mat, Machine Washable, 45x30cm, Grey",
      bullets: [
        "Absorbs a full rack of drips in one go, guaranteed to keep counters dry.",
        "Microfiber dries fast and resists odors between washes.",
        "Machine washable — toss it in with the towels.",
        "Rolls up to store in any drawer.",
      ],
      description: "A sample failing draft used to demonstrate the compliance checks.",
      search_terms: "dish drying mat kitchen counter microfiber absorbent machine washable",
      aplus_outline: [],
    },
    created_at: now,
    updated_at: now,
  },
  {
    draft_id: "d-example-bottle-shopify-us",
    ref: 3,
    product_id: "prod-example-bottle",
    platform: "shopify",
    locale: "US",
    variant_group: "example-bottle-shopify",
    status: "approved",
    compliance_score: 0,
    keyword_strategy: "Branded + category queries for the storefront.",
    fields: {
      title: "Insulated Water Bottle — 750ml Stainless Steel",
      description: "Keeps drinks cold for 24 hours. Leakproof one-hand sport cap, 18/8 stainless steel, BPA-free.",
      seo_title: "Insulated Water Bottle 750ml | Example Brand",
      seo_description:
        "Double-wall insulated stainless steel bottle. Cold for 24 hours, leakproof sport cap. Free shipping over $35.",
    },
    created_at: now,
    updated_at: now,
  },
];

const productsById = new Map(products.map((product) => [product.product_id, product]));
const checks = [];
for (const draft of drafts) {
  for (const result of evaluateDraft(draft, productsById.get(draft.product_id), config, "en")) {
    checks.push({
      check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
      draft_id: draft.draft_id,
      rule_id: result.rule_id,
      severity: result.severity,
      result: result.result,
      evidence: result.evidence,
      checked_at: now,
    });
  }
  draft.compliance_score = scoreChecks(checks.filter((check) => check.draft_id === draft.draft_id));
}

const review_items = drafts.map((draft) => ({
  review_id: `rv-${draft.draft_id.replace(/^d-/, "")}`,
  ref: draft.ref,
  draft_id: draft.draft_id,
  status: draft.status,
  compliance_summary: checks.some((check) => check.draft_id === draft.draft_id && check.result === "fail")
    ? "Some checks fail — see the compliance panel."
    : "All checks pass.",
  suggestions: [],
  created_at: now,
}));

const snapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-listing-sample",
  seller: {
    brand: config.seller?.brand || "Example Brand",
    entity: config.seller?.entity || "Example Trading Co.",
  },
  metrics: {},
  products,
  drafts,
  rules: ruleCatalog(config, "en"),
  checks,
  review_items,
  activity_log: [{ id: "act-sample-1", at: now, actor: "agent", detail: "Generated sample snapshot.", draft_id: "" }],
  warnings: [],
};
snapshot.metrics = computeMetrics(snapshot);

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${out}`);
