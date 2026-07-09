export function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = [
    "A nearby transaction gives agents a timely reason to message owners and buyers",
    "Competitor ads are pushing a specific estate with discount language",
    "Mortgage or policy news changes how cautious buyers should be approached",
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
    "Pick today's hero listing and explain the buyer angle",
    "Draft WhatsApp follow-ups for three dormant buyer segments",
    "Create a short social post anchored on verified market news",
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

  const channels = ["WhatsApp follow-up", "agent朋友圈", "listing pitch"];
  const drafts = channels.map((channel, index) => ({
    id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in real estate and property agencies. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
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
        "property news, listing portals, transaction reports, competitor ads, mortgage/rate news, and local district events",
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
      coverage: "property transaction, mortgage, new listing, estate agency, 成交, 楼盘",
    },
  ];

  return {
    schema_version: "1",
    batch_id: `kelly-real-estate-intel-demo-${Date.now()}`,
    generated_at: now,
    source: "kelly-real-estate-intel",
    vertical: "real estate and property agencies",
    buyer: "property agency owners, team leads, and individual agents",
    offer: "daily property intelligence that becomes push-listing suggestions, WhatsApp follow-ups, and social posts",
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
