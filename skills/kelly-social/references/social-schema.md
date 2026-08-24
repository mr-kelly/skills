# Kelly Social Schema

Use this schema when reading or writing Kelly Social's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-social-app/app/js/providers/busabase-provider.js`, `content/kelly-social-app/app/js/social-model.js`).
Monitoring rollups (`metrics`), the derived `warnings` list, and every
draft's social-qa gate are computed client-side from these Bases on every
read — they are never stored.

Platform vocabulary: `x | facebook | instagram | linkedin | youtube |
threads | tiktok | xiaohongshu | manual`.

Collection methods: `browser_agent | api | manual_export`.

Review states (drafts / shorts / engagement): `needs_review |
changes_requested | approved | done | blocked`.

Social-qa gate verdicts: `SHIP | FIX | BLOCK`.

## Accounts (`kelly-social-accounts`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable domain id, required |
| `platform` | `platform` | text | see platform vocabulary above |
| `handle` | `handle` | text | e.g. `@kellyships` |
| `display-name` | `display_name` | text | |
| `profile-url` | `profile_url` | text | optional public profile URL |
| `collection` | `collection` | text | how the agent gathers this account's data |
| `status` | `status` | text | `ok\|warning\|error`; anything but `ok` surfaces as a derived warning |
| `notes` | `notes` | longtext | required when `status != ok` — becomes the warning message |
| `metrics` | `metrics` | longtext | JSON `AccountMetrics` (see below) |
| `follower-series` | `follower_series` | longtext | JSON array of `{date, followers}`, one point per collection date |
| `traffic-sources` | `traffic_sources` | longtext | JSON array of `{source, share}`; `share` is a 0-1 fraction; optional |
| `last-sync-at` | `last_sync_at` | text | ISO timestamp |

`AccountMetrics` JSON shape: `{followers, following, posts, impressions_7d,
impressions_28d, engagements_7d, engagement_rate_7d, profile_visits_7d,
followers_delta_7d, followers_delta_28d}`. Rates are 0-1 fractions, not
percentages.

## Posts (`kelly-social-posts`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `post-id` | `post_id` | text | stable domain id, required |
| `platform` | `platform` | text | |
| `account-id` | `account_id` | text | must reference an `accounts` row |
| `provider-post-id` | `provider_post_id` | text | platform-native post id |
| `posted-at` | `posted_at` | text | ISO timestamp |
| `type` | `type` | text | `post\|thread\|reel\|story\|video\|article` |
| `text` | `text` | longtext | full post text in its original language |
| `media` | `media` | text | `none\|image\|video\|carousel\|link` |
| `media-count` | `media_count` | number | `0` when `media = none` |
| `permalink` | `permalink` | text | public URL of the post |
| `metrics` | `metrics` | longtext | JSON `PostMetrics`: `{likes, replies, reposts, views, saves, clicks}` |
| `engagement-rate` | `engagement_rate` | number | computed and stored at ingest time: `(likes+replies+reposts+saves)/views` when `views>0`, else `0` |
| `agent-notes` | `agent_notes` | longtext | optional short observation from the collecting agent |
| `tags` | `tags` | longtext | JSON array of strings |

Normalize per-platform vocabulary into these fields: X replies/reposts,
Facebook comments/shares, Instagram comments/shares map onto
`replies`/`reposts`; views/impressions/plays map onto `views`. Missing
metrics are `0`, never absent.

## Sync Log (`kelly-social-sync-log`)

Append-only, written only by `scripts/ingest_snapshot.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `sync-id` | `sync_id` | text | stable id, e.g. `sync-<account_id>-<timestamp>`, required |
| `account-id` | `account_id` | text | |
| `method` | `method` | text | `browser_agent\|api\|manual_export` |
| `started-at` | `started_at` | text | ISO timestamp |
| `completed-at` | `completed_at` | text | ISO timestamp |
| `status` | `status` | text | `ok\|warning\|error` |
| `posts-collected` | `posts_collected` | number | |
| `message` | `message` | longtext | short human-readable note; never credentials, cookies, or session tokens |
| `actor` | `actor` | text | agent or collector id |

## Calendar (`kelly-social-calendar`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entry-id` | `entry_id` | text | stable id, required |
| `date` | `date` | text | `YYYY-MM-DD` |
| `channel` | `channel` | text | platform |
| `pillar` | `pillar` | text | theme pillar, e.g. `build-in-public` |
| `title` | `title` | text | short slot title |
| `status` | `status` | text | `planned\|drafting\|scheduled\|published\|skipped` |
| `draft-id` | `draft_id` | text | optional link to a `drafts` row |
| `scheduled-for` | `scheduled_for` | text | optional ISO timestamp |
| `notes` | `notes` | longtext | optional |

`publish_post` sets a linked entry's `status` to `scheduled` and its
`scheduled-for` to the approved schedule time.

## Drafts (`kelly-social-drafts`)

The post composer / draft review queue.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `draft-id` | `draft_id` | text | stable id, required |
| `channels` | `channels` | longtext | JSON array of platforms |
| `pillar` | `pillar` | text | theme pillar |
| `hook` | `hook` | text | first-line hook |
| `body` | `body` | longtext | post body |
| `hashtags` | `hashtags` | longtext | JSON array of strings |
| `cta` | `cta` | text | call to action |
| `status` | `status` | text | workflow status; a `BLOCK` gate overrides this to `blocked` at render time regardless of the stored value |
| `scheduled-for` | `scheduled_for` | text | optional ISO timestamp |
| `agent-notes` | `agent_notes` | longtext | optional |
| `review-note` | `review_note` | longtext | human note on `changes_requested` / approval |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

There is no stored `gate` field: `evaluateGate({hook, body, hashtags, cta,
channels})` in `content/kelly-social-app/app/js/social-model.js` recomputes the social-qa
`{verdict, score, checks, summary}` live from the draft's own copy on every
read, so an edited draft is always judged by its current text.

## Shorts (`kelly-social-shorts`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `short-id` | `short_id` | text | stable id, required |
| `channels` | `channels` | longtext | JSON array of platforms |
| `pillar` | `pillar` | text | theme pillar |
| `title` | `title` | text | script title |
| `hook` | `hook` | text | opening hook |
| `status` | `status` | text | workflow status |
| `duration-s` | `duration_s` | number | total duration in seconds |
| `shots` | `shots` | longtext | JSON array of `{shot_no, visual, voiceover, duration_s, on_screen_text?}` |
| `caption` | `caption` | text | optional |
| `hashtags` | `hashtags` | longtext | JSON array of strings |
| `agent-notes` | `agent_notes` | longtext | optional |
| `review-note` | `review_note` | longtext | optional |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Engagement (`kelly-social-engagement`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable id, required |
| `platform` | `platform` | text | |
| `account-id` | `account_id` | text | optional; which of our accounts it landed on |
| `kind` | `kind` | text | `mention\|comment\|dm\|reply` |
| `author-handle` | `author_handle` | text | `@someone` |
| `incoming-text` | `incoming_text` | longtext | the incoming message |
| `received-at` | `received_at` | text | ISO timestamp |
| `sentiment` | `sentiment` | text | `positive\|neutral\|negative\|question` |
| `priority` | `priority` | text | `low\|normal\|high` |
| `draft-reply` | `draft_reply` | longtext | agent-drafted reply |
| `status` | `status` | text | workflow status |
| `review-note` | `review_note` | longtext | optional |
| `permalink` | `permalink` | text | optional |

## Settings (`kelly-social-settings`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-social-crisis` | `crisis` | `{status: "calm\|watch\|active", publishing_paused, spokesperson?, updated_at?, steps: [{step_id, label, detail, owner?, done}]}` |
| `kelly-social-share-of-voice` | `share_of_voice` | `{window: "7d", total_mentions, entries: [{name, is_self, mentions_7d, share}]}` (`share` is a 0-1 fraction; exactly one entry should have `is_self: true`) |

## Decisions

A human verdict writes directly onto the item record — there is no separate
decisions Base:

- `review_draft` / `review_short` / `review_engagement`: writes `status` and
  `review-note`. Approving a draft whose gate is `BLOCK` is refused.
- `publish_post`: requires the draft's stored `status` to already be
  `approved` and its live gate to not be `BLOCK`, then writes `status:
  "done"` and `scheduled-for` — the recorded intent, never a network call.
  Also updates any `calendar` row linked by `draft-id` to `status:
  "scheduled"`.
- `send_reply`: requires the engagement item's `status` to already be
  `approved`, then writes `status: "done"`.
- `crisis_toggle`: read-modify-writes the `kelly-social-crisis` settings row
  (`status`, `publishing_paused`, and/or one step's `done`).

## Ingest (`scripts/ingest_snapshot.mjs`)

The trusted collector-write path. Reads a payload JSON file (see the header
comment in the script for the exact shape), validates it, and upserts
`accounts` (metrics/follower-series/traffic-sources merge, `status`/`notes`
set from any per-account `warnings[]` entry in the payload), upserts `posts`
by `post-id`, and appends one `sync-log` row per account. It never touches
the ECHO publishing-desk Bases (`calendar`/`drafts`/`shorts`/`engagement`/
`settings`) — those are compose/approval state the AirApp itself owns.
Connects with its own credentials (`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` /
`BUSABASE_SPACE_ID`), never the AirApp's ambient session. Writes are gated
behind `--apply` (default dry run).
