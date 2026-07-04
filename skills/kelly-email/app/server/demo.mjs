import { isApprovedForExecution, isBlocked, isDone, isNeedsReview } from "./workflow.mjs";

const now = "2026-06-18T09:30:00.000Z";
const scenarioUpdatedAt = {
  "needs-review": "2026-06-18T09:30:00.000Z",
  approved: "2026-06-18T09:42:00.000Z",
  done: "2026-06-18T09:55:00.000Z",
  mixed: now,
};

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = demoScenario(query);
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const allItems = withReviewNumbers(
    zh ? localizeItemsZh(demoItemsForScenario(scenario)) : demoItemsForScenario(scenario),
  );
  const mode = queryValue(query.mode, "all");
  const search = String(query.q || "")
    .toLowerCase()
    .trim();
  let items = allItems;
  if (mode !== "all") {
    if (mode === "needs_review") items = items.filter(isNeedsReview);
    else if (mode === "approved") items = items.filter(isApprovedForExecution);
    else if (mode === "done") items = items.filter(isDone);
    else if (mode === "blocked") items = items.filter(isBlocked);
    else items = items.filter((item) => item.status === mode);
  }
  if (search) {
    items = items.filter((item) =>
      `${item.review_ref} ${item.from} ${item.subject} ${item.summary}`.toLowerCase().includes(search),
    );
  }
  items.sort((a, b) => uidNumber(b) - uidNumber(a));
  const counts = countByStatus(allItems);
  counts.needs_review = allItems.filter(isNeedsReview).length;
  counts.to_approve = 0;
  counts.approved = allItems.filter(isApprovedForExecution).length;
  counts.done = allItems.filter(isDone).length;
  counts.blocked = allItems.filter(isBlocked).length;
  return {
    app: "kelly-email",
    demo: true,
    demo_scenario: scenario,
    batch: {
      batch_id: `demo-email-${scenario}-20260618`,
      generated_at: now,
      updated_at: scenarioUpdatedAt[scenario] || now,
      source: `demo:${scenario}`,
      last_scan: scenarioUpdatedAt[scenario] || now,
    },
    counts,
    items,
    total_cached: allItems.length,
    batch_path: "demo://kelly-email/current_batch.json",
    decisions_path: "demo://kelly-email/decisions.json",
    email_accounts: zh ? localizeAccountsZh(demoAccounts()) : demoAccounts(),
    lock: { locked: false },
  };
}

function localizeAccountsZh(accounts) {
  return {
    ...accounts,
    onboarding: { ...accounts.onboarding, message: "Demo 模式只使用模拟账号和邮件。" },
    profile: {
      ...accounts.profile,
      role: "创始人",
      default_reply_as: "Northstar 的 Alex",
      public_bio: "为运营团队构建本地优先 AI 工作流。",
      languages: ["中文", "英文"],
    },
    brands: accounts.brands.map((brand) => ({
      ...brand,
      description: "面向敏感工作流团队的本地优先 AI 工具。",
    })),
    style: {
      ...accounts.style,
      default_language: "zh-CN",
      tone: "温暖、准确、不过度营销",
      audience: "客户、合作伙伴和产品团队",
      paragraph_style: "短段落，每封邮件只有一个清楚下一步。",
      reply_rules: ["先确认请求，再承诺时间。", "不要透露私密路线图。", "优先写短回复，并给一个行动。"],
    },
    accounts: accounts.accounts.map((account) => ({
      ...account,
      display_name: "支持收件箱",
      identities: (account.identities || []).map((identity) => ({
        ...identity,
        display_name: "Alex 创始人",
      })),
    })),
    knowledge_base: {
      ...accounts.knowledge_base,
      usage: "用于支持和合作邮件的产品事实。",
      facts: ["Northstar 会把 review batch 留在本地。", "执行动作需要明确批准。", "Demo 模式不会读取真实邮件。"],
      do_not_say: ["不要声称已经通过 SOC2。", "不要承诺企业客户当天 onboarding。"],
    },
  };
}

function localizeItemsZh(items) {
  const map = {
    "demo-email-001": {
      from: "陈 Maya <maya@acme.example>",
      subject: "客服场景可以使用审批队列吗？",
      reason: "发件人在询问产品能力，需要一封准确且有边界的回复。",
      summary: "Maya 想确认本地审批工作流能否总结 support threads，同时保护客户数据隐私。",
      body_original:
        "你好 Alex，我们正在评估 AI support workflow。Northstar 能否在不把邮件内容发送到 hosted dashboard 的情况下，总结进入的客户线程？我们需要在回复发出前有人工审批步骤。",
      body_original_language: "zh-CN",
      suggested_reply:
        "Hi Maya，可以。复核批次可以留在你的机器上，界面只写入本地决定；只有当你明确要求智能体执行已批准回复时，才会发出动作。我也可以发你设置清单。",
      draft:
        "Hi Maya，可以。复核批次可以留在你的机器上，界面只写入本地决定；只有当你明确要求智能体执行已批准回复时，才会发出动作。我也可以发你设置清单。",
      review_brief: {
        user_language: "zh-CN",
        suggested_reply: "Hi Maya，可以。复核批次可以留在你的机器上...",
        background: "客户正在评估私密 AI support workflow。",
        why_review: "产品承诺需要准确、范围清楚。",
        recommendation: "起草简短回复，并提供 setup checklist。",
      },
      html: "<p>你好 Alex，</p><p>Northstar 能否在不把邮件内容发送到托管看板的情况下，总结进入的客户线程？</p><p>我们需要在回复发出前有人工审批步骤。</p>",
    },
    "demo-email-002": {
      from: "李 Jordan <jordan@partner.example>",
      subject: "本地优先 AI 线上分享大纲",
      reason: "合作方的信息同步邮件，内容已进入 content queue。",
      summary: "合作伙伴分享线上分享大纲，并请求一个轻量确认。",
      body_original: "大纲见附件。如果方向没问题，我们下周会开始官宣。",
      body_original_language: "zh-CN",
      html: "<p>大纲见附件。如果方向没问题，我们下周会开始官宣。</p>",
    },
    "demo-email-003": {
      from: "安全机器人 <alerts@example.test>",
      subject: "来自香港的新登录",
      reason: "安全相关邮件不应自动归档。",
      summary: "账户安全提醒，包含地点和浏览器信息。",
      body_original: "我们检测到一次来自香港、使用 macOS Chrome 的新登录。如果是你本人操作，则无需处理。",
      body_original_language: "zh-CN",
      html: "<p>我们检测到一次来自香港、使用 macOS Chrome 的新登录。</p>",
    },
    "demo-email-004": {
      from: "财务 Nina <nina@finance.example>",
      subject: "6 月工作区复核发票",
      reason: "财务相关邮件需要确认后再清理。",
      summary: "供应商发送发票，并询问 billing contact 是否需要变更。",
      body_original: "发票见附件。账单联系人继续使用 Alex Rivera，还是改成 operations@example.test？",
      body_original_language: "zh-CN",
      suggested_reply: "Hi Nina，6 月请先保留当前账单联系人。下次发票前如果需要变更，我会再确认。",
      draft: "Hi Nina，6 月请先保留当前账单联系人。下次发票前如果需要变更，我会再确认。",
    },
    "demo-email-005": {
      from: "产品更新 <updates@example.test>",
      subject: "6 月更新：审批、锁和导出",
      reason: "简报可以在复核后归档。",
      summary: "产品更新邮件，包含 changelog 链接。",
      body_original: "这个月我们增加了显式锁、更安全的导出和更完整的复核台。",
      body_original_language: "zh-CN",
      html: "<h1>6 月更新</h1><p>显式锁、更安全的导出和更完整的复核台。</p>",
    },
    "demo-email-006": {
      from: "Eli 工作室 <eli@studio.example>",
      subject: "关于截图安全 demo 数据的问题",
      reason: "隐私相关问题需要准确回答。",
      summary: "Eli 询问演示模式如何避免文档截图暴露真实队列数据。",
      body_original: "你们是否支持演示标记，确保文档截图永远不会显示真实客户邮件？",
      body_original_language: "zh-CN",
      suggested_reply: "支持。给应用 URL 加上 ?demo=1 后，服务会返回模拟批次，而不是读取本地缓存文件。",
      draft: "支持。给应用 URL 加上 ?demo=1 后，服务会返回模拟批次，而不是读取本地缓存文件。",
      html: "<p>你们是否支持演示标记，确保文档截图永远不会显示真实客户邮件？</p>",
    },
    "demo-email-007": {
      subject: "已归档：每日摘要完成",
      reason: "已由批准过的清理动作处理。",
      summary: "每日摘要在批准后已归档。",
      body_original: "摘要已成功归档。",
      body_original_language: "zh-CN",
    },
    "demo-email-008": {
      from: "未知发件人 <unknown@example.test>",
      subject: "紧急变更账户所有者",
      reason: "已阻止：发件人身份未验证。",
      summary: "请求变更所有者，并要求绕过常规确认。",
      body_original: "请今天变更所有者，并且不要通知当前管理员。",
      body_original_language: "zh-CN",
      execution: { status: "blocked", action: "archive", reason: "安全敏感请求需要人工验证。" },
    },
  };
  return items.map((item) => {
    const patch = map[item.id];
    const reviewPatch = item.review_number ? { review_ref: `复核 #${item.review_number}` } : {};
    if (!patch) return { ...item, ...reviewPatch };
    return {
      ...item,
      ...patch,
      ...reviewPatch,
      review_brief: patch.review_brief || item.review_brief,
      body_translation: "",
      body_translation_language: "",
    };
  });
}

function queryValue(value, fallback = "") {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? fallback);
}

function demoScenario(query = {}) {
  const value = queryValue(query.demo, "mixed").toLowerCase().trim();
  if (["review", "needs-review", "needs_review", "needs"].includes(value)) return "needs-review";
  if (["approved", "waiting", "waiting-approved", "waiting_approved"].includes(value)) return "approved";
  if (["done", "completed", "complete"].includes(value)) return "done";
  return "mixed";
}

function uidNumber(item) {
  return Number.parseInt(item.uid || "0", 10) || 0;
}

function withReviewNumbers(items) {
  const reviewItems = items.filter(isNeedsReview).sort((a, b) => uidNumber(b) - uidNumber(a));
  const byId = new Map(reviewItems.map((item, index) => [String(item.id), index + 1]));
  return items.map((item) => {
    const reviewNumber = byId.get(String(item.id)) || null;
    if (!reviewNumber) return { ...item, review_number: null, review_ref: "" };
    const prefix = String(item.body_original_language || item.review_brief?.user_language || "")
      .toLowerCase()
      .startsWith("zh")
      ? "复核"
      : "Review";
    return { ...item, review_number: reviewNumber, review_ref: `${prefix} #${reviewNumber}` };
  });
}

function countByStatus(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status || "unknown"] = (counts[item.status || "unknown"] || 0) + 1;
  }
  return counts;
}

function demoItemsForScenario(scenario) {
  const items = demoItems().slice(0, 6);
  if (scenario === "needs-review") return items.map(asNeedsReviewItem);
  if (scenario === "approved") return items.map(asApprovedItem);
  if (scenario === "done") return items.map(asDoneItem);
  return demoItems();
}

function asNeedsReviewItem(item, index) {
  return {
    ...item,
    status: "needs_review",
    proposed_action: proposedActionFor(item, index),
    review_number: null,
    review_ref: "",
    reason: needsReviewReasonFor(item, index),
    decision: {},
    execution: {},
    updated_at: "2026-06-18T09:30:00.000Z",
  };
}

function asApprovedItem(item, index) {
  const action = approvedActionFor(item, index);
  const status = action === "draft_reply" ? "draft_requested" : action === "send_reply" ? "drafted" : "prepared";
  return {
    ...item,
    status,
    proposed_action: action,
    review_number: null,
    review_ref: "",
    reason: approvedReasonFor(action),
    decision: { action, decided_at: "2026-06-18T09:42:00.000Z" },
    execution: {},
    updated_at: "2026-06-18T09:42:00.000Z",
  };
}

function asDoneItem(item, index) {
  const approved = asApprovedItem(item, index);
  const action = approved.decision.action;
  return {
    ...approved,
    status: "executed",
    execution: { status: "executed", action, executed_at: "2026-06-18T09:55:00.000Z" },
    updated_at: "2026-06-18T09:55:00.000Z",
  };
}

function proposedActionFor(item, index) {
  if (item.suggested_reply || item.draft) return index % 2 ? "send_reply" : "draft_reply";
  if (item.category === "security") return "review";
  if (item.category === "newsletter") return "archive";
  return item.proposed_action || "archive";
}

function approvedActionFor(item, index) {
  if (item.suggested_reply || item.draft) return index % 2 ? "send_reply" : "draft_reply";
  if (item.category === "security") return "mark_read";
  if (item.category === "money") return "draft_reply";
  return index % 3 === 0 ? "mark_read" : "archive";
}

function needsReviewReasonFor(item, index) {
  const reasons = [
    "Demo recording: this message still needs a human note or decision.",
    "Demo recording: the assistant is waiting for approval before taking action.",
    "Demo recording: this item has enough context, but the operator should choose the next step.",
  ];
  return item.reason || reasons[index % reasons.length];
}

function approvedReasonFor(action) {
  const labels = {
    archive: "Demo recording: approved for archive and waiting for execution.",
    mark_read: "Demo recording: approved to mark read and waiting for execution.",
    send_reply: "Demo recording: reply approved and waiting for execution.",
    draft_reply: "Demo recording: draft request approved and waiting for the assistant.",
  };
  return labels[action] || "Demo recording: approved and waiting for execution.";
}

export function demoDecisionResponse(body = {}) {
  const ids = (body.ids || [body.id]).filter(Boolean).map(String);
  return {
    demo: true,
    changed: ids,
    decisions: ids.length,
    message: "Demo mode: no local email files were changed.",
  };
}

function demoAccounts() {
  return {
    source: "demo",
    data_reader: "demo",
    data_provider: "mock",
    onboarding: { configured: true, state: "demo", message: "Demo mode uses mock accounts and messages." },
    profile: {
      display_name: "Alex Rivera",
      role: "Founder",
      company: "Northstar Labs",
      default_reply_as: "Alex at Northstar",
      languages: ["English", "Chinese"],
      public_bio: "Builds local-first AI workflows for operational teams.",
      contact_methods: [{ label: "Website", value: "https://example.test" }],
    },
    brands: [
      {
        brand_id: "northstar",
        name: "Northstar Labs",
        description: "Local-first AI tooling for teams with sensitive workflows.",
        homepage: "https://example.test",
        docs_url: "https://docs.example.test",
        support_url: "https://support.example.test",
      },
    ],
    official_urls: {
      homepage: "https://example.test",
      docs: "https://docs.example.test",
      support: "https://support.example.test",
    },
    style: {
      preset: "concise-founder",
      default_language: "en",
      tone: "warm, precise, low-hype",
      audience: "customers, partners, and product teams",
      max_reply_words: 140,
      paragraph_style: "Short paragraphs with one clear next step.",
      include_short_quote: true,
      signature_mode: "first-name",
      preferred_signoff: "Best",
      reply_rules: [
        "Confirm the request before promising timeline.",
        "Never expose private roadmap details.",
        "Prefer short replies with one action.",
      ],
      cta_urls: { calendar: "https://example.test/book", docs: "https://docs.example.test" },
    },
    knowledge_base: {
      enabled: true,
      usage: "Use product facts for support and partner replies.",
      facts: [
        "Northstar keeps review batches local.",
        "Execution requires explicit approval.",
        "Demo mode never reads real mail.",
      ],
      do_not_say: ["Do not claim SOC2 certification.", "Do not promise same-day enterprise onboarding."],
      sources: [
        {
          source_id: "product-faq",
          type: "url",
          title: "Product FAQ",
          url: "https://docs.example.test/faq",
          use_for: ["support", "sales"],
        },
        {
          source_id: "support-taxonomy",
          type: "local",
          title: "Support taxonomy",
          path: "references/support-taxonomy.md",
          use_for: ["triage"],
        },
      ],
    },
    accounts: [
      {
        mailbox_id: "support",
        display_name: "Support Inbox",
        primary_email: "support@example.test",
        provider: "imap",
        aliases: ["hello@example.test", "team@example.test"],
        folders: ["INBOX", "Customers", "Partners"],
        mailbox_group_id: "main",
        imap_host: "imap.example.test",
        smtp_host: "smtp.example.test",
        imap_password_env: "DEMO_IMAP_PASSWORD",
        smtp_password_env: "DEMO_SMTP_PASSWORD",
        imap_env_configured: true,
        smtp_env_configured: true,
        identities: [
          {
            identity_id: "founder",
            send_as_email: "alex@example.test",
            display_name: "Alex Rivera",
            brand_or_product: "Northstar Labs",
            reply_to: "support@example.test",
          },
        ],
      },
    ],
  };
}

function demoItems() {
  return [
    {
      id: "demo-email-001",
      uid: "9001",
      thread_id: "thread-demo-001",
      account: "support",
      from: "Maya Chen <maya@acme.example>",
      to: "support@example.test",
      date: "2026-06-18 09:12",
      subject: "Can we use approval queues with customer support?",
      category: "customer",
      risk: ["customer", "product"],
      status: "needs_review",
      proposed_action: "draft_reply",
      reason: "The sender asks for product guidance and likely needs a tailored response.",
      review_number: 1,
      review_ref: "Review #1",
      summary:
        "Maya wants to know whether the local approval workflow can summarize support threads while keeping customer data private.",
      body_original:
        "Hi Alex, we are evaluating AI support workflows. Can Northstar summarize incoming customer threads without sending message content to a hosted dashboard? We need a human approval step before replies go out.",
      body_original_language: "en",
      body_translation: "",
      body_translation_language: "",
      html: "<p>Hi Alex,</p><p>Can Northstar summarize incoming customer threads without sending message content to a hosted dashboard?</p><p>We need a human approval step before replies go out.</p>",
      suggested_reply:
        "Hi Maya, yes. The review batch can stay on your machine, and the UI only writes local decisions until you explicitly ask the agent to execute approved replies. Happy to share the setup checklist.",
      draft:
        "Hi Maya, yes. The review batch can stay on your machine, and the UI only writes local decisions until you explicitly ask the agent to execute approved replies. Happy to share the setup checklist.",
      review_brief: {
        user_language: "en",
        suggested_reply: "Hi Maya, yes. The review batch can stay on your machine...",
        background: "Customer evaluating private AI support workflows.",
        why_review: "Product claims should stay accurate and scoped.",
        recommendation: "Draft a concise reply and offer the setup checklist.",
      },
      attachments: [{ filename: "workflow-requirements.pdf", content_type: "application/pdf", size: 184320 }],
      decision: {},
      execution: {},
      updated_at: "2026-06-18T09:12:00.000Z",
    },
    {
      id: "demo-email-002",
      uid: "9002",
      thread_id: "thread-demo-002",
      account: "support",
      from: "Jordan Lee <jordan@partner.example>",
      to: "alex@example.test",
      date: "2026-06-18 08:44",
      subject: "Partner webinar outline for local-first AI",
      category: "partnership",
      risk: ["brand"],
      status: "prepared",
      proposed_action: "archive",
      reason: "Informational partner note, already captured in the content queue.",
      review_number: null,
      review_ref: "",
      summary: "Partner shared a webinar outline and asks for a lightweight confirmation.",
      body_original: "The outline is attached. If this looks right, we will announce it next week.",
      body_original_language: "en",
      html: "<p>The outline is attached. If this looks right, we will announce it next week.</p>",
      suggested_reply: "",
      draft: "",
      attachments: [
        {
          filename: "webinar-outline.docx",
          content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 76320,
        },
      ],
      decision: { action: "archive", decided_at: "2026-06-18T08:50:00.000Z" },
      execution: {},
      updated_at: "2026-06-18T08:50:00.000Z",
    },
    {
      id: "demo-email-003",
      uid: "9003",
      thread_id: "thread-demo-003",
      account: "support",
      from: "Security Robot <alerts@example.test>",
      to: "support@example.test",
      date: "2026-06-18 08:10",
      subject: "New sign-in from Hong Kong",
      category: "security",
      risk: ["security"],
      status: "needs_review",
      proposed_action: "review",
      reason: "Security-related messages should not be auto-archived.",
      review_number: 2,
      review_ref: "Review #2",
      summary: "Account security notification with location and browser details.",
      body_original:
        "We detected a new sign-in from Hong Kong using Chrome on macOS. If this was you, no action is required.",
      body_original_language: "en",
      html: "<p>We detected a new sign-in from Hong Kong using Chrome on macOS.</p>",
      decision: {},
      execution: {},
      updated_at: "2026-06-18T08:10:00.000Z",
    },
    {
      id: "demo-email-004",
      uid: "9004",
      thread_id: "thread-demo-004",
      account: "support",
      from: "Nina Patel <nina@finance.example>",
      to: "alex@example.test",
      date: "2026-06-17 18:35",
      subject: "Invoice for June workspace review",
      category: "money",
      risk: ["money"],
      status: "draft_requested",
      proposed_action: "draft_reply",
      reason: "Finance-related item needs a confirmation note before cleanup.",
      review_number: null,
      review_ref: "",
      summary: "Vendor sent an invoice and asked whether the billing contact should change.",
      body_original: "Invoice attached. Should we keep billing under Alex Rivera or switch to operations@example.test?",
      body_original_language: "en",
      suggested_reply:
        "Hi Nina, please keep the current billing contact for June. I will confirm any change before the next invoice.",
      draft:
        "Hi Nina, please keep the current billing contact for June. I will confirm any change before the next invoice.",
      attachments: [{ filename: "invoice-june.pdf", content_type: "application/pdf", size: 245760 }],
      decision: { action: "draft_reply", decided_at: "2026-06-17T18:48:00.000Z" },
      execution: {},
      updated_at: "2026-06-17T18:48:00.000Z",
    },
    {
      id: "demo-email-005",
      uid: "9005",
      thread_id: "thread-demo-005",
      account: "support",
      from: "Product Updates <updates@example.test>",
      to: "hello@example.test",
      date: "2026-06-17 15:20",
      subject: "June changelog: approvals, locks, exports",
      category: "newsletter",
      risk: [],
      status: "prepared",
      proposed_action: "archive",
      reason: "Newsletter can be archived after review.",
      summary: "Changelog email with product update links.",
      body_original: "This month we added explicit locks, safer exports, and a richer review desk.",
      body_original_language: "en",
      html: "<h1>June changelog</h1><p>Explicit locks, safer exports, and a richer review desk.</p>",
      decision: { action: "archive", decided_at: "2026-06-17T15:25:00.000Z" },
      execution: {},
      updated_at: "2026-06-17T15:25:00.000Z",
    },
    {
      id: "demo-email-006",
      uid: "9006",
      thread_id: "thread-demo-006",
      account: "support",
      from: "Eli Morgan <eli@studio.example>",
      to: "support@example.test",
      date: "2026-06-17 11:02",
      subject: "Question about screenshot-safe demo data",
      category: "product",
      risk: ["privacy"],
      status: "needs_review",
      proposed_action: "draft_reply",
      reason: "Privacy-related question should get a precise answer.",
      review_number: 3,
      review_ref: "Review #3",
      summary: "Eli asks how demo mode avoids exposing private queue data in screenshots.",
      body_original: "Do you support a demo flag so our documentation screenshots never show live customer mail?",
      body_original_language: "en",
      suggested_reply:
        "Yes. Add ?demo=1 to the app URL and the server returns mock batches instead of local cache files.",
      draft: "Yes. Add ?demo=1 to the app URL and the server returns mock batches instead of local cache files.",
      html: "<p>Do you support a demo flag so our documentation screenshots never show live customer mail?</p>",
      decision: {},
      execution: {},
      updated_at: "2026-06-17T11:02:00.000Z",
    },
    {
      id: "demo-email-007",
      uid: "9007",
      thread_id: "thread-demo-007",
      account: "support",
      from: "Ops Bot <ops@example.test>",
      to: "support@example.test",
      date: "2026-06-16 22:10",
      subject: "Archived: daily digest completed",
      category: "ops",
      risk: [],
      status: "executed",
      proposed_action: "archive",
      reason: "Already handled by an approved cleanup action.",
      summary: "Daily digest was archived after approval.",
      body_original: "Digest archived successfully.",
      body_original_language: "en",
      decision: { action: "archive", decided_at: "2026-06-16T22:12:00.000Z" },
      execution: { status: "executed", action: "archive", executed_at: "2026-06-16T22:13:00.000Z" },
      updated_at: "2026-06-16T22:13:00.000Z",
    },
    {
      id: "demo-email-008",
      uid: "9008",
      thread_id: "thread-demo-008",
      account: "support",
      from: "Unknown Sender <unknown@example.test>",
      to: "support@example.test",
      date: "2026-06-16 09:50",
      subject: "Urgent account ownership change",
      category: "security",
      risk: ["security", "identity"],
      status: "prepared",
      proposed_action: "archive",
      reason: "Blocked because sender identity is unverified.",
      summary: "Requests an ownership change and asks to bypass normal confirmation.",
      body_original: "Please change the owner today and do not notify the current admin.",
      body_original_language: "en",
      decision: { action: "archive", decided_at: "2026-06-16T09:55:00.000Z" },
      execution: {
        status: "blocked",
        action: "archive",
        reason: "Security-sensitive request requires manual verification.",
      },
      updated_at: "2026-06-16T09:55:00.000Z",
    },
  ];
}
