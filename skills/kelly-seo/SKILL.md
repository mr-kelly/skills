---
name: kelly-seo
license: MIT
description: Personal App-in-Skill desk covering SEO + GEO (AI-search) + brand entity — wired to Google Search Console for a local dashboard over search analytics and an agent-prepared SEO opportunities review queue, plus an AI-visibility tracker (are we cited in ChatGPT / Perplexity / Gemini / Claude / Copilot answers), a GEO content-optimization queue gated by geo-qa, and an entity / knowledge-panel readiness checklist. Use when the user invokes $kelly-seo or /kelly-seo, mentions SEO, Google Search Console, GSC, search analytics, search performance, queries, keywords, rankings, positions, impressions, clicks, CTR, striking-distance queries, title/meta rewrites, content briefs, internal links, SEO opportunities review, GEO, generative engine optimization, AI search, AI visibility, being cited by AI answer engines, ChatGPT/Perplexity/Gemini/Claude/Copilot citations, brand entity, knowledge panel, Wikidata, schema.org, or entity readiness.
---

# Kelly SEO

## Overview

Use this skill as Kelly's local SEO + GEO desk. It pulls Google Search Console search analytics (clicks, impressions, CTR, position for queries and pages across configured site properties) into one file-backed App-in-Skill dashboard, and runs an agent-prepared SEO opportunities review queue: title/meta rewrites, internal-link suggestions, new-content briefs, and page-issue fixes that the user approves, edits, or blocks.

It also covers the AI-search side (GEO — Generative Engine Optimization): an AI-visibility tracker showing whether AI answer engines (ChatGPT / Perplexity / Gemini / Claude / Copilot) cite the brand for a set of tracked prompts, a GEO content-optimization review queue (agent-drafted rewrites that make a page more citable, each scored by the `geo-qa` quality gate), and a brand-entity / knowledge-panel readiness checklist (Wikidata, schema.org Organization/Person, consistent NAP, sameAs links). GEO opportunities and entity signals flow through the same data-provider layer and the same five-state review model as SEO opportunities.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local SEO snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly SEO overview"></td>
    <td width="50%"><img src="assets/screenshots/queries.webp" alt="Kelly SEO queries"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Search Console KPI cards with daily clicks/impressions chart, top movers, and per-site freshness.</td>
    <td><strong>Queries</strong><br>Top queries with clicks, impressions, CTR, position, period deltas, and opportunity badges.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/pages.webp" alt="Kelly seo pages"></td>
    <td width="50%"><img src="assets/screenshots/opportunities.webp" alt="Kelly seo opportunities"></td>
  </tr>
  <tr>
    <td><strong>Pages</strong><br>Page-level click and impression table with top growth and decline movers for prioritizing content updates.</td>
    <td><strong>Opportunities</strong><br>Ranked SEO opportunity queue with impact, effort, evidence, and recommended next actions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/geo.webp" alt="Kelly SEO AI visibility"></td>
    <td width="50%"><img src="assets/screenshots/optimize.webp" alt="Kelly SEO GEO optimizer"></td>
  </tr>
  <tr>
    <td><strong>AI visibility (GEO)</strong><br>An engines×prompts matrix of where the brand is cited across ChatGPT, Perplexity, Gemini, Claude, and Copilot, with an overall visibility score and trend.</td>
    <td><strong>GEO optimizer</strong><br>Agent-proposed rewrites that make pages more citable by AI engines, gated by geo-qa — one blocked for a fabricated stat.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/entity.webp" alt="Kelly seo entity readiness"></td>
  </tr>
  <tr>
    <td><strong>Entity readiness</strong><br>Entity readiness checklist showing schema coverage, citation signals, and blocked/ready status for AI answer engines.</td>
  </tr>
</table>

## Boundary

- The skill may read the Google Search Console API (read-only scope), normalize search analytics, prepare opportunity drafts, validate schemas, and write local handoff files.
- GSC access is read-only. The skill never mutates Search Console properties, submits sitemaps, or requests indexing without an explicit, separately approved user request.
- The app reads and writes local files only. It must not call the GSC API, edit site content, or mutate remote systems.
- Site-content edits happen only through approved opportunities, executed by the agent OUTSIDE the app (editing the site's repo/CMS), and reported back to `app/.data/execution_report.json`. GEO content changes follow the same rule: approved in `#/optimize`, published by the agent outside the app.
- AI-visibility data is observational: the agent gathers whether engines cite the brand and records it into the snapshot. Never fabricate a citation, an answer position, or a stat — the `geo-qa` gate BLOCKs ungrounded claims for exactly this reason.
- Do not commit `config.local.json`, env files, service-account keys, access tokens, or anything under `app/.data/`.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before syncing real data.

Private config priority:

1. `KELLY_SEO_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-seo/config.local.json`
3. `~/.config/kelly-seo/config.json`
4. `skills/kelly-seo/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_SEO_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-seo/.env.local`
5. `~/.config/kelly-seo/.env`

Onboarding asks for non-secret details only: which site properties to track (`property_url`, a short `site_id`, verification type) and which auth method to use. Never ask the user to paste keys or tokens into chat.

Auth methods (choose one):

- Service account (recommended for recurring syncs): the user creates a Google Cloud service account, downloads its JSON key, and adds the service account's email address as a user on each Search Console property (Settings → Users and permissions → Add user, Full or Restricted read access). Point `KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE` at the key file path in a local env file.
- Plain OAuth access token (for quick manual runs): put a short-lived token with scope `https://www.googleapis.com/auth/webmasters.readonly` in `KELLY_SEO_GSC_ACCESS_TOKEN`.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the dashboard with:

```bash
skills/kelly-seo/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_SEO_UI_PORT` when set. The launcher reuses a running Kelly SEO server only when `/api/state` proves it is the same app; otherwise it picks the next free port.

Required app views:

- `#/overview`: SEO command desk. Per-site KPI cards (clicks, impressions, CTR, average position, 28d vs previous 28d deltas), a daily clicks/impressions trend, top movers (queries with the biggest click gains and losses), site freshness (last sync), and the human-attention panel for opportunities needing review.
- `#/queries`: top queries table with clicks, impressions, CTR, position, deltas vs the previous period, and opportunity badges such as "position 8-15" or "CTR below expected". Selecting a row opens `#/queries/<id>` with a per-query trend, top pages for the query, and agent notes.
- `#/pages`: top pages table with URL, clicks, impressions, CTR, position, deltas, and indexing/canonical warnings when present. Detail at `#/pages/<id>` shows the per-page trend and top queries for the page.
- `#/opportunities`: review queue with workflow states `needs_review`, `changes_requested`, `approved`, `done`, and `blocked`. Each agent-proposed action (title/meta rewrite with draft, internal-link suggestion, new-content brief, fix-page issue) carries a reason, expected impact, an editable draft, decision buttons (approve / request changes / block), a `Review note` textarea, and a stable reference such as `Opportunity #1`.
- `#/geo`: AI-visibility tracker. An engines × prompts matrix showing, for each tracked prompt, which AI answer engines (ChatGPT / Perplexity / Gemini / Claude / Copilot) cite the brand, at what answer position, with what sentiment and cited page, plus an overall AI-visibility score and a visibility-over-time trend.
- `#/optimize`: GEO content-optimization review queue with the same `needs_review / changes_requested / approved / done / blocked` states. Each agent-proposed change (citable rewrite, quotable stats, Q&A block, schema markup) carries a target prompt, reason, expected impact, an editable draft, kb-style grounding lines, and a `geo-qa` gate verdict (SHIP / FIX / BLOCK). A change the gate BLOCKs (for example a fabricated stat) cannot be approved until the failing checks are resolved.
- `#/entity`: entity / knowledge-panel readiness checklist of brand-entity signals (Wikidata entity, Wikipedia/notability, schema.org Organization, sameAs links, consistent NAP, founder/person entity) with a present / partial / missing status, an agent-proposed fix for each gap, and an overall readiness score.
- `#/sites`: configured properties with property URL, verification type, last sync, and 28d totals per site. The site switcher filters overview/queries/pages.
- `#/settings`: sanitized config only: sites, auth method plus env readiness booleans (never key contents), data provider, and onboarding state.

Demo mode:

- `?demo=1` opens a deterministic mock SEO desk for documentation and screenshots.
- `?demo=overview`, `?demo=queries`, `?demo=pages`, `?demo=opportunities`, `?demo=geo`, `?demo=optimize`, `?demo=entity`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write live GSC data or files under `app/.data/`. Demo decisions stay in the browser only.

UI language: support English and Chinese chrome with `Auto` default. Keep queries, page URLs, and imported search data in their original language.

## File Contract

Read `references/seo-schema.md` before editing the app, scripts, or any generated SEO JSON.

Primary local files:

- `app/.data/seo_snapshot.json`: canonical dashboard snapshot (sites, daily series, queries, pages, opportunities, metrics) generated by the skill/scripts.
- `app/.data/decisions.json`: user verdicts and notes keyed by opportunity id.
- `app/.data/geo_decisions.json`: user verdicts on GEO content-optimization opportunities, keyed by GEO opportunity id.
- `app/.data/entity_signals.json`: user overrides for entity-readiness signals (status + note), keyed by signal id.
- `app/.data/agent_tasks.json`: queued agent work — opportunities in `changes_requested` with the user's revision note.
- `app/.data/execution_report.json`: latest execution results for approved opportunities.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is syncing, regenerating opportunities, or executing. The app rejects decision writes while the lock exists.
- `config.local.json`: private site/auth configuration, ignored by git.

Use `scripts/validate_ui_schema.mjs app/.data/seo_snapshot.json` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

## Sync Workflow

1. Detect mode. Default to App UI.
2. Load private config. If only `config.example.json` exists, enter onboarding.
3. If the user asks to sync, confirm the scope: which properties and the date window (default last 28 days plus the previous 28 days for deltas).
4. Acquire `app/.data/agent.lock`, run `scripts/sync_gsc.mjs`, and release the lock. The script pulls Search Analytics dimensioned by query, by page, and by date for both windows, normalizes into the snapshot, computes deltas and opportunity badges, and preserves the existing `opportunities[]` batch.
5. Validate with `scripts/validate_ui_schema.mjs`, start/reuse the UI, and report the URL.
6. GSC data lags about two days; the sync window ends two days before today. Surface API errors and missing-property warnings in the snapshot `warnings[]`, never as silent failures.

`scripts/sync_gsc.mjs` fails gracefully with setup guidance when neither `KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE` nor `KELLY_SEO_GSC_ACCESS_TOKEN` is usable. It is never required for demo mode or app startup.

## Opportunities Workflow

1. After a sync, analyze the snapshot for striking-distance queries (position 8-15), CTR below the expected curve for the position, pages losing clicks, internal-link gaps, and page issues. Write proposed actions into `seo_snapshot.json` `opportunities[]` with stable ids, sequential `ref` numbers, a reason, an expected impact, and an editable draft.
2. Send the user to `#/opportunities` to review. The user approves, edits drafts, requests changes with a note, or blocks.
3. Poll `app/.data/agent_tasks.json` for `changes_requested` items, revise the draft per the note, and return the item to `needs_review`.
4. On explicit user request to execute, run `scripts/execute_decisions.mjs` (dry-run by default). It re-checks the lock and decisions and writes `execution_report.json` entries with concrete operations (`rewrite_title`, `add_internal_links`, `create_content_brief`, `fix_page_issue`) and target page/query — no external side effects.
5. The agent then performs the approved edits in the site's repo/CMS outside the app, records real results in `execution_report.json`, and marks executed opportunities `done` in the snapshot.

## GEO (AI-search) Workflow

1. GEO state lives in the same `seo_snapshot.json` under `ai_visibility` (tracked prompts × engines with position + sentiment + trend), `geo_opportunities` (agent-proposed citable rewrites), and `entity_signals` (the readiness checklist). Route all reads/writes through the data-provider layer — never bypass it with raw `node:fs`.
2. For each agent-proposed GEO change, run the `geo-qa` gate (`lib/geo-qa.ts`) over the draft. It returns SHIP / FIX / BLOCK with a GEO Quality Score and per-check notes. The primary failure is an ungrounded/fabricated stat — a number in the copy with no cited source. A BLOCK is a hard gate: the app rejects an approve (HTTP 422) until the change is fixed.
3. Send the user to `#/optimize` to review. Approvals are written to `app/.data/geo_decisions.json`; the app writes local files only. Execution semantics: `operation: publish_geo_change, page, draft_id` — the agent publishes the approved citable content in the site's repo/CMS OUTSIDE the app, then records the real result and marks the item `done`.
4. Entity-readiness edits from `#/entity` are written to `app/.data/entity_signals.json` with `operation: update_entity_signal`. The agent then earns the real signal (create the Wikidata item, add the sameAs links, standardize the brand name) outside the app.
5. Never invent an AI-visibility number, a citation, or a stat. If a claim in a GEO draft is not grounded in a real source, the gate must BLOCK it — do not ship content that an AI engine would then quote verbatim.

## Safety Defaults

- Treat anything that changes live site content, metadata, redirects, canonical tags, or robots rules as approval-required via the opportunities queue.
- Prefer the read-only GSC scope; never store key file contents or tokens in the snapshot, logs, UI state, or reports — expose only env readiness booleans.
- Keep local data minimal: top queries/pages and aggregates, not raw exports beyond what the dashboard needs.
- Use stable ids and refs so repeated syncs and executions are idempotent.
- If GSC totals and per-dimension rows disagree (sampling/privacy filtering), do not invent corrections; add a snapshot warning explaining the gap.
