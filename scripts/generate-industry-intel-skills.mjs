#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const skillsDir = path.join(repoRoot, "skills");

const scenarios = [
  {
    slug: "kelly-ai-newsroom",
    display: "Kelly AI Newsroom",
    short: "News-source intelligence desk for buyer-trigger AI scenes",
    vertical: "AI/news-source intelligence",
    buyer:
      "founders, operators, and product sellers who need to convert news and trend signals into daily sales scenes",
    trigger:
      "the user asks for AI trend sourcing, news-source monitoring, buyer-intent analysis, or a reusable industry-intelligence cockpit",
    pain: "hot AI/news signals are noisy, and it is hard to know which one creates a real sales opportunity",
    offer: "daily news-source and buyer-intent intelligence that turns trend signals into approved sales actions",
    demoSource: "OpenAI, Microsoft Copilot, Google AI Search, Perplexity, privacy regulators, and local business media",
    sampleSignals: [
      "Publisher and AI-search licensing moves change which sources get cited by AI assistants",
      "Copilot Studio and Microsoft 365 admin searches suggest enterprise deployment intent",
      "Privacy and AI governance updates make review-first workflows easier to sell",
    ],
    sampleActions: [
      "Package one buyer-trigger brief for a target vertical",
      "Draft a one-day sample intelligence report for a prospect",
      "Create a sales message that leads with approved daily actions, not generic AI",
    ],
    draftChannels: ["sales opener", "LinkedIn post", "client memo"],
    keywords: ["AI news", "OpenAI news", "Copilot Studio", "AI search", "media monitoring", "buyer intent"],
    accent: "blue",
  },
  {
    slug: "kelly-real-estate-intel",
    display: "Kelly Real Estate Intel",
    short: "Daily property, listing, competitor, and client-follow-up intelligence",
    vertical: "real estate and property agencies",
    buyer: "property agency owners, team leads, and individual agents",
    trigger:
      "the user asks about real estate, property agencies, listings, transactions, competitor ads, client follow-up, or a地产/中介 intelligence workflow",
    pain: "agents miss timely listing angles, competitor pushes, and reasons to follow up with silent clients",
    offer: "daily property intelligence that becomes push-listing suggestions, WhatsApp follow-ups, and social posts",
    demoSource:
      "property news, listing portals, transaction reports, competitor ads, mortgage/rate news, and local district events",
    sampleSignals: [
      "A nearby transaction gives agents a timely reason to message owners and buyers",
      "Competitor ads are pushing a specific estate with discount language",
      "Mortgage or policy news changes how cautious buyers should be approached",
    ],
    sampleActions: [
      "Pick today's hero listing and explain the buyer angle",
      "Draft WhatsApp follow-ups for three dormant buyer segments",
      "Create a short social post anchored on verified market news",
    ],
    draftChannels: ["WhatsApp follow-up", "agent朋友圈", "listing pitch"],
    keywords: ["property transaction", "mortgage", "new listing", "estate agency", "成交", "楼盘"],
    accent: "green",
  },
  {
    slug: "kelly-education-intel",
    display: "Kelly Education Intel",
    short: "Policy, exam, visa, parent FAQ, and enrollment intelligence",
    vertical: "education, training, tutoring, and admissions services",
    buyer: "education center owners, admissions consultants, tutoring operators, and course marketers",
    trigger:
      "the user asks about education, training centers, exams, study abroad, visas, school policy, parent FAQ,招生,升学, or教育机构 sales scenes",
    pain: "education sellers need to turn fast-changing policy, exam, and parent anxiety into trustworthy enrollment conversations",
    offer: "daily education intelligence that becomes parent FAQs, enrollment scripts, and course promotion drafts",
    demoSource:
      "education bureaus, exam boards, school notices, visa news, university updates, and parent discussion topics",
    sampleSignals: [
      "Exam or admissions dates create a narrow follow-up window",
      "Visa or school policy changes raise parent questions",
      "Competitors are reframing courses around a new assessment concern",
    ],
    sampleActions: [
      "Draft a parent FAQ with source-backed answers",
      "Create an enrollment message for a specific course",
      "Flag claims that require human review before sending",
    ],
    draftChannels: ["parent WhatsApp", "WeChat post", "course pitch"],
    keywords: ["DSE", "IELTS", "student visa", "school admissions", "升学", "招生"],
    accent: "purple",
  },
  {
    slug: "kelly-beauty-intel",
    display: "Kelly Beauty Intel",
    short: "Competitor offers, treatment trends, safety news, and content drafts",
    vertical: "beauty, wellness, and medical aesthetics",
    buyer: "beauty salon owners, medical-aesthetics clinics, wellness operators, and consultants",
    trigger:
      "the user asks about beauty, medical aesthetics, wellness, treatments, competitor offers, IG/Xiaohongshu content,美容,医美, or health-service sales scenes",
    pain: "beauty sellers need fresh, compliant angles without copying competitor discounts or making risky medical claims",
    offer: "daily beauty intelligence that becomes safe treatment angles, consultation scripts, and social drafts",
    demoSource: "competitor offers, treatment trend posts, regulator/safety notices, review sites, and seasonal demand",
    sampleSignals: [
      "Competitors are discounting a treatment that needs a differentiated consultation angle",
      "A safety or regulator item requires careful wording",
      "A seasonal skin/body concern is rising in social content",
    ],
    sampleActions: [
      "Create a safe consultation script with blocked medical claims",
      "Draft IG/Xiaohongshu content for one approved treatment angle",
      "Suggest a non-price offer that protects margin",
    ],
    draftChannels: ["IG caption", "Xiaohongshu note", "consultation script"],
    keywords: ["aesthetic treatment", "beauty offer", "skin care", "medical aesthetics", "美容", "医美"],
    accent: "pink",
  },
  {
    slug: "kelly-insurance-intel",
    display: "Kelly Insurance Intel",
    short: "Market, policy, client-risk, and advisor follow-up intelligence",
    vertical: "insurance and wealth advisory",
    buyer: "insurance advisors, agency managers, and independent financial consultants",
    trigger:
      "the user asks about insurance, wealth advisory, client risk reminders, market news, policyholder follow-up,保险, or financial-advisor sales scenes",
    pain: "advisors need compliant, timely reasons to contact clients without sounding generic or alarmist",
    offer: "daily advisor intelligence that becomes client reminders, meeting reasons, and compliant draft messages",
    demoSource:
      "market news, insurer announcements, regulator updates, health/cost-of-living news, and client lifecycle events",
    sampleSignals: [
      "A market or healthcare-cost story creates a review conversation",
      "A regulatory update changes how an advisor should phrase a topic",
      "A seasonal risk gives a polite reason to check in with clients",
    ],
    sampleActions: [
      "Draft client check-in messages with compliance caution",
      "Create a short meeting agenda for one client segment",
      "Mark claims that need license-holder review",
    ],
    draftChannels: ["client WhatsApp", "advisor email", "meeting agenda"],
    keywords: ["insurance", "wealth planning", "retirement", "health cost", "保險", "理财"],
    accent: "blue",
  },
  {
    slug: "kelly-retail-intel",
    display: "Kelly Retail Intel",
    short: "Store, promotion, weather, event, and merchandising intelligence",
    vertical: "retail stores and consumer brands",
    buyer: "retail owners, brand operators, store managers, and merchandisers",
    trigger:
      "the user asks about retail, stores, promotions, merchandising, shopping trends, weather/event sales opportunities,零售, or门店 scenes",
    pain: "retail operators need to decide what to push today based on local demand, weather, events, and competitor promotions",
    offer: "daily retail intelligence that becomes promotion ideas, merchandising notes, and staff talking points",
    demoSource:
      "weather, local events, competitor promotions, product trends, mall traffic signals, and customer reviews",
    sampleSignals: [
      "Weather and local events suggest a different product push today",
      "Competitors are bundling a category that can be countered with service/value",
      "Customer review themes show what staff should mention",
    ],
    sampleActions: [
      "Pick today's product/category push",
      "Draft a staff talking point and counter-offer",
      "Create a short social or in-store sign copy",
    ],
    draftChannels: ["staff brief", "IG story", "store sign"],
    keywords: ["retail promotion", "mall event", "weather sales", "customer review", "零售", "促销"],
    accent: "orange",
  },
  {
    slug: "kelly-ecommerce-intel",
    display: "Kelly Ecommerce Intel",
    short: "Product trend, competitor price, platform policy, and listing intelligence",
    vertical: "e-commerce and cross-border sellers",
    buyer: "e-commerce founders, marketplace operators, DTC marketers, and cross-border sellers",
    trigger:
      "the user asks about e-commerce, cross-border selling, product trends, competitor prices, listing optimization, ads,电商, or跨境 scenes",
    pain: "sellers need to react quickly to product demand, competitor pricing, platform rules, and ad angles",
    offer: "daily e-commerce intelligence that becomes listing edits, ad angles, and product-push recommendations",
    demoSource:
      "marketplace pages, competitor pricing, platform policy notices, search trends, ads libraries, and reviews",
    sampleSignals: [
      "A competitor price move creates a bundle or positioning response",
      "A platform policy update affects claims or listing structure",
      "Review themes reveal objections that listings should answer",
    ],
    sampleActions: [
      "Draft listing title/bullets for one product angle",
      "Suggest an ad hook based on a competitor gap",
      "Flag platform-policy risks before publishing",
    ],
    draftChannels: ["listing copy", "ad angle", "customer reply"],
    keywords: ["Amazon listing", "Shopify", "TikTok Shop", "competitor price", "电商", "跨境"],
    accent: "green",
  },
  {
    slug: "kelly-restaurant-intel",
    display: "Kelly Restaurant Intel",
    short: "Local event, weather, menu, competitor, and daily offer intelligence",
    vertical: "restaurants, cafes, and F&B groups",
    buyer: "restaurant owners, cafe operators, F&B marketers, and group managers",
    trigger:
      "the user asks about restaurants, cafes, food and beverage, menus, local events, daily offers,餐饮, or餐厅 scenes",
    pain: "F&B teams need to decide today's offer and content while reacting to weather, events, and nearby competition",
    offer: "daily restaurant intelligence that becomes menu pushes, staff notes, and social/offline offer copy",
    demoSource:
      "local events, weather, competitor menus, review themes, booking demand, and delivery-platform activity",
    sampleSignals: [
      "A local event nearby changes expected customer flow",
      "Weather suggests a hot/cold menu push",
      "Review themes reveal one service or dish message to reinforce",
    ],
    sampleActions: [
      "Pick today's hero menu item or set",
      "Draft a staff pre-shift brief",
      "Create a short social post and delivery-platform blurb",
    ],
    draftChannels: ["staff brief", "IG post", "delivery blurb"],
    keywords: ["restaurant event", "menu promotion", "food delivery", "weather", "餐饮", "套餐"],
    accent: "red",
  },
  {
    slug: "kelly-financial-services-intel",
    display: "Kelly Financial Services Intel",
    short: "Market, client-explainer, risk, and opportunity intelligence",
    vertical: "financial services, investment advisory, and family offices",
    buyer: "financial-service founders, family office operators, analysts, and client advisors",
    trigger:
      "the user asks about financial services, investment advisory, market explainers, client memos, family office,投顾,金融服务, or family-office scenes",
    pain: "financial teams need fast, sourced explainers and client talking points without overclaiming or giving uncontrolled advice",
    offer: "daily financial-services intelligence that becomes sourced internal briefs and review-first client drafts",
    demoSource:
      "market news, regulatory updates, macro data, company announcements, portfolio themes, and client questions",
    sampleSignals: [
      "A market event needs a clear client explanation",
      "A regulatory or macro update changes risk framing",
      "A portfolio theme needs an updated talking point with source links",
    ],
    sampleActions: [
      "Draft a sourced internal market brief",
      "Prepare a client explainer marked for advisor review",
      "List claims that need compliance or licensed-person approval",
    ],
    draftChannels: ["client memo", "internal brief", "advisor script"],
    keywords: ["market news", "portfolio risk", "family office", "investment advisory", "金融", "投顾"],
    accent: "graphite",
  },
];

const accentMap = {
  blue: "#007aff",
  green: "#248a3d",
  purple: "#7e5bef",
  pink: "#d63384",
  orange: "#c45f00",
  red: "#c9342b",
  graphite: "#58606a",
};

function q(value) {
  return JSON.stringify(value);
}

function titleCase(slug) {
  return slug
    .replace(/^kelly-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function skillMd(s) {
  return `---
name: ${s.slug}
license: MIT
description: ${q(`${s.display}: App-in-Skill daily industry intelligence cockpit for ${s.vertical}. Use when ${s.trigger}. Prepares news/source signals, buyer-intent interpretation, approved sales actions, and channel drafts for review before any external handoff.`)}
---

# ${s.display}

## Overview

Use this skill as Kelly's daily industry-intelligence operator for **${s.vertical}**.

It turns current news sources, trend signals, competitor movement, customer questions, and buyer-intent clues into a small reviewable batch:

- source-backed signals;
- why each signal matters to the buyer;
- sales or operating actions for today;
- draft messages/content for ${s.draftChannels.join(", ")};
- blocked claims that need human, legal, compliance, or domain review.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, prepare or refresh the local batch, start/reuse the local app with \`app/start.sh\`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## Product Package

- **Buyer**: ${s.buyer}.
- **Pain**: ${s.pain}.
- **Offer**: ${s.offer}.
- **Demo source mix**: ${s.demoSource}.

Sales framing:

> Every morning, AI watches the sources that affect your business, turns them into today's sales actions, and puts the drafts in a review queue before anything becomes official.

Do not lead with "AI platform", "agent workspace", "database", or model names. Lead with the daily business scene.

## Boundary

- The skill may browse public/current sources, reason over buyer intent, draft actions/content, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never post content, send WhatsApp/email, mutate CRMs, scrape private systems, spend money, or perform external side effects.
- Customer-visible drafts, regulated claims, pricing promises, medical/financial/legal advice, and outbound messages are approval-required.
- Store only the minimal source excerpts needed for review. Do not commit \`config.local.json\`, env files, \`app/.data/\`, exports, screenshots of private sources, or raw customer data.

## First Run And Onboarding

On invocation, check \`app/.data/onboarding.json\` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real monitoring.

Ask for non-secret setup details only:

- company/brand name, geography, language, and customer segment;
- 3-10 public source URLs or source categories to monitor;
- competitor names/URLs;
- approved offer, CTA, and forbidden claims;
- preferred channels among ${s.draftChannels.join(", ")};
- whether Busabase should be the review provider later.

Never ask for API keys or platform tokens in chat. Secrets belong in env files only.

When setup is complete and the user confirms, write \`app/.data/onboarding.json\`:

\`\`\`json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
\`\`\`

## Local App

Start the cockpit with:

\`\`\`bash
skills/${s.slug}/app/start.sh
\`\`\`

The app uses local HTTP on \`127.0.0.1\`, preferring port \`3000\` through \`4000\`, or \`${s.slug.toUpperCase().replaceAll("-", "_")}_UI_PORT\` when set.

Required views:

- \`#/overview\`: human-attention panel, today's top signals, ready actions, blocked items, and source coverage.
- \`#/signals\` and \`#/signals/<id>\`: source-backed signals with evidence links, buyer-intent interpretation, confidence, risk badges, and suggested next action.
- \`#/actions\` and \`#/actions/<id>\`: approved/blocked/reviewable operating or sales actions.
- \`#/drafts\` and \`#/drafts/<id>\`: editable ${s.draftChannels.join(", ")} drafts with approve/request-changes/block decisions.
- \`#/sources\`: configured source categories, freshness, and gaps.
- \`#/settings\`: sanitized config summary, onboarding state, provider, language, and accent color.

Demo mode:

- \`?demo=1\`, \`?demo=overview\`, \`?demo=signals\`, \`?demo=actions\`, \`?demo=drafts\`, and \`?demo=detail\` load deterministic demo data.
- \`lang=en\` or \`lang=zh\` forces UI chrome language.
- Demo API responses never read/write \`app/.data/\` or private config.

## File Contract

Read \`references/ui-schema.md\` before changing the app, scripts, or generated JSON.

- \`app/.data/current_batch.json\`: current intelligence batch.
- \`app/.data/decisions.json\`: user verdicts and edits keyed by item id.
- \`app/.data/agent_tasks.json\`: queued agent work for requested changes or missing evidence.
- \`app/.data/execution_report.json\`: dry-run/apply handoff report.
- \`app/.data/onboarding.json\`: setup marker.
- \`app/.data/agent.lock\`: temporary lock while the skill writes files.

Validate with:

\`\`\`bash
node skills/${s.slug}/scripts/validate_ui_schema.ts skills/${s.slug}/app/.data/current_batch.json
\`\`\`

## Normal Workflow

1. Detect mode. Default to App UI.
2. Browse or otherwise collect current public evidence. For news/trends, use exact dates and source URLs.
3. Build one narrow buyer scene, not a generic AI report.
4. Write a batch with signals, actions, drafts, and source coverage. Keep every item tied to evidence or mark it blocked.
5. Validate the batch.
6. Launch the UI for review.
7. Poll \`agent_tasks.json\` for requested changes and revise only those items.
8. On "execute/export approved", re-read decisions and run \`scripts/execute_decisions.ts\` first as a dry run. Apply only after explicit confirmation.

## Safety Defaults

- Treat outbound messages, regulated claims, medical/financial/legal advice, pricing promises, and publishing as approval-required.
- If source evidence is weak, mark the item \`blocked\` or lower confidence instead of pretending.
- Preserve source language unless the workflow asks for translation.
- Use Busabase as the later shared review provider when the workflow needs team approvals; local files remain the reference implementation.
`;
}

function packageJson(s) {
  return `${JSON.stringify(
    {
      name: s.slug,
      private: true,
      type: "module",
      version: "0.1.0",
      description: `${s.display} App-in-Skill industry intelligence cockpit.`,
      scripts: {
        start: "node app/server/launcher.ts",
        serve: "node app/server/index.ts",
        "generate:demo": "node scripts/generate_batch.ts --demo",
        validate: "node scripts/validate_ui_schema.ts app/.data/current_batch.json",
        "execute:dry-run": "node scripts/execute_decisions.ts",
      },
      dependencies: {
        "@hono/node-server": "^2.0.8",
        hono: "^4.12.28",
      },
      engines: {
        node: ">=23.6",
      },
    },
    null,
    2,
  )}\n`;
}

function openaiYaml(s) {
  return `interface:
  display_name: ${q(s.display)}
  short_description: ${q(s.short)}
  default_prompt: ${q(`Use $${s.slug} to prepare today's ${s.vertical} intelligence batch and open the review cockpit.`)}
`;
}

function configExample(s) {
  return `${JSON.stringify(
    {
      skill: s.slug,
      brand: {
        name: "Example Business",
        geography: "Hong Kong",
        language: "auto",
        audience: s.buyer,
      },
      offer: {
        summary: s.offer,
        default_cta: "Reply to approve today's action plan.",
        forbidden_claims: ["unverified results", "guaranteed outcomes"],
      },
      sources: [
        { id: "news", label: "News sources", method: "browser_agent", examples: s.demoSource },
        { id: "competitors", label: "Competitors", method: "browser_agent", examples: "Add public competitor URLs" },
        { id: "trends", label: "Trend signals", method: "browser_agent", keywords: s.keywords },
      ],
      channels: s.draftChannels,
      provider: { type: "local" },
      ui: { accent: s.accent },
    },
    null,
    2,
  )}\n`;
}

function schemaMd(s) {
  return `# ${s.display} UI Schema

This skill uses a local review-first file contract. The app reads/writes JSON files under \`app/.data/\`; the skill performs external reads and approved handoffs.

## Batch

\`current_batch.json\`:

\`\`\`json
{
  "schema_version": "1",
  "batch_id": "kelly-intel-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "${s.slug}",
  "vertical": "${s.vertical}",
  "buyer": "${s.buyer}",
  "offer": "${s.offer}",
  "metrics": {
    "signals_needs_review": 0,
    "actions_needs_review": 0,
    "drafts_needs_review": 0,
    "approved": 0,
    "blocked": 0
  },
  "signals": [],
  "actions": [],
  "drafts": [],
  "sources": []
}
\`\`\`

Workflow statuses: \`needs_review\`, \`changes_requested\`, \`approved\`, \`done\`, \`blocked\`.

Decision actions: \`approve\`, \`request_changes\`, \`revise\`, \`block\`.

## Signal

Required fields:

- \`id\`, \`ref\`, \`title\`, \`summary\`, \`why_it_matters\`, \`buyer_intent\`, \`status\`, \`confidence\`, \`detected_at\`
- \`source\`: \`{ "name": "...", "url": "..." }\`
- \`risk\`: string array
- \`suggested_action_id\`: optional action id

## Action

Required fields:

- \`id\`, \`ref\`, \`title\`, \`summary\`, \`status\`, \`priority\`, \`owner\`, \`reason\`
- \`linked_signal_ids\`: string array
- \`next_step\`: concrete next step for the operator or agent

## Draft

Required fields:

- \`id\`, \`ref\`, \`channel\`, \`title\`, \`body\`, \`status\`, \`risk\`, \`linked_action_id\`

Drafts are editable in the UI. User edits are stored in \`decisions.json\`, not written back into the batch until the skill applies decisions.

## Decisions

\`decisions.json\`:

\`\`\`json
{
  "schema_version": "1",
  "updated_at": "ISO timestamp",
  "decisions": {
    "item-id": {
      "action": "approve",
      "note": "",
      "edited_body": "",
      "decided_at": "ISO timestamp"
    }
  }
}
\`\`\`

## Execution Report

\`execute_decisions.ts\` writes \`execution_report.json\` with concrete operations such as:

- \`export_action_plan\`
- \`handoff_content_pack\`
- \`queue_agent_revision\`
- \`mark_blocked\`

No external side effects are performed by the script.
`;
}

function pathsTs(s) {
  const env = `${s.slug.toUpperCase().replaceAll("-", "_")}_UI_PORT`;
  return `import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_NAME = ${q(s.slug)};
export const DISPLAY_NAME = ${q(s.display)};
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = Number.parseInt(process.env.${env} || process.env.PORT || "3000", 10);

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const skillDir = path.resolve(appDir, "..");
export const dataDir = path.join(appDir, ".data");
export const batchPath = path.join(dataDir, "current_batch.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const configExamplePath = path.join(skillDir, "config.example.json");
export const configLocalPath = path.join(skillDir, "config.local.json");
`;
}

function demoTs(s) {
  return `export function makeDemoBatch() {
  const now = new Date().toISOString();
  const signals = ${JSON.stringify(s.sampleSignals)}.map((summary, index) => ({
    id: \`signal-\${index + 1}\`,
    ref: index + 1,
    title: summary,
    summary,
    why_it_matters: [
      "This can become a timely reason to contact customers.",
      "The operator can act today without waiting for a full campaign.",
      "The item needs source-backed review before use."
    ][index % 3],
    buyer_intent: [
      "High: creates a concrete sales or follow-up trigger.",
      "Medium: useful for content and objection handling.",
      "Medium: watch for stronger proof before scaling."
    ][index % 3],
    confidence: [0.82, 0.74, 0.68][index % 3],
    detected_at: now,
    status: "needs_review",
    risk: index === 2 ? ["claims-review"] : [],
    source: {
      name: ["Official/news source", "Competitor/public page", "Trend/community signal"][index % 3],
      url: \`https://example.com/source-\${index + 1}\`
    },
    suggested_action_id: \`action-\${index + 1}\`
  }));

  const actions = ${JSON.stringify(s.sampleActions)}.map((summary, index) => ({
    id: \`action-\${index + 1}\`,
    ref: index + 1,
    title: summary,
    summary,
    status: "needs_review",
    priority: ["high", "medium", "medium"][index % 3],
    owner: "operator",
    reason: "Linked to today's reviewed signal set.",
    linked_signal_ids: [\`signal-\${index + 1}\`],
    next_step: "Review the evidence, approve the action, then export it into the daily operator brief."
  }));

  const channels = ${JSON.stringify(s.draftChannels)};
  const drafts = channels.map((channel, index) => ({
    id: \`draft-\${index + 1}\`,
    ref: index + 1,
    channel,
    title: \`\${channel}: today's approved angle\`,
    body:
      \`Draft for \${channel}: We noticed a timely update in ${s.vertical}. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.\`,
    status: "needs_review",
    risk: channel.toLowerCase().includes("client") || channel.toLowerCase().includes("whatsapp") ? ["outbound"] : [],
    linked_action_id: \`action-\${Math.min(index + 1, actions.length)}\`
  }));

  const sources = [
    { id: "news", label: "News sources", status: "configured", freshness: "demo", coverage: "${s.demoSource}" },
    { id: "competitors", label: "Competitor/public pages", status: "needs_config", freshness: "not connected", coverage: "Add target URLs in config.local.json" },
    { id: "trends", label: "Trend keywords", status: "configured", freshness: "demo", coverage: ${JSON.stringify(s.keywords.join(", "))} }
  ];

  return {
    schema_version: "1",
    batch_id: \`${s.slug}-demo-\${Date.now()}\`,
    generated_at: now,
    source: "${s.slug}",
    vertical: "${s.vertical}",
    buyer: "${s.buyer}",
    offer: "${s.offer}",
    metrics: {
      signals_needs_review: signals.length,
      actions_needs_review: actions.length,
      drafts_needs_review: drafts.length,
      approved: 0,
      blocked: 0
    },
    signals,
    actions,
    drafts,
    sources
  };
}
`;
}

function storeTs() {
  return `import fs from "node:fs/promises";
import path from "node:path";
import { appDir, batchPath, configExamplePath, configLocalPath, dataDir, decisionsPath, lockPath, onboardingPath } from "./paths.ts";
import { makeDemoBatch } from "./demo.ts";

export async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function exists(file: string) {
  return fs.access(file).then(() => true, () => false);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown) {
  await ensureDirs();
  await fs.writeFile(file, \`\${JSON.stringify(value, null, 2)}\\n\`);
}

export async function readBatch(demo = false) {
  if (demo) return makeDemoBatch();
  const fallback = makeDemoBatch();
  if (!(await exists(batchPath))) await writeJson(batchPath, fallback);
  return readJson(batchPath, fallback);
}

export async function readDecisions() {
  return readJson(decisionsPath, { schema_version: "1", updated_at: new Date().toISOString(), decisions: {} });
}

export async function saveDecision(id: string, body: Record<string, unknown>) {
  if (await exists(lockPath)) {
    return { ok: false, error: "Agent is writing. Try again after the lock clears." };
  }
  const decisions = await readDecisions() as Record<string, unknown> & { decisions: Record<string, unknown> };
  decisions.updated_at = new Date().toISOString();
  decisions.decisions[id] = {
    action: body.action,
    note: body.note || "",
    edited_body: body.edited_body || "",
    decided_at: new Date().toISOString()
  };
  await writeJson(decisionsPath, decisions);
  return { ok: true };
}

export async function readState(demo = false) {
  await ensureDirs();
  const onboarding = await readJson(onboardingPath, { completed: false });
  const configSource = (await exists(configLocalPath)) ? "config.local.json" : "config.example.json";
  const config = await readJson(configSource === "config.local.json" ? configLocalPath : configExamplePath, {});
  return {
    app: path.basename(path.resolve(appDir, "..")),
    demo,
    onboarding,
    locked: await exists(lockPath),
    files: {
      batch: batchPath,
      decisions: decisionsPath,
      onboarding: onboardingPath,
      config: configSource
    },
    config_summary: {
      source: configSource,
      brand: (config as any).brand?.name || "not configured",
      provider: (config as any).provider?.type || "local",
      channels: (config as any).channels || []
    }
  };
}
`;
}

function honoTs() {
  return `import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { appDir } from "./paths.ts";
import { readBatch, readDecisions, readState, saveDecision } from "./store.ts";

export const app = new Hono();

function wantsDemo(c: any) {
  return Boolean(c.req.query("demo"));
}

app.get("/api/state", async (c) => c.json(await readState(wantsDemo(c))));
app.get("/api/batch", async (c) => c.json(await readBatch(wantsDemo(c))));
app.get("/api/decisions", async (c) => c.json(await readDecisions()));
app.post("/api/decisions/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await saveDecision(c.req.param("id"), body);
  return c.json(result, result.ok ? 200 : 409);
});

async function fileResponse(relativePath: string, contentType: string) {
  const body = await fs.readFile(path.join(appDir, relativePath), "utf8");
  return new Response(body, { headers: { "content-type": contentType } });
}

app.get("/app.js", async () => fileResponse("app.js", "text/javascript; charset=utf-8"));
app.get("/styles.css", async () => fileResponse("styles.css", "text/css; charset=utf-8"));
app.get("/i18n/messages.js", async () => fileResponse(path.join("i18n", "messages.js"), "text/javascript; charset=utf-8"));
app.get("/", async (c) => c.html(await fs.readFile(path.join(appDir, "index.html"), "utf8")));
app.get("*", async (c) => c.html(await fs.readFile(path.join(appDir, "index.html"), "utf8")));
`;
}

function indexTs() {
  return `#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT, DISPLAY_NAME } from "./paths.ts";
import { ensureDirs } from "./store.ts";

await ensureDirs();
serve({ fetch: app.fetch, hostname: DEFAULT_HOST, port: DEFAULT_PORT }, (info) => {
  console.log(\`\${DISPLAY_NAME} UI: http://\${DEFAULT_HOST}:\${info.port}\`);
});
`;
}

function launcherTs() {
  return `#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, DEFAULT_HOST);
  });
}

async function findPort() {
  for (let port = DEFAULT_PORT; port <= 4000; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error("No free local port between 3000 and 4000.");
}

const port = await findPort();
const child = spawn(process.execPath, [new URL("./index.ts", import.meta.url).pathname], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) }
});
child.on("exit", (code) => process.exit(code ?? 0));
`;
}

function html(s) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${s.display}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body data-accent="${s.accent}">
    <div id="app" class="app-shell"></div>
    <script type="module" src="/i18n/messages.js"></script>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
}

function messagesJs() {
  return `export const messages = {
  en: {
    all: "All",
    overview: "Overview",
    signals: "Signals",
    actions: "Actions",
    drafts: "Drafts",
    sources: "Sources",
    settings: "Settings",
    needsReview: "Needs Review",
    approved: "Ready for agent next",
    blocked: "Blocked",
    done: "Done",
    approve: "Approve",
    requestChanges: "Request changes",
    block: "Block",
    revise: "Save edit",
    reviewNote: "Review note",
    editedDraft: "Edited draft",
    refresh: "Refresh",
    humanAttention: "What needs attention",
    buyer: "Buyer",
    offer: "Offer",
    evidence: "Evidence",
    why: "Why it matters",
    buyerIntent: "Buyer intent",
    nextStep: "Next step"
  },
  zh: {
    all: "全部",
    overview: "总览",
    signals: "信号",
    actions: "行动",
    drafts: "草稿",
    sources: "来源",
    settings: "设置",
    needsReview: "待审核",
    approved: "准备给 Agent 继续",
    blocked: "已阻塞",
    done: "完成",
    approve: "批准",
    requestChanges: "要求修改",
    block: "阻塞",
    revise: "保存编辑",
    reviewNote: "审核备注",
    editedDraft: "编辑后草稿",
    refresh: "刷新",
    humanAttention: "需要你处理",
    buyer: "买家",
    offer: "方案",
    evidence: "证据",
    why: "为什么重要",
    buyerIntent: "采购意图",
    nextStep: "下一步"
  }
};
`;
}

function appJs() {
  return `import { messages } from "./i18n/messages.js";

const params = new URLSearchParams(location.search);
const langOverride = params.get("lang") || localStorage.getItem("lang") || "auto";
const lang = langOverride === "auto" ? (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en" : langOverride;
const t = messages[lang] || messages.en;
const state = { batch: null, decisions: {}, route: parseRoute(), selectedId: null };

function parseRoute() {
  const hash = location.hash || "#/overview";
  const parts = hash.slice(2).split("/");
  return { view: parts[0] || "overview", id: parts[1] || null };
}

async function load() {
  const [batch, decisions, appState] = await Promise.all([
    fetch(\`/api/batch\${location.search}\`).then((r) => r.json()),
    fetch("/api/decisions").then((r) => r.json()),
    fetch(\`/api/state\${location.search}\`).then((r) => r.json())
  ]);
  state.batch = batch;
  state.decisions = decisions.decisions || {};
  state.appState = appState;
  render();
}

function allItems() {
  const b = state.batch || {};
  return [
    ...(b.signals || []).map((item) => ({ ...item, kind: "signal" })),
    ...(b.actions || []).map((item) => ({ ...item, kind: "action" })),
    ...(b.drafts || []).map((item) => ({ ...item, kind: "draft" }))
  ];
}

function effectiveStatus(item) {
  const decision = state.decisions[item.id];
  if (!decision) return item.status;
  if (decision.action === "approve") return "approved";
  if (decision.action === "block") return "blocked";
  if (decision.action === "request_changes") return "changes_requested";
  return item.status;
}

function byView() {
  const { view } = state.route;
  if (view === "signals") return (state.batch.signals || []).map((item) => ({ ...item, kind: "signal" }));
  if (view === "actions") return (state.batch.actions || []).map((item) => ({ ...item, kind: "action" }));
  if (view === "drafts") return (state.batch.drafts || []).map((item) => ({ ...item, kind: "draft" }));
  return allItems();
}

function counts() {
  const items = allItems();
  return {
    needs: items.filter((item) => effectiveStatus(item) === "needs_review").length,
    approved: items.filter((item) => effectiveStatus(item) === "approved").length,
    blocked: items.filter((item) => effectiveStatus(item) === "blocked" || effectiveStatus(item) === "changes_requested").length
  };
}

function navItem(view, label) {
  const active = state.route.view === view ? "active" : "";
  return \`<a class="nav-item \${active}" href="#/\${view}">\${label}</a>\`;
}

function renderShell(content) {
  const c = counts();
  document.querySelector("#app").innerHTML = \`
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">K</div>
        <div>
          <strong>\${state.batch.source}</strong>
          <span>\${state.batch.vertical}</span>
        </div>
      </div>
      <section class="attention">
        <div class="eyebrow">\${t.humanAttention}</div>
        <div class="attention-row"><strong>\${c.needs}</strong><span>\${t.needsReview}</span></div>
        <div class="attention-row"><strong>\${c.approved}</strong><span>\${t.approved}</span></div>
        <div class="attention-row"><strong>\${c.blocked}</strong><span>\${t.blocked}</span></div>
      </section>
      <nav>
        \${navItem("overview", t.overview)}
        \${navItem("signals", t.signals)}
        \${navItem("actions", t.actions)}
        \${navItem("drafts", t.drafts)}
        \${navItem("sources", t.sources)}
        \${navItem("settings", t.settings)}
      </nav>
    </aside>
    <main class="main">
      \${content}
    </main>
  \`;
}

function badge(value) {
  return \`<span class="badge \${String(value).replace(/_/g, "-")}">\${value}</span>\`;
}

function itemRow(item) {
  const status = effectiveStatus(item);
  return \`
    <a class="item-row" href="#/\${state.route.view === "overview" ? \`\${item.kind}s\` : state.route.view}/\${item.id}">
      <div class="row-ref">\${item.kind} #\${item.ref}</div>
      <div class="row-main">
        <strong>\${escapeHtml(item.title || item.channel)}</strong>
        <span>\${escapeHtml(item.summary || item.body || "")}</span>
      </div>
      \${badge(status)}
    </a>
  \`;
}

function renderOverview() {
  const b = state.batch;
  renderShell(\`
    <header class="page-header">
      <div>
        <p class="eyebrow">\${new Date(b.generated_at).toLocaleString()}</p>
        <h1>Daily intelligence cockpit</h1>
        <p>\${escapeHtml(b.offer)}</p>
      </div>
      <button class="secondary" id="refreshBtn">\${t.refresh}</button>
    </header>
    <section class="summary-grid">
      <div><span>\${t.buyer}</span><strong>\${escapeHtml(b.buyer)}</strong></div>
      <div><span>\${t.signals}</span><strong>\${b.signals.length}</strong></div>
      <div><span>\${t.actions}</span><strong>\${b.actions.length}</strong></div>
      <div><span>\${t.drafts}</span><strong>\${b.drafts.length}</strong></div>
    </section>
    <section class="split">
      <div>
        <h2>Top signals</h2>
        \${b.signals.slice(0, 4).map((item) => itemRow({ ...item, kind: "signal" })).join("")}
      </div>
      <div>
        <h2>Ready actions</h2>
        \${b.actions.slice(0, 4).map((item) => itemRow({ ...item, kind: "action" })).join("")}
      </div>
    </section>
  \`);
  document.querySelector("#refreshBtn")?.addEventListener("click", load);
}

function renderList() {
  const items = byView();
  const selected = state.route.id ? items.find((item) => item.id === state.route.id) : items[0];
  renderShell(\`
    <header class="page-header">
      <div>
        <p class="eyebrow">\${items.length} items</p>
        <h1>\${state.route.view}</h1>
      </div>
    </header>
    <section class="workbench">
      <div class="list-pane">\${items.map(itemRow).join("")}</div>
      <div class="detail-pane">\${selected ? detail(selected) : "<p>No items.</p>"}</div>
    </section>
  \`);
  bindDecisionForm(selected);
}

function detail(item) {
  const decision = state.decisions[item.id] || {};
  const status = effectiveStatus(item);
  const body = decision.edited_body || item.body || item.summary || "";
  return \`
    <article class="detail">
      <div class="detail-top">
        <span class="row-ref">\${item.kind} #\${item.ref}</span>
        \${badge(status)}
      </div>
      <h2>\${escapeHtml(item.title || item.channel)}</h2>
      <p>\${escapeHtml(item.summary || "")}</p>
      \${item.source ? \`<div class="field"><span>\${t.evidence}</span><a href="\${item.source.url}" target="_blank" rel="noreferrer">\${escapeHtml(item.source.name)}</a></div>\` : ""}
      \${item.why_it_matters ? \`<div class="field"><span>\${t.why}</span><p>\${escapeHtml(item.why_it_matters)}</p></div>\` : ""}
      \${item.buyer_intent ? \`<div class="field"><span>\${t.buyerIntent}</span><p>\${escapeHtml(item.buyer_intent)}</p></div>\` : ""}
      \${item.next_step ? \`<div class="field"><span>\${t.nextStep}</span><p>\${escapeHtml(item.next_step)}</p></div>\` : ""}
      \${item.kind === "draft" ? \`<label class="field"><span>\${t.editedDraft}</span><textarea id="editedBody">\${escapeHtml(body)}</textarea></label>\` : ""}
      <label class="field"><span>\${t.reviewNote}</span><textarea id="reviewNote">\${escapeHtml(decision.note || "")}</textarea></label>
      <div class="actions-bar">
        <button data-action="approve">\${t.approve}</button>
        <button class="secondary" data-action="request_changes">\${t.requestChanges}</button>
        <button class="danger" data-action="block">\${t.block}</button>
        \${item.kind === "draft" ? \`<button class="secondary" data-action="revise">\${t.revise}</button>\` : ""}
      </div>
    </article>
  \`;
}

function bindDecisionForm(item) {
  if (!item) return;
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-action");
      await fetch(\`/api/decisions/\${item.id}\`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: document.querySelector("#reviewNote")?.value || "",
          edited_body: document.querySelector("#editedBody")?.value || ""
        })
      });
      await load();
    });
  });
}

function renderSources() {
  const rows = (state.batch.sources || []).map((source) => \`
    <div class="source-row">
      <strong>\${escapeHtml(source.label)}</strong>
      \${badge(source.status)}
      <p>\${escapeHtml(source.coverage || "")}</p>
      <span>\${escapeHtml(source.freshness || "")}</span>
    </div>
  \`).join("");
  renderShell(\`<header class="page-header"><h1>\${t.sources}</h1></header><section class="panel">\${rows}</section>\`);
}

function renderSettings() {
  const s = state.appState || {};
  renderShell(\`
    <header class="page-header"><h1>\${t.settings}</h1></header>
    <section class="panel settings">
      <div><span>Config</span><strong>\${escapeHtml(s.files?.config || "")}</strong></div>
      <div><span>Provider</span><strong>\${escapeHtml(s.config_summary?.provider || "local")}</strong></div>
      <div><span>Batch file</span><code>\${escapeHtml(s.files?.batch || "")}</code></div>
      <div><span>Decisions file</span><code>\${escapeHtml(s.files?.decisions || "")}</code></div>
      <div><span>Language</span><select id="langSelect"><option value="auto">Auto</option><option value="en">English</option><option value="zh">中文</option></select></div>
    </section>
  \`);
  const select = document.querySelector("#langSelect");
  if (select) {
    select.value = langOverride;
    select.addEventListener("change", () => {
      localStorage.setItem("lang", select.value);
      location.reload();
    });
  }
}

function render() {
  state.route = parseRoute();
  if (!state.batch) return;
  if (state.route.view === "overview") return renderOverview();
  if (state.route.view === "sources") return renderSources();
  if (state.route.view === "settings") return renderSettings();
  return renderList();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

window.addEventListener("hashchange", render);
load();
setInterval(() => {
  const active = document.activeElement;
  if (active && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName)) return;
  load();
}, 10000);
`;
}

function css(s) {
  const accent = accentMap[s.accent] || accentMap.blue;
  return `:root {
  --accent: ${accent};
  --accent-soft: color-mix(in srgb, var(--accent) 13%, white);
  --accent-line: color-mix(in srgb, var(--accent) 28%, white);
  --text: #17202a;
  --muted: #667085;
  --line: #e6e8ec;
  --panel: #ffffff;
  --bg: #f6f7f9;
  --danger: #b42318;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--bg);
  letter-spacing: 0;
}
a { color: inherit; text-decoration: none; }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 280px 1fr; }
.sidebar { background: #fff; border-right: 1px solid var(--line); padding: 18px; display: flex; flex-direction: column; gap: 16px; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.brand-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--accent); color: white; display: grid; place-items: center; font-weight: 700; }
.brand strong, .brand span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brand span, .eyebrow, .field span, .summary-grid span, .settings span { color: var(--muted); font-size: 12px; }
.attention { background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: 8px; padding: 12px; }
.attention-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.attention-row strong { font-size: 22px; color: var(--accent); }
nav { display: grid; gap: 4px; }
.nav-item { padding: 10px 12px; border-radius: 7px; color: #344054; }
.nav-item.active { background: var(--accent); color: white; }
.main { padding: 24px; min-width: 0; }
.page-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
h1, h2 { margin: 0; letter-spacing: 0; }
h1 { font-size: 26px; }
h2 { font-size: 17px; margin-bottom: 10px; }
.page-header p { margin: 6px 0 0; color: var(--muted); max-width: 900px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.summary-grid div, .panel, .split > div, .detail { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
.summary-grid strong { display: block; margin-top: 6px; font-size: 18px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.workbench { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
.list-pane, .detail-pane { min-width: 0; }
.item-row { display: grid; grid-template-columns: 76px 1fr auto; gap: 12px; align-items: center; background: white; border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.item-row:hover { border-color: var(--accent-line); }
.row-ref { font-size: 12px; color: var(--muted); text-transform: capitalize; }
.row-main { min-width: 0; }
.row-main strong, .row-main span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-main span { color: var(--muted); font-size: 13px; margin-top: 3px; }
.badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; background: #f2f4f7; color: #344054; white-space: nowrap; }
.badge.approved { background: #ecfdf3; color: #027a48; }
.badge.blocked, .badge.changes-requested { background: #fef3f2; color: var(--danger); }
.detail-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.detail p { line-height: 1.5; color: #344054; }
.field { display: block; margin-top: 14px; }
.field span { display: block; margin-bottom: 5px; }
.field textarea { width: 100%; min-height: 96px; border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: inherit; resize: vertical; }
.actions-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
button { border: 0; border-radius: 7px; padding: 9px 12px; background: var(--accent); color: white; font: inherit; cursor: pointer; }
button.secondary { background: #eef1f5; color: #344054; }
button.danger { background: #fef3f2; color: var(--danger); }
.source-row { border-bottom: 1px solid var(--line); padding: 12px 0; }
.source-row:last-child { border-bottom: 0; }
.source-row p { color: #344054; margin: 8px 0 4px; }
.settings { display: grid; gap: 12px; }
code { display: block; white-space: normal; word-break: break-all; background: #f2f4f7; border-radius: 6px; padding: 8px; }
select { border: 1px solid var(--line); border-radius: 7px; padding: 8px; font: inherit; }

@media (max-width: 820px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { position: static; border-right: 0; border-bottom: 1px solid var(--line); }
  nav { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .nav-item { text-align: center; }
  .main { padding: 16px; }
  .summary-grid, .split, .workbench { grid-template-columns: 1fr; }
  .item-row { grid-template-columns: 64px 1fr; }
  .item-row .badge { grid-column: 2; justify-self: start; }
}
`;
}

function startSh(s) {
  return `#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$APP_DIR/.." && pwd)"

if [ ! -d "$SKILL_DIR/node_modules/hono" ] || [ ! -d "$SKILL_DIR/node_modules/@hono/node-server" ]; then
  echo "Installing ${s.slug} server dependencies (first run)..."
  (cd "$SKILL_DIR" && npm install)
fi

exec node "$APP_DIR/server/launcher.ts"
`;
}

function validateTs() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const batchPath = process.argv[2] || path.join(skillDir, "app", ".data", "current_batch.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

function fail(message: string): never {
  console.error(\`Schema validation failed: \${message}\`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reqString(obj: Record<string, unknown>, key: string, where: string) {
  if (typeof obj[key] !== "string" || String(obj[key]).length === 0) fail(\`\${where}.\${key} must be a non-empty string\`);
}

function reqNumber(obj: Record<string, unknown>, key: string, where: string) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(\`\${where}.\${key} must be a number\`);
}

async function readJson(file: string) {
  const raw = await fs.readFile(file, "utf8").catch((error) => fail(\`cannot read \${file}: \${error.message}\`));
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(\`invalid JSON in \${file}: \${(error as Error).message}\`);
  }
}

const batch = await readJson(batchPath);
if (!isObject(batch)) fail("root must be an object");
for (const key of ["schema_version", "batch_id", "generated_at", "source", "vertical", "buyer", "offer"]) reqString(batch, key, "root");
if (!isObject(batch.metrics)) fail("root.metrics must be an object");
for (const key of ["signals_needs_review", "actions_needs_review", "drafts_needs_review", "approved", "blocked"]) reqNumber(batch.metrics, key, "root.metrics");
for (const key of ["signals", "actions", "drafts", "sources"]) {
  if (!Array.isArray(batch[key])) fail(\`root.\${key} must be an array\`);
}

const ids = new Set<string>();
function checkBase(item: unknown, where: string) {
  if (!isObject(item)) fail(\`\${where} must be an object\`);
  reqString(item, "id", where);
  reqNumber(item, "ref", where);
  reqString(item, "title", where);
  reqString(item, "status", where);
  if (!STATUSES.has(String(item.status))) fail(\`\${where}.status is invalid: \${item.status}\`);
  if (ids.has(String(item.id))) fail(\`\${where}.id duplicates \${item.id}\`);
  ids.add(String(item.id));
  if (!Array.isArray(item.risk) && where.includes("draft")) fail(\`\${where}.risk must be an array\`);
  return item;
}

(batch.signals as unknown[]).forEach((item, index) => {
  const signal = checkBase(item, \`root.signals[\${index}]\`);
  for (const key of ["summary", "why_it_matters", "buyer_intent", "detected_at"]) reqString(signal, key, \`root.signals[\${index}]\`);
  reqNumber(signal, "confidence", \`root.signals[\${index}]\`);
  if (!isObject(signal.source)) fail(\`root.signals[\${index}].source must be an object\`);
  reqString(signal.source, "name", \`root.signals[\${index}].source\`);
  reqString(signal.source, "url", \`root.signals[\${index}].source\`);
});

(batch.actions as unknown[]).forEach((item, index) => {
  const action = checkBase(item, \`root.actions[\${index}]\`);
  for (const key of ["summary", "priority", "owner", "reason", "next_step"]) reqString(action, key, \`root.actions[\${index}]\`);
  if (!Array.isArray(action.linked_signal_ids)) fail(\`root.actions[\${index}].linked_signal_ids must be an array\`);
});

(batch.drafts as unknown[]).forEach((item, index) => {
  const draft = checkBase(item, \`root.drafts[\${index}]\`);
  for (const key of ["channel", "body", "linked_action_id"]) reqString(draft, key, \`root.drafts[\${index}]\`);
});

(batch.sources as unknown[]).forEach((item, index) => {
  if (!isObject(item)) fail(\`root.sources[\${index}] must be an object\`);
  for (const key of ["id", "label", "status"]) reqString(item, key, \`root.sources[\${index}]\`);
});

console.log(\`OK: \${batchPath}\`);

const decisionsExists = await fs.access(decisionsPath).then(() => true, () => false);
if (decisionsExists) {
  const decisions = await readJson(decisionsPath);
  if (!isObject(decisions) || !isObject(decisions.decisions)) fail("decisions.decisions must be an object");
  for (const [id, decision] of Object.entries(decisions.decisions)) {
    if (!isObject(decision)) fail(\`decisions[\${id}] must be an object\`);
    reqString(decision, "action", \`decisions[\${id}]\`);
    if (!ACTIONS.has(String(decision.action))) fail(\`decisions[\${id}].action invalid: \${decision.action}\`);
    if (!ids.has(id)) console.warn(\`Warning: decision for unknown item id \${id}\`);
  }
  console.log(\`OK: \${decisionsPath}\`);
}
`;
}

function generateBatchTs() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeDemoBatch } from "../app/server/demo.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(skillDir, "app", ".data", "current_batch.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, \`\${JSON.stringify(makeDemoBatch(), null, 2)}\\n\`);
console.log(\`Wrote \${outPath}\`);
`;
}

function executeTs() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apply = process.argv.includes("--apply");
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const batchPath = path.join(dataDir, "current_batch.json");
const decisionsPath = path.join(dataDir, "decisions.json");
const reportPath = path.join(dataDir, "execution_report.json");

async function readJson(file: string, fallback: any) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const batch = await readJson(batchPath, null);
if (!batch) {
  console.error("No current_batch.json. Generate or collect a batch first.");
  process.exit(1);
}
const decisions = await readJson(decisionsPath, { decisions: {} });
const items = [...(batch.signals || []), ...(batch.actions || []), ...(batch.drafts || [])];
const operations = [];

for (const item of items) {
  const decision = decisions.decisions?.[item.id];
  if (!decision) continue;
  if (decision.action === "approve") {
    operations.push({
      item_id: item.id,
      operation: item.channel ? "handoff_content_pack" : item.next_step ? "export_action_plan" : "mark_signal_approved",
      target: item.channel || item.title,
      status: apply ? "done" : "dry_run",
      note: decision.note || ""
    });
  } else if (decision.action === "request_changes") {
    operations.push({ item_id: item.id, operation: "queue_agent_revision", status: apply ? "queued" : "dry_run", note: decision.note || "" });
  } else if (decision.action === "block") {
    operations.push({ item_id: item.id, operation: "mark_blocked", status: apply ? "done" : "dry_run", note: decision.note || "" });
  } else if (decision.action === "revise") {
    operations.push({ item_id: item.id, operation: "save_human_revision", status: apply ? "done" : "dry_run", note: decision.note || "" });
  }
}

const report = {
  schema_version: "1",
  generated_at: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  batch_id: batch.batch_id,
  operations
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, \`\${JSON.stringify(report, null, 2)}\\n\`);
console.log(JSON.stringify(report, null, 2));
`;
}

async function write(file, content, mode) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  if (mode) await fs.chmod(file, mode);
}

for (const s of scenarios) {
  const dir = path.join(skillsDir, s.slug);
  await write(path.join(dir, "SKILL.md"), skillMd(s));
  await write(path.join(dir, "package.json"), packageJson(s));
  await write(path.join(dir, "agents", "openai.yaml"), openaiYaml(s));
  await write(path.join(dir, "config.example.json"), configExample(s));
  await write(path.join(dir, "references", "ui-schema.md"), schemaMd(s));
  await write(path.join(dir, "app", "index.html"), html(s));
  await write(path.join(dir, "app", "styles.css"), css(s));
  await write(path.join(dir, "app", "app.js"), appJs());
  await write(path.join(dir, "app", "i18n", "messages.js"), messagesJs());
  await write(path.join(dir, "app", "start.sh"), startSh(s), 0o755);
  await write(path.join(dir, "app", "server", "paths.ts"), pathsTs(s));
  await write(path.join(dir, "app", "server", "demo.ts"), demoTs(s));
  await write(path.join(dir, "app", "server", "store.ts"), storeTs());
  await write(path.join(dir, "app", "server", "hono.ts"), honoTs());
  await write(path.join(dir, "app", "server", "index.ts"), indexTs());
  await write(path.join(dir, "app", "server", "launcher.ts"), launcherTs(), 0o755);
  await write(path.join(dir, "scripts", "generate_batch.ts"), generateBatchTs(), 0o755);
  await write(path.join(dir, "scripts", "validate_ui_schema.ts"), validateTs(), 0o755);
  await write(path.join(dir, "scripts", "execute_decisions.ts"), executeTs(), 0o755);
  console.log(`generated ${s.slug}`);
}

console.log(`Generated ${scenarios.length} industry-intelligence skills.`);
