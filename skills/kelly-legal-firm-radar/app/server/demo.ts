import { recomputeMetrics } from "../../lib/common.ts";
import {
  APP_ID,
  APP_TITLE,
  APP_TITLE_ZH,
  BLOCKED_LABEL_EN,
  BLOCKED_LABEL_ZH,
  HUMAN_TASK_EN,
  HUMAN_TASK_ZH,
  READY_LABEL_EN,
  READY_LABEL_ZH,
  type Snapshot,
} from "../../lib/types.ts";

const snapshot = {
  schema_version: "1",
  generated_at: "2026-07-07T09:00:00.000Z",
  source: "kelly-legal-firm-radar",
  workspace: {
    title: "Legal Firm Radar",
    title_zh: "律所经营画像台",
    subtitle: "Practice analytics and lawyer profiles",
    subtitle_zh: "业务布局、质量评估与律师画像",
    firm: "泰和泰（深圳）律师事务所 · demo",
    jurisdiction: "Shenzhen / Guangdong",
  },
  metrics: {
    items_total: 0,
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    checks_failed: 0,
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
    },
  ],
  checks: [
    {
      id: "chk-sample",
      label: "Sample size",
      status: "warn",
      detail: "One brand proof point has enough internal cases but only three public-citable cases.",
    },
    {
      id: "chk-privacy",
      label: "Anonymized metadata",
      status: "pass",
      detail: "No raw client names or document text are present in the analytics snapshot.",
    },
    {
      id: "chk-claims",
      label: "Unsupported claims",
      status: "warn",
      detail: "Avoid public win-rate language unless methodology is approved.",
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
} as Snapshot;

export function demoSnapshot(): Snapshot {
  return recomputeMetrics(JSON.parse(JSON.stringify(snapshot)) as Snapshot);
}

export function isDemoQuery(query: Record<string, string | undefined>): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: Record<string, string | undefined>) {
  const snap = demoSnapshot();
  const scenario = query.demo || "overview";
  return {
    app: APP_ID,
    demo: true,
    demo_scenario: scenario,
    data_provider: "demo",
    onboarding: { completed: true, demo: true },
    lock: null,
    config_summary: {
      app: APP_TITLE,
      app_zh: APP_TITLE_ZH,
      provider: "demo",
      config_path: "demo://config.json",
      is_example: false,
      human_task_en: HUMAN_TASK_EN,
      human_task_zh: HUMAN_TASK_ZH,
      ready_label_en: READY_LABEL_EN,
      ready_label_zh: READY_LABEL_ZH,
      blocked_label_en: BLOCKED_LABEL_EN,
      blocked_label_zh: BLOCKED_LABEL_ZH,
    },
    decisions: { schema_version: "1", updated_at: "", decisions: {} },
    agent_tasks: { schema_version: "1", updated_at: "", tasks: [] },
    execution_report: null,
    snapshot: snap,
  };
}
