// Deterministic demo scenes for documentation and screenshots.
// Demo mode never reads or writes app/.data or private config.

import { recomputeDerived } from "./store.ts";
import type { DemoQuery } from "./types.ts";

const NOW = "2026-07-03T02:30:00.000Z"; // 10:30 team time (Asia/Shanghai)
const TODAY = "2026-07-03";

export function isDemoQuery(query: DemoQuery = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "today");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = buildDemoSnapshot(zh, scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-standup",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-standup/config.json",
      is_example: false,
      team: { name: snapshot.team.name, timezone: snapshot.team.timezone, workdays: snapshot.team.workdays },
      members: snapshot.members.map((member) => ({
        member_id: member.member_id,
        name: member.name,
        role: member.role,
        timezone: member.timezone,
        channel: member.channel,
        active: true,
        contact_env: `KELLY_STANDUP_MEMBER_${member.member_id.toUpperCase()}_CONTACT`,
        contact_ready: true,
      })),
      standup_questions: zh
        ? ["昨天完成了什么？", "今天计划做什么？", "有什么阻塞吗？"]
        : ["What did you finish yesterday?", "What will you do today?", "Anything blocking you?"],
      digest_style: "concise",
    },
    agent_tasks: { updated_at: NOW, tasks: [] },
    execution_report: null,
    snapshot,
  };
}

export function buildDemoSnapshot(zh = false, scenario = "today") {
  const L = (en, cn) => (zh ? cn : en);

  const members = [
    member("maya", L("Maya Chen", "林晓"), L("Founder · PM", "创始人 · 产品"), "Asia/Shanghai", "slack"),
    member("alex", L("Alex Rivera", "陈嘉"), L("Engineer", "工程师"), "Asia/Shanghai", "slack"),
    member("sam", L("Sam Park", "王皓"), L("Engineer", "工程师"), "Asia/Seoul", "discord"),
    member("priya", L("Priya Nair", "郑楠"), L("Engineer", "工程师"), "Asia/Kolkata", "slack"),
    member("jonah", L("Jonah Lee", "顾一凡"), L("Designer", "设计师"), "Asia/Shanghai", "doc"),
    member("tessa", L("Tessa Wong", "苏蔓"), L("Growth", "增长"), "Asia/Hong_Kong", "slack"),
    member("marco", L("Marco Silva", "马晨"), L("Support", "用户支持"), "Europe/Lisbon", "whatsapp"),
    member("ingrid", L("Ingrid Berg", "白洁"), L("Ops", "运营"), "Europe/Stockholm", "wecom"),
  ];

  const work = {
    maya: [
      L("Investor update draft", "投资人月报草稿"),
      L("Churned-team interviews", "流失团队回访"),
      L("Pricing decision for annual plans", "年付方案定价决策"),
      L("Roadmap grooming with the team", "和团队梳理路线图"),
    ],
    alex: [
      L("Billing page checkout flow", "计费页结账流程"),
      L("Payment webhook retries", "支付 webhook 重试"),
      L("Code review for usage metering", "用量计费代码评审"),
      L("Stripe sandbox integration tests", "Stripe 沙箱集成测试"),
    ],
    sam: [
      L("Signup e2e stability", "注册 e2e 稳定性排查"),
      L("Audit-log export endpoint", "审计日志导出接口"),
      L("CI pipeline speedup", "CI 流水线提速"),
      L("Webhook retry backoff fix", "webhook 重试退避修复"),
    ],
    priya: [
      L("Usage metering PR", "用量计费 PR"),
      L("Staging migration cleanup", "staging 迁移清理"),
      L("Billing edge-case pairing with Alex", "和陈嘉结对处理计费边界场景"),
      L("Rate limiter for the public API", "公开 API 限流器"),
    ],
    jonah: [
      L("Billing page empty states", "计费页空状态设计"),
      L("Onboarding design review", "注册流程设计评审"),
      L("Settings redesign exploration", "设置页改版探索"),
      L("Mobile nav spec", "移动端导航规范"),
    ],
    tessa: [
      L("Launch-week content calendar", "发布周内容排期"),
      L("Referral experiment analysis", "推荐机制实验分析"),
      L("Landing page A/B test", "落地页 A/B 测试"),
      L("Newsletter for the billing launch", "计费上线通讯稿"),
    ],
    marco: [
      L("App Store review replies", "App Store 评论回复"),
      L("Refund-policy macro", "退款政策快捷回复模板"),
      L("Billing bug repros for Alex", "给陈嘉整理计费 bug 复现步骤"),
      L("Help-center article refresh", "帮助中心文章更新"),
    ],
    ingrid: [
      L("Contractor invoices and payroll", "外包发票与工资单"),
      L("Offsite logistics", "团建后勤安排"),
      L("Vendor security questionnaire", "供应商安全问卷"),
      L("Expense policy update", "报销制度更新"),
    ],
  };

  const blockers = [
    blocker(
      "bl-alex-stripe",
      "alex",
      "2026-07-01",
      "high",
      "open",
      L(
        "Waiting on Stripe production API keys from vendor onboarding",
        "等待 Stripe 生产环境 API 密钥（供应商开通流程中）",
      ),
      L(
        "Maya to escalate with the Stripe account rep today — the keys gate the billing launch.",
        "建议林晓今天向 Stripe 客户经理催办——密钥卡住计费功能上线。",
      ),
    ),
    blocker(
      "bl-sam-e2e",
      "sam",
      "2026-07-02",
      "medium",
      "open",
      L("Flaky signup e2e blocks the release train", "注册 e2e 用例抖动卡住发布列车"),
      L(
        "Merge the race-condition fix and re-enable the suite; hold the release until CI is green.",
        "合入竞态修复并重新启用用例集；CI 变绿前先冻结发布。",
      ),
    ),
    blocker(
      "bl-marco-backlog",
      "marco",
      "2026-06-30",
      "medium",
      "open",
      L("App Store review reply backlog is above the 48h SLA", "App Store 评论回复积压超过 48 小时 SLA"),
      L(
        "Approve the reply macro so Marco can batch the top 20 reviews this afternoon.",
        "尽快批准回复模板，让马晨下午批量处理前 20 条评论。",
      ),
    ),
    blocker(
      "bl-jonah-review",
      "jonah",
      "2026-06-29",
      "low",
      "resolved",
      L("Onboarding design review waiting on PM sign-off", "注册流程设计评审等待产品签核"),
      L("Resolved after Thursday's design review — sign-off recorded.", "周四设计评审后已解决——签核已记录。"),
      "2026-07-02",
    ),
  ];

  const dayDates = [
    "2026-06-19",
    "2026-06-22",
    "2026-06-23",
    "2026-06-24",
    "2026-06-25",
    "2026-06-26",
    "2026-06-29",
    "2026-06-30",
    "2026-07-01",
    "2026-07-02",
  ];

  const digests = [
    L(
      "Sprint 14 kickoff: billing page scoped and the usage metering spec agreed.",
      "第 14 个迭代启动：计费页范围确定，用量计费方案达成一致。",
    ),
    L(
      "Onboarding funnel up 4%; two churned-team interviews booked for next week.",
      "注册转化提升 4%；约到两个流失团队下周回访。",
    ),
    L(
      "Checkout flow first cut landed behind the flag; support backlog creeping up.",
      "结账流程初版已在功能开关后合入；支持工单积压开始上升。",
    ),
    L(
      "Design review prep day; a bad migration blocked staging deploys until noon.",
      "设计评审准备日；一个坏迁移把 staging 部署堵到中午。",
    ),
    L(
      "Usage metering PR opened; App Store replies slipped past the SLA.",
      "用量计费 PR 提交评审；App Store 回复超出 SLA。",
    ),
    L(
      "Onboarding design review held — two blockers cleared, one sign-off pending.",
      "完成注册流程设计评审——清掉两个阻塞，剩一个待签核。",
    ),
    L(
      "Quiet Monday: webhook retries fixed, pricing decision moved to Tuesday.",
      "平静的周一：webhook 重试修复，定价决策移到周二。",
    ),
    L("Annual pricing decided; Stripe production access requested.", "年付定价敲定；已申请 Stripe 生产环境权限。"),
    L(
      "Stripe keys still pending — flagged as a high blocker; billing page copy finalized.",
      "Stripe 密钥仍未下发——升级为高优先阻塞；计费页文案定稿。",
    ),
    L(
      "Flaky signup e2e caught blocking the release train; fix identified.",
      "发现注册 e2e 抖动卡住发布列车；修复方案已定位。",
    ),
  ];

  const missingByDate = { "2026-06-23": ["tessa"], "2026-06-26": ["marco"], "2026-07-01": ["sam"] };
  const onLeaveByDate = { "2026-07-02": ["ingrid"] };
  const moods = ["good", "ok", "good"];
  const blockersByDate = new Map();
  for (const item of blockers) {
    if (!blockersByDate.has(item.raised_date)) blockersByDate.set(item.raised_date, []);
    blockersByDate.get(item.raised_date).push(item);
  }

  const days = dayDates.map((date, dayIndex) => {
    const missing = new Set(missingByDate[date] || []);
    const onLeave = onLeaveByDate[date] || [];
    const updates = members
      .filter((entry) => !missing.has(entry.member_id) && !onLeave.includes(entry.member_id))
      .map((entry, memberIndex) => {
        const pool = work[entry.member_id];
        const raised = (blockersByDate.get(date) || []).filter((item) => item.member_id === entry.member_id);
        const resolvedHere = blockers.filter(
          (item) => item.member_id === entry.member_id && item.resolved_date === date,
        );
        return update(entry.member_id, date, minutesAfterStart(memberIndex * 11 + dayIndex * 3), entry.channel, {
          yesterday: [pool[dayIndex % 4], pool[(dayIndex + 2) % 4]],
          today: [pool[(dayIndex + 1) % 4]],
          blockers: [
            ...raised.map((item) => updateBlocker(item, "open")),
            ...resolvedHere.map((item) => updateBlocker(item, "resolved")),
          ],
          mood: moods[(memberIndex + dayIndex) % 3],
          raw: "",
        });
      });
    return {
      date,
      digest: digests[dayIndex],
      on_leave: onLeave,
      updates,
      participation: { submitted: 0, expected: 0, on_leave: 0 },
    };
  });

  const openBlocker = (id) =>
    updateBlocker(
      blockers.find((item) => item.blocker_id === id),
      "open",
    );

  const todayUpdates = [
    update("maya", TODAY, "00:42", "slack", {
      yesterday: [
        L("Reviewed the billing page copy with Jonah", "和顾一凡过了一遍计费页文案"),
        L("Closed the pricing decision for annual plans", "敲定了年付方案的定价决策"),
        L("1:1 with Marco about the review backlog", "和马晨 1:1 讨论评论积压"),
      ],
      today: [
        L("Draft the July investor update", "起草七月投资人月报"),
        L("Chase Stripe support about the production API keys", "向 Stripe 支持催办生产环境密钥"),
        L("Interview two churned teams about billing", "回访两个因计费流失的团队"),
      ],
      blockers: [],
      mood: "good",
      raw: L(
        "yday: billing copy review w/ Jonah, pricing closed. today: investor update, chase stripe keys, churn interviews.",
        "昨天：和一凡过计费文案、定价敲定。今天：投资人月报、催 Stripe 密钥、流失回访。",
      ),
    }),
    update("alex", TODAY, "00:51", "slack", {
      yesterday: [
        L("Finished the billing page checkout flow behind the feature flag", "在功能开关后完成计费页结账流程"),
        L("Paired with Sam on the payment webhook retries", "和王皓结对处理支付 webhook 重试"),
      ],
      today: [
        L("Wire the billing page to live Stripe once the keys arrive", "密钥一到就把计费页接入正式 Stripe"),
        L("Review Priya's usage metering PR", "评审郑楠的用量计费 PR"),
      ],
      blockers: [openBlocker("bl-alex-stripe")],
      mood: "ok",
      raw: L(
        "checkout flow done behind flag. still blocked on stripe prod keys (day 3).",
        "结账流程已在开关后完成。仍被 Stripe 生产密钥卡住（第 3 天）。",
      ),
    }),
    update("sam", TODAY, "01:05", "discord", {
      yesterday: [
        L("Tracked the flaky signup e2e to a race in the email stub", "把注册 e2e 抖动定位到邮件桩代码里的竞态"),
        L("Fixed the webhook retry backoff", "修复 webhook 重试退避"),
      ],
      today: [
        L("Land the e2e fix and re-enable the suite in CI", "合入 e2e 修复并在 CI 重新启用用例集"),
        L("Start the audit-log export endpoint", "开始做审计日志导出接口"),
      ],
      blockers: [openBlocker("bl-sam-e2e")],
      mood: "ok",
      raw: L(
        "found the race in email stub. fix up today, suite back on in CI.",
        "找到邮件桩里的竞态。今天提修复，CI 重新跑起来。",
      ),
    }),
    update("priya", TODAY, "01:14", "slack", {
      yesterday: [
        L("Opened the usage metering PR for review", "提交用量计费 PR 等待评审"),
        L("Cleaned up the migration that was blocking staging deploys", "清理了卡住 staging 部署的迁移"),
      ],
      today: [
        L("Address review comments on usage metering", "处理用量计费 PR 的评审意见"),
        L("Pair with Alex on billing edge cases", "和陈嘉结对处理计费边界场景"),
      ],
      blockers: [],
      mood: "good",
      raw: L(
        "metering PR is up; staging unblocked. pairing with alex pm.",
        "计费 PR 已提交；staging 已解堵。下午和陈嘉结对。",
      ),
    }),
    update("jonah", TODAY, "01:26", "doc", {
      yesterday: [
        L("Final pass on the billing page empty states", "计费页空状态最后一轮打磨"),
        L("Got the onboarding design review signed off", "注册流程设计评审拿到签核"),
      ],
      today: [
        L("Hand off the billing page specs to Alex", "把计费页设计标注交付给陈嘉"),
        L("Explore mobile nav for the settings redesign", "探索设置页改版的移动端导航"),
      ],
      blockers: [
        updateBlocker(
          blockers.find((item) => item.blocker_id === "bl-jonah-review"),
          "resolved",
        ),
      ],
      mood: "good",
      raw: L(
        "empty states done, review signed off yesterday. specs to alex today.",
        "空状态完成，评审昨天签核。今天把标注给陈嘉。",
      ),
    }),
    update("marco", TODAY, "01:48", "whatsapp", {
      yesterday: [
        L("Cleared 14 of 32 App Store reviews awaiting replies", "处理了 32 条待回复 App Store 评论中的 14 条"),
        L("Wrote a macro for the refund-policy question", "写好退款政策问题的快捷回复模板"),
      ],
      today: [
        L("Keep working through the App Store review backlog", "继续消化 App Store 评论积压"),
        L("Escalate two billing bugs to Alex with repro steps", "把两个计费 bug 连同复现步骤升级给陈嘉"),
      ],
      blockers: [openBlocker("bl-marco-backlog")],
      mood: "stuck",
      raw: L(
        "14/32 reviews done. backlog still above SLA — need the macro approved.",
        "回复 14/32。积压仍超 SLA——需要尽快批准模板。",
      ),
    }),
  ];

  days.push({
    date: TODAY,
    digest: L(
      "Billing is the center of gravity today: Alex finished the checkout flow and is only waiting on Stripe production keys, which Maya is escalating with the account rep. Sam's fix for the flaky signup e2e should unblock the release train this afternoon, and Priya's usage metering PR is in review. Jonah handed off the billing page specs after yesterday's design sign-off. Marco is working down the App Store reply backlog — still above SLA, so the reply macro needs a decision today. Ingrid is on leave; Tessa hasn't checked in yet and a nudge is drafted for review. 6/8 submitted.",
      "今天的重心仍在计费上线：陈嘉完成了结账流程，只差 Stripe 生产环境密钥，林晓正在向客户经理催办。王皓对注册 e2e 抖动的修复预计下午合入，发布列车即可解锁；郑楠的用量计费 PR 正在评审。顾一凡在昨天设计评审签核后交付了计费页标注。马晨在消化 App Store 评论回复积压——仍超出 SLA，回复模板需要今天拍板。白洁休假中；苏蔓尚未提交日报，提醒草稿已生成待审批。今日提交 6/8。",
    ),
    on_leave: ["ingrid"],
    updates: todayUpdates,
    participation: { submitted: 0, expected: 0, on_leave: 0 },
  });

  const reminders = [
    {
      id: "rem-20260703-tessa",
      ref: 1,
      type: "missing_checkin",
      member_id: "tessa",
      channel: "slack",
      title: L("Nudge Tessa for today's check-in", "提醒苏蔓提交今天的日报"),
      reason: L(
        "No check-in by 10:30 team time; last submitted yesterday. Everyone else is in.",
        "团队时间 10:30 仍未提交；上次提交是昨天。其他人都已提交。",
      ),
      draft: L(
        "Hi Tessa — no rush, just a nudge: could you drop your standup in #daily-standup when you get a moment? Yesterday / today / blockers is plenty. 🙌",
        "苏蔓，不着急，小小提醒一下：方便的时候在 #daily-standup 里补一条日报哈～写清楚「昨天 / 今天 / 阻塞」就够了 🙌",
      ),
      status: "needs_review",
      created_at: NOW,
      decision: null,
      execution: null,
    },
    {
      id: "rem-20260703-maya-stripe",
      ref: 2,
      type: "blocker_escalation",
      member_id: "maya",
      channel: "email",
      title: L("Escalate the Stripe production keys blocker", "升级 Stripe 生产密钥阻塞"),
      reason: L(
        "Alex has been blocked for 3 days on a high-severity item that gates the billing launch.",
        "陈嘉被这个高优先阻塞卡了 3 天，直接影响计费功能上线。",
      ),
      draft: L(
        "Heads up: Alex is still blocked on the Stripe production API keys (raised Jul 1, high severity). Could you ping the Stripe account rep today so the billing page can ship this week?",
        "同步一下：陈嘉仍被 Stripe 生产环境 API 密钥卡住（7 月 1 日提出，高优先级）。能否今天联系 Stripe 客户经理催一下，保证计费页本周上线？",
      ),
      status: "approved",
      created_at: "2026-07-03T02:05:00.000Z",
      decision: {
        action: "approve",
        note: L("Send before noon; cc me on the rep thread.", "中午前发出；跟客户经理的邮件抄送我。"),
        draft: null,
        decided_at: "2026-07-03T02:20:00.000Z",
      },
      execution: null,
    },
    {
      id: "rem-20260702-marco",
      ref: 3,
      type: "missing_checkin",
      member_id: "marco",
      channel: "whatsapp",
      title: L("Nudge Marco for yesterday's check-in", "提醒马晨补交昨天的日报"),
      reason: L(
        "Missed the Jul 1 check-in while heads-down on the review backlog.",
        "7 月 1 日忙于处理评论积压，漏交了日报。",
      ),
      draft: L(
        "Hey Marco, quick nudge — your Wednesday standup is missing. A two-line catch-up in the thread is fine!",
        "马晨，小提醒——周三的日报还没交，在群里补两行就行！",
      ),
      status: "done",
      created_at: "2026-07-02T02:10:00.000Z",
      decision: {
        action: "approve",
        note: "",
        draft: null,
        decided_at: "2026-07-02T02:30:00.000Z",
      },
      execution: {
        status: "executed",
        operations: [
          {
            operation: "send_reminder",
            channel: "whatsapp",
            target: "marco",
            contact_env: "KELLY_STANDUP_MEMBER_MARCO_CONTACT",
            contact_ready: true,
            message_draft: L(
              "Hey Marco, quick nudge — your Wednesday standup is missing.",
              "马晨，小提醒——周三的日报还没交。",
            ),
          },
        ],
        detail: L(
          "Sent via kelly-messenger after approval; Marco checked in 20 minutes later.",
          "审批后经 kelly-messenger 发送；马晨 20 分钟后补交了日报。",
        ),
        executed_at: "2026-07-02T03:05:00.000Z",
      },
    },
  ];

  const snapshot = {
    schema_version: "1",
    generated_at: NOW,
    source: "kelly-standup-demo",
    team: {
      name: L("Nimbus team", "Nimbus 团队"),
      timezone: "Asia/Shanghai",
      workdays: ["mon", "tue", "wed", "thu", "fri"],
    },
    today: TODAY,
    members,
    days,
    blockers,
    reminders,
    metrics: {},
    sync_log: [
      {
        at: "2026-07-02T02:12:00.000Z",
        source: "slack",
        action: "ingest",
        detail: L(
          "Ingested 7 updates for 2026-07-02 from the #daily-standup export.",
          "从 #daily-standup 导出中收录 2026-07-02 的 7 条日报。",
        ),
        count: 7,
      },
      {
        at: NOW,
        source: "slack",
        action: "ingest",
        detail: L(
          "Ingested 6 updates for 2026-07-03; Tessa missing, Ingrid on leave; 1 reminder drafted.",
          "收录 2026-07-03 的 6 条日报；苏蔓未提交，白洁休假；已起草 1 条提醒。",
        ),
        count: 6,
      },
    ],
    warnings: [],
  };
  void scenario;
  return recomputeDerived(snapshot);
}

function member(member_id, name, role, timezone, channel) {
  return {
    member_id,
    name,
    role,
    timezone,
    channel,
    active: true,
    streak: 0,
    participation_30d: 0,
    open_blockers: 0,
    last_submitted_date: "",
    notes: "",
  };
}

function update(member_id, date, hhmm, source, { yesterday, today, blockers, mood, raw }) {
  return {
    member_id,
    yesterday,
    today,
    blockers,
    mood,
    submitted_at: `${date}T${hhmm}:00.000Z`,
    source,
    raw_excerpt: raw || "",
  };
}

function updateBlocker(item, status) {
  return { blocker_id: item.blocker_id, text: item.text, severity: item.severity, status };
}

function blocker(blocker_id, member_id, raised_date, severity, status, text, suggested_action, resolved_date = "") {
  return { blocker_id, member_id, raised_date, severity, status, text, suggested_action, resolved_date };
}

function minutesAfterStart(minutes) {
  const total = 40 + minutes; // start at 00:40Z = 08:40 team time
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
