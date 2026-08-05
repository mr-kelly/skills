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
} from "../casebase-model.js?v=0.1.0";
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";

const RAW_SNAPSHOT = {
  schema_version: "1",
  generated_at: "2026-07-07T09:00:00.000Z",
  source: "kelly-legal-casebase-ingest",
  workspace: {
    title: APP_TITLE,
    title_zh: APP_TITLE_ZH,
    subtitle: APP_SUBTITLE,
    subtitle_zh: APP_SUBTITLE_ZH,
    firm: "泰和泰（深圳）律师事务所 · demo",
    jurisdiction: "Shenzhen / Guangdong",
  },
  metrics: {
    source_docs: 8,
    pii_warnings: 1,
    duplicate_candidates: 1,
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
      metrics: { case_count: 18, pii_flags: 1, source_refs: 14 },
    },
    {
      id: "case-equity-repurchase",
      title: "股权回购对赌条款履行案",
      meta: "公司争议 · 广东高院 · 再审审查",
      status: "approved",
      owner: "林律师",
      summary: "投资人要求创始人履行回购义务，法院围绕履行条件和减资程序作出区分。",
      tags: ["股权回购", "对赌", "公司法"],
      metrics: { case_count: 9, pii_flags: 0, source_refs: 11 },
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
        procedure: "二审",
        outcome: "部分支持出租方",
        paragraphs: ["事实 3", "本院认为 2", "判项 1"],
        extraction_confidence: 0.91,
        duplicate_score: 0.22,
        ingest_bucket: "商业租赁专题",
        pii_cleared: true,
        parties_redacted: true,
        contacts_redacted: true,
      },
      created_at: "2026-07-05T02:00:00.000Z",
      updated_at: "2026-07-07T08:40:00.000Z",
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
        procedure: "再审审查",
        outcome: "驳回再审申请",
        paragraphs: ["争议焦点 1", "裁判理由 4"],
        extraction_confidence: 0.96,
        duplicate_score: 0.08,
        ingest_bucket: "公司争议专题",
        pii_cleared: true,
        parties_redacted: true,
        contacts_redacted: true,
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
      id: "chk-pii",
      label: "PII redaction",
      status: "warn",
      detail: "One business metric snippet needs reviewer confirmation.",
      item_id: "ingest-lease-arrears",
      severity: "warning",
    },
    {
      id: "chk-taxonomy",
      label: "Required taxonomy",
      status: "pass",
      detail: "Cause, court, procedure, lawyers, outcome, issues, and holding are present.",
      item_id: "ingest-lease-arrears",
      severity: "warning",
    },
    {
      id: "chk-source",
      label: "Source coverage",
      status: "pass",
      detail: "Facts, reasoning, and legal basis cite source paragraphs.",
      item_id: "ingest-equity-repurchase",
      severity: "warning",
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
};

function demoSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(RAW_SNAPSHOT));
  snapshot.metrics = recomputeMetrics(snapshot.items, snapshot.checks, snapshot.metrics);
  return snapshot;
}

function demoConfigSummary() {
  return {
    config_path: "demo://kelly-legal-casebase-ingest/config.json",
    is_example: false,
    firm_profile: {
      firm_name: "泰和泰（深圳）律师事务所",
      branch: "Shenzhen",
      reviewer_role: "casebase working group",
      default_jurisdictions: ["Guangdong", "Shenzhen"],
    },
    ingestion: {
      allowed_document_types: ["judgment", "ruling_with_substantive_reasoning", "arbitral_award"],
    },
    anonymization: {
      standard: "people-court-casebase-aligned",
      require_party_redaction: true,
      require_business_secret_review: true,
      sample_rate: 0.2,
    },
    taxonomy: {
      required_fields: ["cause", "court", "procedure", "lawyers", "outcome", "issues", "holding"],
    },
    export: { format: "json+markdown+csv", out_dir: "exports/case-records" },
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
