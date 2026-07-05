import type {
  Brief,
  ConfigSummary,
  DemoQuery,
  Diff,
  DiffLine,
  Evidence,
  Handoff,
  Mover,
  RadarSnapshot,
  Report,
  ReportSource,
  Research,
  ResearchQuestion,
  Signal,
  Source,
  Trends,
  WatchTarget,
} from "./types.ts";

interface DecisionBody {
  id?: string;
  kind?: string;
  action?: string;
  comment?: string;
  confidence?: number;
}

const now = "2026-07-02T08:30:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-radar",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    agent_tasks: {
      updated_at: now,
      tasks: [
        {
          task_id: "task-demo-1",
          kind: "research_followup",
          ref_id: "q-mobile-app",
          note: "Which competitor mobile apps have meaningful ratings volume?",
          created_at: now,
          status: "queued",
        },
      ],
    },
    config_summary: demoConfigSummary(),
    snapshot,
  };
}

export function demoDecisionResponse(body: DecisionBody = {}): Record<string, unknown> {
  return {
    ok: true,
    demo: true,
    decision: {
      id: body.id || "",
      kind: body.kind || "",
      action: body.action || "",
      comment: body.comment || "",
      confidence: body.confidence,
      decided_at: now,
    },
  };
}

function demoConfigSummary(): ConfigSummary {
  return {
    config_path: "demo://kelly-radar/config.json",
    is_example: false,
    profile: {
      products: [{ name: "Formlet", positioning: "AI-assisted form builder for docs-first indie teams" }],
    },
    watchlist: [
      { target_id: "formora", name: "Formora", type: "competitor", source_count: 3, methods: ["browser_agent"] },
      { target_id: "tallyforge", name: "TallyForge", type: "competitor", source_count: 3, methods: ["browser_agent"] },
      {
        target_id: "docupad",
        name: "DocuPad",
        type: "competitor",
        source_count: 2,
        methods: ["browser_agent", "manual"],
      },
      {
        target_id: "kw-ai-form-builder",
        name: "ai form builder",
        type: "keyword",
        source_count: 2,
        methods: ["browser_agent"],
      },
      {
        target_id: "community-formbuilders",
        name: "r/formbuilders",
        type: "community",
        source_count: 1,
        methods: ["browser_agent"],
      },
    ],
    research_defaults: {
      default_depth: "standard",
      source_policy: "public_pages_only",
      require_citations: true,
      max_sources: 8,
    },
    trend_sources: [
      { source_id: "search-rising", kind: "search", name: "Rising search queries", method: "browser_agent" },
      {
        source_id: "community-hn-reddit",
        kind: "community",
        name: "HN / Reddit topic volume",
        method: "browser_agent",
      },
      { source_id: "category-ph", kind: "category", name: "Product Hunt category interest", method: "browser_agent" },
    ],
    cadence: { monitor: "daily", trends: "weekly" },
    env_readiness: [{ name: "KELLY_RADAR_SERP_API_KEY", ready: true }],
  };
}

export function demoSnapshot(scenario = "overview"): RadarSnapshot {
  const watchlist = demoWatchlist();
  const signals = demoSignals();
  const research = demoResearch();
  const trends = demoTrends();
  const metrics = {
    watch_target_count: watchlist.length,
    signal_count: signals.length,
    signals_needs_review: signals.filter((signal) => signal.status === "needs_review").length,
    questions_open: research.questions.filter((question) => question.status !== "closed").length,
    briefs_needs_review: research.briefs.filter((brief) => brief.status === "needs_review").length,
    reports_ready: research.questions.filter((question) => question.status === "report_ready").length,
    trend_mover_count: trends.movers.length,
    opportunities_open: trends.opportunities.filter((item) => item.status === "needs_review").length,
  };
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-radar-demo",
    demo_scenario: scenario,
    range: { start: "2026-06-25", end: "2026-07-02" },
    metrics,
    watchlist,
    signals,
    research,
    trends,
    sync_log: [
      {
        at: "2026-07-02T07:55:00.000Z",
        actor: "kelly-radar-agent",
        action: "ingest_signals",
        detail: "3 new signals from Formora pricing + changelog check, 1 duplicate skipped.",
      },
      {
        at: "2026-07-01T21:10:00.000Z",
        actor: "kelly-radar-agent",
        action: "ingest_trends",
        detail: "8 trend movers refreshed; 2 rising queries imported from kelly-seo snapshot.",
      },
      {
        at: "2026-07-01T09:40:00.000Z",
        actor: "kelly-radar-agent",
        action: "file_report",
        detail: "Filed report for 'Should we build a mobile app?' with 5 cited sources.",
      },
    ],
  };
}

function demoWatchlist(): WatchTarget[] {
  return [
    target(
      "formora",
      "Formora",
      "competitor",
      "ok",
      "Closest direct competitor. Watch pricing and AI roadmap weekly.",
      "2026-07-02T07:50:00.000Z",
      4,
      [
        source(
          "formora-pricing",
          "pricing",
          "https://formora.example.com/pricing",
          "browser_agent",
          "2026-07-02T07:50:00.000Z",
          "2026-07-01T18:00:00.000Z",
        ),
        source(
          "formora-changelog",
          "changelog",
          "https://formora.example.com/changelog",
          "browser_agent",
          "2026-07-02T07:50:00.000Z",
          "2026-06-30T12:00:00.000Z",
        ),
        source(
          "formora-g2",
          "reviews",
          "https://www.g2.example.com/products/formora/reviews",
          "browser_agent",
          "2026-07-01T20:15:00.000Z",
          "2026-06-29T00:00:00.000Z",
        ),
      ],
    ),
    target(
      "tallyforge",
      "TallyForge",
      "competitor",
      "ok",
      "Fast-moving competitor; repositioning toward a docs+forms workspace.",
      "2026-07-01T20:30:00.000Z",
      3,
      [
        source(
          "tallyforge-pricing",
          "pricing",
          "https://tallyforge.example.com/pricing",
          "browser_agent",
          "2026-07-01T20:30:00.000Z",
          "2026-06-28T09:00:00.000Z",
        ),
        source(
          "tallyforge-landing",
          "landing",
          "https://tallyforge.example.com",
          "browser_agent",
          "2026-07-01T20:30:00.000Z",
          "2026-06-30T10:00:00.000Z",
        ),
        source(
          "tallyforge-hiring",
          "hiring",
          "https://tallyforge.example.com/careers",
          "browser_agent",
          "2026-07-01T20:28:00.000Z",
          "2026-06-27T00:00:00.000Z",
        ),
      ],
    ),
    target(
      "docupad",
      "DocuPad",
      "competitor",
      "warning",
      "Adjacent big player. Their embedded-forms beta could collapse our wedge.",
      "2026-06-30T22:00:00.000Z",
      2,
      [
        source(
          "docupad-changelog",
          "changelog",
          "https://docupad.example.com/whats-new",
          "browser_agent",
          "2026-06-30T22:00:00.000Z",
          "2026-06-30T16:00:00.000Z",
        ),
        source(
          "docupad-news",
          "news",
          "https://news.example.com/company/docupad",
          "manual",
          "2026-06-29T08:00:00.000Z",
          "2026-06-26T00:00:00.000Z",
        ),
      ],
    ),
    target(
      "kw-ai-form-builder",
      "ai form builder",
      "keyword",
      "ok",
      "Category keyword. Track launches and SERP movement.",
      "2026-07-01T21:00:00.000Z",
      1,
      [
        source(
          "ph-ai-forms",
          "launch",
          "https://producthunt.example.com/topics/forms",
          "browser_agent",
          "2026-07-01T21:00:00.000Z",
          "2026-06-30T14:00:00.000Z",
        ),
        source(
          "serp-ai-form-builder",
          "news",
          "https://search.example.com/?q=ai+form+builder",
          "browser_agent",
          "2026-07-01T21:00:00.000Z",
          "2026-07-01T21:00:00.000Z",
        ),
      ],
    ),
    target(
      "community-formbuilders",
      "r/formbuilders",
      "community",
      "stale",
      "Community pulse. Last crawl older than cadence; re-check due.",
      "2026-06-28T10:00:00.000Z",
      1,
      [
        source(
          "reddit-formbuilders",
          "community",
          "https://reddit.example.com/r/formbuilders",
          "browser_agent",
          "2026-06-28T10:00:00.000Z",
          "2026-06-28T10:00:00.000Z",
        ),
      ],
    ),
  ];
}

function demoSignals(): Signal[] {
  return [
    {
      ...signal(
        "sig-formora-pricing",
        "formora",
        "formora-pricing",
        "pricing",
        "high",
        "2026-07-01T18:04:00.000Z",
        "needs_review",
        "Formora raised Pro from $12 to $15/month",
        "Pro tier price increased 25% and the annual discount dropped from 20% to 15%. Free tier limits unchanged.",
        "This opens a pricing gap under $15 we can own. If churn chatter follows, a comparison page and a switch offer could convert their annual renewals.",
      ),
      proposed_action: "act",
      handoff: {
        operation: "handoff_content_brief",
        target: "kelly-writer",
        summary: "Comparison page: Formlet vs Formora after the price increase.",
      },
      diff: {
        before_label: "Pricing page · Jun 24 crawl",
        after_label: "Pricing page · Jul 1 crawl",
        lines: [
          diffLine("context", "Free — $0/mo · 3 forms · 100 responses"),
          diffLine("removed", "Pro — $12/mo billed monthly"),
          diffLine("added", "Pro — $15/mo billed monthly"),
          diffLine("removed", "Annual: save 20% ($115/yr)"),
          diffLine("added", "Annual: save 15% ($153/yr)"),
          diffLine("context", "Business — $49/mo · SSO · audit log"),
        ],
      },
      evidence: [
        evidence("Formora pricing page (live)", "https://formora.example.com/pricing"),
        evidence("Archived crawl, Jun 24", "https://archive.example.com/formora/pricing/2026-06-24"),
      ],
    },
    {
      ...signal(
        "sig-formora-ai-autofill",
        "formora",
        "formora-changelog",
        "changelog",
        "high",
        "2026-06-30T12:20:00.000Z",
        "needs_review",
        "Formora shipped AI form autofill",
        "Changelog entry announces AI autofill that pre-populates respondent fields from pasted text or uploaded documents. Rolled out to Pro and above.",
        "Direct overlap with our Q3 AI intake bet. We should test it this week and decide whether to fast-follow, differentiate on docs context, or reposition.",
      ),
      proposed_action: "watch",
      evidence: [
        evidence("Formora changelog: AI autofill", "https://formora.example.com/changelog#ai-autofill"),
        evidence("Launch thread on X", "https://x.example.com/formora/status/1943"),
      ],
    },
    {
      ...signal(
        "sig-ph-launch-fieldnote",
        "kw-ai-form-builder",
        "ph-ai-forms",
        "launch",
        "medium",
        "2026-06-30T14:05:00.000Z",
        "needs_review",
        "Product Hunt launch: Fieldnote — AI-native form builder",
        "New entrant launched at #3 product of the day with 412 upvotes. Pitch: forms that write themselves from a goal statement. Free while in beta.",
        "Third AI-native form launch this month. Category attention is rising; expect our 'ai form builder' keyword bets to get more expensive.",
      ),
      proposed_action: "watch",
      evidence: [
        evidence("Fieldnote on Product Hunt", "https://producthunt.example.com/posts/fieldnote"),
        evidence("Fieldnote landing page", "https://fieldnote.example.com"),
      ],
    },
    {
      ...signal(
        "sig-formora-reviews",
        "formora",
        "formora-g2",
        "reviews",
        "medium",
        "2026-06-29T09:15:00.000Z",
        "approved",
        "Spike of negative G2 reviews on Formora's new editor",
        "Six 1-2 star reviews in five days, all citing the forced migration to the new block editor: lost conditional logic, slower load, no rollback.",
        "Churn window. Their unhappy power users are exactly our ICP — a 'migrate from Formora' guide plus an import tool callout could capture them.",
      ),
      proposed_action: "act",
      handoff: {
        operation: "handoff_content_brief",
        target: "kelly-writer",
        summary: "Migration guide targeting Formora editor complaints, with importer CTA.",
      },
      triage: {
        kind: "signal",
        action: "approve",
        status: "approved",
        comment: "Yes — brief kelly-writer, lead with the conditional-logic loss.",
        decided_at: "2026-06-29T10:02:00.000Z",
      },
      evidence: [
        evidence("G2 reviews, filtered 1-2 stars", "https://www.g2.example.com/products/formora/reviews?stars=1,2"),
        evidence(
          "Reddit thread on the editor migration",
          "https://reddit.example.com/r/formbuilders/comments/editor_migration",
        ),
      ],
    },
    {
      ...signal(
        "sig-docupad-changelog",
        "docupad",
        "docupad-changelog",
        "changelog",
        "high",
        "2026-06-30T16:40:00.000Z",
        "approved",
        "DocuPad opened an embedded-forms beta",
        "What's-new post: native form blocks inside DocuPad docs, waitlist beta, no logic builder yet. Positioned as 'collect answers where the work happens'.",
        "Platform risk. If DocuPad bundles forms for free, our docs-first wedge narrows. We need their beta docs page under weekly watch.",
      ),
      proposed_action: "act",
      handoff: {
        operation: "add_watch_source",
        target: "docupad",
        summary: "Add DocuPad beta docs page as a monitored source (weekly).",
      },
      triage: {
        kind: "signal",
        action: "approve",
        status: "approved",
        comment: "Add the beta docs page as a source. Weekly is enough for now.",
        decided_at: "2026-07-01T08:44:00.000Z",
      },
      evidence: [
        evidence("DocuPad what's new: form blocks", "https://docupad.example.com/whats-new#form-blocks"),
        evidence("Beta waitlist page", "https://docupad.example.com/beta/forms"),
      ],
    },
    {
      ...signal(
        "sig-tallyforge-landing",
        "tallyforge",
        "tallyforge-landing",
        "landing",
        "medium",
        "2026-06-30T10:12:00.000Z",
        "needs_review",
        "TallyForge repositioned: 'The docs + forms workspace'",
        "Hero copy changed from 'Beautiful forms in minutes' to 'The docs + forms workspace for modern teams'. New section pairs docs and response tables.",
        "They are moving onto our positioning. Messaging collision likely within a quarter — worth a research question on how customers describe the two of us.",
      ),
      proposed_action: "watch",
      diff: {
        before_label: "Hero · Jun 23 crawl",
        after_label: "Hero · Jun 30 crawl",
        lines: [
          diffLine("removed", "Beautiful forms in minutes"),
          diffLine("added", "The docs + forms workspace for modern teams"),
          diffLine("context", "Start free — no credit card required"),
          diffLine("added", "New: response tables that live next to your docs"),
        ],
      },
      evidence: [evidence("TallyForge homepage", "https://tallyforge.example.com")],
    },
    {
      ...signal(
        "sig-tallyforge-hiring",
        "tallyforge",
        "tallyforge-hiring",
        "hiring",
        "low",
        "2026-06-27T11:00:00.000Z",
        "done",
        "TallyForge hiring a senior mobile engineer",
        "New careers listing: senior React Native engineer, 'own our mobile form-filling experience end to end'.",
        "Signals a mobile push in 2-3 quarters. Low urgency for us; our mobile decision is already covered by the open research report.",
      ),
      proposed_action: "ignore",
      triage: {
        kind: "signal",
        action: "ignore",
        status: "done",
        comment: "Covered by the mobile research report. No action.",
        decided_at: "2026-06-28T09:20:00.000Z",
      },
      evidence: [evidence("TallyForge careers", "https://tallyforge.example.com/careers/senior-mobile-engineer")],
    },
    {
      ...signal(
        "sig-formora-funding",
        "formora",
        "formora-changelog",
        "news",
        "medium",
        "2026-06-26T15:30:00.000Z",
        "done",
        "Formora raised a $4M seed extension",
        "TechPress reports a $4M extension led by existing investors, earmarked for 'AI features and going upmarket'.",
        "Explains the price increase and AI velocity. Context noted; no standalone action beyond the signals already in triage.",
      ),
      proposed_action: "ignore",
      triage: {
        kind: "signal",
        action: "ignore",
        status: "done",
        comment: "Context only. The pricing and AI signals carry the actions.",
        decided_at: "2026-06-27T08:10:00.000Z",
      },
      evidence: [
        evidence("TechPress: Formora seed extension", "https://news.example.com/2026/06/formora-seed-extension"),
      ],
    },
    {
      ...signal(
        "sig-community-thread",
        "community-formbuilders",
        "reddit-formbuilders",
        "community",
        "low",
        "2026-06-28T10:05:00.000Z",
        "needs_review",
        "Rising thread: 'Why I moved my client intake off big-suite forms'",
        "Thread at 280 upvotes. Freelancers complain big-suite forms feel corporate; commenters ask for lightweight, brandable, docs-friendly options.",
        "Good voice-of-customer material for the intake-forms opportunity card; several commenters describe our exact use case.",
      ),
      proposed_action: "watch",
      evidence: [
        evidence("Thread on r/formbuilders", "https://reddit.example.com/r/formbuilders/comments/client_intake"),
      ],
    },
    {
      ...signal(
        "sig-tallyforge-pricing-test",
        "tallyforge",
        "tallyforge-pricing",
        "pricing",
        "medium",
        "2026-06-28T09:22:00.000Z",
        "blocked",
        "TallyForge appears to be A/B testing annual-only pricing",
        "Two crawls an hour apart returned different pricing pages: one with monthly plans, one annual-only with a 'talk to us' monthly fallback.",
        "Cannot tell test from rollout on one sample. Needs 3-4 crawls across days/geos before this is triageable.",
      ),
      proposed_action: "needs_info",
      triage: {
        kind: "signal",
        action: "block",
        status: "blocked",
        comment: "Re-crawl over 4 days from two regions, then bring it back.",
        decided_at: "2026-06-29T07:55:00.000Z",
      },
      evidence: [
        evidence("Crawl A (monthly plans)", "https://archive.example.com/tallyforge/pricing/2026-06-28T08"),
        evidence("Crawl B (annual-only)", "https://archive.example.com/tallyforge/pricing/2026-06-28T09"),
      ],
    },
  ];
}

function demoResearch(): Research {
  const questions: ResearchQuestion[] = [
    {
      question_id: "q-sea-market",
      question: "How big is the Southeast Asia market for form/docs tooling, and which segment should we enter first?",
      status: "brief_needs_review",
      asked_at: "2026-07-01T10:00:00.000Z",
      depth: "standard",
      cost_note: "~2 agent hours, public sources only",
      brief_id: "brief-sea-market",
      report_id: "",
      confidence: null,
      followups: [],
    },
    {
      question_id: "q-editor-migration",
      question: "What exactly is driving churn from Formora's new editor, and how much of it can our importer capture?",
      status: "researching",
      asked_at: "2026-06-29T11:30:00.000Z",
      depth: "quick",
      cost_note: "~1 agent hour, reviews + community threads",
      brief_id: "brief-editor-migration",
      report_id: "",
      confidence: null,
      followups: [],
    },
    {
      question_id: "q-mobile-app",
      question: "Should we build a mobile app, or is a great mobile web filler experience enough for the next year?",
      status: "report_ready",
      asked_at: "2026-06-24T09:00:00.000Z",
      depth: "deep",
      cost_note: "~4 agent hours across app stores, reviews, and usage benchmarks",
      brief_id: "brief-mobile-app",
      report_id: "rep-mobile-app",
      confidence: 4,
      followups: [
        {
          followup_id: "fu-mobile-ratings",
          question: "Which competitor mobile apps have meaningful ratings volume?",
          status: "queued",
          asked_at: "2026-07-01T09:50:00.000Z",
        },
      ],
    },
    {
      question_id: "q-pricing-model",
      question: "Usage-based vs per-seat pricing for indie form builders: what does the category actually reward?",
      status: "closed",
      asked_at: "2026-06-10T14:00:00.000Z",
      depth: "standard",
      cost_note: "closed after pricing decision shipped",
      brief_id: "brief-pricing-model",
      report_id: "rep-pricing-model",
      confidence: 3,
      followups: [],
    },
  ];
  const briefs: Brief[] = [
    {
      brief_id: "brief-sea-market",
      question_id: "q-sea-market",
      status: "needs_review",
      drafted_at: "2026-07-01T12:20:00.000Z",
      depth: "standard",
      scope:
        "Size the SEA opportunity for form/docs tooling across ID, SG, VN, PH, TH. Segment by solo operators, agencies, and SMB ops teams. Exclude enterprise procurement-led deals.",
      planned_sources: [
        "Public market reports and press coverage on SEA SaaS adoption",
        "App marketplace category rankings per country",
        "Local community forums and Facebook groups for agencies",
        "Competitor localized pricing pages and language support",
        "Payment-method coverage notes (local rails vs cards)",
      ],
      expected_deliverable:
        "Cited report: market sizing ranges, top-2 entry segments, localization/payment blockers, and a go/no-go recommendation.",
      notes: "Depth capped at standard; escalate to deep only if the go signal is strong.",
    },
    {
      brief_id: "brief-editor-migration",
      question_id: "q-editor-migration",
      status: "approved",
      drafted_at: "2026-06-29T12:00:00.000Z",
      depth: "quick",
      scope:
        "Catalog Formora editor complaints from G2, Reddit, and X since the migration. Classify by lost feature, quantify mentions, and map each to our importer coverage.",
      planned_sources: [
        "G2 review stream",
        "r/formbuilders threads",
        "X keyword search",
        "Our importer feature matrix",
      ],
      expected_deliverable:
        "Short memo: top complaint clusters with counts, importer gap list, and suggested landing-page claims we can support.",
      notes: "Approved 2026-06-29. Research in progress.",
    },
    {
      brief_id: "brief-mobile-app",
      question_id: "q-mobile-app",
      status: "approved",
      drafted_at: "2026-06-24T10:15:00.000Z",
      depth: "deep",
      scope:
        "Compare native app vs mobile web for form filling and light editing. Benchmark competitor apps, store ratings, and published mobile usage shares for form tools.",
      planned_sources: [
        "App store listings and ratings",
        "Competitor changelogs",
        "Public mobile usage benchmarks",
        "Our own analytics (mobile share)",
        "Support ticket themes",
      ],
      expected_deliverable: "Cited report with a build/hold recommendation and triggers that would flip it.",
      notes: "Report filed 2026-07-01.",
    },
    {
      brief_id: "brief-pricing-model",
      question_id: "q-pricing-model",
      status: "approved",
      drafted_at: "2026-06-10T15:00:00.000Z",
      depth: "standard",
      scope:
        "Survey pricing models across 12 form-builder competitors; correlate model with public revenue/growth signals where available.",
      planned_sources: ["Competitor pricing pages", "Founder interviews and podcasts", "Public revenue posts"],
      expected_deliverable: "Recommendation memo for the 2026 pricing revision.",
      notes: "Closed. Fed the June pricing change.",
    },
  ];
  const reports: Report[] = [
    {
      report_id: "rep-mobile-app",
      question_id: "q-mobile-app",
      title: "Mobile app vs mobile web for Formlet: hold native, invest in mobile web filling",
      filed_at: "2026-07-01T09:40:00.000Z",
      summary:
        "Respondents fill forms on mobile constantly, but creators build on desktop. Competitor native apps are poorly rated and mostly wrap the web view. Recommendation: hold on native for 12 months, ship a best-in-class mobile web filler, and define two triggers that would flip the call.",
      confidence: 4,
      sections: [
        {
          section_id: "sec-demand",
          heading: "1. Where mobile demand actually is",
          body: "Across public benchmarks and our own analytics, 55-70% of form submissions happen on mobile, but under 8% of form creation sessions do. The demand is respondent-side filling, not creator-side building. A native creator app would serve the minority workflow; the filling experience is reachable entirely through mobile web. [1][2]",
          source_ids: ["src-benchmark", "src-analytics"],
        },
        {
          section_id: "sec-competitors",
          heading: "2. What competitor mobile apps teach us",
          body: "Formora's iOS app holds a 3.1 rating with reviews calling it 'the website in a wrapper'; TallyForge has no app but their hiring signals one is coming. The one well-rated app in the category (FormRail, 4.6) is respondent-only offline capture — a niche we do not currently serve. Native apps in this category win only when they do something the browser cannot: offline capture and push notifications. [3][4]",
          source_ids: ["src-appstore", "src-hiring"],
        },
        {
          section_id: "sec-recommendation",
          heading: "3. Recommendation and flip triggers",
          body: "Hold native for 12 months. Invest the equivalent of one engineer-quarter into mobile web filling: sub-second load, autosave, camera/file upload polish. Revisit if either trigger fires: (a) offline capture requests exceed 5% of support volume, or (b) a top-2 competitor ships a well-rated native app and cites it in win/loss. Estimated saving vs building now: 2-3 engineer-quarters. [5]",
          source_ids: ["src-support"],
        },
      ],
      sources: [
        reportSource(
          "src-benchmark",
          "Form completion device-share benchmarks 2025",
          "https://benchmarks.example.com/forms-device-share-2025",
        ),
        reportSource(
          "src-analytics",
          "Formlet internal analytics: device mix, May-Jun 2026",
          "local://analytics/device-mix-2026-06",
        ),
        reportSource(
          "src-appstore",
          "App Store + Play listings: Formora, FormRail",
          "https://appstore.example.com/formora",
        ),
        reportSource(
          "src-hiring",
          "TallyForge careers: senior mobile engineer",
          "https://tallyforge.example.com/careers/senior-mobile-engineer",
        ),
        reportSource("src-support", "Formlet support themes export, Q2 2026", "local://support/themes-2026-q2"),
      ],
      annotations: [
        {
          annotation_id: "ann-1",
          author: "Kelly",
          at: "2026-07-01T16:20:00.000Z",
          section_id: "sec-recommendation",
          text: "Agree with the hold. Add the offline-capture support-volume counter to the monthly metrics review so trigger (a) is actually watched.",
        },
      ],
    },
    {
      report_id: "rep-pricing-model",
      question_id: "q-pricing-model",
      title: "Pricing models in the form-builder category: seats lose, limits win",
      filed_at: "2026-06-14T11:00:00.000Z",
      summary:
        "Category rewards response/feature limits over per-seat pricing for indie and SMB segments. Informed the June pricing revision; kept for reference.",
      confidence: 3,
      sections: [
        {
          section_id: "sec-pricing-findings",
          heading: "1. Findings",
          body: "10 of 12 surveyed competitors gate on responses or features, not seats. The two seat-priced products both target teams above 20 people. [1]",
          source_ids: ["src-pricing-pages"],
        },
      ],
      sources: [
        reportSource(
          "src-pricing-pages",
          "Competitor pricing page survey, June 2026",
          "https://archive.example.com/pricing-survey-2026-06",
        ),
      ],
      annotations: [],
    },
  ];
  return { questions, briefs, reports };
}

function demoTrends(): Trends {
  const movers: Mover[] = [
    mover(
      "mv-ai-form-builder",
      "ai form builder",
      "search",
      9200,
      64,
      [34, 38, 45, 52, 58, 71, 84, 100],
      "opp-ai-form-builder",
    ),
    mover("mv-typeform-alternative", "typeform alternative", "search", 6100, 22, [58, 60, 57, 64, 66, 70, 69, 74], ""),
    mover(
      "mv-hipaa-forms",
      "hipaa compliant forms",
      "search",
      2400,
      41,
      [40, 42, 47, 45, 55, 61, 68, 72],
      "opp-hipaa-forms",
    ),
    mover("mv-form-to-pdf", "form to pdf workflow", "search", 1900, 18, [51, 49, 54, 56, 55, 60, 62, 63], ""),
    mover("mv-ai-intake", "ai intake forms", "community", 780, 96, [12, 14, 19, 26, 30, 41, 55, 68], ""),
    mover(
      "mv-docs-embedded-forms",
      "docs with embedded forms",
      "category",
      540,
      35,
      [30, 33, 31, 38, 41, 44, 48, 52],
      "",
    ),
    mover(
      "mv-conversational-forms",
      "conversational forms",
      "community",
      460,
      -12,
      [66, 61, 58, 60, 54, 50, 49, 47],
      "",
    ),
    mover("mv-form-analytics", "form analytics", "community", 390, 9, [42, 44, 43, 46, 45, 47, 48, 49], ""),
  ];
  const opportunities: Trends["opportunities"] = [
    {
      opportunity_id: "opp-ai-form-builder",
      title: "Own the 'ai form builder' comparison surface before it saturates",
      mover_ids: ["mv-ai-form-builder", "mv-ai-intake"],
      status: "needs_review",
      created_at: "2026-07-01T21:20:00.000Z",
      rationale:
        "Search interest up 64% in 8 weeks and three AI-native launches this month. The comparison/alternatives surface is still winnable; in two quarters it will not be.",
      proposed_next_step: {
        operation: "handoff_content_brief",
        target: "kelly-writer",
        summary: "Content brief: 'best AI form builders 2026' hub page + Formlet AI positioning refresh.",
      },
    },
    {
      opportunity_id: "opp-hipaa-forms",
      title: "HIPAA-compliant intake as a paid tier differentiator",
      mover_ids: ["mv-hipaa-forms"],
      status: "approved",
      created_at: "2026-06-30T18:00:00.000Z",
      rationale:
        "Steady 41% rise from health/wellness solo practices. Competitors gate HIPAA behind $99+ tiers; a $29 HIPAA add-on would undercut the category.",
      proposed_next_step: {
        operation: "handoff_roadmap_candidate",
        target: "kelly-feedback",
        summary: "Roadmap candidate: HIPAA-compliant forms add-on (BAA, encrypted storage, audit log).",
      },
      triage: {
        kind: "opportunity",
        action: "approve",
        status: "approved",
        comment: "Queue it for roadmap review with the compliance cost estimate attached.",
        decided_at: "2026-07-01T08:50:00.000Z",
      },
    },
  ];
  return { movers, opportunities };
}

function localizeSnapshotZh(snapshot: RadarSnapshot): RadarSnapshot {
  const signalText: Record<string, string[]> = {
    "sig-formora-pricing": [
      "Formora 将 Pro 价格从 $12 提到 $15/月",
      "Pro 档涨价 25%，年付折扣从 20% 降到 15%。免费档限制不变。",
      "$15 以下出现了我们可以占领的价格空档。如果随之出现流失讨论，一个对比页加迁移优惠就能转化他们的年付续费用户。",
    ],
    "sig-formora-ai-autofill": [
      "Formora 上线 AI 表单自动填充",
      "更新日志宣布 AI 自动填充：从粘贴文本或上传文档预填答题字段，Pro 及以上可用。",
      "与我们 Q3 的 AI 收集方向直接重叠。本周应实测，并决定跟进、以文档上下文差异化、还是重新定位。",
    ],
    "sig-ph-launch-fieldnote": [
      "Product Hunt 新品：Fieldnote — AI 原生表单工具",
      "新玩家以当日第 3 名、412 票上线。卖点：从一句目标自动生成表单，测试期免费。",
      "本月第三个 AI 原生表单发布。品类关注度上升，我们的 'ai form builder' 关键词投入会更贵。",
    ],
    "sig-formora-reviews": [
      "Formora 新编辑器在 G2 出现差评潮",
      "五天内六条 1-2 星差评，均指向强制迁移到新块编辑器：条件逻辑丢失、加载变慢、无法回滚。",
      "流失窗口期。他们不满的重度用户正是我们的目标客户——一篇迁移指南加导入工具入口就能承接。",
    ],
    "sig-docupad-changelog": [
      "DocuPad 开放内嵌表单 Beta",
      "更新公告：文档内原生表单块，waitlist 制 Beta，暂无逻辑编辑器。定位是『在工作发生的地方收集答案』。",
      "平台风险。如果 DocuPad 免费捆绑表单，我们文档优先的切入点会收窄。需要把他们的 Beta 文档页纳入每周监控。",
    ],
    "sig-tallyforge-landing": [
      "TallyForge 重新定位：『文档 + 表单工作台』",
      "首页主文案从『几分钟做出漂亮表单』改为『现代团队的文档 + 表单工作台』，新增文档与回复表格并排的区块。",
      "他们在向我们的定位靠拢。一个季度内大概率发生信息对撞——值得立一个研究问题：客户如何描述我们两家。",
    ],
    "sig-tallyforge-hiring": [
      "TallyForge 招聘资深移动端工程师",
      "新职位：资深 React Native 工程师，『端到端负责移动填表体验』。",
      "预示 2-3 个季度后的移动端动作。对我们urgency不高；移动端决策已由研究报告覆盖。",
    ],
    "sig-formora-funding": [
      "Formora 完成 $4M 种子轮延伸",
      "TechPress 报道现有投资人领投 $4M，用于『AI 功能和向上市场走』。",
      "解释了涨价与 AI 速度。作为背景记录即可；行动已由涨价与 AI 两条信号承载。",
    ],
    "sig-community-thread": [
      "热帖：『我为什么把客户 intake 从大厂表单搬走』",
      "帖子 280 赞。自由职业者抱怨大厂表单太企业化，评论区在找轻量、可定制、贴近文档的替代品。",
      "是 intake 机会卡的一手用户声音；多位评论者描述的正是我们的场景。",
    ],
    "sig-tallyforge-pricing-test": [
      "TallyForge 疑似在 A/B 测试仅年付定价",
      "相隔一小时的两次抓取返回不同定价页：一个含月付，一个仅年付并把月付改为『联系我们』。",
      "单一样本无法区分测试与全量。需要跨天、跨地区再抓 3-4 次才能进入 triage。",
    ],
  };
  snapshot.signals = snapshot.signals.map((item) => {
    const text = signalText[item.signal_id];
    return text ? { ...item, headline: text[0], summary: text[1], why_it_matters: text[2] } : item;
  });
  const questionText: Record<string, string> = {
    "q-sea-market": "东南亚表单/文档工具市场有多大？我们应该先切入哪个细分？",
    "q-editor-migration": "Formora 新编辑器到底在流失什么用户？我们的导入工具能承接多少？",
    "q-mobile-app": "我们该做移动 App，还是一年内做好移动网页填表体验就够了？",
    "q-pricing-model": "独立表单工具按用量还是按席位定价：这个品类真正奖励哪种模式？",
  };
  snapshot.research.questions = snapshot.research.questions.map((item) => ({
    ...item,
    question: questionText[item.question_id] || item.question,
  }));
  const opportunityText: Record<string, string> = {
    "opp-ai-form-builder": "在饱和之前拿下 'ai form builder' 对比流量入口",
    "opp-hipaa-forms": "把 HIPAA 合规 intake 做成付费档差异点",
  };
  snapshot.trends.opportunities = snapshot.trends.opportunities.map((item) => ({
    ...item,
    title: opportunityText[item.opportunity_id] || item.title,
  }));
  return snapshot;
}

function target(
  target_id: string,
  name: string,
  type: WatchTarget["type"],
  status: WatchTarget["status"],
  notes: string,
  last_check_at: string,
  signals_7d: number,
  sources: Source[],
): WatchTarget {
  return { target_id, name, type, status, notes, last_check_at, signals_7d, sources };
}

function source(
  source_id: string,
  kind: Source["kind"],
  url: string,
  method: Source["method"],
  last_check_at: string,
  last_change_at: string,
): Source {
  return { source_id, kind, url, method, last_check_at, last_change_at };
}

function signal(
  signal_id: string,
  target_id: string,
  source_id: string,
  source_kind: Signal["source_kind"],
  severity: Signal["severity"],
  detected_at: string,
  status: Signal["status"],
  headline: string,
  summary: string,
  why_it_matters: string,
): Signal {
  return {
    signal_id,
    target_id,
    source_id,
    source_kind,
    severity,
    detected_at,
    status,
    headline,
    summary,
    why_it_matters,
    content_hash: `demo-${signal_id}`,
    evidence: [],
  };
}

function diffLine(type: DiffLine["type"], text: string): DiffLine {
  return { type, text };
}

function evidence(title: string, url: string): Evidence {
  return { title, url };
}

function reportSource(source_id: string, title: string, url: string): ReportSource {
  return { source_id, title, url, accessed_at: now };
}

function mover(
  mover_id: string,
  keyword: string,
  sourceKind: Mover["source"],
  volume_proxy: number,
  delta_pct: number,
  momentum: number[],
  opportunity_id: string,
): Mover {
  return {
    mover_id,
    keyword,
    source: sourceKind,
    volume_proxy,
    delta_pct,
    momentum,
    first_seen: "2026-05-08",
    last_updated: now,
    opportunity_id,
  };
}
