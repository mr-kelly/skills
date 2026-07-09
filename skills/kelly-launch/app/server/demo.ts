interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-06T09:30:00.000Z";
const targetDate = "2026-07-16";

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
    app: "kelly-launch",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-launch/config.json",
      is_example: false,
      product: {
        name: "Trailhead",
        tagline: "Onboarding checklists that write themselves from your docs",
        homepage: "https://trailhead.dev",
        category: "Developer tools",
      },
      launch: { target_date: targetDate, timezone: "Asia/Shanghai" },
      style_tone: "clear, confident, concrete",
      press_lists: [
        { list_id: "press_tier1", display_name: "Tier 1 press contacts" },
        { list_id: "newsletters", display_name: "Dev newsletter curators" },
      ],
      readiness_policy: { block_on: ["press", "product_hunt", "hacker_news"], min_ship_ratio: 0.8 },
      channels: [
        {
          channel_id: "product_hunt",
          type: "product_hunt",
          display_name: "Product Hunt",
          handoff_skill: "product-launch-video",
          secret_envs: ["KELLY_LAUNCH_PH_TOKEN"],
          secrets_ready: true,
        },
        {
          channel_id: "hacker_news",
          type: "hacker_news",
          display_name: "Hacker News (Show HN)",
          handoff_skill: "",
          secret_envs: [],
          secrets_ready: true,
        },
        {
          channel_id: "press",
          type: "press",
          display_name: "Press outreach",
          handoff_skill: "kelly-email",
          secret_envs: ["KELLY_LAUNCH_EMAIL_TOKEN"],
          secrets_ready: true,
        },
        {
          channel_id: "email",
          type: "email",
          display_name: "Launch email",
          handoff_skill: "kelly-email",
          secret_envs: ["KELLY_LAUNCH_EMAIL_TOKEN"],
          secrets_ready: true,
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
    updated_at: "2026-07-05T16:10:00.000Z",
    decisions: {
      "item-launch-email": {
        action: "approve",
        comment: "Approved. Schedule to the waitlist for 09:00 launch morning.",
        decided_at: "2026-07-05T16:08:00.000Z",
      },
      "item-ph-tagline": {
        action: "request_changes",
        comment: "Lead with the outcome (ships onboarding in a day), not the mechanism. Trim the third line.",
        decided_at: "2026-07-05T16:02:00.000Z",
      },
      "item-pricing-page": {
        action: "block",
        comment: "Do not publish pricing until the team plan is signed off by finance. Hold this hard.",
        decided_at: "2026-07-05T16:10:00.000Z",
      },
    },
  };
}

function demoAgentTasks() {
  return {
    updated_at: "2026-07-05T16:02:00.000Z",
    tasks: [
      {
        task_id: "task-item-ph-tagline-1783094520000",
        type: "revise_item",
        item_id: "item-ph-tagline",
        comment: "Lead with the outcome (ships onboarding in a day), not the mechanism. Trim the third line.",
        requested_at: "2026-07-05T16:02:00.000Z",
        status: "queued",
      },
    ],
  };
}

function demoExecutionReport() {
  return {
    executed_at: "2026-07-04T11:20:00.000Z",
    dry_run: false,
    source: "kelly-launch-demo",
    results: [
      {
        item_id: "item-waitlist-warm",
        ref: 15,
        status: "published",
        operation: "publish_asset",
        channel: "email",
        target: ".data/exports/waitlist-teaser.md",
        format: "markdown",
        reason: "Approved waitlist teaser exported for the pre-launch warm-up send.",
        executed_at: "2026-07-04T11:20:00.000Z",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const titles = {
    "item-icp-research": "确认目标用户画像与核心痛点",
    "item-competitor-scan": "扫描竞品定位与差异化角度",
    "item-messaging": "定稿一句话定位与核心信息",
    "item-press-kit": "组装新闻资料包（含截图与样板文案）",
    "item-demo-video": "录制 60 秒产品演示视频",
    "item-landing-copy": "改写落地页首屏文案",
    "item-pricing-page": "发布定价页",
    "item-ph-tagline": "撰写 Product Hunt 标语与首条评论",
    "item-ph-assets": "准备 Product Hunt 图集与缩略图",
    "item-hn-post": "撰写 Show HN 帖子",
    "item-press-pitch": "起草一线媒体推介邮件",
    "item-launch-email": "撰写面向候补名单的发布邮件",
    "item-waitlist-warm": "发送发布前预热邮件",
    "item-changelog": "发布更新日志与文档说明",
    "item-runbook": "确认发布日作战手册与值班安排",
    "item-support-macros": "准备客服快捷回复与常见问题",
  };
  snapshot.items = snapshot.items.map((item) => ({
    ...item,
    title: titles[item.item_id] || item.title,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "发布就绪度为 FIX：演示视频与新闻资料包仍在阻塞项中，发布前需先解决。",
    detail: "演示提醒，未读取真实数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario) {
  const channels = [
    channel("product_hunt", "product_hunt", "Product Hunt", "queued"),
    channel("hacker_news", "hacker_news", "Hacker News (Show HN)", "queued"),
    channel("press", "press", "Press outreach", "drafting"),
    channel("email", "email", "Launch email", "scheduled"),
    channel("changelog", "changelog", "Changelog + docs", "drafting"),
  ];

  const items = [
    // ---- Research ----
    item(
      "item-icp-research",
      1,
      "research",
      "Confirm target user profile and core pain",
      "Kelly",
      "",
      "SHIP",
      "no_action",
      "done",
      "ICP locked: platform/DevRel leads at 20–200-person SaaS teams who onboard new hires onto internal tooling. Core pain: onboarding docs rot and no one owns the checklist.",
      "",
      "Foundational research is complete and validated against 8 discovery calls.",
      "",
    ),
    item(
      "item-competitor-scan",
      2,
      "research",
      "Scan competitor positioning and wedge",
      "Kelly",
      "",
      "SHIP",
      "no_action",
      "done",
      "Notion/Confluence own docs; no one owns the living onboarding checklist generated from those docs. Wedge = auto-generated, self-updating checklists. Angle for press: 'the checklist that reads your docs'.",
      "",
      "Competitive wedge is clear and differentiated; feeds the messaging line.",
      "",
    ),
    item(
      "item-messaging",
      3,
      "research",
      "Finalize one-line positioning and message pillars",
      "Kelly",
      "",
      "SHIP",
      "publish_asset",
      "approved",
      "Headline: 'Onboarding checklists that write themselves from your docs.' Pillars: (1) generated from existing docs, (2) stays current automatically, (3) one owner, zero drift.",
      "",
      "Approved messaging; every launch asset should inherit this line and the three pillars.",
      "",
    ),
    // ---- Assemble ----
    item(
      "item-press-kit",
      4,
      "assemble",
      "Assemble press kit (screenshots + boilerplate + facts)",
      "Kelly",
      "press",
      "FIX",
      "publish_asset",
      "needs_review",
      "# Trailhead Press Kit\n\n**One-liner:** Trailhead turns your existing docs into onboarding checklists that stay current automatically.\n\n**Boilerplate:** Trailhead is a developer-tools startup founded in 2025. It generates living onboarding checklists from a team's own documentation, so new hires ramp faster and no one owns a stale wiki page.\n\n**Key facts:**\n- Founded 2025, remote-first, 4 people.\n- 40 design-partner teams during private beta.\n- Median time-to-first-commit for new hires dropped 38% in beta.\n\n**Assets:** logo (SVG/PNG), 4 product screenshots, founder headshots — all in the shared drive.\n\n**Contact:** press@trailhead.dev",
      "publish_asset",
      "Reporters expect a self-serve kit. Blocking readiness until the boilerplate and screenshots are final — two screenshots still show the old nav.",
      "markdown",
    ),
    item(
      "item-demo-video",
      5,
      "assemble",
      "Record 60-second product demo video",
      "Kelly",
      "",
      "BLOCK",
      "no_action",
      "blocked",
      "Storyboard drafted (doc → checklist in 3 clicks). Screen recording not captured yet; the demo environment still has placeholder data that leaks a partner's name.",
      "",
      "Hard blocker on readiness: the demo env must be scrubbed of partner data before we can record. Owner needs a clean seed dataset.",
      "",
    ),
    item(
      "item-landing-copy",
      6,
      "assemble",
      "Rewrite landing page hero + above-the-fold",
      "Kelly",
      "",
      "FIX",
      "publish_asset",
      "needs_review",
      "**Hero:** Onboarding checklists that write themselves from your docs.\n\n**Subhead:** Point Trailhead at your wiki. It builds a checklist every new hire actually follows — and keeps it current as your docs change.\n\n**Primary CTA:** Start free\n**Secondary CTA:** Watch the 60-second demo",
      "publish_asset",
      "Hero copy is ready for review, but the secondary CTA links to the demo video, which is still blocked. Approve the copy; wire the link once the video ships.",
      "markdown",
    ),
    item(
      "item-pricing-page",
      7,
      "assemble",
      "Publish pricing page",
      "Kelly",
      "",
      "FIX",
      "publish_asset",
      "blocked",
      "**Free:** 1 workspace, 3 checklists.\n**Team — $12/seat/mo:** unlimited checklists, doc sync, roles.\n**Enterprise:** SSO, audit log, priority support.",
      "publish_asset",
      "Pricing draft is written but finance has not signed off on the team tier; do not publish until they do.",
      "markdown",
    ),
    // ---- Mobilize ----
    item(
      "item-ph-tagline",
      8,
      "mobilize",
      "Write Product Hunt tagline + first comment",
      "Kelly",
      "product_hunt",
      "FIX",
      "submit_channel",
      "changes_requested",
      "**Tagline:** Trailhead — living onboarding checklists generated from your docs\n\n**First comment:** Hey Product Hunt! We built Trailhead because every team we joined had onboarding docs that were three reorgs out of date. Trailhead reads your existing wiki and turns it into a checklist new hires actually follow — and it updates itself when the docs change. Would love your feedback on where it breaks. 🙏",
      "submit_channel",
      "The maker asked to lead with the outcome, not the mechanism, and to trim the comment. Re-draft the tagline around 'ship onboarding in a day'.",
      "",
    ),
    item(
      "item-ph-assets",
      9,
      "mobilize",
      "Prepare Product Hunt gallery + thumbnail",
      "Kelly",
      "product_hunt",
      "FIX",
      "submit_channel",
      "needs_review",
      "Gallery plan: 1) hero GIF (doc → checklist), 2) generated-checklist screenshot, 3) doc-sync diagram, 4) pricing snapshot. Thumbnail: logo on the brand green. The hero GIF depends on the demo recording.",
      "submit_channel",
      "Gallery layout is set; the hero GIF is derived from the demo video, so this slips if the video stays blocked. Approve the layout so we can drop the GIF in last.",
      "",
    ),
    item(
      "item-hn-post",
      10,
      "mobilize",
      "Write Show HN post",
      "Kelly",
      "hacker_news",
      "SHIP",
      "submit_channel",
      "needs_review",
      "**Title:** Show HN: Trailhead – onboarding checklists generated from your existing docs\n\n**Body:** I kept joining teams whose onboarding wiki was months out of date, so I built Trailhead. You point it at your docs (Notion/Confluence/Markdown), it generates a checklist per role, and re-syncs when the source changes. It's built on a diffing pipeline over your doc tree; happy to go deep on how we keep it from hallucinating steps. Free tier, no login to try the demo. What would make this useful for your team?",
      "submit_channel",
      "Show HN copy is honest and technical — the tone HN rewards. Ready to review; submit the morning of launch, not scheduled.",
      "",
    ),
    item(
      "item-press-pitch",
      11,
      "mobilize",
      "Draft Tier-1 press pitch email",
      "Kelly",
      "press",
      "FIX",
      "send_pitch",
      "needs_review",
      "Subject: The onboarding wiki is dead — Trailhead makes it a living checklist\n\nHi {{first_name}},\n\nQuick pitch: most teams' onboarding docs are stale the day after they're written. Trailhead (launching July 16) reads a team's existing docs and turns them into a self-updating checklist new hires actually follow. In private beta, design partners cut new-hire time-to-first-commit by 38%.\n\nHappy to send the press kit or get you a founder briefing before launch. Embargo through July 16, 09:00 PT.\n\nBest,\nKelly",
      "send_pitch",
      "Solid pitch, but it cites the 38% beta stat — confirm that number is cleared for external use before we send to press_tier1.",
      "",
    ),
    item(
      "item-launch-email",
      12,
      "mobilize",
      "Write launch-day email to the waitlist",
      "Kelly",
      "email",
      "SHIP",
      "publish_asset",
      "approved",
      "Subject: Trailhead is live — turn your docs into onboarding checklists\n\nHi {{first_name}},\n\nToday's the day. Trailhead is live: point it at your docs and it builds an onboarding checklist your new hires actually follow, then keeps it current as the docs change.\n\nAs a waitlist member, your first workspace is free forever. Here's the 60-second demo and a one-click start.\n\nThank you for waiting — go build something.\n\nKelly",
      "publish_asset",
      "Approved and ready to schedule for 09:00 launch morning to the full waitlist.",
      "markdown",
    ),
    item(
      "item-waitlist-warm",
      15,
      "mobilize",
      "Send pre-launch warm-up teaser",
      "Kelly",
      "email",
      "SHIP",
      "publish_asset",
      "done",
      "Subject: Something's shipping July 16\n\nWe've been quiet — here's why. A 40-second teaser of what you'll get next week. Reply if you want early access.",
      "publish_asset",
      "Warm-up teaser was approved and exported to the waitlist on July 4.",
      "markdown",
    ),
    // ---- Prove ----
    item(
      "item-changelog",
      13,
      "prove",
      "Publish changelog entry + docs note",
      "Kelly",
      "changelog",
      "FIX",
      "publish_asset",
      "needs_review",
      "## Trailhead 1.0 — Public launch\n\nTrailhead is now generally available. Generate onboarding checklists from your docs, sync them automatically, and assign one owner per checklist. See the getting-started guide and the doc-sync reference.",
      "publish_asset",
      "Changelog copy is ready; it links the getting-started guide, which still has two TODO sections. Approve the copy, then finish the guide.",
      "markdown",
    ),
    item(
      "item-runbook",
      14,
      "prove",
      "Confirm launch-day runbook + on-call roster",
      "Kelly",
      "",
      "SHIP",
      "no_action",
      "approved",
      "Runbook drafted with an ordered timeline and a war-room note per step (see the Launch Day view). On-call: Kelly (comms), Dana (infra), Priya (support).",
      "",
      "Runbook and roster approved; this is the single source of truth for launch morning.",
      "",
    ),
    item(
      "item-support-macros",
      16,
      "prove",
      "Prepare support macros + launch FAQ",
      "Kelly",
      "",
      "FIX",
      "publish_asset",
      "needs_review",
      "Drafted 6 canned replies (pricing, doc-sync limits, security, SSO, data deletion, 'is my data trained on') and a public launch FAQ. Security macro needs the final SOC 2 wording.",
      "publish_asset",
      "Macros are drafted; the security answer must match the press-kit compliance wording exactly before we go live.",
      "markdown",
    ),
  ];

  const runbook = [
    runstep(
      "run-01",
      "T-60m",
      "08:00",
      "War room open, final go/no-go",
      "Kelly",
      "Confirm every readiness blocker is cleared. If demo video or press kit is still BLOCK/FIX, decide go/no-go now, not at 09:00.",
    ),
    runstep(
      "run-02",
      "T-30m",
      "08:30",
      "Publish landing page + pricing + changelog",
      "Dana",
      "Flip the landing hero, pricing page (only if finance signed off), and changelog live. Verify the demo link resolves.",
    ),
    runstep(
      "run-03",
      "T-0",
      "09:00",
      "Product Hunt goes live + first comment",
      "Kelly",
      "PH auto-publishes at 00:01 PT; post the maker's first comment immediately and pin it. Do NOT ask for upvotes in the comment.",
    ),
    runstep(
      "run-04",
      "T+5m",
      "09:05",
      "Submit Show HN post",
      "Kelly",
      "Submit Show HN by hand (never scheduled). One post only; engage in comments, don't defend — answer technical questions.",
    ),
    runstep(
      "run-05",
      "T+15m",
      "09:15",
      "Send launch email to waitlist",
      "Priya",
      "Fire the approved waitlist email. Watch bounce rate; if >3% pause and check the sending domain.",
    ),
    runstep(
      "run-06",
      "T+30m",
      "09:30",
      "Lift press embargo + send Tier-1 pitches",
      "Kelly",
      "Only after the 38% stat is cleared. Send press_tier1 with the kit link. Track opens; be ready for a same-day briefing.",
    ),
    runstep(
      "run-07",
      "T+3h",
      "12:00",
      "Midday pulse check",
      "Kelly",
      "Check PH rank, HN position, signup funnel, and support queue. Reassign hands to wherever the fire is.",
    ),
    runstep(
      "run-08",
      "T+8h",
      "17:00",
      "End-of-day recap + thank-yous",
      "Kelly",
      "Post a thank-you update on PH, reply to remaining HN threads, and log metrics for the retro.",
    ),
  ];

  const phaseCounts = countByPhase(items);
  const shipCounts = countByReadiness(items);
  const statusCounts = countByStatus(items);
  const blockers = items
    .filter((entry) => entry.readiness === "BLOCK" || (entry.readiness === "FIX" && entry.status === "blocked"))
    .map((entry) => ({ item_id: entry.item_id, ref: entry.ref, title: entry.title, phase: entry.phase }));
  const readinessVerdict = shipCounts.block ? "BLOCK" : blockers.length ? "FIX" : "SHIP";
  // LQS (Launch Quality Score): SHIP items count full, FIX items half, BLOCK items zero.
  const lqs = items.length ? Math.round(((shipCounts.ship + shipCounts.fix * 0.5) / items.length) * 100) : 0;

  const metrics = {
    item_count: items.length,
    needs_review: statusCounts.needs_review,
    approved: statusCounts.approved,
    done: statusCounts.done,
    blocked: statusCounts.blocked,
    ship: shipCounts.ship,
    fix: shipCounts.fix,
    block: shipCounts.block,
  };

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-launch-demo",
    product: {
      name: "Trailhead",
      tagline: "Onboarding checklists that write themselves from your docs",
      homepage: "https://trailhead.dev",
      category: "Developer tools",
    },
    launch: { target_date: targetDate, timezone: "Asia/Shanghai" },
    phases: ["research", "assemble", "mobilize", "prove"],
    readiness: {
      verdict: readinessVerdict,
      lqs,
      ship: shipCounts.ship,
      fix: shipCounts.fix,
      block: shipCounts.block,
      blockers,
    },
    metrics,
    phase_progress: phaseCounts,
    channels,
    items,
    runbook,
    warnings: ["assets", "overview", "checklist"].includes(scenario)
      ? [
          {
            id: "readiness-fix",
            severity: "warning",
            message:
              "Launch readiness is FIX: the demo video and press kit are still blocking; resolve them before launch.",
            detail: "Demo warning, no live data.",
          },
        ]
      : [],
  };
}

function countByPhase(items) {
  const phases = ["research", "assemble", "mobilize", "prove"];
  return phases.map((phase) => {
    const inPhase = items.filter((entry) => entry.phase === phase);
    const done = inPhase.filter((entry) => entry.status === "done").length;
    return { phase, total: inPhase.length, done };
  });
}

function countByReadiness(items) {
  return {
    ship: items.filter((entry) => entry.readiness === "SHIP").length,
    fix: items.filter((entry) => entry.readiness === "FIX").length,
    block: items.filter((entry) => entry.readiness === "BLOCK").length,
  };
}

function countByStatus(items) {
  return {
    needs_review: items.filter((entry) => entry.status === "needs_review").length,
    changes_requested: items.filter((entry) => entry.status === "changes_requested").length,
    approved: items.filter((entry) => entry.status === "approved").length,
    done: items.filter((entry) => entry.status === "done").length,
    blocked: items.filter((entry) => entry.status === "blocked").length,
  };
}

function channel(channel_id, type, display_name, submission_status) {
  return { channel_id, type, display_name, submission_status };
}

function item(
  item_id,
  ref,
  phase,
  title,
  owner,
  channel_id,
  readiness,
  proposed_action,
  status,
  draft,
  suggested_reply,
  reason,
  format,
) {
  return {
    item_id,
    ref,
    phase,
    title,
    owner,
    channel_id,
    readiness,
    proposed_action,
    status,
    draft,
    // suggested_reply reuses the drafted submission/pitch text for review-first items.
    suggested_reply: suggested_reply || draft,
    reason,
    format,
    risk: deriveRisk(channel_id, proposed_action),
    created_at: now,
  };
}

function deriveRisk(channel_id, proposed_action) {
  const risk: string[] = [];
  if (["product_hunt", "hacker_news", "press"].includes(channel_id)) risk.push("public");
  if (proposed_action === "send_pitch") risk.push("outreach");
  if (channel_id === "press") risk.push("press");
  return risk;
}

function runstep(step_id, offset, at, title, owner, note) {
  return { step_id, offset, at, title, owner, note };
}
