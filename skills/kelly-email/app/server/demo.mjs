const now = "2026-06-18T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const allItems = demoItems();
  const mode = String(query.mode || "all");
  const search = String(query.q || "").toLowerCase().trim();
  let items = allItems;
  if (mode !== "all") {
    if (mode === "needs_review") items = items.filter((item) => item.status === "needs_review");
    else if (mode === "approved") items = items.filter((item) => ["prepared", "drafted", "draft_requested"].includes(item.status) && item.decision?.action);
    else if (mode === "done") items = items.filter((item) => item.status === "executed" || item.decision?.action === "no_action");
    else if (mode === "blocked") items = items.filter((item) => item.execution?.status === "blocked");
    else items = items.filter((item) => item.status === mode);
  }
  if (search) {
    items = items.filter((item) => `${item.review_ref} ${item.from} ${item.subject} ${item.summary}`.toLowerCase().includes(search));
  }
  return {
    demo: true,
    batch: {
      batch_id: "demo-email-20260618",
      generated_at: now,
      updated_at: now,
      source: "demo",
      last_scan: now
    },
    counts: {
      needs_review: 3,
      to_approve: 0,
      approved: 4,
      done: 1,
      blocked: 1,
      prepared: 2,
      drafted: 1,
      draft_requested: 1,
      executed: 1
    },
    items,
    total_cached: allItems.length,
    batch_path: "demo://kelly-email/current_batch.json",
    decisions_path: "demo://kelly-email/decisions.json",
    email_accounts: demoAccounts(),
    lock: { locked: false },
  };
}

export function demoDecisionResponse(body = {}) {
  const ids = (body.ids || [body.id]).filter(Boolean).map(String);
  return {
    demo: true,
    changed: ids,
    decisions: ids.length,
    message: "Demo mode: no local email files were changed."
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
      contact_methods: [{ label: "Website", value: "https://example.test" }]
    },
    brands: [
      {
        brand_id: "northstar",
        name: "Northstar Labs",
        description: "Local-first AI tooling for teams with sensitive workflows.",
        homepage: "https://example.test",
        docs_url: "https://docs.example.test",
        support_url: "https://support.example.test"
      }
    ],
    official_urls: {
      homepage: "https://example.test",
      docs: "https://docs.example.test",
      support: "https://support.example.test"
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
      reply_rules: ["Confirm the request before promising timeline.", "Never expose private roadmap details.", "Prefer short replies with one action."],
      cta_urls: { calendar: "https://example.test/book", docs: "https://docs.example.test" }
    },
    knowledge_base: {
      enabled: true,
      usage: "Use product facts for support and partner replies.",
      facts: ["Northstar keeps review batches local.", "Execution requires explicit approval.", "Demo mode never reads real mail."],
      do_not_say: ["Do not claim SOC2 certification.", "Do not promise same-day enterprise onboarding."],
      sources: [
        { source_id: "product-faq", type: "url", title: "Product FAQ", url: "https://docs.example.test/faq", use_for: ["support", "sales"] },
        { source_id: "support-taxonomy", type: "local", title: "Support taxonomy", path: "references/support-taxonomy.md", use_for: ["triage"] }
      ]
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
          { identity_id: "founder", send_as_email: "alex@example.test", display_name: "Alex Rivera", brand_or_product: "Northstar Labs", reply_to: "support@example.test" }
        ]
      }
    ]
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
      summary: "Maya wants to know whether the local approval workflow can summarize support threads while keeping customer data private.",
      body_original: "Hi Alex, we are evaluating AI support workflows. Can Northstar summarize incoming customer threads without sending message content to a hosted dashboard? We need a human approval step before replies go out.",
      body_original_language: "en",
      body_translation: "",
      body_translation_language: "",
      html: "<p>Hi Alex,</p><p>Can Northstar summarize incoming customer threads without sending message content to a hosted dashboard?</p><p>We need a human approval step before replies go out.</p>",
      suggested_reply: "Hi Maya, yes. The review batch can stay on your machine, and the UI only writes local decisions until you explicitly ask the agent to execute approved replies. Happy to share the setup checklist.",
      draft: "Hi Maya, yes. The review batch can stay on your machine, and the UI only writes local decisions until you explicitly ask the agent to execute approved replies. Happy to share the setup checklist.",
      review_brief: {
        user_language: "en",
        suggested_reply: "Hi Maya, yes. The review batch can stay on your machine...",
        background: "Customer evaluating private AI support workflows.",
        why_review: "Product claims should stay accurate and scoped.",
        recommendation: "Draft a concise reply and offer the setup checklist."
      },
      attachments: [
        { filename: "workflow-requirements.pdf", content_type: "application/pdf", size: 184320 }
      ],
      decision: {},
      execution: {},
      updated_at: "2026-06-18T09:12:00.000Z"
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
      attachments: [{ filename: "webinar-outline.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 76320 }],
      decision: { action: "archive", decided_at: "2026-06-18T08:50:00.000Z" },
      execution: {},
      updated_at: "2026-06-18T08:50:00.000Z"
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
      body_original: "We detected a new sign-in from Hong Kong using Chrome on macOS. If this was you, no action is required.",
      body_original_language: "en",
      html: "<p>We detected a new sign-in from Hong Kong using Chrome on macOS.</p>",
      decision: {},
      execution: {},
      updated_at: "2026-06-18T08:10:00.000Z"
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
      suggested_reply: "Hi Nina, please keep the current billing contact for June. I will confirm any change before the next invoice.",
      draft: "Hi Nina, please keep the current billing contact for June. I will confirm any change before the next invoice.",
      attachments: [{ filename: "invoice-june.pdf", content_type: "application/pdf", size: 245760 }],
      decision: { action: "draft_reply", decided_at: "2026-06-17T18:48:00.000Z" },
      execution: {},
      updated_at: "2026-06-17T18:48:00.000Z"
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
      updated_at: "2026-06-17T15:25:00.000Z"
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
      suggested_reply: "Yes. Add ?demo=1 to the app URL and the server returns mock batches instead of local cache files.",
      draft: "Yes. Add ?demo=1 to the app URL and the server returns mock batches instead of local cache files.",
      html: "<p>Do you support a demo flag so our documentation screenshots never show live customer mail?</p>",
      decision: {},
      execution: {},
      updated_at: "2026-06-17T11:02:00.000Z"
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
      updated_at: "2026-06-16T22:13:00.000Z"
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
      execution: { status: "blocked", action: "archive", reason: "Security-sensitive request requires manual verification." },
      updated_at: "2026-06-16T09:55:00.000Z"
    }
  ];
}
