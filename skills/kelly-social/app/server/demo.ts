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
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-social",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-social/config.json",
      is_example: false,
      accounts: snapshot.accounts.map((account) => ({
        account_id: account.account_id,
        platform: account.platform,
        handle: account.handle,
        display_name: account.display_name,
        collection: account.collection,
        secret_envs: account.collection === "api" ? [`KELLY_SOCIAL_${account.platform.toUpperCase()}_TOKEN_DEMO`] : [],
        secrets_ready: true,
      })),
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "x-kelly": "Kelly 造物日志",
    "ig-kelly": "Kelly 工作室",
    "fb-kelly": "Kelly 工作室主页",
  };
  const postText = {
    "x-2074": "早晨规则：先发布一个看得见的东西，再看数据。今天是平台徽章。",
    "x-2071": "上线了：本地仪表盘现在不用任何图表库就能渲染粉丝趋势。内联 SVG，14 行。零依赖就是零依赖。",
    "x-2066": "18 个月前我辞职去做小型 local-first 工具。这条线程讲清楚哪些赚到了钱、哪些没有。🧵 (1/14)",
    "x-2064": "Kelly Money v0.4 上线：发票匹配台、审计轨迹、中英双语界面。一如既往 build in public。演示在回复里。",
    "x-2060":
      "Build in public 周报（第 26 周）：MRR $4,210（+6%），流失率 1.8%，一个企业试用。无聊的中段才是复利藏身的地方。",
    "x-2055": "暴论：你的副业项目不需要登录、计费和落地页。它需要一个不是你自己的用户。",
    "x-2049": "审批队列流程的录屏：4 分钟处理完 38 封邮件。App-in-Skill 模式就是为这个而生的。",
    "x-2043": "让 agent 对账 3 个月的 Stripe 提现和 Mercury 流水，它找出了一笔我从四月一直忽略的 $680 差额。",
    "x-2038": "新博客：《零依赖本身就是功能》。为什么我坚持发布没有 package.json 的工具。",
    "x-2031": "投票结果出炉：71% 的人希望聚合器下一个支持小红书。收到。",
    "ig-914": "工作室巡礼：升降桌、植物坟场，还有路线图安息的便利贴墙。🌿",
    "ig-911": "Kelly Money v0.4 发布图集——6 张图讲清发票匹配器怎么工作。",
    "ig-907": "桌面焕新。第二块显示器专门看日志，说真的，很治愈。",
    "ig-902": "独立开发者的一天：40% 写代码，30% 回支持邮件，30% 说服自己数据下滑只是季节性的。",
    "fb-448": "Kelly Money v0.4 发布！完整更新日志和下载链接见下方。感谢群里的 14 位内测用户。",
    "fb-445": "社区提问：哪个平台的数据导出最折磨人？我在做导入器，先挑三个平台。",
    "fb-441": "本周五下午 4 点（香港时间）例行答疑。带上你最离谱的表格来。",
  };
  const agentNotes = {
    "x-2066": "爆款线程——贡献了本周约 78% 的曝光量。粉丝在 6 月 30 日单日 +286。",
    "x-2064": "发布帖。外链点击 412 次，转化到文档页 9.4%。",
    "ig-911": "收藏率异常高（1.2%）——图集格式对发布内容效果很好。",
  };
  const syncMessages = {
    "sync-x-20260702": "通过用户本人的 X 登录会话采集；数据读取自公开的帖子分析页，限速礼貌抓取。",
    "sync-ig-20260701": "解析 Meta Business Suite 导出文件（instagram_insights_20260701.csv）。",
    "sync-fb-20260702": "Graph API 主页洞察，只读 token。",
    "sync-ig-20260624": "导出文件超过 7 天；请用户下载新的 Meta 导出。",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
  }));
  snapshot.posts = snapshot.posts.map((post) => ({
    ...post,
    text: postText[post.post_id] || post.text,
    agent_notes: agentNotes[post.post_id] || post.agent_notes,
  }));
  snapshot.sync_log = snapshot.sync_log.map((entry) => ({
    ...entry,
    message: syncMessages[entry.sync_id] || entry.message,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "Instagram 导出已超过 7 天，粉丝与曝光数据可能滞后。请下载新的 Meta Business Suite 导出。",
    detail: "演示提醒，没有读取真实平台数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario) {
  const accounts = [
    account({
      account_id: "x-kelly",
      platform: "x",
      handle: "@kellyships",
      display_name: "Kelly Ships",
      profile_url: "https://x.com/kellyships",
      collection: "browser_agent",
      status: "ok",
      metrics: {
        followers: 12480,
        following: 892,
        posts: 3214,
        impressions_7d: 486200,
        impressions_28d: 1204500,
        engagements_7d: 21140,
        engagement_rate_7d: 0.0435,
        profile_visits_7d: 3840,
        followers_delta_7d: 412,
        followers_delta_28d: 1186,
      },
      follower_series: series([10850, 11060, 11294, 11402, 11618, 11890, 12068, 12480]),
      traffic_sources: [
        { source: "For You feed", share: 0.46 },
        { source: "Profile visits", share: 0.22 },
        { source: "External links", share: 0.18 },
        { source: "Search", share: 0.14 },
      ],
      last_sync_at: "2026-07-02T08:45:00.000Z",
    }),
    account({
      account_id: "ig-kelly",
      platform: "instagram",
      handle: "@kelly.ships",
      display_name: "Kelly Ships Studio",
      profile_url: "https://instagram.com/kelly.ships",
      collection: "manual_export",
      status: scenario === "detail" ? "warning" : "ok",
      metrics: {
        followers: 4210,
        following: 311,
        posts: 268,
        impressions_7d: 58400,
        impressions_28d: 214800,
        engagements_7d: 3120,
        engagement_rate_7d: 0.0534,
        profile_visits_7d: 940,
        followers_delta_7d: 96,
        followers_delta_28d: 318,
      },
      follower_series: series([3760, 3821, 3892, 3948, 4014, 4085, 4114, 4210]),
      traffic_sources: [
        { source: "Reels", share: 0.51 },
        { source: "Explore", share: 0.24 },
        { source: "Profile", share: 0.15 },
        { source: "Hashtags", share: 0.1 },
      ],
      last_sync_at: "2026-07-01T21:10:00.000Z",
    }),
    account({
      account_id: "fb-kelly",
      platform: "facebook",
      handle: "Kelly Ships Studio",
      display_name: "Kelly Ships Studio Page",
      profile_url: "https://facebook.com/kellyshipsstudio",
      collection: "api",
      status: "ok",
      metrics: {
        followers: 2065,
        following: 0,
        posts: 512,
        impressions_7d: 12850,
        impressions_28d: 51200,
        engagements_7d: 640,
        engagement_rate_7d: 0.0498,
        profile_visits_7d: 210,
        followers_delta_7d: 18,
        followers_delta_28d: 64,
      },
      follower_series: series([1988, 1996, 2005, 2018, 2027, 2036, 2047, 2065]),
      traffic_sources: [
        { source: "Group shares", share: 0.44 },
        { source: "Page feed", share: 0.38 },
        { source: "Search", share: 0.18 },
      ],
      last_sync_at: "2026-07-02T08:50:00.000Z",
    }),
  ];

  const posts = [
    post(
      "x-2074",
      "x",
      "x-kelly",
      "2026-07-02T08:05:00.000Z",
      "Morning rule: ship one visible thing before checking metrics. Today it's platform badges.",
      "none",
      0,
      "https://x.com/kellyships/status/2074",
      { likes: 68, replies: 9, reposts: 4, views: 8900, saves: 0, clicks: 12 },
      "post",
      "",
    ),
    post(
      "x-2071",
      "x",
      "x-kelly",
      "2026-07-01T15:42:00.000Z",
      "Shipped: the local dashboard now renders follower trends without a single chart library. Inline SVG, 14 lines. Zero deps stays zero deps.",
      "image",
      1,
      "https://x.com/kellyships/status/2071",
      { likes: 214, replies: 31, reposts: 24, views: 30400, saves: 0, clicks: 86 },
      "post",
      "",
    ),
    post(
      "x-2066",
      "x",
      "x-kelly",
      "2026-06-30T13:05:00.000Z",
      "I quit my job 18 months ago to build tiny local-first tools. Here's everything that made money — and everything that didn't. 🧵 (1/14)",
      "none",
      0,
      "https://x.com/kellyships/status/2066",
      { likes: 4820, replies: 342, reposts: 1205, views: 402000, saves: 0, clicks: 1840 },
      "thread",
      "Viral thread — drove ~78% of this week's impressions. Followers +286 on Jun 30 alone.",
    ),
    post(
      "x-2064",
      "x",
      "x-kelly",
      "2026-06-29T18:20:00.000Z",
      "Kelly Money v0.4 is live: invoice matching desk, audit trails, CN/EN UI. Built in public, as always. Demo in the reply.",
      "image",
      2,
      "https://x.com/kellyships/status/2064",
      { likes: 386, replies: 44, reposts: 58, views: 51300, saves: 0, clicks: 412 },
      "post",
      "Launch post. 412 link clicks, 9.4% conversion to the docs page.",
    ),
    post(
      "x-2060",
      "x",
      "x-kelly",
      "2026-06-29T09:12:00.000Z",
      "Build-in-public update, week 26: MRR $4,210 (+6%), churn 1.8%, one enterprise trial. The boring middle is where compounding hides.",
      "none",
      0,
      "https://x.com/kellyships/status/2060",
      { likes: 298, replies: 27, reposts: 19, views: 38900, saves: 0, clicks: 34 },
      "post",
      "",
    ),
    post(
      "x-2055",
      "x",
      "x-kelly",
      "2026-06-28T11:30:00.000Z",
      "Hot take: your side project doesn't need auth, billing, or a landing page. It needs one user who isn't you.",
      "none",
      0,
      "https://x.com/kellyships/status/2055",
      { likes: 512, replies: 63, reposts: 87, views: 64800, saves: 0, clicks: 0 },
      "post",
      "",
    ),
    post(
      "x-2049",
      "x",
      "x-kelly",
      "2026-06-27T16:44:00.000Z",
      "Screen recording of the review queue flow. 38 emails triaged in 4 minutes. This is what App-in-Skill patterns are for.",
      "video",
      1,
      "https://x.com/kellyships/status/2049",
      { likes: 176, replies: 12, reposts: 21, views: 22700, saves: 0, clicks: 58 },
      "post",
      "",
    ),
    post(
      "x-2043",
      "x",
      "x-kelly",
      "2026-06-26T08:55:00.000Z",
      "Asked my agent to reconcile 3 months of Stripe payouts against Mercury. It found a $680 mismatch I'd been ignoring since April.",
      "none",
      0,
      "https://x.com/kellyships/status/2043",
      { likes: 341, replies: 38, reposts: 44, views: 41200, saves: 0, clicks: 22 },
      "post",
      "",
    ),
    post(
      "x-2038",
      "x",
      "x-kelly",
      "2026-06-25T14:10:00.000Z",
      "New blog post: 'Zero-dependency is a feature.' Why I keep shipping tools with no package.json.",
      "link",
      1,
      "https://x.com/kellyships/status/2038",
      { likes: 152, replies: 18, reposts: 26, views: 19800, saves: 0, clicks: 240 },
      "post",
      "",
    ),
    post(
      "x-2031",
      "x",
      "x-kelly",
      "2026-06-24T10:26:00.000Z",
      "Poll results are in: 71% of you want the aggregator to support Xiaohongshu next. Noted.",
      "none",
      0,
      "https://x.com/kellyships/status/2031",
      { likes: 96, replies: 22, reposts: 5, views: 14100, saves: 0, clicks: 0 },
      "post",
      "",
    ),
    post(
      "ig-914",
      "instagram",
      "ig-kelly",
      "2026-07-01T12:00:00.000Z",
      "Studio tour: the standing desk, the plant graveyard, and the sticky-note wall where roadmaps go to die. 🌿",
      "video",
      1,
      "https://instagram.com/p/ig914",
      { likes: 486, replies: 42, reposts: 31, views: 9850, saves: 58, clicks: 0 },
      "reel",
      "",
    ),
    post(
      "ig-911",
      "instagram",
      "ig-kelly",
      "2026-06-29T17:30:00.000Z",
      "Kelly Money v0.4 launch carousel — 6 slides on how the invoice matcher works.",
      "carousel",
      6,
      "https://instagram.com/p/ig911",
      { likes: 302, replies: 24, reposts: 18, views: 6420, saves: 77, clicks: 0 },
      "post",
      "Unusually high save rate (1.2%) — carousel format works well for launches.",
    ),
    post(
      "ig-907",
      "instagram",
      "ig-kelly",
      "2026-06-27T09:15:00.000Z",
      "Desk setup refresh. The second monitor is exclusively for logs, and honestly, it sparks joy.",
      "image",
      1,
      "https://instagram.com/p/ig907",
      { likes: 268, replies: 19, reposts: 8, views: 4930, saves: 21, clicks: 0 },
      "post",
      "",
    ),
    post(
      "ig-902",
      "instagram",
      "ig-kelly",
      "2026-06-25T19:40:00.000Z",
      "Day in the life of a solo founder: 40% coding, 30% support emails, 30% convincing myself the metrics dip is seasonal.",
      "video",
      1,
      "https://instagram.com/p/ig902",
      { likes: 391, replies: 33, reposts: 26, views: 8140, saves: 44, clicks: 0 },
      "reel",
      "",
    ),
    post(
      "fb-448",
      "facebook",
      "fb-kelly",
      "2026-06-30T10:00:00.000Z",
      "Kelly Money v0.4 is out! Full changelog and download link below. Thanks to the 14 beta testers in this group.",
      "link",
      1,
      "https://facebook.com/kellyshipsstudio/posts/448",
      { likes: 84, replies: 12, reposts: 9, views: 2310, saves: 0, clicks: 96 },
      "post",
      "",
    ),
    post(
      "fb-445",
      "facebook",
      "fb-kelly",
      "2026-06-27T15:20:00.000Z",
      "Community question: which platform's analytics export is the most painful? Building an importer and picking the first three.",
      "none",
      0,
      "https://facebook.com/kellyshipsstudio/posts/445",
      { likes: 46, replies: 28, reposts: 3, views: 1870, saves: 0, clicks: 0 },
      "post",
      "",
    ),
    post(
      "fb-441",
      "facebook",
      "fb-kelly",
      "2026-06-24T12:45:00.000Z",
      "Weekly office hours this Friday, 4pm HKT. Bring your gnarliest spreadsheet.",
      "image",
      1,
      "https://facebook.com/kellyshipsstudio/posts/441",
      { likes: 39, replies: 8, reposts: 4, views: 1480, saves: 0, clicks: 0 },
      "post",
      "",
    ),
  ];

  const sync_log = [
    syncEntry(
      "sync-x-20260702",
      "x-kelly",
      "browser_agent",
      "2026-07-02T08:40:00.000Z",
      "2026-07-02T08:45:00.000Z",
      "ok",
      10,
      "Collected via the user's own X session; metrics read from public post analytics pages with polite throttling.",
    ),
    syncEntry(
      "sync-fb-20260702",
      "fb-kelly",
      "api",
      "2026-07-02T08:48:00.000Z",
      "2026-07-02T08:50:00.000Z",
      "ok",
      3,
      "Graph API page insights, read-only token.",
    ),
    syncEntry(
      "sync-ig-20260701",
      "ig-kelly",
      "manual_export",
      "2026-07-01T21:05:00.000Z",
      "2026-07-01T21:10:00.000Z",
      "ok",
      4,
      "Parsed Meta Business Suite export (instagram_insights_20260701.csv).",
    ),
    syncEntry(
      "sync-ig-20260624",
      "ig-kelly",
      "manual_export",
      "2026-06-24T20:00:00.000Z",
      "2026-06-24T20:04:00.000Z",
      "warning",
      5,
      "Export older than 7 days; asked the user for a fresh Meta export.",
    ),
  ];

  const metrics = rollup(accounts, posts);

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-social-demo",
    range: { start: "2026-06-04", end: "2026-07-02" },
    metrics,
    accounts,
    posts,
    sync_log,
    warnings:
      scenario === "detail"
        ? [
            {
              id: "ig-export-stale",
              severity: "warning",
              account_id: "ig-kelly",
              message:
                "Instagram export is older than 7 days; follower and impression figures may lag. Download a fresh Meta Business Suite export.",
              detail: "Demo warning, no live platform data.",
            },
          ]
        : [],
  };
}

function rollup(accounts, posts) {
  const totals = accounts.reduce(
    (acc, item) => {
      acc.total_followers += item.metrics.followers;
      acc.followers_delta_7d += item.metrics.followers_delta_7d;
      acc.followers_delta_28d += item.metrics.followers_delta_28d || 0;
      acc.impressions_7d += item.metrics.impressions_7d;
      acc.engagements_7d += item.metrics.engagements_7d || 0;
      return acc;
    },
    {
      account_count: accounts.length,
      post_count: posts.length,
      total_followers: 0,
      followers_delta_7d: 0,
      followers_delta_28d: 0,
      impressions_7d: 0,
      engagements_7d: 0,
      engagement_rate_7d: 0,
    },
  );
  totals.engagement_rate_7d =
    totals.impressions_7d > 0 ? Number((totals.engagements_7d / totals.impressions_7d).toFixed(4)) : 0;
  return totals;
}

function series(values) {
  const dates = [
    "2026-05-13",
    "2026-05-20",
    "2026-05-27",
    "2026-06-03",
    "2026-06-10",
    "2026-06-17",
    "2026-06-24",
    "2026-07-01",
  ];
  return values.map((followers, index) => ({ date: dates[index], followers }));
}

function account(fields) {
  return { notes: "", traffic_sources: [], ...fields };
}

function post(
  post_id,
  platform,
  account_id,
  posted_at,
  text,
  media,
  media_count,
  permalink,
  metrics,
  type,
  agent_notes,
) {
  const engagements = metrics.likes + metrics.replies + metrics.reposts + (metrics.saves || 0);
  return {
    post_id,
    platform,
    account_id,
    provider_post_id: post_id,
    posted_at,
    type,
    text,
    media,
    media_count,
    permalink,
    metrics,
    engagement_rate: metrics.views > 0 ? Number((engagements / metrics.views).toFixed(4)) : 0,
    agent_notes,
    tags: [],
  };
}

function syncEntry(sync_id, account_id, method, started_at, completed_at, status, posts_collected, message) {
  return {
    sync_id,
    account_id,
    method,
    started_at,
    completed_at,
    status,
    posts_collected,
    message,
    actor: "kelly-social-demo",
  };
}
