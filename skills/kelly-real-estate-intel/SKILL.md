---
name: kelly-real-estate-intel
license: MIT
description: "Kelly Real Estate Intel: App-in-Skill daily industry intelligence cockpit for real estate and property agencies. Use when the user asks about real estate, property agencies, listings, transactions, competitor ads, client follow-up, or a地产/中介 intelligence workflow. Prepares news/source signals, buyer-intent interpretation, approved sales actions, and channel drafts for review before any external handoff."
---

# Kelly Real Estate Intel

## Overview

Use this skill as Kelly's daily industry-intelligence operator for **real estate and property agencies**.

It turns current news sources, trend signals, competitor movement, customer questions, and buyer-intent clues into a small reviewable batch:

- source-backed signals;
- why each signal matters to the buyer;
- sales or operating actions for today;
- draft messages/content for WhatsApp follow-up, agent朋友圈, listing pitch;
- blocked claims that need human, legal, compliance, or domain review.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, prepare or refresh the local batch, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## Product Package

- **Buyer**: property agency owners, team leads, and individual agents.
- **Pain**: agents miss timely listing angles, competitor pushes, and reasons to follow up with silent clients.
- **Offer**: daily property intelligence that becomes push-listing suggestions, WhatsApp follow-ups, and social posts.
- **Demo source mix**: property news, listing portals, transaction reports, competitor ads, mortgage/rate news, and local district events.

Sales framing:

> Every morning, AI watches the sources that affect your business, turns them into today's sales actions, and puts the drafts in a review queue before anything becomes official.

Do not lead with "AI platform", "agent workspace", "database", or model names. Lead with the daily business scene.

## Boundary

- The skill may browse public/current sources, reason over buyer intent, draft actions/content, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never post content, send WhatsApp/email, mutate CRMs, scrape private systems, spend money, or perform external side effects.
- Customer-visible drafts, regulated claims, pricing promises, medical/financial/legal advice, and outbound messages are approval-required.
- Store only the minimal source excerpts needed for review. Do not commit `config.local.json`, env files, `app/.data/`, exports, screenshots of private sources, or raw customer data.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real monitoring.

Ask for non-secret setup details only:

- company/brand name, geography, language, and customer segment;
- 3-10 public source URLs or source categories to monitor;
- competitor names/URLs;
- approved offer, CTA, and forbidden claims;
- preferred channels among WhatsApp follow-up, agent朋友圈, listing pitch;
- whether Busabase should be the review provider later.

Never ask for API keys or platform tokens in chat. Secrets belong in env files only.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the cockpit with:

```bash
skills/kelly-real-estate-intel/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_REAL_ESTATE_INTEL_UI_PORT` when set.

Required views:

- `#/overview`: human-attention panel, today's top signals, ready actions, blocked items, and source coverage.
- `#/signals` and `#/signals/<id>`: source-backed signals with evidence links, buyer-intent interpretation, confidence, risk badges, and suggested next action.
- `#/actions` and `#/actions/<id>`: approved/blocked/reviewable operating or sales actions.
- `#/drafts` and `#/drafts/<id>`: editable WhatsApp follow-up, agent朋友圈, listing pitch drafts with approve/request-changes/block decisions.
- `#/sources`: configured source categories, freshness, and gaps.
- `#/settings`: sanitized config summary, onboarding state, provider, language, and accent color.

Demo mode:

- `?demo=1`, `?demo=overview`, `?demo=signals`, `?demo=actions`, `?demo=drafts`, and `?demo=detail` load deterministic demo data.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo API responses never read/write `app/.data/` or private config.

## File Contract

Read `references/ui-schema.md` before changing the app, scripts, or generated JSON.

- `app/.data/current_batch.json`: current intelligence batch.
- `app/.data/decisions.json`: user verdicts and edits keyed by item id.
- `app/.data/agent_tasks.json`: queued agent work for requested changes or missing evidence.
- `app/.data/execution_report.json`: dry-run/apply handoff report.
- `app/.data/onboarding.json`: setup marker.
- `app/.data/agent.lock`: temporary lock while the skill writes files.

Validate with:

```bash
node skills/kelly-real-estate-intel/scripts/validate_ui_schema.ts skills/kelly-real-estate-intel/app/.data/current_batch.json
```

## Normal Workflow

1. Detect mode. Default to App UI.
2. Browse or otherwise collect current public evidence. For news/trends, use exact dates and source URLs.
3. Build one narrow buyer scene, not a generic AI report.
4. Write a batch with signals, actions, drafts, and source coverage. Keep every item tied to evidence or mark it blocked.
5. Validate the batch.
6. Launch the UI for review.
7. Poll `agent_tasks.json` for requested changes and revise only those items.
8. On "execute/export approved", re-read decisions and run `scripts/execute_decisions.ts` first as a dry run. Apply only after explicit confirmation.

## Safety Defaults

- Treat outbound messages, regulated claims, medical/financial/legal advice, pricing promises, and publishing as approval-required.
- If source evidence is weak, mark the item `blocked` or lower confidence instead of pretending.
- Preserve source language unless the workflow asks for translation.
- Use Busabase as the later shared review provider when the workflow needs team approvals; local files remain the reference implementation.
