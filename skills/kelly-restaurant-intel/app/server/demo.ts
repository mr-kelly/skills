export function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = [
    "A local event nearby changes expected customer flow",
    "Weather suggests a hot/cold menu push",
    "Review themes reveal one service or dish message to reinforce",
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
  }));

  const actions = [
    "Pick today's hero menu item or set",
    "Draft a staff pre-shift brief",
    "Create a short social post and delivery-platform blurb",
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
  }));

  const channels = ["staff brief", "IG post", "delivery blurb"];
  const drafts = channels.map((channel, index) => ({
    id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in restaurants, cafes, and F&B groups. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
    status: "needs_review",
    risk: channel.toLowerCase().includes("client") || channel.toLowerCase().includes("whatsapp") ? ["outbound"] : [],
    linked_action_id: `action-${Math.min(index + 1, actions.length)}`,
  }));

  const sources = [
    {
      id: "news",
      label: "News sources",
      status: "configured",
      freshness: "demo",
      coverage:
        "local events, weather, competitor menus, review themes, booking demand, and delivery-platform activity",
    },
    {
      id: "competitors",
      label: "Competitor/public pages",
      status: "needs_config",
      freshness: "not connected",
      coverage: "Add target URLs in config.local.json",
    },
    {
      id: "trends",
      label: "Trend keywords",
      status: "configured",
      freshness: "demo",
      coverage: "restaurant event, menu promotion, food delivery, weather, 餐饮, 套餐",
    },
  ];

  return {
    schema_version: "1",
    batch_id: `kelly-restaurant-intel-demo-${Date.now()}`,
    generated_at: now,
    source: "kelly-restaurant-intel",
    vertical: "restaurants, cafes, and F&B groups",
    buyer: "restaurant owners, cafe operators, F&B marketers, and group managers",
    offer: "daily restaurant intelligence that becomes menu pushes, staff notes, and social/offline offer copy",
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
