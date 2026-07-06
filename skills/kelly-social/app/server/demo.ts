import { evaluateGate } from "../../lib/social-qa.ts";

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
  localizeEchoZh(snapshot);
  return snapshot;
}

// Localize the ECHO publishing-side demo content into Chinese. The gate verdict
// and checks stay computed from the (original-language) copy — only the human
// display strings are swapped.
function localizeEchoZh(snapshot) {
  const calTitles = {
    "cal-1": "第 27 周数据复盘",
    "cal-2": "工作室整理 Reel",
    "cal-3": "零依赖线程 第二篇",
    "cal-4": "答疑时间预告",
    "cal-5": "Kelly Money v0.5 预热图集",
    "cal-6": "v0.5 上线帖",
    "cal-7": "60 秒讲清什么是审批队列",
    "cal-8": "周五暴论",
  };
  const pillars = {
    "build-in-public": "公开构建",
    "behind-the-scenes": "幕后",
    teaching: "教学",
    community: "社区",
    launch: "上线",
    opinion: "观点",
  };
  const draftCopy = {
    "draft-1": {
      hook: "第 27 周，无聊的中段仍在按时交房租。",
      body: "MRR $4,460（+6%），流失率 1.6%，管道里有两个企业试用。不光鲜的部分——回支持、修边界情况——才是复利藏身之处。完整拆解见下 👇",
      cta: "回复你的第 27 周数字。",
    },
    "draft-2": {
      hook: "做仪表盘不需要图表库。",
      body: "Kelly Social 的粉丝趋势就是 14 行内联 SVG。这是整个函数，以及为什么零依赖是功能而非炫技。",
      cta: "完整代码在线程里。",
    },
    "draft-3": {
      hook: "有个新东西正在你睡觉时帮你对账发票。",
      body: "Kelly Money v0.5 预热。6 张图集：全新自动匹配、审计轨迹、中英切换。左滑查看。",
      cta: "加入 v0.5 内测——链接在简介。",
    },
    "draft-4": {
      hook: "你的副业需要一个不是你自己的用户。",
      body: "不是登录。不是计费。不是落地页。一个真实用户。其余都是带 commit 记录的拖延。",
      cta: "",
    },
    "draft-5": {
      hook: "Kelly Money v0.5 是全球第一，保证 100% 安全。",
      body: "赞助上线推广：史上最好的开票工具，零风险，效果保证。立即注册。",
      cta: "立即购买。",
    },
    "draft-6": {
      hook: "本周五答疑时间回归。",
      body: "香港时间下午 4 点，还是那个链接。带上你最离谱的表格，我们直播拆解。上周直播时找出了一笔 $680 的对账错误。",
      cta: "把问题发在评论区。",
    },
  };
  const shortTitles = {
    "short-1": "30 秒工作室整理",
    "short-2": "审批队列到底是什么",
    "short-3": "v0.5 发票自动匹配预告",
  };
  const engText = {
    "eng-1": {
      incoming: "这个零依赖的迷你趋势图正是我需要的。代码开源吗？",
      reply: "谢谢！就是一个 14 行的函数——今天我会在线程里放完整代码。持续关注。🙏",
    },
    "eng-2": {
      incoming: "在对比 @kellyships 的聚合器和 FeedForge——有人两个都用过吗？",
      reply: "很乐意回答任何具体问题！Kelly Social 是本地优先、只读你自己的账号——没有云端中间层。你最看重哪一点？",
    },
    "eng-3": {
      incoming: "工作室巡礼看得我想把整个桌面重新整理一遍 😂",
      reply: "哈！那片植物坟场承担了不少情绪价值。整理完记得发出来。🌿",
    },
    "eng-4": {
      incoming: "Meta 导出又崩了。你的导入器支持新格式了吗？",
      reply: "支持——解析器已经适配 7 月 Meta 导出的新版式。如果还报错，私信我表头行（不含数据），我来打补丁。",
    },
    "eng-5": {
      incoming: "18 个月才 $4k MRR，这不是生意，是爱好。",
      reply: "合理的反驳——现在还早，我如实公开数字正是为了让大家自己判断。复利本就慢，我宁可诚实也不吹。",
    },
  };
  const crisisLabels = {
    "cr-1": ["分诊信号", "先确认是否属实：截图、来源、影响范围，冷静核实后再回应。"],
    "cr-2": ["暂停定时发布", "切换发布暂停开关，避免有内容自动发进正在发生的事件里。"],
    "cr-3": ["指定发言人", "一个声音对外。其他人把问题都转给发言人。"],
    "cr-4": ["起草待命声明", "先承认，别揣测。“我们已注意到并正在核实。”"],
    "cr-5": ["24 小时内记录并复盘", "记录时间线、应对方式，以及下次要改进什么。"],
  };

  snapshot.calendar = (snapshot.calendar || []).map((entry) => ({
    ...entry,
    title: calTitles[entry.entry_id] || entry.title,
    pillar: pillars[entry.pillar] || entry.pillar,
  }));
  snapshot.drafts = (snapshot.drafts || []).map((draft) => ({
    ...draft,
    pillar: pillars[draft.pillar] || draft.pillar,
    ...(draftCopy[draft.draft_id] || {}),
  }));
  snapshot.shorts = (snapshot.shorts || []).map((short) => ({
    ...short,
    pillar: pillars[short.pillar] || short.pillar,
    title: shortTitles[short.short_id] || short.title,
  }));
  snapshot.engagement = (snapshot.engagement || []).map((item) => ({
    ...item,
    incoming_text: engText[item.item_id]?.incoming || item.incoming_text,
    draft_reply: engText[item.item_id]?.reply || item.draft_reply,
  }));
  if (snapshot.crisis) {
    snapshot.crisis = {
      ...snapshot.crisis,
      spokesperson: "Kelly（创始人）",
      steps: snapshot.crisis.steps.map((step) => ({
        ...step,
        label: crisisLabels[step.step_id]?.[0] || step.label,
        detail: crisisLabels[step.step_id]?.[1] || step.detail,
      })),
    };
  }
  if (snapshot.share_of_voice) {
    snapshot.share_of_voice = {
      ...snapshot.share_of_voice,
      entries: snapshot.share_of_voice.entries.map((entry) =>
        entry.is_self ? { ...entry, name: "Kelly Ships（你）" } : entry,
      ),
    };
  }
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
    calendar: demoCalendar(),
    drafts: demoDrafts(),
    shorts: demoShorts(),
    engagement: demoEngagement(),
    crisis: demoCrisis(),
    share_of_voice: demoShareOfVoice(),
  };
}

// ─── ECHO publishing-side demo data (invented, demo-safe brand) ─────────────

function demoCalendar() {
  return [
    cal("cal-1", "2026-07-03", "x", "build-in-public", "Week 27 metrics recap", "scheduled", {
      draft_id: "draft-1",
      scheduled_for: "2026-07-03T09:00:00.000Z",
    }),
    cal("cal-2", "2026-07-04", "instagram", "behind-the-scenes", "Studio reset reel", "drafting", {
      draft_id: "short-1",
    }),
    cal("cal-3", "2026-07-05", "x", "teaching", "Zero-deps thread part 2", "planned"),
    cal("cal-4", "2026-07-07", "facebook", "community", "Office hours announcement", "planned"),
    cal("cal-5", "2026-07-08", "instagram", "launch", "Kelly Money v0.5 teaser carousel", "drafting", {
      draft_id: "draft-3",
    }),
    cal("cal-6", "2026-07-09", "x", "launch", "v0.5 launch post", "planned", { draft_id: "draft-5" }),
    cal("cal-7", "2026-07-10", "tiktok", "teaching", "60s: what a review queue is", "planned", { draft_id: "short-2" }),
    cal("cal-8", "2026-07-11", "x", "opinion", "Hot take Friday", "planned"),
  ];
}

function demoDrafts() {
  const raw = [
    {
      draft_id: "draft-1",
      channels: ["x"],
      pillar: "build-in-public",
      hook: "Week 27, and the boring middle keeps paying rent.",
      body: "MRR $4,460 (+6%), churn 1.6%, two enterprise trials in the pipe. The unglamorous part — answering support, fixing edge cases — is where the compounding lives. Full breakdown 👇",
      hashtags: ["#buildinpublic", "#indiehackers"],
      cta: "Reply with your week-27 number.",
      status: "needs_review",
      agent_notes: "Continues the weekly build-in-public cadence; strong on the last two Fridays.",
    },
    {
      draft_id: "draft-2",
      channels: ["x", "linkedin"],
      pillar: "teaching",
      hook: "You don't need a chart library to ship a dashboard.",
      body: "The follower trend on Kelly Social is 14 lines of inline SVG. Here's the whole function, and why zero-deps is a feature, not a flex.",
      hashtags: ["#webdev", "#dataviz"],
      cta: "Full snippet in the thread.",
      status: "changes_requested",
      review_note: "Tighten the hook; lead with the number of lines.",
      agent_notes: "Repurposes the x-2071 post that overperformed.",
    },
    {
      draft_id: "draft-3",
      channels: ["instagram"],
      pillar: "launch",
      hook: "Something new is matching your invoices while you sleep.",
      body: "Kelly Money v0.5 teaser. 6-slide carousel: the new auto-match, the audit trail, and the CN/EN toggle. Swipe through.",
      hashtags: ["#saas", "#buildinpublic", "#fintech"],
      cta: "Join the v0.5 beta — link in bio.",
      status: "approved",
      agent_notes: "Carousel format saved best last launch (1.2% save rate).",
    },
    {
      draft_id: "draft-4",
      channels: ["x"],
      pillar: "opinion",
      hook: "Your side project needs one user who isn't you.",
      body: "Not auth. Not billing. Not a landing page. One real user. Everything else is procrastination with a commit history.",
      hashtags: ["#indiehackers"],
      cta: "",
      status: "needs_review",
      agent_notes: "Hot-take format; the last one did 512 likes.",
    },
    {
      draft_id: "draft-5",
      channels: ["x", "instagram"],
      pillar: "launch",
      // This one trips the gate: an unverifiable absolute claim + undisclosed promo.
      hook: "Kelly Money v0.5 is the #1 in the world, GUARANTEED to be 100% secure.",
      body: "Sponsored launch push: the best invoicing tool ever made, risk-free, guaranteed results. Sign up now.",
      hashtags: ["#ad"],
      cta: "Buy now.",
      status: "needs_review",
      agent_notes:
        "Draft flagged by social-qa — absolute claims and a disclosure gap. Needs a full rewrite before it can ship.",
    },
    {
      draft_id: "draft-6",
      channels: ["facebook"],
      pillar: "community",
      hook: "Office hours are back this Friday.",
      body: "4pm HKT, same link. Bring the gnarliest spreadsheet you've got and we'll untangle it live. Last week we found a $680 reconciliation bug on air.",
      hashtags: ["#officehours"],
      cta: "Drop your questions in the comments.",
      status: "done",
      review_note: "Approved and posted on the 27th cadence.",
      agent_notes: "Recurring community post.",
    },
  ];
  return raw.map((draft) => {
    const gate = evaluateGate(draft);
    // A gate BLOCK forces the review status to blocked regardless of intake.
    const status = gate.verdict === "BLOCK" ? "blocked" : draft.status;
    return {
      ...draft,
      status,
      gate,
      created_at: "2026-07-01T18:00:00.000Z",
      updated_at: "2026-07-02T08:15:00.000Z",
    };
  });
}

function demoShorts() {
  return [
    {
      short_id: "short-1",
      channels: ["instagram", "tiktok"],
      pillar: "behind-the-scenes",
      title: "Studio reset in 30 seconds",
      hook: "The desk where the dashboards get built.",
      status: "needs_review",
      duration_s: 30,
      caption: "Studio reset. Second monitor is logs-only and yes it sparks joy. 🌿",
      hashtags: ["#studio", "#buildinpublic"],
      shots: [
        shot(1, "Wide of the messy desk, timelapse start", "Every dashboard starts as a mess.", 5, "Before"),
        shot(2, "Hands clearing sticky notes", "Clear the surface, clear the head.", 6),
        shot(3, "Second monitor fills with scrolling logs", "This screen is logs only.", 7, "Logs only"),
        shot(4, "Clean desk, plant in frame", "And this is where it ships.", 6, "After"),
        shot(5, "Cut to laptop with the app open", "Kelly Social, running local.", 6),
      ],
      agent_notes: "Reuses the ig-914 studio-tour angle that hit 9.8k views.",
    },
    {
      short_id: "short-2",
      channels: ["tiktok", "youtube"],
      pillar: "teaching",
      title: "What a review queue actually is",
      hook: "38 emails, triaged in 4 minutes.",
      status: "changes_requested",
      duration_s: 45,
      caption: "The review-queue pattern, explained in under a minute.",
      hashtags: ["#productivity", "#ai"],
      review_note: "Slow shot 3 down — the payoff lands too fast to read.",
      shots: [
        shot(1, "Screen recording: inbox with 38 unread", "Here's an inbox with 38 things to decide.", 8),
        shot(2, "Cut to the app's needs-review queue", "Now here's the same work as a queue.", 10),
        shot(3, "Fast approvals, counter ticking down", "Approve, request changes, block. Four minutes.", 12, "4:02"),
        shot(4, "Talking head, plain background", "The human decides. The agent drafts.", 9),
        shot(5, "End card with app name", "That's the whole idea.", 6),
      ],
      agent_notes: "Repurposes the x-2049 screen recording that drove 58 clicks.",
    },
    {
      short_id: "short-3",
      channels: ["instagram"],
      pillar: "launch",
      title: "v0.5 invoice auto-match teaser",
      hook: "It matched the invoice before I finished my coffee.",
      status: "approved",
      duration_s: 20,
      caption: "Kelly Money v0.5 auto-match. Beta link in bio.",
      hashtags: ["#saas", "#fintech"],
      shots: [
        shot(1, "Coffee pour, laptop waking up", "Morning. One unmatched invoice.", 6),
        shot(2, "Cursor clicks auto-match, row snaps green", "One click.", 7, "Auto-match"),
        shot(3, "Audit trail expands", "And it logs why.", 7, "v0.5 beta"),
      ],
      agent_notes: "Short companion to the draft-3 launch carousel.",
    },
  ];
}

function demoEngagement() {
  return [
    eng(
      "eng-1",
      "x",
      "x-kelly",
      "comment",
      "@devtaro",
      "This zero-deps sparkline is exactly what I needed. Is the code open?",
      "2026-07-02T08:20:00.000Z",
      "positive",
      "high",
      "Thank you! It's a 14-line function — I'll drop the full snippet in a thread today. Watching this space. 🙏",
    ),
    eng(
      "eng-2",
      "x",
      "x-kelly",
      "mention",
      "@buildwithana",
      "Comparing @kellyships aggregator with FeedForge — anyone used both?",
      "2026-07-02T07:55:00.000Z",
      "question",
      "high",
      "Happy to answer anything specific! Kelly Social is local-first and reads your own accounts — no cloud middleman. What matters most for your workflow?",
    ),
    eng(
      "eng-3",
      "instagram",
      "ig-kelly",
      "comment",
      "@quietbuilder",
      "The studio tour made me want to reorganize my whole setup 😂",
      "2026-07-01T20:10:00.000Z",
      "positive",
      "normal",
      "Ha! The plant graveyard is doing a lot of emotional labor here. Post your reset when it's done. 🌿",
    ),
    eng(
      "eng-4",
      "facebook",
      "fb-kelly",
      "comment",
      "@ledger_liam",
      "Export from Meta broke again for me. Is your importer handling the new format?",
      "2026-07-01T18:40:00.000Z",
      "question",
      "normal",
      "Yes — the parser was updated for the July Meta export layout. If it still trips, DM me the header row (no data) and I'll patch it.",
    ),
    eng(
      "eng-5",
      "x",
      "x-kelly",
      "reply",
      "@saas_skeptic",
      "$4k MRR after 18 months isn't a business, it's a hobby.",
      "2026-07-01T16:05:00.000Z",
      "negative",
      "high",
      "Fair pushback — it's early and I share the numbers precisely so people can judge for themselves. Compounding is slow on purpose; I'd rather be honest than hyped.",
    ),
  ];
}

function demoCrisis() {
  return {
    status: "calm",
    publishing_paused: false,
    spokesperson: "Kelly (founder)",
    updated_at: "2026-07-02T08:00:00.000Z",
    steps: [
      crisisStep(
        "cr-1",
        "Triage the signal",
        "Confirm it's real: screenshot, source, and scope before reacting.",
        "Kelly",
        false,
      ),
      crisisStep(
        "cr-2",
        "Pause scheduled publishing",
        "Toggle publishing pause so nothing auto-posts into a live incident.",
        "Kelly",
        false,
      ),
      crisisStep(
        "cr-3",
        "Designate the spokesperson",
        "One voice responds. Everyone else routes questions to them.",
        "Kelly",
        true,
      ),
      crisisStep(
        "cr-4",
        "Draft the holding statement",
        "Acknowledge, don't speculate. 'We're aware and looking into it.'",
        "Agent drafts",
        false,
      ),
      crisisStep(
        "cr-5",
        "Log and review within 24h",
        "Capture timeline, response, and what changes next time.",
        "Kelly",
        false,
      ),
    ],
  };
}

function demoShareOfVoice() {
  const entries = [
    { name: "Kelly Ships (you)", is_self: true, mentions_7d: 214 },
    { name: "FeedForge", is_self: false, mentions_7d: 356 },
    { name: "PostPilot", is_self: false, mentions_7d: 142 },
  ];
  const total = entries.reduce((sum, entry) => sum + entry.mentions_7d, 0);
  return {
    window: "7d",
    total_mentions: total,
    entries: entries.map((entry) => ({ ...entry, share: Number((entry.mentions_7d / total).toFixed(4)) })),
  };
}

function cal(entry_id, date, channel, pillar, title, status, extra = {}) {
  return { entry_id, date, channel, pillar, title, status, ...extra };
}

function shot(shot_no, visual, voiceover, duration_s, on_screen_text = "") {
  return on_screen_text
    ? { shot_no, visual, voiceover, duration_s, on_screen_text }
    : { shot_no, visual, voiceover, duration_s };
}

function eng(
  item_id,
  platform,
  account_id,
  kind,
  author_handle,
  incoming_text,
  received_at,
  sentiment,
  priority,
  draft_reply,
) {
  return {
    item_id,
    platform,
    account_id,
    kind,
    author_handle,
    incoming_text,
    received_at,
    sentiment,
    priority,
    draft_reply,
    status: "needs_review",
  };
}

function crisisStep(step_id, label, detail, owner, done) {
  return { step_id, label, detail, owner, done };
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
