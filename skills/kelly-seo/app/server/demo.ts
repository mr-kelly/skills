// Deterministic demo scenes for Kelly SEO. Never reads or writes app/.data.
// Persona: Featherlog, an indie SaaS for changelogs and release notes, with a
// marketing site and a docs subdomain, both verified in Google Search Console.

import { evaluateGeoGate } from "../../lib/geo-qa.ts";
import type {
  AiVisibility,
  DemoQuery,
  EntityReadiness,
  GeoOpportunity,
  Opportunity,
  PageRow,
  QueryRow,
  SeoSnapshot,
} from "./types.ts";

const NOW = "2026-07-01T08:00:00.000Z";
const RANGE = {
  current: { start: "2026-06-01", end: "2026-06-28" },
  previous: { start: "2026-05-04", end: "2026-05-31" },
};

const SITES = [
  {
    site_id: "featherlog-app",
    property_url: "https://featherlog.app/",
    verification_type: "url_prefix",
    permission_level: "siteOwner",
    totals: { clicks: 3480, impressions: 68400, position: 7.4 },
    previous: { clicks: 3160, impressions: 64100, position: 7.9 },
  },
  {
    site_id: "featherlog-docs",
    property_url: "https://docs.featherlog.app/",
    verification_type: "url_prefix",
    permission_level: "siteFullUser",
    totals: { clicks: 610, impressions: 6900, position: 5.2 },
    previous: { clicks: 540, impressions: 6500, position: 5.6 },
  },
];

// [site_id, query, clicks, impressions, position, prevClicks, prevImpressions, prevPosition, pages]
const QUERY_ROWS: QueryRow[] = [
  [
    "featherlog-app",
    "release notes examples",
    620,
    8900,
    4.2,
    540,
    8200,
    4.8,
    ["https://featherlog.app/blog/release-notes-examples", "https://featherlog.app/templates/release-notes"],
  ],
  [
    "featherlog-app",
    "changelog tool",
    610,
    5400,
    3.1,
    590,
    5300,
    3.2,
    ["https://featherlog.app/", "https://featherlog.app/pricing"],
  ],
  [
    "featherlog-app",
    "how to write release notes",
    410,
    7200,
    5.6,
    360,
    6800,
    6.1,
    ["https://featherlog.app/blog/how-to-write-release-notes", "https://featherlog.app/templates/release-notes"],
  ],
  [
    "featherlog-app",
    "release notes vs changelog",
    96,
    4900,
    9.2,
    88,
    4300,
    10.4,
    ["https://featherlog.app/blog/release-notes-vs-changelog"],
  ],
  [
    "featherlog-app",
    "public changelog page",
    140,
    2600,
    6.4,
    150,
    2700,
    6.2,
    ["https://featherlog.app/", "https://featherlog.app/features/changelog-widget"],
  ],
  [
    "featherlog-app",
    "changelog widget for website",
    84,
    2100,
    7.8,
    60,
    1800,
    8.9,
    ["https://featherlog.app/features/changelog-widget"],
  ],
  [
    "featherlog-app",
    "keep a changelog format",
    74,
    3800,
    8.7,
    79,
    3900,
    8.5,
    ["https://featherlog.app/blog/changelog-best-practices"],
  ],
  [
    "featherlog-app",
    "product update announcement examples",
    34,
    2900,
    11.3,
    40,
    3100,
    10.9,
    ["https://featherlog.app/blog/release-notes-examples"],
  ],
  [
    "featherlog-app",
    "release notes template",
    178,
    5100,
    6.9,
    210,
    5600,
    6.3,
    ["https://featherlog.app/templates/release-notes"],
  ],
  ["featherlog-app", "changelog api", 15, 1500, 12.6, 9, 1200, 14.2, ["https://docs.featherlog.app/api/changelog"]],
  [
    "featherlog-app",
    "in app announcement banner",
    19,
    2400,
    13.8,
    22,
    2500,
    13.5,
    ["https://featherlog.app/features/changelog-widget"],
  ],
  [
    "featherlog-app",
    "saas changelog examples",
    120,
    1900,
    5.2,
    96,
    1600,
    5.9,
    ["https://featherlog.app/blog/release-notes-examples", "https://featherlog.app/"],
  ],
  [
    "featherlog-app",
    "release notes generator",
    52,
    3300,
    9.8,
    47,
    3000,
    10.6,
    ["https://featherlog.app/templates/release-notes"],
  ],
  [
    "featherlog-app",
    "changelog best practices",
    66,
    1700,
    7.1,
    62,
    1650,
    7.4,
    ["https://featherlog.app/blog/changelog-best-practices"],
  ],
  [
    "featherlog-app",
    "product update email template",
    61,
    2800,
    8.4,
    74,
    3000,
    7.9,
    ["https://featherlog.app/templates/product-update-email"],
  ],
  [
    "featherlog-app",
    "headway alternative",
    92,
    980,
    4.6,
    71,
    820,
    5.4,
    ["https://featherlog.app/compare/headway-alternative"],
  ],
  [
    "featherlog-app",
    "beamer alternative",
    44,
    760,
    5.8,
    39,
    700,
    6.1,
    ["https://featherlog.app/compare/headway-alternative"],
  ],
  [
    "featherlog-app",
    "what's new page examples",
    16,
    1400,
    10.4,
    18,
    1500,
    10.1,
    ["https://featherlog.app/blog/release-notes-examples"],
  ],
  [
    "featherlog-app",
    "semantic versioning changelog",
    11,
    1900,
    14.6,
    12,
    2000,
    14.4,
    ["https://featherlog.app/blog/changelog-best-practices"],
  ],
  [
    "featherlog-app",
    "announce new features to users",
    58,
    1300,
    6.6,
    43,
    1100,
    7.5,
    ["https://featherlog.app/blog/how-to-write-release-notes"],
  ],
  [
    "featherlog-docs",
    "featherlog api docs",
    210,
    640,
    1.2,
    190,
    600,
    1.3,
    ["https://docs.featherlog.app/api/changelog"],
  ],
  [
    "featherlog-docs",
    "featherlog slack integration",
    120,
    380,
    1.4,
    105,
    350,
    1.5,
    ["https://docs.featherlog.app/getting-started"],
  ],
  [
    "featherlog-docs",
    "embed changelog widget react",
    52,
    1200,
    6.2,
    41,
    1000,
    7.0,
    ["https://docs.featherlog.app/widgets/embed"],
  ],
  ["featherlog-docs", "changelog webhook events", 14, 720, 8.9, 12, 680, 9.3, ["https://docs.featherlog.app/webhooks"]],
  [
    "featherlog-docs",
    "import from headway",
    39,
    260,
    3.4,
    28,
    210,
    3.9,
    ["https://docs.featherlog.app/import-from-headway"],
  ],
  [
    "featherlog-docs",
    "changelog rss feed setup",
    21,
    540,
    7.6,
    24,
    580,
    7.2,
    ["https://docs.featherlog.app/widgets/embed"],
  ],
  [
    "featherlog-docs",
    "featherlog markdown syntax",
    74,
    310,
    2.1,
    70,
    300,
    2.2,
    ["https://docs.featherlog.app/getting-started"],
  ],
  [
    "featherlog-docs",
    "custom domain changelog",
    30,
    480,
    5.4,
    22,
    400,
    6.2,
    ["https://docs.featherlog.app/getting-started"],
  ],
  [
    "featherlog-docs",
    "changelog widget css customization",
    6,
    350,
    9.4,
    7,
    380,
    9.1,
    ["https://docs.featherlog.app/widgets/embed"],
  ],
  [
    "featherlog-docs",
    "api rate limits featherlog",
    18,
    190,
    4.8,
    15,
    170,
    5.1,
    ["https://docs.featherlog.app/api/changelog"],
  ],
];

// [site_id, url, clicks, impressions, position, prevClicks, prevImpressions, prevPosition, issues]
const PAGE_ROWS: PageRow[] = [
  ["featherlog-app", "https://featherlog.app/", 480, 6100, 4.1, 440, 5800, 4.3, []],
  ["featherlog-app", "https://featherlog.app/pricing", 96, 2200, 6.8, 90, 2100, 7.0, []],
  ["featherlog-app", "https://featherlog.app/blog/release-notes-examples", 640, 9400, 4.5, 560, 8600, 5.0, []],
  ["featherlog-app", "https://featherlog.app/blog/how-to-write-release-notes", 405, 7000, 5.7, 350, 6600, 6.2, []],
  ["featherlog-app", "https://featherlog.app/blog/release-notes-vs-changelog", 95, 4800, 9.2, 86, 4200, 10.3, []],
  ["featherlog-app", "https://featherlog.app/features/changelog-widget", 88, 2300, 7.9, 66, 2000, 8.8, []],
  ["featherlog-app", "https://featherlog.app/templates/release-notes", 170, 5000, 6.9, 200, 5400, 6.4, []],
  ["featherlog-app", "https://featherlog.app/blog/changelog-best-practices", 64, 1700, 7.2, 61, 1650, 7.4, []],
  ["featherlog-app", "https://featherlog.app/templates/product-update-email", 58, 2700, 8.5, 70, 2900, 8.0, []],
  [
    "featherlog-app",
    "https://featherlog.app/compare/headway-alternative",
    90,
    950,
    4.7,
    70,
    800,
    5.5,
    ["canonical_mismatch"],
  ],
  ["featherlog-docs", "https://docs.featherlog.app/getting-started", 160, 900, 2.3, 150, 880, 2.4, []],
  ["featherlog-docs", "https://docs.featherlog.app/widgets/embed", 55, 1250, 6.4, 44, 1050, 7.1, []],
  ["featherlog-docs", "https://docs.featherlog.app/api/changelog", 60, 800, 5.9, 52, 760, 6.3, []],
  ["featherlog-docs", "https://docs.featherlog.app/webhooks", 15, 740, 8.8, 13, 700, 9.2, []],
  ["featherlog-docs", "https://docs.featherlog.app/import-from-headway", 38, 250, 3.5, 27, 200, 4.0, ["not_indexed"]],
];

const QUERY_AGENT_NOTES = {
  "release notes vs changelog":
    "Striking distance: position 9.2 with strong impressions. Opportunity #1 proposes expanding the article with a comparison table and FAQ; approve there to act on this query.",
  "product update email template":
    "CTR is below the expected curve for position 8.4 and clicks fell month over month. Opportunity #3 rewrites the title and meta description.",
  "changelog widget for website":
    "Gaining after the feature page refresh. Opportunity #4 adds internal links to consolidate the climb toward positions 5-6.",
};

const QUERY_AGENT_NOTES_ZH = {
  "release notes vs changelog":
    "擦边排名：第 9.2 位且曝光量高。优化项 #1 建议为文章补充对比表格和 FAQ；在那里批准即可推进该查询词。",
  "product update email template": "CTR 低于 8.4 位应有的曲线，点击环比下降。优化项 #3 会改写标题与 meta 描述。",
  "changelog widget for website": "功能页更新后持续上升。优化项 #4 通过补充内链帮助其冲向 5-6 位。",
};

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(buildDemoSnapshot()) : buildDemoSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-seo",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-seo/config.json",
      is_example: false,
      sites: snapshot.sites.map((site) => ({
        site_id: site.site_id,
        property_url: site.property_url,
        verification_type: site.verification_type,
      })),
      auth: {
        method: "service_account",
        service_account_file_env: "KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE",
        service_account_ready: true,
        access_token_env: "KELLY_SEO_GSC_ACCESS_TOKEN",
        access_token_ready: false,
      },
      sync: { window_days: 28, compare_previous_period: true, row_limit: 250, read_only: true },
    },
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(zh),
    snapshot,
  };
}

export function buildDemoSnapshot(): SeoSnapshot {
  const sites = SITES.map((site) => ({
    site_id: site.site_id,
    property_url: site.property_url,
    verification_type: site.verification_type,
    permission_level: site.permission_level,
    status: "ok",
    last_sync_at: NOW,
    totals: withCtr(site.totals),
    previous: withCtr(site.previous),
  }));
  const daily = SITES.flatMap((site) => dailySeries(site));
  const queries = QUERY_ROWS.map((row) => queryEntry(...row));
  const pages = PAGE_ROWS.map((row) => pageEntry(...row, queries));
  const opportunities = demoOpportunities();
  const totals = sumTotals(sites.map((site) => site.totals));
  const prev = sumTotals(sites.map((site) => site.previous));
  return {
    schema_version: "1",
    generated_at: NOW,
    source: "kelly-seo-demo",
    range: RANGE,
    metrics: {
      site_count: sites.length,
      query_count: queries.length,
      page_count: pages.length,
      opportunity_count: opportunities.length,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.ctr,
      position: totals.position,
      prev_clicks: prev.clicks,
      prev_impressions: prev.impressions,
      prev_ctr: prev.ctr,
      prev_position: prev.position,
    },
    sites,
    daily,
    queries,
    pages,
    opportunities,
    warnings: [],
    ai_visibility: demoAiVisibility(),
    geo_opportunities: demoGeoOpportunities(),
    entity_signals: demoEntitySignals(),
  };
}

const GEO_ENGINES = ["chatgpt", "perplexity", "gemini", "claude", "copilot"] as const;

// AI-visibility matrix: 5 tracked prompts across 5 engines, with per-engine
// mention/position/sentiment and a per-prompt visibility trend. Deterministic.
function demoAiVisibility(): AiVisibility {
  const prompts = [
    {
      prompt_id: "geo-best-changelog-tool",
      prompt: "What's the best changelog tool for a SaaS product?",
      intent: "comparison",
      cell: {
        chatgpt: [true, 2, "positive", "https://featherlog.app/"],
        perplexity: [true, 1, "positive", "https://featherlog.app/blog/release-notes-examples"],
        gemini: [true, 4, "neutral", "https://featherlog.app/"],
        claude: [true, 3, "positive", "https://featherlog.app/compare/headway-alternative"],
        copilot: [false, null, null, ""],
      },
      base: 0.62,
    },
    {
      prompt_id: "geo-release-notes-vs-changelog",
      prompt: "What's the difference between release notes and a changelog?",
      intent: "definition",
      cell: {
        chatgpt: [true, 3, "neutral", "https://featherlog.app/blog/release-notes-vs-changelog"],
        perplexity: [true, 2, "positive", "https://featherlog.app/blog/release-notes-vs-changelog"],
        gemini: [false, null, null, ""],
        claude: [true, 4, "neutral", "https://featherlog.app/blog/release-notes-vs-changelog"],
        copilot: [false, null, null, ""],
      },
      base: 0.4,
    },
    {
      prompt_id: "geo-headway-alternative",
      prompt: "What is a good Headway alternative for release notes?",
      intent: "alternative",
      cell: {
        chatgpt: [true, 1, "positive", "https://featherlog.app/compare/headway-alternative"],
        perplexity: [true, 2, "positive", "https://featherlog.app/compare/headway-alternative"],
        gemini: [true, 2, "positive", "https://featherlog.app/compare/headway-alternative"],
        claude: [true, 1, "positive", "https://featherlog.app/compare/headway-alternative"],
        copilot: [true, 3, "neutral", "https://featherlog.app/compare/headway-alternative"],
      },
      base: 0.8,
    },
    {
      prompt_id: "geo-embed-changelog-widget",
      prompt: "How do I embed a changelog widget on my website?",
      intent: "how-to",
      cell: {
        chatgpt: [false, null, null, ""],
        perplexity: [true, 3, "neutral", "https://docs.featherlog.app/widgets/embed"],
        gemini: [false, null, null, ""],
        claude: [true, 5, "neutral", "https://docs.featherlog.app/widgets/embed"],
        copilot: [false, null, null, ""],
      },
      base: 0.28,
    },
    {
      prompt_id: "geo-write-release-notes",
      prompt: "How should I write release notes users actually read?",
      intent: "how-to",
      cell: {
        chatgpt: [true, 4, "neutral", "https://featherlog.app/blog/how-to-write-release-notes"],
        perplexity: [true, 3, "positive", "https://featherlog.app/blog/how-to-write-release-notes"],
        gemini: [true, 5, "neutral", "https://featherlog.app/blog/how-to-write-release-notes"],
        claude: [false, null, null, ""],
        copilot: [false, null, null, ""],
      },
      base: 0.5,
    },
  ];

  const built = prompts.map((entry) => {
    const mentions = GEO_ENGINES.map((engine) => {
      const [mentioned, position, sentiment, cited] = entry.cell[engine];
      return {
        engine,
        mentioned: Boolean(mentioned),
        position: (position as number | null) ?? null,
        sentiment: (sentiment as "positive" | "neutral" | "negative" | null) ?? null,
        cited_url: String(cited || ""),
        note: "",
      };
    });
    return {
      prompt_id: entry.prompt_id,
      prompt: entry.prompt,
      intent: entry.intent,
      mentions,
      trend: geoTrend(entry.prompt_id, entry.base),
    };
  });

  const cellCount = built.length * GEO_ENGINES.length;
  const hits = built.reduce((sum, prompt) => sum + prompt.mentions.filter((m) => m.mentioned).length, 0);
  const score = Math.round((hits / cellCount) * 100);
  return {
    brand: "Featherlog",
    engines: [...GEO_ENGINES],
    score,
    prev_score: Math.max(0, score - 9),
    prompts: built,
  };
}

function geoTrend(seedKey, base) {
  const dates = dateRange(RANGE.current.start, RANGE.current.end).filter((_, index) => index % 4 === 0);
  const rand = seededRandom(`geo:${seedKey}`);
  let value = Math.max(0.05, base - 0.18);
  return dates.map((date) => {
    value = Math.max(0, Math.min(1, value + (rand() - 0.35) * 0.14));
    return { date, visibility: round1(value) };
  });
}

// Six agent-proposed GEO content optimizations reviewed with the five-state
// model, each scored by geo-qa. One is BLOCKed for a fabricated stat.
function demoGeoOpportunities(): GeoOpportunity[] {
  const raw = [
    {
      id: "geo-opp-qa-changelog-tool",
      ref: 1,
      type: "qa_block" as const,
      title: "Add a self-contained Q&A block to the changelog-tool comparison",
      target_page: "https://featherlog.app/",
      target_prompt: "What's the best changelog tool for a SaaS product?",
      reason:
        "Perplexity and ChatGPT already cite the homepage, but the page has no lift-ready Q&A. A direct question/answer block gives engines a clean passage to quote for this prompt.",
      expected_impact:
        "Adds a citable answer for the top comparison prompt; likely lifts Copilot from no-mention to cited.",
      draft:
        "## Is Featherlog a good changelog tool for SaaS?\n\nFeatherlog is a changelog and release-notes tool built for SaaS teams. You write updates in Markdown, publish a hosted changelog page, and embed a widget in your app. It supports a public changelog, an in-app 'what's new' widget, and an RSS feed from one source.\n\n**Q: Does it work for both a public changelog and in-app announcements?**\nYes — one entry publishes to the hosted page, the embeddable widget, and the RSS feed at the same time.",
      grounding: [
        "Product surface: Markdown editor, hosted changelog page, embeddable widget (see /features/changelog-widget).",
        "RSS feed documented at docs.featherlog.app/widgets/embed.",
      ],
      gateInput: { has_qa_block: true, has_schema: true, claims: [] },
      status: "needs_review",
      agent_notes: "Kept entirely qualitative — no numbers to ground. Pairs with the FAQ schema opportunity #4.",
      decision: null,
    },
    {
      id: "geo-opp-quotable-stats-headway",
      ref: 2,
      type: "quotable_stats" as const,
      title: "BLOCKED: quotable migration stats on the Headway alternative page",
      target_page: "https://featherlog.app/compare/headway-alternative",
      target_prompt: "What is a good Headway alternative for release notes?",
      reason:
        "The comparison page is cited by every engine but has no crisp, quotable numbers. A stat line would make the citation more concrete.",
      expected_impact:
        "A quotable migration stat would strengthen the already-strong citation across all five engines.",
      draft:
        "Teams switch from Headway to Featherlog in under 10 minutes, and 94% of migrations complete on the first import with zero data loss.",
      grounding: [],
      gateInput: {
        has_qa_block: false,
        has_schema: false,
        claims: [{ text: "94% of migrations complete on the first import", source: "" }],
      },
      status: "needs_review",
      agent_notes:
        "The 94% figure is not backed by any measured source. geo-qa should BLOCK this — do not ship an invented stat that AI engines would quote verbatim.",
      decision: null,
    },
    {
      id: "geo-opp-citable-rewrite-rn-vs-changelog",
      ref: 3,
      type: "citable_rewrite" as const,
      title: "Rewrite the release-notes-vs-changelog intro into a citable definition",
      target_page: "https://featherlog.app/blog/release-notes-vs-changelog",
      target_prompt: "What's the difference between release notes and a changelog?",
      reason:
        "Gemini and Copilot never cite us for this prompt. The intro buries the definition; engines lift the first clear, self-contained answer.",
      expected_impact:
        "A lead definition sentence is what engines quote; targets Gemini/Copilot pickup for this prompt.",
      draft:
        "Release notes and a changelog answer two different questions. A changelog is a running, version-by-version list of every change, written for anyone tracking the product. Release notes are a curated, human summary of what matters in a specific release, written for the people affected by it. Most teams publish both from one source.",
      grounding: ["Definitional framing consistent with the existing article body; no new quantitative claims."],
      gateInput: { has_qa_block: false, has_schema: true, claims: [] },
      status: "needs_review",
      agent_notes: "No stats introduced. Missing a Q&A block, so geo-qa will FIX not SHIP.",
      decision: null,
    },
    {
      id: "geo-opp-schema-faq-changelog-tool",
      ref: 4,
      type: "schema_markup" as const,
      title: "Add FAQPage schema to the changelog-tool comparison",
      target_page: "https://featherlog.app/",
      target_prompt: "What's the best changelog tool for a SaaS product?",
      reason:
        "The homepage has no structured data. FAQPage JSON-LD helps engines resolve the entity and pick up the Q&A block from opportunity #1.",
      expected_impact: "Structured FAQ markup improves entity resolution and Q&A pickup across engines.",
      draft:
        '{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "Is Featherlog a good changelog tool for SaaS?",\n    "acceptedAnswer": { "@type": "Answer", "text": "Featherlog is a changelog and release-notes tool for SaaS teams with a hosted page, an embeddable widget, and RSS." }\n  }]\n}',
      grounding: ["Schema mirrors the approved Q&A copy; no external claims."],
      gateInput: { has_qa_block: true, has_schema: true, claims: [] },
      status: "approved",
      agent_notes: "",
      decision: {
        action: "approve",
        note: "Ship with the next content deploy alongside the Q&A block.",
        draft: null,
        decided_at: NOW,
      },
    },
    {
      id: "geo-opp-qa-embed-widget",
      ref: 5,
      type: "qa_block" as const,
      title: "Add a how-to Q&A block to the embed-widget docs",
      target_page: "https://docs.featherlog.app/widgets/embed",
      target_prompt: "How do I embed a changelog widget on my website?",
      reason:
        "Only Perplexity and Claude cite us for the embed prompt. The docs page is reference-style; a direct how-to Q&A gives engines a lift-ready answer.",
      expected_impact: "A step-by-step Q&A targets ChatGPT/Gemini/Copilot pickup for the embed how-to prompt.",
      draft:
        "## How do I embed the Featherlog changelog widget?\n\n1. Copy your widget snippet from Settings → Widget.\n2. Paste the `<script>` tag before `</body>` on your site.\n3. Add a trigger element with `data-featherlog-trigger`.\n\nThat's it — the widget loads your latest entries and shows an unread badge.",
      grounding: ["Steps match the embed guide at docs.featherlog.app/widgets/embed."],
      gateInput: { has_qa_block: true, has_schema: false, claims: [] },
      status: "changes_requested",
      agent_notes: "",
      decision: {
        action: "request_changes",
        note: "Add the React-specific snippet too — the 'embed changelog widget react' query is a real source of traffic.",
        draft: null,
        decided_at: NOW,
      },
    },
    {
      id: "geo-opp-citable-write-release-notes",
      ref: 6,
      type: "citable_rewrite" as const,
      title: "Lead the how-to-write-release-notes post with a citable checklist",
      target_page: "https://featherlog.app/blog/how-to-write-release-notes",
      target_prompt: "How should I write release notes users actually read?",
      reason:
        "Three engines cite the post but none quote a clean summary. A lead checklist is the most liftable structure for a how-to prompt.",
      expected_impact: "Executed with the June content pass; the post is now cited by ChatGPT, Perplexity, and Gemini.",
      draft:
        "Write release notes users actually read:\n1. Lead with the benefit, not the ticket number.\n2. Group by what changed for the user, not by system.\n3. Keep each entry to one or two sentences.\n4. Link to docs for anything that needs setup.\n5. Publish on a predictable cadence.",
      grounding: ["Checklist distilled from the existing article; no new claims."],
      gateInput: { has_qa_block: false, has_schema: true, claims: [] },
      status: "done",
      agent_notes: "",
      decision: {
        action: "approve",
        note: "Approved in the June batch.",
        draft: null,
        decided_at: "2026-06-06T10:00:00.000Z",
      },
    },
  ];

  return raw.map((entry) => {
    const { gateInput, decision, ...rest } = entry;
    const gate = evaluateGeoGate({ draft: entry.draft, ...gateInput });
    return {
      ...rest,
      grounding: entry.grounding,
      gate,
      created_at: entry.id === "geo-opp-citable-write-release-notes" ? "2026-06-05T09:00:00.000Z" : NOW,
      decision: decision ?? null,
      execution:
        entry.status === "done"
          ? {
              status: "executed",
              operation: "publish_geo_change",
              target: entry.target_page,
              detail: "Published the citable checklist to the post and redeployed (commit 9c1b2ad).",
              executed_at: "2026-06-06T12:00:00.000Z",
            }
          : null,
    };
  }) as GeoOpportunity[];
}

// Entity / knowledge-panel readiness checklist with a few gaps.
function demoEntitySignals(): EntityReadiness {
  const signals = [
    {
      id: "ent-wikidata",
      label: "Wikidata entity",
      category: "knowledge-graph",
      status: "missing" as const,
      detail: "No Wikidata item for Featherlog. Engines have no canonical entity to resolve the brand to.",
      fix: "Create a Wikidata item (instance of: software) with official website, inception, and industry statements.",
    },
    {
      id: "ent-wikipedia",
      label: "Wikipedia / notable coverage",
      category: "knowledge-graph",
      status: "missing" as const,
      detail: "No Wikipedia article and thin third-party coverage. Notability is not yet established.",
      fix: "Earn independent coverage first; a Wikipedia article without sourcing will be removed.",
    },
    {
      id: "ent-schema-org",
      label: "schema.org Organization",
      category: "schema",
      status: "present" as const,
      detail: "Organization JSON-LD is present on the homepage with name, url, and logo.",
      fix: "",
    },
    {
      id: "ent-sameas",
      label: "sameAs social links",
      category: "schema",
      status: "partial" as const,
      detail: "Organization schema links X and GitHub but is missing LinkedIn and Crunchbase sameAs entries.",
      fix: "Add LinkedIn and Crunchbase URLs to the Organization sameAs array to strengthen entity links.",
    },
    {
      id: "ent-nap",
      label: "Consistent name / brand (NAP)",
      category: "consistency",
      status: "partial" as const,
      detail:
        "Some directory listings use 'Featherlog App' while the site uses 'Featherlog'. Inconsistent name confuses entity matching.",
      fix: "Standardize on 'Featherlog' across the site footer, social profiles, and directory listings.",
    },
    {
      id: "ent-founder",
      label: "Founder / person entity",
      category: "knowledge-graph",
      status: "present" as const,
      detail: "The about page links a founder Person schema with sameAs to a personal site and X profile.",
      fix: "",
    },
  ];
  const weight = { present: 1, partial: 0.5, missing: 0 };
  const total = signals.reduce((sum, signal) => sum + weight[signal.status], 0);
  return {
    brand: "Featherlog",
    score: Math.round((total / signals.length) * 100),
    signals,
  };
}

function demoOpportunities(): Opportunity[] {
  return [
    {
      id: "opp-brief-release-notes-vs-changelog",
      ref: 1,
      site_id: "featherlog-app",
      type: "content_brief",
      title: "Expand the release notes vs changelog article for a striking-distance query",
      target_page: "https://featherlog.app/blog/release-notes-vs-changelog",
      target_query: "release notes vs changelog",
      reason:
        "Query sits at position 9.2 with 4,900 impressions in 28d. The current article is 600 words and misses the comparison table and FAQ that top results carry.",
      expected_impact: "Moving from position 9 to 4-5 at the expected CTR curve adds roughly +240 clicks per month.",
      draft:
        "Brief: Release notes vs changelog — what's the difference?\n\n- Search intent: definitional + comparison; reader is choosing what to publish for users.\n- Add a comparison table: audience, tone, cadence, format, where each lives.\n- Add sections: 'When you need both', 'How Featherlog handles them together'.\n- Add FAQ: 'Is a changelog the same as release notes?', 'Do internal changes belong in release notes?'.\n- Target length ~1,600 words; internal links to /templates/release-notes and /blog/how-to-write-release-notes.",
      status: "needs_review",
      agent_notes:
        "Top three ranking pages all include a comparison table. Our page has the strongest backlink profile among positions 8-12 for this query.",
      created_at: NOW,
      decision: null,
      execution: null,
    },
    {
      id: "opp-title-release-notes-examples",
      ref: 2,
      site_id: "featherlog-app",
      type: "title_meta_rewrite",
      title: "Rewrite title for the release notes examples post to match the year and count",
      target_page: "https://featherlog.app/blog/release-notes-examples",
      target_query: "release notes examples",
      reason:
        "Ranking position 4.5 but CTR is 6.8% where the curve suggests ~8-9% for a listicle at this position. Competing titles carry a count and the current year.",
      expected_impact: "Reaching curve CTR at current impressions adds roughly +120 clicks per month.",
      draft:
        "Before: Release Notes Examples | Featherlog\nAfter:  14 Release Notes Examples Worth Copying in 2026 (+ Free Template)\n\nMeta before: Examples of release notes from real products.\nMeta after:  Steal these 14 real-world release notes examples — SaaS, mobile, and API changelogs — plus a free template to write yours in minutes.",
      status: "needs_review",
      agent_notes: "Keep the URL unchanged; only the <title> and meta description move.",
      created_at: NOW,
      decision: null,
      execution: null,
    },
    {
      id: "opp-ctr-product-update-email",
      ref: 3,
      site_id: "featherlog-app",
      type: "title_meta_rewrite",
      title: "Fix low CTR on the product update email template page",
      target_page: "https://featherlog.app/templates/product-update-email",
      target_query: "product update email template",
      reason:
        "Clicks fell 74 to 61 while position slipped 7.9 to 8.4. The meta description is a generic one-liner and the SERP shows an auto-generated snippet.",
      expected_impact:
        "A benefit-led snippet typically recovers 15-25% CTR at stable position, roughly +12-18 clicks per month.",
      draft:
        "Title: Product Update Email Template (Copy, Paste, Send) — Featherlog\nMeta: A plug-and-play product update email template with subject line formulas, a before/after example, and tips to lift open rates.",
      status: "approved",
      agent_notes: "",
      created_at: NOW,
      decision: {
        action: "approve",
        note: "Snippet reads well. Ship it with the next content deploy.",
        draft: null,
        decided_at: NOW,
      },
      execution: null,
    },
    {
      id: "opp-links-changelog-widget",
      ref: 4,
      site_id: "featherlog-app",
      type: "internal_links",
      title: "Add internal links from blog posts to the changelog widget feature page",
      target_page: "https://featherlog.app/features/changelog-widget",
      target_query: "changelog widget for website",
      reason:
        "The feature page climbed 8.9 to 7.8 with only two internal links pointing at it. Three high-traffic blog posts mention widgets without linking.",
      expected_impact:
        "Internal links from the two strongest posts should consolidate relevance and push the page toward positions 5-6.",
      draft:
        "Link plan:\n1. /blog/release-notes-examples — anchor 'embeddable changelog widget' in the tooling section.\n2. /blog/changelog-best-practices — anchor 'changelog widget for your website' in the distribution section.\n3. /blog/how-to-write-release-notes — anchor 'in-app changelog widget' in the publishing checklist.",
      status: "changes_requested",
      agent_notes: "",
      created_at: NOW,
      decision: {
        action: "request_changes",
        note: "Drop the third link — that post is being rewritten this month. Suggest an anchor on /compare/headway-alternative instead.",
        draft: null,
        decided_at: NOW,
      },
      execution: null,
    },
    {
      id: "opp-fix-import-headway-indexing",
      ref: 5,
      site_id: "featherlog-docs",
      type: "fix_page_issue",
      title: "Resolve indexing for the Headway import guide",
      target_page: "https://docs.featherlog.app/import-from-headway",
      target_query: "import from headway",
      reason:
        "URL Inspection reports 'Crawled - currently not indexed' intermittently; the page still earns 260 impressions when indexed. A staging canonical was found in an old deploy.",
      expected_impact:
        "Stable indexing protects roughly 39 clicks per month and supports the headway-alternative comparison page.",
      draft:
        "Fix plan:\n1. Confirm the canonical tag points to https://docs.featherlog.app/import-from-headway (not staging).\n2. Add the page to the docs sitemap index.\n3. Request indexing after deploy and re-check in 7 days.",
      status: "blocked",
      agent_notes:
        "Blocked: need to know whether the docs deploy still publishes the staging host, and who owns the docs sitemap generation.",
      created_at: NOW,
      decision: {
        action: "block",
        note: "Waiting on infra to confirm the staging deploy is retired before touching canonicals.",
        draft: null,
        decided_at: NOW,
      },
      execution: null,
    },
    {
      id: "opp-title-headway-alternative",
      ref: 6,
      site_id: "featherlog-app",
      type: "title_meta_rewrite",
      title: "Sharpen the Headway alternative comparison title",
      target_page: "https://featherlog.app/compare/headway-alternative",
      target_query: "headway alternative",
      reason:
        "The comparison page moved 5.4 to 4.6 after the last content update; the old title still led with the brand instead of the query.",
      expected_impact: "Executed with the June content deploy; clicks are up 71 to 92 month over month.",
      draft: "Before: Featherlog vs Headway\nAfter:  Best Headway Alternative in 2026: Featherlog vs Headway Compared",
      status: "done",
      agent_notes: "",
      created_at: "2026-06-05T09:00:00.000Z",
      decision: {
        action: "approve",
        note: "Approved during the June batch.",
        draft: null,
        decided_at: "2026-06-06T10:00:00.000Z",
      },
      execution: {
        status: "executed",
        operation: "rewrite_title",
        target: "https://featherlog.app/compare/headway-alternative",
        detail: "Updated <title> and meta description in site repo (commit 4f2a91c) and redeployed.",
        executed_at: "2026-06-06T12:00:00.000Z",
      },
    },
  ];
}

function demoAgentTasks(zh) {
  return {
    updated_at: NOW,
    tasks: [
      {
        id: "opp-links-changelog-widget",
        ref: 4,
        title: zh
          ? "为 changelog 挂件功能页补充内链"
          : "Add internal links from blog posts to the changelog widget feature page",
        type: "revise_opportunity",
        note: zh
          ? "去掉第三个链接——那篇文章本月要重写。改为在 /compare/headway-alternative 上加锚文本。"
          : "Drop the third link — that post is being rewritten this month. Suggest an anchor on /compare/headway-alternative instead.",
        requested_at: NOW,
      },
    ],
  };
}

function demoExecutionReport(zh) {
  return {
    generated_at: "2026-06-06T12:00:00.000Z",
    dry_run: false,
    source: "kelly-seo-demo",
    results: [
      {
        id: "opp-title-headway-alternative",
        ref: 6,
        title: zh ? "优化 Headway 替代品对比页标题" : "Sharpen the Headway alternative comparison title",
        operation: "rewrite_title",
        target_page: "https://featherlog.app/compare/headway-alternative",
        target_query: "headway alternative",
        site_id: "featherlog-app",
        status: "executed",
        detail: zh
          ? "已在站点仓库更新 <title> 与 meta 描述（commit 4f2a91c）并重新部署。"
          : "Updated <title> and meta description in site repo (commit 4f2a91c) and redeployed.",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const opportunityZh = {
    "opp-brief-release-notes-vs-changelog": {
      title: "为擦边排名词扩写 release notes vs changelog 文章",
      reason: "该查询 28 天内位于第 9.2 位，曝光 4,900 次。当前文章只有 600 词，缺少头部结果都有的对比表格和 FAQ。",
      expected_impact: "按 CTR 曲线估算，从第 9 位升到第 4-5 位每月约增加 240 次点击。",
      agent_notes: "排名前三的页面都包含对比表格。在 8-12 位竞争者中我们的外链最强。",
    },
    "opp-title-release-notes-examples": {
      title: "改写 release notes examples 文章标题，加入年份和数量",
      reason: "排名 4.5 位但 CTR 只有 6.8%，同位置榜单类内容通常有 8-9%。竞品标题都带数量和年份。",
      expected_impact: "按当前曝光达到曲线 CTR，每月约增加 120 次点击。",
      agent_notes: "URL 不变，只调整 <title> 与 meta 描述。",
    },
    "opp-ctr-product-update-email": {
      title: "修复产品更新邮件模板页的低 CTR",
      reason: "点击从 74 降到 61，排名从 7.9 滑到 8.4。meta 描述过于笼统，SERP 显示的是自动生成的摘要。",
      expected_impact: "利益导向的摘要通常能在排名不变时恢复 15-25% 的 CTR，每月约 +12-18 次点击。",
      agent_notes: "",
    },
    "opp-links-changelog-widget": {
      title: "为 changelog 挂件功能页补充内链",
      reason: "功能页从 8.9 升到 7.8，但只有两个内链。三篇高流量博客提到挂件却没有链接。",
      expected_impact: "从最强的两篇文章加内链可以聚合相关性，把页面推向 5-6 位。",
      agent_notes: "",
    },
    "opp-fix-import-headway-indexing": {
      title: "解决 Headway 导入指南的收录问题",
      reason:
        "URL 检查间歇性报告“已抓取但未收录”；页面被收录时仍有 260 次曝光。旧部署中发现了指向 staging 的 canonical。",
      expected_impact: "稳定收录可保住每月约 39 次点击，并支撑 headway-alternative 对比页。",
      agent_notes: "阻塞：需要确认 docs 部署是否仍发布 staging 域名，以及 sitemap 由谁生成。",
    },
    "opp-title-headway-alternative": {
      title: "优化 Headway 替代品对比页标题",
      reason: "上次内容更新后对比页从 5.4 升到 4.6；旧标题仍以品牌开头而不是查询词。",
      expected_impact: "已随 6 月内容发布执行；点击环比从 71 升到 92。",
      agent_notes: "",
    },
  };
  const decisionNotesZh = {
    "opp-ctr-product-update-email": "摘要写得不错，随下次内容发布上线。",
    "opp-links-changelog-widget":
      "去掉第三个链接——那篇文章本月要重写。改为在 /compare/headway-alternative 上加锚文本。",
    "opp-fix-import-headway-indexing": "等基础设施确认 staging 部署已下线，再动 canonical。",
    "opp-title-headway-alternative": "在 6 月批次中已批准。",
  };
  snapshot.queries = snapshot.queries.map((query) =>
    QUERY_AGENT_NOTES_ZH[query.query] ? { ...query, agent_notes: QUERY_AGENT_NOTES_ZH[query.query] } : query,
  );
  snapshot.opportunities = snapshot.opportunities.map((opportunity) => {
    const zh = opportunityZh[opportunity.id];
    if (!zh) return opportunity;
    return {
      ...opportunity,
      title: zh.title,
      reason: zh.reason,
      expected_impact: zh.expected_impact,
      agent_notes: zh.agent_notes,
      decision: opportunity.decision
        ? { ...opportunity.decision, note: decisionNotesZh[opportunity.id] || opportunity.decision.note }
        : null,
      execution: opportunity.execution
        ? { ...opportunity.execution, detail: "已在站点仓库更新 <title> 与 meta 描述（commit 4f2a91c）并重新部署。" }
        : null,
    };
  });
  localizeGeoZh(snapshot);
  return snapshot;
}

// Localize the GEO half of the snapshot (prompts, geo opportunities, entity
// signals). geo-qa verdicts/checks stay in English acronyms (SHIP/FIX/BLOCK).
function localizeGeoZh(snapshot) {
  const promptZh = {
    "geo-best-changelog-tool": "SaaS 产品最好的 changelog 工具是什么？",
    "geo-release-notes-vs-changelog": "release notes 和 changelog 有什么区别？",
    "geo-headway-alternative": "有什么好用的 Headway 替代品来做 release notes？",
    "geo-embed-changelog-widget": "怎么在网站上嵌入 changelog 挂件？",
    "geo-write-release-notes": "怎么写用户真正会读的 release notes？",
  };
  const intentZh = {
    comparison: "对比",
    definition: "定义",
    alternative: "替代品",
    "how-to": "操作指南",
  };
  const geoOppZh = {
    "geo-opp-qa-changelog-tool": {
      title: "在 changelog 工具对比页加入自成一体的问答块",
      reason:
        "Perplexity 和 ChatGPT 已引用首页，但页面没有可直接摘录的问答。一个直接的问答块能给引擎一段干净可引用的内容。",
      expected_impact: "为头部对比提问补上可引用答案；有望让 Copilot 从未提及变为被引用。",
      agent_notes: "全部保持定性描述——没有需要溯源的数字。与 FAQ schema 优化项 #4 搭配。",
    },
    "geo-opp-quotable-stats-headway": {
      title: "已拦截：Headway 替代品页的可引用迁移数据",
      reason: "对比页被所有引擎引用，但缺乏简洁可引用的数字。一句数据能让引用更具体。",
      expected_impact: "一句可引用的迁移数据能强化本已强劲的五引擎引用。",
      agent_notes: "94% 这个数字没有任何实测来源支撑。geo-qa 应拦截——不要发布 AI 引擎会逐字引用的编造数据。",
    },
    "geo-opp-citable-rewrite-rn-vs-changelog": {
      title: "把 release notes vs changelog 开头改写成可引用的定义",
      reason: "Gemini 和 Copilot 从不为该提问引用我们。开头把定义埋没了；引擎会摘取第一段清晰、自成一体的答案。",
      expected_impact: "引擎引用的是首句定义；目标是让 Gemini/Copilot 为该提问引用我们。",
      agent_notes: "未引入数据。缺少问答块，所以 geo-qa 会给 FIX 而非 SHIP。",
    },
    "geo-opp-schema-faq-changelog-tool": {
      title: "为 changelog 工具对比页添加 FAQPage schema",
      reason: "首页没有结构化数据。FAQPage JSON-LD 有助引擎解析实体，并摘取优化项 #1 的问答块。",
      expected_impact: "结构化 FAQ 标记改善实体解析和跨引擎的问答摘取。",
      agent_notes: "",
    },
    "geo-opp-qa-embed-widget": {
      title: "在嵌入挂件文档加入操作指南问答块",
      reason: "只有 Perplexity 和 Claude 为嵌入提问引用我们。文档页偏参考手册；直接的操作问答能给引擎可摘录答案。",
      expected_impact: "分步问答面向 ChatGPT/Gemini/Copilot 对嵌入操作提问的引用。",
      agent_notes: "",
    },
    "geo-opp-citable-write-release-notes": {
      title: "让 how-to-write-release-notes 文章以可引用清单开头",
      reason: "三个引擎引用该文，但都没引用清晰摘要。对操作类提问，开头清单是最易摘取的结构。",
      expected_impact: "已随 6 月内容更新执行；该文现被 ChatGPT、Perplexity 和 Gemini 引用。",
      agent_notes: "",
    },
  };
  const geoDecisionZh = {
    "geo-opp-schema-faq-changelog-tool": "随下次内容发布与问答块一起上线。",
    "geo-opp-qa-embed-widget": "把 React 专用代码片段也加上——“embed changelog widget react”是真实流量来源。",
    "geo-opp-citable-write-release-notes": "在 6 月批次中已批准。",
  };
  const entityZh = {
    "ent-wikidata": {
      detail: "Featherlog 没有 Wikidata 条目。引擎没有可解析品牌的规范实体。",
      fix: "创建 Wikidata 条目（instance of：软件），补充官网、成立时间和行业等声明。",
    },
    "ent-wikipedia": {
      detail: "没有维基百科词条，第三方报道很少，尚未建立知名度。",
      fix: "先获得独立报道；没有可靠来源的维基百科词条会被删除。",
    },
    "ent-schema-org": {
      detail: "首页存在 Organization JSON-LD，含 name、url 和 logo。",
      fix: "",
    },
    "ent-sameas": {
      detail: "Organization schema 链接了 X 和 GitHub，但缺少 LinkedIn 和 Crunchbase 的 sameAs。",
      fix: "在 Organization 的 sameAs 数组中加入 LinkedIn 和 Crunchbase 链接，强化实体关联。",
    },
    "ent-nap": {
      detail: "部分目录写作 “Featherlog App”，而站点用 “Featherlog”。名称不一致会干扰实体匹配。",
      fix: "在站点页脚、社媒资料和目录中统一使用 “Featherlog”。",
    },
    "ent-founder": {
      detail: "关于页链接了创始人 Person schema，并通过 sameAs 指向个人网站和 X 资料。",
      fix: "",
    },
  };

  if (snapshot.ai_visibility) {
    snapshot.ai_visibility = {
      ...snapshot.ai_visibility,
      prompts: snapshot.ai_visibility.prompts.map((prompt) => ({
        ...prompt,
        prompt: promptZh[prompt.prompt_id] || prompt.prompt,
        intent: intentZh[prompt.intent] || prompt.intent,
      })),
    };
  }
  if (Array.isArray(snapshot.geo_opportunities)) {
    snapshot.geo_opportunities = snapshot.geo_opportunities.map((opportunity) => {
      const zh = geoOppZh[opportunity.id];
      if (!zh) return opportunity;
      return {
        ...opportunity,
        title: zh.title,
        reason: zh.reason,
        expected_impact: zh.expected_impact,
        agent_notes: zh.agent_notes,
        decision: opportunity.decision
          ? { ...opportunity.decision, note: geoDecisionZh[opportunity.id] || opportunity.decision.note }
          : null,
        execution: opportunity.execution
          ? { ...opportunity.execution, detail: "已把可引用清单发布到文章并重新部署（commit 9c1b2ad）。" }
          : null,
      };
    });
  }
  if (snapshot.entity_signals) {
    snapshot.entity_signals = {
      ...snapshot.entity_signals,
      signals: snapshot.entity_signals.signals.map((signal) => {
        const zh = entityZh[signal.id];
        if (!zh) return signal;
        return { ...signal, detail: zh.detail, fix: zh.fix };
      }),
    };
  }
}

function queryEntry(siteId, query, clicks, impressions, position, prevClicks, prevImpressions, prevPosition, pages) {
  const id = `q-${siteId}-${slugify(query)}`;
  return {
    query_id: id,
    site_id: siteId,
    query,
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position,
    previous: {
      clicks: prevClicks,
      impressions: prevImpressions,
      ctr: ratio(prevClicks, prevImpressions),
      position: prevPosition,
    },
    badges: badgesFor(clicks, impressions, position),
    top_pages: splitAcross(pages).map(([url, share]) => ({
      url,
      clicks: Math.round(clicks * share),
      impressions: Math.round(impressions * share),
      position: round1(position + (share === 1 ? 0 : share > 0.5 ? -0.3 : 0.8)),
    })),
    trend: trendSeries(id, clicks, impressions, position),
    agent_notes: QUERY_AGENT_NOTES[query] || "",
  };
}

function pageEntry(
  siteId,
  url,
  clicks,
  impressions,
  position,
  prevClicks,
  prevImpressions,
  prevPosition,
  issues,
  queries,
) {
  const id = `p-${siteId}-${slugify(url.replace(/^https?:\/\//, "").replace(/\/$/, "") || "home")}`;
  const topQueries = queries
    .filter((entry) => entry.top_pages.some((page) => page.url === url))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5)
    .map((entry) => ({
      query: entry.query,
      clicks: entry.top_pages.find((page) => page.url === url)?.clicks ?? entry.clicks,
      impressions: entry.top_pages.find((page) => page.url === url)?.impressions ?? entry.impressions,
      position: entry.position,
    }));
  return {
    page_id: id,
    site_id: siteId,
    url,
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position,
    previous: {
      clicks: prevClicks,
      impressions: prevImpressions,
      ctr: ratio(prevClicks, prevImpressions),
      position: prevPosition,
    },
    issues,
    top_queries: topQueries,
    trend: trendSeries(id, clicks, impressions, position),
    agent_notes: "",
  };
}

function dailySeries(site) {
  const points = [];
  const windows = [
    { range: RANGE.previous, totals: site.previous },
    { range: RANGE.current, totals: site.totals },
  ];
  for (const { range, totals } of windows) {
    const dates = dateRange(range.start, range.end);
    const rand = seededRandom(`${site.site_id}:${range.start}`);
    const weights = dates.map((date) => {
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekday = day === 0 || day === 6 ? 0.62 : 1;
      return weekday * (0.82 + rand() * 0.36);
    });
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    dates.forEach((date, index) => {
      const share = weights[index] / weightSum;
      const clicks = Math.round(totals.clicks * share);
      const impressions = Math.round(totals.impressions * share);
      points.push({
        date,
        site_id: site.site_id,
        clicks,
        impressions,
        ctr: ratio(clicks, impressions),
        position: round1(totals.position + (rand() - 0.5) * 1.2),
      });
    });
  }
  return points;
}

function trendSeries(seedKey, clicks, impressions, position) {
  const dates = dateRange(RANGE.current.start, RANGE.current.end);
  const rand = seededRandom(seedKey);
  const weights = dates.map(() => 0.7 + rand() * 0.6);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return dates.map((date, index) => {
    const share = weights[index] / weightSum;
    return {
      date,
      clicks: Math.round(clicks * share),
      impressions: Math.round(impressions * share),
      position: round1(position + (rand() - 0.5) * 1.6),
    };
  });
}

export function expectedCtr(position) {
  if (position <= 1.5) return 0.28;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.1;
  if (position <= 4.5) return 0.07;
  if (position <= 5.5) return 0.05;
  if (position <= 10.5) return 0.03;
  if (position <= 20) return 0.015;
  return 0.008;
}

export function badgesFor(clicks, impressions, position) {
  const badges = [];
  if (position >= 8 && position <= 15) badges.push("striking_distance");
  const ctr = ratio(clicks, impressions);
  if (impressions >= 200 && ctr < expectedCtr(position) * 0.6) badges.push("low_ctr");
  return badges;
}

function splitAcross(pages) {
  if (pages.length === 1) return [[pages[0], 1]];
  return pages.map((url, index) => [url, index === 0 ? 0.72 : 0.28 / (pages.length - 1)]);
}

function sumTotals(list) {
  const clicks = list.reduce((sum, item) => sum + item.clicks, 0);
  const impressions = list.reduce((sum, item) => sum + item.impressions, 0);
  const weighted = list.reduce((sum, item) => sum + item.position * item.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position: impressions ? round1(weighted / impressions) : 0,
  };
}

function withCtr(totals) {
  return { ...totals, ctr: ratio(totals.clicks, totals.impressions), position: round1(totals.position) };
}

function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function seededRandom(key) {
  let seed = 2166136261;
  for (const char of String(key)) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

function round1(value) {
  return Number(Number(value).toFixed(1));
}
