---
name: kelly-radar
license: MIT
description: Kelly's market-intelligence desk as a local App-in-Skill. Merges passive competitor monitoring (Radar), agent-run deep research with approved briefs and cited reports (Research), and keyword/topic demand signals (Trends) over one snapshot, watchlist, and review model. Use when the user invokes $kelly-radar or /kelly-radar, or asks for competitor monitoring, market intelligence, market research, research reports, trends, rising keywords, pricing changes, product launches, changelog diffs, competitor reviews, funding or hiring news, or opportunity triage.
---

# Kelly Radar

## Overview

Use this skill as Kelly's market-intelligence desk. One skill merges three complementary functions that share a snapshot, a watchlist, and the review model:

1. **Radar (passive monitoring)**: the agent periodically checks a watchlist of competitors and market sources — pricing pages, changelogs, landing pages (diffs), Product Hunt category launches, competitor app-store/G2 reviews, funding/hiring news — and files normalized signals with change highlights. Kelly triages each signal: act / watch / ignore.
2. **Research (active deep dives)**: Kelly queues research questions; the agent drafts a research brief (scope, sources, expected depth) for approval, then runs deep multi-source research and files a cited report into the local library. Kelly reads, annotates, asks follow-ups (which become agent tasks), and rates confidence.
3. **Trends (demand signals)**: keyword/topic trend movers — rising search queries, community topic volume, category interest — collected by the agent (optionally cross-read from a kelly-seo snapshot) and turned into opportunity cards.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local radar snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

Collection is agent-driven: browser automation skills in the agent session, web search, or manual payloads. The app itself only renders local snapshot files and never touches any network beyond `127.0.0.1`.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Radar overview"></td>
    <td width="50%"><img src="assets/screenshots/research.webp" alt="Kelly Radar research desk"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Market-intelligence desk with signals to triage, watchlist freshness, top trend movers, and the research pipeline.</td>
    <td><strong>Research desk</strong><br>Research questions moving through brief approval, deep research, and cited report review.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Radar competitor signals"></td>
    <td width="50%"><img src="assets/screenshots/trends.webp" alt="Kelly Radar trends"></td>
  </tr>
  <tr>
    <td><strong>Signals</strong><br>Competitor pricing, changelog, launch, review, and hiring signals with severity badges and Act/Watch/Ignore triage.</td>
    <td><strong>Trends</strong><br>Rising keywords and community topics with momentum sparklines and opportunity cards for content or roadmap handoff.</td>
  </tr>
</table>

## Boundary

- Collection is read-only over public pages and Kelly's own analytics. Respect robots.txt and site terms of service, throttle politely, and never scrape private, gated, or personal data.
- The skill may read public sources, normalize signals/trends, run approved research, and write local handoff files.
- The app reads and writes local files only. It must not fetch remote pages, post anywhere, or mutate remote systems.
- Handoffs to sibling skills (kelly-writer content briefs, kelly-feedback roadmap candidates) and any outbound artifacts are approval-required: Kelly approves in the UI, then `scripts/execute_decisions.mjs` records the concrete operation for the agent to carry out.
- Do not commit `config.local.json`, env files, `app/.data/`, exports, or raw crawled content.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before any monitoring or research.

Private config priority:

1. `KELLY_RADAR_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-radar/config.local.json`
3. `~/.config/kelly-radar/config.json`
4. `skills/kelly-radar/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_RADAR_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-radar/.env.local`
5. `~/.config/kelly-radar/.env`

Onboarding asks, turn by turn:

- Products and positioning: what Kelly sells, to whom, and against whom.
- Watch targets and sources: competitors/categories/keywords/communities, each with monitored source URLs and a method (`browser_agent` or `manual`).
- Research defaults: default depth (`quick|standard|deep`), source policy, citation requirement, max sources.
- Trend sources: which search/community/category signals to collect, and any optional API env var names (never secret values in chat).

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the desk with:

```bash
skills/kelly-radar/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_RADAR_UI_PORT` when set. The launcher reuses a running instance only if `/api/state` reports `app: "kelly-radar"`.

Required app views (hash routes):

- `#/overview`: intel command desk — human-attention panel (signals to triage, briefs awaiting approval, reports ready to read, follow-ups running), watchlist freshness, this week's top signals, top trend movers, research pipeline mini-status.
- `#/signals` and `#/signals/<id>`: the radar feed — source-type badge, watch target, headline, change summary, severity, detected time, triage state. Detail shows before→after diff highlights, evidence links, the agent's why-it-matters note, triage buttons (Act / Watch / Ignore / Needs info), a `Review note` textarea, and stable refs like `Signal #1`.
- `#/watchlist` and `#/watchlist/<id>`: monitored targets with per-source method, last check, 7-day signal counts, status; detail shows sources, recent signal history, and notes.
- `#/research` and `#/research/<id>`: research desk. Questions table with status (`brief_needs_review → researching → report_ready → annotated/closed`). Detail switches by stage: brief stage shows the agent-drafted brief with approve/request-changes/block; report stage shows the cited report, annotations, confidence rating, and a follow-up box that files an agent task.
- `#/trends`: trend movers with source badge, volume proxy, delta arrow, inline SVG momentum sparkline, and linked opportunity cards carrying an approvable next step.
- `#/settings`: sanitized config — watchlist summary, research defaults, trend sources, env readiness booleans, data provider, onboarding state. Never expose secret values.

Demo mode:

- `?demo=<scene>` opens deterministic mock data: `overview`, `signals`, `research`, `trends`, `detail` (a signal detail with a pricing-page diff).
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Deep links like `/?demo=research&lang=en#/research` must work.
- Demo API responses never read or write live sources or files under `app/.data/`.

UI language: English and Chinese chrome with `Auto` default (`navigator.languages`), an explicit selector persisted locally, and domain content kept in its original language.

## File Contract

Read `references/radar-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/radar_snapshot.json`: canonical snapshot — `watchlist[]`, `signals[]`, `research { questions[], briefs[], reports[] }`, `trends { movers[], opportunities[] }`, `metrics`, `sync_log[]`.
- `app/.data/decisions.json`: Kelly's verdicts keyed by item id (signal triage, brief approvals, opportunity approvals, report confidence).
- `app/.data/agent_tasks.json`: queued agent work — revise-brief requests, collect-more-evidence requests, research follow-ups.
- `app/.data/execution_report.json`: latest `execute_decisions.mjs` output.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes files. Signal triage, brief approvals, and opportunity approvals in the app are rejected while it exists, and all ingest scripts refuse to run.

Validate with `node scripts/validate_ui_schema.mjs app/.data/radar_snapshot.json` before relying on a snapshot.

## Monitoring Workflow

1. Cadence comes from config (`cadence.monitor`, default daily). On a monitoring run, iterate the configured watchlist sources with method `browser_agent` (browser automation or web search in the agent session; `manual` sources are supplied by the user as payloads).
2. For each changed source, build a normalized signal: headline, 1-3 sentence change summary, `why_it_matters`, severity, evidence links, and — for page changes — a before→after `diff.lines` block. Propose a triage (`act|watch|ignore|needs_info`) and, when acting is obvious, a concrete `handoff`.
3. Write signals through the single write path: save the payload JSON, then run `node scripts/ingest_signals.mjs <payload.json>`. The script validates, dedupes by target+source+content hash, merges, refreshes watchlist freshness and metrics, appends `sync_log`, and honors the lock.
4. Dedupe rules: a signal whose `content_hash` already exists is skipped; re-detections of the same change must not create new rows. Prefer one signal per change, not per crawl.
5. Kelly triages in the app: Act = approve (queues the handoff), Watch = leave in review with a note, Ignore = done, Needs info = blocked (enqueues a collect-more-evidence agent task).

## Research Workflow

1. Kelly asks a question (in chat or as a follow-up in the app). File it with a drafted brief: `node scripts/file_report.mjs <payload.json>` with a `brief` block — scope, planned sources, depth, expected deliverable. The question enters `brief_needs_review`.
2. Kelly reviews the brief in `#/research/<id>`: approve (question moves to `researching`), request changes (agent task; revise and re-file), or block.
3. After approval, run the deep multi-source research within the brief's scope and source policy. Every claim that matters must carry a citation.
4. File the report with `node scripts/file_report.mjs <payload.json>` with a `report` block. The script validates the citation shape (every section's `source_ids` resolve; every source has title+url), links the report to its question, and flips the question to `report_ready`.
5. Kelly reads, annotates, rates confidence (0-5), and asks follow-ups in the app; follow-ups land in `agent_tasks.json` for another research round.

## Trends Workflow

1. Cadence from config (`cadence.trends`, default weekly). Collect keyword/topic movers from the configured trend sources: rising search queries, community topic volume, category interest.
2. Optionally cross-read a kelly-seo snapshot (read-only): `node scripts/ingest_trends.mjs <payload.json> /path/to/kelly-seo/app/.data/<snapshot>.json` imports rising queries when present and degrades gracefully when absent.
3. `ingest_trends.mjs` dedupes movers by keyword+source, updates volume/delta/momentum for existing movers, and can add opportunity cards.
4. Turn sustained movers into opportunity cards with a `proposed_next_step` (content brief → kelly-writer, roadmap candidate → kelly-feedback). Kelly approves or ignores each card in `#/trends`.

## Decisions And Agent Tasks Loop

1. The app writes verdicts to `decisions.json` and queues work into `agent_tasks.json` (revise brief, collect more evidence, research follow-ups). Poll `agent_tasks.json` when the skill is invoked and work the queue.
2. Before executing anything, re-read decisions and run `node scripts/execute_decisions.mjs` (dry-run). It converts approved items into concrete operations in `execution_report.json`: `handoff_content_brief` → kelly-writer, `handoff_roadmap_candidate` → kelly-feedback, `add_watch_source` → watchlist target id, `start_research` → question id. No external side effects.
3. After Kelly confirms the dry-run, perform the handoffs (invoke the sibling skill or update config), then run `node scripts/execute_decisions.mjs --apply` to mark items done and log the run.
4. Acquire `app/.data/agent.lock` before the skill rewrites snapshot/decision files, and remove it in a `finally` step. The ingest scripts do this automatically.

## Safety Defaults

- Treat handoffs, outbound artifacts, config changes, and anything customer-visible as approval-required.
- Keep crawls polite: cache, throttle, and store only the minimal excerpt needed for the diff and evidence.
- Redact tokens and personal data from signals, reports, logs, and UI state; expose only boolean readiness for configured env vars.
- Keep ingestion idempotent via stable ids and content hashes so repeated runs never duplicate rows.
- If a source cannot be verified (A/B tests, geo-variants), file the signal as `needs_info`/blocked rather than guessing.
