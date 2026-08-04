# Kelly Drama Schema

Use this schema when reading or writing Kelly Drama's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`). Completeness, attention
counts, and shot readiness are computed client-side from
`project`/`characters`/`relationships`/`episodes`/`shots`/`tasks` on every
read (`app/app/js/drama-model.js`) — they are never stored.

One workspace = exactly one drama project (series bible + characters +
relationships + episodes + storyboard shots + review tasks). The retired
local-file app's multi-project "library"/project-switcher was never
exercised by the shipped UI and is not ported — each Busabase Space/AirApp
instance holds one drama project, same as every other converted skill.

Statuses: `characters`/`episodes`/`shots`/`tasks` `status` is
`draft|needs_review|changes_requested|approved|done|blocked`.
Generation-status fields (`reference-card-status`, `voice-reference-status`,
`image-status`, `video-status`) are
`draft|ready_to_generate|planned|requested|generated|blocked`.

## Binary media: Busabase Drive Assets, not Base fields

Every character reference-card image, character reference-voice sample, and
shot storyboard image/video is a real **Busabase Asset** (`busabase-sdk`'s
`assets` client: `createUploadUrl` → PUT bytes → `confirm`). Unlike a sibling
skill (kelly-mv) where the human uploads their own MP3/reference image
directly, the retired Kelly Drama app's UI had **no manual asset-upload
affordance at all** — every image/video/voice is either AI-generated or
absent, so every upload in this skill happens from a trusted skill-root
script (`scripts/execute_generation_requests.mjs`), never the browser. Only
the returned **asset id** is stored on the owning record
(`reference-card-asset-id`, `voice-reference-asset-id`, `image-asset-id`,
`video-asset-id`, and the `assetId` inside each JSON candidate). The app
resolves an asset id to a fetchable URL via `assets.get({assetId})` (cached
per page load) and renders it directly as an `<img>`/`<audio>`/`<video>`
`src`.

**Known OSS limitation**, confirmed live against the exact `busabase@0.11.0`
standalone CLI every converted skill's integration test targets:
`assets.createUploadUrl()` returns an `/api/dev/upload` target, and that
route 404s ("Not available in production") under the CLI's own production
`NODE_ENV` gate — so a real Asset upload does not complete against that
specific packaged CLI today, independent of anything this AirApp does (see
`app/server.js` and `app/app/js/drama-client.js` for the full trace). The
code is written against the documented SDK contract and mirrors Busabase's
own product usage (the Doc editor's image-paste upload); it is correct and
will start working the moment the upstream package serves what it
advertises. The OSS integration test (`tests/app-skills/kelly-drama/ui_test.py`)
scopes its live-write coverage to a plain text field for exactly this
reason, mirroring kelly-mv's identical precedent.

## project (`kelly-drama-project-v1`)

Single row (there is exactly one; look up the first record).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `project-id` | `project_id` | text | stable id, required |
| `title` / `logline` / `genre` / `platform` / `format` / `tone` / `audience` | same | text/longtext | series bible |
| `hook-rules-json` / `world-rules-json` | `hook_rules_json` / `world_rules_json` | longtext | JSON array of short strings |
| `hyperframe-project-path` | `hyperframe_project_path` | text | absolute path to the paired HyperFrame project (browser-editable) |
| `hyperframe-status-json` | `hyperframe_status_json` | longtext | cached snapshot from `scripts/read_hyperframe_status.mjs --apply` (never written by the browser) |
| `hyperframe-status-updated-at` | `hyperframe_status_updated_at` | text | ISO timestamp of the last cache refresh |
| `visual-format-note` / `visual-realism-target` / `visual-cinematography` / `visual-color-palette` / `visual-period-detail` / `visual-aspect-ratio` / `visual-orientation` / `visual-style-medium` | same | text/longtext | visual bible |
| `visual-background-refs-json` | `visual_background_refs_json` | longtext | JSON array `[{id, title, scene, assetId, generated_at, model, size}]` — background reference images |
| `updated-at` | `updated_at` | text | ISO timestamp |

## settings (`kelly-drama-settings-v1`)

One row (`record-id: "config"`). API keys themselves are never stored
here — they're env vars read only by the trusted generation script
(`KELLY_DRAMA_IMAGE_API_KEY`, `KELLY_DRAMA_ARK_API_KEY`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"` |
| `image-base-url` / `image-model` / `image-size` | same | text | OpenAI-images-compatible endpoint |
| `video-draft-backend` | `video_draft_backend` | text | e.g. `ltx-video-mps` |
| `video-width` / `video-height` / `video-fps` / `video-max-frames` | same | number | local LTX draft render settings |
| `video-prod-backend` / `video-ark-base-url` / `video-ark-model` | same | text | Seedance 2.0 via BytePlus/Volcengine Ark |
| `video-prod-resolution` / `video-prod-ratio` | same | text | e.g. `720p` / `16:9` |
| `video-prod-watermark` / `video-generate-audio` | same | text | `"true"`/`"false"` |
| `tts-backend` / `tts-model` | same | text | e.g. `qwen3-tts-mlx` / `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit` |

## characters (`kelly-drama-characters-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `character-id` | `character_id` | text | stable id, e.g. `char-lin-wan`, required |
| `name` / `role` / `status` | same | text | required |
| `actor-profile` | `actor_profile` | longtext | casting/performance notes |
| `card-identity` / `card-motivation` / `card-wound` / `card-secret` / `card-arc` / `card-voice` | same | longtext | the character card |
| `visual-front` / `visual-side` / `visual-back` / `visual-wardrobe` | same | longtext | three-view notes |
| `visual-anchors-json` / `visual-forbidden-drift-json` | same | longtext | JSON arrays |
| `voice-type` / `voice-pace` / `voice-accent` / `voice-signature` / `voice-casting-reference` | same | text | `voice_profile` |
| `voice-sample-script` | `voice_sample_script` | longtext | audition line for TTS |
| `reference-card-status` / `reference-card-purpose` / `reference-card-prompt` | same | text/longtext | |
| `reference-card-asset-id` / `reference-card-generated-at` | same | text | |
| `reference-card-generation-json` | `reference_card_generation_json` | longtext | JSON: `{provider, base_url, model}` |
| `voice-reference-status` / `voice-reference-provider` | same | text | |
| `voice-reference-asset-id` / `voice-reference-generated-at` | same | text | |
| `voice-reference-generation-json` | `voice_reference_generation_json` | longtext | JSON: `{backend, model, instruct, script}` |
| `voice-candidates-json` | `voice_candidates_json` | longtext | JSON array `[{assetId, generated_at, generation}]` |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

The reference card, once generated, is fed as real input pixels into
storyboard image-to-image for consistency.

## relationships (`kelly-drama-relationships-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `relationship-id` | `relationship_id` | text | required |
| `from-character-id` / `to-character-id` | same | text | reference `characters` ids |
| `type` | `type` | text | e.g. "contract spouses" |
| `public-status` / `hidden-truth` / `power-dynamic` | same | longtext | |
| `emotional-temperature` | `emotional_temperature` | text | e.g. "ice cold" |
| `conflict` | `conflict` | longtext | current active conflict |
| `evidence-json` | `evidence_json` | longtext | JSON array of episode ids/notes |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

## episodes (`kelly-drama-episodes-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `episode-id` | `episode_id` | text | required |
| `number` | `number` | number | episode number, drives display order |
| `title` / `status` | same | text | |
| `hyperframe-composition` / `hyperframe-video-asset` | same | text | paired HyperFrame composition path / rendered-output reference |
| `summary` / `promise` / `a-plot` / `b-plot` / `cliffhanger` | same | longtext | |
| `beats-json` | `beats_json` | longtext | JSON array of `{id, label, hook, conflict, turn, emotion, canon_update, characters}` |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

## shots (`kelly-drama-shots-v1`)

An ordered list within an episode — `position` (not array order, since
Busabase gives no ordering guarantee) carries the sequence.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `shot-id` | `shot_id` | text | required |
| `episode-id` / `beat-id` | same | text | link to the owning episode/beat |
| `position` | `position` | number | sort key within the episode; new shots get `max(position) + 1` |
| `title` / `status` | same | text | |
| `duration-seconds` | `duration_seconds` | number | one of 4/5/6/8/10/12 |
| `duration-preset` / `aspect-ratio` / `emotion` | same | text | |
| `shot-size` / `camera-angle` / `camera-movement` / `lens` | same | text | structured camera spec |
| `characters-json` | `characters_json` | longtext | JSON array of `characters` ids on screen |
| `composition` / `camera` / `setting` / `lighting` / `action` | same | longtext | freeform production sheet |
| `prompt` / `video-prompt` / `negative-prompt` | same | longtext | image prompt / image-to-video motion prompt / negative prompt |
| `transition-in` / `transition-out` | same | text | |
| `silent` | `silent` | text | `"true"`/`"false"` — intentional pure-visual shot |
| `audio-json` | `audio_json` | longtext | JSON: `{dialogue:[{speaker,line,tone}], narration, sfx:[], ambient, music}` |
| `srt-json` | `srt_json` | longtext | JSON array `[{time, text, speaker?}]` |
| `continuity-json` | `continuity_json` | longtext | JSON: `{wardrobe, props:[], carries_from_prev, anchors:[]}` |
| `image-asset-id` / `image-status` / `image-generated-at` | same | text | active image |
| `image-generation-json` | `image_generation_json` | longtext | JSON: `{provider, base_url, model, mode}`, `mode` is `image-edit\|text-to-image` |
| `image-candidates-json` | `image_candidates_json` | longtext | JSON array `[{assetId, generated_at, generation}]` |
| `video-asset-id` / `video-status` / `video-generated-at` | same | text | active video; `video-status` also carries the requested backend as `requested:seedance`/`requested:ltx` |
| `video-generation-json` | `video_generation_json` | longtext | JSON: `{mode: draft\|prod, backend, ...}` |
| `video-candidates-json` | `video_candidates_json` | longtext | JSON array `[{assetId, generated_at, generation}]` |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

Every image/video generation appends a non-destructive candidate; the human
picks the active one (`app/app/js/providers/busabase-provider.js`'s
`setShotActive`).

## tasks (`kelly-drama-tasks-v1`)

Freeform human/agent review tasks — a **different** thing from a generation
request (see below): a task is a note about a character/relationship/
episode/shot/export that needs human attention, not an AI-generation
hand-off.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `task-id` | `task_id` | text | required |
| `kind` | `kind` | text | `character\|relationship\|episode\|shot\|export` |
| `target-id` | `target_id` | text | id of the referenced item |
| `status` | `status` | text | |
| `title` / `note` | same | text/longtext | `note` may contain an `@ai` revision request |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

## Generation requests (no separate queue)

The retired local app's `agent_execution` task queue
(`tasks[]` + `scripts/execute_agent_tasks.ts`) is not ported as part of the
`tasks` Base above. Instead, clicking "Generate" in the app writes the
request directly onto the owning record's status field:

- Character reference card: `reference-card-status = "requested"`.
- Character reference voice: `voice-reference-status = "requested"`.
- Storyboard image: `image-status = "requested"`.
- Shot video: `video-status = "requested:<backend>"` (`seedance` default, or `ltx` for the local draft path).

`scripts/execute_generation_requests.mjs --apply` is the trusted process
that scans for `"requested"` rows, performs the real generation call
(OpenAI-images-compatible API, local Qwen3-TTS via `gen_voice.py`, local
LTX-Video via `gen_draft_video.mjs`, or Seedance/Ark), uploads the result as
a Busabase Asset, appends it to the relevant `*-candidates-json`, and flips
status to `"generated"` (or `"blocked"` with the error left for the next
attempt to retry).

## Write surface

Direct field writes via `records.changeRequest`/`bases.createChangeRequest`
(`autoMerge = isStandaloneLocalRuntime()`): series bible, visual bible,
character cards/visual/voice-profile, relationships, episode beats, shot
production-sheet fields, tasks, and every `*-status = "requested"` write. AI
generation (reference cards, reference voices, storyboard images, shot
videos) and the local-filesystem HyperFrame status read are never done from
the browser — only requested; `scripts/execute_generation_requests.mjs` and
`scripts/read_hyperframe_status.mjs` are the trusted processes authorized to
call an external image/video API, spawn the local Qwen3-TTS or LTX-Video
process, or read the operator's local filesystem.
