---
name: kelly-social
license: MIT
description: Personal App-in-Skill social media command desk for Kelly's Twitter/X, Facebook, and Instagram accounts (extensible to LinkedIn, YouTube, Threads, TikTok, Xiaohongshu) — monitoring AND publishing on the ECHO discipline (Explore / Craft / Host / Observe). Use when the user invokes $kelly-social or /kelly-social, wants social media aggregation, unified cross-platform timelines, account stats, follower counts, follower growth, engagement rates, impressions, social traffic metrics, post performance, top posts, agent-driven collection of their own accounts, OR the publishing side: a content calendar, agent-drafted post/short-video review and approval, an engagement (mentions/comments) reply inbox, a crisis playbook, share-of-voice, or a pre-publish quality gate.
---

# Kelly Social

## Overview

Use this skill as Kelly's local social media command desk. It does two jobs on the **ECHO** discipline — **E**xplore, **C**raft, **H**ost, **O**bserve:

- **Monitor** (Observe): aggregate her Twitter/X, Facebook, and Instagram accounts (and later LinkedIn, YouTube, Threads, TikTok, Xiaohongshu) into one file-backed dashboard — per-platform KPI cards, a unified cross-platform timeline, account detail pages with follower trends, per-post engagement metrics, and share-of-voice vs competitors.
- **Publish** (Explore / Craft / Host): a review-and-approval workflow where the **agent drafts → the human approves → the skill publishes**. A content calendar, a post composer / draft queue, a short-video scripter, and an engagement (mentions/comments) reply inbox — all gated by a five-state review model and a pre-publish quality gate.

Collection is agent-driven, not API-first: most of these platforms have hostile or expensive APIs, so the agent gathers the data through the method configured per account and normalizes it into a local snapshot. The app only renders and mutates local files; it never touches any network beyond `127.0.0.1`. **Real publishing and replying is skill-executed out of band, only after a human approves** — the app records intent, it does not post.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local social snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Social overview"></td>
    <td width="50%"><img src="assets/screenshots/timeline.webp" alt="Kelly Social unified timeline"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Cross-platform KPI cards for X, Instagram, and Facebook with follower trends and top posts of the week.</td>
    <td><strong>Unified timeline</strong><br>Posts across all platforms in one stream with per-post likes, replies, reposts, and view counts.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/detail.webp" alt="Kelly social detail"></td>
    <td width="50%"><img src="assets/screenshots/accounts.webp" alt="Kelly social accounts"></td>
  </tr>
  <tr>
    <td><strong>Detail</strong><br>Single-post performance view with platform metrics, comments, reply drafts, and approval status.</td>
    <td><strong>Accounts</strong><br>Connected-account health board with platform status, audience totals, content cadence, and sync freshness.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/calendar.webp" alt="Kelly Social content calendar"></td>
    <td width="50%"><img src="assets/screenshots/compose.webp" alt="Kelly Social post composer"></td>
  </tr>
  <tr>
    <td><strong>Content calendar</strong><br>Scheduled posts across channels by theme pillar and date, with status and approvals.</td>
    <td><strong>Compose (publishing)</strong><br>Agent-drafted posts in a review queue with hooks, hashtags, and CTAs, behind a social-qa SHIP/FIX/BLOCK gate — one draft blocked for a banned claim.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/engagement.webp" alt="Kelly social engagement"></td>
  </tr>
  <tr>
    <td><strong>Engagement</strong><br>Mentions and comments inbox grouped by urgency, sentiment, owner, and reply-approval state.</td>
  </tr>
</table>

## Boundary

- The skill (agent side) may read the user's own social accounts and their public metrics, parse analytics exports the user downloaded, call an official API when the user configured one, normalize the data, validate schemas, draft posts/short-video scripts/replies for human review, and write local handoff files through `scripts/ingest_snapshot.ts` (monitoring snapshot) and `POST /api/operation` (publishing-desk state).
- The app reads and writes local files only. It must not initiate platform requests, post, like, follow, delete, or mutate any remote system. Publishing and replying happen **only after a human approves in the review queue**, and the real platform action is performed by the skill out of band — never by the app, and never automatically.
- Collect only the user's own accounts plus the public metrics attached to their own posts. Never scrape other people's private data, DMs, or non-public profiles.
- Respect login sessions the user owns: reuse an existing authenticated browser session; never ask for, capture, or store passwords, cookies, or session tokens anywhere (not in config, snapshots, sync logs, or chat).
- Respect platform terms of service: prefer official analytics exports and user-owned sessions, throttle politely (small page counts, pauses between navigations, stop on rate-limit signals), and never bypass anti-bot walls.
- The skill must never create fake engagement: no automated likes, follows, comments, reposts, or engagement pods. Normal Kelly Social operation is read-only aggregation.
- Treat all account data as personal. Do not commit `config.local.json`, env files, `app/.data/`, exports, or tokens.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before collecting real accounts.

Private config priority:

1. `KELLY_SOCIAL_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-social/config.local.json`
3. `~/.config/kelly-social/config.json`
4. `skills/kelly-social/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_SOCIAL_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-social/.env.local`
5. `~/.config/kelly-social/.env`

Onboarding asks, turn by turn: which platforms the user is on, the handle and display name per account, and the collection method per account — `browser_agent` (agent browses with the user's own logged-in session), `manual_export` (user downloads the platform's analytics export and tells the skill where it is), or `api` (user has an official API token; ask only for the env var name that holds it). Ask for non-secret details only. Never ask the user to paste secret values into chat; secrets belong only in local env files.

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
skills/kelly-social/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_SOCIAL_UI_PORT` when set. `/api/state` reports `app: "kelly-social"` so the launcher can reuse a matching server and skip past ports held by other apps.

Required app views — monitoring (Observe):

- `#/overview`: social command desk. Per-platform KPI cards (followers, following, posts, impressions, engagement rate, profile visits) with 7d/28d deltas and platform badges, a cross-platform followers trend summary with inline SVG sparklines, top posts this week, **share-of-voice vs competitors**, and collection freshness per account (last sync + method).
- `#/timeline`: unified reverse-chronological timeline across all platforms. Each row shows platform badge, account, timestamp, text preview, media indicator, and per-post metrics (likes, replies/comments, reposts/shares, views/impressions). Platform badge chips filter the list.
- `#/timeline/<post_id>`: Post Detail. Full text, metrics breakdown, engagement rate, permalink, and agent notes.
- `#/accounts`: account inventory. Handle, platform, display name, followers, growth deltas, engagement rate, last sync, and collection method.
- `#/accounts/<account_id>`: Account Detail. Profile summary, follower trend rendered as an inline SVG sparkline (no chart library), top posts, traffic sources when available, and sync history with warnings.
- `#/settings`: sanitized setup summary. Account handles, platforms, collection methods, configured env var readiness booleans, data provider name, and onboarding state. Never expose secret values.

Required app views — publishing desk (Explore / Craft / Host):

- `#/calendar`: content calendar. Scheduled posts across channels with theme pillars, dates, publish status, and links to the linked draft when one exists.
- `#/compose`: post composer / draft approval queue. Agent-drafted posts (hook + body + hashtags + CTA + target channels) as review items, each carrying its social-qa gate result. Human edits/approves/blocks. Workflow chips filter by the five review states (`needs_review | changes_requested | approved | done | blocked`). An approved, gate-passing draft exposes a **Publish** action.
- `#/shorts`: short-video scripter for Reels / Shorts / TikTok / Douyin. Shot lists (visual + voiceover + duration + on-screen text) plus caption and hashtags, reviewed on the same five-state model.
- `#/engagement`: engagement inbox. Incoming mentions/comments with agent-drafted replies (approval-gated). Approve to expose a **Send reply** action.
- `#/crisis`: crisis playbook. A small incident-response checklist (triage, spokesperson, pause-publishing, holding statement, review) plus a live incident-status toggle (calm / watch / active) and a publishing-pause switch.

The quality gate (⛩ `social-qa`, in `lib/social-qa.ts`): every draft is scored 0–100 (SQS) across brand voice, disclosure, and banned claims, producing a **SHIP / FIX / BLOCK** verdict. A BLOCK forces the draft to `blocked` and disables approve/publish until it is revised.

Writes go through one endpoint, `POST /api/operation`, carrying one `PublishingOperation`: `review_draft`, `review_short`, `review_engagement`, `publish_post` (`{ draft_id, channel?, scheduled_for? }`), `send_reply` (`{ item_id, channel? }`), or `crisis_toggle`. The app writes local files only; the skill performs the real platform action post-approval.

Demo mode:

- `?demo=1` opens a deterministic mock dashboard for documentation and screenshots.
- `?demo=overview`, `?demo=timeline`, `?demo=accounts`, `?demo=detail`, `?demo=calendar`, `?demo=compose`, `?demo=shorts`, `?demo=engagement`, and `?demo=crisis` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write live platform data or local private snapshot files. `POST /api/operation?demo=1` echoes a synthetic ok and never mutates real state.

UI language: support English and Chinese chrome with `Auto` default. Keep handles, post text, and imported data in their original language.

## File Contract

Read `references/social-schema.md` before editing the app, scripts, or any generated snapshot JSON.

Primary local files:

- `app/.data/social_snapshot.json`: canonical snapshot. The **monitoring** sections (accounts with metric series, posts, metrics rollups, `sync_log[]`, `warnings[]`) are written only by `scripts/ingest_snapshot.ts`. The **publishing** sections (`calendar[]`, `drafts[]`, `shorts[]`, `engagement[]`, `crisis`, `share_of_voice`) are read by the app and mutated in place through `POST /api/operation`; `ingest_snapshot.ts` preserves them untouched on every merge.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is collecting or rewriting files. This is a dashboard-type App-in-Skill: there is no `decisions.json`, but the lock must still be honored as a read-only indicator by the app and by `ingest_snapshot.ts`.
- `config.local.json`: private account configuration, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/social_snapshot.json` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists. Demo mode never reads `app/.data/`.

## Collection Workflow

1. Detect mode. Default to App UI.
2. Load private config. If only `config.example.json` exists, enter onboarding.
3. If the user asks to refresh data, propose a collection scope first: which accounts, date window, and method per account.
4. Acquire `app/.data/agent.lock` before collecting (owner `kelly-social`, short message, `started_at`). Remove it in a `finally` step.
5. Collect per account according to its `collection` value:
   - `browser_agent`: use a browser automation skill available in the session (for example a Stagehand/Playwright `browser` skill) with the user's own logged-in session. Read the user's profile page and their own posts' public/analytics metrics. Throttle politely: few pages, pauses between navigations, stop and report on rate-limit or captcha signals. Never enter credentials, never store cookies.
   - `manual_export`: ask the user for the platform's analytics export (e.g. Meta Business Suite CSV, X analytics CSV, TikTok/YouTube studio export), parse it locally, and note the export date. Warn when an export is older than 7 days.
   - `api`: call the official API with the token from the configured env var, read-only scopes only.
6. Normalize the collected data into the payload shape documented in `references/social-schema.md` and `scripts/ingest_snapshot.ts`, write it to a temp file, then run `node scripts/ingest_snapshot.ts <payload.json>`. This is the single write path: it validates, merges by stable ids, appends per-account `sync_log` entries, and recomputes rollups. Do not write `social_snapshot.json` directly.
7. Validate with `scripts/validate_ui_schema.ts`, start/reuse the UI, and report the URL.
8. Surface collection problems (stale exports, missing metrics, rate limits) as snapshot `warnings[]` rather than guessing numbers.

Platform vocabulary normalization: map replies/comments onto `replies`, reposts/shares onto `reposts`, and views/impressions/plays onto `views`. Preserve provenance: `platform`, `provider_post_id`, `permalink`, and original handles. Deduplicate by stable ids (`post_id`, `account_id`) so repeated collections are idempotent.

## Safety Defaults

- Treat posting, liking, following, deleting, and any other remote mutation as out of scope; if the user asks, require explicit approval and a separate, clearly-scoped plan.
- Only collect the user's own accounts and public metrics; skip anything requiring someone else's login or private data.
- Never store passwords, cookies, tokens, or session material in any file this skill writes. Expose only boolean readiness for configured secret env vars.
- Throttle politely and back off on rate-limit or anti-bot signals; a stale dashboard beats a banned account.
- Keep local snapshots minimal and use stable ids so repeated ingests are idempotent.
- If numbers between a platform's UI and an export disagree, do not invent corrections. Mark the account `warning` and explain the mismatch.
