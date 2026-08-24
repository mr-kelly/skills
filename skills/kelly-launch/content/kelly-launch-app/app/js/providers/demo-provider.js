// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { buildSnapshot } from "../launch-model.js?v=0.1.0";

const NOW = "2026-07-06T09:30:00.000Z";
const TARGET_DATE = "2026-07-16";

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
    reason,
    format,
    risk:
      ["product_hunt", "hacker_news", "press"].includes(channel_id) || proposed_action === "send_pitch"
        ? [
            ...(["product_hunt", "hacker_news", "press"].includes(channel_id) ? ["public"] : []),
            ...(proposed_action === "send_pitch" ? ["outreach"] : []),
            ...(channel_id === "press" ? ["press"] : []),
          ]
        : [],
    created_at: NOW,
    decision_note: "",
    decided_at: "",
  };
}

function runstep(step_id, offset, at, title, owner, note) {
  return { step_id, offset, at, title, owner, note };
}

function demoChannels() {
  return [
    channel("product_hunt", "product_hunt", "Product Hunt", "queued"),
    channel("hacker_news", "hacker_news", "Hacker News (Show HN)", "queued"),
    channel("press", "press", "Press outreach", "drafting"),
    channel("email", "email", "Launch email", "scheduled"),
    channel("changelog", "changelog", "Changelog + docs", "drafting"),
  ];
}

function demoItems() {
  return [
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
      "ICP locked: platform/DevRel leads at 20-200-person SaaS teams who onboard new hires onto internal tooling. Core pain: onboarding docs rot and no one owns the checklist.",
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
      "Notion/Confluence own docs; no one owns the living onboarding checklist generated from those docs. Wedge = auto-generated, self-updating checklists.",
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
      "Approved messaging; every launch asset should inherit this line and the three pillars.",
      "",
    ),
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
      "# Trailhead Press Kit\n\n**One-liner:** Trailhead turns your existing docs into onboarding checklists that stay current automatically.\n\n**Key facts:** Founded 2025, remote-first, 4 people. 40 design-partner teams during private beta.\n\n**Contact:** press@trailhead.dev",
      "Reporters expect a self-serve kit. Blocking readiness until the boilerplate and screenshots are final.",
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
      "Storyboard drafted (doc -> checklist in 3 clicks). Screen recording not captured yet; the demo environment still has placeholder data that leaks a partner's name.",
      "Hard blocker on readiness: the demo env must be scrubbed of partner data before we can record.",
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
      "**Hero:** Onboarding checklists that write themselves from your docs.\n\n**Subhead:** Point Trailhead at your wiki. It builds a checklist every new hire actually follows.\n\n**Primary CTA:** Start free",
      "Hero copy is ready for review, but the secondary CTA links to the demo video, which is still blocked.",
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
      "**Free:** 1 workspace, 3 checklists.\n**Team - $12/seat/mo:** unlimited checklists, doc sync, roles.\n**Enterprise:** SSO, audit log, priority support.",
      "Pricing draft is written but finance has not signed off on the team tier; do not publish until they do.",
      "markdown",
    ),
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
      "**Tagline:** Trailhead - living onboarding checklists generated from your docs\n\n**First comment:** Hey Product Hunt! We built Trailhead because every team we joined had onboarding docs that were three reorgs out of date.",
      "The maker asked to lead with the outcome, not the mechanism, and to trim the comment.",
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
      "Gallery plan: 1) hero GIF (doc -> checklist), 2) generated-checklist screenshot, 3) doc-sync diagram, 4) pricing snapshot.",
      "Gallery layout is set; the hero GIF is derived from the demo video, so this slips if the video stays blocked.",
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
      "**Title:** Show HN: Trailhead - onboarding checklists generated from your existing docs\n\n**Body:** I kept joining teams whose onboarding wiki was months out of date, so I built Trailhead.",
      "Show HN copy is honest and technical - the tone HN rewards. Submit the morning of launch.",
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
      "Subject: The onboarding wiki is dead - Trailhead makes it a living checklist\n\nQuick pitch: most teams' onboarding docs are stale the day after they're written.",
      "Solid pitch, but it cites the 38% beta stat - confirm that number is cleared for external use.",
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
      "Subject: Trailhead is live - turn your docs into onboarding checklists\n\nToday's the day. Trailhead is live: point it at your docs and it builds an onboarding checklist your new hires actually follow.",
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
      "Subject: Something's shipping July 16\n\nWe've been quiet - here's why. A 40-second teaser of what you'll get next week.",
      "Warm-up teaser was approved and exported to the waitlist on July 4.",
      "markdown",
    ),
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
      "## Trailhead 1.0 - Public launch\n\nTrailhead is now generally available. Generate onboarding checklists from your docs, sync them automatically.",
      "Changelog copy is ready; it links the getting-started guide, which still has two TODO sections.",
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
      "Runbook drafted with an ordered timeline and a war-room note per step. On-call: Kelly (comms), Dana (infra), Priya (support).",
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
      "Drafted 6 canned replies (pricing, doc-sync limits, security, SSO, data deletion) and a public launch FAQ.",
      "Macros are drafted; the security answer must match the press-kit compliance wording exactly.",
      "markdown",
    ),
  ];
}

function demoRunbook() {
  return [
    runstep(
      "run-01",
      "T-60m",
      "08:00",
      "War room open, final go/no-go",
      "Kelly",
      "Confirm every readiness blocker is cleared. If demo video or press kit is still BLOCK/FIX, decide go/no-go now.",
    ),
    runstep(
      "run-02",
      "T-30m",
      "08:30",
      "Publish landing page + pricing + changelog",
      "Dana",
      "Flip the landing hero, pricing page (only if finance signed off), and changelog live.",
    ),
    runstep(
      "run-03",
      "T-0",
      "09:00",
      "Product Hunt goes live + first comment",
      "Kelly",
      "PH auto-publishes at 00:01 PT; post the maker's first comment immediately and pin it.",
    ),
    runstep(
      "run-04",
      "T+5m",
      "09:05",
      "Submit Show HN post",
      "Kelly",
      "Submit Show HN by hand (never scheduled). One post only; engage in comments.",
    ),
    runstep(
      "run-05",
      "T+15m",
      "09:15",
      "Send launch email to waitlist",
      "Priya",
      "Fire the approved waitlist email. Watch bounce rate.",
    ),
    runstep(
      "run-06",
      "T+30m",
      "09:30",
      "Lift press embargo + send Tier-1 pitches",
      "Kelly",
      "Only after the 38% stat is cleared. Send press_tier1 with the kit link.",
    ),
    runstep(
      "run-07",
      "T+3h",
      "12:00",
      "Midday pulse check",
      "Kelly",
      "Check PH rank, HN position, signup funnel, and support queue.",
    ),
    runstep(
      "run-08",
      "T+8h",
      "17:00",
      "End-of-day recap + thank-yous",
      "Kelly",
      "Post a thank-you update on PH, reply to remaining HN threads.",
    ),
  ];
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = buildSnapshot({ items: demoItems(), channels: demoChannels(), runbook: demoRunbook() });
    snapshot.generated_at = NOW;
    snapshot.source = "kelly-launch-demo";
    snapshot.product = {
      name: "Trailhead",
      tagline: "Onboarding checklists that write themselves from your docs",
      homepage: "https://trailhead.dev",
      category: "Developer tools",
    };
    snapshot.launch = { target_date: TARGET_DATE, timezone: "Asia/Shanghai" };
    snapshot.warnings = ["assets", "overview", "checklist"].includes(scenario)
      ? [
          {
            id: "readiness-fix",
            severity: "warning",
            message:
              "Launch readiness is FIX: the demo video and press kit are still blocking; resolve them before launch.",
            detail: "Demo warning, no live data.",
          },
        ]
      : [];
    return {
      app: "kelly-launch",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-launch/config.json",
        is_example: false,
        product: snapshot.product,
        launch: snapshot.launch,
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
      decisions: {},
      demo_visuals: demoVisualsForApp("kelly-launch"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-launch") },
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
