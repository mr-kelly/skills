// Pure domain logic for kelly-legal-contracts, ported verbatim (same rule
// ids, same evidence copy, same order of operations, only TS types
// stripped) from the retired app/server/rules.ts (PLATFORM_FIELD_SHAPES,
// RULE_DEFS, RULE_NAMES, EVIDENCE, evaluateDraft -> evaluateIssue,
// scoreChecks, computeMetrics) and lib/data-provider/local-file-provider.ts
// (summarizeConfig's shape, applyDecision's action -> status table). Only
// two identity fields were renamed for clarity in this Busabase-only
// rewrite: the retired generic `product_id` -> `contract_id` and
// `draft_id` -> `issue_id` (the retired schema kept the generic
// products[]/drafts[] keys for compatibility with a shared marketplace-copy
// codebase that no longer exists here). Every other field name inside
// `fields{}` (title/bullets/description/search_terms/seo_title/
// seo_description/selling_points/aplus_outline/item_specifics) and
// `platform`/`locale` is unchanged from rules.ts so the rule engine and the
// field editor port with minimal risk of transcription error; the UI labels
// for those fields already say "Risk notes", "Fallback language", "Workstream",
// "Jurisdiction" etc. (see i18n/messages.js), so nothing user-facing is generic.
//
// review_items are no longer a separate persisted bucket: a review item is
// just its issue's own review-related fields (compliance_summary/
// suggestions/decision_*), and the activity feed is derived from each
// issue's created_at/updated_at/decided_at instead of an append-only log
// file — Busabase reads are always live, so there is no staleness to paper
// over the way the old effectiveDraftStatus()/effectiveReviewStatus()
// overlay in app.js had to.
//
// statusForVerdict is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() action table.
// issueExecution is adapted (not a byte-for-byte port, since the retired
// scripts/execute_decisions.ts wrote a list of ExecutionResult entries to a
// separate execution_report.json and this shape has one execution marker
// directly on the issue record) from the same script's export_issue_list /
// handoff_redline / request_revision decisions.

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function slugify(value = "") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "issue"
  );
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeContractRow({
  contract_id = "",
  ref = 0,
  name = "",
  sku = "",
  category = "",
  source = "manual",
  platforms = "",
  locales = "",
  specs = "",
  features = "",
  keywords = "",
  images = "",
  notes = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    contract_id,
    ref: Number(ref) || 0,
    name: name || contract_id,
    sku,
    category,
    source: source || "manual",
    platforms: parseJsonValue(platforms, []) || [],
    locales: parseJsonValue(locales, []) || [],
    specs: parseJsonValue(specs, []) || [],
    features: parseJsonValue(features, []) || [],
    keywords: parseJsonValue(keywords, []) || [],
    images: parseJsonValue(images, []) || [],
    notes,
    created_at,
    updated_at,
  };
}

export function normalizeIssueRow({
  issue_id = "",
  ref = 0,
  contract_id = "",
  platform = "amazon",
  locale = "US",
  variant_group = "",
  status = "needs_review",
  compliance_score = 0,
  keyword_strategy = "",
  title = "",
  subtitle = "",
  bullets = "",
  description = "",
  search_terms = "",
  seo_title = "",
  seo_description = "",
  selling_points = "",
  aplus_outline = "",
  item_specifics = "",
  compliance_summary = "",
  suggestions = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    issue_id,
    ref: Number(ref) || 0,
    contract_id,
    platform,
    locale,
    variant_group,
    status,
    compliance_score: Number(compliance_score) || 0,
    keyword_strategy,
    fields: {
      title,
      subtitle,
      bullets: parseJsonValue(bullets, []) || [],
      description,
      search_terms,
      seo_title,
      seo_description,
      selling_points: parseJsonValue(selling_points, []) || [],
      aplus_outline: parseJsonValue(aplus_outline, []) || [],
      item_specifics: parseJsonValue(item_specifics, []) || [],
    },
    compliance_summary,
    suggestions: parseJsonValue(suggestions, []) || [],
    decision_action,
    decision_note,
    decided_at: decided_at || undefined,
    execution_status: execution_status || undefined,
    execution_operation: execution_operation || undefined,
    execution_target: execution_target || undefined,
    execution_detail: execution_detail || undefined,
    executed_at: executed_at || undefined,
    created_at,
    updated_at,
  };
}

export function normalizeCheckRow({
  check_id = "",
  issue_id = "",
  rule_id = "",
  severity = "warning",
  result = "pass",
  evidence = "",
  ref_rules = "",
  ref_claims = "",
  checked_at = "",
} = {}) {
  const rules = parseJsonValue(ref_rules, []) || [];
  const claims = parseJsonValue(ref_claims, []) || [];
  return {
    check_id,
    issue_id,
    rule_id,
    severity,
    result,
    evidence,
    ...(rules.length || claims.length ? { refs: { rules, claims } } : {}),
    checked_at,
  };
}

export function normalizeClaimRow({
  claim_id = "",
  text = "",
  status = "pending",
  category = "",
  substantiation = "",
  evidence = "",
  approved_by = "",
  approved_at = "",
  notes = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    claim_id,
    text,
    status,
    category,
    substantiation,
    evidence: parseJsonValue(evidence, []) || [],
    approved_by,
    approved_at,
    notes,
    created_at,
    updated_at,
  };
}

export function normalizeClaimRuleRow({
  rule_id = "",
  phrase = "",
  type = "banned_word",
  severity = "error",
  reason = "",
  alternative = "",
  created_at = "",
} = {}) {
  return {
    rule_id,
    phrase,
    type: type === "restricted_phrase" ? "restricted_phrase" : "banned_word",
    severity,
    reason,
    alternative,
    created_at,
  };
}

// Sanitized config summary for #/settings — reads straight off the live
// Settings row. Shape mirrors the retired local-file-provider.ts's
// summarizeConfig().
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  const bannedWords = parseJsonValue(settings.banned_words, []) || [];
  const competitorBrands = parseJsonValue(settings.competitor_brands, []) || [];
  const platforms = parseJsonValue(settings.platforms, []) || [];
  return {
    config_path: "busabase",
    is_example: false,
    seller: {
      brand: settings.seller_brand || "",
      entity: settings.seller_entity || "",
      tone: settings.seller_tone || "",
    },
    locales: parseJsonValue(settings.locales, []) || [],
    platforms: platforms.map((entry) => ({
      platform: entry.platform || "",
      enabled: entry.enabled !== false,
      locales: Array.isArray(entry.locales) ? entry.locales : [],
      rules: entry.rules || {},
    })),
    banned_words_count: bannedWords.length,
    competitor_brands_count: competitorBrands.length,
    keyword_stuffing: { max_repeats: Number(settings.keyword_stuffing_max_repeats) || 3 },
    export: {
      format: settings.export_format || "markdown+csv",
      out_dir: settings.export_out_dir || "exports",
    },
    publish: {
      handoff_to_agent: settings.publish_handoff_to_agent !== "false",
      requires_approval: settings.publish_requires_approval !== "false",
      secret_envs: [],
      secrets_ready: true,
    },
  };
}

// Full rule-evaluation config (unsanitized) built from the live Settings
// row — used by evaluateIssue() below, both from the browser demo provider
// (over its own inline demo config) and from scripts/run_checks.mjs (over a
// live Settings row).
/**
 * @param {Record<string, any>} [settings]
 */
export function configFromSettingsRow(settings = {}) {
  return {
    banned_words: parseJsonValue(settings.banned_words, []) || [],
    competitor_brands: parseJsonValue(settings.competitor_brands, []) || [],
    keyword_stuffing: { max_repeats: Number(settings.keyword_stuffing_max_repeats) || 3 },
    allowed_all_caps: parseJsonValue(settings.allowed_all_caps, []) || [],
    platforms: parseJsonValue(settings.platforms, []) || [],
  };
}

// ---- Deterministic contract-risk engine, ported verbatim from the retired
// app/server/rules.ts. Character caps count code points; byte caps use
// TextEncoder (the browser-safe equivalent of the retired Buffer.byteLength). ----

export const PLATFORMS = ["amazon", "shopify", "tiktok_shop", "ebay", "nda", "msa", "dpa", "sow"];

export const PLATFORM_FIELD_SHAPES = {
  nda: {
    strings: ["title", "description", "search_terms"],
    arrays: ["bullets", "aplus_outline"],
    default_required: ["title", "bullets", "description"],
  },
  msa: {
    strings: ["title", "description", "seo_title", "seo_description"],
    arrays: [],
    default_required: ["title", "description"],
  },
  dpa: {
    strings: ["title"],
    arrays: ["selling_points"],
    default_required: ["title", "selling_points"],
  },
  sow: {
    strings: ["title", "subtitle", "description"],
    arrays: ["item_specifics"],
    default_required: ["title", "description"],
  },
  amazon: {
    strings: ["title", "description", "search_terms"],
    arrays: ["bullets", "aplus_outline"],
    default_required: ["title", "bullets", "description", "search_terms"],
  },
  shopify: {
    strings: ["title", "description", "seo_title", "seo_description"],
    arrays: [],
    default_required: ["title", "description", "seo_title", "seo_description"],
  },
  tiktok_shop: {
    strings: ["title"],
    arrays: ["selling_points"],
    default_required: ["title", "selling_points"],
  },
  ebay: {
    strings: ["title", "subtitle", "description"],
    arrays: ["item_specifics"],
    default_required: ["title", "description"],
  },
};

const DEFAULT_TITLE_CAPS = {
  nda: 160,
  msa: 120,
  dpa: 140,
  sow: 120,
  amazon: 160,
  shopify: 120,
  tiktok_shop: 140,
  ebay: 120,
};
const DEFAULT_ALLOWED_ALL_CAPS = ["BPA", "LED", "USB", "PVC", "ABS", "USA", "FBA", "SKU", "SEO", "POV", "RGB", "LCD"];

const RULE_DEFS = [
  { rule_id: "required_fields", severity: "error", platforms: PLATFORMS },
  { rule_id: "title_length", severity: "error", platforms: PLATFORMS },
  { rule_id: "banned_words", severity: "error", platforms: PLATFORMS },
  { rule_id: "competitor_brands", severity: "error", platforms: PLATFORMS },
  { rule_id: "bullet_count", severity: "error", platforms: ["amazon", "nda"] },
  { rule_id: "search_terms_bytes", severity: "error", platforms: ["amazon", "nda"] },
  { rule_id: "selling_points_count", severity: "error", platforms: ["tiktok_shop", "dpa"] },
  { rule_id: "seo_meta_length", severity: "warning", platforms: ["shopify", "msa"] },
  { rule_id: "all_caps_words", severity: "warning", platforms: PLATFORMS },
  { rule_id: "keyword_stuffing", severity: "warning", platforms: PLATFORMS },
  { rule_id: "image_checklist", severity: "warning", platforms: PLATFORMS },
  { rule_id: "claims_registry", severity: "error", platforms: PLATFORMS },
];

const RULE_NAMES = {
  en: {
    required_fields: "Required fields present",
    title_length: "Issue title within desk limit",
    banned_words: "No hard-stop terms",
    competitor_brands: "No restricted positions",
    bullet_count: "Risk note count complete",
    search_terms_bytes: "Negotiation notes within export limit",
    selling_points_count: "Business ask captured",
    seo_meta_length: "Memo fields within limits",
    all_caps_words: "No noisy all-caps terms",
    keyword_stuffing: "No repeated watch term overuse",
    image_checklist: "Document checklist complete",
    claims_registry: "Clause playbook cleared",
  },
  zh: {
    required_fields: "必填字段完整",
    title_length: "风险标题不超过工作台上限",
    banned_words: "不含硬性禁止条款",
    competitor_brands: "不含受限立场",
    bullet_count: "风险备注数量完整",
    search_terms_bytes: "谈判备注不超过导出上限",
    selling_points_count: "业务诉求已捕获",
    seo_meta_length: "Memo 字段长度达标",
    all_caps_words: "不含噪声全大写词",
    keyword_stuffing: "关注词无过度重复",
    image_checklist: "文件清单齐备",
    claims_registry: "条款库检查通过",
  },
};

const EVIDENCE = {
  en: {
    fields_ok: (fields) => `All required issue fields present: ${fields.join(", ")}.`,
    fields_missing: (fields) => `Missing or empty issue fields: ${fields.join(", ")}.`,
    title_ok: (n, max) => `Issue title is ${n}/${max} characters.`,
    title_over: (n, max) => `Issue title is ${n} characters; the desk limit is ${max}.`,
    title_missing: () => "No issue title to measure.",
    banned_ok: () => "No hard-stop terms found.",
    banned_found: (hits) => `Hard-stop term(s) found: ${hits.join("; ")}.`,
    competitor_ok: () => "No restricted positions found.",
    competitor_found: (hits) => `Restricted position mentioned: ${hits.join(", ")}.`,
    bullets_ok: (n) => `${n} risk note(s).`,
    bullets_bad: (n, expected) => `${n} risk note(s); expected ${expected} for this workstream.`,
    bytes_ok: (n, max) => `Negotiation notes are ${n}/${max} bytes.`,
    bytes_over: (n, max) => `Negotiation notes are ${n} bytes; the export limit is ${max}.`,
    points_ok: (n) => `${n} business ask item(s).`,
    points_low: (n, min) => `Only ${n} business ask item(s); at least ${min} required.`,
    seo_ok: (tl, dl) => `Memo title ${tl} chars, memo summary ${dl} chars.`,
    seo_warn: (part, n, max) => `${part} is ${n} chars, slightly over the ${max}-char target.`,
    seo_over: (part, n, max) => `${part} is ${n} chars; the cap is ${max}.`,
    caps_ok: () => "No noisy all-caps words.",
    caps_found: (words) => `All-caps word(s): ${words.join(", ")}.`,
    stuffing_ok: () => "No watch term repeated beyond the threshold.",
    stuffing_found: (kw, n, max) => `"${kw}" appears ${n} times in title and notes (threshold ${max}).`,
    images_ok: (n) => `All ${n} required documents are ready.`,
    images_missing: (names) => `Document checklist incomplete: ${names.join(", ")}.`,
    images_none: () => "No document checklist defined for this contract.",
    claims_ok: () => "No unapproved or hard-stop legal positions found.",
    claims_none: () => "Clause playbook is empty — no approved fallbacks or hard-stop rules to check against.",
    claims_found: (hits) => `Clause playbook issue(s): ${hits.join("; ")}.`,
  },
  zh: {
    fields_ok: (fields) => `风险项字段齐全：${fields.join("、")}。`,
    fields_missing: (fields) => `缺少或为空的风险项字段：${fields.join("、")}。`,
    title_ok: (n, max) => `风险标题 ${n}/${max} 字符。`,
    title_over: (n, max) => `风险标题 ${n} 字符，超过工作台上限 ${max}。`,
    title_missing: () => "没有可检查的风险标题。",
    banned_ok: () => "未发现硬性禁止条款。",
    banned_found: (hits) => `发现硬性禁止条款：${hits.join("；")}。`,
    competitor_ok: () => "未发现受限立场。",
    competitor_found: (hits) => `提及受限立场：${hits.join("、")}。`,
    bullets_ok: (n) => `共 ${n} 条风险备注。`,
    bullets_bad: (n, expected) => `只有 ${n} 条风险备注；该工作流需要 ${expected} 条。`,
    bytes_ok: (n, max) => `谈判备注 ${n}/${max} 字节。`,
    bytes_over: (n, max) => `谈判备注 ${n} 字节，超过导出上限 ${max}。`,
    points_ok: (n) => `共 ${n} 条业务诉求。`,
    points_low: (n, min) => `只有 ${n} 条业务诉求；至少需要 ${min} 条。`,
    seo_ok: (tl, dl) => `Memo 标题 ${tl} 字符，Memo 摘要 ${dl} 字符。`,
    seo_warn: (part, n, max) => `${part} 为 ${n} 字符，略超 ${max} 字符目标。`,
    seo_over: (part, n, max) => `${part} 为 ${n} 字符，超过上限 ${max}。`,
    caps_ok: () => "没有噪声全大写词。",
    caps_found: (words) => `全大写词：${words.join("、")}。`,
    stuffing_ok: () => "没有关注词超过重复阈值。",
    stuffing_found: (kw, n, max) => `"${kw}" 在标题与备注中出现 ${n} 次（阈值 ${max}）。`,
    images_ok: (n) => `${n} 个必需文件全部就绪。`,
    images_missing: (names) => `文件清单未完成：${names.join("、")}。`,
    images_none: () => "该合同还没有文件清单。",
    claims_ok: () => "未发现未批准或硬性禁止的法务立场。",
    claims_none: () => "条款库为空——没有可比对的 fallback 或硬性规则。",
    claims_found: (hits) => `条款库问题：${hits.join("；")}。`,
  },
};

export function ruleCatalog(config = {}, lang = "en") {
  const names = RULE_NAMES[lang] || RULE_NAMES.en;
  const overrides = config.rule_names || {};
  return RULE_DEFS.map((rule) => ({
    rule_id: rule.rule_id,
    name: overrides[rule.rule_id] || names[rule.rule_id] || rule.rule_id,
    severity: rule.severity,
    platforms: rule.platforms,
  }));
}

export function platformRules(config, platform) {
  const entry = (config.platforms || []).find((item) => item.platform === platform);
  return entry?.rules || {};
}

function chars(value) {
  return [...String(value || "")].length;
}

function byteLengthUtf8(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function isAscii(value) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII-range (\x00-\x7f) test
  return /^[\x00-\x7f]+$/.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack, needle) {
  const term = String(needle || "").trim();
  if (!term) return false;
  if (isAscii(term)) {
    return new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i").test(haystack);
  }
  return haystack.includes(term);
}

function countTerm(haystack, needle) {
  const term = String(needle || "").trim();
  if (!term) return 0;
  if (isAscii(term)) {
    return (haystack.match(new RegExp(`\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "gi")) || []).length;
  }
  return haystack.split(term).length - 1;
}

function textCorpus(fields = {}) {
  const parts = [
    fields.title,
    fields.subtitle,
    ...(fields.bullets || []),
    fields.description,
    fields.search_terms,
    fields.seo_title,
    fields.seo_description,
    ...(fields.selling_points || []),
    ...(fields.aplus_outline || []),
    ...(fields.item_specifics || []).map((item) => `${item.name || ""} ${item.value || ""}`),
  ];
  return parts.filter(Boolean).map(String).join("\n");
}

function fieldPresent(fields, key) {
  const value = fields?.[key];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

// Returns [{ rule_id, severity, result, evidence }] for every rule that
// applies to the issue's workstream. `claims` is the clause playbook
// (approved fallback clauses + banned/restricted-phrase rules); when
// supplied, the claims_registry rule flags language that trips a rule or
// leans on a clause that is not approved.
export function evaluateIssue(issue, contract, config = {}, lang = "en", claims = null) {
  const say = EVIDENCE[lang] || EVIDENCE.en;
  const platform = issue.platform;
  const fields = issue.fields || {};
  const shape = PLATFORM_FIELD_SHAPES[platform] || PLATFORM_FIELD_SHAPES.amazon;
  const rules = platformRules(config, platform);
  const corpus = textCorpus(fields);
  const results = [];

  const push = (rule_id, result, evidence, refs) => {
    const def = RULE_DEFS.find((rule) => rule.rule_id === rule_id);
    results.push({ rule_id, severity: def?.severity || "warning", result, evidence, ...(refs ? { refs } : {}) });
  };

  for (const def of RULE_DEFS) {
    if (!def.platforms.includes(platform)) continue;
    switch (def.rule_id) {
      case "required_fields": {
        const required = rules.required_fields || shape.default_required;
        const missing = required.filter((key) => !fieldPresent(fields, key));
        push(
          "required_fields",
          missing.length ? "fail" : "pass",
          missing.length ? say.fields_missing(missing) : say.fields_ok(required),
        );
        break;
      }
      case "title_length": {
        const max = Number(rules.title_max_chars) || DEFAULT_TITLE_CAPS[platform] || 200;
        const length = chars(fields.title);
        if (!length) push("title_length", "fail", say.title_missing());
        else
          push(
            "title_length",
            length > max ? "fail" : "pass",
            length > max ? say.title_over(length, max) : say.title_ok(length, max),
          );
        break;
      }
      case "banned_words": {
        const words = [...(config.banned_words || []), ...(rules.extra_banned_words || [])];
        const hits = words.filter((word) => containsTerm(corpus, word));
        push(
          "banned_words",
          hits.length ? "fail" : "pass",
          hits.length ? say.banned_found(hits.map((hit) => `"${hit}"`)) : say.banned_ok(),
        );
        break;
      }
      case "competitor_brands": {
        const brands = config.competitor_brands || [];
        const hits = brands.filter((brand) => containsTerm(corpus, brand));
        push(
          "competitor_brands",
          hits.length ? "fail" : "pass",
          hits.length ? say.competitor_found(hits) : say.competitor_ok(),
        );
        break;
      }
      case "bullet_count": {
        const expected = Number(rules.bullets_exact) || 5;
        const count = (fields.bullets || []).filter((bullet) => String(bullet).trim()).length;
        push(
          "bullet_count",
          count === expected ? "pass" : "fail",
          count === expected ? say.bullets_ok(count) : say.bullets_bad(count, expected),
        );
        break;
      }
      case "search_terms_bytes": {
        const max = Number(rules.search_terms_max_bytes) || 249;
        const bytes = byteLengthUtf8(fields.search_terms || "");
        push(
          "search_terms_bytes",
          bytes > max ? "fail" : "pass",
          bytes > max ? say.bytes_over(bytes, max) : say.bytes_ok(bytes, max),
        );
        break;
      }
      case "selling_points_count": {
        const min = Number(rules.min_selling_points) || 3;
        const count = (fields.selling_points || []).filter((point) => String(point).trim()).length;
        push(
          "selling_points_count",
          count >= min ? "pass" : "fail",
          count >= min ? say.points_ok(count) : say.points_low(count, min),
        );
        break;
      }
      case "seo_meta_length": {
        const titleMax = Number(rules.seo_title_max_chars) || 60;
        const descMax = Number(rules.seo_description_max_chars) || 160;
        const titleLen = chars(fields.seo_title);
        const descLen = chars(fields.seo_description);
        if (titleLen > titleMax + 5 || descLen > descMax + 10) {
          const part = titleLen > titleMax + 5 ? "SEO title" : "SEO description";
          const n = titleLen > titleMax + 5 ? titleLen : descLen;
          const max = titleLen > titleMax + 5 ? titleMax : descMax;
          push("seo_meta_length", "fail", say.seo_over(part, n, max));
        } else if (titleLen > titleMax || descLen > descMax) {
          const part = titleLen > titleMax ? "SEO title" : "SEO description";
          const n = titleLen > titleMax ? titleLen : descLen;
          const max = titleLen > titleMax ? titleMax : descMax;
          push("seo_meta_length", "warn", say.seo_warn(part, n, max));
        } else {
          push("seo_meta_length", "pass", say.seo_ok(titleLen, descLen));
        }
        break;
      }
      case "all_caps_words": {
        const allowed = new Set(
          [...(config.allowed_all_caps || []), ...DEFAULT_ALLOWED_ALL_CAPS].map((word) => word.toUpperCase()),
        );
        const visible = [fields.title, fields.subtitle, ...(fields.bullets || []), ...(fields.selling_points || [])]
          .filter(Boolean)
          .join("\n");
        const hits = [...new Set((visible.match(/\b[A-Z]{3,}\b/g) || []).filter((word) => !allowed.has(word)))];
        push("all_caps_words", hits.length ? "warn" : "pass", hits.length ? say.caps_found(hits) : say.caps_ok());
        break;
      }
      case "keyword_stuffing": {
        const max = Number(config.keyword_stuffing?.max_repeats) || 3;
        const visible = [fields.title, ...(fields.bullets || []), ...(fields.selling_points || [])]
          .filter(Boolean)
          .join("\n");
        let worst = null;
        for (const keyword of contract?.keywords || []) {
          const count = countTerm(visible, keyword);
          if (count > max && (!worst || count > worst.count)) worst = { keyword, count };
        }
        push(
          "keyword_stuffing",
          worst ? "warn" : "pass",
          worst ? say.stuffing_found(worst.keyword, worst.count, max) : say.stuffing_ok(),
        );
        break;
      }
      case "image_checklist": {
        const images = contract?.images || [];
        if (!images.length) {
          push("image_checklist", "warn", say.images_none());
        } else {
          const pending = images.filter((image) => image.status !== "ready");
          push(
            "image_checklist",
            pending.length ? "warn" : "pass",
            pending.length
              ? say.images_missing(pending.map((image) => `${image.name} (${image.status})`))
              : say.images_ok(images.length),
          );
        }
        break;
      }
      case "claims_registry": {
        const registryClaims = claims?.claims || [];
        const registryRules = claims?.rules || [];
        if (!registryClaims.length && !registryRules.length) {
          push("claims_registry", "pass", say.claims_none());
          break;
        }
        const messages = [];
        const refs = { rules: [], claims: [] };
        // 1) Banned-word / restricted-phrase rules matched in the copy.
        for (const rule of registryRules) {
          if (!rule?.phrase) continue;
          if (containsTerm(corpus, rule.phrase)) {
            refs.rules.push(rule.rule_id);
            const label = rule.type === "banned_word" ? "banned word" : "restricted phrase";
            messages.push(`${label} "${rule.phrase}"${rule.alternative ? ` (use "${rule.alternative}")` : ""}`);
          }
        }
        // 2) Non-approved claims (pending / rejected) leaned on in the copy.
        for (const claim of registryClaims) {
          if (!claim?.text || claim.status === "approved") continue;
          if (containsTerm(corpus, claim.text)) {
            refs.claims.push(claim.claim_id);
            messages.push(`unapproved claim "${claim.text}" (status: ${claim.status})`);
          }
        }
        push(
          "claims_registry",
          messages.length ? "fail" : "pass",
          messages.length ? say.claims_found(messages) : say.claims_ok(),
          messages.length ? refs : undefined,
        );
        break;
      }
      default:
        break;
    }
  }
  return results;
}

const POINTS = { pass: 1, warn: 0.5, fail: 0 };

export function scoreChecks(checks) {
  const scored = checks.filter((check) => check.result in POINTS);
  const total = scored.length || 1;
  const points = scored.reduce((sum, check) => sum + POINTS[check.result], 0);
  return Math.round((points / total) * 100);
}

export function computeMetrics(snapshot) {
  const issues = snapshot.issues || [];
  const checks = snapshot.checks || [];
  const byPlatform = {};
  for (const issue of issues) {
    byPlatform[issue.platform] = (byPlatform[issue.platform] || 0) + 1;
  }
  const resolved = checks.filter((check) => check.result in POINTS);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  return {
    contract_count: (snapshot.contracts || []).length,
    issue_count: issues.length,
    issues_by_platform: byPlatform,
    issues_needs_review: issues.filter((issue) => issue.status === "needs_review").length,
    issues_approved: issues.filter((issue) => ["approved", "done"].includes(issue.status)).length,
    issues_in_revision: issues.filter((issue) => issue.status === "changes_requested").length,
    checks_failed: checks.filter((check) => check.result === "fail").length,
    compliance_pass_rate: Math.round(
      (resolved.filter((check) => check.result === "pass").length / Math.max(1, resolved.length)) * 100,
    ),
    exported_this_week: issues.filter(
      (issue) => issue.status === "done" && Date.parse(issue.updated_at || 0) >= weekAgo,
    ).length,
  };
}

// A review item is the issue itself: no separate decisions.json-equivalent
// bucket in the Busabase-only shape (see the module doc comment above).
export function issueToReviewItem(issue) {
  return {
    review_id: issue.issue_id,
    ref: issue.ref,
    issue_id: issue.issue_id,
    status: issue.status,
    compliance_summary: issue.compliance_summary,
    suggestions: issue.suggestions,
    created_at: issue.created_at,
  };
}

// New orchestration (not a port): derives a recent-activity feed from each
// issue's own timestamps instead of reading a persisted activity_log.json,
// since Busabase reads are always live.
export function deriveActivityLog(issues = [], contractsById = new Map(), { limit = 50 } = {}) {
  const entries = [];
  for (const issue of issues) {
    const contractName = contractsById.get(issue.contract_id)?.name || issue.contract_id;
    if (issue.created_at) {
      entries.push({
        id: `act-${issue.issue_id}-created`,
        at: issue.created_at,
        actor: "agent",
        detail: `Prepared ${issue.platform} ${issue.locale || ""} issue for ${contractName}.`,
        draft_id: issue.issue_id,
      });
    }
    if (issue.updated_at && issue.updated_at !== issue.created_at) {
      entries.push({
        id: `act-${issue.issue_id}-updated`,
        at: issue.updated_at,
        actor: "agent",
        detail: `Updated issue for ${contractName}.`,
        draft_id: issue.issue_id,
      });
    }
    if (issue.decided_at && issue.decision_action) {
      const label =
        issue.decision_action === "approve"
          ? "Approved"
          : issue.decision_action === "request_changes"
            ? "Requested changes on"
            : issue.decision_action === "block"
              ? "Blocked"
              : "Revised";
      entries.push({
        id: `act-${issue.issue_id}-decision`,
        at: issue.decided_at,
        actor: "seller",
        detail: `${label} the issue for ${contractName}${issue.decision_note ? `: ${issue.decision_note}` : "."}`,
        draft_id: issue.issue_id,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Pure assembly on already-parsed contracts/issues/checks (fields as real
// objects/arrays, not JSON strings) plus a configSummary in
// buildConfigSummary()'s output shape. Used directly by the demo provider
// (which builds its fixtures already in this shape) and by buildSnapshot()
// below for the Busabase-row path.
/**
 * @param {{
 *   contracts?: Array<Record<string, any>>,
 *   issues?: Array<Record<string, any>>,
 *   checks?: Array<Record<string, any>>,
 *   configSummary?: Record<string, any>,
 *   lang?: string,
 *   now?: string,
 * }} [args]
 */
export function assembleSnapshot({
  contracts = [],
  issues = [],
  checks = [],
  configSummary = {},
  lang = "en",
  now = new Date().toISOString(),
} = {}) {
  const sortedContracts = [...contracts].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedIssues = [...issues].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const contractsById = new Map(sortedContracts.map((contract) => [contract.contract_id, contract]));
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-legal-contracts",
    seller: {
      brand: configSummary.seller?.brand || "",
      entity: configSummary.seller?.entity || "",
    },
    metrics: {},
    contracts: sortedContracts,
    issues: sortedIssues,
    rules: ruleCatalog(configSummary, lang),
    checks,
    review_items: sortedIssues.map(issueToReviewItem),
    activity_log: deriveActivityLog(sortedIssues, contractsById),
    warnings:
      sortedContracts.length || sortedIssues.length
        ? []
        : [
            {
              id: "no-snapshot",
              severity: "info",
              message:
                "No contract review snapshot exists yet. Ingest contract facts or ask the agent to draft contract issues from a legal intake.",
            },
          ],
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}

// Busabase-row wrapper: normalizes the raw contracts/issues/checks rows read
// from Busabase (already snake_cased by the provider) into the
// Contract/Issue/Check shapes the UI expects, pulls the legal profile off
// the live Settings row (no separate config file), then calls
// assembleSnapshot().
export function buildSnapshot({
  contracts = [],
  issues = [],
  checks = [],
  settings = {},
  lang = "en",
  now = new Date().toISOString(),
} = {}) {
  return assembleSnapshot({
    contracts: contracts.map(normalizeContractRow),
    issues: issues.map(normalizeIssueRow),
    checks: checks.map(normalizeCheckRow),
    configSummary: buildConfigSummary({ settings }),
    lang,
    now,
  });
}

// ---- Decision -> status mapping, ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus; // "revise" edits the fields/note only, status is unchanged
}

// Adapted from the retired scripts/execute_decisions.ts: maps an approved or
// changes-requested issue to the concrete follow-up operation the agent must
// perform outside the app, and the target the operation acts on. The retired
// script recorded a list of ExecutionResult entries in a separate
// execution_report.json (one "export_issue_list" plus one "handoff_redline"
// entry per approval); this shape writes one execution marker directly onto
// the issue record instead, folding the redline-handoff detail into the
// same entry.
export function issueExecution(issue, decision, contractName = "", { apply = false } = {}) {
  if (decision.action === "approve") {
    const target = `exports/${slugify(`${contractName}-${issue.platform}-${issue.locale || ""}`)}.md`;
    return {
      operation: "export_issue_list",
      target,
      status: apply ? "ready_for_agent" : "planned",
      detail: `Run scripts/export_issues.mjs to write ${target}. External redline delivery or counsel handoff is executed by the agent outside the app, after approval.`,
    };
  }
  if (decision.action === "request_changes") {
    return {
      operation: "request_revision",
      target: issue.issue_id,
      status: apply ? "ready_for_agent" : "planned",
      detail:
        "Redraft the issue per the review note, then re-ingest with scripts/ingest_contracts.mjs and re-run scripts/run_checks.mjs.",
    };
  }
  return null;
}
