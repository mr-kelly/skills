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
    app: "kelly-creators",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-creators/config.json",
      is_example: false,
      operator: {
        name: "Kelly Chan",
        role: "Creator Marketing Lead",
        company: "Aurelia Skincare",
        timezone: "Asia/Shanghai",
      },
      program: {
        base_currency: "USD",
        budget_total: 50000,
        target_niches: ["beauty", "fitness", "tech", "lifestyle", "food"],
      },
      brands: [
        {
          brand_id: "aurelia",
          display_name: "Aurelia Skincare",
          positioning: "Dermatologist-backed barrier repair for sensitive skin.",
        },
      ],
      style_tone: "friendly, specific, on-brand",
      platforms: [
        {
          platform_id: "instagram",
          type: "instagram",
          display_name: "Instagram",
          handoff_skill: "instagram-outreach",
          secret_envs: ["KELLY_CREATORS_INSTAGRAM_TOKEN_DEMO"],
          secrets_ready: true,
        },
        {
          platform_id: "tiktok",
          type: "tiktok",
          display_name: "TikTok",
          handoff_skill: "tiktok-outreach",
          secret_envs: ["KELLY_CREATORS_TIKTOK_TOKEN_DEMO"],
          secrets_ready: true,
        },
        {
          platform_id: "email",
          type: "email",
          display_name: "Outreach Email",
          handoff_skill: "kelly-email",
          secret_envs: ["KELLY_CREATORS_EMAIL_TOKEN_DEMO"],
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
    updated_at: "2026-07-01T15:40:00.000Z",
    decisions: {
      "cr-lena-glow": {
        action: "approve",
        comment: "Great fit and the draft nails our barrier-repair angle. Send it.",
        decided_at: "2026-07-01T15:38:00.000Z",
      },
      "cr-mateo-derm": {
        action: "request_changes",
        comment: "Lead with the ceramide clinical result, not the discount. He cares about efficacy, not coupons.",
        decided_at: "2026-07-01T15:32:00.000Z",
      },
      "cr-priya-ritual": {
        action: "block",
        comment: "Her rate is 3x our per-post ceiling and she wants exclusivity. Pass for this quarter.",
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
        task_id: "task-cr-mateo-derm-1783093920000",
        type: "revise_outreach",
        creator_id: "cr-mateo-derm",
        comment: "Lead with the ceramide clinical result, not the discount. He cares about efficacy, not coupons.",
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
    source: "kelly-creators-demo",
    results: [
      {
        creator_id: "cr-jade-routine",
        ref: 11,
        status: "handed_off",
        operation: "send_brief",
        format: "pdf",
        channel: "email",
        target: "jade.routines@creators.example",
        reason: "Approved campaign brief after Jade countersigned the flat-fee agreement.",
        executed_at: "2026-06-27T10:05:00.000Z",
      },
    ],
  };
}

function localizeSnapshotZh(snapshot) {
  const reasons = {
    "cr-lena-glow": "美妆护肤垂类，受众与敏感肌人群高度重合，互动率 6.2%，报价在单条预算内。",
    "cr-mateo-derm": "皮肤科医生型创作者，可信度极高，但草稿过于强调折扣，需要改为强调神经酰胺功效。",
    "cr-suki-tiktok": "TikTok 短视频爆发力强，30 秒护肤流程内容与产品卖点契合，适合首波种草。",
    "cr-noor-clean": "清洁美妆垂类，粉丝忠诚度高，愿意做长期合作，报价合理。",
    "cr-jade-routine": "已签订固定费用合同，正式创意 brief 已交接给邮件技能发送。",
    "cr-priya-ritual": "头部达人，触达大但报价是我们单条上限的三倍且要求独家，本季度搁置。",
    "cr-ryan-tech": "科技垂类，受众与我们目标人群重合度低，除非做男士线否则暂不匹配。",
    "cr-mai-food": "美食垂类，粉丝画像偏离护肤受众，作为储备候选，暂不外联。",
    "cr-hana-wellness": "身心健康垂类，与屏障修复叙事契合，等待其报价卡再评估。",
    "cr-owen-fitness": "健身垂类，运动后护肤角度有潜力，需先确认其带货转化数据。",
    "cr-bella-lux": "轻奢生活方式，视觉质感高，但合作需签订使用权与独家条款，需人工确认。",
    "cr-theo-review": "测评型创作者，客观口碑强，报价含使用权买断，涉及合同需审批。",
    "cr-yuki-asmr": "ASMR 助眠护肤内容小众但转化高，报价低，适合试水。",
    "cr-cara-mom": "母婴护肤垂类，受众信任度高，适合敏感肌产品，正在起草外联。",
    "cr-jade-gate":
      "Jade 首条 reel 的发布前质检：#ad 披露被折叠在“更多”下方，且有一句“临床证明可治愈湿疹”属未经证实的宣称。建议修改后再发布（FIX）。",
  };
  snapshot.creators = snapshot.creators.map((creator) => ({
    ...creator,
    reason: reasons[creator.creator_id] || creator.reason,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "部分创作者的合作涉及报价、使用权或独家条款，发送前需人工确认。",
    detail: "演示提醒，未读取真实数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario) {
  const creators = [
    creator({
      creator_id: "cr-lena-glow",
      ref: 1,
      handle: "@lena.glowlab",
      name: "Lena Ortiz",
      platform: "instagram",
      niche: "beauty",
      followers: 184000,
      engagement_rate: 0.062,
      fit_score: 92,
      fit_breakdown: { content: 95, community: 90, credibility: 88, audience: 96, cost: 90, engagement: 93 },
      stage: "outreach",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 1800,
      risk: [],
      channel: "instagram_dm",
      reason:
        "Beauty/skincare vertical with strong sensitive-skin audience overlap, 6.2% engagement, and a rate inside our per-post ceiling.",
      audience_note: "78% women 24-40, US + UK, high skincare intent.",
      suggested_reply:
        "Hi Lena! Your barrier-repair routine reels are exactly the kind of honest, science-first content we love. I'm with Aurelia Skincare — dermatologist-backed ceramide care for sensitive skin. We'd love to send you our Barrier Repair set and explore a paid collab (1-2 reels). Would a quick call this week work? — Kelly",
      est_value: 5200,
      spend: 0,
    }),
    creator({
      creator_id: "cr-mateo-derm",
      ref: 2,
      handle: "@dr.mateo.skin",
      name: "Dr. Mateo Rivas",
      platform: "instagram",
      niche: "beauty",
      followers: 96000,
      engagement_rate: 0.081,
      fit_score: 89,
      fit_breakdown: { content: 90, community: 85, credibility: 98, audience: 88, cost: 82, engagement: 91 },
      stage: "outreach",
      status: "changes_requested",
      proposed_action: "send_outreach",
      est_rate: 2400,
      risk: ["money"],
      channel: "email",
      reason:
        "Board-certified dermatologist — very high credibility. First draft over-indexed on the discount; revise to lead with the ceramide clinical result.",
      audience_note: "Clinician-trusting audience; values efficacy claims over promo codes.",
      suggested_reply:
        "Hi Dr. Rivas — our ceramide-3 complex showed a 41% improvement in TEWL barrier function in an 8-week study. As a dermatologist your audience trusts, we'd value your independent take. We can share the full data and provide product for an honest review. Open to a paid partnership. — Kelly, Aurelia Skincare",
      est_value: 4100,
      spend: 0,
    }),
    creator({
      creator_id: "cr-suki-tiktok",
      ref: 3,
      handle: "@sukiskindiary",
      name: "Suki Tan",
      platform: "tiktok",
      niche: "beauty",
      followers: 312000,
      engagement_rate: 0.094,
      fit_score: 87,
      fit_breakdown: { content: 92, community: 88, credibility: 80, audience: 85, cost: 84, engagement: 95 },
      stage: "outreach",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 2100,
      risk: [],
      channel: "tiktok_dm",
      reason:
        "High-velocity TikTok skincare creator; her 30-second routine format maps cleanly to our hero-product seeding.",
      audience_note: "Gen-Z + young millennial, strong save/share rate on routine videos.",
      suggested_reply:
        "hi Suki! obsessed with your 30-sec routine format 🙌 Aurelia Skincare here — we make derm-backed barrier repair for sensitive skin. would love to gift our set + set up a paid TikTok collab if it fits your calendar. can I send details? — Kelly",
      est_value: 6800,
      spend: 0,
    }),
    creator({
      creator_id: "cr-noor-clean",
      ref: 4,
      handle: "@noor.cleanbeauty",
      name: "Noor Haddad",
      platform: "instagram",
      niche: "beauty",
      followers: 64000,
      engagement_rate: 0.071,
      fit_score: 84,
      fit_breakdown: { content: 86, community: 90, credibility: 82, audience: 84, cost: 88, engagement: 80 },
      stage: "outreach",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 950,
      risk: [],
      channel: "instagram_dm",
      reason:
        "Clean-beauty niche with a loyal, high-trust following open to long-term partnerships at a reasonable rate.",
      audience_note: "Ingredient-conscious, repeat-purchase audience.",
      suggested_reply:
        "Hi Noor! Your clean-beauty breakdowns are so thoughtful. Aurelia Skincare is fragrance-free, dermatologist-backed barrier care — I think it would genuinely fit your standards. Could we gift you the line and discuss a paid, ongoing collab? — Kelly",
      est_value: 2600,
      spend: 0,
    }),
    creator({
      creator_id: "cr-bella-lux",
      ref: 5,
      handle: "@bella.inlux",
      name: "Bella Moreau",
      platform: "instagram",
      niche: "lifestyle",
      followers: 240000,
      engagement_rate: 0.038,
      fit_score: 74,
      fit_breakdown: { content: 88, community: 70, credibility: 76, audience: 66, cost: 68, engagement: 62 },
      stage: "negotiating",
      status: "needs_review",
      proposed_action: "draft_contract",
      est_rate: 4200,
      risk: ["money", "contract"],
      channel: "email",
      reason:
        "Premium lifestyle aesthetic that fits our launch visuals, but the deal needs usage-rights and exclusivity terms — approval required before drafting a contract.",
      audience_note: "Aspirational lifestyle audience; skincare is adjacent, not core.",
      suggested_reply:
        "Hi Bella — thanks for the rate card. To move forward we'd want 6 months of paid-usage rights for one hero image and a 30-day category exclusivity window. Could you confirm those terms fit within the $4,200 quote before I send a contract? — Kelly, Aurelia Skincare",
      est_value: 5900,
      spend: 0,
    }),
    creator({
      creator_id: "cr-theo-review",
      ref: 6,
      handle: "@theo.tries",
      name: "Theo Nakamura",
      platform: "youtube",
      niche: "beauty",
      followers: 158000,
      engagement_rate: 0.052,
      fit_score: 81,
      fit_breakdown: { content: 84, community: 80, credibility: 90, audience: 78, cost: 70, engagement: 76 },
      stage: "negotiating",
      status: "needs_review",
      proposed_action: "draft_contract",
      est_rate: 3600,
      risk: ["money", "contract"],
      channel: "email",
      reason:
        "Objective long-form reviewer with real purchase influence. Quote includes a usage-rights buyout — contract review required.",
      audience_note: "Research-driven buyers who watch full reviews before purchasing.",
      suggested_reply:
        "Hi Theo — we'd love an honest long-form review of the Barrier Repair line, no scripting. Your quote of $3,600 including a 12-month usage buyout works on our side pending contract. Shall I send the agreement and a product kit this week? — Kelly, Aurelia Skincare",
      est_value: 7400,
      spend: 0,
    }),
    creator({
      creator_id: "cr-jade-routine",
      ref: 11,
      handle: "@jade.routines",
      name: "Jade Kim",
      platform: "instagram",
      niche: "beauty",
      followers: 128000,
      engagement_rate: 0.067,
      fit_score: 90,
      fit_breakdown: { content: 92, community: 88, credibility: 86, audience: 94, cost: 86, engagement: 90 },
      stage: "measured",
      status: "done",
      proposed_action: "send_brief",
      est_rate: 2000,
      risk: [],
      channel: "email",
      reason:
        "Signed a flat-fee agreement; the collab ran and is now measured — 2 reels + 3 stories drove strong barrier-serum conversions against a $2,000 flat fee.",
      audience_note: "Core sensitive-skin audience, high conversion history.",
      suggested_reply:
        "Hi Jade — here's the campaign brief: 2 in-feed reels + 3 stories over 3 weeks, honest before/after, #ad disclosure, hero product is the Barrier Repair Serum. Flat fee $2,000, product kit shipping today. Full brief PDF attached. Excited to work together! — Kelly",
      est_value: 8200,
      spend: 2000,
    }),
    creator({
      creator_id: "cr-yuki-asmr",
      ref: 12,
      handle: "@yuki.nightcare",
      name: "Yuki Sato",
      platform: "tiktok",
      niche: "wellness",
      followers: 71000,
      engagement_rate: 0.11,
      fit_score: 79,
      fit_breakdown: { content: 82, community: 84, credibility: 74, audience: 76, cost: 92, engagement: 88 },
      stage: "live",
      status: "approved",
      proposed_action: "send_brief",
      est_rate: 700,
      risk: [],
      channel: "tiktok_dm",
      reason:
        "Niche ASMR night-routine content with unusually high conversion and a low rate — approved for a test brief.",
      audience_note: "Sleep + skincare crossover, strong watch-through.",
      suggested_reply:
        "Hi Yuki! Your night-routine ASMR is so calming — perfect for our evening Barrier Repair ritual. Approved for a paid test: 1 TikTok, honest, #ad. Brief and kit coming your way. Fee $700. — Kelly, Aurelia Skincare",
      est_value: 3100,
      spend: 700,
    }),
    creator({
      creator_id: "cr-cara-mom",
      ref: 13,
      handle: "@cara.andcalm",
      name: "Cara Bennett",
      platform: "instagram",
      niche: "parenting",
      followers: 52000,
      engagement_rate: 0.058,
      fit_score: 82,
      fit_breakdown: { content: 80, community: 88, credibility: 84, audience: 82, cost: 86, engagement: 78 },
      stage: "outreach",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 800,
      risk: [],
      channel: "instagram_dm",
      reason:
        "Parenting/sensitive-skin niche with high trust; a strong fit for gentle barrier care. Outreach draft ready for review.",
      audience_note: "Parents buying for eczema-prone and sensitive skin.",
      suggested_reply:
        "Hi Cara! Sensitive, fragrance-free skincare that's gentle enough for the whole family is exactly what Aurelia makes. We'd love to gift the line and set up a paid collab if it fits your family's routine. Could I share details? — Kelly",
      est_value: 2400,
      spend: 0,
    }),
    creator({
      creator_id: "cr-priya-ritual",
      ref: 7,
      handle: "@priya.ritual",
      name: "Priya Anand",
      platform: "instagram",
      niche: "beauty",
      followers: 1240000,
      engagement_rate: 0.021,
      fit_score: 63,
      fit_breakdown: { content: 82, community: 60, credibility: 78, audience: 70, cost: 30, engagement: 48 },
      stage: "discovery",
      status: "blocked",
      proposed_action: "no_action",
      est_rate: 12000,
      risk: ["money", "contract"],
      channel: "email",
      reason:
        "Top-tier reach but the rate is 3x our per-post ceiling and she requires exclusivity. Blocked for this quarter.",
      audience_note: "Massive but broad; skincare intent diluted at this scale.",
      suggested_reply: "",
      est_value: 0,
      spend: 0,
    }),
    creator({
      creator_id: "cr-ryan-tech",
      ref: 8,
      handle: "@ryanbuilds",
      name: "Ryan Cole",
      platform: "youtube",
      niche: "tech",
      followers: 420000,
      engagement_rate: 0.044,
      fit_score: 41,
      fit_breakdown: { content: 70, community: 66, credibility: 72, audience: 20, cost: 40, engagement: 50 },
      stage: "discovery",
      status: "blocked",
      proposed_action: "no_action",
      est_rate: 5000,
      risk: [],
      channel: "email",
      reason:
        "Tech vertical with low audience overlap; not a match unless we launch a men's line. Held out of the pipeline.",
      audience_note: "Predominantly male tech buyers; minimal skincare intent.",
      suggested_reply: "",
      est_value: 0,
      spend: 0,
    }),
    creator({
      creator_id: "cr-mai-food",
      ref: 9,
      handle: "@mai.eats",
      name: "Mai Nguyen",
      platform: "tiktok",
      niche: "food",
      followers: 530000,
      engagement_rate: 0.06,
      fit_score: 38,
      fit_breakdown: { content: 74, community: 78, credibility: 64, audience: 16, cost: 44, engagement: 66 },
      stage: "discovery",
      status: "blocked",
      proposed_action: "no_action",
      est_rate: 3200,
      risk: [],
      channel: "tiktok_dm",
      reason: "Food vertical; audience profile is off from our skincare buyer. Kept as a low-priority reserve.",
      audience_note: "Recipe-driven audience, weak skincare crossover.",
      suggested_reply: "",
      est_value: 0,
      spend: 0,
    }),
    creator({
      creator_id: "cr-hana-wellness",
      ref: 10,
      handle: "@hana.wellnotes",
      name: "Hana Farouk",
      platform: "instagram",
      niche: "wellness",
      followers: 88000,
      engagement_rate: 0.049,
      fit_score: 76,
      fit_breakdown: { content: 80, community: 78, credibility: 80, audience: 74, cost: 72, engagement: 70 },
      stage: "discovery",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 1200,
      risk: [],
      channel: "instagram_dm",
      reason:
        "Wellness creator whose self-care narrative fits our barrier-repair ritual story; awaiting review before first outreach.",
      audience_note: "Holistic self-care audience receptive to skincare rituals.",
      suggested_reply:
        "Hi Hana! Your evening wind-down content is beautiful. Aurelia Skincare's Barrier Repair ritual would slot right into that self-care moment. We'd love to gift the set and explore a paid collab. Could I send the details? — Kelly",
      est_value: 3300,
      spend: 0,
    }),
    creator({
      creator_id: "cr-owen-fitness",
      ref: 14,
      handle: "@owen.movewell",
      name: "Owen Pierce",
      platform: "tiktok",
      niche: "fitness",
      followers: 210000,
      engagement_rate: 0.053,
      fit_score: 68,
      fit_breakdown: { content: 76, community: 74, credibility: 70, audience: 58, cost: 66, engagement: 64 },
      stage: "discovery",
      status: "needs_review",
      proposed_action: "send_outreach",
      est_rate: 1500,
      risk: [],
      channel: "tiktok_dm",
      reason:
        "Fitness creator with a promising post-workout skincare angle; verify his conversion data before committing spend.",
      audience_note: "Active-lifestyle audience; sweat + barrier-care angle untested.",
      suggested_reply:
        "Hi Owen! Post-workout skin takes a beating — sweat, friction, sun. Aurelia's barrier repair is a natural fit for your recovery content. Want to test a paid collab? I can share a product kit and details. — Kelly, Aurelia Skincare",
      est_value: 2900,
      spend: 0,
    }),
  ];

  // Content-reviewer quality gate: a pre-publication decision gate (SHIP / FIX /
  // BLOCK) checking FTC disclosure and claim authenticity before a live post
  // goes out. Part of Aaron's Activate phase.
  creators.push(
    creator({
      creator_id: "cr-jade-gate",
      ref: 15,
      handle: "@jade.routines",
      name: "Jade Kim — draft review",
      platform: "instagram",
      niche: "beauty",
      followers: 128000,
      engagement_rate: 0.067,
      fit_score: 90,
      fit_breakdown: { content: 92, community: 88, credibility: 86, audience: 94, cost: 86, engagement: 90 },
      stage: "live",
      status: "needs_review",
      proposed_action: "no_action",
      est_rate: 0,
      risk: ["contract"],
      channel: "instagram_dm",
      reason:
        "Content-reviewer gate on Jade's reel #1 draft before it publishes: the #ad disclosure is buried below the fold and one line reads 'clinically proven to cure eczema' — an unsupported claim. Recommend FIX before ship.",
      audience_note: "Live collab; this is the pre-publication quality gate, not new outreach.",
      suggested_reply:
        "Hi Jade — the reel looks great! Two required fixes before it can go live:\n1) FTC: move '#ad' into the first line of the caption, not below 'more'.\n2) Claim: change 'clinically proven to cure eczema' to 'helps support the skin barrier' — we can't make a cure claim. Once those two are in, you're clear to publish. — Kelly",
      item_type: "quality_gate",
      gate_verdict: "fix",
      gate_checks: [
        { check: "ftc_disclosure", result: "fix", note: "#ad must be above the fold in the first caption line." },
        { check: "claim_authenticity", result: "fix", note: "Replace 'cure eczema' with barrier-support language." },
        { check: "brand_safety", result: "ship", note: "Visuals and tone are on-brand." },
      ],
      est_value: 0,
      spend: 0,
    }),
  );

  const doneStatuses = new Set(["approved", "done", "live"]);
  const engagements = creators.filter((item) => item.item_type !== "quality_gate");
  const metrics = {
    creator_count: engagements.length,
    needs_review: creators.filter((item) => item.status === "needs_review").length,
    approved: creators.filter((item) => item.status === "approved").length,
    done: creators.filter((item) => item.status === "done").length,
    blocked: creators.filter((item) => item.status === "blocked").length,
    total_reach: engagements
      .filter((item) => item.status !== "blocked")
      .reduce((sum, item) => sum + Number(item.followers || 0), 0),
    budget_total: 50000,
    budget_allocated: engagements
      .filter((item) => doneStatuses.has(item.status))
      .reduce((sum, item) => sum + Number(item.est_rate || 0), 0),
    est_value: engagements.reduce((sum, item) => sum + Number(item.est_value || 0), 0),
  };

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-creators-demo",
    base_currency: "USD",
    pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
    metrics,
    creators,
    warnings: ["outreach", "creators", "roi"].includes(scenario)
      ? [
          {
            id: "money-contract-review",
            severity: "warning",
            creator_id: "cr-bella-lux",
            message:
              "Two engagements carry money/contract risk (usage rights, exclusivity); confirm terms before drafting contracts.",
            detail: "Demo warning, no live data.",
          },
        ]
      : [],
  };
}

interface GateCheck {
  check: string;
  result: string;
  note: string;
}

interface CreatorInput {
  creator_id: string;
  ref: number;
  handle: string;
  name: string;
  platform: string;
  niche: string;
  followers: number;
  engagement_rate: number;
  fit_score: number;
  fit_breakdown: Record<string, number>;
  stage: string;
  status: string;
  proposed_action: string;
  est_rate: number;
  risk: string[];
  channel: string;
  reason: string;
  audience_note: string;
  suggested_reply: string;
  est_value: number;
  spend: number;
  item_type?: string;
  gate_verdict?: string;
  gate_checks?: GateCheck[];
}

// Aaron's four phases map onto the pipeline stages.
const STAGE_PHASE: Record<string, string> = {
  discovery: "discover",
  outreach: "activate",
  negotiating: "plan",
  live: "activate",
  measured: "measure",
};

function creator(input: CreatorInput) {
  const cpm = input.followers ? Math.round((input.est_rate / input.followers) * 1000 * 100) / 100 : 0;
  return {
    item_type: "engagement",
    phase: STAGE_PHASE[input.stage] || "discover",
    ...input,
    cpm,
    created_at: now,
  };
}
