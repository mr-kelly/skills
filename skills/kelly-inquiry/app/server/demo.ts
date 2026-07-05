// Deterministic mock scenes for documentation and screenshots.
// Persona: "Lumina Lighting Co." — a foreign-trade LED-lighting supplier with
// WhatsApp + Instagram + email inquiry channels. Demo mode NEVER touches app/.data.
const now = "2026-07-03T09:00:00.000Z";

export const FEATURED_INQUIRY_ID = "wa-mueller-led-panels";

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
    app: "kelly-inquiry",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-inquiry/config.json",
      is_example: false,
      quote_defaults: {
        currency: "USD",
        validity_days: 30,
        incoterm: "FOB Shenzhen",
        payment_terms: "30% T/T deposit, 70% before shipment",
        min_price_guard: { enabled: true, block_below_price_min: true },
      },
      follow_up: { sla_days: { new: 1, replied: 2, quoted: 3, negotiating: 5 } },
      reply_style: { tone: "professional, warm, factory-direct", language: "match the buyer" },
      product_kb: { source_path: "demo://lumina/products.json" },
      accounts: snapshot.accounts.map((account) => ({
        account_id: account.account_id,
        channel: account.channel,
        connector: account.connector,
        display_name: account.display_name,
        handle: account.handle,
        secret_envs: ["browser_agent", "manual", "email_agent"].includes(account.connector)
          ? []
          : [`KELLY_INQUIRY_${account.channel.toUpperCase()}_ACCESS_TOKEN_DEMO`],
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
  const products = demoProducts();
  const inquiries = demoInquiries();
  const quotes = demoQuotes();
  const approvals = demoApprovals();
  const accounts = demoAccounts(inquiries);
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-inquiry-demo",
    base_currency: "USD",
    metrics: {},
    accounts,
    inquiries,
    quotes,
    products,
    approvals,
    sync_log: [
      sync(
        "sync-wa-0845",
        "wa-sales",
        "whatsapp_cloud",
        "2026-07-03T08:45:00.000Z",
        "ok",
        "Webhook backlog ingested; 5 new messages.",
        5,
      ),
      sync(
        "sync-ig-0850",
        "ig-lumina",
        "instagram_graph",
        "2026-07-03T08:50:00.000Z",
        "ok",
        "Instagram DMs scanned via Graph API.",
        3,
      ),
      sync(
        "sync-email-0830",
        "sales-email",
        "email_agent",
        "2026-07-03T08:30:00.000Z",
        "ok",
        "2 inquiry emails handed off from kelly-email.",
        2,
      ),
    ],
    warnings: [
      {
        id: "quote-0712-expired",
        severity: "warning",
        account_id: "sales-email",
        message: "Quote Q-2026-0712 for Gulf Lumen Trading expired on Jun 28 with no reply.",
        detail: "A follow-up draft is waiting in Approvals (Reply #4).",
      },
    ],
  };
  recomputeDemoMetrics(snapshot);
  return snapshot;
}

function recomputeDemoMetrics(snapshot) {
  const stage_counts = { new: 0, replied: 0, quoted: 0, negotiating: 0, won: 0, lost: 0 };
  const by_channel = {};
  let weekTotal = 0;
  const weekAgo = new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000;
  for (const inquiry of snapshot.inquiries) {
    stage_counts[inquiry.stage] += 1;
    if (new Date(inquiry.created_at).getTime() >= weekAgo) {
      weekTotal += 1;
      by_channel[inquiry.channel] = (by_channel[inquiry.channel] || 0) + 1;
    }
  }
  snapshot.metrics = {
    account_count: snapshot.accounts.length,
    inquiry_count: snapshot.inquiries.length,
    quote_count: snapshot.quotes.length,
    product_count: snapshot.products.length,
    unanswered_new_count: snapshot.inquiries.filter(
      (item) => item.stage === "new" && !item.messages.some((message) => message.direction === "outgoing"),
    ).length,
    quotes_sent: snapshot.quotes.filter((quote) => ["sent", "accepted", "expired", "declined"].includes(quote.status))
      .length,
    win_rate: 0.5,
    reply_median_minutes: 46,
    inquiries_this_week: { total: weekTotal, by_channel },
    stage_counts,
  };
}

function demoAccounts(inquiries) {
  const defs = [
    [
      "wa-sales",
      "whatsapp",
      "whatsapp_cloud",
      "Lumina WhatsApp Business",
      "+86 755 8899 0001",
      "2026-07-03T08:45:00.000Z",
    ],
    ["ig-lumina", "instagram", "instagram_graph", "Lumina Instagram", "@lumina.lighting", "2026-07-03T08:50:00.000Z"],
    [
      "sales-email",
      "email",
      "email_agent",
      "Lumina Sales Mailbox",
      "sales@luminalighting.com",
      "2026-07-03T08:30:00.000Z",
    ],
  ];
  return defs.map(([account_id, channel, connector, display_name, handle, last_sync_at]) => {
    const owned = inquiries.filter((item) => item.account_id === account_id);
    return {
      account_id,
      channel,
      connector,
      display_name,
      handle,
      status: "ok",
      inquiry_count: owned.length,
      unread_count: owned.filter((item) => item.unread).length,
      last_sync_at,
    };
  });
}

function demoProducts() {
  return [
    product(
      "prod-panel-6060",
      "LL-PNL-6060-40",
      "LED Panel Light 60×60 40W",
      "Commercial indoor",
      200,
      6.8,
      8.5,
      15,
      {
        Power: "40W",
        "Luminous flux": "4000 lm",
        CRI: ">80",
        CCT: "3000K–6500K",
        Certificates: "CE, RoHS, TÜV",
        Warranty: "3 years",
      },
      [
        faq(
          "Do you provide CE and TÜV certificates?",
          "Yes. CE (EMC+LVD), RoHS and TÜV reports ship with the PI; PDF copies available on request.",
        ),
        faq(
          "Is OEM branding available?",
          "Yes — silk-screen logo and neutral or custom color boxes from 500 pcs, no tooling fee.",
        ),
        faq("Can the driver be dimmable?", "1-10V or DALI dimming drivers add $0.60–$0.90 per unit, MOQ unchanged."),
      ],
    ),
    product(
      "prod-highbay-150",
      "LL-HB-150U",
      "UFO High Bay Light 150W",
      "Industrial",
      50,
      24.5,
      29.0,
      20,
      {
        Power: "150W",
        Efficacy: "160 lm/W",
        "IP rating": "IP65",
        "Beam angle": "90°/120°",
        Certificates: "CE, RoHS",
        Warranty: "5 years",
      },
      [
        faq(
          "What is the price break at 500 pcs?",
          "500+ pcs lands near the floor of the range with Meanwell driver included.",
        ),
        faq("Do you stock 100W and 200W versions?", "Yes, same housing; lead time is unchanged."),
      ],
    ),
    product(
      "prod-strip-2835",
      "LL-STR-2835",
      "LED Strip 2835 120LED/m IP20",
      "Decorative",
      500,
      1.15,
      1.6,
      12,
      {
        LEDs: "120/m",
        Voltage: "DC24V",
        CRI: ">90",
        "Cut unit": "50mm",
        Roll: "5m",
        Certificates: "CE, RoHS",
      },
      [
        faq("Is the price per meter or per roll?", "Per meter, packed in 5 m rolls; MOQ is 500 m (100 rolls)."),
        faq("Do you offer IP65/IP67 versions?", "Yes, silicone-coated IP65 adds $0.25/m, IP67 tube adds $0.40/m."),
      ],
    ),
    product(
      "prod-flood-100",
      "LL-FL-100",
      "LED Flood Light 100W",
      "Outdoor",
      100,
      12.2,
      15.8,
      18,
      {
        Power: "100W",
        Efficacy: "140 lm/W",
        "IP rating": "IP66",
        Housing: "Die-cast aluminum",
        Certificates: "CE, RoHS",
      },
      [
        faq(
          "Can you ship DDP to Brazil?",
          "We quote FOB by default; DDP possible via our forwarder to major BR ports, add 12-15 days.",
        ),
      ],
    ),
    product(
      "prod-down-12",
      "LL-DL-12",
      "Anti-glare Downlight 12W",
      "Residential",
      300,
      2.9,
      4.1,
      15,
      {
        Power: "12W",
        UGR: "<19",
        Cutout: "Ø75mm",
        CCT: "3000K/4000K/6000K",
        Certificates: "CE, RoHS",
      },
      [
        faq(
          "What OEM packaging is available?",
          "Neutral white box standard; custom printed box from 1000 pcs at $0.08/unit.",
        ),
        faq("Are the trims replaceable?", "Yes — white, black and nickel trims are interchangeable."),
      ],
    ),
    product(
      "prod-track-30",
      "LL-TR-30",
      "COB Track Light 30W",
      "Commercial indoor",
      200,
      8.4,
      11.2,
      15,
      {
        Power: "30W",
        CRI: ">90",
        Adapter: "2/3/4-wire",
        "Beam angle": "15°/24°/36°",
        Certificates: "CE, RoHS, TÜV",
      },
      [
        faq(
          "Which track standards fit?",
          "Global 3-circuit and single-circuit adapters; specify the standard on the PO.",
        ),
      ],
    ),
    product(
      "prod-street-60",
      "LL-SL-60",
      "Solar Street Light 60W",
      "Outdoor",
      50,
      38.0,
      46.0,
      25,
      {
        Power: "60W",
        Battery: "LiFePO4 15Ah",
        Autonomy: "3 rainy days",
        Pole: "not included",
        Certificates: "CE, RoHS, IP66",
      },
      [
        faq("How long does the battery last?", "LiFePO4 rated 2000+ cycles, roughly 5 years in tropical climates."),
        faq("Do you provide remote controls?", "Yes, a remote plus 5-mode controller is included per unit."),
      ],
    ),
  ];
}

function demoInquiries() {
  return [
    inquiry(
      FEATURED_INQUIRY_ID,
      "wa-sales",
      "whatsapp",
      customer("Klaus Müller", "Müller Licht Distribution GmbH", "DE", "WhatsApp inbound"),
      "60×60 LED panels + COB track lights",
      ["prod-panel-6060", "prod-track-30"],
      ["q-2026-0731"],
      "new",
      18480,
      "Kelly",
      true,
      "2026-07-03T06:58:00.000Z",
      "2026-07-03",
      "4915770001122@wa",
      [
        msg(
          "mue-1",
          "incoming",
          "Klaus Müller",
          "Hello, this is Klaus from Müller Licht Distribution in Hamburg. We supply electrical wholesalers across northern Germany.",
          "2026-07-03T06:58:00.000Z",
        ),
        msg(
          "mue-2",
          "incoming",
          "Klaus Müller",
          "We're looking for a new panel supplier: 60×60 40W, UGR<19, around 2000 pcs per quarter to start.",
          "2026-07-03T07:02:00.000Z",
        ),
        msg(
          "mue-3",
          "incoming",
          "Klaus Müller",
          "Key questions: what is your MOQ, and do you have CE + TÜV reports we can file for the German market?",
          "2026-07-03T07:05:00.000Z",
        ),
        msg(
          "mue-4",
          "incoming",
          "Klaus Müller",
          "We'd also add ~400 COB track lights 30W if the panel price works.",
          "2026-07-03T07:31:00.000Z",
        ),
        msg(
          "mue-5",
          "incoming",
          "Klaus Müller",
          "Please quote FOB with lead time to Hamburg. If terms fit we can confirm within two weeks.",
          "2026-07-03T07:42:00.000Z",
        ),
      ],
      "Hello Klaus, thank you for the detailed brief! MOQ on the 60×60 40W panel is 200 pcs, and at 2,000 pcs you land in our best tier: $7.40/pc FOB Shenzhen. Both CE (EMC+LVD) and TÜV reports are current — I'll attach the PDFs. Adding 400 COB track lights 30W at $9.20 keeps one consolidated shipment; production is 15 days plus ~30 days sea freight to Hamburg. I've prepared quote Q-2026-0731 with everything itemized — may I send it over?",
      "2026-07-03T06:45:00.000Z",
    ),

    inquiry(
      "wa-santos-floodlights",
      "wa-sales",
      "whatsapp",
      customer("Rafael Santos", "Santos Import Ltda", "BR", "WhatsApp inbound"),
      "100W flood lights, price-focused",
      ["prod-flood-100"],
      [],
      "replied",
      6200,
      "Kelly",
      true,
      "2026-07-02T18:40:00.000Z",
      "2026-07-04",
      "5511998800233@wa",
      [
        msg(
          "san-1",
          "incoming",
          "Rafael Santos",
          "Oi! I import lighting to São Paulo. Your 100W flood light — best price for 400 pcs?",
          "2026-07-01T14:12:00.000Z",
        ),
        msg(
          "san-2",
          "outgoing",
          "Kelly",
          "Hi Rafael! For 400 pcs the 100W IP66 flood is $13.90 FOB. Die-cast housing, 140lm/W.",
          "2026-07-01T15:05:00.000Z",
        ),
        msg(
          "san-3",
          "incoming",
          "Rafael Santos",
          "Competitor offers $11.80 for the same watts. Can you match?",
          "2026-07-02T09:20:00.000Z",
        ),
        msg(
          "san-4",
          "incoming",
          "Rafael Santos",
          "If you do $12, I close today and repeat monthly.",
          "2026-07-02T18:40:00.000Z",
        ),
      ],
      "",
      "2026-07-01T14:12:00.000Z",
    ),

    inquiry(
      "em-alfarsi-street",
      "sales-email",
      "email",
      customer("Omar Al-Farsi", "Gulf Lumen Trading LLC", "AE", "email inquiry"),
      "Solar street lights + high bays for a municipal tender",
      ["prod-street-60", "prod-highbay-150", "prod-flood-100"],
      ["q-2026-0712"],
      "quoted",
      41070,
      "Kelly",
      false,
      "2026-06-24T10:05:00.000Z",
      "2026-06-30",
      "omar@gulflumen.ae",
      [
        msg(
          "alf-1",
          "incoming",
          "Omar Al-Farsi",
          "Dear Lumina team, we are bidding a municipal tender in Sharjah: 500 solar street lights 60W, 600 UFO high bays 150W, 300 flood lights 100W. Please send your best FOB offer with certificates.",
          "2026-06-22T08:30:00.000Z",
        ),
        msg(
          "alf-2",
          "outgoing",
          "Kelly",
          "Dear Mr. Al-Farsi, thank you for the tender details. Please find quote Q-2026-0712 attached — valid until Jun 28 with tender-support pricing.",
          "2026-06-24T10:05:00.000Z",
        ),
        msg(
          "alf-3",
          "incoming",
          "Omar Al-Farsi",
          "Received, we are comparing three suppliers and will revert.",
          "2026-06-24T13:12:00.000Z",
        ),
      ],
      "",
      "2026-06-22T08:30:00.000Z",
    ),

    inquiry(
      "ig-parker-retail",
      "ig-lumina",
      "instagram",
      customer("Dana Parker", "Parker Retail Group", "US", "Instagram DM"),
      "Downlights + track lights for 8 retail stores",
      ["prod-down-12", "prod-track-30"],
      ["q-2026-0725"],
      "quoted",
      9800,
      "Kelly",
      false,
      "2026-06-28T16:20:00.000Z",
      "2026-07-05",
      "ig:parkerretail",
      [
        msg(
          "par-1",
          "incoming",
          "Dana Parker",
          "Hi! Found you via the showroom reel. We're refitting 8 stores in Texas — need anti-glare downlights and track spots.",
          "2026-06-27T15:02:00.000Z",
        ),
        msg(
          "par-2",
          "outgoing",
          "Kelly",
          "Hi Dana! Happy to help — roughly how many points per store, and ceiling height?",
          "2026-06-27T15:40:00.000Z",
        ),
        msg(
          "par-3",
          "incoming",
          "Dana Parker",
          "About 120 downlights and 60 track spots per store, 3.2 m ceilings.",
          "2026-06-27T16:15:00.000Z",
        ),
        msg(
          "par-4",
          "outgoing",
          "Kelly",
          "Perfect fit for our 12W UGR<19 downlight + 30W COB track. Quote Q-2026-0725 is on its way to your email.",
          "2026-06-28T16:20:00.000Z",
        ),
        msg(
          "par-5",
          "incoming",
          "Dana Parker",
          "Got it, reviewing with our contractor this week.",
          "2026-06-29T14:08:00.000Z",
        ),
      ],
      "",
      "2026-06-27T15:02:00.000Z",
    ),

    inquiry(
      "wa-lim-highbay",
      "wa-sales",
      "whatsapp",
      customer("Wei Lim", "Lim Brothers Electrical Sdn Bhd", "MY", "returning customer"),
      "150W high bays — negotiating tier price",
      ["prod-highbay-150"],
      [],
      "negotiating",
      23400,
      "Kelly",
      true,
      "2026-07-02T11:30:00.000Z",
      "2026-07-06",
      "60123456789@wa",
      [
        msg(
          "lim-1",
          "incoming",
          "Wei Lim",
          "Kelly, the warehouse client approved phase 2 — we need 900 UFO high bays now, not 600.",
          "2026-06-30T08:10:00.000Z",
        ),
        msg(
          "lim-2",
          "outgoing",
          "Kelly",
          "Great news! At 900 pcs I can improve to $26.00/pc with Meanwell driver.",
          "2026-06-30T09:00:00.000Z",
        ),
        msg(
          "lim-3",
          "incoming",
          "Wei Lim",
          "Client pushes for $22.80. I know it's aggressive — any way with a generic driver?",
          "2026-07-01T10:44:00.000Z",
        ),
        msg(
          "lim-4",
          "outgoing",
          "Kelly",
          "That's below our floor even with a generic driver. Let me check options with the factory and revert tomorrow.",
          "2026-07-01T11:20:00.000Z",
        ),
        msg(
          "lim-5",
          "incoming",
          "Wei Lim",
          "OK. If we can land $24-ish with 5-year warranty, deal is ours.",
          "2026-07-02T11:30:00.000Z",
        ),
      ],
      "",
      "2026-06-30T08:10:00.000Z",
    ),

    inquiry(
      "em-ortega-strips",
      "sales-email",
      "email",
      customer("Lucía Ortega", "Ortega Iluminación S.L.", "ES", "email inquiry"),
      "LED strips for a hotel renovation",
      ["prod-strip-2835"],
      [],
      "new",
      4500,
      "Kelly",
      true,
      "2026-07-02T16:04:00.000Z",
      "2026-07-03",
      "lucia@ortegailuminacion.es",
      [
        msg(
          "ort-1",
          "incoming",
          "Lucía Ortega",
          "Buenas tardes, we are renovating a 4-star hotel in Valencia and need approx. 3,000 m of CRI>90 strip, 24V, 3000K. Could you send pricing and a datasheet? Project starts in September.",
          "2026-07-02T16:04:00.000Z",
        ),
      ],
      "",
      "2026-07-02T16:04:00.000Z",
    ),

    inquiry(
      "wa-adeyemi-solar",
      "wa-sales",
      "whatsapp",
      customer("Chidi Adeyemi", "Adeyemi Power Solutions", "NG", "WhatsApp inbound"),
      "200 solar street lights for an estate project",
      ["prod-street-60"],
      [],
      "replied",
      8800,
      "Kelly",
      false,
      "2026-07-01T09:16:00.000Z",
      "2026-07-05",
      "2348012345678@wa",
      [
        msg(
          "ade-1",
          "incoming",
          "Chidi Adeyemi",
          "Good day. I need 200 units of 60W solar street light for an estate in Lagos. What is the battery life and warranty?",
          "2026-06-30T17:25:00.000Z",
        ),
        msg(
          "ade-2",
          "outgoing",
          "Kelly",
          "Good day Chidi! LiFePO4 15Ah battery, 2000+ cycles (~5 years), 3 rainy-day autonomy, 3-year warranty. For 200 pcs: $44.00 FOB.",
          "2026-07-01T09:16:00.000Z",
        ),
        msg(
          "ade-3",
          "incoming",
          "Chidi Adeyemi",
          "Noted. I will confirm the pole spec with the site engineer and revert.",
          "2026-07-01T12:40:00.000Z",
        ),
      ],
      "",
      "2026-06-30T17:25:00.000Z",
    ),

    inquiry(
      "ig-brightmart-panels",
      "ig-lumina",
      "instagram",
      customer("Grace Chen", "BrightMart Online Inc.", "US", "Instagram DM"),
      "Panels + downlights for e-commerce private label",
      ["prod-panel-6060", "prod-down-12"],
      ["q-2026-0698"],
      "won",
      12600,
      "Kelly",
      false,
      "2026-06-20T15:30:00.000Z",
      "",
      "ig:brightmart",
      [
        msg(
          "bri-1",
          "incoming",
          "Grace Chen",
          "Hi Lumina! We sell private-label lighting on Amazon US. Interested in your 60×60 panels with our branding.",
          "2026-06-12T18:22:00.000Z",
        ),
        msg(
          "bri-2",
          "outgoing",
          "Kelly",
          "Hi Grace! OEM is our bread and butter — logo silk-screen and custom boxes from 500 pcs. Sent quote Q-2026-0698.",
          "2026-06-13T08:45:00.000Z",
        ),
        msg(
          "bri-3",
          "incoming",
          "Grace Chen",
          "Quote accepted! PO and deposit sent today. Excited to work together.",
          "2026-06-20T15:30:00.000Z",
        ),
        msg(
          "bri-4",
          "outgoing",
          "Kelly",
          "Deposit received — production slot booked, ETD Jul 18. Thank you Grace!",
          "2026-06-20T16:02:00.000Z",
        ),
      ],
      "",
      "2026-06-12T18:22:00.000Z",
    ),

    inquiry(
      "em-wilson-tubes",
      "sales-email",
      "email",
      customer("Tom Wilson", "Wilson & Co Lighting Pty", "AU", "email inquiry"),
      "Warehouse relight — went with a local stockist",
      ["prod-highbay-150"],
      [],
      "lost",
      7200,
      "Kelly",
      false,
      "2026-06-26T09:10:00.000Z",
      "",
      "tom@wilsonlighting.com.au",
      [
        msg(
          "wil-1",
          "incoming",
          "Tom Wilson",
          "Hi, quoting a warehouse relight in Perth — 250 high bays. Lead time is critical, needed on site within 3 weeks.",
          "2026-06-18T07:44:00.000Z",
        ),
        msg(
          "wil-2",
          "outgoing",
          "Kelly",
          "Hi Tom, production is 20 days + ~18 days sea freight, so 3 weeks door-to-door isn't realistic. Fastest is air at significant cost.",
          "2026-06-18T09:30:00.000Z",
        ),
        msg(
          "wil-3",
          "incoming",
          "Tom Wilson",
          "Appreciate the honesty. We'll take local stock this time, but keep me on your list for planned projects.",
          "2026-06-26T09:10:00.000Z",
        ),
      ],
      "",
      "2026-06-18T07:44:00.000Z",
    ),

    inquiry(
      "ig-schmidt-oem",
      "ig-lumina",
      "instagram",
      customer("Anna Schmidt", "Schmidt Home GmbH", "DE", "Instagram DM"),
      "Downlight OEM packaging question",
      ["prod-down-12"],
      [],
      "new",
      3800,
      "Kelly",
      true,
      "2026-07-01T10:20:00.000Z",
      "2026-07-02",
      "ig:schmidthome",
      [
        msg(
          "sch-1",
          "incoming",
          "Anna Schmidt",
          "Hello! We run a home-improvement brand in Bavaria. Can your 12W downlight ship in our printed retail box? Thinking 1,200 pcs to start.",
          "2026-07-01T10:20:00.000Z",
        ),
        msg(
          "sch-2",
          "incoming",
          "Anna Schmidt",
          "Also — do you have photometric files (IES/LDT) for it?",
          "2026-07-01T10:24:00.000Z",
        ),
      ],
      "",
      "2026-07-01T10:20:00.000Z",
    ),

    inquiry(
      "wa-oliveira-mix",
      "wa-sales",
      "whatsapp",
      customer("Paula Oliveira", "Oliveira Distribuidora", "BR", "trade-show contact"),
      "Flood + track light mixed container",
      ["prod-flood-100", "prod-track-30"],
      ["q-2026-0728"],
      "quoted",
      15200,
      "Kelly",
      false,
      "2026-06-29T13:50:00.000Z",
      "2026-07-04",
      "5521997700456@wa",
      [
        msg(
          "oli-1",
          "incoming",
          "Paula Oliveira",
          "Kelly! Good meeting you at the Canton Fair. Ready to move on that mixed container we discussed.",
          "2026-06-28T19:33:00.000Z",
        ),
        msg(
          "oli-2",
          "outgoing",
          "Kelly",
          "Paula! Great to hear from you. Confirming: 600 flood 100W + 800 track 30W, one 40HQ. Quote coming right up.",
          "2026-06-29T08:15:00.000Z",
        ),
        msg(
          "oli-3",
          "outgoing",
          "Kelly",
          "Quote Q-2026-0728 sent — valid until Jul 27, FOB Shenzhen.",
          "2026-06-29T13:50:00.000Z",
        ),
        msg(
          "oli-4",
          "incoming",
          "Paula Oliveira",
          "Received! Checking freight with our forwarder, will confirm next week.",
          "2026-06-30T21:04:00.000Z",
        ),
      ],
      "",
      "2026-06-28T19:33:00.000Z",
    ),

    inquiry(
      "wa-hassan-track",
      "wa-sales",
      "whatsapp",
      customer("Yusuf Hassan", "Hassan Building Materials", "AE", "WhatsApp inbound"),
      "Track light samples before a mall project",
      ["prod-track-30"],
      [],
      "replied",
      5600,
      "Kelly",
      false,
      "2026-07-01T15:48:00.000Z",
      "2026-07-07",
      "971501234567@wa",
      [
        msg(
          "has-1",
          "incoming",
          "Yusuf Hassan",
          "Salam, we are shortlisting track spots for a mall refit in Dubai. Can you send 4 samples: 15° and 24°, black and white?",
          "2026-06-30T13:05:00.000Z",
        ),
        msg(
          "has-2",
          "outgoing",
          "Kelly",
          "Wa alaikum salam Yusuf! Yes — 4 samples at $12 each incl. DHL, credited back on your first order. Address please?",
          "2026-07-01T15:48:00.000Z",
        ),
        msg(
          "has-3",
          "incoming",
          "Yusuf Hassan",
          "Sending the address shortly. Project needs about 700 units in August.",
          "2026-07-02T10:22:00.000Z",
        ),
      ],
      "",
      "2026-06-30T13:05:00.000Z",
    ),
  ];
}

function demoQuotes() {
  return [
    quote(
      "q-2026-0731",
      "Q-2026-0731",
      FEATURED_INQUIRY_ID,
      "Klaus Müller · Müller Licht Distribution GmbH",
      "draft",
      "2026-07-03",
      "2026-08-02",
      [
        line("l1", "prod-panel-6060", "LL-PNL-6060-40", "LED Panel Light 60×60 40W, UGR<19, 4000K, CE+TÜV", 2000, 7.4),
        line("l2", "prod-track-30", "LL-TR-30", "COB Track Light 30W, CRI>90, 24°, black, 3-circuit", 400, 9.2),
      ],
      "FOB Shenzhen · 30% T/T deposit, 70% before shipment · production 15 days",
      "Tier price for 2,000 pcs; KB floor is $6.80 on the panel and $8.40 on the track — margin guard OK. Sea freight Hamburg ~30 days, quote separately.",
      "2026-07-03T06:45:00.000Z",
    ),
    quote(
      "q-2026-0725",
      "Q-2026-0725",
      "ig-parker-retail",
      "Dana Parker · Parker Retail Group",
      "sent",
      "2026-06-28",
      "2026-07-28",
      [
        line("l1", "prod-down-12", "LL-DL-12", "Anti-glare Downlight 12W, UGR<19, 4000K, white trim", 1000, 3.6),
        line("l2", "prod-track-30", "LL-TR-30", "COB Track Light 30W, 24°, white, single-circuit", 620, 10.0),
      ],
      "FOB Shenzhen · 30% T/T deposit, 70% before shipment",
      "8-store rollout; contractor may phase the order — hold pricing for full quantity.",
      "2026-06-28T16:20:00.000Z",
    ),
    quote(
      "q-2026-0712",
      "Q-2026-0712",
      "em-alfarsi-street",
      "Omar Al-Farsi · Gulf Lumen Trading LLC",
      "expired",
      "2026-06-24",
      "2026-06-28",
      [
        line("l1", "prod-street-60", "LL-SL-60", "Solar Street Light 60W, LiFePO4 15Ah, remote incl.", 500, 42.0),
        line("l2", "prod-highbay-150", "LL-HB-150U", "UFO High Bay 150W, 160lm/W, IP65, Meanwell driver", 600, 26.5),
        line("l3", "prod-flood-100", "LL-FL-100", "LED Flood Light 100W, IP66, die-cast housing", 300, 13.9),
      ],
      "FOB Shenzhen · tender terms: 30% T/T, 70% against B/L copy",
      "Tender-support pricing, valid 5 days only. Expired Jun 28 — revalidation needs current material costs.",
      "2026-06-24T10:05:00.000Z",
    ),
    quote(
      "q-2026-0728",
      "Q-2026-0728",
      "wa-oliveira-mix",
      "Paula Oliveira · Oliveira Distribuidora",
      "sent",
      "2026-06-29",
      "2026-07-27",
      [
        line("l1", "prod-flood-100", "LL-FL-100", "LED Flood Light 100W, IP66", 600, 13.2),
        line("l2", "prod-track-30", "LL-TR-30", "COB Track Light 30W, 36°, black", 800, 9.1),
      ],
      "FOB Shenzhen · 30% T/T deposit, 70% before shipment · one 40HQ container",
      "Canton Fair follow-up; freight to Santos quoted by the buyer's forwarder.",
      "2026-06-29T13:50:00.000Z",
    ),
    quote(
      "q-2026-0698",
      "Q-2026-0698",
      "ig-brightmart-panels",
      "Grace Chen · BrightMart Online Inc.",
      "accepted",
      "2026-06-13",
      "2026-07-13",
      [
        line("l1", "prod-panel-6060", "LL-PNL-6060-40", "LED Panel 60×60 40W, OEM logo + custom box", 1500, 7.9),
        line("l2", "prod-down-12", "LL-DL-12", "Anti-glare Downlight 12W, OEM box", 200, 3.75),
      ],
      "FOB Shenzhen · 30% T/T deposit received Jun 20 · ETD Jul 18",
      "OEM order — deposit received, production slot booked.",
      "2026-06-13T08:45:00.000Z",
    ),
  ];
}

function demoApprovals() {
  return [
    approval(
      1,
      "reply",
      FEATURED_INQUIRY_ID,
      "",
      "wa-sales",
      "whatsapp",
      "Klaus Müller · Müller Licht Distribution GmbH",
      "Hello Klaus, thank you for the detailed brief! MOQ on the 60×60 40W panel is 200 pcs, and at 2,000 pcs you land in our best tier: $7.40/pc FOB Shenzhen. Both CE (EMC+LVD) and TÜV reports are current — I'll attach the PDFs. Adding 400 COB track lights 30W at $9.20 keeps one consolidated shipment; production is 15 days plus ~30 days sea freight to Hamburg. I've prepared quote Q-2026-0731 with everything itemized — may I send it over?",
      "Hot German distributor, 2,000 pcs/quarter potential. Facts checked against the product KB: MOQ 200, CE+TÜV current, tier price $7.40 is above the $6.80 floor.",
      "needs_review",
      null,
      null,
      "2026-07-03T08:05:00.000Z",
    ),
    approval(
      2,
      "quote",
      FEATURED_INQUIRY_ID,
      "q-2026-0731",
      "wa-sales",
      "whatsapp",
      "Klaus Müller · Müller Licht Distribution GmbH",
      "Quote Q-2026-0731 · 2,000 × LL-PNL-6060-40 @ $7.40 + 400 × LL-TR-30 @ $9.20 = $18,480.00 FOB Shenzhen. Valid until Aug 2. CE + TÜV reports attached. Production 15 days after deposit.",
      "Draft quote built from KB tier pricing; both lines pass the min-price guard. Send together with Reply #1 after approval.",
      "needs_review",
      null,
      null,
      "2026-07-03T08:06:00.000Z",
    ),
    approval(
      3,
      "reply",
      "wa-santos-floodlights",
      "",
      "wa-sales",
      "whatsapp",
      "Rafael Santos · Santos Import Ltda",
      "Hi Rafael, I checked with the factory: $11.80 would be below our cost for the die-cast IP66 version — the cheaper offers are usually sheet-metal housings. I can do $12.90 at 400 pcs, or $12.40 if we consolidate with your next month's order in one container.",
      "Price-hunting buyer pushing under the $12.20 KB floor; draft holds the floor and offers consolidation instead.",
      "changes_requested",
      {
        action: "request_changes",
        comment:
          "Good line, but don't offer $12.40 — floor plus freight consolidation only. Also mention the 2-year warranty difference.",
        decided_at: "2026-07-03T08:40:00.000Z",
      },
      null,
      "2026-07-03T08:10:00.000Z",
    ),
    approval(
      4,
      "reply",
      "em-alfarsi-street",
      "",
      "sales-email",
      "email",
      "Omar Al-Farsi · Gulf Lumen Trading LLC",
      "Dear Mr. Al-Farsi, following up on quote Q-2026-0712 which expired on Jun 28. Material costs are stable, so we can revalidate the same pricing until Jul 15 if the tender is still open. If the committee needs anything — compliance documents, samples, or a video factory audit — we're glad to arrange it this week.",
      "Expired tender quote worth $41,070 with no reply for 9 days; follow-up SLA for quoted stage (3 days) exceeded.",
      "approved",
      {
        action: "approve",
        comment: "Send as is — revalidating to Jul 15 is right.",
        decided_at: "2026-07-03T08:45:00.000Z",
      },
      null,
      "2026-07-03T08:12:00.000Z",
    ),
    approval(
      5,
      "reply",
      "wa-adeyemi-solar",
      "",
      "wa-sales",
      "whatsapp",
      "Chidi Adeyemi · Adeyemi Power Solutions",
      "Good day Chidi! LiFePO4 15Ah battery, 2000+ cycles (~5 years), 3 rainy-day autonomy, 3-year warranty. For 200 pcs: $44.00 FOB.",
      "Battery and warranty answer drafted from the product KB FAQ.",
      "done",
      { action: "approve", comment: "", decided_at: "2026-07-01T09:10:00.000Z" },
      {
        status: "executed",
        operation: "send_message",
        connector: "whatsapp_cloud",
        target: "2348012345678@wa",
        detail: "Sent via WhatsApp Cloud API.",
        executed_at: "2026-07-01T09:16:00.000Z",
      },
      "2026-07-01T09:04:00.000Z",
    ),
    approval(
      6,
      "quote",
      "wa-lim-highbay",
      "",
      "wa-sales",
      "whatsapp",
      "Wei Lim · Lim Brothers Electrical Sdn Bhd",
      "Revised quote draft Q-2026-0736 · 900 × LL-HB-150U @ $22.80 = $20,520.00 FOB Shenzhen (generic driver, 3-year warranty).",
      "Buyer requested $22.80 — below the $24.50 KB floor. Min-price guard tripped; needs Kelly's call with the factory before any counter-offer.",
      "blocked",
      {
        action: "block",
        comment: "Below floor. Hold until I talk to the factory about a generic-driver BOM on Friday.",
        decided_at: "2026-07-02T12:00:00.000Z",
      },
      null,
      "2026-07-02T11:50:00.000Z",
    ),
  ];
}

function demoDecisions(zh) {
  const comments = zh
    ? {
        3: "这句可以，但不要给到 $12.40 —— 守住底价，只用拼柜运费让利。另外补充 2 年质保的差异。",
        4: "照发 —— 重新有效期到 7 月 15 日是对的。",
        6: "低于底价。等我周五和工厂谈完通用电源的成本再说。",
      }
    : {
        3: "Good line, but don't offer $12.40 — floor plus freight consolidation only. Also mention the 2-year warranty difference.",
        4: "Send as is — revalidating to Jul 15 is right.",
        6: "Below floor. Hold until I talk to the factory about a generic-driver BOM on Friday.",
      };
  return {
    schema_version: "1",
    updated_at: "2026-07-03T08:45:00.000Z",
    decisions: {
      "approval-demo-3": {
        action: "request_changes",
        comment: comments[3],
        status: "changes_requested",
        decided_at: "2026-07-03T08:40:00.000Z",
      },
      "approval-demo-4": {
        action: "approve",
        comment: comments[4],
        status: "approved",
        decided_at: "2026-07-03T08:45:00.000Z",
      },
      "approval-demo-5": { action: "approve", comment: "", status: "approved", decided_at: "2026-07-01T09:10:00.000Z" },
      "approval-demo-6": {
        action: "block",
        comment: comments[6],
        status: "blocked",
        decided_at: "2026-07-02T12:00:00.000Z",
      },
    },
  };
}

function demoAgentTasks(zh) {
  return {
    schema_version: "1",
    updated_at: "2026-07-03T08:40:00.000Z",
    tasks: [
      {
        task_id: "task-20260703-0840-3",
        type: "revise_reply",
        item_id: "approval-demo-3",
        ref: 3,
        inquiry_id: "wa-santos-floodlights",
        quote_id: "",
        comment: zh
          ? "这句可以，但不要给到 $12.40 —— 守住底价，只用拼柜运费让利。另外补充 2 年质保的差异。"
          : "Good line, but don't offer $12.40 — floor plus freight consolidation only. Also mention the 2-year warranty difference.",
        status: "open",
        requested_at: "2026-07-03T08:40:00.000Z",
      },
      {
        task_id: "task-20260703-0900-fu1",
        type: "follow_up",
        item_id: "",
        ref: 0,
        inquiry_id: "em-alfarsi-street",
        quote_id: "q-2026-0712",
        comment: zh
          ? "报价 Q-2026-0712 已于 6 月 28 日过期，超过报价阶段 3 天跟进 SLA —— 已起草跟进（Reply #4）。"
          : "Quote Q-2026-0712 expired Jun 28, past the 3-day quoted-stage SLA — follow-up drafted (Reply #4).",
        status: "open",
        requested_at: "2026-07-03T09:00:00.000Z",
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
        item_id: "approval-demo-5",
        ref: 5,
        kind: "reply",
        inquiry_id: "wa-adeyemi-solar",
        status: "executed",
        operation: "send_message",
        connector: "whatsapp_cloud",
        target: "2348012345678@wa",
        detail: "Sent via WhatsApp Cloud API.",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "wa-sales": "WhatsApp 商业号",
    "ig-lumina": "Instagram 官方号",
    "sales-email": "外贸销售邮箱",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
  }));
  const productNames = {
    "prod-panel-6060": "LED 面板灯 60×60 40W",
    "prod-highbay-150": "UFO 工矿灯 150W",
    "prod-strip-2835": "LED 灯带 2835 120珠/米",
    "prod-flood-100": "LED 投光灯 100W",
    "prod-down-12": "防眩筒灯 12W",
    "prod-track-30": "COB 轨道灯 30W",
    "prod-street-60": "太阳能路灯 60W",
  };
  const productCategories = {
    "Commercial indoor": "商业室内",
    Industrial: "工业照明",
    Decorative: "装饰照明",
    Outdoor: "户外照明",
    Residential: "家居照明",
  };
  snapshot.products = snapshot.products.map((product) => ({
    ...product,
    name: productNames[product.product_id] || product.name,
    category: productCategories[product.category] || product.category,
  }));
  const interests = {
    [FEATURED_INQUIRY_ID]: "60×60 面板灯 + COB 轨道灯",
    "wa-santos-floodlights": "100W 投光灯，买家压价",
    "em-alfarsi-street": "市政标：太阳能路灯 + 工矿灯",
    "ig-parker-retail": "8 家零售店的筒灯 + 轨道灯",
    "wa-lim-highbay": "150W 工矿灯 —— 阶梯价谈判中",
    "em-ortega-strips": "酒店翻新用 LED 灯带",
    "wa-adeyemi-solar": "小区项目 200 套太阳能路灯",
    "ig-brightmart-panels": "电商自有品牌面板灯 + 筒灯",
    "em-wilson-tubes": "仓库改造 —— 已选本地现货",
    "ig-schmidt-oem": "筒灯 OEM 包装咨询",
    "wa-oliveira-mix": "投光灯 + 轨道灯拼柜",
    "wa-hassan-track": "商场项目前的轨道灯打样",
  };
  const sources = {
    "WhatsApp inbound": "WhatsApp 进线",
    "Instagram DM": "Instagram 私信",
    "email inquiry": "邮件询盘",
    "returning customer": "老客户返单",
    "trade-show contact": "展会客户",
  };
  snapshot.inquiries = snapshot.inquiries.map((inquiry) => ({
    ...inquiry,
    product_interest: interests[inquiry.inquiry_id] || inquiry.product_interest,
    customer: { ...inquiry.customer, source: sources[inquiry.customer.source] || inquiry.customer.source },
  }));
  const quoteNotes = {
    "q-2026-0731": "2,000 片阶梯价；面板底价 $6.80、轨道灯底价 $8.40 —— 底价护栏通过。海运汉堡约 30 天，另行报价。",
    "q-2026-0725": "8 家门店整体翻新；承包商可能分批下单 —— 按整单数量锁价。",
    "q-2026-0712": "投标支持价，仅 5 天有效。6 月 28 日已过期 —— 重新报价需按最新材料成本。",
    "q-2026-0728": "广交会跟进客户；到 Santos 的运费由买家货代询价。",
    "q-2026-0698": "OEM 订单 —— 定金已到账，产线档期已排。",
  };
  const quoteTerms = {
    "q-2026-0731": "FOB 深圳 · 30% 电汇订金，70% 出货前付清 · 生产周期 15 天",
    "q-2026-0725": "FOB 深圳 · 30% 电汇订金，70% 出货前付清",
    "q-2026-0712": "FOB 深圳 · 投标条款：30% 电汇，70% 凭提单副本",
    "q-2026-0728": "FOB 深圳 · 30% 电汇订金，70% 出货前付清 · 一个 40HQ 整柜",
    "q-2026-0698": "FOB 深圳 · 30% 订金已于 6 月 20 日到账 · 预计 7 月 18 日开船",
  };
  snapshot.quotes = snapshot.quotes.map((quote) => ({
    ...quote,
    pricing_notes: quoteNotes[quote.quote_id] || quote.pricing_notes,
    terms: quoteTerms[quote.quote_id] || quote.terms,
  }));
  const reasons = {
    1: "高意向德国分销商，潜力 2,000 片/季度。已对照产品库核实：MOQ 200，CE+TÜV 证书有效，阶梯价 $7.40 高于 $6.80 底价。",
    2: "报价单按产品库阶梯价生成；两个品项均通过底价护栏。批准后与 Reply #1 一起发送。",
    3: "买家压价到 $12.20 底价以下；草稿守住底价，改用拼柜方案让利。",
    4: "价值 $41,070 的投标报价已过期，9 天无回复；超过报价阶段 3 天跟进 SLA。",
    5: "电池与质保答复依据产品库 FAQ 起草。",
    6: "买家要求 $22.80 —— 低于产品库底价 $24.50。底价护栏已拦截；需 Kelly 先与工厂确认再还价。",
  };
  const zhDecisions = demoDecisions(true).decisions;
  snapshot.approvals = snapshot.approvals.map((item) => ({
    ...item,
    reason: reasons[item.ref] || item.reason,
    decision: item.decision
      ? { ...item.decision, comment: zhDecisions[item.item_id]?.comment ?? item.decision.comment }
      : null,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "给 Gulf Lumen Trading 的报价 Q-2026-0712 已于 6 月 28 日过期，客户没有回复。",
    detail: "跟进草稿已在审批队列中等待（Reply #4）。",
  }));
  snapshot.sync_log = snapshot.sync_log.map((entry) => ({
    ...entry,
    message:
      {
        "sync-wa-0845": "Webhook 积压消息已导入；新增 5 条消息。",
        "sync-ig-0850": "已通过 Graph API 扫描 Instagram 私信。",
        "sync-email-0830": "kelly-email 移交了 2 封询盘邮件。",
      }[entry.sync_id] || entry.message,
  }));
  return snapshot;
}

function sync(sync_id, account_id, method, at, status, message, new_messages) {
  return { sync_id, account_id, method, at, status, message, new_messages };
}

function customer(name, company, country, source) {
  return { name, company, country, source };
}

function inquiry(
  inquiry_id,
  account_id,
  channel,
  customer,
  product_interest,
  product_ids,
  quote_ids,
  stage,
  value_estimate,
  owner,
  unread,
  last_message_at,
  next_follow_up,
  provider_conversation_id,
  messages,
  suggested_reply = "",
  created_at = "",
) {
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  return {
    inquiry_id,
    account_id,
    channel,
    customer,
    product_interest,
    product_ids,
    quote_ids,
    stage,
    value_estimate,
    currency: "USD",
    owner,
    unread,
    created_at: created_at || messages[0]?.sent_at || now,
    last_message_at: last?.sent_at || last_message_at,
    last_incoming_at: lastIncoming?.sent_at || "",
    next_follow_up,
    provider_conversation_id,
    suggested_reply,
    messages,
  };
}

function msg(message_id, direction, sender, text, sent_at, attachment = "") {
  return { message_id, direction, sender, text, sent_at, attachment };
}

function line(line_id, product_id, sku, description, qty, unit_price) {
  return { line_id, product_id, sku, description, qty, unit_price, total: Number((qty * unit_price).toFixed(2)) };
}

function quote(
  quote_id,
  quote_no,
  inquiry_id,
  customerLabel,
  status,
  issue_date,
  valid_until,
  items,
  terms,
  pricing_notes,
  created_at,
) {
  const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  return {
    quote_id,
    quote_no,
    inquiry_id,
    customer: customerLabel,
    currency: "USD",
    status,
    issue_date,
    valid_until,
    items,
    subtotal,
    total: subtotal,
    terms,
    pricing_notes,
    pricing_alerts: [],
    created_at,
    updated_at: created_at,
  };
}

function product(product_id, sku, name, category, moq, price_min, price_max, lead_time_days, specs, faqEntries) {
  return {
    product_id,
    sku,
    name,
    category,
    moq,
    price_min,
    price_max,
    currency: "USD",
    lead_time_days,
    specs,
    faq: faqEntries,
  };
}

function faq(q, a) {
  return { q, a };
}

function approval(
  ref,
  kind,
  inquiry_id,
  quote_id,
  account_id,
  channel,
  customerLabel,
  text,
  reason,
  status,
  decision,
  execution,
  created_at,
) {
  return {
    item_id: `approval-demo-${ref}`,
    ref,
    kind,
    inquiry_id,
    quote_id,
    account_id,
    channel,
    customer: customerLabel,
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
