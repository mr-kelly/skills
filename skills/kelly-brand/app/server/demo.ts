interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-02T09:30:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot()) : demoSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-brand",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-brand/config.json",
      is_example: false,
      brand: {
        name: "Fernpath",
        category: "Farm-to-kitchen sourcing platform",
        audience: "Independent restaurant owners and chefs",
        mission: "Put every chef one message away from the grower who picked it.",
        framework: "TALE",
      },
      style_tone: "grounded, plain-spoken, quietly confident",
      reading_level: "grade 8",
      official_urls: [
        { key: "homepage", url: "https://fernpath.example" },
        { key: "about", url: "https://fernpath.example/about" },
        { key: "brand_guidelines", url: "https://fernpath.example/brand" },
      ],
      banned_phrases: ["revolutionary", "world-class", "disruptive"],
      regulated_claims: ["organic", "carbon-neutral", "#1"],
      channels: [
        {
          channel_id: "website",
          type: "web",
          display_name: "Marketing Website",
          monitored: true,
          secret_envs: ["KELLY_BRAND_WEBSITE_URL"],
          secrets_ready: true,
        },
        {
          channel_id: "social-linkedin",
          type: "social",
          display_name: "LinkedIn",
          monitored: true,
          secret_envs: ["KELLY_BRAND_LINKEDIN_URL"],
          secrets_ready: true,
        },
        {
          channel_id: "sales-deck",
          type: "document",
          display_name: "Sales Deck",
          monitored: true,
          secret_envs: ["KELLY_BRAND_DECK_URL"],
          secrets_ready: false,
        },
      ],
    },
    decisions: demoDecisions(),
    agent_tasks: demoAgentTasks(),
    execution_report: demoExecutionReport(),
    snapshot,
  };
}

function demoDecisions() {
  return {
    updated_at: "2026-07-01T15:40:00.000Z",
    decisions: {
      "pillar-provenance": {
        action: "approve",
        comment: "This is the spine of the whole story. Adopt it as canonical.",
        decided_at: "2026-07-01T15:38:00.000Z",
      },
      "story-marisol-diner": {
        action: "request_changes",
        comment: "Great story, but shorten the setup and lead with the 6am text-message moment.",
        decided_at: "2026-07-01T15:32:00.000Z",
      },
      "proof-waste-claim": {
        action: "block",
        comment:
          "We cannot ship a 40% food-waste-reduction number without a named source. Blocked until we cite the study.",
        decided_at: "2026-07-01T15:40:00.000Z",
      },
    },
  };
}

function demoAgentTasks() {
  return {
    updated_at: "2026-07-01T15:32:00.000Z",
    tasks: [
      {
        task_id: "task-story-marisol-diner-1783093920000",
        type: "revise_narrative",
        item_id: "story-marisol-diner",
        comment: "Great story, but shorten the setup and lead with the 6am text-message moment.",
        requested_at: "2026-07-01T15:32:00.000Z",
        status: "queued",
      },
    ],
  };
}

function demoExecutionReport() {
  return {
    executed_at: "2026-06-27T10:05:00.000Z",
    dry_run: false,
    source: "kelly-brand-demo",
    results: [
      {
        item_id: "positioning-core",
        ref: 1,
        status: "promoted",
        operation: "promote_to_canonical",
        registry: "narrative",
        target: "canonical/positioning",
        reason: "Positioning statement adopted as the canonical brand narrative anchor.",
        executed_at: "2026-06-27T10:05:00.000Z",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const drafts = {
    "positioning-core":
      "对于难以稳定拿到本地食材的独立餐厅，Fernpath 是一个农场直达厨房的采购平台，让主厨直接向种植者下单——不同于批发配送商把你和产地隔开，因为每一箱货都带着采摘者的名字。",
    "pillar-provenance": "每一样食材都能追溯到具体的人和地块，而不只是一个地区标签。",
    "pillar-same-day": "今早采摘，今晚上桌——把农场到餐盘的时间压缩到一天以内。",
    "pillar-fair-split": "价格透明，种植者拿到应得的份额，主厨清楚每一分钱花在哪。",
  };
  snapshot.items = snapshot.items.map((item) => ({
    ...item,
    draft: drafts[item.item_id] || item.draft,
  }));
  snapshot.positioning.statement = drafts["positioning-core"];
  snapshot.drift_alerts = snapshot.drift_alerts.map((alert) => ({
    ...alert,
    detail: "演示提醒，未读取真实数据。",
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    detail: "演示提醒，未读取真实数据。",
  }));
  return snapshot;
}

function demoSnapshot() {
  const items = [
    // ── Positioning (Architect) ───────────────────────────────────────────
    item(
      "positioning-core",
      1,
      "positioning",
      "architect",
      "strategic-narrative-designer",
      "Core positioning statement",
      "For independent restaurants that struggle to source local ingredients reliably, Fernpath is a farm-to-kitchen sourcing platform that lets chefs order directly from the grower — unlike wholesale distributors that keep you a step removed from the source, because every crate arrives with the name of the person who picked it.",
      nqs(88, "SHIP"),
      null,
      [],
      "approved",
      "The one-sentence anchor the whole message house hangs from; adopted as canonical.",
    ),
    // ── Message pillars (Architect) ───────────────────────────────────────
    item(
      "pillar-provenance",
      2,
      "message_pillar",
      "architect",
      "message-system-architect",
      "Pillar 1 — Radical provenance",
      "Every ingredient traces back to a specific person and plot of land, not just a region label. Chefs can name the farm on the menu because we can name it in the app.",
      nqs(85, "SHIP"),
      null,
      [],
      "approved",
      "Lead value pillar; canonical. Differentiator against anonymous wholesale supply.",
    ),
    item(
      "pillar-same-day",
      3,
      "message_pillar",
      "architect",
      "message-system-architect",
      "Pillar 2 — Picked today, plated tonight",
      "We compress farm-to-plate time to under a day. Order by 9am, cook it by dinner service — freshness you can taste and guests notice.",
      nqs(79, "SHIP"),
      null,
      [],
      "needs_review",
      "Second pillar drafted; awaiting adoption. Consider whether 9am cutoff is a promise or a claim.",
    ),
    item(
      "pillar-fair-split",
      4,
      "message_pillar",
      "architect",
      "message-system-architect",
      "Pillar 3 — An honest split",
      "Transparent pricing means growers keep the share they earn and chefs see exactly where each dollar goes. No opaque distributor markup.",
      nqs(64, "FIX"),
      null,
      [],
      "needs_review",
      "Draft pillar. NQS flags a FIX: the 'honest split' claim needs a concrete number or it reads as a slogan.",
    ),
    // ── Story bank (Architect / Land) ─────────────────────────────────────
    item(
      "story-marisol-diner",
      5,
      "story",
      "land",
      "story-bank-builder",
      "Marisol's Tuesday-night save",
      "Marisol runs a 24-seat diner and had a table of twelve book in with two hours' notice. She texted a Fernpath grower at 6am, and by service she had heirloom tomatoes still warm from the field. The story customers tell isn't about software — it's about the tomato.",
      nqs(72, "FIX"),
      null,
      [],
      "changes_requested",
      "Customer story for the story bank. Human asked to lead with the 6am text moment and trim the setup.",
    ),
    item(
      "story-grower-elias",
      6,
      "story",
      "land",
      "story-bank-builder",
      "Elias stops guessing",
      "Elias farmed for years never knowing if a crop would sell before it turned. On Fernpath he sees demand a week out and plants to it. He calls it 'farming with the lights on.'",
      nqs(83, "SHIP"),
      null,
      [],
      "approved",
      "Grower-side story; canonical. Balances the chef stories with the supply-side view.",
    ),
    item(
      "story-founder-origin",
      7,
      "story",
      "trace",
      "narrative-baseline-mapper",
      "Why we started (origin story)",
      "Our founder spent a summer washing dishes and watched crates of unlabeled produce arrive with no idea where any of it came from. Fernpath started as one question: what if the chef could just ask the grower?",
      nqs(80, "SHIP"),
      null,
      [],
      "approved",
      "Origin story; canonical. Anchors the brand's reason for being.",
    ),
    item(
      "story-omakase-menu",
      8,
      "story",
      "land",
      "story-bank-builder",
      "The menu that changes every morning",
      "At a 10-seat omakase counter, the chef prints a new menu each morning based on what Fernpath growers picked overnight. Guests come back precisely because they can't order the same dinner twice — the supply chain became the concept.",
      nqs(77, "FIX"),
      null,
      [],
      "needs_review",
      "Chef story drafted; awaiting adoption. NQS flags a FIX — tighten the middle so the 'can't order twice' line lands harder.",
    ),
    // ── Proof points (Evaluate) ───────────────────────────────────────────
    item(
      "proof-time-to-table",
      9,
      "proof_point",
      "evaluate",
      "proof-point-packager",
      "Under 18 hours farm-to-table",
      "Median time from harvest to a restaurant's back door is 17.6 hours across the network — versus 4–6 days for typical wholesale.",
      nqs(90, "SHIP"),
      evidence(
        "Fernpath internal logistics data",
        "Q2 2026 platform report, n=2,140 deliveries",
        "https://fernpath.example/data/logistics-q2",
      ),
      [],
      "approved",
      "Flagship proof point; canonical. Evidence-backed and specific.",
    ),
    item(
      "proof-grower-earnings",
      10,
      "proof_point",
      "evaluate",
      "proof-point-packager",
      "Growers keep 82 cents on the dollar",
      "Growers on Fernpath retain 82% of the menu price, compared with an estimated 40–55% under traditional distribution.",
      nqs(76, "SHIP"),
      evidence(
        "Fernpath payments ledger",
        "Trailing 90 days, 310 active growers",
        "https://fernpath.example/data/earnings",
      ),
      [],
      "needs_review",
      "Proof point drafted with a cited source; awaiting adoption. Confirm the 40–55% comparison figure's origin.",
    ),
    item(
      "proof-menu-mentions",
      11,
      "proof_point",
      "evaluate",
      "proof-point-packager",
      "Farm names on 6 in 10 menus",
      "63% of active restaurants now print the grower's or farm's name on their menu — the provenance pillar showing up where guests see it.",
      nqs(81, "SHIP"),
      evidence(
        "Fernpath menu audit",
        "June 2026 sample of 480 partner menus",
        "https://fernpath.example/data/menu-audit",
      ),
      [],
      "approved",
      "Proof point that the provenance pillar is landing; canonical. Evidence-backed.",
    ),
    item(
      "proof-waste-claim",
      12,
      "proof_point",
      "evaluate",
      "proof-point-packager",
      "40% less food waste",
      "Restaurants on Fernpath cut food waste by 40% because they order to demand instead of stocking ahead.",
      nqs(38, "BLOCK"),
      null,
      ["claim"],
      "blocked",
      "BLOCKED by the NQS gate and by the human: the 40% figure has no named source. Do not publish until cited.",
    ),
    // ── Vocabulary & guardrails (Architect) ───────────────────────────────
    item(
      "vocab-say-this",
      13,
      "vocabulary",
      "architect",
      "brand-language-codifier",
      "Say this / not that",
      "Say 'grower' not 'supplier'. Say 'picked' not 'sourced'. Say 'kitchen' not 'foodservice operator'. Say 'the person who grew it' not 'the vendor'.",
      nqs(87, "SHIP"),
      null,
      [],
      "approved",
      "Canonical vocabulary set. Keeps the language human and grower-first across every channel.",
    ),
    item(
      "guardrail-no-hype",
      14,
      "guardrail",
      "architect",
      "brand-language-codifier",
      "No hype, no unearned claims",
      "Never use 'revolutionary', 'world-class', or 'disruptive'. Never claim 'organic' or 'carbon-neutral' without certification on file. Every number in public copy must link to a source.",
      nqs(84, "SHIP"),
      null,
      [],
      "approved",
      "Canonical guardrail. This is what the drift monitor checks channel copy against.",
    ),
  ];

  const driftAlerts = [
    driftAlert(
      "drift-hero-revolutionary",
      "website",
      "Homepage hero uses a banned word",
      "The homepage hero reads 'The revolutionary way restaurants buy local.'",
      "guardrail-no-hype",
      "Guardrail: never use 'revolutionary'. Say what it does plainly instead.",
      "open",
      "high",
    ),
    driftAlert(
      "drift-linkedin-supplier",
      "social-linkedin",
      "LinkedIn post says 'supplier' instead of 'grower'",
      "A recent LinkedIn post: 'Connect with local suppliers in one tap.'",
      "vocab-say-this",
      "Vocabulary: say 'grower', not 'supplier'.",
      "open",
      "medium",
    ),
    driftAlert(
      "drift-deck-waste-number",
      "sales-deck",
      "Sales deck cites the blocked 40% waste stat",
      "Slide 6 of the sales deck claims '40% less food waste' with no source line.",
      "proof-waste-claim",
      "This proof point is BLOCKED for lacking evidence; it must not appear in any channel.",
      "open",
      "high",
    ),
  ];

  const canonical = items.filter((entry) => entry.status === "approved");
  const pillars = items.filter((entry) => entry.type === "message_pillar");
  const stories = items.filter((entry) => entry.type === "story");
  const proofPoints = items.filter((entry) => entry.type === "proof_point");
  const scored = items.filter((entry) => typeof entry.nqs?.score === "number");
  const overallNqs = scored.length
    ? Math.round(scored.reduce((sum, entry) => sum + Number(entry.nqs.score || 0), 0) / scored.length)
    : 0;

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-brand-demo",
    brand_name: "Fernpath",
    framework: "TALE",
    positioning: {
      statement:
        "For independent restaurants that struggle to source local ingredients reliably, Fernpath is a farm-to-kitchen sourcing platform that lets chefs order directly from the grower — unlike wholesale distributors that keep you a step removed from the source, because every crate arrives with the name of the person who picked it.",
      status: "approved",
      item_id: "positioning-core",
    },
    metrics: {
      item_count: items.length,
      canonical_count: canonical.length,
      needs_review_count: items.filter((entry) => entry.status === "needs_review").length,
      pillar_count: pillars.length,
      story_count: stories.length,
      proof_point_count: proofPoints.length,
      overall_nqs: overallNqs,
      drift_open_count: driftAlerts.filter((alert) => alert.status === "open").length,
    },
    items,
    drift_alerts: driftAlerts,
    warnings: [
      {
        id: "waste-claim-blocked",
        severity: "warning",
        item_id: "proof-waste-claim",
        message:
          "A proof point (40% food waste) is BLOCKED for lacking a named source and is still appearing in the sales deck.",
        detail: "Demo warning, no live data.",
      },
    ],
  };
}

function nqs(score, gate) {
  return { score, gate };
}

function evidence(source, stat, url) {
  return { source, stat, url };
}

function item(item_id, ref, type, phase, sub_skill, title, draft, nqsValue, evidenceValue, risk, status, reason) {
  return {
    item_id,
    ref,
    type,
    phase,
    sub_skill,
    title,
    draft,
    nqs: nqsValue,
    evidence: evidenceValue,
    risk,
    status,
    reason,
    created_at: now,
  };
}

function driftAlert(
  alert_id,
  channel_id,
  title,
  offending_usage,
  guardrail_item_id,
  canonical_guidance,
  status,
  severity,
) {
  return {
    alert_id,
    channel_id,
    title,
    offending_usage,
    guardrail_item_id,
    canonical_guidance,
    status,
    severity,
    detected_at: now,
  };
}
