const now = "2026-07-07T09:00:00.000Z";
export const FEATURED_PRODUCT_ID = "prod-aurora-lamp";

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
  const snapshot = demoSnapshot(zh);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-products",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: "2026-06-22T02:00:00.000Z", config_version: "demo" },
    lock: null,
    config_summary: demoConfigSummary(zh),
    decisions: { updated_at: "2026-07-07T08:10:00.000Z", decisions: {} },
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(zh),
    snapshot,
  };
}

function L(zh: boolean) {
  return (en: string, zhText: string) => (zh ? zhText : en);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function demoConfigSummary(zh: boolean) {
  const l = L(zh);
  return {
    config_path: "demo://kelly-products/config.json",
    is_example: false,
    seller: {
      brand: "Nimbus Home",
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
      base_currency: "USD",
    },
    platforms: [
      { platform: "amazon", enabled: true, store_name: "Nimbus Home US", secret_envs: [], secrets_ready: true },
      { platform: "shopify", enabled: true, store_name: "Nimbus Home DTC", secret_envs: [], secrets_ready: true },
      {
        platform: "tiktok_shop",
        enabled: true,
        store_name: "Nimbus Home Studio",
        secret_envs: [],
        secrets_ready: true,
      },
      { platform: "ebay", enabled: true, store_name: "Nimbus Outlet", secret_envs: [], secrets_ready: true },
    ],
    warehouses: [
      { warehouse_id: "wh-sz", name: l("Shenzhen 3PL", "深圳三方仓"), region: "CN-SZ" },
      { warehouse_id: "wh-la", name: l("Los Angeles 3PL", "洛杉矶三方仓"), region: "US-CA" },
      { warehouse_id: "wh-de", name: l("Bremen FBA prep", "不来梅 FBA 预处理仓"), region: "DE-HB" },
    ],
    review_policy: {
      price_change_threshold_pct: 8,
      margin_floor_pct: 32,
      low_stock_days: 18,
      channel_publish_requires_approval: true,
    },
    sync: {
      last_import_at: "2026-07-07T07:30:00.000Z",
      sources: ["amazon", "shopify", "tiktok_shop", "inventory_csv", "kelly-listing"],
    },
  };
}

function demoProducts(zh: boolean) {
  const l = L(zh);
  return [
    {
      product_id: "prod-aurora-lamp",
      ref: 1,
      sku: "NH-AL-01",
      name: l("Aurora Gradient Desk Lamp", "极光渐变桌面灯"),
      subtitle: l(
        "USB-C aluminum lamp with magnetic shade and warm-to-cool dimming",
        "USB-C 铝合金桌灯，磁吸灯罩，暖冷光无级调节",
      ),
      category: l("Home Office Lighting", "居家办公照明"),
      lifecycle: "launch",
      status: "needs_review",
      image: "/assets/product-images/aurora-lamp.png",
      gallery: [
        "/assets/product-images/aurora-lamp.png",
        "/assets/product-images/aurora-lamp-lifestyle.png",
        "/assets/product-images/aurora-lamp-packaging.png",
      ],
      tags: [l("new launch", "新品首发"), l("hero SKU", "主推 SKU"), "USB-C"],
      owner: "Mia",
      vendor: l("Dongguan Lumenworks", "东莞流明工坊"),
      launch_date: "2026-07-18",
      updated_at: "2026-07-07T07:52:00.000Z",
      pricing: {
        cogs: 11.8,
        landed_cost: 15.25,
        target_price: 39.99,
        current_price: 38.99,
        map_price: 34.99,
        gross_margin_pct: 51.4,
        breakeven_acos: 34.2,
      },
      inventory: {
        on_hand: 920,
        available: 712,
        reserved: 134,
        inbound: 1800,
        days_cover: 16,
        reorder_point: 900,
        reorder_qty: 2200,
      },
      content: {
        hero_images_ready: 5,
        hero_images_required: 6,
        video_ready: false,
        listing_source: "kelly-listing",
        copy_status: "ready",
      },
      compliance: {
        score: 86,
        status: "warn",
        notes: [
          l("EU energy-label image missing for DE channel.", "德国站缺少欧盟能效标签图。"),
          l("USB-C cable claim has supplier test sheet attached.", "USB-C 线材宣称已有供应商测试单。"),
        ],
      },
    },
    {
      product_id: "prod-lunchbox",
      ref: 2,
      sku: "NH-LB-01",
      name: l("Collapsible Silicone Lunch Box", "可折叠硅胶饭盒"),
      subtitle: l("Leakproof food-grade silicone lunch container for commuters", "通勤用防漏食品级硅胶饭盒"),
      category: l("Kitchen & Dining", "厨房餐饮"),
      lifecycle: "active",
      status: "active",
      image: "/assets/product-images/lunchbox.png",
      gallery: ["/assets/product-images/lunchbox.png", "/assets/product-images/lunchbox-lifestyle.png"],
      tags: [l("steady seller", "稳定销售"), "Amazon", "TikTok Shop"],
      owner: "Noah",
      vendor: l("Foshan Foldware", "佛山折叠制品"),
      launch_date: "2026-05-12",
      updated_at: "2026-07-07T05:40:00.000Z",
      pricing: {
        cogs: 5.2,
        landed_cost: 7.45,
        target_price: 22.99,
        current_price: 21.99,
        map_price: 19.99,
        gross_margin_pct: 47.1,
        breakeven_acos: 29.5,
      },
      inventory: {
        on_hand: 4380,
        available: 3820,
        reserved: 280,
        inbound: 1200,
        days_cover: 42,
        reorder_point: 1800,
        reorder_qty: 2600,
      },
      content: {
        hero_images_ready: 7,
        hero_images_required: 6,
        video_ready: true,
        listing_source: "kelly-listing",
        copy_status: "approved",
      },
      compliance: {
        score: 94,
        status: "pass",
        notes: [l("Food-contact test report attached.", "已附食品接触测试报告。")],
      },
    },
    {
      product_id: "prod-spice-rack",
      ref: 3,
      sku: "NH-SR-02",
      name: l("Magnetic Spice Rack", "磁吸调料架"),
      subtitle: l("Four-tier magnetic organizer for refrigerators and small kitchens", "冰箱和小厨房用四层磁吸收纳架"),
      category: l("Kitchen Storage", "厨房收纳"),
      lifecycle: "active",
      status: "blocked",
      image: "/assets/product-images/spice-rack.png",
      gallery: ["/assets/product-images/spice-rack.png", "/assets/product-images/spice-rack-detail.png"],
      tags: [l("quality hold", "质检暂停"), l("margin risk", "毛利风险")],
      owner: "Eli",
      vendor: l("Ningbo Magnetics", "宁波磁性制品"),
      launch_date: "2026-04-03",
      updated_at: "2026-07-06T13:20:00.000Z",
      pricing: {
        cogs: 8.6,
        landed_cost: 12.9,
        target_price: 28.99,
        current_price: 24.99,
        map_price: 23.99,
        gross_margin_pct: 28.3,
        breakeven_acos: 17.4,
      },
      inventory: {
        on_hand: 660,
        available: 420,
        reserved: 36,
        inbound: 0,
        days_cover: 11,
        reorder_point: 700,
        reorder_qty: 1200,
      },
      content: {
        hero_images_ready: 4,
        hero_images_required: 6,
        video_ready: false,
        listing_source: "manual",
        copy_status: "changes_requested",
      },
      compliance: {
        score: 62,
        status: "fail",
        notes: [
          l("Magnet pull-force report missing after supplier change.", "换供应商后缺少磁力拉力测试报告。"),
          l("Amazon draft contains unsupported 'FDA approved' phrase.", "Amazon 草稿含无依据的 FDA approved 表述。"),
        ],
      },
    },
    {
      product_id: "prod-laundry-basket",
      ref: 4,
      sku: "NH-LBASK-03",
      name: l("Fold-Flat Laundry Basket", "折叠洗衣篮"),
      subtitle: l("Slim laundry basket with bamboo handles for apartments", "公寓用竹柄薄型折叠洗衣篮"),
      category: l("Laundry & Storage", "洗衣与收纳"),
      lifecycle: "test",
      status: "needs_review",
      image: "/assets/product-images/laundry-basket.png",
      gallery: ["/assets/product-images/laundry-basket.png", "/assets/product-images/laundry-basket-room.png"],
      tags: [l("test batch", "测试批次"), "Shopify"],
      owner: "Iris",
      vendor: l("Anji Home Textile", "安吉家纺"),
      launch_date: "2026-08-02",
      updated_at: "2026-07-05T16:05:00.000Z",
      pricing: {
        cogs: 7.1,
        landed_cost: 10.85,
        target_price: 29.99,
        current_price: 29.99,
        map_price: 24.99,
        gross_margin_pct: 44.8,
        breakeven_acos: 27.8,
      },
      inventory: {
        on_hand: 540,
        available: 510,
        reserved: 0,
        inbound: 900,
        days_cover: 31,
        reorder_point: 500,
        reorder_qty: 1400,
      },
      content: {
        hero_images_ready: 6,
        hero_images_required: 6,
        video_ready: true,
        listing_source: "kelly-picks",
        copy_status: "draft",
      },
      compliance: {
        score: 81,
        status: "warn",
        notes: [l("Weight capacity proof needs final photo of load test.", "承重证明还需要最终负载测试照片。")],
      },
    },
    {
      product_id: "prod-scale",
      ref: 5,
      sku: "NH-KS-04",
      name: l("Slim Digital Kitchen Scale", "薄款厨房电子秤"),
      subtitle: l("Rechargeable gram/ounce scale with pull-out display", "可充电克/盎司厨房秤，抽拉式显示屏"),
      category: l("Kitchen Tools", "厨房工具"),
      lifecycle: "archive",
      status: "retiring",
      image: "/assets/product-images/kitchen-scale.png",
      gallery: ["/assets/product-images/kitchen-scale.png"],
      tags: [l("phase out", "准备下架"), l("price cleanup", "价格清理")],
      owner: "Mia",
      vendor: l("Shenzhen Weightek", "深圳称芯科技"),
      launch_date: "2025-11-08",
      updated_at: "2026-07-04T09:55:00.000Z",
      pricing: {
        cogs: 6.4,
        landed_cost: 9.3,
        target_price: 18.99,
        current_price: 16.99,
        map_price: 15.99,
        gross_margin_pct: 32.9,
        breakeven_acos: 18.1,
      },
      inventory: {
        on_hand: 248,
        available: 231,
        reserved: 17,
        inbound: 0,
        days_cover: 58,
        reorder_point: 0,
        reorder_qty: 0,
      },
      content: {
        hero_images_ready: 5,
        hero_images_required: 5,
        video_ready: true,
        listing_source: "legacy",
        copy_status: "approved",
      },
      compliance: {
        score: 88,
        status: "pass",
        notes: [l("Retirement plan only; no compliance blocker.", "仅下架计划，无合规阻塞。")],
      },
    },
  ];
}

function demoChannels(zh: boolean) {
  const l = L(zh);
  return [
    {
      product_id: "prod-aurora-lamp",
      platform: "amazon",
      listing_id: "B0AURORA01",
      status: "ready_to_publish",
      price: 38.99,
      buybox: false,
      content_score: 88,
      issue: l("Needs approval for launch-day price and DE energy-label asset.", "首发价和德国站能效标签资产待批准。"),
      next_step: "approve_publish",
      updated_at: "2026-07-07T07:51:00.000Z",
    },
    {
      product_id: "prod-aurora-lamp",
      platform: "shopify",
      listing_id: "aurora-gradient-desk-lamp",
      status: "draft",
      price: 39.99,
      buybox: null,
      content_score: 91,
      issue: l("DTC bundle image missing.", "DTC 套装图缺失。"),
      next_step: "add_asset",
      updated_at: "2026-07-07T07:49:00.000Z",
    },
    {
      product_id: "prod-lunchbox",
      platform: "amazon",
      listing_id: "B0LUNCHBOX1",
      status: "live",
      price: 21.99,
      buybox: true,
      content_score: 95,
      issue: "",
      next_step: "monitor",
      updated_at: "2026-07-07T04:28:00.000Z",
    },
    {
      product_id: "prod-lunchbox",
      platform: "tiktok_shop",
      listing_id: "tk-nh-lb-01",
      status: "live",
      price: 22.49,
      buybox: null,
      content_score: 89,
      issue: l("Creator video refresh due next week.", "达人视频下周需要更新。"),
      next_step: "refresh_video",
      updated_at: "2026-07-07T04:35:00.000Z",
    },
    {
      product_id: "prod-spice-rack",
      platform: "amazon",
      listing_id: "B0SPICE02",
      status: "suppressed",
      price: 24.99,
      buybox: false,
      content_score: 61,
      issue: l("Compliance phrase and missing magnet test report.", "合规表述和磁力测试报告缺失。"),
      next_step: "block_until_fixed",
      updated_at: "2026-07-06T13:18:00.000Z",
    },
    {
      product_id: "prod-laundry-basket",
      platform: "shopify",
      listing_id: "fold-flat-laundry-basket",
      status: "ready_to_publish",
      price: 29.99,
      buybox: null,
      content_score: 84,
      issue: l("Approve test-batch launch cap: 540 units.", "批准测试批次上架上限：540 件。"),
      next_step: "approve_publish",
      updated_at: "2026-07-05T16:00:00.000Z",
    },
    {
      product_id: "prod-scale",
      platform: "ebay",
      listing_id: "nh-ks-04-clearance",
      status: "price_review",
      price: 16.99,
      buybox: null,
      content_score: 80,
      issue: l("Retirement markdown needs approval.", "清仓降价需要批准。"),
      next_step: "approve_markdown",
      updated_at: "2026-07-04T09:52:00.000Z",
    },
  ];
}

function demoInventory(zh: boolean) {
  const l = L(zh);
  return [
    {
      product_id: "prod-aurora-lamp",
      warehouse_id: "wh-sz",
      warehouse_name: l("Shenzhen 3PL", "深圳三方仓"),
      on_hand: 920,
      available: 712,
      reserved: 134,
      inbound: 1800,
      inbound_eta: "2026-07-14",
      days_cover: 16,
      status: "low_stock",
    },
    {
      product_id: "prod-lunchbox",
      warehouse_id: "wh-la",
      warehouse_name: l("Los Angeles 3PL", "洛杉矶三方仓"),
      on_hand: 4380,
      available: 3820,
      reserved: 280,
      inbound: 1200,
      inbound_eta: "2026-07-22",
      days_cover: 42,
      status: "healthy",
    },
    {
      product_id: "prod-spice-rack",
      warehouse_id: "wh-la",
      warehouse_name: l("Los Angeles 3PL", "洛杉矶三方仓"),
      on_hand: 660,
      available: 420,
      reserved: 36,
      inbound: 0,
      inbound_eta: "",
      days_cover: 11,
      status: "stockout_risk",
    },
    {
      product_id: "prod-laundry-basket",
      warehouse_id: "wh-sz",
      warehouse_name: l("Shenzhen 3PL", "深圳三方仓"),
      on_hand: 540,
      available: 510,
      reserved: 0,
      inbound: 900,
      inbound_eta: "2026-07-28",
      days_cover: 31,
      status: "test_cap",
    },
    {
      product_id: "prod-scale",
      warehouse_id: "wh-de",
      warehouse_name: l("Bremen FBA prep", "不来梅 FBA 预处理仓"),
      on_hand: 248,
      available: 231,
      reserved: 17,
      inbound: 0,
      inbound_eta: "",
      days_cover: 58,
      status: "retiring",
    },
  ];
}

function demoReviewItems(zh: boolean) {
  const l = L(zh);
  return [
    {
      item_id: "review-aurora-launch",
      ref: 1,
      product_id: "prod-aurora-lamp",
      type: "publish_approval",
      status: "needs_review",
      title: l("Approve Aurora Lamp Amazon launch", "批准极光灯 Amazon 首发"),
      summary: l(
        "Publish Amazon US at $38.99 with 920 units on hand and inbound replenishment. German channel remains blocked until the energy-label asset is uploaded.",
        "Amazon US 以 $38.99 上架；现货 920 件，补货在途。德国站在能效标签图上传前保持阻止。",
      ),
      risk: "medium",
      recommendation: "approve",
      evidence: [
        l("Gross margin 51.4%, above 32% floor.", "毛利率 51.4%，高于 32% 红线。"),
        l("Inventory cover is only 16 days; reorder card is queued.", "库存覆盖仅 16 天，补货卡已入队。"),
      ],
      created_at: "2026-07-07T08:00:00.000Z",
    },
    {
      item_id: "review-spice-hold",
      ref: 2,
      product_id: "prod-spice-rack",
      type: "quality_hold",
      status: "needs_review",
      title: l("Block spice rack relist until tests arrive", "阻止调料架重新上架，等待测试报告"),
      summary: l(
        "The supplier changed magnets, Amazon is suppressed, and the margin is below the product floor. Keep channel publishing blocked until pull-force evidence and revised copy are ready.",
        "供应商更换磁铁，Amazon 已被抑制，毛利低于红线。磁力证据和修订文案完成前不要恢复上架。",
      ),
      risk: "high",
      recommendation: "block",
      evidence: [
        l("Compliance score 62 with missing test report.", "合规分 62，缺少测试报告。"),
        l("Gross margin 28.3%, below 32% floor.", "毛利率 28.3%，低于 32% 红线。"),
      ],
      created_at: "2026-07-06T13:30:00.000Z",
    },
    {
      item_id: "review-scale-markdown",
      ref: 3,
      product_id: "prod-scale",
      type: "price_change",
      status: "needs_review",
      title: l("Approve kitchen scale clearance markdown", "批准厨房秤清仓降价"),
      summary: l(
        "Retiring SKU has 231 available units. Agent proposes $16.99 eBay clearance with no reorder and archive after sell-through.",
        "准备下架 SKU 当前可售 231 件。Agent 建议 eBay 清仓价 $16.99，不补货，售罄后归档。",
      ),
      risk: "low",
      recommendation: "approve",
      evidence: [
        l("Still above MAP by $1.00.", "仍比 MAP 高 $1.00。"),
        l("No inbound inventory and archive lifecycle already set.", "无在途库存，生命周期已设为归档。"),
      ],
      created_at: "2026-07-04T10:05:00.000Z",
    },
  ];
}

function demoActivity(zh: boolean) {
  const l = L(zh);
  return [
    {
      id: "act-1",
      at: "2026-07-07T08:12:00.000Z",
      actor: "agent",
      text: l(
        "Queued Aurora Lamp reorder card after inventory cover fell below 18 days.",
        "极光灯库存覆盖低于 18 天，已生成补货卡。",
      ),
    },
    {
      id: "act-2",
      at: "2026-07-07T07:50:00.000Z",
      actor: "kelly-listing",
      text: l(
        "Amazon US copy for Aurora Lamp marked ready for publish approval.",
        "极光灯 Amazon US 文案已标记为可发布审批。",
      ),
    },
    {
      id: "act-3",
      at: "2026-07-06T13:18:00.000Z",
      actor: "amazon",
      text: l(
        "Magnetic Spice Rack listing suppressed after unsupported claim scan.",
        "磁吸调料架因无依据宣称扫描被 Amazon 抑制。",
      ),
    },
    {
      id: "act-4",
      at: "2026-07-05T16:01:00.000Z",
      actor: "agent",
      text: l("Fold-Flat Laundry Basket moved to Shopify test-batch review.", "折叠洗衣篮进入 Shopify 测试批次评审。"),
    },
  ];
}

function demoAgentTasks(zh: boolean) {
  const l = L(zh);
  return {
    updated_at: "2026-07-07T08:12:00.000Z",
    tasks: [
      {
        task_id: "task-reorder-aurora",
        type: "prepare_reorder",
        product_id: "prod-aurora-lamp",
        status: "queued",
        title: l("Prepare 2,200-unit Aurora Lamp reorder recommendation", "准备极光灯 2,200 件补货建议"),
      },
      {
        task_id: "task-spice-copy",
        type: "revise_listing_and_claims",
        product_id: "prod-spice-rack",
        status: "blocked",
        title: l("Wait for magnet test report before relist copy revision", "等待磁力测试报告后再修订重新上架文案"),
      },
    ],
  };
}

function demoExecutionReport(zh: boolean) {
  const l = L(zh);
  return {
    generated_at: "2026-07-07T08:00:00.000Z",
    operations: [
      {
        operation_id: "op-sync-1",
        type: "sync_channel_status",
        status: "completed",
        summary: l(
          "Synced Amazon, Shopify, TikTok Shop, and eBay channel states.",
          "已同步 Amazon、Shopify、TikTok Shop 和 eBay 渠道状态。",
        ),
      },
    ],
  };
}

function metrics(
  products: ReturnType<typeof demoProducts>,
  channels: ReturnType<typeof demoChannels>,
  inventory: ReturnType<typeof demoInventory>,
) {
  const active = products.filter((product) => ["active", "launch", "test"].includes(product.lifecycle)).length;
  const needsReview = products.filter((product) => product.status === "needs_review").length;
  const lowStock = inventory.filter((item) => ["low_stock", "stockout_risk"].includes(item.status)).length;
  const channelIssues = channels.filter((item) => item.issue).length;
  const marginAvg = products.reduce((sum, product) => sum + product.pricing.gross_margin_pct, 0) / products.length;
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.inventory.available * product.pricing.landed_cost,
    0,
  );
  return {
    product_count: products.length,
    active_count: active,
    needs_review_count: needsReview,
    low_stock_count: lowStock,
    channel_issue_count: channelIssues,
    avg_margin_pct: money(marginAvg),
    inventory_value: money(inventoryValue),
  };
}

function demoSnapshot(zh: boolean) {
  const l = L(zh);
  const products = demoProducts(zh);
  const channelMatrix = demoChannels(zh);
  const inventory = demoInventory(zh);
  return {
    schema_version: "1",
    generated_at: now,
    source: "demo",
    seller: {
      brand: "Nimbus Home",
      entity: l("Nimbus Home Trading Co., Ltd. (Shenzhen)", "深圳临风家居贸易有限公司"),
      base_currency: "USD",
    },
    metrics: metrics(products, channelMatrix, inventory),
    products,
    channel_matrix: channelMatrix,
    inventory,
    review_items: demoReviewItems(zh),
    activity_log: demoActivity(zh),
    warnings: [],
  };
}
