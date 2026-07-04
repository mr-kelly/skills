const now = "2026-07-02T09:00:00.000Z";

export const FEATURED_CANDIDATE_ID = "cand-lunchbox";

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
    app: "kelly-picks",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    agent_tasks: {
      updated_at: now,
      tasks: [
        {
          task_id: "task-demo-1",
          kind: "revise_proposal",
          ref_id: "prop-egg-cooker",
          note: "Re-run margins with the sea-freight quote before we drop it.",
          created_at: now,
          status: "queued",
        },
      ],
    },
    config_summary: zh ? localizeConfigZh(demoConfigSummary()) : demoConfigSummary(),
    snapshot,
  };
}

export function demoDecisionResponse(body = {}) {
  return {
    ok: true,
    demo: true,
    decision: {
      id: body.id || "",
      kind: body.kind || "",
      action: body.action || "",
      comment: body.comment || "",
      brief: typeof body.brief === "string" ? body.brief : undefined,
      decided_at: now,
    },
  };
}

function demoConfigSummary() {
  return {
    config_path: "demo://kelly-picks/config.json",
    is_example: false,
    seller_profile: {
      store_name: "Nimbus Home",
      categories: ["home", "kitchen"],
      target_platforms: ["amazon_us", "amazon_de", "tiktok_shop_us"],
      margin_floor_pct: 25,
      max_cogs: 12,
    },
    platforms: [
      { platform_id: "amazon_us", name: "Amazon US", currency: "USD", referral_fee_pct: 15, fulfillment_flat: 0 },
      { platform_id: "amazon_de", name: "Amazon DE", currency: "USD", referral_fee_pct: 15, fulfillment_flat: 0 },
      {
        platform_id: "tiktok_shop_us",
        name: "TikTok Shop US",
        currency: "USD",
        referral_fee_pct: 8,
        fulfillment_flat: 0,
      },
    ],
    freight: {
      default_per_unit: 1.8,
      rules: [
        { category: "home", per_unit: 2.4 },
        { category: "kitchen", per_unit: 2.1 },
      ],
    },
    ad_cost_default_pct: 15,
    sources: [
      {
        source_id: "amazon-bsr-home",
        kind: "amazon_bsr",
        name: "Amazon US BSR movers — Home & Kitchen",
        method: "browser_agent",
      },
      {
        source_id: "tiktok-kitchen",
        kind: "tiktok",
        name: "TikTok viral videos — #kitchengadgets",
        method: "browser_agent",
      },
      { source_id: "temu-home", kind: "temu", name: "Temu rising items — Home", method: "browser_agent" },
      {
        source_id: "aliexpress-kitchen",
        kind: "aliexpress",
        name: "AliExpress hot products — Kitchen",
        method: "browser_agent",
      },
      {
        source_id: "gtrends-kitchen",
        kind: "trends",
        name: "Google Trends — kitchen gadget queries",
        method: "browser_agent",
      },
      {
        source_id: "competitor-launches",
        kind: "competitor",
        name: "Competitor new launches — 4 tracked stores",
        method: "manual",
      },
    ],
    env_readiness: [{ name: "KELLY_PICKS_SERP_API_KEY", ready: true }],
  };
}

export function demoSnapshot(scenario = "overview") {
  const sources = demoSources();
  const trend_items = demoTrendItems();
  const candidates = demoCandidates();
  const proposals = demoProposals();
  const approved = candidates.filter((item) => item.stage === "develop");
  const metrics = {
    source_count: sources.length,
    trend_item_count: trend_items.length,
    candidate_count: candidates.length,
    candidates_new_7d: candidates.filter(
      (item) => Date.parse(item.first_seen) >= Date.parse("2026-06-25T00:00:00.000Z"),
    ).length,
    candidates_to_review: candidates.filter((item) => ["new", "reviewing"].includes(item.stage)).length,
    in_development: approved.length,
    watching: candidates.filter((item) => item.stage === "watch").length,
    dropped: candidates.filter((item) => item.stage === "dropped").length,
    proposals_needs_review: proposals.filter((item) => item.status === "needs_review").length,
    avg_margin_approved_pct:
      Math.round((approved.reduce((sum, item) => sum + item.margin_card.margin_pct, 0) / (approved.length || 1)) * 10) /
      10,
    below_margin_floor: candidates.filter((item) => item.margin_card.below_floor).length,
  };
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-picks-demo",
    demo_scenario: scenario,
    base_currency: "USD",
    range: { start: "2026-06-25", end: "2026-07-02" },
    metrics,
    sources,
    trend_items,
    candidates,
    proposals,
    sync_log: [
      {
        at: "2026-07-02T08:40:00.000Z",
        actor: "kelly-picks-agent",
        action: "ingest_trends",
        detail: "TikTok + BSR sweep: 4 trend items ingested, 2 new candidates filed, 1 duplicate skipped.",
      },
      {
        at: "2026-07-02T08:45:00.000Z",
        actor: "kelly-picks-agent",
        action: "compute_margins",
        detail: "12 margin cards recomputed from fee tables; 3 candidates below the 25% margin floor.",
      },
      {
        at: "2026-07-01T19:20:00.000Z",
        actor: "kelly-picks-agent",
        action: "execute_decisions",
        detail: "Dry-run: 2 approved proposals → 3 planned operations (sourcing brief, listing brief handoff, watch).",
      },
    ],
  };
}

function demoSources() {
  return [
    source(
      "amazon-bsr-home",
      "amazon_bsr",
      "Amazon US BSR movers — Home & Kitchen",
      "browser_agent",
      "2026-07-02T08:35:00.000Z",
      3,
      "ok",
    ),
    source(
      "tiktok-kitchen",
      "tiktok",
      "TikTok viral videos — #kitchengadgets",
      "browser_agent",
      "2026-07-02T08:20:00.000Z",
      4,
      "ok",
    ),
    source("temu-home", "temu", "Temu rising items — Home", "browser_agent", "2026-07-01T21:10:00.000Z", 2, "ok"),
    source(
      "aliexpress-kitchen",
      "aliexpress",
      "AliExpress hot products — Kitchen",
      "browser_agent",
      "2026-07-01T21:15:00.000Z",
      1,
      "ok",
    ),
    source(
      "gtrends-kitchen",
      "trends",
      "Google Trends — kitchen gadget queries",
      "browser_agent",
      "2026-06-30T07:50:00.000Z",
      2,
      "ok",
    ),
    source(
      "competitor-launches",
      "competitor",
      "Competitor new launches — 4 tracked stores",
      "manual",
      "2026-06-24T10:00:00.000Z",
      0,
      "stale",
    ),
  ];
}

function demoTrendItems() {
  return [
    trendItem(
      "tr-lunchbox-tiktok",
      "tiktok",
      "Collapsible silicone lunch box — creator demo at 2.1M views/week",
      "Three creators posted fold-flat lunch box demos this week; the top video is compounding ~40% day over day. Comments ask 'link?' repeatedly.",
      "https://tiktok.example.com/@bentobabe/video/7381",
      "views/week",
      2100000,
      96,
      [12, 18, 26, 41, 55, 70, 86, 100],
      "2026-07-02T08:20:00.000Z",
      "cand-lunchbox",
      "tt-7381",
    ),
    trendItem(
      "tr-spice-rack-bsr",
      "amazon_bsr",
      "Magnetic spice rack jumped 5,214 → 612 in Home & Kitchen BSR",
      "An 88% rank jump in nine days with only 214 reviews on the leader. Two of the top five listings went out of stock this week.",
      "https://amazon.example.com/bsr/home-kitchen",
      "BSR rank",
      612,
      88,
      [20, 24, 30, 42, 58, 74, 88, 100],
      "2026-07-02T08:35:00.000Z",
      "cand-spice-rack",
      "bsr-612-spice",
    ),
    trendItem(
      "tr-humidifier-tiktok",
      "tiktok",
      "'Cloud' night-light humidifier is back on the FYP",
      "Second wave for this shape: 680k views/week across #roomdecor. Winter angle is gone; creators now pitch it as a desk-setup piece.",
      "https://tiktok.example.com/tag/cloudhumidifier",
      "views/week",
      680000,
      44,
      [30, 28, 34, 40, 48, 55, 61, 66],
      "2026-07-01T20:10:00.000Z",
      "cand-cloud-humidifier",
      "tt-cloud-2",
    ),
    trendItem(
      "tr-roller-tiktok",
      "tiktok",
      "Reusable pet hair roller: 1.4M views/week, checkout links everywhere",
      "Cleaning-hack accounts are re-cutting the same demo. Four TikTok Shop listings appeared in seven days; none above 300 sales yet.",
      "https://tiktok.example.com/tag/pethairroller",
      "views/week",
      1400000,
      71,
      [22, 30, 36, 45, 58, 70, 84, 92],
      "2026-07-02T08:20:00.000Z",
      "cand-pet-hair-roller",
      "tt-roller-1",
    ),
    trendItem(
      "tr-sink-caddy-temu",
      "temu",
      "Expandable sink caddy climbing Temu Home best-sellers",
      "Moved from page 4 to page 1 in Home organizers in two weeks at $6.48. Review photos show consistent quality from two suppliers.",
      "https://temu.example.com/home-organizers",
      "rank",
      7,
      52,
      [18, 22, 27, 35, 41, 50, 58, 63],
      "2026-07-01T21:10:00.000Z",
      "cand-sink-caddy",
      "temu-caddy-7",
    ),
    trendItem(
      "tr-chopper-ali",
      "aliexpress",
      "14-in-1 vegetable chopper reorder volume rising on AliExpress",
      "Top three suppliers show 3.2k combined orders in 30 days, up ~45%. US-plug variants ship from CN warehouses at $4.90-5.60.",
      "https://aliexpress.example.com/kitchen-hot",
      "orders/30d",
      3200,
      45,
      [40, 42, 45, 51, 56, 60, 66, 72],
      "2026-07-01T21:15:00.000Z",
      "cand-veggie-chopper",
      "ali-chopper-14",
    ),
    trendItem(
      "tr-oil-sprayer-gt",
      "trends",
      "'oil sprayer for cooking' query interest +80% in 90 days",
      "Steady riser, not a spike: air-fryer adjacency keeps pulling the query up. Related terms 'olive oil sprayer glass' also rising.",
      "https://trends.example.com/oil-sprayer",
      "interest index",
      78,
      80,
      [30, 34, 38, 45, 52, 60, 70, 78],
      "2026-06-30T07:50:00.000Z",
      "cand-oil-dispenser",
      "gt-oil-78",
    ),
    trendItem(
      "tr-frother-gt",
      "trends",
      "'rechargeable milk frother' holding a high plateau after spring spike",
      "Interest settled ~35% above last year's baseline. Home-café content keeps the query warm outside gifting season.",
      "https://trends.example.com/milk-frother",
      "interest index",
      64,
      12,
      [70, 66, 60, 58, 60, 62, 63, 64],
      "2026-06-30T07:50:00.000Z",
      "cand-milk-frother",
      "gt-frother-64",
    ),
    trendItem(
      "tr-organizer-comp",
      "competitor",
      "HausWerk (tracked store) launched a bamboo drawer organizer line",
      "Six SKUs in one week with A+ content and a launch coupon. Their last three launches all reached 500+ reviews within a quarter.",
      "https://amazon.example.com/stores/hauswerk/new",
      "new SKUs",
      6,
      0,
      [],
      "2026-06-24T10:00:00.000Z",
      "cand-drawer-organizer",
      "comp-hauswerk-bamboo",
    ),
    trendItem(
      "tr-egg-cooker-bsr",
      "amazon_bsr",
      "Mini egg cooker re-entered the Small Appliance top 100",
      "Rank improved 41% in two weeks, but the price war is visible: median price fell from $18.99 to $15.99 in the same window.",
      "https://amazon.example.com/bsr/small-appliances",
      "BSR rank",
      87,
      41,
      [35, 38, 36, 44, 50, 58, 62, 68],
      "2026-07-02T08:35:00.000Z",
      "cand-egg-cooker",
      "bsr-87-egg",
    ),
    trendItem(
      "tr-ice-tray-temu",
      "temu",
      "Stackable ice tray with lid trending in Temu Kitchen",
      "Summer seasonality plus a viral 'clear ice' angle. Sold ~9k units platform-wide last week at $3.98-5.20.",
      "https://temu.example.com/kitchen-rising",
      "units/week",
      9000,
      38,
      [25, 28, 30, 36, 40, 47, 52, 55],
      "2026-07-01T21:10:00.000Z",
      "cand-ice-tray",
      "temu-ice-9k",
    ),
    trendItem(
      "tr-led-strip-tiktok",
      "tiktok",
      "LED strip room-makeover format still farming views",
      "High views but the compilation format is ad-driven; top listings have 40k+ reviews and $9.99 anchor prices.",
      "https://tiktok.example.com/tag/ledlights",
      "views/week",
      3200000,
      8,
      [95, 92, 96, 90, 94, 96, 93, 95],
      "2026-06-28T09:00:00.000Z",
      "cand-led-strip",
      "tt-led-old",
    ),
  ];
}

function demoCandidates() {
  return [
    {
      ...candidate(
        "cand-lunchbox",
        "Collapsible silicone lunch box",
        "kitchen",
        "tiktok",
        "tr-lunchbox-tiktok",
        "reviewing",
        "amazon_us",
        "B",
        96,
        21.99,
        4.6,
        2.1,
        15,
        3.6,
        "2.1M weekly TikTok views with unanswered 'link?' demand, and the Amazon shelf is shallow: the head seller holds 214 reviews and only 11% share. A fold-flat variant with a steam vent clears our margin floor at 38% with breakeven ACOS near 55% — rare headroom for a TikTok-origin product.",
        "2026-06-30T10:00:00.000Z",
      ),
      competition: competition(
        [214, 187, 150, 122, 98, 76, 61, 44, 28, 15],
        11,
        "Fragmented shelf: no listing above 250 reviews and the top three differ only in color. Review moats are shallow enough to pass with better lifestyle imagery.",
        4,
        "4 new entrants in 90 days, all under 50 reviews — early but not crowded yet.",
      ),
      evidence: [
        evidenceLink("Top creator demo (2.1M views)", "https://tiktok.example.com/@bentobabe/video/7381"),
        evidenceLink("Amazon search: collapsible lunch box", "https://amazon.example.com/s?k=collapsible+lunch+box"),
        evidenceLink("Supplier quote sheet (1688)", "https://1688.example.com/silicone-lunchbox-quotes"),
      ],
    },
    {
      ...candidate(
        "cand-spice-rack",
        "Magnetic fridge spice rack",
        "home",
        "amazon_bsr",
        "tr-spice-rack-bsr",
        "new",
        "amazon_us",
        "B",
        88,
        24.99,
        7.2,
        2.6,
        15,
        3.7,
        "An 88% BSR jump with two of the top five listings out of stock is a supply gap, not just demand. A stronger-magnet variant with a bundled shelf liner can hold $24.99 and 31% margin.",
        "2026-07-02T08:36:00.000Z",
      ),
      competition: competition(
        [214, 168, 141, 120, 103, 88, 60, 41, 22, 9],
        14,
        "Head seller is out of stock this week; second seller raised price by $3. Short window before both restock.",
        3,
        "3 new entrants in 90 days; velocity moderate.",
      ),
      evidence: [
        evidenceLink("BSR mover row (Home & Kitchen)", "https://amazon.example.com/bsr/home-kitchen"),
        evidenceLink("Out-of-stock head listing", "https://amazon.example.com/dp/B0SPICE01"),
      ],
    },
    {
      ...candidate(
        "cand-cloud-humidifier",
        "Cloud night-light humidifier",
        "home",
        "tiktok",
        "tr-humidifier-tiktok",
        "develop",
        "tiktok_shop_us",
        "B",
        44,
        27.99,
        6.8,
        2.9,
        15,
        2.3,
        "Second demand wave with a new desk-setup angle means the trend outlived its winter spike. 42% margin at a $27.99 anchor, and TikTok Shop fees leave room for creator commissions.",
        "2026-06-26T09:00:00.000Z",
      ),
      competition: competition(
        [320, 240, 190, 150, 110, 85, 60, 40, 25, 12],
        16,
        "Amazon shelf is mid-depth, but TikTok Shop is nearly empty: two listings, both with weak video assets.",
        5,
        "5 new entrants in 90 days, mostly Amazon-only — the TikTok Shop lane is open.",
      ),
      evidence: [
        evidenceLink("#cloudhumidifier tag page", "https://tiktok.example.com/tag/cloudhumidifier"),
        evidenceLink("TikTok Shop search results", "https://shop.tiktok.example.com/search?q=cloud+humidifier"),
      ],
    },
    {
      ...candidate(
        "cand-pet-hair-roller",
        "Reusable pet hair roller",
        "home",
        "tiktok",
        "tr-roller-tiktok",
        "develop",
        "amazon_us",
        "A",
        71,
        14.99,
        2.1,
        1.2,
        15,
        2.6,
        "Best margin structure on the board: 45% margin, 63% breakeven ACOS, $2.10 COGS. Demand is proven by checkout links in every viral cut, and no TikTok Shop listing has broken 300 sales yet.",
        "2026-06-27T14:00:00.000Z",
      ),
      competition: competition(
        [9500, 480, 260, 190, 140, 90, 70, 45, 30, 18],
        62,
        "One legacy brand (ChomChom) owns 62% of review volume at $24.95 — but every viral video sells the $12-15 generic form factor, not the brand.",
        6,
        "6 new entrants in 90 days and climbing; speed matters more than polish here.",
      ),
      evidence: [
        evidenceLink("#pethairroller tag velocity", "https://tiktok.example.com/tag/pethairroller"),
        evidenceLink(
          "TikTok Shop listings (4, all <300 sales)",
          "https://shop.tiktok.example.com/search?q=pet+hair+roller",
        ),
      ],
    },
    {
      ...candidate(
        "cand-milk-frother",
        "Rechargeable milk frother",
        "kitchen",
        "trends",
        "tr-frother-gt",
        "watch",
        "amazon_us",
        "C",
        12,
        19.99,
        4.9,
        2.0,
        15,
        3.4,
        "Query interest holds 35% above baseline year-round, but the freight quote decides this one: the USB-C dock version only clears the floor if sea freight lands under $2.20/unit.",
        "2026-06-20T08:00:00.000Z",
      ),
      competition: competition(
        [4100, 2800, 900, 640, 420, 300, 210, 150, 90, 60],
        34,
        "Two entrenched sellers above 2.8k reviews; differentiation must come from the charging dock and gift packaging.",
        2,
        "Only 2 new entrants in 90 days — the shelf is mature, not hot.",
      ),
      evidence: [
        evidenceLink("Google Trends: rechargeable milk frother", "https://trends.example.com/milk-frother"),
        evidenceLink("Freight forwarder quote thread", "local://exports/freight-quote-frother.md"),
      ],
    },
    {
      ...candidate(
        "cand-led-strip",
        "RGB LED strip lights 32ft",
        "home",
        "tiktok",
        "tr-led-strip-tiktok",
        "dropped",
        "amazon_us",
        "D",
        8,
        12.99,
        3.2,
        1.6,
        15,
        3.9,
        "Views without a wedge: the head listing has 41k reviews, CPC is bid to $1.40+, and the median price collapsed to $9.99. Estimated margin 18% is below the 25% floor before returns.",
        "2026-06-18T08:00:00.000Z",
      ),
      competition: competition(
        [41000, 28000, 15000, 9800, 7600, 5200, 3900, 2800, 1900, 1200],
        36,
        "Fully saturated head: five listings above 7.5k reviews and brand ad walls on every keyword.",
        1,
        "New entrants have stopped appearing — the market already consolidated.",
      ),
      evidence: [
        evidenceLink("Amazon search: led strip lights", "https://amazon.example.com/s?k=led+strip+lights"),
        evidenceLink("CPC estimate export", "local://exports/cpc-led-strip.csv"),
      ],
    },
    {
      ...candidate(
        "cand-sink-caddy",
        "Expandable sink caddy organizer",
        "home",
        "temu",
        "tr-sink-caddy-temu",
        "new",
        "amazon_us",
        "C",
        52,
        16.99,
        4.2,
        1.9,
        15,
        2.9,
        "Temu page-1 climb usually leads the Amazon demand curve by 6-10 weeks. 32% margin at $16.99 with two vetted suppliers; worth a review cycle before the arbitrage window closes.",
        "2026-07-01T21:20:00.000Z",
      ),
      competition: competition(
        [1900, 850, 610, 430, 350, 240, 180, 120, 70, 40],
        33,
        "One 1.9k-review leader, then a long tail. A rust-proof steel variant could take the mid shelf.",
        3,
        "3 new entrants in 90 days, all following the Temu design.",
      ),
      evidence: [
        evidenceLink("Temu Home organizers rising page", "https://temu.example.com/home-organizers"),
        evidenceLink("Supplier review photos", "https://temu.example.com/item/sink-caddy-6"),
      ],
    },
    {
      ...candidate(
        "cand-veggie-chopper",
        "14-in-1 vegetable chopper",
        "kitchen",
        "aliexpress",
        "tr-chopper-ali",
        "reviewing",
        "amazon_us",
        "C",
        45,
        18.99,
        5.4,
        2.3,
        15,
        3.3,
        "Reorder volume (not first orders) rising 45% signals sell-through, not stocking. Margin is thinner at 27% — viable only if we skip the blade-count war and sell a dishwasher-safe angle.",
        "2026-06-29T11:00:00.000Z",
      ),
      competition: competition(
        [5200, 3100, 1400, 800, 560, 400, 300, 210, 130, 80],
        42,
        "Two big incumbents, but their 1-star reviews cluster on cracked containers — a materials upgrade is the wedge.",
        4,
        "4 new entrants in 90 days; mid velocity.",
      ),
      evidence: [
        evidenceLink("AliExpress hot products — kitchen", "https://aliexpress.example.com/kitchen-hot"),
        evidenceLink(
          "Incumbent 1-star review cluster",
          "https://amazon.example.com/product-reviews/B0CHOP01?filterByStar=one_star",
        ),
      ],
    },
    {
      ...candidate(
        "cand-oil-dispenser",
        "Glass oil sprayer dispenser",
        "kitchen",
        "trends",
        "tr-oil-sprayer-gt",
        "new",
        "amazon_us",
        "C",
        80,
        13.99,
        3.1,
        1.5,
        15,
        2.4,
        "A steady 90-day riser tied to the air-fryer ecosystem, not a fad spike. 35% margin at a $13.99 price point that survives coupon wars; glass + measurement marks is the differentiator buyers ask for.",
        "2026-06-30T08:10:00.000Z",
      ),
      competition: competition(
        [2600, 1200, 700, 500, 380, 260, 180, 110, 60, 30],
        39,
        "Leader owns the 'plastic' segment; the glass sub-niche head has only 700 reviews.",
        3,
        "3 new entrants in 90 days; glass variants underrepresented.",
      ),
      evidence: [
        evidenceLink("Google Trends: oil sprayer for cooking", "https://trends.example.com/oil-sprayer"),
        evidenceLink("Amazon glass sub-niche search", "https://amazon.example.com/s?k=glass+oil+sprayer"),
      ],
    },
    {
      ...candidate(
        "cand-drawer-organizer",
        "Bamboo drawer organizer set",
        "home",
        "competitor",
        "tr-organizer-comp",
        "watch",
        "amazon_de",
        "C",
        0,
        22.99,
        8.4,
        3.4,
        15,
        3.2,
        "HausWerk's launch pattern (500+ reviews per quarter) says the category works, but our COGS quote of $8.40 puts margin at 20%, below floor. Watch for a supplier under $6.50 or a DE-only angle where their coupon does not run.",
        "2026-06-24T12:00:00.000Z",
      ),
      last_updated: "2026-06-14T09:00:00.000Z",
      competition: competition(
        [1100, 640, 520, 380, 290, 200, 150, 90, 50, 20],
        32,
        "HausWerk will own the head within two quarters based on their launch history. DE marketplace is one cycle behind US.",
        6,
        "6 new entrants in 90 days on .com; .de shelf still thin.",
      ),
      evidence: [
        evidenceLink("HausWerk new arrivals", "https://amazon.example.com/stores/hauswerk/new"),
        evidenceLink("Bamboo supplier quotes", "local://exports/bamboo-organizer-quotes.md"),
      ],
    },
    {
      ...candidate(
        "cand-egg-cooker",
        "Mini rapid egg cooker",
        "kitchen",
        "amazon_bsr",
        "tr-egg-cooker-bsr",
        "reviewing",
        "amazon_us",
        "D",
        41,
        15.99,
        5.9,
        2.4,
        15,
        2.4,
        "Rank is improving but the median price fell $3 in two weeks — a price war we would enter at 18% margin, below the 25% floor. Proposal is to drop unless the sea-freight quote changes the math.",
        "2026-07-02T08:36:00.000Z",
      ),
      competition: competition(
        [31000, 5400, 2100, 1300, 900, 640, 420, 300, 180, 90],
        73,
        "Dash owns 73% of review volume; everyone else fights for scraps under their price umbrella.",
        2,
        "2 new entrants in 90 days; both already discounting.",
      ),
      evidence: [
        evidenceLink("BSR small appliances top 100", "https://amazon.example.com/bsr/small-appliances"),
        evidenceLink("Price history chart", "https://pricetracker.example.com/mini-egg-cooker"),
      ],
    },
    {
      ...candidate(
        "cand-ice-tray",
        "Stackable ice cube tray with lid",
        "kitchen",
        "temu",
        "tr-ice-tray-temu",
        "new",
        "tiktok_shop_us",
        "C",
        38,
        11.99,
        2.6,
        1.3,
        8,
        2.2,
        "Seasonal but repeatable: the 'clear ice' content angle re-fires every summer. TikTok Shop's 8% fee keeps a $11.99 price at 34% margin, and the mold ships flat-packed cheap.",
        "2026-07-01T21:20:00.000Z",
      ),
      competition: competition(
        [850, 620, 400, 310, 240, 170, 120, 80, 40, 20],
        30,
        "No dominant seller; the shelf resets every summer as listings go stale off-season.",
        5,
        "5 new entrants in 90 days — seasonal rush already starting.",
      ),
      evidence: [
        evidenceLink("Temu kitchen rising", "https://temu.example.com/kitchen-rising"),
        evidenceLink("'Clear ice' content examples", "https://tiktok.example.com/tag/clearice"),
      ],
    },
    {
      ...candidate(
        "cand-mini-blender",
        "Portable mini blender bottle",
        "kitchen",
        "aliexpress",
        "",
        "dropped",
        "amazon_us",
        "D",
        15,
        17.99,
        6.2,
        2.5,
        15,
        3.8,
        "Battery + liquid + blades means high return rates (category avg 11%) and ad costs that never stabilized. 15% effective margin after returns — dropped in last month's review.",
        "2026-06-12T08:00:00.000Z",
      ),
      competition: competition(
        [18000, 9200, 4400, 2600, 1800, 1200, 800, 500, 280, 140],
        41,
        "Saturated head plus a safety-recall shadow over the category since spring.",
        1,
        "Entrant velocity collapsed after the recall coverage.",
      ),
      evidence: [evidenceLink("Category return-rate note", "local://exports/returns-mini-blender.md")],
    },
  ];
}

function demoProposals() {
  return [
    {
      proposal_id: "prop-lunchbox",
      candidate_id: "cand-lunchbox",
      title: "Develop: Collapsible silicone lunch box",
      verdict: "develop",
      status: "needs_review",
      proposed_at: "2026-07-02T08:50:00.000Z",
      reason:
        "TikTok demand is compounding while the Amazon shelf is still shallow (head: 214 reviews, 11% share). Margin card clears the floor at 38.2% with breakeven ACOS 54.5%. Window: 6-8 weeks before the shelf fills.",
      brief:
        "SOURCING BRIEF\n- Product: fold-flat silicone lunch box, 2-compartment, steam vent, food-grade LFGB silicone\n- Target COGS: ≤ $4.60 @ 1,000 units; molds exist (no tooling cost) — confirm with 2 suppliers from the quote sheet\n- Samples: 3 colorways (sage, cream, terracotta); test dishwasher + microwave + drop\n- Freight: sea, target ≤ $2.10/unit landed to US warehouse\n\nLISTING BRIEF (→ kelly-listing)\n- Title angle: 'Collapsible Lunch Box — folds to 1 inch, steam vent, leakproof'\n- Main image: folded vs open side-by-side; lifestyle set around desk lunches\n- Price: $21.99 launch with 15% intro coupon; anchor against $24.99 rigid bento\n- Keywords: collapsible lunch box, silicone bento, fold flat lunch container\n- Video: re-cut of the folding demo (license or recreate — do not rip the creator's cut)",
    },
    {
      proposal_id: "prop-humidifier",
      candidate_id: "cand-cloud-humidifier",
      title: "Develop: Cloud night-light humidifier",
      verdict: "develop",
      status: "approved",
      proposed_at: "2026-06-26T10:00:00.000Z",
      reason:
        "Second demand wave with a desk-setup angle; TikTok Shop lane nearly empty. 42.1% margin leaves room for 15% creator commission.",
      brief:
        "SOURCING BRIEF\n- Cloud-shaped ultrasonic humidifier, 300ml, warm LED, USB-C\n- Target COGS ≤ $6.80 @ 500 units; existing supplier relationship (Nimbus order #88)\n\nLISTING BRIEF (→ kelly-listing)\n- TikTok Shop first, Amazon second\n- Hook: 'the desk cloud that went viral again' — position for desk-setup, not nursery\n- Price $27.99, creator commission 15%, seed 20 units to mid-tier desk-setup creators",
      verdictNote: "Approved 2026-06-27 — proceed to sourcing; cap first PO at 500 units.",
    },
    {
      proposal_id: "prop-roller",
      candidate_id: "cand-pet-hair-roller",
      title: "Develop: Reusable pet hair roller",
      verdict: "develop",
      status: "done",
      proposed_at: "2026-06-27T15:00:00.000Z",
      reason:
        "Best margin structure on the board (45.6%) and speed-sensitive: no TikTok Shop listing above 300 sales yet.",
      brief:
        "SOURCING BRIEF\n- Self-cleaning-base roller, ABS shell, target COGS ≤ $2.10 @ 2,000 units\n\nLISTING BRIEF (→ kelly-listing) — handed off 2026-06-29\n- Lead with the before/after couch shot; $14.99 vs ChomChom $24.95 anchor\n- Bundle idea: mini travel roller as an upsell",
      verdictNote: "Handed off to kelly-listing 2026-06-29; sourcing brief exported.",
    },
    {
      proposal_id: "prop-led-strip",
      candidate_id: "cand-led-strip",
      title: "Drop: RGB LED strip lights",
      verdict: "drop",
      status: "done",
      proposed_at: "2026-06-18T09:00:00.000Z",
      reason:
        "Saturated head (41k reviews), $1.40+ CPC, price collapse to $9.99. 18% margin is below the 25% floor before returns. Views here do not convert to a wedge for a new entrant.",
      brief:
        "Drop and archive. Re-open only if a genuinely new form factor (e.g. peel-and-stick corner channels) appears with sub-$0.80 CPC.",
      verdictNote: "Confirmed drop 2026-06-19.",
    },
    {
      proposal_id: "prop-frother",
      candidate_id: "cand-milk-frother",
      title: "Watch: Rechargeable milk frother",
      verdict: "watch",
      status: "needs_review",
      proposed_at: "2026-07-01T09:00:00.000Z",
      reason:
        "Demand is durable but the margin swings on freight: 33.5% with the current $2.00/unit estimate, ~29% if the quote comes back at $2.90.",
      brief:
        "RE-CHECK CRITERIA\n- Trigger 1: sea-freight quote ≤ $2.20/unit (forwarder reply due ~Jul 8) → move to develop\n- Trigger 2: either incumbent (4.1k / 2.8k reviews) raises price above $22 → recompute\n- Re-check date: 2026-07-10; auto-surface in the review queue",
    },
    {
      proposal_id: "prop-egg-cooker",
      candidate_id: "cand-egg-cooker",
      title: "Drop: Mini rapid egg cooker",
      verdict: "drop",
      status: "changes_requested",
      proposed_at: "2026-07-02T08:50:00.000Z",
      reason:
        "Dash holds 73% review share and the median price fell $3 in two weeks. At 18.1% margin this is below floor — recommend dropping before sample spend.",
      brief: "Drop. Price umbrella belongs to Dash; entering means funding a discount war with no review base.",
      verdictNote:
        "Kelly (2026-07-02): re-run the margin card with the consolidated sea-freight quote first — if it stays under 22%, I'll approve the drop.",
    },
    {
      proposal_id: "prop-organizer",
      candidate_id: "cand-drawer-organizer",
      title: "Watch: Bamboo drawer organizer set",
      verdict: "watch",
      status: "blocked",
      proposed_at: "2026-06-25T10:00:00.000Z",
      reason:
        "Category proven by HausWerk's launch velocity, but our COGS quote puts margin at 20%. Blocked until a supplier lands under $6.50 or the DE angle is validated.",
      brief:
        "RE-CHECK CRITERIA\n- Need: supplier quote ≤ $6.50 (currently $8.40) — agent to re-canvass 1688 in August\n- Need: .de shelf check — if still under 5 serious listings by Aug 15, revisit as DE-first launch",
      verdictNote: "Blocked on supplier pricing — nothing actionable until new quotes arrive.",
    },
  ];
}

function localizeConfigZh(summary) {
  summary.seller_profile.store_name = "云舍家居 Nimbus Home";
  summary.sources = summary.sources.map((source) => ({
    ...source,
    name:
      {
        "amazon-bsr-home": "亚马逊美国 BSR 飙升榜 — 家居厨房",
        "tiktok-kitchen": "TikTok 爆款视频 — #kitchengadgets",
        "temu-home": "Temu 上升商品 — 家居",
        "aliexpress-kitchen": "速卖通热销 — 厨房",
        "gtrends-kitchen": "Google Trends — 厨房小工具搜索词",
        "competitor-launches": "竞品新上架 — 追踪 4 家店铺",
      }[source.source_id] || source.name,
  }));
  return summary;
}

function localizeSnapshotZh(snapshot) {
  const candidateText = {
    "cand-lunchbox": [
      "可折叠硅胶饭盒",
      "TikTok 周播放 210 万且评论区大量『求链接』，而亚马逊货架还很浅：头部卖家仅 214 条评论、11% 份额。带蒸汽阀的折叠款毛利 38%、保本 ACOS 约 55%——TikTok 起量的产品里少见的利润空间。",
    ],
    "cand-spice-rack": [
      "磁吸冰箱调料架",
      "BSR 排名 9 天跳升 88%，且前五名里两家断货——这是供给缺口而不只是需求。强磁款配防滑垫可以站稳 $24.99、毛利 31%。",
    ],
    "cand-cloud-humidifier": [
      "云朵小夜灯加湿器",
      "第二波需求换了『桌面搭建』角度，说明趋势熬过了冬季峰值。$27.99 定价下毛利 42%，TikTok Shop 费率还留得出达人佣金。",
    ],
    "cand-pet-hair-roller": [
      "可重复用宠物除毛滚筒",
      "全场最好的利润结构：毛利 45%、保本 ACOS 63%、COGS 仅 $2.10。每条爆款视频都在带购物车，且 TikTok Shop 还没有超过 300 单的链接。",
    ],
    "cand-milk-frother": [
      "充电式奶泡器",
      "搜索热度常年高出基线 35%，但成败在运费：海运报价低于 $2.20/件 才能过毛利线。",
    ],
    "cand-led-strip": [
      "RGB LED 灯带 32 英尺",
      "有流量没切口：头部链接 4.1 万条评论，CPC 抬到 $1.40+，中位价跌到 $9.99。预估毛利 18%，未计退货就已低于 25% 红线。",
    ],
    "cand-sink-caddy": [
      "伸缩水槽置物架",
      "Temu 冲到第一页通常领先亚马逊需求曲线 6-10 周。$16.99 下毛利 32%，已有两家验证过的供应商。",
    ],
    "cand-veggie-chopper": [
      "14 合 1 切菜器",
      "复购单量（而非首单）上升 45%，说明是动销不是压货。毛利 27% 偏薄——避开刀片数量战、主打可进洗碗机才有戏。",
    ],
    "cand-oil-dispenser": [
      "玻璃喷油壶",
      "跟着空气炸锅生态稳涨 90 天的词，不是脉冲热点。$13.99 价位毛利 35%，买家评论里点名要玻璃材质加刻度。",
    ],
    "cand-drawer-organizer": [
      "竹制抽屉收纳套装",
      "HausWerk 的上新节奏证明品类成立，但我们 $8.40 的 COGS 报价只有 20% 毛利，低于红线。等低于 $6.50 的供应商，或验证德国站差异化再说。",
    ],
    "cand-egg-cooker": [
      "迷你煮蛋器",
      "排名在涨但中位价两周跌了 $3——以 18% 毛利入场等于给价格战送钱。提议放弃，除非海运报价改变测算。",
    ],
    "cand-ice-tray": [
      "带盖可叠冰格",
      "季节性但每年重复：『透明冰』内容角度每个夏天都会再火一次。TikTok Shop 8% 费率下 $11.99 仍有 34% 毛利。",
    ],
    "cand-mini-blender": [
      "便携迷你榨汁杯",
      "电池 + 液体 + 刀片意味着高退货率（品类均值 11%），广告成本始终压不下来。计退货后实际毛利 15%——上月评审已放弃。",
    ],
  };
  const dominanceText = {
    "cand-lunchbox": [
      "货架分散：没有超过 250 条评论的链接，前三名只有颜色差别。评论护城河很浅，靠更好的场景图就能超越。",
      "90 天新进 4 家卖家，都在 50 条评论以下——尚早但还不算拥挤。",
    ],
    "cand-spice-rack": ["头部卖家本周断货；第二名涨价 $3。窗口期在两家补货前。", "90 天新进 3 家，速度中等。"],
    "cand-cloud-humidifier": [
      "亚马逊货架中等深度，但 TikTok Shop 几乎是空的：只有两条链接且视频素材很弱。",
      "90 天新进 5 家，基本只做亚马逊——TikTok Shop 赛道是开着的。",
    ],
    "cand-pet-hair-roller": [
      "一个老品牌（ChomChom）以 $24.95 占了 62% 评论量——但所有爆款视频卖的都是 $12-15 的通用款式。",
      "90 天新进 6 家且还在加速；这里拼速度胜过拼打磨。",
    ],
    "cand-milk-frother": [
      "两家头部超过 2.8k 评论；差异化只能靠充电底座和礼盒包装。",
      "90 天仅 2 家新进——货架是成熟，不是火热。",
    ],
    "cand-led-strip": [
      "头部完全饱和：五条链接超过 7.5k 评论，每个关键词都是品牌广告墙。",
      "新卖家已经停止进场——市场早已完成整合。",
    ],
    "cand-sink-caddy": [
      "一个 1.9k 评论的头部之后是长尾。防锈钢材版本可以吃下中部货架。",
      "90 天新进 3 家，全在模仿 Temu 的设计。",
    ],
    "cand-veggie-chopper": [
      "两家大卖坐镇，但他们的一星差评集中在容器开裂——材质升级就是切口。",
      "90 天新进 4 家；速度中等。",
    ],
    "cand-oil-dispenser": ["头部占据『塑料』分段；玻璃细分的头部只有 700 条评论。", "90 天新进 3 家；玻璃款供给不足。"],
    "cand-drawer-organizer": [
      "按 HausWerk 的上新历史，两个季度内头部就是他们的。德国站比美国站慢一个周期。",
      "90 天美国站新进 6 家；德国站货架仍然很薄。",
    ],
    "cand-egg-cooker": ["Dash 占 73% 评论量；其他人都在它的价格伞下抢残羹。", "90 天新进 2 家，都已在打折。"],
    "cand-ice-tray": ["没有垄断卖家；这个货架每年淡季都会洗牌一次。", "90 天新进 5 家——季节性抢跑已经开始。"],
    "cand-mini-blender": ["头部饱和，加上春天的召回报道给品类蒙上阴影。", "召回报道之后，新卖家进场速度崩了。"],
  };
  snapshot.candidates = snapshot.candidates.map((item) => {
    const text = candidateText[item.candidate_id];
    const comp = dominanceText[item.candidate_id];
    const next = { ...item };
    if (text) {
      next.name = text[0];
      next.why_it_matters = text[1];
    }
    if (comp) {
      next.competition = { ...next.competition, dominance_note: comp[0], velocity_note: comp[1] };
    }
    return next;
  });
  const trendText = {
    "tr-lunchbox-tiktok": [
      "可折叠硅胶饭盒 — 达人演示周播放 210 万",
      "本周三位达人发布折叠饭盒演示；头部视频日增约 40%，评论区反复出现『求链接』。",
    ],
    "tr-spice-rack-bsr": [
      "磁吸调料架 BSR 从 5,214 跳到 612（家居厨房）",
      "9 天排名跳升 88%，头部仅 214 条评论。前五名中两条链接本周断货。",
    ],
    "tr-humidifier-tiktok": [
      "『云朵』小夜灯加湿器重回 FYP",
      "同一造型的第二波：#roomdecor 下周播放 68 万。冬季角度消失，达人改推『桌面搭建』场景。",
    ],
    "tr-roller-tiktok": [
      "宠物除毛滚筒：周播放 140 万，遍地购物车链接",
      "清洁技巧账号在重剪同一个演示。7 天内出现 4 条 TikTok Shop 链接，均未超过 300 单。",
    ],
    "tr-sink-caddy-temu": [
      "伸缩水槽置物架爬升 Temu 家居热销榜",
      "两周内从收纳类第 4 页升到第 1 页，售价 $6.48。评论图显示两家供应商品质稳定。",
    ],
    "tr-chopper-ali": [
      "14 合 1 切菜器速卖通复购量上升",
      "前三供应商 30 天合计 3.2k 单，增长约 45%。美规插头版本 CN 仓发货，$4.90-5.60。",
    ],
    "tr-oil-sprayer-gt": [
      "『oil sprayer for cooking』搜索热度 90 天 +80%",
      "稳步上涨而非脉冲：空气炸锅关联持续拉动。相关词『olive oil sprayer glass』同样在涨。",
    ],
    "tr-frother-gt": [
      "『rechargeable milk frother』春季高峰后维持高位",
      "热度稳定在去年基线上方约 35%。家庭咖啡内容让这个词在送礼季之外也保持温度。",
    ],
    "tr-organizer-comp": [
      "HausWerk（追踪店铺）上线竹制抽屉收纳产品线",
      "一周上了 6 个 SKU，带 A+ 页面和新品券。他们最近三次上新都在一个季度内做到 500+ 评论。",
    ],
    "tr-egg-cooker-bsr": [
      "迷你煮蛋器重回小家电前 100",
      "两周排名改善 41%，但价格战清晰可见：同期中位价从 $18.99 跌到 $15.99。",
    ],
    "tr-ice-tray-temu": [
      "带盖可叠冰格在 Temu 厨房类走强",
      "夏季季节性叠加『透明冰』爆款角度。上周全平台约售 9k 件，$3.98-5.20。",
    ],
    "tr-led-strip-tiktok": [
      "LED 灯带房间改造格式仍在刷播放",
      "播放量高但混剪格式靠投放驱动；头部链接 4 万+ 评论，$9.99 锚定价。",
    ],
  };
  snapshot.trend_items = snapshot.trend_items.map((item) => {
    const text = trendText[item.trend_id];
    return text ? { ...item, title: text[0], summary: text[1] } : item;
  });
  const sourceNames = {
    "amazon-bsr-home": "亚马逊美国 BSR 飙升榜 — 家居厨房",
    "tiktok-kitchen": "TikTok 爆款视频 — #kitchengadgets",
    "temu-home": "Temu 上升商品 — 家居",
    "aliexpress-kitchen": "速卖通热销 — 厨房",
    "gtrends-kitchen": "Google Trends — 厨房小工具搜索词",
    "competitor-launches": "竞品新上架 — 追踪 4 家店铺",
  };
  snapshot.sources = snapshot.sources.map((item) => ({ ...item, name: sourceNames[item.source_id] || item.name }));
  const proposalText = {
    "prop-lunchbox": {
      title: "开发：可折叠硅胶饭盒",
      reason:
        "TikTok 需求在复利式增长，而亚马逊货架仍然很浅（头部 214 条评论、11% 份额）。利润卡过线：毛利 38.2%、保本 ACOS 54.5%。窗口期约 6-8 周。",
      brief:
        "采购简报\n- 产品：折叠硅胶饭盒，双格，蒸汽阀，LFGB 食品级硅胶\n- 目标 COGS：1,000 件 ≤ $4.60；现有模具（无开模费）——报价表中两家供应商各自确认\n- 样品：3 个配色（鼠尾草绿、奶油白、陶土橘）；洗碗机 + 微波炉 + 跌落测试\n- 运费：海运，目标到美仓 ≤ $2.10/件\n\nListing 简报（→ kelly-listing）\n- 标题角度：『可折叠饭盒——折后 1 英寸薄，带蒸汽阀，防漏』\n- 主图：折叠 vs 展开对比；办公桌午餐场景组图\n- 定价：$21.99 首发 + 15% 新品券；对标 $24.99 硬壳便当盒\n- 关键词：collapsible lunch box、silicone bento、fold flat lunch container\n- 视频：重拍折叠演示（获授权或自拍——不得盗剪达人素材）",
    },
    "prop-humidifier": {
      title: "开发：云朵小夜灯加湿器",
      reason: "第二波需求叠加桌面搭建角度；TikTok Shop 赛道几乎空白。毛利 42.1%，留得出 15% 达人佣金。",
      brief:
        "采购简报\n- 云朵造型超声波加湿器，300ml，暖光 LED，USB-C\n- 目标 COGS ≤ $6.80（500 件）；现有供应商（Nimbus 订单 #88）\n\nListing 简报（→ kelly-listing）\n- 先 TikTok Shop 后亚马逊\n- 钩子：『再次爆火的桌面云朵』——定位桌面搭建而非母婴\n- 定价 $27.99，达人佣金 15%，向中腰部桌搭达人寄样 20 件",
      verdictNote: "2026-06-27 已批准——进入采购；首单不超过 500 件。",
    },
    "prop-roller": {
      title: "开发：可重复用宠物除毛滚筒",
      reason: "全场最好的利润结构（45.6%）且拼速度：TikTok Shop 还没有超过 300 单的链接。",
      brief:
        "采购简报\n- 自清洁底座滚筒，ABS 外壳，目标 COGS ≤ $2.10（2,000 件）\n\nListing 简报（→ kelly-listing）——2026-06-29 已交接\n- 主打沙发前后对比图；$14.99 对标 ChomChom $24.95\n- 组合思路：迷你旅行装作为加购",
      verdictNote: "2026-06-29 已交接 kelly-listing；采购简报已导出。",
    },
    "prop-led-strip": {
      title: "放弃：RGB LED 灯带",
      reason:
        "头部饱和（4.1 万评论）、CPC $1.40+、价格崩到 $9.99。毛利 18% 未计退货已低于 25% 红线。这里的流量换不来新卖家的切口。",
      brief: "放弃并归档。只有出现真正的新形态（如免钉转角灯槽）且 CPC 低于 $0.80 才重开。",
      verdictNote: "2026-06-19 确认放弃。",
    },
    "prop-frother": {
      title: "观察：充电式奶泡器",
      reason: "需求耐久，但毛利随运费摆动：按当前 $2.00/件 估算是 33.5%，报价若到 $2.90 只剩约 29%。",
      brief:
        "复查条件\n- 触发 1：海运报价 ≤ $2.20/件（货代约 7 月 8 日回复）→ 转开发\n- 触发 2：任一头部（4.1k / 2.8k 评论）提价超过 $22 → 重新测算\n- 复查日期：2026-07-10；到期自动回到评审队列",
    },
    "prop-egg-cooker": {
      title: "放弃：迷你煮蛋器",
      reason: "Dash 占 73% 评论份额，中位价两周跌 $3。毛利 18.1% 低于红线——建议在样品支出前放弃。",
      brief: "放弃。价格伞属于 Dash；入场等于在没有评论基础的情况下资助一场折扣战。",
      verdictNote: "Kelly（2026-07-02）：先用合并后的海运报价重算利润卡——若仍低于 22%，我就批准放弃。",
    },
    "prop-organizer": {
      title: "观察：竹制抽屉收纳套装",
      reason:
        "HausWerk 的上新速度证明品类成立，但我们的 COGS 报价只给到 20% 毛利。等供应商低于 $6.50 或验证德国站角度后再动。",
      brief:
        "复查条件\n- 需要：供应商报价 ≤ $6.50（当前 $8.40）——8 月由 agent 重新扫 1688\n- 需要：.de 货架核查——若 8 月 15 日前认真做的链接仍少于 5 条，按德国站优先重启",
      verdictNote: "卡在供应商价格——新报价来之前没有可执行动作。",
    },
  };
  snapshot.proposals = snapshot.proposals.map((item) => {
    const text = proposalText[item.proposal_id];
    if (!text) return item;
    return {
      ...item,
      title: text.title,
      reason: text.reason,
      brief: text.brief,
      verdictNote: text.verdictNote || item.verdictNote,
    };
  });
  snapshot.sync_log = [
    {
      at: "2026-07-02T08:40:00.000Z",
      actor: "kelly-picks-agent",
      action: "ingest_trends",
      detail: "TikTok + BSR 扫描：写入 4 条趋势信号、新建 2 个候选品、跳过 1 条重复。",
    },
    {
      at: "2026-07-02T08:45:00.000Z",
      actor: "kelly-picks-agent",
      action: "compute_margins",
      detail: "按费率表重算 12 张利润卡；3 个候选品低于 25% 毛利红线。",
    },
    {
      at: "2026-07-01T19:20:00.000Z",
      actor: "kelly-picks-agent",
      action: "execute_decisions",
      detail: "Dry-run：2 个已批准提案 → 3 个计划操作（采购简报、listing 简报交接、观察项）。",
    },
  ];
  return snapshot;
}

function source(source_id, kind, name, method, last_sweep_at, items_7d, status) {
  return { source_id, kind, name, method, last_sweep_at, items_7d, status };
}

function trendItem(
  trend_id,
  sourceKind,
  title,
  summary,
  url,
  metric_label,
  metric_value,
  delta_pct,
  momentum,
  observed_at,
  candidate_id,
  external_id,
) {
  return {
    trend_id,
    source: sourceKind,
    title,
    summary,
    url,
    metric_label,
    metric_value,
    delta_pct,
    momentum,
    observed_at,
    candidate_id,
    external_id,
    content_hash: `demo-${trend_id}`,
  };
}

function candidate(
  candidate_id,
  name,
  category,
  sourceKind,
  source_ref,
  stage,
  platform_id,
  grade,
  momentum_pct,
  price,
  cogs,
  freight,
  feePct,
  adCost,
  why_it_matters,
  first_seen,
) {
  const feeAmount = round2(price * (feePct / 100));
  const marginBeforeAds = round2(price - cogs - freight - feeAmount);
  const margin = round2(marginBeforeAds - adCost);
  return {
    candidate_id,
    name,
    category,
    source: sourceKind,
    source_ref,
    stage,
    platform_id,
    competition_grade: grade,
    momentum_pct,
    est_price: price,
    currency: "USD",
    margin_card: {
      price,
      cogs,
      freight,
      platform_fee_pct: feePct,
      platform_fee: feeAmount,
      ad_cost: adCost,
      margin,
      margin_pct: round1((margin / price) * 100),
      breakeven_acos_pct: round1((marginBeforeAds / price) * 100),
      below_floor: (margin / price) * 100 < 25,
      computed_at: now,
    },
    why_it_matters,
    first_seen,
    last_updated: now,
  };
}

function competition(top_review_counts, head_share_pct, dominance_note, new_entrants_90d, velocity_note) {
  return { top_review_counts, head_share_pct, dominance_note, new_entrants_90d, velocity_note };
}

function evidenceLink(title, url) {
  return { title, url };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
