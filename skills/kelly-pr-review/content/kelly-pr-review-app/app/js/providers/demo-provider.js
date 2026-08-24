import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same ids, same copy, same risk/label/review-body text)
// from the retired app/server/demo.ts's demoItems()/demoItemsZh() — routed
// through pr-review-model.js's buildSnapshot() so the demo path exercises
// the exact same normalization/bucketing code as the real Busabase provider.
// created_at values are synthetic (the retired demo.ts had no created_at
// field at all — review_ref was hardcoded per item); they only exist here to
// make buildSnapshot()'s created_at-ordered review_ref numbering reproduce
// the original's "Review #1".."Review #6" order.
import { buildSnapshot } from "../pr-review-model.js?v=0.1.0";

function demoRows() {
  return [
    {
      item_id: "northstar/app#42",
      repo: "northstar/app",
      number: 42,
      title: "Refine billing webhook retry handling",
      author: "octocat",
      url: "https://github.com/example/northstar-app/pull/42",
      summary: "Adds idempotency keys and jittered retries for billing webhook delivery.",
      status: "needs_review",
      proposed_action: "comment",
      reason: "Billing logic changed; leave a review note unless duplicate delivery tests are confirmed.",
      risk: ["billing", "retry"],
      labels: ["backend", "billing"],
      changed_files: ["src/billing/webhooks.ts", "src/billing/retry-policy.ts", "test/billing/webhooks.test.ts"],
      additions: 214,
      deletions: 37,
      comments_count: 4,
      checks: "passing",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-18T08:40:00.000Z",
      review_body:
        "Thanks. I reviewed the retry flow. Please double-check idempotency around duplicate webhook delivery before we approve this.",
      patch_excerpt:
        "@@ retryWebhookDelivery\n+ const retryKey = `${event.id}:${attempt}`;\n+ await queue.enqueue({ retryKey, jitterMs });\n",
    },
    {
      item_id: "northstar/app#57",
      repo: "northstar/app",
      number: 57,
      title: "Add demo mode to local review desks",
      author: "mona",
      url: "https://github.com/example/northstar-app/pull/57",
      summary: "Adds ?demo=1 mock data support for screenshots and onboarding.",
      status: "to_approve",
      proposed_action: "approve",
      reason: "Implementation is isolated to local UI routes and avoids real queue data.",
      risk: ["privacy", "docs"],
      labels: ["frontend", "demo"],
      changed_files: ["app/server/demo.ts", "app/server/routes.ts", "app/app.js", "README.md"],
      additions: 386,
      deletions: 12,
      comments_count: 1,
      checks: "passing",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-18T07:25:00.000Z",
      review_body:
        "Looks good. Demo mode keeps docs screenshots isolated from local data and keeps writes as mock responses.",
    },
    {
      item_id: "northstar/docs#18",
      repo: "northstar/docs",
      number: 18,
      title: "Document approval workflow for support replies",
      author: "hubot",
      url: "https://github.com/example/northstar-docs/pull/18",
      summary: "Documents the support queue, review note field, and final execution step.",
      status: "merged",
      proposed_action: "no_action",
      reason: "Merged PR has local human test verification recorded.",
      risk: ["docs"],
      labels: ["documentation"],
      changed_files: ["docs/support-approval.md", "docs/screenshots/email-demo.png"],
      additions: 96,
      deletions: 8,
      comments_count: 0,
      checks: "passing",
      state: "closed",
      merged: true,
      merged_at: "2026-06-17T16:08:00.000Z",
      created_at: "2026-06-12T00:00:00.000Z",
      updated_at: "2026-06-17T16:05:00.000Z",
      tested: true,
      tested_at: "2026-06-17T16:12:00.000Z",
      test_note: "Verified docs render locally after merge.",
      review_body: "Approved. Clear explanation of local decisions and final execution.",
      decision_action: "approve",
      decided_at: "2026-06-17T16:10:00.000Z",
    },
    {
      item_id: "northstar/app#63",
      repo: "northstar/app",
      number: 63,
      title: "Polish merged dashboard settings flow",
      author: "alex",
      url: "https://github.com/example/northstar-app/pull/63",
      summary: "Merged settings polish waiting for manual test verification.",
      status: "merged",
      proposed_action: "no_action",
      reason: "Merged PR is waiting for human test verification.",
      risk: ["frontend"],
      labels: ["frontend"],
      changed_files: ["app/settings/SettingsPanel.tsx"],
      additions: 74,
      deletions: 18,
      comments_count: 1,
      checks: "passing",
      state: "closed",
      merged: true,
      merged_at: "2026-06-18T06:45:00.000Z",
      created_at: "2026-06-13T00:00:00.000Z",
      updated_at: "2026-06-18T06:45:00.000Z",
      review_body: "",
    },
    {
      item_id: "northstar/sdk#31",
      repo: "northstar/sdk",
      number: 31,
      title: "Expose batch validation helper",
      author: "dependabot",
      url: "https://github.com/example/northstar-sdk/pull/31",
      summary: "Exports a helper for validating handoff batch shape before rendering.",
      status: "blocked",
      proposed_action: "block",
      reason: "Blocked until generated type definitions are updated.",
      risk: ["types"],
      labels: ["sdk"],
      changed_files: ["packages/sdk/src/validate.ts", "packages/sdk/test/validate.test.ts"],
      additions: 58,
      deletions: 5,
      comments_count: 2,
      checks: "failing",
      created_at: "2026-06-14T00:00:00.000Z",
      updated_at: "2026-06-17T11:15:00.000Z",
      review_body: "Blocking for now: generated declarations are stale.",
      decision_action: "block",
      decision_note: "Regenerate type definitions before approval.",
      decided_at: "2026-06-17T11:25:00.000Z",
    },
    {
      item_id: "northstar/docs#22",
      repo: "northstar/docs",
      number: 22,
      title: "Refresh onboarding screenshots",
      author: "alex",
      url: "https://github.com/example/northstar-docs/pull/22",
      summary: "Replaces old screenshots with English demo-mode captures.",
      status: "done",
      proposed_action: "no_action",
      reason: "Already executed after local approval.",
      risk: ["docs"],
      labels: ["documentation"],
      changed_files: ["README.md", "docs/screenshots/content-demo.png", "docs/screenshots/pr-demo.png"],
      additions: 12,
      deletions: 6,
      comments_count: 0,
      checks: "passing",
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-16T13:30:00.000Z",
      review_body: "Executed.",
      decision_action: "no_action",
      decided_at: "2026-06-16T13:35:00.000Z",
      execution_status: "executed",
      execution_detail: JSON.stringify({ action: "no_action", executed_at: "2026-06-16T13:40:00.000Z" }),
    },
  ];
}

// Chinese-language overrides, ported verbatim from demo.ts's demoItemsZh().
const ZH_OVERRIDES = {
  "northstar/app#42": {
    title: "优化计费 webhook 重试处理",
    summary: "为计费 webhook 增加幂等 key 和带抖动的重试策略。",
    reason: "计费逻辑有变化；批准前需要确认重复投递测试。",
    review_body: "我看过重试流程了。批准前请再确认重复 webhook 投递时的幂等处理。",
  },
  "northstar/app#57": {
    title: "给本地 review desk 增加 demo 模式",
    summary: "增加 ?demo=1 mock data，用于截图和 onboarding。",
    reason: "实现只影响本地 UI routes，避免读取真实队列数据。",
    review_body: "看起来可以。Demo 模式把文档截图和本地真实数据隔离开了。",
  },
  "northstar/docs#18": {
    title: "记录 support 回复审批流程",
    summary: "说明 support queue、review note 字段和最终执行步骤。",
    reason: "已合并 PR 有本地人工测试记录。",
    review_body: "已批准。说明清楚表达了本地 decision 和最终执行边界。",
    test_note: "合并后已在本地验证文档可渲染。",
  },
  "northstar/app#63": {
    title: "完善已合并 dashboard 设置流程",
    summary: "已合并的设置页 polish，等待人工测试确认。",
    reason: "已合并 PR 正在等待人工测试验证。",
  },
  "northstar/sdk#31": {
    title: "暴露 batch validation helper",
    summary: "导出 handoff batch shape 的验证 helper，渲染前可检查数据。",
    reason: "阻塞，直到重新生成 type definitions。",
    review_body: "先阻塞：生成的 declarations 已经过期。",
    decision_note: "批准前请重新生成 type definitions。",
  },
  "northstar/docs#22": {
    title: "刷新 onboarding 截图",
    summary: "把旧截图替换成中文 demo-mode 截图。",
    reason: "本地批准后已经执行。",
    review_body: "已执行。",
  },
};

function demoRowsForLang(zh) {
  const rows = demoRows();
  if (!zh) return rows;
  return rows.map((row) => ({ ...row, ...(ZH_OVERRIDES[row.item_id] || {}) }));
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

function demoConfigSummary(zh) {
  return {
    reader: "demo",
    configured: true,
    source: zh ? "模拟数据" : "mock data",
    reviewer: { handle: "@alex", display_name: "Alex Rivera" },
    repos: [
      { repo: "northstar/app", label: "Northstar App", include: true },
      { repo: "northstar/docs", label: "Northstar Docs", include: true },
      { repo: "northstar/sdk", label: "Northstar SDK", include: true },
    ],
    query: { review_requested: true },
    review_policy: {
      default_action: "comment",
      include_patch_excerpt: true,
      max_patch_chars: 12000,
      large_diff_changed_files: 25,
      large_diff_additions: 1500,
    },
    style: { tone: zh ? "具体、友好、简洁" : "specific, kind, concise" },
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const zh = activeLangIsZh();
    const snapshot = buildSnapshot({ records: demoRowsForLang(zh) });
    return {
      app: "kelly-pr-review",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: snapshot.generated_at, config_version: "demo" },
      lock: { locked: false },
      config_summary: demoConfigSummary(zh),
      demo_visuals: demoVisualsForApp("kelly-pr-review"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-pr-review") },
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async saveDraft() {
    throw new Error("Demo mode is read-only.");
  },

  async setTested() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
