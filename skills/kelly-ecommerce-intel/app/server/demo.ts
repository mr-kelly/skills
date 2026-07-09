export function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = [
    "A competitor price move creates a bundle or positioning response",
    "A platform policy update affects claims or listing structure",
    "Review themes reveal objections that listings should answer",
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
    "Draft listing title/bullets for one product angle",
    "Suggest an ad hook based on a competitor gap",
    "Flag platform-policy risks before publishing",
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

  const channels = ["listing copy", "ad angle", "customer reply"];
  const drafts = channels.map((channel, index) => ({
    id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in e-commerce and cross-border sellers. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
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
        "marketplace pages, competitor pricing, platform policy notices, search trends, ads libraries, and reviews",
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
      coverage: "Amazon listing, Shopify, TikTok Shop, competitor price, 电商, 跨境",
    },
  ];

  return {
    schema_version: "1",
    batch_id: `kelly-ecommerce-intel-demo-${Date.now()}`,
    generated_at: now,
    source: "kelly-ecommerce-intel",
    vertical: "e-commerce and cross-border sellers",
    buyer: "e-commerce founders, marketplace operators, DTC marketers, and cross-border sellers",
    offer: "daily e-commerce intelligence that becomes listing edits, ad angles, and product-push recommendations",
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
