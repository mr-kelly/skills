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
  source: "kelly-legal-casebase-ingest",
  workspace: {
    title: "Legal Casebase Ingest",
    title_zh: "案例入库质检台",
    subtitle: "Case intake and anonymization QA",
    subtitle_zh: "裁判文书入库与脱敏质检",
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
      id: "case-lease-arrears-shenzhen",
      title: "深圳商业租赁欠租解除案",
      meta: "民商事 · 深圳中院 · 二审",
      status: "needs_review",
      owner: "张律师",
      summary: "承租方逾期支付租金并主张疫情影响，法院支持解除合同及违约金调减。",
      tags: ["租赁合同", "违约金调减", "深圳裁判尺度"],
    },
    {
      id: "case-equity-repurchase",
      title: "股权回购对赌条款履行案",
      meta: "公司争议 · 广东高院 · 再审审查",
      status: "approved",
      owner: "林律师",
      summary: "投资人要求创始人履行回购义务，法院围绕履行条件和减资程序作出区分。",
      tags: ["股权回购", "对赌", "公司法"],
    },
  ],
  items: [
    {
      id: "ingest-lease-arrears",
      ref: "Intake #1",
      title: "深圳商业租赁欠租解除案",
      category: "民商事",
      status: "needs_review",
      owner: "张律师",
      risk: ["privacy", "business_secret"],
      summary: "AI 已完成脱敏、事实结构化和争议焦点标注；需复核租户经营数据是否属于商业秘密。",
      body: "争议焦点：疫情期间租金减免抗辩是否影响解除权；裁判倾向：逾期付款持续且催告后未补正时支持解除。",
      recommendation: "批准入库，但保留裁判逻辑与法律适用，删除具体经营流水和个人联系方式。",
      proposed_action: "approve_case_ingest",
      draft:
        "裁判规则摘要：承租人长期欠租并经催告后仍未补正的，出租人解除合同请求通常获得支持；违约金可结合履行情况、损失证明和过错程度调减。",
      evidence: ["已替换当事人姓名", "已删除手机号和银行账号", "经营流水仍需人工复核"],
      fields: {
        cause: "租赁合同纠纷",
        court: "深圳市中级人民法院",
        outcome: "部分支持出租方",
      },
    },
    {
      id: "ingest-equity-repurchase",
      ref: "Intake #2",
      title: "股权回购对赌条款履行案",
      category: "公司争议",
      status: "approved",
      owner: "林律师",
      risk: ["legal"],
      summary: "元数据完整，裁判规则和承办律师署名已复核。",
      body: "法院区分投资人与目标公司、股东之间的回购责任，并审查减资程序对可履行性的影响。",
      recommendation: "纳入公司争议专题，作为对赌条款履行与回购条件检索样本。",
      proposed_action: "approve_case_ingest",
      draft: "入库摘要：对赌回购条款效力与履行需结合责任主体、触发条件和公司资本维持规则判断。",
      evidence: ["承办律师授权标注", "案由和程序字段完整", "未检出高风险 PII"],
      fields: {
        cause: "股权转让纠纷",
        court: "广东省高级人民法院",
        outcome: "驳回再审申请",
      },
    },
  ],
  checks: [
    {
      id: "chk-pii",
      label: "PII redaction",
      status: "warn",
      detail: "One business metric snippet needs reviewer confirmation.",
    },
    {
      id: "chk-taxonomy",
      label: "Required taxonomy",
      status: "pass",
      detail: "Cause, court, procedure, lawyers, outcome, issues, and holding are present.",
    },
    {
      id: "chk-source",
      label: "Source coverage",
      status: "pass",
      detail: "Facts, reasoning, and legal basis cite source paragraphs.",
    },
  ],
  activity_log: [
    {
      at: "2026-07-07T09:00:00.000Z",
      actor: "kelly-legal-casebase-ingest",
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
