const now = "2026-06-18T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const zh = String(query.lang || "").toLowerCase().startsWith("zh");
  const allItems = zh ? demoItemsZh() : demoItems();
  const repo = String(query.repo || "all");
  const mode = String(query.mode || "all");
  const search = String(query.q || "").toLowerCase().trim();
  const repoItems = repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
  let items = repoItems.filter((item) => mode === "all" || (mode === "needs_test" ? item.verification_status === "needs_test" : mode === "tested" ? item.verification_status === "tested" : item.status === mode));
  if (search) {
    items = items.filter((item) => `${item.review_ref} ${item.repo} ${item.number} ${item.title} ${item.author} ${item.summary}`.toLowerCase().includes(search));
  }
  return {
    demo: true,
    app: "kelly-pr-review",
    batch: {
      batch_id: "demo-pr-review-20260618",
      generated_at: now,
      updated_at: now,
      source: "demo",
      mode: "app-in-skill",
      metrics: countByStatus(allItems)
    },
    counts: countByStatus(repoItems),
    repos: reposFor(allItems),
    selected_repo: repo,
    items,
    total_cached: repoItems.length,
    total_all_repos: allItems.length,
    batch_path: "demo://kelly-pr-review/current_batch.json",
    decisions_path: "demo://kelly-pr-review/decisions.json",
    execution_report_path: "demo://kelly-pr-review/execution_report.json",
    config_summary: zh ? demoConfigZh() : demoConfig(),
    execution_report: {},
    lock: { locked: false }
  };
}

function demoConfigZh() {
  const config = demoConfig();
  config.source = "模拟数据";
  config.onboarding.message = "Demo 模式只使用模拟 PR。";
  config.reviewer.display_name = "Alex Rivera";
  config.repos = [
    { repo: "northstar/app", label: "Northstar App", include: true },
    { repo: "northstar/docs", label: "Northstar Docs", include: true },
    { repo: "northstar/sdk", label: "Northstar SDK", include: true }
  ];
  config.style.tone = "具体、友好、简洁";
  return config;
}

function demoItemsZh() {
  return demoItems().map((item) => {
    const zh = {
      "northstar/app#42": {
        title: "优化计费 webhook 重试处理",
        summary: "为计费 webhook 增加幂等 key 和带抖动的重试策略。",
        reason: "计费逻辑有变化；批准前需要确认重复投递测试。",
        review_body: "我看过重试流程了。批准前请再确认重复 webhook 投递时的幂等处理。"
      },
      "northstar/app#57": {
        title: "给本地 review desk 增加 demo 模式",
        summary: "增加 ?demo=1 mock data，用于截图和 onboarding。",
        reason: "实现只影响本地 UI routes，避免读取真实队列数据。",
        review_body: "看起来可以。Demo 模式把文档截图和本地真实数据隔离开了。"
      },
      "northstar/docs#18": {
        title: "记录 support 回复审批流程",
        summary: "说明 support queue、review note 字段和最终执行步骤。",
        reason: "已合并 PR 有本地人工测试记录。",
        review_body: "已批准。说明清楚表达了本地 decision 和最终执行边界。",
        test_note: "合并后已在本地验证文档可渲染。"
      },
      "northstar/app#63": {
        title: "完善已合并 dashboard 设置流程",
        summary: "已合并的设置页 polish，等待人工测试确认。",
        reason: "已合并 PR 正在等待人工测试验证。"
      },
      "northstar/sdk#31": {
        title: "暴露 batch validation helper",
        summary: "导出 handoff batch shape 的验证 helper，渲染前可检查数据。",
        reason: "阻塞，直到重新生成 type definitions。",
        review_body: "先阻塞：生成的 declarations 已经过期。",
        decision: { action: "block", comment: "批准前请重新生成 type definitions。", decided_at: "2026-06-17T11:25:00.000Z" }
      },
      "northstar/docs#22": {
        title: "刷新 onboarding 截图",
        summary: "把旧截图替换成中文 demo-mode 截图。",
        reason: "本地批准后已经执行。",
        review_body: "已执行。"
      }
    }[item.id];
    return zh ? { ...item, ...zh } : item;
  });
}

export function demoDecisionResponse(body = {}) {
  const ids = (body.ids || [body.id]).filter(Boolean).map(String);
  return {
    demo: true,
    changed: ids,
    decisions: ids.length,
    message: "Demo mode: no PR review files were changed."
  };
}

function countByStatus(items) {
  return {
    needs_review: items.filter((item) => item.status === "needs_review").length,
    to_approve: items.filter((item) => item.status === "to_approve").length,
    approved: items.filter((item) => item.status === "approved").length,
    done: items.filter((item) => item.status === "done").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    needs_test: items.filter((item) => item.verification_status === "needs_test").length,
    tested: items.filter((item) => item.verification_status === "tested").length
  };
}

function reposFor(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.repo, (counts.get(item.repo) || 0) + 1);
  return Array.from(counts.entries()).map(([repo, count]) => ({ repo, count }));
}

function demoConfig() {
  return {
    reader: "demo",
    configured: true,
    source: "mock data",
    default_mode: false,
    onboarding: { configured: true, state: "demo", message: "Demo mode uses mock pull requests only." },
    reviewer: { handle: "@alex", display_name: "Alex Rivera" },
    repos: [
      { repo: "northstar/app", label: "Northstar App", include: true },
      { repo: "northstar/docs", label: "Northstar Docs", include: true },
      { repo: "northstar/sdk", label: "Northstar SDK", include: true }
    ],
    query: { review_requested: true },
    review_policy: {
      default_action: "comment",
      include_patch_excerpt: true,
      max_patch_chars: 12000,
      large_diff_changed_files: 25,
      large_diff_additions: 1500
    },
    style: { tone: "specific, kind, concise" }
  };
}

function demoItems() {
  return [
    {
      id: "northstar/app#42",
      review_ref: "Review #1",
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
      updated_at: "2026-06-18T08:40:00.000Z",
      review_body: "Thanks. I reviewed the retry flow. Please double-check idempotency around duplicate webhook delivery before we approve this.",
      patch_excerpt: "@@ retryWebhookDelivery\n+ const retryKey = `${event.id}:${attempt}`;\n+ await queue.enqueue({ retryKey, jitterMs });\n"
    },
    {
      id: "northstar/app#57",
      review_ref: "Review #2",
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
      changed_files: ["app/server/demo.mjs", "app/server/routes.mjs", "app/app.js", "README.md"],
      additions: 386,
      deletions: 12,
      comments_count: 1,
      checks: "passing",
      updated_at: "2026-06-18T07:25:00.000Z",
      review_body: "Looks good. Demo mode keeps docs screenshots isolated from local data and keeps writes as mock responses.",
      decision: {}
    },
    {
      id: "northstar/docs#18",
      review_ref: "Review #3",
      repo: "northstar/docs",
      number: 18,
      title: "Document approval workflow for support replies",
      author: "hubot",
      url: "https://github.com/example/northstar-docs/pull/18",
      summary: "Documents the support queue, review note field, and final execution step.",
      status: "merged",
      verification_status: "tested",
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
      updated_at: "2026-06-17T16:05:00.000Z",
      tested: true,
      tested_at: "2026-06-17T16:12:00.000Z",
      test_note: "Verified docs render locally after merge.",
      test_evidence: [],
      review_body: "Approved. Clear explanation of local decisions and final execution.",
      decision: { action: "approve", approved_for_execution: true, decided_at: "2026-06-17T16:10:00.000Z" }
    },
    {
      id: "northstar/app#63",
      review_ref: "Review #4",
      repo: "northstar/app",
      number: 63,
      title: "Polish merged dashboard settings flow",
      author: "alex",
      url: "https://github.com/example/northstar-app/pull/63",
      summary: "Merged settings polish waiting for manual test verification.",
      status: "merged",
      verification_status: "needs_test",
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
      updated_at: "2026-06-18T06:45:00.000Z",
      review_body: ""
    },
    {
      id: "northstar/sdk#31",
      review_ref: "Review #5",
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
      updated_at: "2026-06-17T11:15:00.000Z",
      review_body: "Blocking for now: generated declarations are stale.",
      decision: { action: "block", comment: "Regenerate type definitions before approval.", decided_at: "2026-06-17T11:25:00.000Z" }
    },
    {
      id: "northstar/docs#22",
      review_ref: "Review #6",
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
      updated_at: "2026-06-16T13:30:00.000Z",
      review_body: "Executed.",
      decision: { action: "no_action", approved_for_execution: true, decided_at: "2026-06-16T13:35:00.000Z" },
      execution: { status: "executed", action: "no_action", executed_at: "2026-06-16T13:40:00.000Z" }
    }
  ];
}
