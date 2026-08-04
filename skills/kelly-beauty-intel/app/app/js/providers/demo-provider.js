// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.

function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = [
    "Competitors are discounting a treatment that needs a differentiated consultation angle",
    "A safety or regulator item requires careful wording",
    "A seasonal skin/body concern is rising in social content",
  ].map((summary, index) => ({
    id: `signal-${index + 1}`,
    ref: index + 1,
    title: summary,
    summary,
    why_it_matters: [
      "This can become a timely reason to contact customers.",
      "The operator can act today without waiting for a full campaign.",
      "The item needs source-backed review before use.",
    ][index % 3],
    buyer_intent: [
      "High: creates a concrete sales or follow-up trigger.",
      "Medium: useful for content and objection handling.",
      "Medium: watch for stronger proof before scaling.",
    ][index % 3],
    confidence: [0.82, 0.74, 0.68][index % 3],
    detected_at: now,
    status: "needs_review",
    risk: index === 2 ? ["claims-review"] : [],
    source: {
      name: ["Official/news source", "Competitor/public page", "Trend/community signal"][index % 3],
      url: `https://example.com/source-${index + 1}`,
    },
    suggested_action_id: `action-${index + 1}`,
    decision_note: "",
    decided_at: "",
  }));

  const actions = [
    "Create a safe consultation script with blocked medical claims",
    "Draft IG/Xiaohongshu content for one approved treatment angle",
    "Suggest a non-price offer that protects margin",
  ].map((summary, index) => ({
    id: `action-${index + 1}`,
    ref: index + 1,
    title: summary,
    summary,
    status: "needs_review",
    priority: ["high", "medium", "medium"][index % 3],
    owner: "operator",
    reason: "Linked to today's reviewed signal set.",
    linked_signal_ids: [`signal-${index + 1}`],
    next_step: "Review the evidence, approve the action, then export it into the daily operator brief.",
    decision_note: "",
    decided_at: "",
  }));

  const channels = ["IG caption", "Xiaohongshu note", "consultation script"];
  const drafts = channels.map((channel, index) => ({
    id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in beauty, wellness, and medical aesthetics. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
    status: "needs_review",
    risk: channel.toLowerCase().includes("client") || channel.toLowerCase().includes("whatsapp") ? ["outbound"] : [],
    linked_action_id: `action-${Math.min(index + 1, actions.length)}`,
    decision_note: "",
    decided_at: "",
  }));

  const sources = [
    {
      id: "news",
      label: "News sources",
      status: "configured",
      freshness: "demo",
      coverage: "competitor offers, treatment trend posts, regulator/safety notices, review sites, and seasonal demand",
    },
    {
      id: "competitors",
      label: "Competitor/public pages",
      status: "needs_config",
      freshness: "not connected",
      coverage: "Configure target URLs in the operator profile",
    },
    {
      id: "trends",
      label: "Trend keywords",
      status: "configured",
      freshness: "demo",
      coverage: "aesthetic treatment, beauty offer, skin care, medical aesthetics, 美容, 医美",
    },
  ];

  return {
    schema_version: "1",
    batch_id: `kelly-beauty-intel-demo-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    generated_at: now,
    source: "kelly-beauty-intel",
    vertical: "beauty, wellness, and medical aesthetics",
    buyer: "beauty salon owners, medical-aesthetics clinics, wellness operators, and consultants",
    offer: "daily beauty intelligence that becomes safe treatment angles, consultation scripts, and social drafts",
    metrics: {
      signals_needs_review: signals.length,
      actions_needs_review: actions.length,
      drafts_needs_review: drafts.length,
      approved: 0,
      blocked: 0,
    },
    signals,
    actions,
    drafts,
    sources,
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    return {
      app: "kelly-beauty-intel",
      demo: true,
      data_provider: "demo",
      onboarding: { completed: true, config_version: "demo" },
      config_summary: {
        source: "demo",
        brand: "Demo Beauty Studio",
        provider: "demo",
        channels: ["IG caption", "Xiaohongshu note", "consultation script"],
      },
      locked: false,
      lock: null,
      files: {},
      batch: makeDemoBatch(),
      decisions: {},
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
