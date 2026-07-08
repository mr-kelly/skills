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
  source: "kelly-legal-matter-strategy",
  workspace: {
    title: "Legal Matter Strategy",
    title_zh: "案件策略与文书辅助台",
    subtitle: "Strategy, evidence, and drafting plans",
    subtitle_zh: "争议策略、证据与文书方案",
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
    evidence_gaps: 2,
    deadlines_soon: 1,
    draft_ready: 1,
  },
  entities: [
    {
      id: "matter-saas-arrears",
      title: "SaaS 服务费欠款与解除争议",
      meta: "诉前 · 深圳 · 合同纠纷",
      status: "needs_review",
      owner: "王律师",
      summary: "客户希望快速解除并追收服务费，需要权衡证据完整性和违约金可支持幅度。",
      tags: ["合同纠纷", "证据补强", "诉前策略"],
      metrics: { evidence_gaps: 2, issue_count: 3, option_count: 3 },
    },
    {
      id: "matter-shareholder-exit",
      title: "少数股东退出与回购争议",
      meta: "仲裁准备 · 深圳国际仲裁院",
      status: "approved",
      owner: "林律师",
      summary: "已形成仲裁请求、证据目录和谈判底线。",
      tags: ["股东退出", "仲裁", "回购"],
      metrics: { evidence_gaps: 0, issue_count: 2, option_count: 2 },
    },
  ],
  items: [
    {
      id: "strategy-saas-arrears",
      ref: "Strategy #1",
      title: "SaaS 服务费欠款诉前策略",
      category: "合同纠纷",
      status: "needs_review",
      owner: "王律师",
      risk: ["legal", "deadline"],
      summary: "证据链基本完整，但服务验收与催告送达仍需补强。",
      body: "争议焦点：服务是否完成交付、欠费是否构成根本违约、违约金是否过高。类案提示催告和验收证据是关键。",
      recommendation: "先补齐催告送达和后台使用记录，再发律师函；起诉请求保留违约金调减预案。",
      proposed_action: "approve_strategy_pack",
      draft:
        "策略草稿：1. 固定合同、开票、使用记录和催告送达；2. 以解除合同+追收欠款为主请求；3. 对违约金准备实际损失与服务投入证据；4. 谈判底线为本金全额+部分违约金。",
      evidence: ["pack-lease-break: 催告程序重要性", "内部 SaaS 欠费案: 使用记录被采信"],
      fields: {
        matter_stage: "诉前",
        evidence_gaps: 2,
        evidence_gap_count: 2,
        evidence_gaps_list: ["服务验收节点缺少客户确认", "催告送达凭证需要补强"],
        issue_tree: [
          { label: "服务是否完成交付", children: ["交付节点是否有客户确认", "验收标准如何约定"] },
          { label: "欠费是否构成根本违约", children: ["催告次数与送达凭证", "逾期时长是否达到解除标准"] },
          { label: "违约金是否过高", children: ["实际损失举证", "同类裁判调减幅度"] },
        ],
        negotiation_options: ["先发律师函固定解除权", "本金全额+部分违约金和解", "诉讼请求保留调减预案"],
        posture: "证据补强后再启动正式函件，避免过早承诺违约金支持比例。",
        pleading_outline: "请求解除合同、支付服务费、承担违约金；备选请求按实际损失调整。",
        deadline: "2026-07-20",
      },
    },
    {
      id: "strategy-shareholder-exit",
      ref: "Strategy #2",
      title: "少数股东退出仲裁策略",
      category: "公司争议",
      status: "approved",
      owner: "林律师",
      risk: ["legal"],
      summary: "类案和证据均较充分，建议批准进入仲裁申请书大纲。",
      body: "以回购触发条件和信息披露违约为核心，备选请求包括损害赔偿。",
      recommendation: "批准策略包，并将证据目录交给文书起草流程。",
      proposed_action: "approve_strategy_pack",
      draft: "仲裁策略：主张回购义务已触发，辅以信息披露违约；如仲裁庭关注履行障碍，则转向损害赔偿备选请求。",
      evidence: ["pack-repurchase", "董事会纪要", "投资协议"],
      fields: {
        matter_stage: "仲裁准备",
        evidence_gaps: 0,
        evidence_gap_count: 0,
        evidence_gaps_list: [],
        issue_tree: [
          { label: "回购条件是否触发", children: ["业绩对赌是否达标", "触发时点认定"] },
          { label: "信息披露违约是否成立", children: ["披露义务范围", "违约与损失因果"] },
        ],
        negotiation_options: ["以回购义务为主张", "备选损害赔偿", "调解底线为本金加资金成本"],
        posture: "证据较完整，可进入仲裁申请书大纲。",
        pleading_outline: "仲裁请求围绕回购义务、违约责任和备选赔偿展开。",
        deadline: "2026-08-05",
      },
    },
  ],
  checks: [
    {
      id: "chk-evidence",
      label: "Evidence map",
      status: "warn",
      detail: "Two delivery/cure-notice exhibits are missing for Strategy #1.",
    },
    {
      id: "chk-precedent",
      label: "Precedent grounding",
      status: "pass",
      detail: "Every recommendation links to facts or a precedent pack.",
    },
    {
      id: "chk-client",
      label: "Client-facing approval",
      status: "pass",
      detail: "No external client advice will be exported without approval.",
    },
  ],
  activity_log: [
    {
      at: "2026-07-07T09:00:00.000Z",
      actor: "kelly-legal-matter-strategy",
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
