import type {
  Conversation,
  Message,
  MessagesSnapshot,
  Outbox,
  Reply,
  SnapshotAccount,
  SyncLogEntry,
} from "../../lib/types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

interface DemoStatePayload {
  demo: true;
  demo_scenario: string;
  app: string;
  data_provider: string;
  onboarding: { completed: boolean; completed_at: string; config_version: string };
  lock: null;
  config_summary: Record<string, unknown>;
  snapshot: MessagesSnapshot;
  outbox: Outbox;
  agent_tasks: Record<string, unknown>;
  execution_report: Record<string, unknown>;
}

const now = "2026-07-02T10:30:00.000Z";

export const FEATURED_CONVERSATION_ID = "wa-lena-pricing";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): DemoStatePayload {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot()) : demoSnapshot();
  const outbox = zh ? localizeOutboxZh(demoOutbox()) : demoOutbox();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-messenger",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-messenger/config.json",
      is_example: false,
      reply_style: { tone: "warm, concise, founder-to-user", language: "match incoming message" },
      sync: { default_limit: 50, cadence_minutes: 30 },
      accounts: snapshot.accounts.map((account) => ({
        account_id: account.account_id,
        platform: account.platform,
        connector: account.connector,
        display_name: account.display_name,
        workspace: account.workspace,
        secret_envs:
          account.connector === "browser_agent" || account.connector === "manual"
            ? []
            : [`KELLY_MESSENGER_${account.platform.toUpperCase()}_TOKEN_DEMO`],
        secrets_ready: true,
      })),
    },
    snapshot,
    outbox,
    agent_tasks: demoAgentTasks(),
    execution_report: demoExecutionReport(),
  };
}

function demoSnapshot() {
  const conversations = demoConversations();
  const accounts = demoAccounts(conversations);
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-messenger-demo",
    metrics: {
      account_count: accounts.length,
      conversation_count: conversations.length,
      message_count: conversations.reduce((sum, item) => sum + item.messages.length, 0),
      unread_count: conversations.filter((item) => item.unread).length,
      awaiting_reply_count: conversations.filter((item) => item.awaiting_reply).length,
    },
    accounts,
    conversations,
    sync_log: [
      sync(
        "sync-wa-0930",
        "wa-biz",
        "whatsapp_cloud",
        "2026-07-02T09:58:00.000Z",
        "ok",
        "Webhook backlog ingested; 4 new messages.",
        4,
      ),
      sync(
        "sync-slack-team-1000",
        "slack-team",
        "slack",
        "2026-07-02T10:00:00.000Z",
        "ok",
        "2 channels scanned via conversations.history.",
        3,
      ),
      sync(
        "sync-slack-makers-1000",
        "slack-makers",
        "slack",
        "2026-07-02T10:00:00.000Z",
        "ok",
        "1 channel scanned via conversations.history.",
        1,
      ),
      sync(
        "sync-discord-1010",
        "discord-community",
        "discord",
        "2026-07-02T10:10:00.000Z",
        "ok",
        "3 channels + 1 DM scanned via REST.",
        2,
      ),
      sync(
        "sync-tg-1015",
        "tg-main",
        "telegram",
        "2026-07-02T10:15:00.000Z",
        "ok",
        "getUpdates drained; 2 new messages.",
        2,
      ),
    ],
    warnings: [
      {
        id: "wa-history-gap",
        severity: "info",
        account_id: "wa-biz",
        message: "WhatsApp Cloud API only delivers new inbound messages via webhook.",
        detail: "For older history, collect via the browser skill and scripts/ingest_messages.mjs.",
      },
    ],
  };
}

function demoAccounts(conversations) {
  const defs = [
    ["wa-biz", "whatsapp", "whatsapp_cloud", "WhatsApp Business", "Nimbus Forms", "2026-07-02T09:58:00.000Z"],
    ["slack-team", "slack", "slack", "Nimbus Team", "nimbusforms.slack.com", "2026-07-02T10:00:00.000Z"],
    ["slack-makers", "slack", "slack", "Indie Makers HQ", "indiemakershq.slack.com", "2026-07-02T10:00:00.000Z"],
    [
      "discord-community",
      "discord",
      "discord",
      "Nimbus Forms Community",
      "discord.gg/nimbusforms",
      "2026-07-02T10:10:00.000Z",
    ],
    ["tg-main", "telegram", "telegram", "Nimbus Telegram", "@NimbusFormsBot", "2026-07-02T10:15:00.000Z"],
  ];
  return defs.map(([account_id, platform, connector, display_name, workspace, last_sync_at]) => {
    const owned = conversations.filter((item) => item.account_id === account_id);
    return {
      account_id,
      platform,
      connector,
      display_name,
      workspace,
      status: "ok",
      unread_count: owned.filter((item) => item.unread).length,
      conversation_count: owned.length,
      last_sync_at,
    };
  });
}

function demoConversations() {
  return [
    conversation(
      "wa-lena-pricing",
      "wa-biz",
      "whatsapp",
      "dm",
      "Lena Ortiz",
      "",
      "Nimbus Forms",
      ["Lena Ortiz", "Kelly"],
      true,
      true,
      "55119990001@wa",
      [
        msg(
          "wa-lena-1",
          "incoming",
          "Lena Ortiz",
          "Hi! I run ops at Fieldwork Studio — we're trialing Nimbus Forms for client intake.",
          "2026-07-02T09:12:00.000Z",
        ),
        msg(
          "wa-lena-2",
          "outgoing",
          "Kelly",
          "Hey Lena, great to hear! How's the trial going so far?",
          "2026-07-02T09:18:00.000Z",
        ),
        msg(
          "wa-lena-3",
          "incoming",
          "Lena Ortiz",
          "Really well. The conditional logic saved us from a spreadsheet mess.",
          "2026-07-02T09:24:00.000Z",
        ),
        msg(
          "wa-lena-4",
          "incoming",
          "Lena Ortiz",
          "Question: we'd need 12 seats. Is there annual pricing, and do viewer-only seats count?",
          "2026-07-02T09:26:00.000Z",
        ),
        msg(
          "wa-lena-5",
          "outgoing",
          "Kelly",
          "Good question — viewers are free, only editors count as seats.",
          "2026-07-02T09:31:00.000Z",
        ),
        msg(
          "wa-lena-6",
          "incoming",
          "Lena Ortiz",
          "Nice. So 12 editors. What would annual look like vs the $29/seat monthly?",
          "2026-07-02T09:40:00.000Z",
        ),
        msg(
          "wa-lena-7",
          "incoming",
          "Lena Ortiz",
          "Also, do you do invoicing instead of card? Our finance team prefers wire.",
          "2026-07-02T09:52:00.000Z",
        ),
        msg(
          "wa-lena-8",
          "incoming",
          "Lena Ortiz",
          "No rush, but I'd love numbers before our Friday budget call 🙏",
          "2026-07-02T09:55:00.000Z",
        ),
      ],
      "Hi Lena! For 12 editor seats, annual is $290/seat/year (two months free vs monthly) — $3,480/year total, and viewer seats stay free. We can absolutely invoice: annual plans support wire transfer with net-30 terms. I'll send a formal quote today so you have it before Friday's call. Anything else finance will ask for?",
    ),

    conversation(
      "slack-support-webhooks",
      "slack-team",
      "slack",
      "channel",
      "Tomas Rivera · webhook 429s",
      "#support",
      "nimbusforms.slack.com",
      ["Tomas Rivera", "Kelly"],
      true,
      true,
      "C0SUPPORT/1751439720.000100",
      [
        msg(
          "sl-web-1",
          "incoming",
          "Tomas Rivera",
          "Our form → CRM webhook started failing overnight. Seeing 429s in your delivery logs.",
          "2026-07-02T07:02:00.000Z",
        ),
        msg(
          "sl-web-2",
          "incoming",
          "Tomas Rivera",
          "Delivery attempts: 6, backoff maxed out.",
          "2026-07-02T07:04:00.000Z",
          "screenshot: delivery-log.png",
        ),
        msg(
          "sl-web-3",
          "outgoing",
          "Kelly",
          "Looking into it — did anything change on the receiving endpoint?",
          "2026-07-02T07:20:00.000Z",
        ),
        msg(
          "sl-web-4",
          "incoming",
          "Tomas Rivera",
          "We moved the CRM behind Cloudflare yesterday. Rate limiting maybe?",
          "2026-07-02T07:26:00.000Z",
        ),
        msg(
          "sl-web-5",
          "outgoing",
          "Kelly",
          "Very likely. Our retries come from a small IP range, so CF may throttle the bursts.",
          "2026-07-02T07:33:00.000Z",
        ),
        msg(
          "sl-web-6",
          "incoming",
          "Tomas Rivera",
          "Can you share the IP range so we can allowlist? And do failed deliveries replay?",
          "2026-07-02T07:41:00.000Z",
        ),
        msg(
          "sl-web-7",
          "incoming",
          "Tomas Rivera",
          "Boss is asking for an ETA on the missed submissions 😅",
          "2026-07-02T08:15:00.000Z",
        ),
      ],
    ),

    conversation(
      "discord-help-api",
      "discord-community",
      "discord",
      "channel",
      "devkota · API rate limits",
      "#help",
      "Nimbus Forms Community",
      ["devkota", "Kelly"],
      true,
      true,
      "chan/998811772233",
      [
        msg(
          "dc-api-1",
          "incoming",
          "devkota",
          "hey, hitting the REST API for submissions — what are the rate limits?",
          "2026-07-02T05:30:00.000Z",
        ),
        msg("dc-api-2", "incoming", "devkota", "getting 429 after ~60 calls", "2026-07-02T05:31:00.000Z"),
        msg(
          "dc-api-3",
          "outgoing",
          "Kelly",
          "60 req/min per token on the free tier — are you polling for new submissions?",
          "2026-07-02T06:05:00.000Z",
        ),
        msg("dc-api-4", "incoming", "devkota", "yeah, polling every second 😬", "2026-07-02T06:12:00.000Z"),
        msg(
          "dc-api-5",
          "incoming",
          "devkota",
          "is there a webhook option instead? and do limits go up on paid plans?",
          "2026-07-02T06:14:00.000Z",
        ),
        msg("dc-api-6", "incoming", "devkota", "bump 🙏", "2026-07-02T08:47:00.000Z"),
      ],
      "Yes — switch to webhooks: Settings → Integrations → Webhooks fires on every new submission, no polling needed. Paid plans raise REST limits to 600 req/min. Docs: nimbusforms.dev/docs/webhooks. If you share your form ID I can sanity-check the config.",
    ),

    conversation(
      "discord-dm-mod",
      "discord-community",
      "discord",
      "dm",
      "Ash (moderator)",
      "",
      "Nimbus Forms Community",
      ["Ash", "Kelly"],
      false,
      true,
      "dm/440055660011",
      [
        msg(
          "dc-mod-1",
          "incoming",
          "Ash",
          "Spam wave in #general tonight — 14 accounts posting crypto links.",
          "2026-07-01T19:02:00.000Z",
        ),
        msg(
          "dc-mod-2",
          "incoming",
          "Ash",
          "Banned them, but they keep coming in from fresh invites.",
          "2026-07-01T19:04:00.000Z",
        ),
        msg(
          "dc-mod-3",
          "outgoing",
          "Kelly",
          "Thanks for jumping on it. Where are the invites coming from?",
          "2026-07-01T19:30:00.000Z",
        ),
        msg(
          "dc-mod-4",
          "incoming",
          "Ash",
          "Mostly one public invite link on a listing site. Suggest we rotate it + turn on member screening?",
          "2026-07-01T19:41:00.000Z",
        ),
        msg(
          "dc-mod-5",
          "incoming",
          "Ash",
          "Also, should we require phone verification for a week?",
          "2026-07-02T08:05:00.000Z",
        ),
      ],
    ),

    conversation(
      "slack-makers-launch",
      "slack-makers",
      "slack",
      "channel",
      "Pricing page feedback",
      "#launch-feedback",
      "indiemakershq.slack.com",
      ["Priya Nair", "Ben Okafor", "Kelly"],
      true,
      true,
      "C0LAUNCH/1751382120.000200",
      [
        msg(
          "sl-mk-1",
          "incoming",
          "Priya Nair",
          "Saw the new pricing page — the Business tier feels buried. Screenshot attached.",
          "2026-07-01T15:22:00.000Z",
          "screenshot: pricing-page.png",
        ),
        msg(
          "sl-mk-2",
          "incoming",
          "Ben Okafor",
          "+1, and 'contact us' for enterprise scares indie teams away.",
          "2026-07-01T15:31:00.000Z",
        ),
        msg(
          "sl-mk-3",
          "incoming",
          "Priya Nair",
          "Have you tested per-seat vs flat pricing? Happy to share our numbers.",
          "2026-07-01T15:40:00.000Z",
        ),
        msg(
          "sl-mk-4",
          "outgoing",
          "Kelly",
          "This is gold, thank you both. Digging into our funnel data before I respond properly.",
          "2026-07-01T16:05:00.000Z",
        ),
        msg(
          "sl-mk-5",
          "incoming",
          "Ben Okafor",
          "Curious what you decide — we're revamping ours too.",
          "2026-07-02T07:55:00.000Z",
        ),
      ],
    ),

    conversation(
      "tg-group-beta",
      "tg-main",
      "telegram",
      "group",
      "Nimbus Beta Testers",
      "",
      "@NimbusFormsBot",
      ["Sofia", "Marek", "Kelly"],
      true,
      true,
      "-100200300400",
      [
        msg(
          "tg-beta-1",
          "incoming",
          "Sofia",
          "CSV export drops the last column when a field name has a comma.",
          "2026-07-01T21:14:00.000Z",
        ),
        msg(
          "tg-beta-2",
          "incoming",
          "Marek",
          "Can confirm, happens on multi-choice fields too.",
          "2026-07-01T21:20:00.000Z",
        ),
        msg(
          "tg-beta-3",
          "incoming",
          "Sofia",
          "Attached the broken file.",
          "2026-07-01T21:22:00.000Z",
          "file: broken_export.csv",
        ),
        msg(
          "tg-beta-4",
          "outgoing",
          "Kelly",
          "Ouch — reproduced. Escaping bug in the exporter. Logging it now.",
          "2026-07-01T21:40:00.000Z",
        ),
        msg("tg-beta-5", "incoming", "Marek", "Any ETA? We have a report due Thursday.", "2026-07-02T06:55:00.000Z"),
        msg("tg-beta-6", "incoming", "Sofia", "+1, blocking us too.", "2026-07-02T07:02:00.000Z"),
      ],
    ),

    conversation(
      "slack-support-sso",
      "slack-team",
      "slack",
      "channel",
      "Dana Whitfield · SAML SSO",
      "#support",
      "nimbusforms.slack.com",
      ["Dana Whitfield", "Kelly"],
      true,
      true,
      "C0SUPPORT/1751355660.000300",
      [
        msg(
          "sl-sso-1",
          "incoming",
          "Dana Whitfield",
          "Hi — evaluating Nimbus Forms for our patient intake team at Corvid Health. Do you support SAML SSO?",
          "2026-07-01T07:41:00.000Z",
        ),
        msg(
          "sl-sso-2",
          "incoming",
          "Dana Whitfield",
          "We'd be around 80 seats; security review requires SSO + audit logs.",
          "2026-07-01T07:44:00.000Z",
        ),
        msg(
          "sl-sso-3",
          "outgoing",
          "Kelly",
          "Hi Dana! SSO is on the Business plan — both SAML and OIDC. Audit logs shipped last month.",
          "2026-07-01T07:58:00.000Z",
        ),
        msg(
          "sl-sso-4",
          "incoming",
          "Dana Whitfield",
          "Great. Could you share the SCIM roadmap and a security questionnaire contact?",
          "2026-07-01T08:02:00.000Z",
        ),
        msg(
          "sl-sso-5",
          "incoming",
          "Dana Whitfield",
          "Also, is there a sandbox we can point our IdP at this week?",
          "2026-07-01T08:05:00.000Z",
        ),
      ],
    ),

    conversation(
      "wa-printvo-supplier",
      "wa-biz",
      "whatsapp",
      "dm",
      "Marco · Printvo",
      "",
      "Nimbus Forms",
      ["Marco", "Kelly"],
      false,
      false,
      "39337770002@wa",
      [
        msg(
          "wa-prv-1",
          "incoming",
          "Marco",
          "Ciao Kelly! Sticker proofs for the meetup swag are ready.",
          "2026-07-01T11:02:00.000Z",
        ),
        msg("wa-prv-2", "incoming", "Marco", "Here's the v2 proof.", "2026-07-01T11:03:00.000Z", "file: proof_v2.pdf"),
        msg(
          "wa-prv-3",
          "outgoing",
          "Kelly",
          "Love the holo version. How long for 500 units to Lisbon?",
          "2026-07-01T11:30:00.000Z",
        ),
        msg(
          "wa-prv-4",
          "incoming",
          "Marco",
          "5 business days with DHL. Invoice coming today.",
          "2026-07-01T11:47:00.000Z",
        ),
        msg(
          "wa-prv-5",
          "outgoing",
          "Kelly",
          "Perfect, go ahead with 500 holo. Send the invoice to billing@nimbusforms.com.",
          "2026-07-01T12:04:00.000Z",
        ),
      ],
    ),

    conversation(
      "slack-team-billing",
      "slack-team",
      "slack",
      "channel",
      "June dunning recap",
      "#billing-alerts",
      "nimbusforms.slack.com",
      ["Priya Shah", "Kelly"],
      false,
      false,
      "C0BILLING/1751388000.000400",
      [
        msg(
          "sl-bil-1",
          "incoming",
          "Priya Shah",
          "Dunning emails for June went out — 6 accounts recovered, 2 still failing.",
          "2026-07-01T16:40:00.000Z",
        ),
        msg(
          "sl-bil-2",
          "incoming",
          "Priya Shah",
          "One is the agency on the old plan; card expired.",
          "2026-07-01T16:42:00.000Z",
        ),
        msg(
          "sl-bil-3",
          "outgoing",
          "Kelly",
          "Give them the 7-day grace and I'll ping their founder directly.",
          "2026-07-01T17:05:00.000Z",
        ),
        msg("sl-bil-4", "incoming", "Priya Shah", "Done, grace applied.", "2026-07-01T17:10:00.000Z"),
      ],
    ),

    conversation(
      "wa-carlos-onboarding",
      "wa-biz",
      "whatsapp",
      "dm",
      "Carlos Mendes",
      "",
      "Nimbus Forms",
      ["Carlos Mendes", "Kelly"],
      false,
      false,
      "55119994821@wa",
      [
        msg(
          "wa-car-1",
          "incoming",
          "Carlos Mendes",
          "Hi, just signed up. Can I import my old Typeform forms?",
          "2026-06-30T14:12:00.000Z",
        ),
        msg("wa-car-2", "incoming", "Carlos Mendes", "I have about 30 of them.", "2026-06-30T14:15:00.000Z"),
        msg(
          "wa-car-3",
          "outgoing",
          "Kelly",
          "Welcome Carlos! Yes — Settings → Import → Typeform handles questions, logic, and themes.",
          "2026-06-30T15:02:00.000Z",
        ),
        msg("wa-car-4", "incoming", "Carlos Mendes", "Hmm, the import stops at 10 forms?", "2026-06-30T15:44:00.000Z"),
        msg(
          "wa-car-5",
          "outgoing",
          "Kelly",
          "That's the free-tier import cap. I bumped your workspace so all 30 will import — try again and ping me if anything looks off.",
          "2026-07-01T09:16:00.000Z",
        ),
        msg("wa-car-6", "incoming", "Carlos Mendes", "Worked perfectly, thanks! 🎉", "2026-07-01T10:02:00.000Z"),
      ],
    ),

    conversation(
      "tg-dm-selfhost",
      "tg-main",
      "telegram",
      "dm",
      "Igor",
      "",
      "@NimbusFormsBot",
      ["Igor", "Kelly"],
      false,
      false,
      "700800900",
      [
        msg(
          "tg-igr-1",
          "incoming",
          "Igor",
          "Is there a self-hosted version of Nimbus Forms? Our data must stay in the EU.",
          "2026-06-30T18:20:00.000Z",
        ),
        msg(
          "tg-igr-2",
          "outgoing",
          "Kelly",
          "No self-hosted yet, but all data can be pinned to our Frankfurt region — GDPR processor terms included.",
          "2026-06-30T19:01:00.000Z",
        ),
        msg(
          "tg-igr-3",
          "incoming",
          "Igor",
          "EU region works. Where do I flip that setting?",
          "2026-06-30T19:15:00.000Z",
        ),
        msg(
          "tg-igr-4",
          "outgoing",
          "Kelly",
          "Workspace Settings → Data Region, before you create your first form.",
          "2026-06-30T19:26:00.000Z",
        ),
      ],
    ),

    conversation(
      "discord-feature-uploads",
      "discord-community",
      "discord",
      "thread",
      "File upload fields?",
      "#feature-requests",
      "Nimbus Forms Community",
      ["mira.dev", "leo_p", "Kelly"],
      false,
      false,
      "thread/112233445566",
      [
        msg(
          "dc-upl-1",
          "incoming",
          "mira.dev",
          "Any plans for file-upload fields with virus scanning?",
          "2026-06-29T13:05:00.000Z",
        ),
        msg("dc-upl-2", "incoming", "leo_p", "+1, need this for client briefs.", "2026-06-29T13:22:00.000Z"),
        msg(
          "dc-upl-3",
          "outgoing",
          "Kelly",
          "It's on the Q3 roadmap — uploads with scanning + 100MB limit. I'll post progress here.",
          "2026-06-29T14:10:00.000Z",
        ),
        msg("dc-upl-4", "incoming", "mira.dev", "Awesome, thanks!", "2026-06-29T14:18:00.000Z"),
      ],
    ),
  ];
}

function demoOutbox() {
  return {
    schema_version: "1",
    updated_at: now,
    replies: [
      reply(
        1,
        "slack-support-webhooks",
        "slack-team",
        "slack",
        "Tomas Rivera · webhook 429s",
        "Hi Tomas — our webhook retries come from 34.120.40.0/28 and 34.120.41.0/28; allowlisting those in Cloudflare should stop the 429s. Once that's in, I'll replay the 14 missed deliveries from the last 24h — nothing is lost, we keep 7 days. Can you ping me when the allowlist is live?",
        "Customer is blocked and asked for IP ranges + replay; ranges verified against the connector docs.",
        "needs_review",
        null,
        null,
        "2026-07-02T08:30:00.000Z",
      ),
      reply(
        2,
        "tg-group-beta",
        "tg-main",
        "telegram",
        "Nimbus Beta Testers",
        "Thanks for the repro, both! The CSV escaping fix is in review and ships in tomorrow's release (v1.42). Existing exports will re-generate correctly — I'll post here the moment it's live so you can pull the Thursday report.",
        "Two beta testers blocked on a confirmed CSV escaping bug; fix already scheduled for v1.42.",
        "needs_review",
        null,
        null,
        "2026-07-02T08:32:00.000Z",
      ),
      reply(
        3,
        "discord-dm-mod",
        "discord-community",
        "discord",
        "Ash (moderator)",
        "Great work containing it, Ash. Let's rotate the public invite and enable member screening tonight. I'd hold off on phone verification unless the wave continues.",
        "Moderator proposed anti-spam measures and needs Kelly's call before acting.",
        "changes_requested",
        {
          action: "request_changes",
          comment:
            "Mention the invite filter we enabled last week, and make it explicit: yes to screening, no to phone verification for now.",
          decided_at: "2026-07-02T09:05:00.000Z",
        },
        null,
        "2026-07-02T08:35:00.000Z",
      ),
      reply(
        4,
        "slack-support-sso",
        "slack-team",
        "slack",
        "Dana Whitfield · SAML SSO",
        "Hi Dana — SCIM provisioning is planned for Q4, and I can share our interim CSV sync guide today. Security questionnaires go to security@nimbusforms.com (48h turnaround). And yes: I'll spin up a sandbox workspace for your IdP this week — which domain should I provision it under?",
        "Enterprise evaluation, ~80 seats; asked for SCIM roadmap, security contact, and an IdP sandbox.",
        "approved",
        {
          action: "approve",
          comment: "Good to send — quoting Q4 for SCIM is right.",
          decided_at: "2026-07-02T09:02:00.000Z",
        },
        null,
        "2026-07-02T08:20:00.000Z",
      ),
      reply(
        5,
        "wa-carlos-onboarding",
        "wa-biz",
        "whatsapp",
        "Carlos Mendes",
        "That's the free-tier import cap. I bumped your workspace so all 30 will import — try again and ping me if anything looks off.",
        "New customer blocked mid-onboarding by the import cap.",
        "done",
        { action: "approve", comment: "", decided_at: "2026-07-01T09:10:00.000Z" },
        {
          status: "executed",
          operation: "send_message",
          connector: "whatsapp_cloud",
          target: "55119994821@wa",
          detail: "Sent via WhatsApp Cloud API.",
          executed_at: "2026-07-01T09:16:00.000Z",
        },
        "2026-07-01T09:04:00.000Z",
      ),
      reply(
        6,
        "slack-makers-launch",
        "slack-makers",
        "slack",
        "Pricing page feedback",
        "Thanks Priya and Ben — this matches what our funnel data hints at. We're testing a flatter Business tier and clearer self-serve enterprise. I'll share the before/after numbers here once we decide.",
        "Community feedback on pricing; the response depends on a pricing decision only Kelly can make.",
        "blocked",
        {
          action: "block",
          comment: "Don't reply yet — I want to decide flat vs per-seat pricing first.",
          decided_at: "2026-07-02T09:08:00.000Z",
        },
        null,
        "2026-07-02T08:40:00.000Z",
      ),
    ],
  };
}

function demoAgentTasks() {
  return {
    schema_version: "1",
    updated_at: "2026-07-02T09:05:00.000Z",
    tasks: [
      {
        task_id: "task-20260702-0905-3",
        type: "revise_reply",
        reply_id: "reply-demo-3",
        ref: 3,
        conversation_id: "discord-dm-mod",
        comment:
          "Mention the invite filter we enabled last week, and make it explicit: yes to screening, no to phone verification for now.",
        status: "open",
        requested_at: "2026-07-02T09:05:00.000Z",
      },
    ],
  };
}

function demoExecutionReport() {
  return {
    report_id: "exec-20260701-0916",
    mode: "send",
    executed_at: "2026-07-01T09:16:00.000Z",
    results: [
      {
        reply_id: "reply-demo-5",
        ref: 5,
        conversation_id: "wa-carlos-onboarding",
        status: "executed",
        operation: "send_message",
        connector: "whatsapp_cloud",
        target: "55119994821@wa",
        detail: "Sent via WhatsApp Cloud API.",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "wa-biz": "WhatsApp 商业号",
    "slack-team": "Nimbus 团队",
    "slack-makers": "独立开发者社区",
    "discord-community": "Nimbus 产品社区",
    "tg-main": "Nimbus Telegram",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
  }));
  const featured = snapshot.conversations.find((item) => item.conversation_id === FEATURED_CONVERSATION_ID);
  if (featured) {
    featured.suggested_reply =
      "你好 Lena！12 个编辑席位按年付是每席 $290/年（相当于免两个月），合计 $3,480/年，查看者席位始终免费。我们支持开票：年付方案可用电汇，账期 net-30。我今天就把正式报价发给你，赶得上周五的预算会。财务那边还需要什么材料吗？";
  }
  const api = snapshot.conversations.find((item) => item.conversation_id === "discord-help-api");
  if (api) {
    api.suggested_reply =
      "可以 — 换成 Webhook：Settings → Integrations → Webhooks 会在每次新提交时触发，不需要轮询。付费方案的 REST 限额提升到 600 次/分钟。文档：nimbusforms.dev/docs/webhooks。发我你的表单 ID，我可以帮你检查配置。";
  }
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "WhatsApp Cloud API 只通过 webhook 推送新的入站消息。",
    detail: "更早的历史消息请用浏览器技能采集，再用 scripts/ingest_messages.mjs 导入。",
  }));
  return snapshot;
}

function localizeOutboxZh(outbox) {
  const reasons = {
    1: "客户被阻塞，需要 IP 段和重放说明；IP 段已对照连接器文档核实。",
    2: "两位内测用户被已确认的 CSV 转义 bug 阻塞；修复已排进 v1.42。",
    3: "版主提出了反垃圾措施，需要 Kelly 拍板后再执行。",
    4: "企业客户评估中，约 80 个席位；需要 SCIM 路线图、安全联系人和 IdP 沙箱。",
    5: "新客户在导入上限处被卡住，影响入门体验。",
    6: "社区里的定价反馈；回复取决于只有 Kelly 能做的定价决策。",
  };
  outbox.replies = outbox.replies.map((item) => ({
    ...item,
    reason: reasons[item.ref] || item.reason,
  }));
  return outbox;
}

function sync(sync_id, account_id, method, at, status, message, new_messages) {
  return { sync_id, account_id, method, at, status, message, new_messages };
}

function conversation(
  conversation_id,
  account_id,
  platform,
  kind,
  title,
  channel,
  workspace,
  participants,
  unread,
  awaiting_reply,
  provider_conversation_id,
  messages,
  suggested_reply = "",
) {
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  return {
    conversation_id,
    account_id,
    platform,
    kind,
    title,
    channel,
    workspace,
    participants,
    unread,
    awaiting_reply,
    provider_conversation_id,
    last_message_at: last?.sent_at || "",
    last_incoming_at: lastIncoming?.sent_at || "",
    suggested_reply,
    messages,
  };
}

function msg(message_id, direction, sender, text, sent_at, attachment = "") {
  return { message_id, direction, sender, text, sent_at, attachment };
}

function reply(
  ref,
  conversation_id,
  account_id,
  platform,
  conversation_title,
  text,
  reason,
  status,
  decision,
  execution,
  created_at,
) {
  return {
    reply_id: `reply-demo-${ref}`,
    ref,
    conversation_id,
    account_id,
    platform,
    conversation_title,
    text,
    note: "",
    reason,
    suggested_by: "agent",
    status,
    decision,
    execution,
    created_at,
    updated_at: decision?.decided_at || created_at,
  };
}
