import { buildSnapshot } from "../campaigns-model.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim from the retired app/server/demo.ts (same send_id/ref
// values, same copy) — only the suppression numbers are no longer hardcoded:
// they now come from campaigns-model.js's real checkSuppression(), computed
// the same way buildSnapshot() computes it for the busabase provider.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";

const NOW = "2026-07-02T09:30:00.000Z";

// Phase is Aaron's SEND discipline facet: Setup -> Engage -> Nurture -> Deliver.
const TYPE_PHASE = {
  campaign: "deliver",
  newsletter: "nurture",
  sequence_step: "nurture",
  cold_outbound: "deliver",
};

function segment(segment_id, name, description, audience_size) {
  return { segment_id, name, description, audience_size };
}

function deliverability(spf_pass, dkim_pass, dmarc_pass, spam_score, inbox_readiness) {
  return { spf_pass, dkim_pass, dmarc_pass, spam_score, inbox_readiness };
}

function variant(id, subject) {
  return { id, subject };
}

function performance(delivered, open_rate, click_rate, unsub_rate, bounce_rate) {
  return { delivered, open_rate, click_rate, unsub_rate, bounce_rate };
}

// Email Quality Score (EQS) + SEND-framework verdict for the pre-send gate.
// verdict is one of SHIP | FIX | BLOCK.
function qualityGate(eqs, verdict, summary, checks) {
  return { eqs, verdict, summary, checks };
}

function send(
  send_id,
  ref,
  type,
  from_identity_id,
  subject,
  preview_text,
  segment_id,
  audience_size,
  status,
  proposed_action,
  risk,
  send_at,
  deliverabilityInfo,
  subject_variants,
  reason,
  body,
  performanceInfo = null,
  qualityGateInfo = null,
  phaseOverride = "",
) {
  return {
    send_id,
    ref,
    type,
    phase: phaseOverride || TYPE_PHASE[type] || "deliver",
    from_identity_id,
    subject,
    preview_text,
    segment_id,
    audience_size,
    status,
    proposed_action,
    risk,
    send_at,
    deliverability: deliverabilityInfo,
    subject_variants,
    chosen_variant: "",
    reason,
    body,
    target_addresses: [],
    performance: performanceInfo,
    quality_gate: qualityGateInfo,
    created_at: NOW,
    decision_note: "",
    decided_at: "",
  };
}

function demoSegments() {
  return [
    segment("all-subscribers", "All subscribers", "Everyone opted in to marketing email.", 48210),
    segment("new-signups-30d", "New signups (30d)", "Accounts created in the last 30 days.", 2140),
    segment("browsers-7d", "Recent browsers (7d)", "Viewed a product in the last 7 days.", 5630),
    segment("high-engagement", "Highly engaged", "Opened 3+ of the last 5 emails.", 9880),
    segment("local-list", "Local (Seattle)", "Subscribers in the Seattle metro.", 3120),
    segment("cart-abandoners", "Cart abandoners", "Added to cart but did not check out.", 870),
    segment("lapsed-90d", "Lapsed (90d)", "No open or click in the last 90 days.", 7420),
  ];
}

// Consent/suppression list: recipients or whole segments removed by unsubscribe,
// hard bounce, or complaint. Segment-level entries exclude recipients (a soft
// pre-send note); an explicitly-targeted suppressed ADDRESS hard-blocks a send.
function demoSuppression() {
  return [
    {
      address: "unsub-1@example.com",
      reason: "unsubscribe",
      note: "Clicked unsubscribe on the June dispatch.",
      suppressed_at: "2026-06-27T10:12:00.000Z",
      source: "esp-webhook",
    },
    {
      address: "bounced-1@example.com",
      reason: "hard_bounce",
      note: "Mailbox does not exist (550).",
      suppressed_at: "2026-06-28T04:30:00.000Z",
      source: "esp-webhook",
    },
    {
      address: "complaint-1@example.com",
      reason: "complaint",
      note: "Marked a campaign as spam.",
      suppressed_at: "2026-06-29T22:05:00.000Z",
      source: "esp-webhook",
    },
    {
      // Whole segment suppressed while its consent is re-confirmed.
      segment_id: "lapsed-90d",
      reason: "complaint",
      note: "Elevated complaint rate; hold the lapsed segment until re-permission.",
      suppressed_at: "2026-06-30T09:00:00.000Z",
      source: "operator",
    },
  ];
}

function demoSends() {
  const sends = [
    send(
      "send-summer-launch",
      1,
      "campaign",
      "brand-main",
      "Meet the Summer Cold Brew Trio ☀️",
      "Three small-batch roasts, chilled and ready. Free shipping this week.",
      "browsers-7d",
      5630,
      "needs_review",
      "schedule_send",
      ["spam-word"],
      "2026-07-08T16:00:00.000Z",
      deliverability(true, true, true, 1.4, 0.94),
      [
        variant("a", "Meet the Summer Cold Brew Trio ☀️"),
        variant("b", "Your new summer ritual is here (cold brew, 3 ways)"),
      ],
      "Summer cold-brew launch to recent browsers; two subject lines are ready for an A/B pick before scheduling.",
      "Hi {{first_name}},\n\nSummer just got smoother. Our new Cold Brew Trio brings three small-batch roasts, slow-steeped for 18 hours and bottled fresh:\n\n- Midnight Harbor — dark, chocolatey, bold.\n- Cascade Morning — bright and citrusy.\n- Driftwood — smooth, low-acid, easy all day.\n\nThis week only, the full trio ships free. Chill, pour, repeat.\n\n[Shop the Trio]\n\nWith warmth,\nThe Northwind Team",
    ),
    send(
      "send-newsletter-jul",
      2,
      "newsletter",
      "brand-main",
      "Northwind Dispatch — July: roast notes & a cold-brew recipe",
      "This month: our new roaster, a reader recipe, and where we're popping up.",
      "all-subscribers",
      48210,
      "changes_requested",
      "hold",
      [],
      "2026-07-10T13:00:00.000Z",
      deliverability(true, true, true, 0.9, 0.96),
      [],
      "The monthly dispatch is drafted; Kelly asked to tighten the intro and lift the recipe link above the fold.",
      "Hi {{first_name}},\n\nThere's a lot brewing at Northwind this month — a new roaster joined the team, we're testing a single-origin from Huila, and readers have been sending in their best iced-coffee hacks.\n\nOur favorite this month: cold-brew affogato. Recipe below.\n\n[Read the July Dispatch]\n\nSee you at the Ballard pop-up on the 19th.\n\nThe Northwind Team",
    ),
    send(
      "send-welcome-1",
      3,
      "sequence_step",
      "lifecycle",
      "Welcome to Northwind — let's find your roast",
      "You're in. Here's the short story behind the beans.",
      "new-signups-30d",
      2140,
      "needs_review",
      "schedule_send",
      [],
      "2026-07-03T15:00:00.000Z",
      deliverability(true, true, true, 0.6, 0.97),
      [],
      "Welcome sequence step 1 for new signups; introduces the brand and sets expectations. The SEND gate returns SHIP.",
      "Hi {{first_name}},\n\nWelcome to Northwind Coffee — we're glad you're here.\n\nWe're a small Seattle roaster obsessed with getting the details right: single-origin beans, roasted in small batches, shipped within 48 hours.\n\nOver the next few days we'll help you find your roast and brew it beautifully. No spam, just good coffee.\n\n[Take the 30-second roast quiz]\n\nThe Northwind Team",
      null,
      qualityGate(92, "ship", "SEND audit: clean auth, warm segment, on-brand copy — ready to schedule.", [
        { key: "S", label: "Sender & auth", pass: true, note: "SPF, DKIM, DMARC all pass." },
        { key: "E", label: "Engagement risk", pass: true, note: "New-signup segment, high expected open rate." },
        { key: "N", label: "Not spammy", pass: true, note: "Spam score 0.6; no trigger words." },
        { key: "D", label: "Deliverability", pass: true, note: "Inbox readiness 0.97." },
      ]),
    ),
    send(
      "send-welcome-2",
      4,
      "sequence_step",
      "lifecycle",
      "How to brew it right (3 methods, 3 minutes)",
      "Pour-over, French press, or cold brew — here's the cheat sheet.",
      "new-signups-30d",
      2140,
      "needs_review",
      "schedule_send",
      [],
      "2026-07-05T15:00:00.000Z",
      deliverability(true, true, true, 0.7, 0.96),
      [],
      "Welcome sequence step 2: a brewing guide that builds habit before the discount step. Ready to schedule.",
      "Hi {{first_name}},\n\nGreat beans deserve a great brew. Here's our no-fuss cheat sheet:\n\n- Pour-over: 1:16 ratio, 30-second bloom, pour in slow circles.\n- French press: coarse grind, 4-minute steep, press gently.\n- Cold brew: 1:8 ratio, 18 hours in the fridge, dilute to taste.\n\nBookmark this — your future mornings will thank you.\n\n[See the full brew guides]\n\nThe Northwind Team",
    ),
    send(
      "send-welcome-3",
      5,
      "sequence_step",
      "lifecycle",
      "A little welcome gift: 15% off your first bag",
      "Your roast quiz picks + a code that expires Sunday.",
      "new-signups-30d",
      2140,
      "needs_review",
      "schedule_send",
      ["money"],
      "2026-07-07T15:00:00.000Z",
      deliverability(true, true, true, 2.1, 0.92),
      [],
      "Welcome sequence step 3 carries a first-order discount code (money risk); confirm the offer and expiry before scheduling.",
      "Hi {{first_name}},\n\nReady when you are. Here's 15% off your first bag — our welcome gift.\n\nBased on your quiz, we think you'll love Cascade Morning and Driftwood.\n\nUse code WELCOME15 at checkout. It expires Sunday at midnight.\n\n[Claim your 15% off]\n\nHappy brewing,\nThe Northwind Team",
    ),
    send(
      "send-winback-promo",
      6,
      "campaign",
      "brand-main",
      "We miss you — here's 25% off to come back",
      "It's been a while. Your next bag is on us (almost).",
      "lapsed-90d",
      7420,
      "needs_review",
      "hold",
      ["money", "spam-word", "deliverability"],
      "2026-07-09T16:00:00.000Z",
      deliverability(true, false, false, 6.8, 0.41),
      [],
      "Win-back to the lapsed segment, but DKIM and DMARC are failing and the spam score is 6.8 — the SEND gate returns BLOCK until auth is fixed.",
      "Hi {{first_name}},\n\nIt's been a while! Come back and save 25% on any order — this is a limited-time offer, so act now before it's gone.\n\nWe've added new roasts since you last visited, and we'd love to win you back.\n\n[Claim 25% off — click here now]\n\nThe Northwind Team",
      null,
      qualityGate(38, "block", "SEND audit: authentication fails and spam signals are severe — do not send.", [
        { key: "S", label: "Sender & auth", pass: false, note: "DKIM and DMARC fail; SPF only." },
        { key: "E", label: "Engagement risk", pass: false, note: "Lapsed-90d segment with no re-permission step." },
        {
          key: "N",
          label: "Not spammy",
          pass: false,
          note: "Spam score 6.8; 'act now', 'click here now', '$$$' triggers.",
        },
        { key: "D", label: "Deliverability", pass: false, note: "Inbox readiness 0.41, below the 0.70 policy floor." },
      ]),
    ),
    send(
      "send-restock-alert",
      7,
      "campaign",
      "brand-main",
      "Back in stock: Midnight Harbor (it sold out fast)",
      "The dark, chocolatey favorite is roasted and ready again.",
      "browsers-7d",
      5630,
      "approved",
      "schedule_send",
      [],
      "2026-07-04T16:00:00.000Z",
      deliverability(true, true, true, 1.1, 0.95),
      [],
      "Restock alert for recent browsers who viewed Midnight Harbor; approved and ready to schedule.",
      "Hi {{first_name}},\n\nGood news — Midnight Harbor is back.\n\nOur darkest, most chocolatey roast sold out in four days last time. This batch is fresh off the roaster and won't last long.\n\n[Grab a bag before it's gone]\n\nThe Northwind Team",
    ),
    send(
      "send-loyalty-invite",
      8,
      "campaign",
      "brand-main",
      "You're invited: join Northwind Rewards",
      "Earn a free bag for every five you buy. Members get early drops.",
      "high-engagement",
      9880,
      "approved",
      "schedule_send",
      [],
      "2026-07-06T16:00:00.000Z",
      deliverability(true, true, true, 1.6, 0.93),
      [],
      "Loyalty program invite for the highly engaged segment; approved, scheduling next.",
      "Hi {{first_name}},\n\nYou're one of our most loyal readers — so here's an invitation.\n\nNorthwind Rewards: earn points on every order, get a free bag for every five you buy, and unlock early access to seasonal drops.\n\nJoining takes ten seconds and it's free.\n\n[Join Northwind Rewards]\n\nThe Northwind Team",
    ),
    send(
      "send-survey",
      9,
      "campaign",
      "brand-main",
      "Two quick questions (and a thank-you)",
      "Tell us how we're doing — it takes 60 seconds.",
      "high-engagement",
      9880,
      "needs_review",
      "schedule_send",
      [],
      "2026-07-11T16:00:00.000Z",
      deliverability(true, true, true, 1.0, 0.95),
      [],
      "Satisfaction survey to engaged subscribers; low risk, ready for a review before scheduling.",
      "Hi {{first_name}},\n\nWe're always trying to brew a better experience — and your opinion shapes what we do next.\n\nTwo quick questions, sixty seconds, and a small thank-you at the end.\n\n[Share your thoughts]\n\nThank you,\nThe Northwind Team",
    ),
    send(
      "send-event-invite",
      10,
      "campaign",
      "brand-main",
      "Come taste with us — Ballard pop-up, July 19",
      "Free tastings, new roasts, and a barista Q&A. RSVP inside.",
      "local-list",
      3120,
      "needs_review",
      "schedule_send",
      [],
      "2026-07-12T16:00:00.000Z",
      deliverability(true, true, true, 0.8, 0.96),
      [],
      "Local event invite for the Seattle segment; low risk, awaiting review.",
      "Hi {{first_name}},\n\nWe're popping up in Ballard on Saturday, July 19 — and you're invited.\n\nFree tastings of the Summer Cold Brew Trio, a first look at our fall roasts, and a Q&A with our head roaster.\n\n11am–4pm at the Ballard Farmers Market. Bring a friend.\n\n[RSVP — it's free]\n\nThe Northwind Team",
    ),
    send(
      "send-flash-sale",
      11,
      "campaign",
      "brand-main",
      "48 hours: 20% off everything ☕",
      "Our mid-summer flash sale starts now. Two days only.",
      "all-subscribers",
      48210,
      "needs_review",
      "ab_test",
      ["money", "spam-word"],
      "2026-07-14T16:00:00.000Z",
      deliverability(true, true, true, 3.2, 0.85),
      [variant("a", "48 hours: 20% off everything ☕"), variant("b", "Your mid-summer treat: 20% off, two days only")],
      "Flash sale to the full list with money and spam-word flags; two subject variants are set up for an A/B test. The SEND gate returns FIX.",
      "Hi {{first_name}},\n\nFor the next 48 hours, everything is 20% off — beans, brew gear, gift sets, all of it.\n\nNo code needed; the discount is applied at checkout. When the timer runs out, so does the deal.\n\n[Shop the sale]\n\nThe Northwind Team",
      null,
      qualityGate(
        71,
        "fix",
        "SEND audit: deliverable, but tighten spam-trigger words in the subject before full-list send.",
        [
          { key: "S", label: "Sender & auth", pass: true, note: "SPF, DKIM, DMARC all pass." },
          {
            key: "E",
            label: "Engagement risk",
            pass: true,
            note: "Full list; segment out the lapsed tail to protect reputation.",
          },
          {
            key: "N",
            label: "Not spammy",
            pass: false,
            note: "Spam score 3.2; '48 hours', 'off everything' lean promotional.",
          },
          { key: "D", label: "Deliverability", pass: true, note: "Inbox readiness 0.85." },
        ],
      ),
    ),
    send(
      "send-june-newsletter",
      12,
      "newsletter",
      "brand-main",
      "Northwind Dispatch — June: iced season is here",
      "New cold-brew concentrate, a summer playlist, and pop-up dates.",
      "all-subscribers",
      48210,
      "done",
      "no_action",
      [],
      "2026-06-26T13:00:00.000Z",
      deliverability(true, true, true, 0.7, 0.97),
      [],
      "June dispatch — approved and sent on schedule; kept for performance reference.",
      "Hi {{first_name}},\n\nIced season is officially open at Northwind. This month we launched our cold-brew concentrate, put together a summer playlist, and locked in our July pop-up dates.\n\n[Read the June Dispatch]\n\nThe Northwind Team",
      performance(47180, 0.421, 0.118, 0.0021, 0.0064),
    ),
    send(
      "send-abandoned-cart",
      13,
      "sequence_step",
      "lifecycle",
      "You left something behind ☕",
      "Your cart is still warm. Want us to hold it?",
      "cart-abandoners",
      870,
      "approved",
      "schedule_send",
      [],
      "2026-07-03T18:00:00.000Z",
      deliverability(true, true, true, 1.3, 0.94),
      [],
      "Abandoned-cart sequence step for people who did not check out; approved and ready.",
      "Hi {{first_name}},\n\nYou left a little something in your cart — and we'd hate for you to miss it.\n\nWe've saved it for you. If you have questions about the roast or the brew, just reply; a real human reads these.\n\n[Return to your cart]\n\nThe Northwind Team",
    ),
    send(
      "send-reengage",
      14,
      "sequence_step",
      "lifecycle",
      "Still want to hear from us?",
      "A quick check-in — no hard feelings either way.",
      "lapsed-90d",
      7420,
      "done",
      "no_action",
      [],
      "2026-06-20T16:00:00.000Z",
      deliverability(true, true, true, 1.5, 0.9),
      [],
      "Re-engagement email to the lapsed segment — sent last cycle; kept for performance reference.",
      "Hi {{first_name}},\n\nWe noticed it's been a while, and we want to respect your inbox.\n\nIf you'd still like the occasional note about new roasts and pop-ups, no action needed. If not, you can update your preferences below anytime.\n\n[Update preferences]\n\nThe Northwind Team",
      performance(7180, 0.184, 0.031, 0.0093, 0.011),
    ),
    send(
      "send-cold-b2b",
      15,
      "cold_outbound",
      "lifecycle",
      "Wholesale coffee for {{company}}'s Seattle offices?",
      "A quick note from a local roaster — 30 seconds, no pitch deck.",
      "cart-abandoners",
      120,
      "needs_review",
      "hold",
      ["compliance", "spam-word"],
      "2026-07-15T16:00:00.000Z",
      deliverability(true, true, true, 2.9, 0.83),
      [],
      "Cold B2B outbound to prospect offices; needs a compliance check (unsubscribe + physical address) and small warm-up batches before scaling.",
      "Hi {{first_name}},\n\nI run a small Seattle roaster called Northwind, and I noticed {{company}} has a few offices nearby.\n\nWe supply freshly roasted beans and brew gear to local teams — no long contracts, just good coffee delivered weekly.\n\nWorth a 15-minute chat? If not, no worries at all — reply 'no thanks' and I won't follow up.\n\nBest,\nKelly, Northwind Coffee\n123 Ballard Ave, Seattle WA · Unsubscribe",
      null,
      qualityGate(
        64,
        "fix",
        "SEND audit: send in small warm-up batches and confirm CAN-SPAM footer before scaling cold outreach.",
        [
          { key: "S", label: "Sender & auth", pass: true, note: "Dedicated lifecycle identity; auth passes." },
          {
            key: "E",
            label: "Engagement risk",
            pass: false,
            note: "Cold list — throttle to 120/day and monitor complaints.",
          },
          { key: "N", label: "Not spammy", pass: true, note: "Spam score 2.9; footer has address + unsubscribe." },
          { key: "D", label: "Deliverability", pass: true, note: "Inbox readiness 0.83 on a warmed IP." },
        ],
      ),
    ),
  ];

  // Consent/suppression demo wiring: the win-back send explicitly targets a
  // suppressed (complaint) address, so campaigns-model.js's checkSuppression()
  // hard-blocks it once buildSnapshot() runs; the flash sale to the full list
  // overlaps the global address-level suppressions and shows the "N
  // suppressed recipients excluded" soft note — both are computed, not
  // hardcoded.
  const winback = sends.find((item) => item.send_id === "send-winback-promo");
  if (winback) winback.target_addresses = ["complaint-1@example.com"];

  return sends;
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = buildSnapshot({ segments: demoSegments(), sends: demoSends(), suppression: demoSuppression() });
    snapshot.generated_at = NOW;
    snapshot.source = "kelly-campaigns-demo";
    snapshot.list_health = {
      subscriber_count: 48210,
      bounce_rate: 0.0071,
      complaint_rate: 0.0004,
      churn_rate: 0.0089,
      avg_open_rate: 0.386,
      avg_click_rate: 0.094,
    };
    if (!["campaigns", "deliverability", "detail"].includes(scenario)) snapshot.warnings = [];
    return {
      app: "kelly-campaigns",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-campaigns/config.json",
        is_example: false,
        operator: {
          name: "Kelly Chan",
          role: "Marketing Lead",
          company: "Northwind Coffee",
          timezone: "Asia/Shanghai",
        },
        brand: {
          name: "Northwind Coffee",
          homepage: "https://northwind.coffee",
          unsubscribe_url: "https://northwind.coffee/unsubscribe",
        },
        esp: {
          provider: "postmark",
          display_name: "Postmark Broadcasts",
          secret_envs: ["KELLY_CAMPAIGNS_ESP_API_KEY"],
          secrets_ready: true,
        },
        from_identities: [
          {
            identity_id: "brand-main",
            from_name: "Northwind Coffee",
            from_email: "hello@northwind.coffee",
            reply_to: "replies@northwind.coffee",
            use_when: ["campaign", "newsletter"],
          },
          {
            identity_id: "lifecycle",
            from_name: "Northwind Team",
            from_email: "team@northwind.coffee",
            reply_to: "team@northwind.coffee",
            use_when: ["sequence_step"],
          },
        ],
        segments: snapshot.segments.map((segment) => ({
          segment_id: segment.segment_id,
          name: segment.name,
          description: segment.description,
        })),
        sending_policy: {
          approval_required: true,
          daily_send_cap: 50000,
          hourly_send_cap: 8000,
          min_inbox_readiness: 0.7,
          max_spam_score: 4,
        },
        style_tone: "clear, friendly, on-brand",
      },
      decisions: {},
      suppression: { updated_at: "2026-07-01T12:00:00.000Z", entries: demoSuppression() },
      demo_visuals: demoVisualsForApp("kelly-campaigns"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-campaigns") },
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
