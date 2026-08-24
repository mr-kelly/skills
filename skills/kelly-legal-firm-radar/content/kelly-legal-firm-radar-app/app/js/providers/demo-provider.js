import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// The snapshot below is ported verbatim (same ids, same copy, same numbers)
// from the retired app/server/demo.ts's `snapshot` object.
import {
  APP_ID,
  APP_SUBTITLE,
  APP_SUBTITLE_ZH,
  APP_TITLE,
  APP_TITLE_ZH,
  recomputeMetrics,
} from "../firm-radar-model.js?v=0.1.0";

const RAW_SNAPSHOT = {
  schema_version: "1",
  generated_at: "2026-07-07T09:00:00.000Z",
  source: "kelly-legal-firm-radar",
  workspace: {
    title: APP_TITLE,
    title_zh: APP_TITLE_ZH,
    subtitle: APP_SUBTITLE,
    subtitle_zh: APP_SUBTITLE_ZH,
    firm: "泰和泰（深圳）律师事务所 · demo",
    jurisdiction: "Shenzhen / Guangdong",
  },
  metrics: {
    case_samples: 73,
    practice_groups: 4,
    lawyers_profiled: 12,
    public_citable: 6,
    outcome_trends: [
      { period: "2025 Q3", win_rate: 0.58 },
      { period: "2025 Q4", win_rate: 0.62 },
      { period: "2026 Q1", win_rate: 0.67 },
      { period: "2026 Q2", win_rate: 0.71 },
    ],
  },
  entities: [
    {
      id: "profile-real-estate",
      title: "房地产与租赁争议",
      meta: "42 个脱敏案例 · 深圳/广州",
      status: "needs_review",
      owner: "管理团队",
      summary: "近 12 个月案例量增长，胜诉/部分支持集中在商业租赁和建设工程付款争议。",
      tags: ["业务布局", "增长领域", "深圳"],
      metrics: { case_count: 42, lawyer_count: 5, public_citable: 2 },
    },
    {
      id: "profile-company-disputes",
      title: "公司争议专业画像",
      meta: "31 个脱敏案例 · 6 名主办律师",
      status: "approved",
      owner: "战略委",
      summary: "股权回购、控制权争议和投后退出有稳定案例积累，可形成市场展示 proof point。",
      tags: ["律师画像", "品牌证明", "公司法"],
      metrics: { case_count: 31, lawyer_count: 6, public_citable: 3 },
    },
  ],
  items: [
    {
      id: "insight-real-estate-growth",
      ref: "Insight #1",
      title: "商业租赁争议增长与团队配置建议",
      category: "业务布局",
      status: "needs_review",
      owner: "战略委",
      risk: ["management", "privacy"],
      summary: "脱敏元数据显示商业租赁争议新增速度快，但办理集中在少数律师，建议配置专题小组。",
      body: "过去 12 个月商业租赁相关案例 18 件，其中 11 件来自深圳基层法院，争议集中在欠租解除、违约金调减和疫情/经营困难抗辩。",
      recommendation: "批准形成内部业务布局简报；外部宣传前需删除胜率表达并补充代表性公开案例。",
      proposed_action: "approve_management_report",
      draft:
        "管理洞察草稿：商业租赁争议已形成稳定本地案例积累，建议设立房地产租赁专题组，沉淀标准证据清单和类案检索入口。",
      evidence: ["18 个脱敏案例", "11 个深圳基层法院样本", "4 名主办律师参与"],
      fields: {
        sample_size: 18,
        period: "last_12_months",
        visibility: "internal_management",
        lawyer_count: 4,
        public_citable: 1,
        quality_indicators: ["深圳基层法院样本集中", "商业租赁证据清单可复用", "胜率表达不能外用"],
      },
      created_at: "2026-07-05T02:00:00.000Z",
      updated_at: "2026-07-07T08:40:00.000Z",
    },
    {
      id: "insight-company-brand",
      ref: "Insight #2",
      title: "公司争议品牌 proof point",
      category: "品牌展示",
      status: "approved",
      owner: "战略委",
      risk: ["legal", "brand"],
      summary: "公司争议案例积累可用于律师画像，但不得公开客户名称或未公开结果。",
      body: "公司争议团队在股权回购、控制权纠纷和投后退出中有多个内部案例，具备形成专业介绍的基础。",
      recommendation: "批准内部律师画像；外部版本仅使用脱敏描述和公开可查案例。",
      proposed_action: "approve_management_report",
      draft: "品牌草稿：团队长期处理股权回购、控制权争议及投后退出纠纷，熟悉广东地区公司争议裁判尺度。",
      evidence: ["31 个脱敏案例", "6 名主办律师", "3 个公开可引用案例"],
      fields: {
        sample_size: 31,
        period: "all_time",
        visibility: "internal_then_external_review",
        lawyer_count: 6,
        public_citable: 3,
        quality_indicators: ["股权回购案例积累稳定", "控制权争议有主办律师画像", "外部版本仅用公开可查案例"],
      },
      decision_action: "approve",
      review_note: "批准，纳入公司争议专题。",
      decided_at: "2026-07-06T10:15:00.000Z",
      created_at: "2026-07-04T05:30:00.000Z",
      updated_at: "2026-07-06T10:15:00.000Z",
    },
  ],
  checks: [
    {
      id: "chk-sample",
      label: "Sample size",
      status: "warn",
      detail: "One brand proof point has enough internal cases but only three public-citable cases.",
      item_id: "insight-company-brand",
      severity: "warning",
    },
    {
      id: "chk-privacy",
      label: "Anonymized metadata",
      status: "pass",
      detail: "No raw client names or document text are present in the analytics snapshot.",
      item_id: "insight-real-estate-growth",
      severity: "warning",
    },
    {
      id: "chk-claims",
      label: "Unsupported claims",
      status: "warn",
      detail: "Avoid public win-rate language unless methodology is approved.",
      item_id: "insight-real-estate-growth",
      severity: "warning",
    },
  ],
  activity_log: [
    {
      at: "2026-07-07T09:00:00.000Z",
      actor: "kelly-legal-firm-radar",
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
    config_path: "demo://kelly-legal-firm-radar/config.json",
    is_example: false,
    firm_profile: {
      firm_name: "泰和泰（深圳）律师事务所",
      branch: "Shenzhen",
      reviewer_role: "management committee",
      default_jurisdictions: ["Guangdong", "Shenzhen"],
    },
    analytics_policy: {
      require_anonymized_metadata: true,
      minimum_sample_size_for_claim: 5,
      external_brand_claims_require_approval: true,
      allowed_views: ["management", "practice", "lawyer_profile", "brand_proof"],
    },
    taxonomy: {
      practice_areas: ["民商事", "公司争议", "劳动", "知识产权", "刑事", "行政"],
    },
    export: { format: "markdown+csv", out_dir: "exports/management-reports" },
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
