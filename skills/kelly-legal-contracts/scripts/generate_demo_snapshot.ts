#!/usr/bin/env node
// Writes a small legal-contract sample snapshot (and a seeded clause playbook)
// into app/.data/ through the data-provider layer, for local development and
// validator testing. Documentation screenshots use richer in-memory demo
// scenes instead: /?demo=<scene> never touches app/.data/.
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "../app/server/rules.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import type { ClaimsRegistry } from "../lib/types.ts";

const provider = await createProvider();
const { config } = await provider.readConfig();
const now = new Date().toISOString();

const claims: ClaimsRegistry = {
  updated_at: now,
  claims: [
    {
      claim_id: "clause-liability-cap",
      text: "Liability cap at fees paid in the preceding 12 months",
      status: "approved",
      category: "Liability",
      substantiation: "Approved fallback for SaaS MSAs below USD 250k ARR.",
      evidence: ["playbooks/msa-risk-matrix.xlsx"],
      approved_by: "GC",
      approved_at: now,
      notes: "",
      created_at: now,
      updated_at: now,
    },
    {
      claim_id: "clause-open-ended-indemnity",
      text: "uncapped indemnity for any and all claims",
      status: "rejected",
      category: "Indemnity",
      substantiation: "",
      evidence: [],
      approved_by: "",
      approved_at: "",
      notes: "Rejected by legal policy: too broad and not tied to breach/IP infringement.",
      created_at: now,
      updated_at: now,
    },
  ],
  rules: [
    {
      rule_id: "claimrule-uncapped-liability",
      phrase: "uncapped liability",
      type: "banned_word",
      severity: "error",
      reason: "Requires GC escalation and cannot be approved in the desk.",
      alternative: "cap liability at fees paid in the preceding 12 months",
      created_at: now,
    },
    {
      rule_id: "claimrule-perpetual-data-retention",
      phrase: "perpetual data retention",
      type: "restricted_phrase",
      severity: "error",
      reason: "Conflicts with deletion and privacy commitments.",
      alternative: "retain only as required by law or for documented security logs",
      created_at: now,
    },
  ],
};
await provider.writeClaims(claims);

const products = [
  {
    product_id: "ct-acme-nda",
    ref: 1,
    name: "Acme Mutual NDA",
    sku: "Acme Robotics",
    category: "Vendor evaluation",
    source: "manual",
    platforms: ["nda"],
    locales: ["US"],
    specs: [
      { name: "Counterparty", value: "Acme Robotics, Inc." },
      { name: "Governing law", value: "California" },
    ],
    features: ["Mutual confidentiality", "Residuals clause added by counterparty"],
    keywords: ["residuals", "purpose limitation", "return or destroy"],
    images: [
      { name: "NDA PDF received", status: "ready" },
      { name: "Counterparty redline", status: "ready" },
    ],
    notes: "Inbound NDA for supplier evaluation.",
    created_at: now,
    updated_at: now,
  },
  {
    product_id: "ct-zenith-msa",
    ref: 2,
    name: "Zenith SaaS MSA",
    sku: "Zenith Analytics",
    category: "Customer sale",
    source: "manual",
    platforms: ["msa"],
    locales: ["US"],
    specs: [
      { name: "Contract value", value: "USD 180k ARR" },
      { name: "Governing law", value: "Delaware" },
    ],
    features: ["Customer asks for uncapped indemnity", "SLA credits added"],
    keywords: ["liability cap", "indemnity", "SLA credits"],
    images: [
      { name: "MSA draft", status: "ready" },
      { name: "Order form", status: "ready" },
    ],
    notes: "Quarter-close signature target.",
    created_at: now,
    updated_at: now,
  },
];

const drafts = [
  {
    draft_id: "d-nda-residuals-us",
    ref: 1,
    product_id: "ct-acme-nda",
    platform: "nda",
    locale: "US",
    variant_group: "nda-residuals",
    status: "needs_review",
    compliance_score: 0,
    keyword_strategy: "Residuals language is broader than company playbook; delete or narrow to unaided memory.",
    fields: {
      title: "Residuals clause allows retained ideas after NDA ends",
      bullets: [
        "Risk: use of retained ideas weakens purpose-limited confidentiality.",
        "Business impact: roadmap discussions may be exposed.",
        "Fallback: delete residuals clause in full.",
        "Compromise: unaided memory only.",
        "Escalation: required if counterparty insists.",
      ],
      description:
        "Delete the residuals clause or narrow it to unaided memory with trade-secret and customer-data exclusions.",
      search_terms: "Ask counterparty to remove residuals.",
      aplus_outline: ["Memo", "Redline", "Fallback"],
    },
    created_at: now,
    updated_at: now,
  },
  {
    draft_id: "d-msa-liability-us",
    ref: 2,
    product_id: "ct-zenith-msa",
    platform: "msa",
    locale: "US",
    variant_group: "msa-liability",
    status: "needs_review",
    compliance_score: 0,
    keyword_strategy: "Sample failing issue: trips the hard-stop playbook for uncapped liability.",
    fields: {
      title: "Customer paper requests uncapped liability and uncapped indemnity",
      description:
        "Replace uncapped liability with a mutual aggregate cap equal to fees paid or payable in the preceding 12 months.",
      seo_title: "Liability cap fallback for Zenith MSA",
      seo_description: "Recommend rejecting uncapped liability; offer 12-month fees cap.",
    },
    created_at: now,
    updated_at: now,
  },
];

const productsById = new Map(products.map((product) => [product.product_id, product]));
const checks = [];
for (const draft of drafts) {
  for (const result of evaluateDraft(draft, productsById.get(draft.product_id), config, "en", claims)) {
    checks.push({
      check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
      draft_id: draft.draft_id,
      rule_id: result.rule_id,
      severity: result.severity,
      result: result.result,
      evidence: result.evidence,
      ...(result.refs ? { refs: result.refs } : {}),
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
    ? "Some checks fail — see the risk panel."
    : "All checks pass.",
  suggestions: [],
  created_at: now,
}));

const snapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-legal-contracts-sample",
  seller: {
    brand: config.seller?.brand || "Example Legal Ops",
    entity: config.seller?.entity || "Example Company, Inc.",
  },
  metrics: {},
  products,
  drafts,
  rules: ruleCatalog(config, "en"),
  checks,
  review_items,
  activity_log: [
    { id: "act-sample-1", at: now, actor: "agent", detail: "Generated sample contract snapshot.", draft_id: "" },
  ],
  warnings: [],
};
snapshot.metrics = computeMetrics(snapshot);

await provider.writeSnapshot(snapshot);
console.log("Wrote sample contract review snapshot and seeded clause playbook via the data provider.");
