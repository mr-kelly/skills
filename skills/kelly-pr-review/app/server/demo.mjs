const now = "2026-06-18T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const allItems = demoItems();
  const repo = String(query.repo || "all");
  const mode = String(query.mode || "all");
  const search = String(query.q || "").toLowerCase().trim();
  const repoItems = repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
  let items = repoItems.filter((item) => mode === "all" || (mode === "tested" ? item.tested : item.status === mode));
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
    config_summary: demoConfig(),
    execution_report: {},
    lock: { locked: false }
  };
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
    tested: items.filter((item) => item.tested).length
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
      status: "approved",
      proposed_action: "approve",
      reason: "Docs match the current UI and include the safety boundary.",
      risk: ["docs"],
      labels: ["documentation"],
      changed_files: ["docs/support-approval.md", "docs/screenshots/email-demo.png"],
      additions: 96,
      deletions: 8,
      comments_count: 0,
      checks: "passing",
      updated_at: "2026-06-17T16:05:00.000Z",
      tested: true,
      tested_at: "2026-06-17T16:12:00.000Z",
      review_body: "Approved. Clear explanation of local decisions and final execution.",
      decision: { action: "approve", approved_for_execution: true, decided_at: "2026-06-17T16:10:00.000Z" }
    },
    {
      id: "northstar/sdk#31",
      review_ref: "Review #4",
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
      review_ref: "Review #5",
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
