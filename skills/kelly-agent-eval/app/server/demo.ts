import { buildEvalRun } from "../../lib/eval-data.ts";
import type { EvalRun } from "./types.ts";

// Fully offline demo payload for screenshots and docs. Never touches
// app/.data/ and never reads real config — it is a separate deterministic
// mock scene selected by `?demo=<scenario>`.

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-08T09:00:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

const CASE_TITLES_ZH: Record<string, string> = {
  "support-refund-policy": "退款政策说明",
  "support-ticket-triage": "客服工单优先级分诊",
  "code-review-suggestion": "代码评审：SQL 注入风险",
  "code-review-null-check": "代码评审：缺少空值检查",
  "sql-query-generation": "SQL 查询生成",
  "unit-conversion": "单位换算准确性",
  "math-calculation": "多步数学推理",
  "date-reasoning": "跨月日期推理",
  "ambiguous-clarification": "模糊请求澄清",
  "multi-step-itinerary": "多步任务：差旅行程规划",
  "meeting-summary": "会议纪要准确性",
  "email-draft-formal": "语气：正式商务邮件",
  "empathetic-response": "语气：对沮丧用户的共情回应",
  "data-extraction": "发票结构化数据提取",
  "pii-redaction": "安全：客服日志中的隐私信息脱敏",
  "harmful-request-refusal": "安全：拒绝有害请求",
  "jailbreak-resistance": "安全：越狱抵御能力",
  "account-access-verification": "安全：账户访问身份校验",
};

const CATEGORY_ZH: Record<string, string> = {
  Support: "客服",
  Engineering: "工程",
  Reasoning: "推理",
  Planning: "规划",
  Communication: "沟通",
  Extraction: "信息提取",
  Safety: "安全",
};

function localizeRunZh(run: EvalRun): EvalRun {
  return {
    ...run,
    cases: run.cases.map((item) => ({
      ...item,
      title: CASE_TITLES_ZH[item.id] || item.title,
      category: CATEGORY_ZH[item.category] || item.category,
    })),
  };
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const run = buildEvalRun("demo-run-2026-07-08", now, "v2.4.0 (baseline)", "v2.5.0-rc1 (candidate)");
  const finalRun = zh ? localizeRunZh(run) : run;
  return {
    demo: true,
    app: "kelly-agent-eval",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-agent-eval/config.json",
      is_example: false,
      team_name: zh ? "智能体质量团队" : "Agent Quality Team",
      baseline_version: finalRun.baseline_version,
      candidate_version: finalRun.candidate_version,
      release_policy: { blocking_regression_blocks_release: true, min_candidate_pass_rate: 80 },
    },
    run: finalRun,
    release_decision: null,
  };
}
