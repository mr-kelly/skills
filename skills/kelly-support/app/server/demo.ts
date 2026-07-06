// Deterministic mock scenes for documentation and screenshots.
// Persona: "Nimbus Notes" — an invented note-taking SaaS whose support desk
// receives tickets over email, web chat, WhatsApp, an in-app form, and WeChat.
// Demo-safe: invented company, customers, and data. Demo mode NEVER touches
// app/.data. The quality gate (support-qa), SLA breaches, and CSAT are all live
// on this data so screenshots show real behavior — including one refund request
// that trips the gate to BLOCK.
import { runQualityGate } from "../../lib/data-provider/store-core.ts";

const now = "2026-07-06T09:00:00.000Z";

export const FEATURED_TICKET_ID = "tk-ochoa-refund";

const RISK = {
  refund_requires_approval: true,
  max_auto_refund: 0,
  block_ungrounded_replies: true,
  block_commitments_without_approval: true,
};

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export function isDemoQuery(query: DemoQuery = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot()) : demoSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-support",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-support/config.json",
      is_example: false,
      sla_policy: {
        first_response_hours: { urgent: 2, high: 4, normal: 8, low: 24 },
        business_hours: "24/5",
      },
      risk_policy: RISK,
      reply_style: { tone: "warm, concise, solution-first", language: "match the customer" },
      knowledge_base: { source_path: "demo://nimbus/knowledge_base.json" },
      accounts: snapshot.accounts.map((account) => ({
        account_id: account.account_id,
        channel: account.channel,
        connector: account.connector,
        display_name: account.display_name,
        handle: account.handle,
        secret_envs: ["manual", "form_intake"].includes(account.connector)
          ? []
          : [`KELLY_SUPPORT_${account.channel.toUpperCase()}_TOKEN_DEMO`],
        secrets_ready: true,
      })),
    },
    snapshot,
    decisions: demoDecisions(zh),
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(),
  };
}

function demoSnapshot() {
  const knowledge_base = demoKnowledgeBase();
  const tickets = demoTickets();
  for (const ticket of tickets) {
    ticket.quality_gate = runQualityGate(ticket, knowledge_base, RISK);
  }
  const accounts = demoAccounts(tickets);
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-support-demo",
    metrics: {},
    accounts,
    tickets,
    knowledge_base,
    sync_log: [
      sync(
        "sync-email-0840",
        "email-support",
        "email_agent",
        "2026-07-06T08:40:00.000Z",
        "ok",
        "4 new email tickets ingested from kelly-email.",
        4,
      ),
      sync(
        "sync-chat-0852",
        "webchat",
        "webchat_widget",
        "2026-07-06T08:52:00.000Z",
        "ok",
        "Web-chat transcripts synced from the widget.",
        3,
      ),
      sync(
        "sync-wa-0845",
        "whatsapp-support",
        "whatsapp_cloud",
        "2026-07-06T08:45:00.000Z",
        "ok",
        "WhatsApp Business webhook backlog ingested.",
        2,
      ),
    ],
    warnings: [
      {
        id: "sla-breach-batch",
        severity: "warning",
        message: "3 tickets have breached their first-response SLA.",
        detail: "See the SLA board — the oldest is tk-fischer-export (urgent, due 07:00).",
      },
      {
        id: "refund-gate-block",
        severity: "warning",
        account_id: "email-support",
        message: "Ticket #1 (Ochoa refund) is BLOCKED by the support-qa gate.",
        detail:
          "The drafted reply promises a refund; refunds are approval-required. A human must approve before it can be sent.",
      },
    ],
  };
  recomputeDemoMetrics(snapshot);
  return snapshot;
}

function recomputeDemoMetrics(snapshot) {
  const status_counts = { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 };
  const by_category = {};
  const by_channel = {};
  let weekTotal = 0;
  const weekAgo = new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000;
  const csatScores = [];
  const responseDeltas = [];
  for (const ticket of snapshot.tickets) {
    if (status_counts[ticket.status] !== undefined) status_counts[ticket.status] += 1;
    by_category[ticket.category] = (by_category[ticket.category] || 0) + 1;
    if (new Date(ticket.created_at).getTime() >= weekAgo) {
      weekTotal += 1;
      by_channel[ticket.channel] = (by_channel[ticket.channel] || 0) + 1;
    }
    if (ticket.csat?.score) csatScores.push(ticket.csat.score);
    const firstIn = (ticket.messages || []).find((m) => m.direction === "incoming");
    const firstOut = (ticket.messages || []).find((m) => m.direction === "outgoing");
    if (firstIn && firstOut) {
      const delta = (new Date(firstOut.sent_at).getTime() - new Date(firstIn.sent_at).getTime()) / 60000;
      if (delta >= 0) responseDeltas.push(delta);
    }
  }
  responseDeltas.sort((a, b) => a - b);
  const csatAverage = csatScores.length
    ? Number((csatScores.reduce((s, v) => s + v, 0) / csatScores.length).toFixed(2))
    : 0;
  snapshot.metrics = {
    account_count: snapshot.accounts.length,
    ticket_count: snapshot.tickets.length,
    kb_count: snapshot.knowledge_base.length,
    open_count: snapshot.tickets.filter((t) => ["needs_review", "changes_requested", "approved"].includes(t.status))
      .length,
    awaiting_approval_count: snapshot.tickets.filter((t) => t.status === "needs_review").length,
    breaching_sla_count: snapshot.tickets.filter((t) => t.sla?.breached).length,
    resolved_count: snapshot.tickets.filter((t) => t.status === "done").length,
    csat_average: csatAverage,
    csat_responses: csatScores.length,
    first_response_median_minutes: responseDeltas.length
      ? Math.round(responseDeltas[Math.floor((responseDeltas.length - 1) / 2)])
      : 0,
    tickets_this_week: { total: weekTotal, by_channel },
    by_category,
    status_counts,
    csat_trend: [
      { label: "Jun 30", score: 4.2 },
      { label: "Jul 1", score: 4.4 },
      { label: "Jul 2", score: 4.1 },
      { label: "Jul 3", score: 4.5 },
      { label: "Jul 5", score: 4.6 },
      { label: "Jul 6", score: 4.7 },
    ],
  };
}

function demoAccounts(tickets) {
  const defs = [
    ["email-support", "email", "email_agent", "Support Mailbox", "help@nimbusnotes.app", "2026-07-06T08:40:00.000Z"],
    ["webchat", "webchat", "webchat_widget", "In-app Web Chat", "app.nimbusnotes.app", "2026-07-06T08:52:00.000Z"],
    ["whatsapp-support", "whatsapp", "whatsapp_cloud", "WhatsApp Support", "+1 555 0134", "2026-07-06T08:45:00.000Z"],
    ["form-intake", "form", "form_intake", "Contact Form", "nimbusnotes.app/contact", "2026-07-06T08:20:00.000Z"],
    ["wechat-support", "wechat", "wechat_work", "WeChat Work", "NimbusNotesCN", "2026-07-06T08:10:00.000Z"],
  ];
  return defs.map(([account_id, channel, connector, display_name, handle, last_sync_at]) => {
    const owned = tickets.filter((item) => item.account_id === account_id);
    return {
      account_id,
      channel,
      connector,
      display_name,
      handle,
      status: "ok",
      ticket_count: owned.length,
      unread_count: owned.filter((item) => item.unread).length,
      last_sync_at,
    };
  });
}

function demoKnowledgeBase() {
  return [
    kb(
      "kb-refunds",
      "article",
      "Refund policy (30-day)",
      "New paid plans are eligible for a full refund within 30 days of purchase. Refunds are issued to the original payment method and take 5–10 business days. Refunds must be approved by a human agent before processing.",
      ["billing", "refund", "policy"],
      "billing",
    ),
    kb(
      "kb-export",
      "article",
      "Export notes to Markdown / PDF",
      "Notes export from Settings → Data → Export. Choose Markdown, PDF, or a full ZIP archive. Large workspaces (10k+ notes) export as a background job and email a download link within an hour. The link expires after 24 hours.",
      ["export", "data", "how_to"],
      "how_to",
    ),
    kb(
      "kb-sync-offline",
      "article",
      "Sync stuck / offline changes not appearing",
      "If a device shows an outdated version: 1) confirm it is online, 2) pull to refresh the workspace, 3) sign out and back in to force a full resync. Conflicting edits are preserved as a duplicate note titled 'Conflicted copy'. No data is lost.",
      ["sync", "bug", "troubleshooting"],
      "bug",
    ),
    kb(
      "kb-2fa",
      "article",
      "Enable / reset two-factor authentication",
      "Enable 2FA in Settings → Security. If a user is locked out, they can use a saved recovery code. Without a recovery code, identity must be verified before we reset 2FA — never disable 2FA on an unverified request.",
      ["security", "2fa", "account"],
      "account",
    ),
    kb(
      "kb-billing-seats",
      "article",
      "Add or remove team seats",
      "Workspace owners manage seats in Settings → Billing → Team. Adding a seat is prorated for the current cycle; removing a seat credits the unused portion to the next invoice. Seat changes take effect immediately.",
      ["billing", "seats", "team"],
      "billing",
    ),
    kb(
      "macro-ack",
      "macro",
      "Macro: first-response acknowledgement",
      "Hi {{name}}, thanks for reaching out to Nimbus Notes — I'm looking into this now and will follow up shortly with next steps.",
      ["macro", "acknowledgement"],
      "general",
    ),
    kb(
      "macro-resolved",
      "macro",
      "Macro: resolved follow-up",
      "Glad that's sorted, {{name}}! I'll close this ticket for now — just reply here anytime if anything else comes up. A quick rating helps us a lot.",
      ["macro", "closing", "csat"],
      "general",
    ),
  ];
}

function demoTickets() {
  return [
    // 1 — FEATURED: refund request. Reply promises a refund -> support-qa BLOCK.
    ticket(
      FEATURED_TICKET_ID,
      1,
      "email-support",
      "email",
      cust("Marta Ochoa", "Ochoa Studio", "marta@ochoastudio.com", "", "ES", "Pro (annual)"),
      "Requesting a refund — signed up by mistake",
      "I upgraded to the annual Pro plan yesterday but meant to pick monthly. Can I get a refund and switch? Charged €120.",
      "refund",
      "high",
      "needs_review",
      "refund",
      "Refund request within the 30-day window (charged yesterday). KB confirms eligibility, but refunds are approval-required — do not send until Kelly approves.",
      "Hi Marta, you're well within our 30-day window, so I can refund the €120 annual charge to your original card (5–10 business days) and get you set up on the monthly Pro plan instead. I'll process that refund right away.",
      ["kb-refunds"],
      sla("first_response", "2026-07-06T13:00:00.000Z", false),
      null,
      "Kelly",
      true,
      "2026-07-06T08:12:00.000Z",
      "marta@ochoastudio.com",
      { status: "pending", operation: "refund", amount: 120 },
      [
        msg(
          "och-1",
          "incoming",
          "Marta Ochoa",
          "I upgraded to the annual Pro plan yesterday but meant to pick monthly. Can I get a refund and switch? I was charged €120.",
          "2026-07-06T08:12:00.000Z",
        ),
      ],
    ),

    // 2 — export how-to, agent drafted a grounded reply (SHIP).
    ticket(
      "tk-nguyen-export",
      2,
      "webchat",
      "webchat",
      cust("David Nguyen", "", "", "david_n", "US", "Team"),
      "How do I export all my notes?",
      "Leaving for a new job and want a backup of everything before my seat is removed. What's the best way?",
      "how_to",
      "normal",
      "needs_review",
      "send_reply",
      "Straightforward export how-to. Answer grounded in the export KB article; large-workspace note included in case the backup is big.",
      "Hi David! Head to Settings → Data → Export and choose Markdown, PDF, or a full ZIP archive. If your workspace is large (10k+ notes) it'll run in the background and email you a download link within an hour — the link is good for 24 hours. Want me to trigger the export for you?",
      ["kb-export"],
      sla("first_response", "2026-07-06T17:00:00.000Z", false),
      null,
      "Kelly",
      true,
      "2026-07-06T08:30:00.000Z",
      "wc:david_n",
      null,
      [
        msg(
          "ngu-1",
          "incoming",
          "David Nguyen",
          "Leaving for a new job and want a backup of everything before my seat is removed. What's the best way?",
          "2026-07-06T08:30:00.000Z",
        ),
      ],
    ),

    // 3 — SLA BREACHED urgent bug (export failing), needs review.
    ticket(
      "tk-fischer-export",
      3,
      "email-support",
      "email",
      cust("Lena Fischer", "Fischer & Co", "lena@fischerco.de", "", "DE", "Business"),
      "URGENT: PDF export failing for the whole team before an audit",
      "We have an audit tomorrow and every PDF export errors out at 90%. This is blocking 12 people. Please help ASAP.",
      "bug",
      "urgent",
      "needs_review",
      "escalate",
      "Urgent, multi-user export failure blocking a deadline; SLA already breached (due 07:00). Draft acknowledges + proposes escalation to engineering.",
      "Hi Lena, I'm sorry this is hitting right before your audit — I've flagged it as urgent. As an immediate workaround, a Markdown or ZIP export from Settings → Data → Export should go through while we investigate the PDF path. I'm escalating the failing PDF job to our engineering on-call now and will update you within the hour.",
      ["kb-export"],
      sla("first_response", "2026-07-06T07:00:00.000Z", true),
      null,
      "Kelly",
      true,
      "2026-07-06T05:10:00.000Z",
      "lena@fischerco.de",
      { status: "pending", operation: "escalate", tier: "engineering" },
      [
        msg(
          "fis-1",
          "incoming",
          "Lena Fischer",
          "We have an audit tomorrow and every PDF export errors out at 90%. This is blocking 12 people. Please help ASAP.",
          "2026-07-06T05:10:00.000Z",
        ),
        msg("fis-2", "incoming", "Lena Fischer", "Still failing. Any update?", "2026-07-06T07:40:00.000Z"),
      ],
    ),

    // 4 — sync bug, grounded reply (SHIP), SLA breached.
    ticket(
      "tk-park-sync",
      4,
      "whatsapp-support",
      "whatsapp",
      cust("Ji-ho Park", "", "", "+82 10 5550 1122", "KR", "Pro (monthly)"),
      "Notes from my laptop aren't showing on my phone",
      "Edited a bunch of notes on my laptop last night, phone still shows the old version. Did I lose my work?",
      "bug",
      "high",
      "needs_review",
      "send_reply",
      "Classic stale-device sync issue. Reply reassures no data loss and walks the KB resync steps. SLA breached (due 06:30).",
      "Hi Ji-ho — good news, nothing is lost. This is usually a stale device: make sure your phone is online, pull down to refresh the workspace, and if it's still behind, sign out and back in to force a full resync. If two versions ever conflict we keep both as a 'Conflicted copy' note, so your edits are safe.",
      ["kb-sync-offline"],
      sla("first_response", "2026-07-06T06:30:00.000Z", true),
      null,
      "Kelly",
      true,
      "2026-07-06T04:20:00.000Z",
      "8210555001122@wa",
      null,
      [
        msg(
          "par-1",
          "incoming",
          "Ji-ho Park",
          "Edited a bunch of notes on my laptop last night, phone still shows the old version. Did I lose my work?",
          "2026-07-06T04:20:00.000Z",
        ),
      ],
    ),

    // 5 — billing seats how-to (SHIP), needs review.
    ticket(
      "tk-alvarez-seats",
      5,
      "form-intake",
      "form",
      cust("Rosa Alvarez", "Bright Labs", "rosa@brightlabs.io", "", "MX", "Team"),
      "Remove two seats after layoffs",
      "We let two people go this week. How do I remove their seats and will we be credited?",
      "billing",
      "normal",
      "needs_review",
      "send_reply",
      "Seat-removal billing question. Answer grounded in the seats KB; credit behavior stated exactly as documented.",
      "Hi Rosa, so sorry to hear that. As the workspace owner you can remove seats in Settings → Billing → Team — the change takes effect immediately, and the unused portion of each removed seat is credited to your next invoice automatically. Nothing else needed on your side.",
      ["kb-billing-seats"],
      sla("first_response", "2026-07-06T16:20:00.000Z", false),
      null,
      "Kelly",
      false,
      "2026-07-06T08:20:00.000Z",
      "rosa@brightlabs.io",
      null,
      [
        msg(
          "alv-1",
          "incoming",
          "Rosa Alvarez",
          "We let two people go this week. How do I remove their seats and will we be credited?",
          "2026-07-06T08:20:00.000Z",
        ),
      ],
    ),

    // 6 — 2FA lockout, security-sensitive, changes_requested by human.
    ticket(
      "tk-holt-2fa",
      6,
      "email-support",
      "email",
      cust("Greg Holt", "", "greg.holt@gmail.com", "", "GB", "Free"),
      "Locked out — lost my phone with the 2FA app",
      "New phone, old one is gone, and I can't log in. Can you just turn off 2FA on my account?",
      "how_to",
      "high",
      "changes_requested",
      "send_reply",
      "2FA reset request. Draft leaned toward disabling 2FA — human asked to require identity verification per the security KB.",
      "Hi Greg, I can help you back in. First, do you still have one of the recovery codes you saved when enabling 2FA? If so, use it at the login screen. If not, I'll need to verify your identity before making any change — I'll never disable 2FA on an unverified request, for your account's safety.",
      ["kb-2fa"],
      sla("first_response", "2026-07-06T12:00:00.000Z", false),
      null,
      "Kelly",
      true,
      "2026-07-06T07:05:00.000Z",
      "greg.holt@gmail.com",
      null,
      [
        msg(
          "hol-1",
          "incoming",
          "Greg Holt",
          "New phone, old one is gone, and I can't log in. Can you just turn off 2FA on my account?",
          "2026-07-06T07:05:00.000Z",
        ),
      ],
    ),

    // 7 — complaint, approved and waiting to send.
    ticket(
      "tk-costa-complaint",
      7,
      "webchat",
      "webchat",
      cust("Bruno Costa", "", "", "bruno_c", "BR", "Pro (monthly)"),
      "Third time the app logged me out mid-writing",
      "This is really frustrating — I lost my train of thought twice today because the app randomly logs me out.",
      "complaint",
      "high",
      "approved",
      "send_reply",
      "Frustrated but retainable Pro user. Draft validates the frustration, gives the resync fix, and sets expectations. Approved to send.",
      "Bruno, I completely understand — getting bounced out mid-thought is the worst. This is usually a session/sync hiccup rather than lost work (drafts autosave). Try signing out and back in once to refresh the session; if it keeps happening I'll pull your session logs and dig in personally. Thanks for sticking with us.",
      ["kb-sync-offline"],
      sla("first_response", "2026-07-06T12:30:00.000Z", false),
      null,
      "Kelly",
      false,
      "2026-07-06T06:50:00.000Z",
      "wc:bruno_c",
      null,
      [
        msg(
          "cos-1",
          "incoming",
          "Bruno Costa",
          "This is really frustrating — I lost my train of thought twice today because the app randomly logs me out.",
          "2026-07-06T06:50:00.000Z",
        ),
        msg("cos-2", "incoming", "Bruno Costa", "Third time this week honestly.", "2026-07-06T06:52:00.000Z"),
      ],
    ),

    // 8 — feature request, no_action (log it), needs review.
    ticket(
      "tk-tan-feature",
      8,
      "form-intake",
      "form",
      cust("Mei Tan", "Tan Ventures", "mei@tanventures.sg", "", "SG", "Business"),
      "Please add nested tags",
      "We'd love nested/hierarchical tags for organizing client work. Any plans?",
      "feature",
      "low",
      "needs_review",
      "no_action",
      "Feature request — no KB answer exists. Draft acknowledges, sets honest expectations, and logs it for product. No commitment made.",
      "Hi Mei, thanks for the thoughtful suggestion — nested tags is a popular ask and I've logged your vote for it with our product team. I can't promise a date, but requests like yours genuinely shape the roadmap. I'll note your workspace so we can reach out if it ships.",
      [],
      sla("first_response", "2026-07-07T08:15:00.000Z", false),
      null,
      "Kelly",
      false,
      "2026-07-05T15:15:00.000Z",
      "mei@tanventures.sg",
      null,
      [
        msg(
          "tan-1",
          "incoming",
          "Mei Tan",
          "We'd love nested/hierarchical tags for organizing client work. Any plans?",
          "2026-07-05T15:15:00.000Z",
        ),
      ],
    ),

    // 9 — WeChat billing question, SLA breached, needs review.
    ticket(
      "tk-liu-invoice",
      9,
      "wechat-support",
      "wechat",
      cust("Liu Yang", "云图科技", "", "liuyang_wx", "CN", "Business"),
      "Need a proper invoice (fapiao) for accounting",
      "Our finance team needs a formal invoice for the Business plan. Can you send one for last month?",
      "billing",
      "normal",
      "needs_review",
      "escalate",
      "Invoice/fapiao request — no self-serve KB path for CN invoices, so route to billing ops. Draft acknowledges and sets a timeline. SLA breached.",
      "Hi Liu, happy to sort that out. Formal invoices for the Business plan are issued by our billing team — I've forwarded your request and they'll email the invoice for last month within one business day. Please confirm the company title and tax ID you'd like on it.",
      ["kb-billing-seats"],
      sla("first_response", "2026-07-06T07:30:00.000Z", true),
      null,
      "Kelly",
      true,
      "2026-07-06T05:40:00.000Z",
      "wx:liuyang_wx",
      { status: "pending", operation: "escalate", tier: "billing_ops" },
      [
        msg(
          "liu-1",
          "incoming",
          "Liu Yang",
          "Our finance team needs a formal invoice for the Business plan. Can you send one for last month?",
          "2026-07-06T05:40:00.000Z",
        ),
      ],
    ),

    // 10 — RESOLVED with a CSAT score (done).
    ticket(
      "tk-mbeki-login",
      10,
      "email-support",
      "email",
      cust("Thandi Mbeki", "", "thandi@mbeki.co.za", "", "ZA", "Pro (monthly)"),
      "Password reset email not arriving",
      "I keep requesting a reset but the email never comes.",
      "bug",
      "normal",
      "done",
      "send_reply",
      "Reset email deliverability — resolved by asking to check spam and allowlist. Customer confirmed and rated 5/5.",
      "Hi Thandi! Reset emails sometimes land in spam or get held by strict filters. Please check your spam/junk folder and allowlist no-reply@nimbusnotes.app, then request the reset once more. If it still doesn't arrive in 5 minutes, reply here and I'll trigger it manually.",
      ["kb-2fa"],
      sla("first_response", "2026-07-05T12:00:00.000Z", false, "2026-07-05T10:12:00.000Z"),
      { score: 5, comment: "Fixed in minutes, super clear. Thank you!", rated_at: "2026-07-05T11:05:00.000Z" },
      "Kelly",
      false,
      "2026-07-05T09:50:00.000Z",
      "thandi@mbeki.co.za",
      {
        status: "executed",
        operation: "send_reply",
        connector: "email_agent",
        channel: "email",
        target: "thandi@mbeki.co.za",
        detail: "Sent via kelly-email.",
        executed_at: "2026-07-05T10:12:00.000Z",
      },
      [
        msg(
          "mbe-1",
          "incoming",
          "Thandi Mbeki",
          "I keep requesting a reset but the email never comes.",
          "2026-07-05T09:50:00.000Z",
        ),
        msg(
          "mbe-2",
          "outgoing",
          "Kelly",
          "Hi Thandi! Reset emails sometimes land in spam or get held by strict filters. Please check your spam/junk folder and allowlist no-reply@nimbusnotes.app, then request the reset once more.",
          "2026-07-05T10:12:00.000Z",
        ),
        msg(
          "mbe-3",
          "incoming",
          "Thandi Mbeki",
          "That was it — found it in spam. All good now, thank you!",
          "2026-07-05T10:55:00.000Z",
        ),
      ],
    ),

    // 11 — resolved WhatsApp how-to (done), CSAT 4.
    ticket(
      "tk-abbas-share",
      11,
      "whatsapp-support",
      "whatsapp",
      cust("Yara Abbas", "", "", "+971 55 550 7788", "AE", "Team"),
      "How do I share a note with someone outside my team?",
      "Want to send a read-only note to a client who isn't in our workspace.",
      "how_to",
      "low",
      "done",
      "send_reply",
      "Share-link how-to, resolved same day. Customer rated 4/5.",
      "Hi Yara! Open the note, tap Share, and choose 'Anyone with the link (view only)'. You can copy that link to your client — they won't need an account, and you can revoke it anytime from the same menu.",
      [],
      sla("first_response", "2026-07-04T16:00:00.000Z", false, "2026-07-04T13:20:00.000Z"),
      { score: 4, comment: "Worked, thanks. Would be nice to set link expiry.", rated_at: "2026-07-04T14:00:00.000Z" },
      "Kelly",
      false,
      "2026-07-04T13:05:00.000Z",
      "971555507788@wa",
      {
        status: "executed",
        operation: "send_reply",
        connector: "whatsapp_cloud",
        channel: "whatsapp",
        target: "971555507788@wa",
        detail: "Sent via WhatsApp Cloud API.",
        executed_at: "2026-07-04T13:20:00.000Z",
      },
      [
        msg(
          "abb-1",
          "incoming",
          "Yara Abbas",
          "Want to send a read-only note to a client who isn't in our workspace.",
          "2026-07-04T13:05:00.000Z",
        ),
        msg(
          "abb-2",
          "outgoing",
          "Kelly",
          "Hi Yara! Open the note, tap Share, and choose 'Anyone with the link (view only)'.",
          "2026-07-04T13:20:00.000Z",
        ),
        msg("abb-3", "incoming", "Yara Abbas", "Perfect, sent it. Thanks!", "2026-07-04T13:48:00.000Z"),
      ],
    ),

    // 12 — blocked: abusive/spam, human blocked it.
    ticket(
      "tk-spam-crypto",
      12,
      "form-intake",
      "form",
      cust("Growth Partner", "", "deals@offshore-growth.biz", "", "", "Free"),
      "Partnership opportunity 🚀 10x your users",
      "Guaranteed traffic and crypto payouts, reply for our rate card.",
      "complaint",
      "low",
      "blocked",
      "no_action",
      "Unsolicited spam pitch, not a support request. Blocked — no reply, no action.",
      "",
      [],
      sla("first_response", "2026-07-06T08:05:00.000Z", false),
      null,
      "Kelly",
      false,
      "2026-07-06T00:05:00.000Z",
      "deals@offshore-growth.biz",
      null,
      [
        msg(
          "spm-1",
          "incoming",
          "Growth Partner",
          "Guaranteed traffic and crypto payouts, reply for our rate card.",
          "2026-07-06T00:05:00.000Z",
        ),
      ],
    ),

    // 13 — resolved billing (done), CSAT 5.
    ticket(
      "tk-rossi-upgrade",
      13,
      "webchat",
      "webchat",
      cust("Giulia Rossi", "Rossi Design", "", "giulia_r", "IT", "Pro (monthly)"),
      "Difference between Pro and Team?",
      "Thinking of upgrading — what do we get on Team vs Pro?",
      "how_to",
      "low",
      "done",
      "send_reply",
      "Plan-comparison question, resolved in chat. Rated 5/5.",
      "Hi Giulia! Team adds shared workspaces, per-seat billing, and granular permissions on top of everything in Pro. If you're collaborating with others it's the one to pick — happy to walk through the seat pricing whenever you're ready.",
      ["kb-billing-seats"],
      sla("first_response", "2026-07-03T15:00:00.000Z", false, "2026-07-03T11:30:00.000Z"),
      { score: 5, comment: "Really helpful, upgraded on the spot.", rated_at: "2026-07-03T12:10:00.000Z" },
      "Kelly",
      false,
      "2026-07-03T11:18:00.000Z",
      "wc:giulia_r",
      {
        status: "executed",
        operation: "send_reply",
        connector: "webchat_widget",
        channel: "webchat",
        target: "wc:giulia_r",
        detail: "Sent via web-chat widget.",
        executed_at: "2026-07-03T11:30:00.000Z",
      },
      [
        msg(
          "ros-1",
          "incoming",
          "Giulia Rossi",
          "Thinking of upgrading — what do we get on Team vs Pro?",
          "2026-07-03T11:18:00.000Z",
        ),
        msg(
          "ros-2",
          "outgoing",
          "Kelly",
          "Hi Giulia! Team adds shared workspaces, per-seat billing, and granular permissions on top of everything in Pro.",
          "2026-07-03T11:30:00.000Z",
        ),
        msg("ros-3", "incoming", "Giulia Rossi", "Great, that's exactly what we need!", "2026-07-03T11:52:00.000Z"),
      ],
    ),

    // 14 — how-to, agent drafted a reply that cites a DANGLING kb ref -> FIX.
    ticket(
      "tk-berg-import",
      14,
      "email-support",
      "email",
      cust("Ola Berg", "Berg AB", "ola@bergab.se", "", "SE", "Free"),
      "Can I import my notes from Evernote?",
      "Switching over from Evernote — is there an importer?",
      "how_to",
      "normal",
      "needs_review",
      "send_reply",
      "Import how-to. Draft is reasonable but cites kb-import, which doesn't exist yet — gate flags FIX so we add a real article or drop the ref.",
      "Hi Ola! Yes — go to Settings → Data → Import and pick 'Evernote (.enx)'. Upload your export and we'll bring over notes, notebooks (as tags), and attachments. Larger imports run in the background and email you when they're done.",
      ["kb-import"],
      sla("first_response", "2026-07-06T18:00:00.000Z", false),
      null,
      "Kelly",
      true,
      "2026-07-06T08:05:00.000Z",
      "ola@bergab.se",
      null,
      [
        msg(
          "ber-1",
          "incoming",
          "Ola Berg",
          "Switching over from Evernote — is there an importer?",
          "2026-07-06T08:05:00.000Z",
        ),
      ],
    ),
  ];
}

function demoDecisions(zh) {
  const comments = zh
    ? {
        "tk-holt-2fa": "先要求身份验证，不能对未验证的请求直接关闭 2FA。让客户先找回恢复码。",
        "tk-costa-complaint": "照发 —— 语气到位，先给重登录方案，必要时我亲自查会话日志。",
        "tk-spam-crypto": "垃圾推广，不是支持请求。直接拦截，不回复。",
      }
    : {
        "tk-holt-2fa":
          "Require identity verification first — never disable 2FA on an unverified request. Ask for the recovery code.",
        "tk-costa-complaint": "Send as is — good tone, lead with the re-login fix, offer to dig into session logs.",
        "tk-spam-crypto": "Spam pitch, not a support request. Block, no reply.",
      };
  return {
    schema_version: "1",
    updated_at: "2026-07-06T08:50:00.000Z",
    decisions: {
      "tk-holt-2fa": {
        action: "request_changes",
        comment: comments["tk-holt-2fa"],
        status: "changes_requested",
        decided_at: "2026-07-06T08:30:00.000Z",
      },
      "tk-costa-complaint": {
        action: "approve",
        comment: comments["tk-costa-complaint"],
        status: "approved",
        decided_at: "2026-07-06T08:40:00.000Z",
      },
      "tk-spam-crypto": {
        action: "block",
        comment: comments["tk-spam-crypto"],
        status: "blocked",
        decided_at: "2026-07-06T08:10:00.000Z",
      },
      "tk-mbeki-login": { action: "approve", comment: "", status: "approved", decided_at: "2026-07-05T10:05:00.000Z" },
      "tk-abbas-share": { action: "approve", comment: "", status: "approved", decided_at: "2026-07-04T13:15:00.000Z" },
      "tk-rossi-upgrade": {
        action: "approve",
        comment: "",
        status: "approved",
        decided_at: "2026-07-03T11:25:00.000Z",
      },
    },
  };
}

function demoAgentTasks(zh) {
  return {
    schema_version: "1",
    updated_at: "2026-07-06T08:32:00.000Z",
    tasks: [
      {
        task_id: "task-20260706-0830-6",
        type: "revise_reply",
        ticket_id: "tk-holt-2fa",
        ref: 6,
        comment: zh
          ? "先要求身份验证，不能对未验证的请求直接关闭 2FA。让客户先找回恢复码。"
          : "Require identity verification first — never disable 2FA on an unverified request. Ask for the recovery code.",
        status: "open",
        requested_at: "2026-07-06T08:30:00.000Z",
      },
      {
        task_id: "task-20260706-0832-14",
        type: "fix_grounding",
        ticket_id: "tk-berg-import",
        ref: 14,
        comment: zh
          ? "回复引用了不存在的 kb-import。请补一篇 Evernote 导入的知识库文章，或去掉该引用。"
          : "Reply cites kb-import, which does not exist. Write a real Evernote-import KB article or drop the ref (support-qa: FIX).",
        status: "open",
        requested_at: "2026-07-06T08:32:00.000Z",
      },
    ],
  };
}

function demoExecutionReport() {
  return {
    report_id: "exec-20260705-1012",
    mode: "send",
    executed_at: "2026-07-05T10:12:00.000Z",
    results: [
      {
        ticket_id: "tk-mbeki-login",
        ref: 10,
        status: "executed",
        operation: "send_reply",
        connector: "email_agent",
        channel: "email",
        target: "thandi@mbeki.co.za",
        detail: "Sent via kelly-email.",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "email-support": "支持邮箱",
    webchat: "应用内网页聊天",
    "whatsapp-support": "WhatsApp 支持",
    "form-intake": "联系表单",
    "wechat-support": "企业微信",
  };
  snapshot.accounts = snapshot.accounts.map((a) => ({
    ...a,
    display_name: accountNames[a.account_id] || a.display_name,
  }));
  const kbTitles = {
    "kb-refunds": "退款政策（30 天）",
    "kb-export": "导出笔记为 Markdown / PDF",
    "kb-sync-offline": "同步卡住 / 离线修改未显示",
    "kb-2fa": "启用 / 重置双因素认证",
    "kb-billing-seats": "增加或移除团队席位",
    "macro-ack": "快捷回复：首次响应确认",
    "macro-resolved": "快捷回复：已解决跟进",
  };
  snapshot.knowledge_base = snapshot.knowledge_base.map((a) => ({ ...a, title: kbTitles[a.article_id] || a.title }));
  const reasons = {
    "tk-ochoa-refund":
      "退款请求在 30 天窗口内（昨天扣款）。知识库确认符合条件，但退款需人工审批 —— 未经 Kelly 批准不得发送。",
    "tk-nguyen-export": "常规导出咨询。依据导出知识库文章作答，并附上大型工作区的说明。",
    "tk-fischer-export":
      "紧急、多用户导出失败且卡住截止日期；SLA 已超时（应于 07:00 前响应）。草稿先确认并提出升级至工程团队。",
    "tk-park-sync": "典型的设备版本过旧同步问题。回复安抚不会丢数据并给出知识库中的重同步步骤。SLA 已超时。",
    "tk-alvarez-seats": "席位移除计费问题。依据席位知识库作答，退款方式与文档一致。",
    "tk-holt-2fa": "2FA 重置请求。草稿倾向直接关闭 —— 已按安全知识库要求先做身份验证。",
    "tk-costa-complaint": "沮丧但可挽留的 Pro 用户。草稿先共情，再给重同步方案并设定预期。已批准发送。",
    "tk-tan-feature": "功能请求 —— 知识库无答案。草稿予以确认、诚实说明预期并记录给产品团队。未做任何承诺。",
    "tk-liu-invoice": "发票请求 —— 无自助知识库路径，转交计费运营。草稿确认并给出时间线。SLA 已超时。",
    "tk-mbeki-login": "重置邮件送达问题 —— 通过检查垃圾邮件并加白名单解决。客户确认并给出 5/5 评分。",
    "tk-abbas-share": "分享链接使用说明，当天解决。客户评分 4/5。",
    "tk-spam-crypto": "未经请求的垃圾推广，非支持请求。已拦截 —— 不回复、不操作。",
    "tk-rossi-upgrade": "套餐对比问题，聊天中解决。评分 5/5。",
    "tk-berg-import": "导入使用说明。草稿合理，但引用了不存在的 kb-import —— 门控标记为 FIX，需新增文章或去掉引用。",
  };
  snapshot.tickets = snapshot.tickets.map((t) => ({ ...t, reason: reasons[t.ticket_id] || t.reason }));
  snapshot.warnings = snapshot.warnings.map((w) => ({
    ...w,
    message:
      {
        "sla-breach-batch": "有 3 个工单已超过首次响应 SLA。",
        "refund-gate-block": "工单 #1（Ochoa 退款）被 support-qa 门控拦截。",
      }[w.id] || w.message,
    detail:
      {
        "sla-breach-batch": "见 SLA 看板 —— 最久的是 tk-fischer-export（紧急，应于 07:00 前响应）。",
        "refund-gate-block": "草拟的回复承诺退款；退款需审批。发送前必须人工批准。",
      }[w.id] || w.detail,
  }));
  snapshot.sync_log = snapshot.sync_log.map((entry) => ({
    ...entry,
    message:
      {
        "sync-email-0840": "从 kelly-email 导入 4 个新邮件工单。",
        "sync-chat-0852": "已从网页聊天组件同步会话记录。",
        "sync-wa-0845": "已导入 WhatsApp Business webhook 积压。",
      }[entry.sync_id] || entry.message,
  }));
  return snapshot;
}

/* ---- builders ---- */

function sync(sync_id, account_id, method, at, status, message, new_messages) {
  return { sync_id, account_id, method, at, status, message, new_messages };
}

function cust(name, company, email, handle, country, plan) {
  return { name, company, email, handle, country, plan };
}

function msg(message_id, direction, sender, text, sent_at, attachment = "") {
  return { message_id, direction, sender, text, sent_at, attachment };
}

function sla(policy, due_by, breached, first_response_at = "") {
  return { policy, due_by, breached, ...(first_response_at ? { first_response_at } : {}) };
}

function kb(article_id, kind, title, body, tags, category) {
  return { article_id, kind, title, body, tags, category, updated_at: "2026-06-30T00:00:00.000Z" };
}

function ticket(
  ticket_id,
  ref,
  account_id,
  channel,
  customer,
  subject,
  body,
  category,
  priority,
  status,
  proposed_action,
  reason,
  suggested_reply,
  kb_refs,
  slaObj,
  csat,
  owner,
  unread,
  created_at,
  provider_conversation_id,
  execution,
  messages,
) {
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((m) => m.direction === "incoming");
  return {
    ticket_id,
    ref,
    account_id,
    channel,
    customer,
    subject,
    body,
    category,
    priority,
    status,
    proposed_action,
    reason,
    suggested_reply,
    kb_refs,
    sla: slaObj,
    csat: csat || null,
    quality_gate: null,
    owner,
    unread,
    created_at,
    last_message_at: last?.sent_at || created_at,
    last_incoming_at: lastIncoming?.sent_at || "",
    provider_conversation_id,
    decision: null,
    execution: execution || null,
    messages,
    updated_at: last?.sent_at || created_at,
  };
}
