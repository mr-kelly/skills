export function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = [
    "Publisher and AI-search licensing moves change which sources get cited by AI assistants",
    "Copilot Studio and Microsoft 365 admin searches suggest enterprise deployment intent",
    "Privacy and AI governance updates make review-first workflows easier to sell",
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
    "Package one buyer-trigger brief for a target vertical",
    "Draft a one-day sample intelligence report for a prospect",
    "Create a sales message that leads with approved daily actions, not generic AI",
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

  const channels = ["sales opener", "LinkedIn post", "client memo"];
  const drafts = channels.map((channel, index) => ({
    id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in AI/news-source intelligence. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
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
      coverage: "OpenAI, Microsoft Copilot, Google AI Search, Perplexity, privacy regulators, and local business media",
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
      coverage: "AI news, OpenAI news, Copilot Studio, AI search, media monitoring, buyer intent",
    },
  ];

  return {
    schema_version: "1",
    batch_id: `kelly-ai-newsroom-demo-${Date.now()}`,
    generated_at: now,
    source: "kelly-ai-newsroom",
    vertical: "AI/news-source intelligence",
    buyer:
      "founders, operators, and product sellers who need to convert news and trend signals into daily sales scenes",
    offer: "daily news-source and buyer-intent intelligence that turns trend signals into approved sales actions",
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
