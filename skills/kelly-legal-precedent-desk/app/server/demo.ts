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
  source: "kelly-legal-precedent-desk",
  workspace: {
    title: "Legal Precedent Desk",
    title_zh: "类案检索与裁判尺度台",
    subtitle: "Internal precedents and local court patterns",
    subtitle_zh: "内部类案与本地裁判尺度",
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
    },
    {
      id: "prec-repurchase",
      title: "股权回购触发条件与履行障碍",
      meta: "3 个内部相似案例 · 广东高院/深圳中院",
      status: "approved",
      owner: "公司争议组",
      summary: "类案区分股东回购责任与目标公司回购责任，关注减资程序与履行可能性。",
      tags: ["对赌", "股权回购", "公司法"],
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
      },
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
      },
    },
  ],
  checks: [
    {
      id: "chk-citations",
      label: "Citation coverage",
      status: "pass",
      detail: "Every conclusion links to at least one approved internal case id.",
    },
    {
      id: "chk-confidentiality",
      label: "Confidentiality",
      status: "warn",
      detail: "One draft phrase should avoid naming a former client before export.",
    },
    {
      id: "chk-match",
      label: "Similarity threshold",
      status: "pass",
      detail: "All cited cases are above the configured 0.72 threshold.",
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
