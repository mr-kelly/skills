// Deterministic demo scenes for documentation and screenshots. Never reads or
// writes files under app/.data/. Checks are computed by the shared rules
// engine from the actual mock copy, so the failing draft (banned word, byte
// overflow, missing bullet) really fails.
//
// With lang=zh the desk chrome and agent-generated meta content (product
// names, rule names, keyword-strategy notes, review reasons) are localized,
// but the listing copy itself stays in the target-market language (English
// for US, German for DE) — a Chinese seller reads the desk in Chinese while
// the listings stay in the marketplace language.
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "./rules.ts";
import type { Check, DemoQuery, Draft } from "./types.ts";

const now = "2026-07-03T08:30:00.000Z";
export const FEATURED_DRAFT_ID = "d-lunchbox-amazon-us";

export function isDemoQuery(query: DemoQuery = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const lang = zh ? "zh" : "en";
  const claims = demoClaims(zh);
  const snapshot = demoSnapshot(scenario, zh, lang, claims);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-listing",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: "2026-06-20T02:00:00.000Z", config_version: "demo" },
    lock: null,
    config_summary: demoConfigSummary(zh),
    decisions: demoDecisions(zh),
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(zh),
    claims,
    snapshot,
  };
}

// Seed the claims/compliance registry for the demo: approved (substantiated)
// marketing claims, plus banned-word / restricted-phrase rules. The failing
// spice-rack draft leans on "FDA approved" (a banned-word rule) and the
// non-approved antibacterial claim, so its claims_registry check really fails.
function demoClaims(zh) {
  const l = L(zh);
  const now = "2026-06-28T00:00:00.000Z";
  return {
    updated_at: now,
    claims: [
      {
        claim_id: "claim-leakproof",
        text: "leakproof",
        status: "approved",
        category: l("performance", "性能"),
        substantiation: l(
          "Colored-water tilt + drop test, lid closed, 3 orientations.",
          "彩色水倾斜 + 跌落测试，闭盖，3 个方向。",
        ),
        evidence: ["test-reports/leak-test-2026.pdf"],
        approved_by: "compliance",
        approved_at: now,
        notes: "",
        created_at: now,
        updated_at: now,
      },
      {
        claim_id: "claim-bpa-free",
        text: "BPA-free",
        status: "approved",
        category: l("safety", "安全"),
        substantiation: l("Material spec + third-party migration test.", "材质规格 + 第三方迁移测试。"),
        evidence: ["specs/pp-frame-cert.pdf"],
        approved_by: "compliance",
        approved_at: now,
        notes: "",
        created_at: now,
        updated_at: now,
      },
      {
        claim_id: "claim-antibacterial",
        text: "antibacterial",
        status: "rejected",
        category: l("health", "健康"),
        substantiation: "",
        evidence: [],
        approved_by: "",
        approved_at: "",
        notes: l("No antimicrobial testing on file — do not use.", "没有抗菌测试记录——禁止使用。"),
        created_at: now,
        updated_at: now,
      },
    ],
    rules: [
      {
        rule_id: "claimrule-fda-approved",
        phrase: "FDA approved",
        type: "banned_word",
        severity: "error",
        reason: l(
          "Product is not an FDA-registered device; the phrase is unsubstantiated.",
          "产品不是 FDA 注册器械；该表述无依据。",
        ),
        alternative: l("food-contact safe", "食品接触安全"),
        created_at: now,
      },
      {
        rule_id: "claimrule-medical-grade",
        phrase: "medical grade",
        type: "restricted_phrase",
        severity: "error",
        reason: l(
          "'Medical grade' implies a regulatory class the product does not hold.",
          "“医用级”暗示产品不具备的监管类别。",
        ),
        alternative: l("food-grade", "食品级"),
        created_at: now,
      },
    ],
  };
}

function L(zh) {
  return (en, zhText) => (zh ? zhText : en);
}

function demoConfig() {
  return {
    banned_words: ["FDA approved", "cure", "guaranteed", "antibacterial", "medical grade", "best seller"],
    competitor_brands: ["OXO", "Joseph Joseph", "Rubbermaid", "simplehuman"],
    keyword_stuffing: { max_repeats: 3 },
    allowed_all_caps: ["POV"],
    platforms: [
      {
        platform: "amazon",
        enabled: true,
        locales: ["US", "DE"],
        rules: {
          title_max_chars: 200,
          bullets_exact: 5,
          search_terms_max_bytes: 249,
          required_fields: ["title", "bullets", "description", "search_terms"],
        },
      },
      {
        platform: "shopify",
        enabled: true,
        locales: ["US"],
        rules: {
          title_max_chars: 70,
          seo_title_max_chars: 60,
          seo_description_max_chars: 160,
          required_fields: ["title", "description", "seo_title", "seo_description"],
        },
      },
      {
        platform: "tiktok_shop",
        enabled: true,
        locales: ["US"],
        rules: { title_max_chars: 255, min_selling_points: 3, required_fields: ["title", "selling_points"] },
      },
      {
        platform: "ebay",
        enabled: true,
        locales: ["US"],
        rules: { title_max_chars: 80, required_fields: ["title", "description"] },
      },
    ],
    export: { format: "markdown+csv", out_dir: "exports" },
  };
}

function demoConfigSummary(zh) {
  const l = L(zh);
  const config = demoConfig();
  return {
    config_path: "demo://kelly-listing/config.json",
    is_example: false,
    seller: {
      brand: "Nimbus Home",
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
      tone: l("Benefit-led, concrete, no hype words", "卖点导向、具体可信、不用夸大词"),
    },
    locales: ["US", "DE", "JP"],
    platforms: config.platforms,
    banned_words_count: config.banned_words.length,
    competitor_brands_count: config.competitor_brands.length,
    keyword_stuffing: { max_repeats: 3 },
    export: { format: "markdown+csv", out_dir: "exports" },
    publish: {
      handoff_to_agent: true,
      requires_approval: true,
      secret_envs: [],
      secrets_ready: true,
    },
  };
}

function demoProducts(zh) {
  const l = L(zh);
  return [
    {
      product_id: "prod-lunchbox",
      ref: 1,
      name: l("Collapsible Silicone Lunch Box", "可折叠硅胶饭盒"),
      sku: "NH-LB-01",
      category: l("Kitchen & Dining", "厨房餐饮"),
      source: "kelly_picks",
      platforms: ["amazon", "tiktok_shop", "shopify"],
      locales: ["US", "DE"],
      specs: [
        {
          name: l("Material", "材质"),
          value: l("Food-grade silicone + BPA-free PP frame", "食品级硅胶 + 不含 BPA 的 PP 框架"),
        },
        { name: l("Capacity", "容量"), value: "1.2 L / 40 oz" },
        { name: l("Collapsed height", "折叠后高度"), value: "2.3 cm" },
        { name: l("Weight", "重量"), value: "380 g" },
        { name: l("Colors", "颜色"), value: l("Sage green, terracotta", "鼠尾草绿、陶土橙") },
      ],
      features: [
        l(
          "Collapses to about one third of its height for bag-friendly storage",
          "可折叠至约三分之一高度，方便放入背包",
        ),
        l("Leakproof snap-lock lid with steam vent", "卡扣式防漏盖，带蒸汽孔"),
        l("Microwave, dishwasher and freezer safe", "可进微波炉、洗碗机和冷冻室"),
        l("Includes folding spork", "附折叠餐叉勺"),
      ],
      keywords: ["collapsible lunch box", "silicone bento box", "leakproof lunch container", "space saving lunch box"],
      images: [
        { name: l("Main image on white", "白底主图"), status: "ready" },
        { name: l("Collapse sequence", "折叠过程图"), status: "ready" },
        { name: l("Lifestyle: office desk", "场景图：办公桌"), status: "ready" },
        { name: l("Size chart", "尺寸图"), status: "ready" },
        { name: l("Video cover", "视频封面"), status: "ready" },
      ],
      notes: l(
        "Handoff brief from kelly-picks (pick #2, June batch).",
        "来自 kelly-picks 的交接简报（6 月批次选品 #2）。",
      ),
      created_at: "2026-06-24T03:10:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      product_id: "prod-spicerack",
      ref: 2,
      name: l("Magnetic Spice Rack", "磁吸调料架"),
      sku: "NH-SR-02",
      category: l("Kitchen Storage", "厨房收纳"),
      source: "manual",
      platforms: ["amazon", "shopify"],
      locales: ["US"],
      specs: [
        { name: l("Material", "材质"), value: l("430 stainless steel", "430 不锈钢") },
        { name: l("Tiers", "层数"), value: "4" },
        { name: l("Load capacity", "承重"), value: "8 kg / 18 lb" },
        { name: l("Size", "尺寸"), value: "30 × 11 × 92 cm" },
      ],
      features: [
        l("Four neodymium magnet strips, no drilling", "四条钕磁条，免打孔"),
        l("Paper towel bar and six hooks included", "含纸巾杆和六个挂钩"),
        l("Fits fridge sides, washers, and steel doors", "适用于冰箱侧面、洗衣机和钢制门"),
      ],
      keywords: ["magnetic spice rack", "fridge organizer", "kitchen shelf magnetic"],
      images: [
        { name: l("Main image on white", "白底主图"), status: "ready" },
        { name: l("Magnet strength demo", "磁力演示图"), status: "needs_edit" },
        { name: l("Lifestyle: fridge side", "场景图：冰箱侧面"), status: "missing" },
        { name: l("Dimension diagram", "尺寸标注图"), status: "ready" },
      ],
      notes: "",
      created_at: "2026-06-26T06:00:00.000Z",
      updated_at: "2026-07-02T07:20:00.000Z",
    },
    {
      product_id: "prod-basket",
      ref: 3,
      name: l("Foldable Laundry Basket", "可折叠洗衣篮"),
      sku: "NH-FB-03",
      category: l("Home Organization", "家居收纳"),
      source: "kelly_picks",
      platforms: ["amazon", "tiktok_shop"],
      locales: ["US", "DE"],
      specs: [
        { name: l("Capacity", "容量"), value: "60 L" },
        { name: l("Folded thickness", "折叠后厚度"), value: "5 cm / 2 in" },
        { name: l("Material", "材质"), value: l("600D Oxford fabric, steel wire frame", "600D 牛津布，钢丝框架") },
      ],
      features: [
        l("Folds flat to hang on a hook when empty", "空置时可折平挂在挂钩上"),
        l("Reinforced carry handles", "加固提手"),
        l("Machine-washable fabric", "布料可机洗"),
      ],
      keywords: ["foldable laundry basket", "collapsible hamper", "space saving laundry"],
      images: [
        { name: l("Main image on white", "白底主图"), status: "ready" },
        { name: l("Fold-flat demo", "折平演示图"), status: "ready" },
        { name: l("Lifestyle: dorm room", "场景图：宿舍"), status: "ready" },
      ],
      notes: l(
        "Handoff brief from kelly-picks (pick #5, June batch).",
        "来自 kelly-picks 的交接简报（6 月批次选品 #5）。",
      ),
      created_at: "2026-06-24T03:10:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    },
    {
      product_id: "prod-scale",
      ref: 4,
      name: l("Digital Kitchen Scale", "厨房电子秤"),
      sku: "NH-KS-04",
      category: l("Kitchen Tools", "厨房工具"),
      source: "manual",
      platforms: ["amazon", "ebay", "shopify"],
      locales: ["US"],
      specs: [
        { name: l("Max capacity", "最大称重"), value: "10 kg / 22 lb" },
        { name: l("Graduation", "精度"), value: "1 g / 0.05 oz" },
        { name: l("Power", "供电"), value: l("USB rechargeable", "USB 充电") },
        { name: l("Units", "单位"), value: "g / kg / oz / lb / ml" },
      ],
      features: [
        l("Slim stainless steel platform", "超薄不锈钢秤面"),
        l("Tare and auto-off", "去皮与自动关机"),
        l("USB rechargeable — no coin batteries", "USB 充电，无需纽扣电池"),
      ],
      keywords: ["digital kitchen scale", "food scale grams", "baking scale"],
      images: [
        { name: l("Main image on white", "白底主图"), status: "ready" },
        { name: l("Lifestyle: baking", "场景图：烘焙"), status: "ready" },
        { name: l("USB charging detail", "USB 充电细节图"), status: "ready" },
      ],
      notes: "",
      created_at: "2026-06-27T08:00:00.000Z",
      updated_at: "2026-07-02T02:15:00.000Z",
    },
  ];
}

// Listing copy stays in the marketplace language regardless of UI language.
function demoDrafts(zh): Draft[] {
  const l = L(zh);
  return [
    {
      draft_id: "d-lunchbox-amazon-us",
      ref: 1,
      product_id: "prod-lunchbox",
      platform: "amazon",
      locale: "US",
      variant_group: "lunchbox-amazon",
      status: "needs_review",
      keyword_strategy: l(
        'Lead with "collapsible lunch box" (highest volume, moderate competition); back the title with "bento box" and "leakproof". Long-tail terms go to backend search terms only, to keep the title readable.',
        '标题主打 "collapsible lunch box"（搜索量最高、竞争适中），辅以 "bento box" 和 "leakproof"。长尾词只放后台搜索词，保持标题可读。',
      ),
      fields: {
        title:
          "Nimbus Home Collapsible Silicone Lunch Box, 1.2L Leakproof 3-Compartment Bento Box with Folding Spork, Microwave Dishwasher Freezer Safe, BPA-Free Space Saving Lunch Container for Work Travel, Green",
        bullets: [
          "Packs flat in seconds: the silicone body collapses from 2.6 in to 0.9 in, so the empty box slides into a laptop bag, desk drawer, or carry-on without the bulk.",
          "Leakproof snap-lock lid: a silicone gasket and four latches keep soups and dressings sealed, and the steam vent lets you microwave with the lid on.",
          "Safe materials you can trust: food-grade silicone and a BPA-free PP frame, tested from freezer to microwave without warping or staining.",
          "Three compartments, real portions: 1.2 L splits into a main dish and two sides, keeping salad crisp and sauce apart until lunch.",
          "Clean-up in one rack: the box and the folding spork are top-rack dishwasher safe, and the smooth surface releases oil without scrubbing.",
        ],
        description:
          "The Nimbus Home collapsible lunch box is built for people who carry lunch in, but hate carrying an empty box home. After eating, press the silicone body flat and it disappears into your bag. The snap-lock lid with silicone gasket keeps liquids in, the three compartments keep textures apart, and the whole set goes straight into the dishwasher at night.",
        search_terms:
          "collapsible bento lunchbox silicone foldable meal prep container leak proof adults work office travel camping portable compact kids school snack box microwavable freezer safe",
        aplus_outline: [
          "Hero: collapsed vs expanded height comparison",
          "Module: leakproof test with colored water",
          "Module: three-compartment portion layout",
          "Module: material safety test summary",
          "Comparison chart vs rigid bento boxes",
        ],
      },
      created_at: "2026-06-30T06:00:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      draft_id: "d-lunchbox-amazon-de",
      ref: 2,
      product_id: "prod-lunchbox",
      platform: "amazon",
      locale: "DE",
      variant_group: "lunchbox-amazon",
      status: "needs_review",
      keyword_strategy: l(
        'DE variant translated for amazon.de, not word-for-word: "Brotdose" carries more volume than "Lunchbox" alone in German queries; sizes converted to metric.',
        '德语变体针对 amazon.de 本地化而非逐词翻译：德语搜索里 "Brotdose" 比单独的 "Lunchbox" 量更大；尺寸已转公制。',
      ),
      fields: {
        title:
          "Nimbus Home Faltbare Lunchbox Silikon, 1,2L Auslaufsichere Bento Box mit 3 Fächern und Klappgabel, Mikrowellen- Spülmaschinen- Gefriergeeignet, BPA-frei Platzsparende Brotdose für Büro Reise, Grün",
        bullets: [
          "In Sekunden flach verstaut: der Silikonkörper faltet sich von 6,5 cm auf 2,3 cm zusammen und passt leer in Laptoptasche, Schublade oder Handgepäck.",
          "Auslaufsicherer Deckel: Silikondichtung und vier Verschlüsse halten Suppen und Dressings sicher, das Dampfventil erlaubt Mikrowelle mit Deckel.",
          "Sichere Materialien: lebensmittelechtes Silikon und BPA-freier PP-Rahmen, getestet vom Gefrierfach bis zur Mikrowelle, ohne Verformung.",
          "Drei Fächer, echte Portionen: 1,2 L teilen sich in Hauptgericht und zwei Beilagen, Salat bleibt knackig, Soße bleibt getrennt.",
          "Reinigung im Geschirrspüler: Box und Klappgabel sind im Oberkorb spülmaschinenfest, die glatte Oberfläche löst Fett ohne Schrubben.",
        ],
        description:
          "Die faltbare Nimbus Home Lunchbox ist für alle, die ihr Essen mitnehmen, aber keine leere Box nach Hause tragen wollen. Nach dem Essen den Silikonkörper flach drücken und in der Tasche verschwinden lassen. Der Deckel mit Silikondichtung hält Flüssigkeiten sicher, drei Fächer trennen die Portionen, und abends geht alles in die Spülmaschine.",
        search_terms:
          "faltbare lunchbox silikon bento box auslaufsicher brotdose erwachsene büro meal prep behälter mikrowelle gefrierfach platzsparend camping brotbox kinder schule",
        aplus_outline: [
          "Hero: Höhenvergleich gefaltet vs. aufgeklappt",
          "Modul: Auslauftest mit gefärbtem Wasser",
          "Modul: Drei-Fächer-Aufteilung",
        ],
      },
      created_at: "2026-07-01T08:00:00.000Z",
      updated_at: "2026-07-02T09:40:00.000Z",
    },
    {
      draft_id: "d-lunchbox-tiktok-us",
      ref: 3,
      product_id: "prod-lunchbox",
      platform: "tiktok_shop",
      locale: "US",
      status: "approved",
      keyword_strategy: l(
        "TikTok Shop copy leads with the fold-flat moment (the demo visual), not the specs. Selling points written to be read aloud in a 15-second clip.",
        "TikTok Shop 文案以折平瞬间（演示画面）开头，而不是参数。卖点按 15 秒口播节奏来写。",
      ),
      fields: {
        title: "The lunch box that folds flat after lunch — leakproof 3-compartment silicone bento with folding spork",
        selling_points: [
          "Folds to 1/3 height — slides into any bag",
          "Leakproof lid, microwave safe with the vent open",
          "3 compartments keep sauce off your salad",
          "Dishwasher safe, zero scrubbing",
        ],
      },
      created_at: "2026-06-30T06:00:00.000Z",
      updated_at: "2026-07-01T09:00:00.000Z",
    },
    {
      draft_id: "d-spicerack-amazon-us",
      ref: 4,
      product_id: "prod-spicerack",
      platform: "amazon",
      locale: "US",
      status: "needs_review",
      keyword_strategy: l(
        'Chasing "fridge organizer" plus long-tail "rv camper organizer" for the small-space audience. Backend terms need a trim pass — currently drafted wide.',
        '主攻 "fridge organizer"，加上面向小空间人群的长尾词 "rv camper organizer"。后台搜索词初稿铺得较宽，需要精简。',
      ),
      fields: {
        title:
          "Nimbus Home Magnetic Spice Rack for Refrigerator, 4-Tier Fridge Organizer Shelf with Paper Towel Holder and 6 Hooks, Strong Magnet Kitchen Space Saver, No Drilling",
        bullets: [
          "Strong enough to trust: four neodymium magnet strips hold up to 18 lb of jars, oils, and tools on any steel surface without sliding.",
          "Made from FDA approved 430 stainless steel that wipes clean and keeps its finish in a steamy kitchen.",
          "Four tiers plus a paper towel bar and six hooks turn a dead fridge side into a full pantry wall.",
          "Installs in zero minutes: no drilling, no adhesive residue — place it on the fridge and load it up.",
        ],
        description:
          "The Nimbus Home magnetic spice rack turns the side of your refrigerator into storage you can actually reach. Four shelves hold spice jars, oil bottles, and wraps; the bar takes a paper towel roll; six hooks catch utensils and mitts. Magnets keep it firm on fridges, washers, and steel doors — no tools, no holes.",
        search_terms:
          "magnetic spice rack fridge organizer refrigerator shelf kitchen storage magnet shelf paper towel holder fridge side rack seasoning organizer spice shelf metal rack kitchen gadgets rv camper organizer small apartment must haves pantry organization and storage",
        aplus_outline: [],
      },
      created_at: "2026-07-01T07:00:00.000Z",
      updated_at: "2026-07-02T07:20:00.000Z",
    },
    {
      draft_id: "d-spicerack-shopify-us",
      ref: 5,
      product_id: "prod-spicerack",
      platform: "shopify",
      locale: "US",
      status: "approved",
      keyword_strategy: l(
        "Shopify page targets branded + category queries; SEO title keeps the brand at the end. SEO title runs 2 chars over the 60-char target — acceptable, flagged as warn.",
        "Shopify 页面兼顾品牌词和品类词；SEO 标题把品牌放在末尾。SEO 标题超出 60 字符目标 2 个字符，可接受，标记为提醒。",
      ),
      fields: {
        title: "Magnetic Spice Rack — 4-Tier Fridge Organizer",
        description:
          "Turn the side of your fridge into a pantry wall. The Nimbus Home magnetic spice rack adds four shelves, a paper towel bar, and six hooks to any steel surface — no drilling, no residue. Strong neodymium strips hold up to 18 lb of jars and tools.",
        seo_title: "Magnetic Spice Rack | 4-Tier Fridge Organizer | Nimbus Home Co",
        seo_description:
          "Turn the side of your fridge into a pantry. 4-tier magnetic spice rack with towel bar and hooks. No drilling. Free US shipping over $35.",
      },
      created_at: "2026-07-01T07:30:00.000Z",
      updated_at: "2026-07-02T07:20:00.000Z",
    },
    {
      draft_id: "d-basket-amazon-us",
      ref: 6,
      product_id: "prod-basket",
      platform: "amazon",
      locale: "US",
      status: "done",
      keyword_strategy: l(
        '"Foldable laundry basket" and "collapsible hamper" split the search volume; both live in the title. Dorm/RV terms are backend-only.',
        '"Foldable laundry basket" 和 "collapsible hamper" 平分搜索量，两者都进标题。宿舍/房车词只放后台。',
      ),
      fields: {
        title:
          "Nimbus Home Foldable Laundry Basket, 60L Collapsible Hamper with Reinforced Handles, Folds Flat to 2 Inches for Wall Hook Storage, Machine-Washable Fabric for Dorm Small Spaces RV, Grey",
        bullets: [
          "Disappears when empty: the steel-wire frame folds the 60L basket flat to 2 inches, so it hangs on a hook instead of eating floor space.",
          "Carries a full week: 60 liters swallows two loads of laundry, and the reinforced stitched handles do not tear out on the stairs.",
          "Stays clean itself: the 600D Oxford fabric unclips from the frame and goes in the washing machine.",
          "Stands on its own: the frame snaps open in one motion and holds its shape even half-full, no slumping bag.",
          "Small-space friendly: made for dorms, RVs, closets, and laundromat trips where a rigid basket never fits.",
        ],
        description:
          "The Nimbus Home foldable laundry basket works like a basket and stores like a folder. Snap the frame open for a sturdy 60L hamper; fold it flat to 2 inches and hang it up when the laundry is done. The fabric unclips and machine-washes, and the stitched handles are reinforced for full loads.",
        search_terms:
          "foldable laundry basket collapsible hamper space saving dorm rv small apartment wall hanging dirty clothes storage fabric washable camping travel",
        aplus_outline: [
          "Hero: fold-flat to wall-hook sequence",
          "Module: 60L capacity with real laundry",
          "Module: removable washable fabric",
        ],
      },
      created_at: "2026-06-26T05:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
    },
    {
      draft_id: "d-basket-tiktok-us",
      ref: 7,
      product_id: "prod-basket",
      platform: "tiktok_shop",
      locale: "US",
      status: "changes_requested",
      keyword_strategy: l(
        "Short hook + one visual promise. Revision requested: lead with the fold-flat visual in the first line.",
        "短钩子 + 一个视觉承诺。已被要求修改：第一句先给折平的画面感。",
      ),
      fields: {
        title: "Your laundry basket should disappear when it's empty — this 60L hamper folds to 2 inches",
        selling_points: [
          "Folds flat to 2 in — hang it on a hook",
          "60L swallows a full week of laundry",
          "Reinforced handles, machine-washable fabric",
        ],
      },
      created_at: "2026-06-30T05:00:00.000Z",
      updated_at: "2026-07-02T06:00:00.000Z",
    },
    {
      draft_id: "d-scale-amazon-us",
      ref: 8,
      product_id: "prod-scale",
      platform: "amazon",
      locale: "US",
      status: "approved",
      keyword_strategy: l(
        '"Digital kitchen scale" is the head term; "1g precision" and "USB rechargeable" are the differentiators that survive in the title.',
        '"Digital kitchen scale" 是头部词；"1g 精度" 和 "USB 充电" 是留在标题里的差异点。',
      ),
      fields: {
        title:
          "Nimbus Home Digital Kitchen Scale, 22lb/10kg Food Scale with 1g Precision and Tare Function, USB Rechargeable, Slim Stainless Steel Baking Scale with 5 Units and Backlit LCD, Black",
        bullets: [
          "Weighs a grape or a stockpot: 1 g graduation up to 10 kg covers espresso dosing, bread flour, and meal-prep containers on one platform.",
          "Charge it like your phone: the USB-C battery runs about three months per charge, so there are no coin cells to hunt for.",
          "Tare that keeps up: zero out any bowl instantly and switch between g, kg, oz, lb, and ml for liquids.",
          "Slim enough to live in a drawer: the 1.5 cm stainless platform wipes clean and slides next to the cutting boards.",
          "Readable in real kitchens: the backlit LCD stays visible under a bowl overhang, with auto-off you can extend while baking.",
        ],
        description:
          "The Nimbus Home digital kitchen scale gives bakers and meal-preppers lab-style precision without the clutter: 1 g graduation to 10 kg, instant tare, five units, and a USB-rechargeable battery. The slim stainless platform stores in a drawer and cleans with one wipe.",
        search_terms:
          "digital kitchen scale food scale grams and ounces baking cooking usb rechargeable tare stainless steel precise 1g coffee espresso meal prep",
        aplus_outline: [
          "Hero: espresso dose on the platform",
          "Module: five units and tare",
          "Module: USB charging vs coin batteries",
        ],
      },
      created_at: "2026-06-29T04:00:00.000Z",
      updated_at: "2026-07-02T02:15:00.000Z",
    },
    {
      draft_id: "d-scale-ebay-us",
      ref: 9,
      product_id: "prod-scale",
      platform: "ebay",
      locale: "US",
      status: "needs_review",
      keyword_strategy: l(
        "eBay title packs the searchable attributes (capacity, precision, power) into 80 chars; item specifics carry the rest.",
        "eBay 标题在 80 字符内塞入可搜索属性（量程、精度、供电）；其余放 item specifics。",
      ),
      fields: {
        title: "Nimbus Home Digital Kitchen Scale 10kg/1g USB Rechargeable Stainless Steel",
        subtitle: "1g graduation, tare, 5 units — ships free from US warehouse",
        description:
          "Slim stainless steel kitchen scale with 1 g graduation up to 10 kg. Instant tare, five units (g / kg / oz / lb / ml), backlit LCD, and a USB-rechargeable battery that lasts about three months per charge. Ships from a US warehouse; 18-month warranty.",
        item_specifics: [
          { name: "Brand", value: "Nimbus Home" },
          { name: "Type", value: "Kitchen Scale" },
          { name: "Max Capacity", value: "10 kg / 22 lb" },
          { name: "Graduation", value: "1 g" },
          { name: "Power", value: "USB rechargeable" },
          { name: "Material", value: "Stainless steel" },
        ],
      },
      created_at: "2026-07-02T02:00:00.000Z",
      updated_at: "2026-07-02T02:15:00.000Z",
    },
  ];
}

function demoReviewItems(zh) {
  const l = L(zh);
  return [
    {
      review_id: "rv-lunchbox-amazon-us",
      ref: 1,
      draft_id: "d-lunchbox-amazon-us",
      status: "needs_review",
      compliance_summary: l(
        "All checks pass. Title sits just under the Amazon 200-character cap; backend terms have byte headroom.",
        "全部检查通过。标题贴近 Amazon 200 字符上限；后台搜索词字节仍有余量。",
      ),
      suggestions: [
        l(
          'Consider moving "Green" earlier — mobile truncates around 80 characters.',
          '可以把 "Green" 往前挪——移动端标题约 80 字符处截断。',
        ),
        l(
          "A+ outline is ready for the designer; confirm the comparison-chart claims against spec sheet.",
          "A+ 大纲可交设计；对比图的卖点请再对照规格表确认。",
        ),
      ],
      created_at: "2026-07-02T09:40:00.000Z",
    },
    {
      review_id: "rv-spicerack-amazon-us",
      ref: 4,
      draft_id: "d-spicerack-amazon-us",
      status: "needs_review",
      compliance_summary: l(
        '3 checks fail: banned phrase "FDA approved" in bullet 2, backend search terms over 249 bytes, and only 4 of 5 bullets. Image checklist also incomplete.',
        '3 项检查未通过：第 2 条五点含禁用词 "FDA approved"、后台搜索词超过 249 字节、五点只有 4 条。图片清单也未完成。',
      ),
      suggestions: [
        l(
          'Replace "FDA approved" with "food-contact safe 430 stainless steel".',
          '把 "FDA approved" 改为 "food-contact safe 430 stainless steel"。',
        ),
        l(
          'Trim backend terms below 249 bytes — drop "pantry organization and storage".',
          '把后台搜索词裁到 249 字节以内——去掉 "pantry organization and storage"。',
        ),
        l("Add a 5th bullet covering the 18-month warranty and support.", "补第 5 条五点，写 18 个月质保与售后。"),
      ],
      created_at: "2026-07-02T07:20:00.000Z",
    },
    {
      review_id: "rv-basket-tiktok-us",
      ref: 7,
      draft_id: "d-basket-tiktok-us",
      status: "changes_requested",
      compliance_summary: l(
        "All checks pass, but the hook was judged too soft for TikTok — revision queued for the agent.",
        "检查全部通过，但开头钩子对 TikTok 来说不够抓人——已排队让代理修改。",
      ),
      suggestions: [l("Open with the fold-flat visual in the first five words.", "前五个词就要出现折平的画面。")],
      created_at: "2026-07-02T06:00:00.000Z",
    },
    {
      review_id: "rv-scale-amazon-us",
      ref: 8,
      draft_id: "d-scale-amazon-us",
      status: "approved",
      compliance_summary: l(
        "All checks pass. Approved for export; publish handoff will follow the export.",
        "全部检查通过。已批准导出；导出后交由代理执行发布。",
      ),
      suggestions: [],
      created_at: "2026-07-02T02:15:00.000Z",
    },
    {
      review_id: "rv-basket-amazon-us",
      ref: 6,
      draft_id: "d-basket-amazon-us",
      status: "done",
      compliance_summary: l(
        "Exported to exports/nimbus-home-foldable-laundry-basket-amazon-us.md; publishing via the platform API is handed off to the agent.",
        "已导出到 exports/nimbus-home-foldable-laundry-basket-amazon-us.md；平台 API 发布已交接给代理执行。",
      ),
      suggestions: [],
      created_at: "2026-07-01T10:00:00.000Z",
    },
  ];
}

function demoDecisions(zh) {
  const l = L(zh);
  return {
    updated_at: "2026-07-02T06:00:00.000Z",
    decisions: {
      "rv-basket-tiktok-us": {
        action: "request_changes",
        comment: l(
          "Hook is too soft. Lead with the fold-flat visual in the first line, then the 60L capacity.",
          "钩子太平了。第一句先给折平的画面，再讲 60L 容量。",
        ),
        decided_at: "2026-07-02T06:00:00.000Z",
      },
      "rv-scale-amazon-us": {
        action: "approve",
        comment: l("Approved. Export and hand off publishing.", "已批准。导出并交接发布。"),
        decided_at: "2026-07-02T02:15:00.000Z",
      },
      "rv-basket-amazon-us": {
        action: "approve",
        comment: l("Approved after the handle-stitch claim was verified.", "核实提手缝线卖点后批准。"),
        decided_at: "2026-07-01T09:30:00.000Z",
      },
    },
  };
}

function demoAgentTasks(zh) {
  const l = L(zh);
  return {
    updated_at: "2026-07-02T06:00:00.000Z",
    tasks: [
      {
        task_id: "task-rv-basket-tiktok-us-1783404000000",
        type: "revise_listing",
        review_id: "rv-basket-tiktok-us",
        draft_id: "d-basket-tiktok-us",
        ref: 7,
        comment: l(
          "Hook is too soft. Lead with the fold-flat visual in the first line, then the 60L capacity.",
          "钩子太平了。第一句先给折平的画面，再讲 60L 容量。",
        ),
        requested_at: "2026-07-02T06:00:00.000Z",
        status: "queued",
      },
    ],
  };
}

function demoExecutionReport(zh) {
  const l = L(zh);
  return {
    executed_at: "2026-07-01T10:00:00.000Z",
    dry_run: false,
    source: "kelly-listing-demo",
    results: [
      {
        review_id: "rv-basket-amazon-us",
        draft_id: "d-basket-amazon-us",
        ref: 6,
        status: "executed",
        operation: "export_listing",
        target: "exports/nimbus-home-foldable-laundry-basket-amazon-us.md",
        detail: l(
          "Markdown and CSV row written by scripts/export_listings.ts.",
          "已由 scripts/export_listings.ts 写出 Markdown 与 CSV 行。",
        ),
        executed_at: "2026-07-01T10:00:00.000Z",
      },
      {
        review_id: "rv-basket-amazon-us",
        draft_id: "d-basket-amazon-us",
        ref: 6,
        status: "executed",
        operation: "publish_via_api",
        target: "amazon:US",
        handoff_to_agent: true,
        detail: l(
          "Publishing via the platform API is executed by the agent outside the app, after approval.",
          "平台 API 发布由代理在应用之外、获批后执行。",
        ),
        executed_at: "2026-07-01T10:00:00.000Z",
      },
    ],
  };
}

function demoActivity(zh) {
  const l = L(zh);
  return [
    {
      id: "act-9",
      at: "2026-07-02T09:40:00.000Z",
      actor: "agent",
      detail: l(
        "Drafted German locale variant for the collapsible silicone lunch box (Amazon DE).",
        "为可折叠硅胶饭盒起草了德语站变体（Amazon DE）。",
      ),
      draft_id: "d-lunchbox-amazon-de",
    },
    {
      id: "act-8",
      at: "2026-07-02T07:20:00.000Z",
      actor: "agent",
      detail: l(
        "Re-ran compliance checks: 3 failures on the magnetic spice rack Amazon US draft.",
        "重新运行合规检查：磁吸调料架 Amazon US 草稿有 3 项未通过。",
      ),
      draft_id: "d-spicerack-amazon-us",
    },
    {
      id: "act-7",
      at: "2026-07-02T06:00:00.000Z",
      actor: "seller",
      detail: l(
        "Requested changes on the laundry basket TikTok Shop hook (Draft #7).",
        "对洗衣篮 TikTok Shop 开头钩子提出修改要求（Draft #7）。",
      ),
      draft_id: "d-basket-tiktok-us",
    },
    {
      id: "act-6",
      at: "2026-07-02T02:15:00.000Z",
      actor: "seller",
      detail: l(
        "Approved the digital kitchen scale Amazon US draft (Draft #8).",
        "批准厨房电子秤 Amazon US 草稿（Draft #8）。",
      ),
      draft_id: "d-scale-amazon-us",
    },
    {
      id: "act-5",
      at: "2026-07-01T10:00:00.000Z",
      actor: "agent",
      detail: l(
        "Exported the foldable laundry basket Amazon US listing; publish handed off.",
        "导出可折叠洗衣篮 Amazon US 文案；发布已交接。",
      ),
      draft_id: "d-basket-amazon-us",
    },
    {
      id: "act-4",
      at: "2026-06-30T06:00:00.000Z",
      actor: "agent",
      detail: l(
        "Ingested lunch box drafts from the kelly-picks handoff brief.",
        "从 kelly-picks 交接简报生成了饭盒草稿。",
      ),
      draft_id: "d-lunchbox-amazon-us",
    },
  ];
}

function demoSnapshot(scenario, zh, lang, claims = null) {
  const l = L(zh);
  const config = demoConfig();
  const products = demoProducts(zh);
  const drafts = demoDrafts(zh);
  const productsById = new Map(products.map((product) => [product.product_id, product]));
  const checks: Check[] = [];
  for (const draft of drafts) {
    const product = productsById.get(draft.product_id);
    for (const result of evaluateDraft(draft, product, config, lang, claims)) {
      checks.push({
        check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
        draft_id: draft.draft_id,
        rule_id: result.rule_id,
        severity: result.severity,
        result: result.result,
        evidence: result.evidence,
        ...(result.refs ? { refs: result.refs } : {}),
        checked_at: "2026-07-02T09:45:00.000Z",
      });
    }
    draft.compliance_score = scoreChecks(checks.filter((check) => check.draft_id === draft.draft_id));
  }
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-listing-demo",
    seller: {
      brand: "Nimbus Home",
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
    },
    metrics: {},
    products,
    drafts,
    rules: ruleCatalog(config, lang),
    checks,
    review_items: demoReviewItems(zh),
    activity_log: demoActivity(zh),
    warnings: ["checks", "review", "detail"].includes(scenario)
      ? [
          {
            id: "spicerack-compliance",
            severity: "warning",
            draft_id: "d-spicerack-amazon-us",
            message: l(
              "Draft #4 (magnetic spice rack, Amazon US) fails 3 checks — fix the banned phrase, backend bytes, and bullet count before export.",
              "Draft #4（磁吸调料架，Amazon US）有 3 项检查未通过——导出前请修正禁用词、后台字节数和五点数量。",
            ),
            detail: l("Demo warning; no live marketplace data was read.", "演示提醒，未读取任何真实平台数据。"),
          },
        ]
      : [],
  };
  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}
