import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// The snapshot below is ported verbatim (same ids, same copy, same numbers)
// from the retired app/server/demo.ts's `snapshot` object; created_at/
// updated_at/decision fields are added on top since the retired snapshot
// predates Busabase rows having their own timestamps and a real decision
// record (a decision used to live only in the separate decisions.json file).
import {
  APP_ID,
  APP_SUBTITLE,
  APP_SUBTITLE_ZH,
  APP_TITLE,
  APP_TITLE_ZH,
  recomputeMetrics,
} from "../precedent-model.js?v=0.1.0";

const RAW_SNAPSHOT = {
  schema_version: "1",
  generated_at: "2026-07-07T09:00:00.000Z",
  source: "kelly-legal-precedent-desk",
  workspace: {
    title: APP_TITLE,
    title_zh: APP_TITLE_ZH,
    subtitle: APP_SUBTITLE,
    subtitle_zh: APP_SUBTITLE_ZH,
    firm: "泰和泰（深圳）律师事务所 · demo",
    jurisdiction: "Shenzhen / Guangdong",
  },
  metrics: {
    query_count: 2,
    high_matches: 7,
    local_patterns: 3,
  },
  entities: [
    {
      id: "prec-lease-break",
      title: "疫情期间商业租赁解除与违约金调减",
      meta: "4 个内部相似案例 · 深圳/广州",
      status: "needs_review",
      owner: "房地产争议组",
      summary: "类案显示：催告、欠租持续时间和实际损失证明是解除与违约金支持幅度的关键。",
      tags: ["租赁", "违约金", "深圳法院"],
      metrics: { case_count: 4, avg_similarity: 0.81, citation_count: 9 },
    },
    {
      id: "prec-repurchase",
      title: "股权回购触发条件与履行障碍",
      meta: "3 个内部相似案例 · 广东高院/深圳中院",
      status: "approved",
      owner: "公司争议组",
      summary: "类案区分股东回购责任与目标公司回购责任，关注减资程序与履行可能性。",
      tags: ["对赌", "股权回购", "公司法"],
      metrics: { case_count: 3, avg_similarity: 0.78, citation_count: 7 },
    },
  ],
  items: [
    {
      id: "pack-lease-break",
      ref: "Pack #1",
      title: "商业租赁欠租解除类案包",
      category: "租赁合同纠纷",
      status: "needs_review",
      owner: "主办律师",
      risk: ["legal", "confidentiality"],
      summary: "围绕承租方疫情抗辩与解除权形成 4 个内部类案，匹配度 0.81。",
      body: "本地裁判倾向：持续欠租且经催告未补正时，出租方解除权通常被支持；违约金会结合实际损失和履行情况调减。",
      recommendation: "作为诉前策略参考；补充检索 2025 年后深圳基层法院案例后再用于客户 memo。",
      proposed_action: "approve_research_pack",
      draft:
        "研究结论草稿：我所既往深圳租赁案件显示，法院更重视催告程序、欠租持续性、租金减免协商记录和损失证明。建议先固定催告与欠租证据，再把违约金请求设置为可调减区间。",
      evidence: ["case-lease-arrears-shenzhen similarity 0.86", "case-retail-rent-covid similarity 0.79"],
      fields: {
        query: "疫情影响下商业租赁欠租能否解除",
        jurisdiction: "深圳",
        match_count: 4,
        high_match_count: 3,
        top_similarity: 0.86,
        avg_similarity: 0.81,
        court_pattern: "深圳法院更重视催告、欠租持续性、减免协商记录与损失证明。",
        citation_count: 9,
      },
      created_at: "2026-07-05T02:00:00.000Z",
      updated_at: "2026-07-07T08:40:00.000Z",
    },
    {
      id: "pack-repurchase",
      ref: "Pack #2",
      title: "股权回购对赌履行类案包",
      category: "公司争议",
      status: "approved",
      owner: "公司争议组",
      risk: ["legal"],
      summary: "内部类案足够，适合形成团队知识卡。",
      body: "法院围绕责任主体、触发条件、减资程序和投资人过错分配审查履行可能性。",
      recommendation: "批准为公司争议专题卡，并标注不得承诺回购请求必然支持。",
      proposed_action: "approve_research_pack",
      draft: "类案摘要：股权回购请求的可支持性取决于回购主体和触发条件，不宜脱离公司资本维持规则单独判断。",
      evidence: ["case-equity-repurchase similarity 0.88", "case-investor-exit similarity 0.74"],
      fields: {
        query: "对赌回购条款履行",
        jurisdiction: "广东",
        match_count: 3,
        high_match_count: 2,
        top_similarity: 0.88,
        avg_similarity: 0.78,
        court_pattern: "广东地区裁判会先区分回购主体，再审查减资程序和触发条件是否具体。",
        citation_count: 7,
      },
      decision_action: "approve",
      review_note: "批准为公司争议专题卡，纳入知识库。",
      decided_at: "2026-07-06T10:15:00.000Z",
      created_at: "2026-07-04T05:30:00.000Z",
      updated_at: "2026-07-06T10:15:00.000Z",
    },
  ],
  checks: [
    {
      id: "chk-citations",
      label: "Citation coverage",
      status: "pass",
      detail: "Every conclusion links to at least one approved internal case id.",
      item_id: "pack-lease-break",
      severity: "warning",
    },
    {
      id: "chk-confidentiality",
      label: "Confidentiality",
      status: "warn",
      detail: "One draft phrase should avoid naming a former client before export.",
      item_id: "pack-lease-break",
      severity: "warning",
    },
    {
      id: "chk-match",
      label: "Similarity threshold",
      status: "pass",
      detail: "All cited cases are above the configured 0.72 threshold.",
      item_id: "pack-repurchase",
      severity: "warning",
    },
  ],
  activity_log: [
    {
      at: "2026-07-07T09:00:00.000Z",
      actor: "kelly-legal-precedent-desk",
      action: "demo_seed",
      detail: "Demo data is synthetic and safe for screenshots.",
      count: 2,
    },
  ],
};

function demoSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(RAW_SNAPSHOT));
  snapshot.metrics = recomputeMetrics(snapshot.items, snapshot.checks, snapshot.metrics);
  return snapshot;
}

function demoConfigSummary() {
  return {
    config_path: "demo://kelly-legal-precedent-desk/config.json",
    is_example: false,
    firm_profile: {
      firm_name: "泰和泰（深圳）律师事务所",
      branch: "Shenzhen",
      reviewer_role: "responsible lawyer",
      default_jurisdictions: ["Guangdong", "Shenzhen"],
    },
    search_policy: {
      default_jurisdiction: "Shenzhen",
      minimum_similarity_score: 0.72,
      require_source_case_ids: true,
      quote_limit_words: 120,
    },
    export: { format: "markdown+json", out_dir: "exports/research-packs" },
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = demoSnapshot();
    const visuals = demoVisualsForApp(APP_ID);
    return {
      app: APP_ID,
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: RAW_SNAPSHOT.generated_at, config_version: "demo" },
      lock: null,
      config_summary: demoConfigSummary(),
      demo_visuals: visuals,
      snapshot: { ...snapshot, demo_visuals: visuals },
    };
  },

  async decideItem() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
