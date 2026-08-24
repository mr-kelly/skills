import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same ids, same batch_id, same copy) from the retired
// app/server/demo.ts's demoState()/localizeZh() `distribution` array — the
// only Busabase-durable stage per the retired SKILL.md ("The ideation
// stages [topics/todos/main_content] ... are local-only"). Routed through
// writer-model.js's buildSnapshot() so the demo path exercises the exact
// same normalization/bucketing code as the real Busabase provider.
import { buildSnapshot } from "../writer-model.js?v=0.1.0";

const NOW = "2026-06-18T09:30:00.000Z";
const BATCH_ID = "demo-content-20260618";
const CANONICAL_IDEA = "A practical launch guide for a local-first AI workflow";
const SOURCE_SUMMARY =
  "The source article explains how a small team can use local review queues, approval gates, and channel-specific publishing drafts without exposing private customer data.";

function demoRows() {
  return [
    {
      draft_id: "dist-blog",
      ref: 1,
      batch_id: BATCH_ID,
      channel: "official_blog",
      format: "article",
      title: "Build the approval desk before you automate the action",
      summary: "Canonical article for teams designing local-first AI workflows.",
      body: "A local approval desk gives teams speed without surrendering control. Start with a queue, show the recommendation, keep edits local, and execute only after an explicit approval.",
      hook: "",
      cta: "Use this pattern for the next workflow that touches customer data.",
      hashtags: [],
      title_options: [
        "Build the approval desk before you automate the action",
        "Local-first agents need review desks, not black boxes",
      ],
      media_brief: "Diagram: source article -> local review queue -> approved channel exports.",
      source_notes: [],
      risk: [],
      canonical_idea: CANONICAL_IDEA,
      source_summary: SOURCE_SUMMARY,
      export_filename: "01-official_blog.md",
      status: "needs_review",
      created_at: NOW,
      decision_note: "",
      decided_at: "",
    },
    {
      draft_id: "dist-linkedin",
      ref: 2,
      batch_id: BATCH_ID,
      channel: "linkedin",
      format: "post",
      title: "The approval desk is where AI work becomes team work",
      summary: "Short professional post for operators and founders.",
      body: "The best AI workflow I have seen lately is deliberately boring: generate a batch, review it locally, approve the next action, then execute. That small approval layer is what turns an agent from clever demo into usable operations.",
      hook: "",
      cta: "What is the first workflow where you would add a review desk?",
      hashtags: ["#AI", "#Operations", "#Workflow"],
      title_options: [],
      media_brief: "Screenshot carousel with queue, detail pane, and approval buttons.",
      source_notes: [],
      risk: [],
      canonical_idea: CANONICAL_IDEA,
      source_summary: SOURCE_SUMMARY,
      export_filename: "02-linkedin.md",
      status: "to_approve",
      created_at: NOW,
      decision_note: "",
      decided_at: "",
    },
    {
      draft_id: "dist-newsletter",
      ref: 3,
      batch_id: BATCH_ID,
      channel: "newsletter",
      format: "email",
      title: "A calmer way to ship AI-assisted work",
      summary: "Newsletter version with a practical checklist.",
      body: "This week: a pattern for AI-assisted work that does not require blind trust. Keep the batch local, show every recommendation, preserve the draft, and make approval a file-backed decision.",
      hook: "",
      cta: "Reply with the workflow you want to put behind an approval gate.",
      hashtags: ["#AI", "#Review"],
      title_options: [],
      media_brief: "Simple checklist graphic.",
      source_notes: [],
      risk: [],
      canonical_idea: CANONICAL_IDEA,
      source_summary: SOURCE_SUMMARY,
      export_filename: "03-newsletter.md",
      status: "approved",
      created_at: NOW,
      decision_note: "Ready for export.",
      decided_at: NOW,
    },
    {
      draft_id: "dist-x",
      ref: 4,
      batch_id: BATCH_ID,
      channel: "x",
      format: "thread",
      title: "Agents need approval desks",
      summary: "Thread draft for concise distribution.",
      body: "A useful agent workflow has two separate moments: prepare the work, then execute the approved action. Mixing those together is how teams lose trust.",
      hook: "",
      cta: "Build the review queue first.",
      hashtags: ["#AI", "#LocalFirst"],
      title_options: [],
      media_brief: "No image; keep it text-first.",
      source_notes: [],
      risk: [],
      canonical_idea: CANONICAL_IDEA,
      source_summary: SOURCE_SUMMARY,
      export_filename: "04-x.md",
      status: "needs_review",
      created_at: NOW,
      decision_note: "",
      decided_at: "",
    },
  ];
}

// Chinese-language overrides, ported verbatim from demo.ts's localizeZh().
const ZH_OVERRIDES = {
  "dist-blog": {
    title: "先搭审批台，再自动执行动作",
    summary: "给正在设计本地优先 AI 工作流团队的主文章。",
    body: "本地审批台让团队获得速度，同时不交出控制权。先建立队列，显示建议，保留本地编辑，只在明确批准后执行。",
    cta: "把这个模式用于下一个会接触客户数据的工作流。",
    title_options: ["先搭审批台，再自动执行动作", "本地优先智能体需要复核台，不需要黑盒"],
    media_brief: "图示：源文章 -> 本地复核队列 -> 已批准的渠道导出。",
  },
  "dist-linkedin": {
    title: "审批台让 AI 工作变成团队工作",
    summary: "面向运营和创始人的短 LinkedIn 帖子。",
    body: "我最近看到最好的 AI 工作流其实很朴素：生成批次，本地复核，批准下一步，再执行。这个小小的审批层，才让智能体从聪明演示变成可用运营工具。",
    cta: "你会先把哪个工作流放到审批台后面？",
    media_brief: "截图轮播：队列、详情面板和审批按钮。",
    hashtags: ["#AI", "#运营", "#工作流"],
  },
  "dist-newsletter": {
    title: "一种更安静地交付 AI 辅助工作的方式",
    summary: "带实用 checklist 的 newsletter 版本。",
    body: "本周：一个不需要盲目信任的 AI 辅助工作模式。批次留在本地，展示每条建议，保留草稿，并把审批保存成文件记录。",
    cta: "回复我：你想把哪个工作流放进审批门？",
    media_brief: "简洁 checklist 图。",
    hashtags: ["#AI", "#复核"],
    decision_note: "可以导出。",
  },
  "dist-x": {
    title: "智能体需要审批台",
    summary: "更短的串文草稿。",
    body: "有用的智能体工作流有两个独立时刻：准备工作，然后执行已批准动作。把两者混在一起，团队很快会失去信任。",
    cta: "先搭复核队列。",
    media_brief: "不配图，保持文字优先。",
    hashtags: ["#AI", "#本地优先"],
  },
};

function demoRowsForLang(zh) {
  const rows = demoRows();
  if (!zh) return rows;
  return rows.map((row) => ({ ...row, ...(ZH_OVERRIDES[row.draft_id] || {}) }));
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

function demoConfigSummary(zh) {
  return {
    config_path: zh ? "演示数据" : "demo data",
    is_example: false,
    brand: { name: zh ? "示例品牌" : "Example Brand", voice: zh ? "清晰、实用、具体" : "clear, useful, specific" },
    audience: zh ? "创始人与运营团队" : "founders and operators",
    official_urls: { homepage: "https://example.com" },
    default_cta: { soft: zh ? "先收藏，后续再看。" : "Save this for later." },
    channels: {
      official_blog: { language: "en" },
      xiaohongshu: { language: "zh-CN" },
      wechat: { language: "zh-CN" },
      newsletter: { language: "en" },
      linkedin: { language: "en" },
      x: { language: "en" },
    },
    risk_terms: { unsupported: ["guaranteed", "best", "only", "100%"] },
    export: { approved_only: true, format: "markdown" },
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const zh = activeLangIsZh();
    const snapshot = buildSnapshot({ drafts: demoRowsForLang(zh) });
    snapshot.generated_at = NOW;
    snapshot.source = "kelly-writer-demo";
    return {
      app: "kelly-writer",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: { locked: false },
      config_summary: demoConfigSummary(zh),
      decisions: {},
      demo_visuals: demoVisualsForApp("kelly-writer"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-writer") },
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
