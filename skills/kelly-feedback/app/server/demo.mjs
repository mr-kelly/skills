const now = "2026-07-02T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-feedback",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    decisions: { schema_version: "1", updated_at: now, proposals: {}, feedback: {}, requests: {} },
    config_summary: {
      config_path: "demo://kelly-feedback/config.json",
      is_example: false,
      products: snapshot.products.map((product) => ({ ...product })),
      sources: snapshot.sources.map((source) => ({
        source_id: source.source_id,
        channel: source.channel,
        name: source.name,
        collection: source.collection,
        secret_envs: [`KELLY_FEEDBACK_${source.channel.toUpperCase()}_TOKEN_DEMO`],
        secrets_ready: true,
      })),
      scoring: {
        plan_weights: { free: 1, pro: 3, team: 5 },
        default_weight: 1,
        recency_half_life_days: 30,
      },
      roadmap_lanes: ["now", "next", "later"],
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot) {
  const requestTitles = {
    "req-csv-export": "看板数据 CSV 导出",
    "req-dark-mode": "全局深色模式",
    "req-theme-switcher": "主题切换器",
    "req-api-rate-limits": "提高 Team 版 API 速率限制",
    "req-mobile-app": "原生移动端 App",
    "req-pricing-clarity": "定价与按席位计费说明",
    "req-onboarding": "引导式上手清单",
    "req-webhooks": "表单提交 Webhook",
  };
  snapshot.requests = snapshot.requests.map((request) => ({
    ...request,
    title: requestTitles[request.request_id] || request.title,
  }));
  const proposalText = {
    "prop-promote-csv": {
      title: "把「CSV 导出」提升到 Next",
      reason: "本月加权需求最高（5 位用户合计 17 分，其中 3 位付费）；财务和月报流程因为无法导出而被卡住。",
    },
    "prop-decline-mobile": {
      title: "婉拒「原生移动端 App」，回复已起草",
      reason:
        "共 3 条请求但加权仅 7 分，其中 2 位是查看者而非管理员。响应式 Web 优化能以原生 App 一小部分的成本满足八成诉求。",
    },
    "prop-merge-dark": {
      title: "合并「主题切换器」到「全局深色模式」",
      reason: "两个聚类是同一个需求：主题切换器的反馈都在要深色配色。合并后深色模式频次 6、加权 18，成为第一大聚类。",
    },
    "prop-promote-api": {
      title: "把「API 速率限制」排入 Later",
      reason: "三条请求全部来自 Team 客户，但缺少真实请求量数据；盲目提高限制会拖垮摄取集群。",
    },
    "prop-changelog-onboarding": {
      title: "发布「上手清单」更新日志",
      reason: "上手清单已上线且反馈是正面的；发布更新说明可以回应三条相关反馈并收尾。",
    },
  };
  snapshot.proposals = snapshot.proposals.map((proposal) => {
    const text = proposalText[proposal.proposal_id];
    return text ? { ...proposal, title: text.title, reason: text.reason } : proposal;
  });
  return snapshot;
}

function demoSnapshot(scenario) {
  const products = [
    { product_id: "pulseboard", display_name: "PulseBoard", tagline: "Product analytics dashboards for small teams" },
    { product_id: "formora", display_name: "Formora", tagline: "Forms and surveys that feel handmade" },
  ];

  const sources = [
    source("support-email", "email", "Support inbox", "kelly-email handoff", "2026-07-02T07:10:00.000Z", 5),
    source(
      "discord-community",
      "discord",
      "Discord #feedback",
      "kelly-messenger handoff",
      "2026-07-02T08:45:00.000Z",
      6,
    ),
    source("slack-beta", "slack", "Slack beta workspace", "kelly-messenger handoff", "2026-07-01T18:20:00.000Z", 3),
    source("x-mentions", "x", "X replies and mentions", "kelly-social handoff", "2026-07-02T06:30:00.000Z", 5),
    source("appstore-reviews", "appstore", "App Store reviews", "manual export", "2026-06-30T09:00:00.000Z", 3),
    source("in-app-survey", "survey", "In-app NPS survey", "CSV export", "2026-07-01T09:00:00.000Z", 3),
    source("user-interviews", "interview", "Founder interviews", "agent notes", "2026-06-27T15:00:00.000Z", 2),
  ];

  const feedback = [
    fb(
      "fb-email-101",
      "support-email",
      "email",
      "pulseboard",
      "maya@northstarlabs.io",
      "team",
      14,
      5,
      "neutral",
      "2026-06-29T10:12:00.000Z",
      "Is there any way to export the retention dashboard as CSV? Our finance team rebuilds it in Google Sheets every Friday and it eats half a day.",
      "req-csv-export",
      "clustered",
      "Finance workflow; recurring weekly cost.",
      "https://mail.example.com/thread/8841",
    ),
    fb(
      "fb-email-102",
      "support-email",
      "email",
      "pulseboard",
      "finance@brightdesk.co",
      "pro",
      9,
      3,
      "negative",
      "2026-06-30T15:40:00.000Z",
      "We're blocked on month-end reporting because charts can't be exported. Screenshotting dashboards doesn't fly with our auditors.",
      "req-csv-export",
      "clustered",
      "Compliance angle strengthens the export case.",
      "https://mail.example.com/thread/8867",
    ),
    fb(
      "fb-email-103",
      "support-email",
      "email",
      "formora",
      "ops@moonlittools.com",
      "pro",
      7,
      3,
      "negative",
      "2026-06-28T09:05:00.000Z",
      "Your pricing page says per-seat but we were billed per-workspace. Which is it? Took three support emails to figure out.",
      "req-pricing-clarity",
      "clustered",
      "Billing copy mismatch; churn risk.",
      "https://mail.example.com/thread/8802",
    ),
    fb(
      "fb-email-104",
      "support-email",
      "email",
      "pulseboard",
      "sam@renderbay.dev",
      "team",
      11,
      5,
      "negative",
      "2026-07-01T22:15:00.000Z",
      "We hit the 60 req/min API cap syncing events every night. Can Team plans get a higher limit, or at least a documented burst window?",
      "req-api-rate-limits",
      "clustered",
      "Nightly batch job throttled; Team account.",
      "https://mail.example.com/thread/8890",
    ),
    fb(
      "fb-email-105",
      "support-email",
      "email",
      "formora",
      "hello@quietloop.studio",
      "free",
      2,
      1,
      "positive",
      "2026-06-25T08:30:00.000Z",
      "The new template gallery is lovely. Getting from signup to a live form still took me a whole evening though — more hand-holding would help.",
      "req-onboarding",
      "clustered",
      "Positive on templates, friction on setup.",
      "https://mail.example.com/thread/8763",
    ),

    fb(
      "fb-discord-201",
      "discord-community",
      "discord",
      "pulseboard",
      "@pixelnora",
      "pro",
      6,
      3,
      "neutral",
      "2026-06-30T23:55:00.000Z",
      "any plans for dark mode? my eyes at 1am reviewing launch metrics would like a word",
      "req-dark-mode",
      "clustered",
      "",
      "https://discord.com/channels/demo/feedback/1201",
    ),
    fb(
      "fb-discord-202",
      "discord-community",
      "discord",
      "pulseboard",
      "@drft.kai",
      "free",
      3,
      1,
      "neutral",
      "2026-07-01T02:10:00.000Z",
      "+1 dark mode, the all-white dashboard is blinding in the studio at night",
      "req-dark-mode",
      "clustered",
      "",
      "https://discord.com/channels/demo/feedback/1204",
    ),
    fb(
      "fb-discord-203",
      "discord-community",
      "discord",
      "pulseboard",
      "@tomasz_b",
      "pro",
      12,
      3,
      "positive",
      "2026-07-01T13:25:00.000Z",
      "loving the new funnels. would honestly pay extra to get the underlying data out as csv and stop copy-pasting numbers",
      "req-csv-export",
      "clustered",
      "Willingness to pay signal.",
      "https://discord.com/channels/demo/feedback/1209",
    ),
    fb(
      "fb-discord-204",
      "discord-community",
      "discord",
      "formora",
      "@june.builds",
      "free",
      4,
      1,
      "neutral",
      "2026-06-29T17:45:00.000Z",
      "is there a webhook when a form gets submitted? want to pipe entries straight into my community server",
      "req-webhooks",
      "clustered",
      "",
      "https://discord.com/channels/demo/feedback/1195",
    ),
    fb(
      "fb-discord-205",
      "discord-community",
      "discord",
      "pulseboard",
      "@overclockedowl",
      "free",
      1,
      1,
      "negative",
      "2026-07-02T08:40:00.000Z",
      "the date picker keeps resetting to last-7-days whenever i switch dashboards. super annoying when comparing months",
      "",
      "new",
      "",
      "https://discord.com/channels/demo/feedback/1218",
    ),
    fb(
      "fb-discord-206",
      "discord-community",
      "discord",
      "formora",
      "@metricsmaven",
      "pro",
      10,
      3,
      "positive",
      "2026-06-28T20:05:00.000Z",
      "realized you can use hidden fields to A/B test form copy — sharing my setup in #tips if anyone wants it",
      "",
      "insight",
      "Power-user pattern worth a docs article; not a feature request.",
      "https://discord.com/channels/demo/tips/1188",
    ),

    fb(
      "fb-slack-301",
      "slack-beta",
      "slack",
      "pulseboard",
      "Priya N. (Northstar Labs)",
      "team",
      14,
      5,
      "neutral",
      "2026-06-27T11:30:00.000Z",
      "Half the team keeps asking for a dark theme before we roll PulseBoard out to the whole org. It's a small thing but it comes up in every demo.",
      "req-dark-mode",
      "clustered",
      "Enterprise rollout blocker (soft).",
      "https://slack.com/archives/demo/p301",
    ),
    fb(
      "fb-slack-302",
      "slack-beta",
      "slack",
      "pulseboard",
      "Diego M. (Brightdesk)",
      "pro",
      9,
      3,
      "neutral",
      "2026-07-01T08:05:00.000Z",
      "Checking numbers from my phone on the train is rough — pinch-zooming charts all the way. A slimmed-down mobile app would be huge for us.",
      "req-mobile-app",
      "clustered",
      "",
      "https://slack.com/archives/demo/p302",
    ),
    fb(
      "fb-slack-303",
      "slack-beta",
      "slack",
      "pulseboard",
      "Priya N. (Northstar Labs)",
      "team",
      14,
      5,
      "negative",
      "2026-07-01T18:20:00.000Z",
      "Nightly sync got throttled again. If the API limits can't move, at least send a retry-after header so our worker can back off cleanly.",
      "req-api-rate-limits",
      "clustered",
      "Second report from the same Team account.",
      "https://slack.com/archives/demo/p303",
    ),

    fb(
      "fb-x-401",
      "x-mentions",
      "x",
      "pulseboard",
      "@shipfastio",
      "free",
      5,
      1,
      "positive",
      "2026-06-30T12:00:00.000Z",
      "@pulseboard funnels are great — now let me export the raw numbers and it's perfect",
      "req-csv-export",
      "clustered",
      "",
      "https://x.com/shipfastio/status/9001",
    ),
    fb(
      "fb-x-402",
      "x-mentions",
      "x",
      "pulseboard",
      "@nadia_codes",
      "free",
      8,
      1,
      "negative",
      "2026-06-28T21:15:00.000Z",
      "@pulseboard your dashboard on mobile safari is pain. native app when?",
      "req-mobile-app",
      "clustered",
      "",
      "https://x.com/nadia_codes/status/9014",
    ),
    fb(
      "fb-x-403",
      "x-mentions",
      "x",
      "formora",
      "@formsnerd",
      "pro",
      16,
      3,
      "neutral",
      "2026-06-27T14:50:00.000Z",
      "would love to skin @formora forms to match my brand's dark palette — a proper theme switcher, not just accent colors",
      "req-theme-switcher",
      "clustered",
      "",
      "https://x.com/formsnerd/status/9022",
    ),
    fb(
      "fb-x-404",
      "x-mentions",
      "x",
      "formora",
      "@caffeinated_pm",
      "free",
      3,
      1,
      "negative",
      "2026-07-02T06:25:00.000Z",
      "@formora why does duplicating a form drop all the logic jumps? lost an hour rebuilding them",
      "",
      "new",
      "",
      "https://x.com/caffeinated_pm/status/9031",
    ),
    fb(
      "fb-x-405",
      "x-mentions",
      "x",
      "pulseboard",
      "@growth_rocket_x",
      "free",
      0,
      1,
      "neutral",
      "2026-07-01T04:00:00.000Z",
      "@pulseboard dm me to get 10k real followers fast, link in bio",
      "",
      "ignored",
      "Promotional spam, no product signal.",
      "https://x.com/growth_rocket_x/status/9040",
    ),

    fb(
      "fb-app-501",
      "appstore-reviews",
      "appstore",
      "pulseboard",
      "GrowthGuy88",
      "pro",
      8,
      3,
      "negative",
      "2026-06-26T10:00:00.000Z",
      "3 stars. The web app is excellent but there's no real mobile experience. The 'add to home screen' trick isn't it.",
      "req-mobile-app",
      "clustered",
      "",
      "https://apps.example.com/pulseboard/review/501",
    ),
    fb(
      "fb-app-502",
      "appstore-reviews",
      "appstore",
      "formora",
      "TinaMakes",
      "free",
      1,
      1,
      "positive",
      "2026-06-30T08:20:00.000Z",
      "Five stars. The onboarding checklist got my first form live in ten minutes. More of this please.",
      "req-onboarding",
      "clustered",
      "Validates the shipped checklist.",
      "https://apps.example.com/formora/review/502",
    ),
    fb(
      "fb-app-503",
      "appstore-reviews",
      "appstore",
      "pulseboard",
      "dashboard_dan",
      "pro",
      5,
      3,
      "neutral",
      "2026-06-24T19:40:00.000Z",
      "Great tool. Would be 5 stars with a dark theme and OLED-friendly chart colors.",
      "req-dark-mode",
      "clustered",
      "",
      "https://apps.example.com/pulseboard/review/503",
    ),

    fb(
      "fb-survey-601",
      "in-app-survey",
      "survey",
      "pulseboard",
      "NPS 9 · team admin",
      "team",
      10,
      5,
      "positive",
      "2026-07-01T09:00:00.000Z",
      "Almost perfect. Export to CSV or Sheets is the one thing keeping us tied to our old BI tool.",
      "req-csv-export",
      "clustered",
      "",
      "",
    ),
    fb(
      "fb-survey-602",
      "in-app-survey",
      "survey",
      "formora",
      "NPS 6 · pro user",
      "pro",
      4,
      3,
      "negative",
      "2026-06-29T09:00:00.000Z",
      "Not sure what I'm paying for — the plan comparison table doesn't mention response limits until checkout.",
      "req-pricing-clarity",
      "clustered",
      "",
      "",
    ),
    fb(
      "fb-survey-603",
      "in-app-survey",
      "survey",
      "pulseboard",
      "NPS 8 · pro user",
      "pro",
      6,
      3,
      "neutral",
      "2026-06-26T09:00:00.000Z",
      "Please add a dark/auto theme that follows system settings. Everything else is solid.",
      "req-theme-switcher",
      "clustered",
      "",
      "",
    ),

    fb(
      "fb-int-701",
      "user-interviews",
      "interview",
      "pulseboard",
      "Head of Data, Northstar Labs",
      "team",
      14,
      5,
      "neutral",
      "2026-06-27T15:00:00.000Z",
      "They'd move their whole event pipeline to us if rate limits were negotiable on Team. Today they batch nightly and silently drop overflow events.",
      "req-api-rate-limits",
      "clustered",
      "Expansion revenue tied to limits.",
      "",
    ),
    fb(
      "fb-int-702",
      "user-interviews",
      "interview",
      "formora",
      "Solo founder, Quietloop Studio",
      "free",
      2,
      1,
      "positive",
      "2026-06-25T16:00:00.000Z",
      "Said the checklist 'felt like a colleague setting things up with me' and wants the same guidance for the embed flow.",
      "req-onboarding",
      "clustered",
      "Follow-up idea: guided embed flow.",
      "",
    ),
  ];

  const requests = [
    request(
      "req-csv-export",
      "CSV export for dashboard data",
      "pulseboard",
      "candidate",
      "up",
      "Reporting-oriented users cannot get raw numbers out of PulseBoard. Finance and ops teams rebuild dashboards by hand in spreadsheets every week, and auditors reject screenshots.",
      "Add an 'Export CSV' action to every dashboard widget and a full-dashboard export. Columns mirror the widget's underlying query. V2: scheduled push to Google Sheets.",
      "M (1-2 weeks)",
      ["fb-email-101", "fb-email-102", "fb-survey-601"],
      [
        event("2026-06-30T10:00:00.000Z", "agent", "created", "Clustered 3 feedback items into a new request."),
        event("2026-07-02T08:00:00.000Z", "agent", "updated", "Linked 2 more items; drafted promotion proposal #1."),
      ],
      "2026-06-30T10:00:00.000Z",
    ),
    request(
      "req-dark-mode",
      "Dark mode across the app",
      "pulseboard",
      "candidate",
      "up",
      "Users working at night and teams doing org-wide rollouts keep asking for a dark theme. It shows up in community chat, app-store reviews, and enterprise demos.",
      "Ship a dark palette behind a theme toggle with an 'auto' mode following system preference. Chart colors need an OLED-friendly pass.",
      "M (1-2 weeks)",
      ["fb-slack-301", "fb-app-503"],
      [event("2026-06-28T09:00:00.000Z", "agent", "created", "Clustered 4 feedback items into a new request.")],
      "2026-06-28T09:00:00.000Z",
    ),
    request(
      "req-theme-switcher",
      "Theme switcher",
      "formora",
      "candidate",
      "flat",
      "Form builders want their forms (and the editor) to match brand palettes, including dark ones.",
      "Likely a duplicate of dark mode at the platform level; brand theming of published forms is the Formora-specific remainder.",
      "",
      ["fb-x-403"],
      [
        event(
          "2026-06-27T16:00:00.000Z",
          "agent",
          "created",
          "Clustered 2 feedback items; flagged as likely duplicate of req-dark-mode.",
        ),
      ],
      "2026-06-27T16:00:00.000Z",
    ),
    request(
      "req-api-rate-limits",
      "Raise API rate limits for Team plan",
      "pulseboard",
      "needs_info",
      "up",
      "All three reports come from Team accounts running nightly event syncs into the 60 req/min cap. One account ties an expansion decision to negotiable limits.",
      "Raise the Team cap (proposal pending usage data), add a documented burst window, and always return a retry-after header on 429s.",
      "L (3-4 weeks)",
      ["fb-int-701", "fb-email-104"],
      [
        event("2026-06-28T12:00:00.000Z", "agent", "created", "Clustered 2 feedback items."),
        event(
          "2026-07-02T08:10:00.000Z",
          "agent",
          "needs_info",
          "Marked needs_info: waiting on 30 days of per-account API usage.",
        ),
      ],
      "2026-06-28T12:00:00.000Z",
    ),
    request(
      "req-mobile-app",
      "Native mobile app",
      "pulseboard",
      "candidate",
      "flat",
      "Viewers want to check numbers from their phones; the current responsive web experience requires pinch-zooming charts.",
      "Agent recommendation: decline native app for now; ship a responsive dashboard pass plus a read-only mobile web view. Decline reply drafted in proposal #2.",
      "XL (6+ weeks)",
      ["fb-slack-302", "fb-app-501"],
      [
        event("2026-06-29T10:30:00.000Z", "agent", "created", "Clustered 3 feedback items."),
        event(
          "2026-07-01T09:00:00.000Z",
          "agent",
          "proposed_decline",
          "Drafted decline reply; weighted demand is low vs. cost.",
        ),
      ],
      "2026-06-29T10:30:00.000Z",
    ),
    request(
      "req-pricing-clarity",
      "Clarify pricing and seat billing",
      "formora",
      "roadmap",
      "flat",
      "Two paying users were confused about per-seat vs. per-workspace billing and undisclosed response limits. Billing surprises are a churn risk.",
      "Rewrite the pricing page with a plain billing-model section, show response limits in the comparison table, and add an invoice preview before checkout.",
      "S (2-3 days)",
      ["fb-email-103", "fb-survey-602"],
      [
        event("2026-06-29T09:00:00.000Z", "agent", "created", "Clustered 2 feedback items."),
        event("2026-06-30T11:00:00.000Z", "kelly", "promoted", "Moved to roadmap Next: cheap fix, real churn risk."),
      ],
      "2026-06-29T09:00:00.000Z",
    ),
    request(
      "req-onboarding",
      "Guided onboarding checklist",
      "formora",
      "roadmap",
      "down",
      "New users took an evening to publish their first form. A guided checklist was proposed, shipped, and is now getting positive reviews.",
      "Shipped in June: a step-by-step checklist from signup to first live form. Follow-up candidate: extend the same guidance to the embed flow.",
      "Shipped",
      ["fb-app-502", "fb-int-702"],
      [
        event("2026-06-10T09:00:00.000Z", "agent", "created", "Clustered onboarding friction reports."),
        event("2026-06-14T09:00:00.000Z", "kelly", "promoted", "Moved to roadmap Now."),
        event(
          "2026-06-24T09:00:00.000Z",
          "agent",
          "shipped",
          "Checklist live for all new workspaces; changelog drafted in proposal #5.",
        ),
      ],
      "2026-06-10T09:00:00.000Z",
    ),
    request(
      "req-webhooks",
      "Outgoing webhooks on form submit",
      "formora",
      "candidate",
      "flat",
      "Builders want to pipe submissions into their own tools (community servers, CRMs) without polling.",
      "POST submission JSON to a user-configured URL with retries and a signing secret. Pairs well with the existing integrations page.",
      "M (1-2 weeks)",
      ["fb-discord-204"],
      [event("2026-06-29T18:00:00.000Z", "agent", "created", "Single strong request; watching for more signal.")],
      "2026-06-29T18:00:00.000Z",
    ),
  ];

  const roadmap = {
    now: [
      lane(
        "rm-now-1",
        "Guided onboarding checklist",
        "req-onboarding",
        "Shipped 2026-06-24; changelog note pending (proposal #5).",
      ),
      lane("rm-now-2", "Dashboard performance pass", "", "Sub-second loads for dashboards under 50 widgets."),
    ],
    next: [
      lane(
        "rm-next-1",
        "Clarify pricing and seat billing",
        "req-pricing-clarity",
        "Pricing page rewrite plus response limits in the comparison table.",
      ),
      lane("rm-next-2", "Zapier integration", "", "Carried over from Q2 plan."),
    ],
    later: [
      lane("rm-later-1", "Public API v2", "", "Cursor pagination and stable event schema."),
      lane("rm-later-2", "Team permissions and roles", "", "Viewer/editor/admin split requested by two Team accounts."),
    ],
  };

  const proposals = [
    proposal("prop-promote-csv", 1, "promote_request", "Promote 'CSV export' to Next", "needs_review", {
      request_id: "req-csv-export",
      target_lane: "next",
      reason:
        "Highest weighted demand this month (score 17 across 5 users, 3 on paid plans). Finance and month-end reporting workflows are blocked without it, and one NPS 9 admin names it the last reason they keep their old BI tool.",
      evidence:
        "5 feedback items across email, Discord, X, and the NPS survey; 2 Team accounts (Northstar Labs, Render Bay side) raised it directly. Trend is up two weeks in a row.",
      draft_kind: "changelog_note",
      draft:
        "Next up: CSV export. Export any dashboard widget's underlying data as CSV, or grab the whole dashboard in one file. Scheduled pushes to Google Sheets are on the shortlist right after. Rolling out to all plans.",
      created_at: "2026-07-02T08:00:00.000Z",
    }),
    proposal(
      "prop-decline-mobile",
      2,
      "decline_request",
      "Decline 'Native mobile app' with a drafted reply",
      "changes_requested",
      {
        request_id: "req-mobile-app",
        reason:
          "3 requests but weighted score only 7, and 2 of 3 come from viewers rather than admins. A responsive dashboard pass covers most of the ask at a fraction of a native app's build and maintenance cost.",
        evidence:
          "Feedback from Slack beta, X, and one 3-star App Store review. No paying admin has made it a renewal condition.",
        draft_kind: "decline_reply",
        draft:
          "Thanks for pushing us on mobile — you're right that today's phone experience falls short. We're not building a native app this year: for a two-person team it would slow everything else down. Instead, a responsive dashboard pass is scheduled for Q3 that makes viewing (not editing) genuinely good on phones. If that still doesn't cover how you use PulseBoard on the go, tell us what you check most from your phone and we'll design for it.",
        review_note:
          "Don't say 'no native app ever'. Mention the responsive pass shipping in Q3 explicitly and end by asking what they check most from their phone.",
        created_at: "2026-07-01T09:00:00.000Z",
        decided_at: "2026-07-01T17:30:00.000Z",
      },
    ),
    proposal(
      "prop-merge-dark",
      3,
      "merge_requests",
      "Merge 'Theme switcher' into 'Dark mode across the app'",
      "approved",
      {
        request_id: "req-dark-mode",
        request_ids: ["req-dark-mode", "req-theme-switcher"],
        reason:
          "Same underlying need: both 'Theme switcher' items ask for a dark palette. Merging lifts dark mode to frequency 6 and weighted score 18 — the top cluster overall.",
        evidence:
          "fb-x-403 and fb-survey-603 both describe dark/system themes; only brand-theming of published Formora forms is distinct and stays noted on the merged request.",
        draft_kind: "merge_note",
        draft:
          "Merged 'Theme switcher' into 'Dark mode across the app'. Kept the Formora brand-theming remainder as a note on the merged request.",
        review_note: "Agreed — keep the Formora brand-theming remainder visible.",
        created_at: "2026-07-01T08:30:00.000Z",
        decided_at: "2026-07-02T07:45:00.000Z",
      },
    ),
    proposal("prop-promote-api", 4, "promote_request", "Schedule 'API rate limits' for Later", "blocked", {
      request_id: "req-api-rate-limits",
      target_lane: "later",
      reason:
        "All three requests come from Team accounts and one ties an expansion decision to it, but we don't know real per-account request volumes. Raising limits blindly risks the ingest cluster.",
      evidence:
        "Weighted score 15 from 3 items — every reporter is on Team. Northstar Labs raised it twice in one week.",
      draft_kind: "",
      draft: "",
      review_note:
        "Blocked: need 30 days of per-account API usage from the metrics pipeline before sizing new limits. Re-propose once the data lands.",
      created_at: "2026-07-02T08:10:00.000Z",
      decided_at: "2026-07-02T08:40:00.000Z",
    }),
    proposal(
      "prop-changelog-onboarding",
      5,
      "publish_changelog",
      "Publish changelog note for the shipped onboarding checklist",
      "done",
      {
        request_id: "req-onboarding",
        reason:
          "The guided checklist shipped on June 24 and reviews are positive. Publishing the note closes the loop with the three users who reported onboarding friction.",
        evidence: "One five-star App Store review and one interview quote directly credit the checklist.",
        draft_kind: "changelog_note",
        draft:
          "Shipped: guided onboarding checklist. New workspaces now get a step-by-step checklist from signup to your first live form — most makers finish in about ten minutes. Thanks to everyone who told us the first evening felt like homework.",
        review_note: "Published as-is.",
        created_at: "2026-06-25T09:00:00.000Z",
        decided_at: "2026-06-26T10:00:00.000Z",
      },
    ),
  ];

  const sync_log = [
    log("2026-06-27T15:30:00.000Z", "kelly-feedback", "ingest", "Imported 2 interview notes from user-interviews.", 2),
    log("2026-06-30T09:05:00.000Z", "kelly-feedback", "ingest", "Imported 3 App Store reviews (manual export).", 3),
    log("2026-07-01T09:10:00.000Z", "kelly-feedback", "ingest", "Imported 3 NPS survey responses.", 3),
    log(
      "2026-07-02T07:15:00.000Z",
      "kelly-feedback",
      "ingest",
      "Ingested 5 support emails via kelly-email handoff.",
      5,
    ),
    log(
      "2026-07-02T08:00:00.000Z",
      "agent",
      "cluster",
      "Applied cluster assignments: 23 items across 8 requests; drafted proposals #1-#4.",
      23,
    ),
    log(
      "2026-07-02T08:50:00.000Z",
      "kelly-feedback",
      "ingest",
      "Ingested 11 community items from Discord, Slack, and X handoffs.",
      11,
    ),
  ];

  void scenario; // All scenes share one dataset; the scene selects the app route.
  return recomputeRequestScores({
    schema_version: "1",
    generated_at: now,
    source: "kelly-feedback-demo",
    products,
    sources,
    feedback,
    requests,
    roadmap,
    proposals,
    metrics: computeMetrics(feedback, requests, proposals),
    sync_log,
  });
}

function computeMetrics(feedback, requests, proposals) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const ref = new Date(now).getTime();
  const week_inflow = {};
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const item of feedback) {
    sentiment[item.sentiment] = (sentiment[item.sentiment] || 0) + 1;
    if (ref - new Date(item.received_at).getTime() <= weekMs) {
      week_inflow[item.channel] = (week_inflow[item.channel] || 0) + 1;
    }
  }
  return {
    feedback_count: feedback.length,
    new_feedback: feedback.filter((item) => item.triage === "new").length,
    request_count: requests.length,
    proposals_needs_review: proposals.filter((item) => item.status === "needs_review").length,
    requests_needs_info: requests.filter((item) => item.status === "needs_info").length,
    week_inflow,
    sentiment,
  };
}

function source(source_id, channel, name, collection, last_ingest_at, item_count) {
  return { source_id, channel, name, collection, last_ingest_at, item_count, status: "ok" };
}

function fb(
  feedback_id,
  source_id,
  channel,
  product,
  handle,
  plan,
  tenure_months,
  weight,
  sentiment,
  received_at,
  text,
  request_id,
  triage,
  agent_note,
  permalink,
) {
  return {
    feedback_id,
    source_id,
    channel,
    product,
    user: { handle, plan, tenure_months, weight },
    text,
    sentiment,
    received_at,
    permalink,
    request_id,
    triage,
    agent_note,
  };
}

function request(
  request_id,
  title,
  product,
  status,
  trend,
  problem_statement,
  spec_summary,
  effort_estimate,
  representative_feedback_ids,
  decision_history,
  created_at,
) {
  return {
    request_id,
    title,
    product,
    status,
    trend,
    frequency: 0,
    weighted_score: 0,
    problem_statement,
    spec_summary,
    effort_estimate,
    representative_feedback_ids,
    decision_history,
    created_at,
    updated_at: decision_history[decision_history.length - 1]?.at || created_at,
  };
}

function event(at, actor, action, note) {
  return { at, actor, action, note };
}

function lane(item_id, title, request_id, note) {
  return { item_id, title, request_id, note };
}

function proposal(proposal_id, ref, type, title, status, extra) {
  return {
    proposal_id,
    ref,
    type,
    title,
    status,
    request_id: "",
    request_ids: [],
    target_lane: "",
    reason: "",
    evidence: "",
    draft_kind: "",
    draft: "",
    review_note: "",
    created_at: now,
    decided_at: "",
    ...extra,
  };
}

function log(at, actor, action, detail, count) {
  return { at, actor, action, detail, count };
}

// Derive request frequency and weighted score from linked feedback so the
// numbers always agree with the raw stream.
export function recomputeRequestScores(snapshot) {
  const byRequest = new Map(snapshot.requests.map((item) => [item.request_id, item]));
  for (const request of snapshot.requests) {
    request.frequency = 0;
    request.weighted_score = 0;
  }
  for (const item of snapshot.feedback) {
    const request = byRequest.get(item.request_id);
    if (!request) continue;
    request.frequency += 1;
    request.weighted_score += Number(item.user?.weight || 1);
  }
  return snapshot;
}
