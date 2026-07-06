# Kelly Social Snapshot Schema

Use this schema for `app/.data/social_snapshot.json`. Keep the shape stable so the local app, the ingest script, and future collectors can evolve independently. All writes must go through `scripts/ingest_snapshot.mjs`.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-social",
  "range": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "metrics": {
    "account_count": 0,
    "post_count": 0,
    "total_followers": 0,
    "followers_delta_7d": 0,
    "followers_delta_28d": 0,
    "impressions_7d": 0,
    "engagements_7d": 0,
    "engagement_rate_7d": 0
  },
  "accounts": [],
  "posts": [],
  "sync_log": [],
  "warnings": [],
  "calendar": [],
  "drafts": [],
  "shorts": [],
  "engagement": [],
  "crisis": { "status": "calm", "publishing_paused": false, "steps": [] },
  "share_of_voice": { "window": "7d", "total_mentions": 0, "entries": [] }
}
```

`metrics` is a rollup across accounts and is recomputed by `ingest_snapshot.mjs` on every merge; do not hand-edit it.

The snapshot has two halves. The **monitoring** half (`accounts`, `posts`, `sync_log`, `warnings`, `metrics`, `range`) is written only by `ingest_snapshot.mjs`. The **publishing** half (`calendar`, `drafts`, `shorts`, `engagement`, `crisis`, `share_of_voice`) is optional, read by the app, and mutated in place through `POST /api/operation`; the ingest script preserves these keys untouched. All publishing fields may be absent on legacy snapshots.

## Account

```json
{
  "account_id": "stable local id",
  "platform": "x|facebook|instagram|linkedin|youtube|threads|tiktok|xiaohongshu|manual",
  "handle": "@kellyships",
  "display_name": "Kelly Ships",
  "profile_url": "optional public profile URL",
  "collection": "browser_agent|api|manual_export",
  "status": "ok|warning|error|not_configured",
  "metrics": {
    "followers": 0,
    "following": 0,
    "posts": 0,
    "impressions_7d": 0,
    "impressions_28d": 0,
    "engagements_7d": 0,
    "engagement_rate_7d": 0,
    "profile_visits_7d": 0,
    "followers_delta_7d": 0,
    "followers_delta_28d": 0
  },
  "follower_series": [
    { "date": "YYYY-MM-DD", "followers": 0 }
  ],
  "traffic_sources": [
    { "source": "For You feed", "share": 0.46 }
  ],
  "last_sync_at": "ISO timestamp",
  "notes": "optional"
}
```

- `collection` declares how the agent gathers this account's data; it mirrors the account entry in private config.
- `follower_series` powers the inline SVG sparklines. Keep one point per collection date; `ingest_snapshot.mjs` merges series points by `date` (newest payload wins).
- `traffic_sources` is optional; include it only when the platform's analytics expose it. `share` is a 0-1 fraction.
- Rates (`engagement_rate_7d`) are 0-1 fractions, not percentages.

## Post

```json
{
  "post_id": "stable local id",
  "platform": "x|facebook|instagram|linkedin|youtube|threads|tiktok|xiaohongshu|manual",
  "account_id": "stable local account id",
  "provider_post_id": "platform-native post id",
  "posted_at": "ISO timestamp",
  "type": "post|thread|reel|story|video|article",
  "text": "full post text in its original language",
  "media": "none|image|video|carousel|link",
  "media_count": 0,
  "permalink": "public URL of the post",
  "metrics": {
    "likes": 0,
    "replies": 0,
    "reposts": 0,
    "views": 0,
    "saves": 0,
    "clicks": 0
  },
  "engagement_rate": 0,
  "agent_notes": "optional short observation from the collecting agent",
  "tags": ["optional"]
}
```

Normalize per-platform vocabulary into these fields: X replies/reposts, Facebook comments/shares, Instagram comments/shares map onto `replies`/`reposts`; views/impressions/plays map onto `views`. Missing metrics are `0`, never `null`. `engagement_rate` = (likes + replies + reposts + saves) / views when views > 0.

## Sync Log Entry

```json
{
  "sync_id": "stable id, e.g. sync-<account_id>-<timestamp>",
  "account_id": "stable local account id",
  "method": "browser_agent|api|manual_export",
  "started_at": "ISO timestamp",
  "completed_at": "ISO timestamp",
  "status": "ok|warning|error",
  "posts_collected": 0,
  "message": "short human-readable note about the run",
  "actor": "agent or collector id"
}
```

`ingest_snapshot.mjs` appends one entry per payload account on every merge and keeps the newest 200 entries. Never store credentials, cookies, or session tokens in messages.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "account_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

Use warnings for stale exports, missing tokens, partial collections, rate-limit backoffs, or metric fields a platform stopped exposing.

## Publishing Desk (ECHO)

These sections drive the publishing half. They travel through the same data provider and are mutated by `POST /api/operation` (one `PublishingOperation` per call); the app writes local files only, and real publishing/replying is skill-executed after human approval. The five-state review model is `needs_review | changes_requested | approved | done | blocked`.

### Calendar Entry

```json
{
  "entry_id": "stable id",
  "date": "YYYY-MM-DD",
  "channel": "x|facebook|instagram|linkedin|youtube|threads|tiktok|xiaohongshu|manual",
  "pillar": "theme pillar, e.g. build-in-public",
  "title": "short slot title",
  "status": "planned|drafting|scheduled|published|skipped",
  "draft_id": "optional link to a composer draft",
  "scheduled_for": "optional ISO timestamp",
  "notes": "optional"
}
```

### Post Draft

```json
{
  "draft_id": "stable id",
  "channels": ["x", "linkedin"],
  "pillar": "theme pillar",
  "hook": "first-line hook",
  "body": "post body",
  "hashtags": ["#tag"],
  "cta": "call to action",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "scheduled_for": "optional ISO timestamp",
  "gate": {
    "verdict": "SHIP|FIX|BLOCK",
    "score": 0,
    "checks": [{ "id": "banned-claims", "label": "Banned claims", "result": "pass|warn|fail", "note": "optional" }],
    "summary": "optional"
  },
  "agent_notes": "optional",
  "review_note": "optional human note",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

The `gate` is the pre-publish `social-qa` result (see `lib/social-qa.ts`). A `BLOCK` verdict forces `status: "blocked"` and the app refuses to approve or publish the draft.

### Short Script

```json
{
  "short_id": "stable id",
  "channels": ["instagram", "tiktok"],
  "pillar": "theme pillar",
  "title": "script title",
  "hook": "opening hook",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "duration_s": 30,
  "shots": [
    { "shot_no": 1, "visual": "what's on screen", "voiceover": "VO line", "duration_s": 5, "on_screen_text": "optional" }
  ],
  "caption": "optional",
  "hashtags": ["optional"],
  "agent_notes": "optional",
  "review_note": "optional",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

### Engagement Item

```json
{
  "item_id": "stable id",
  "platform": "x|facebook|instagram|linkedin|youtube|threads|tiktok|xiaohongshu|manual",
  "account_id": "optional local account id",
  "kind": "mention|comment|dm|reply",
  "author_handle": "@someone",
  "incoming_text": "the incoming message",
  "received_at": "ISO timestamp",
  "sentiment": "positive|neutral|negative|question",
  "priority": "low|normal|high",
  "draft_reply": "agent-drafted reply",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "review_note": "optional",
  "permalink": "optional"
}
```

### Crisis Playbook

```json
{
  "status": "calm|watch|active",
  "publishing_paused": false,
  "spokesperson": "optional",
  "updated_at": "optional ISO timestamp",
  "steps": [
    { "step_id": "cr-1", "label": "Triage the signal", "detail": "what to do", "owner": "optional", "done": false }
  ]
}
```

### Share of Voice

```json
{
  "window": "7d",
  "total_mentions": 0,
  "entries": [{ "name": "You", "is_self": true, "mentions_7d": 0, "share": 0.0 }]
}
```

`share` is a 0-1 fraction. Project this from monitoring data; exactly one entry should have `is_self: true`.

### Operations

`POST /api/operation` accepts one of: `review_draft` / `review_short` / `review_engagement` (`{ id, status, review_note? }`), `publish_post` (`{ draft_id, channel?, scheduled_for? }`), `send_reply` (`{ item_id, channel? }`), or `crisis_toggle` (`{ status?, publishing_paused?, step_id?, done? }`). It refuses to approve or publish a gate-`BLOCK`ed draft.

## Validation

Run `node scripts/validate_ui_schema.mjs [path]` before relying on a snapshot in the UI. The validator enforces required fields, platform/collection/media enums, unique ids, and account references for posts and sync entries. The publishing sections (`calendar`, `drafts`, `shorts`, `engagement`, `crisis`, `share_of_voice`) are validated only when present, including review-state and gate-verdict enums.
