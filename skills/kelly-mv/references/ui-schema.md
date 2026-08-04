# Kelly MV Schema

Use this schema when reading or writing Kelly MV's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`). Checklist completeness,
"next step" guidance, and status counts are computed client-side from
`project`/`cast`/`shots` on every read (`app/app/js/mv-model.js`) — they are
never stored.

One workspace = exactly one MV project (song + concept + cast + storyboard).
The retired local-file app's multi-project "library"/project-switcher was
never exercised by this schema and is not ported — each Busabase Space/
AirApp instance holds one MV, same as every other converted skill.

Statuses: cast/shots `status` is `draft|needs_review|approved|blocked`.
Generation-status fields (`reference-card-status`, `image-status`,
`video-status`) are `draft|ready_to_generate|requested|generated|uploaded|blocked`.

## Binary media: Busabase Drive Assets, not Base fields

The uploaded MP3, every character reference-card image, and every shot
image/video are real **Busabase Assets** (`busabase-sdk`'s `assets` client:
`createUploadUrl` → PUT bytes → `confirm`), uploaded directly from the
browser — plausible client-side because it's the user's own file, unlike AI
generation (see below). Only the returned **asset id** is stored on the
owning record (`song-audio-asset-id`, `reference-card-asset-id`,
`image-asset-id`, `video-asset-id`, and the `assetId` inside each JSON
candidate). The app resolves an asset id to a fetchable URL via
`assets.get({assetId})` (cached per page load) and renders it directly as an
`<img>`/`<audio>`/`<video>` `src`.

**Known OSS limitation**, confirmed live against the exact `busabase@0.11.0`
standalone CLI every converted skill's integration test targets:
`assets.createUploadUrl()` returns an `/api/dev/upload` target, and that
route 404s ("Not available in production") under the CLI's own production
`NODE_ENV` gate — so a real Asset upload does not complete against that
specific packaged CLI today, independent of anything this AirApp does (see
`app/server.js` and `app/app/js/mv-client.js` for the full trace). The code
is written against the documented SDK contract and mirrors Busabase's own
product usage (the Doc editor's image-paste upload); it is correct and will
start working the moment the upstream package serves what it advertises.

## project (`kelly-mv-project-v1`)

Single row (there is exactly one; look up the first record).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `project-id` | `project_id` | text | stable id, required |
| `song-title` | `song_title` | text | |
| `song-artist` | `song_artist` | text | |
| `song-audio-asset-id` | `song_audio_asset_id` | text | Busabase Asset id, empty until uploaded |
| `song-duration-seconds` | `song_duration_seconds` | number | read automatically from the uploaded file |
| `song-source` | `song_source` | text | `uploaded\|generated` |
| `song-uploaded-at` | `song_uploaded_at` | text | ISO timestamp |
| `treatment-summary` | `treatment_summary` | longtext | one line: what the MV is and its tonality (also feeds the image prompt) |
| `treatment-look` | `treatment_look` | longtext | one line: visual style |
| `treatment-aspect-ratio` | `treatment_aspect_ratio` | text | e.g. `16:9` |
| `updated-at` | `updated_at` | text | ISO timestamp |

There are **no** genre/mood/bpm/key/lyrics/section fields, and no
`realism_target`/`color_palette`/`background_reference_assets` — those were
retired-app fields never surfaced by the current UI.

## settings (`kelly-mv-settings-v1`)

One row (`record-id: "config"`). The image-API key itself is never stored
here — it's the `KELLY_MV_IMAGE_API_KEY` env var read by the trusted
generation script.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"` |
| `image-base-url` | `image_base_url` | text | OpenAI-images-compatible endpoint |
| `image-model` | `image_model` | text | e.g. `gpt-image-2` |
| `image-size` | `image_size` | text | e.g. `1024x1024` |
| `song-draft-backend` | `song_draft_backend` | text | e.g. `songgeneration-v2-mlx` |
| `video-draft-backend` | `video_draft_backend` | text | e.g. `ltx-video-mps` |
| `video-width` / `video-height` / `video-fps` / `video-max-frames` | same | number | local LTX draft render settings |

## cast (`kelly-mv-cast-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `character-id` | `character_id` | text | stable id, e.g. `char-poet`, required |
| `name` | `name` | text | required |
| `role` | `role` | text | required |
| `status` | `status` | text | workflow status |
| `actor-profile` | `actor_profile` | longtext | freeform notes |
| `visual-front` / `visual-side` / `visual-back` | `visual_front` / `visual_side` / `visual_back` | longtext | three-view notes, required |
| `wardrobe` | `wardrobe` | longtext | |
| `anchors-json` | `anchors_json` | longtext | JSON array of consistency anchors |
| `forbidden-drift-json` | `forbidden_drift_json` | longtext | JSON array of things that must not change |
| `reference-card-status` | `reference_card_status` | text | generation status |
| `reference-card-prompt` | `reference_card_prompt` | longtext | |
| `reference-card-asset-id` | `reference_card_asset_id` | text | Busabase Asset id |
| `reference-card-generated-at` | `reference_card_generated_at` | text | ISO timestamp |
| `reference-card-generation-json` | `reference_card_generation_json` | longtext | JSON: `{provider, base_url, model}` |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

The reference card, once generated, is fed as real input pixels into
storyboard image-to-image for consistency.

## shots (`kelly-mv-shots-v1`)

An ordered list — `position` (not array order, since Busabase gives no
ordering guarantee) carries the sequence.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `shot-id` | `shot_id` | text | required |
| `position` | `position` | number | sort key; new shots get `max(position) + 1` |
| `title` | `title` | text | required |
| `status` | `status` | text | workflow status |
| `description` | `description` | longtext | 画面描述 — what this shot shows / what moves; the main field, doubles as the image prompt |
| `negative-prompt` | `negative_prompt` | longtext | optional: things to avoid in generation |
| `video-prompt` | `video_prompt` | longtext | optional: image-to-video motion hint |
| `duration-seconds` | `duration_seconds` | number | one of 4/5/6/8/10/12 for AI generation; uploaded clips can be any length |
| `characters-json` | `characters_json` | longtext | JSON array of `cast` ids on screen (drives image-to-image consistency) |
| `image-asset-id` | `image_asset_id` | text | active image, Busabase Asset id |
| `image-status` | `image_status` | text | generation status |
| `image-generated-at` | `image_generated_at` | text | ISO timestamp |
| `image-generation-json` | `image_generation_json` | longtext | JSON: `{provider, base_url, model, mode}`, `mode` is `image-edit\|text-to-image\|upload` |
| `image-candidates-json` | `image_candidates_json` | longtext | JSON array `[{assetId, generated_at, generation}]` — every generated/uploaded image, newest active |
| `video-asset-id` / `video-status` / `video-generated-at` / `video-generation-json` / `video-candidates-json` | same pattern | text/longtext | same shape as the image fields; `generation.mode` is `draft\|upload` |
| `deleted` | `deleted` | text | `"true"`/`"false"` soft-delete tombstone |

Each shot's image and video can be **generated** or **uploaded**; both
append non-destructive candidates and the human picks the active one
(`app/app/js/providers/busabase-provider.js`'s `setShotActive`).

There are **no** `song_start`/`song_end`/`section_id`/`shot_type`/
camera-spec/`music_cue`/`lyric_lines` fields — those were removed to keep
shots simple.

## Generation requests (no separate queue)

The retired local app's `agent_execution` task queue (`tasks[]` +
`scripts/execute_agent_tasks.ts`) is not ported as a separate Base. Instead,
clicking "Generate" in the app writes the request directly onto the owning
record's status field:

- Character reference card: `reference-card-status = "requested"`.
- Storyboard image: `image-status = "requested"`.
- Draft shot video: `video-status = "requested"`.

`scripts/execute_generation_requests.mjs --apply` is the trusted process
that scans for `"requested"` rows, performs the real generation call,
uploads the result as a Busabase Asset, appends it to the relevant
`*-candidates-json`, and flips status to `"generated"` (or `"blocked"` with
the error left for the next attempt to retry).

## Write surface

Direct field writes via `records.changeRequest`/`bases.createChangeRequest`
(`autoMerge = isStandaloneLocalRuntime()`): concept, song metadata, cast
visual notes, shot description/duration/on-screen-characters, and every
`*-status = "requested"` write. Binary uploads (MP3, reference image, shot
image/video the user already has) go through the Busabase `assets` client
directly from the browser. AI generation (character cards, storyboard
images, draft video, song drafts) is never called from the browser — only
requested; `scripts/execute_generation_requests.mjs` and
`scripts/generate_song_draft.mjs` are the trusted processes authorized to
call an external image API, spawn the local LTX process, or spawn
`scripts/gen_song.py`.
