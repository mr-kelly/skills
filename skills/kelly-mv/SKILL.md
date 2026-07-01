---
name: kelly-mv
description: "Music-video production skill for turning an existing MP3 into a pure-visual (no-voiceover) music video through a bundled local App-in-Skill UI. Use when the user wants to build an MV from a song they upload: write a one-line concept, keep a cast of characters with reference cards, and break the song into storyboard shots where each shot has a scene description and an image + video that can be either AI-generated (image-to-image from the character cards, draft video via local LTX) or uploaded by the user. Same character/storyboard management model as kelly-drama. Song generation (creating the song itself, incl. voice-cloned singing) is a documented future capability."
---

# Kelly MV

## Core Idea

Use this skill as a music-video creative workspace. The app is the human editing surface; the skill is the creative producer: it reasons, drafts, validates, exports, and prepares AI-generation prompts. The app only reads and writes local project files.

An MV here is **pure picture — no voiceover, no dialogue, no on-screen lyrics**. The job is simple: take an existing MP3 and give it visuals. The final video is the storyboard shots played in order over the song. (For voiced/dialogue drama, use `kelly-drama` instead — that is its job.)

The app has exactly four areas: **概括 (Concept)**, **Song**, **角色 (Cast)**, **分镜 (Storyboard)**. Keep it that simple — don't reintroduce song sections, timeline tiling, or large per-shot production sheets.

Default to the local app for ongoing creative work. Use chat-only mode only when the user explicitly asks for "chat only", "no UI", "纯聊天", or similar.

## Default Flow

1. Start or reuse the local app with `app/start.sh` (defaults to `127.0.0.1:3041`; honors `KELLY_MV_UI_PORT`).
2. Check `app/.data/project.json`. If missing, the server seeds the bundled starter (a 静夜思 sample MV). You can also reseed with `scripts/create_sample_project.mjs`.
3. Use the app, following the sidebar **下一步 (next step)**:
   - **概括 (Concept)**: one-line summary of what the MV is and its tonality, a one-line visual `look`, and aspect ratio. That's it.
   - **Song**: upload an MP3. Duration is read automatically. Optional title/artist. Nothing else.
   - **角色 (Cast)**: the people on screen. Stable id, role, three-view visual notes, wardrobe, anchors, forbidden drift, and a **character reference card** image. Generate reference cards before storyboard work when consistency matters. No voice profiles (pure-visual MV). Same model as kelly-drama.
   - **分镜 (Storyboard)**: an ordered list of shots. Each shot has a **画面描述 (scene description)**, on-screen characters, a duration, and an **image + a video**. Image and video can each be **AI-generated** (image-to-image from the character cards; draft video via local LTX) **or uploaded** by the user.
4. After edits, run `scripts/validate_ui_schema.mjs` (structure) and `scripts/validate_shot_readiness.mjs` (each shot has a title, description, and sane duration) before generating.
5. Export a readable concept + shotlist with `scripts/export_story_bible.mjs` for handoff.

## Creative Operating Rules

- **Pure visual.** Never add dialogue audio, narration TTS, or burned-in subtitles/lyrics. The only audio is the song itself.
- **Keep it simple.** The shot is just a scene description + characters + duration + image + video. Do not add camera-spec sheets, song-section taxonomies, lyric timelines, or strict timeline-coverage rules.
- **Pace to the music.** Cut shot lengths to the song — quick moments run short (4–6s), establishing/hero/montage runs longer (8–12s). A single AI-generated shot must be 4, 5, 6, 8, 10, or 12 seconds and never exceed 12s. (Uploaded clips can be any length.)
- **Two ways to fill a shot.** Each shot's image and video can be **generated** or **uploaded** — both append as non-destructive candidates and the user picks the active one. Respect what the user wants; don't overwrite an uploaded asset by regenerating.
- **Character consistency via real image-to-image.** Storyboard image generation feeds the existing character reference-card images to the image `/images/edits` endpoint as actual input pixels, not just text. If a character lacks a generated reference card, that shot falls back to text-to-image and the likeness drifts — generate the card first.
- **Generate in dependency order**: song uploaded → concept written → cast reference cards → storyboard images → draft shot videos. The shot's `description` is the image prompt; an optional `negative_prompt` and `video_prompt` refine generation.
- **Photoreal MV look (when realism is the target):** request cinematic music-video stills, real lensing, filmic grain; forbid on-screen lyrics/captions/watermarks/UI, readable fake text, plastic skin, and malformed hands.

## Song Generation (future capability)

Selecting/importing an existing song is the supported path today. Creating the song itself — including singing in the user's **cloned voice** — is wired as a documented stub (`POST /api/song-generate` → `scripts/gen_song.py`), mirroring the local-draft / cloud-prod split used for video.

Recommended local backends (Apple Silicon, no cloud):

- **SongGeneration v2 (Tencent)** — native MLX weights `mlx-community/SongGeneration-v2-large`. Best fit for "本地 MLX 最好"; same family path as the local TTS/audio stack. **Primary recommendation.**
- **ACE-Step 1.5** — strongest local model, runs on Mac, <4GB, full vocals + instruments, supports **audio-prompt timbre cloning** and lyric editing → the path for "用我 clone 的声音创歌" (pass a reference clip as the timbre prompt).
- **YuE** / **DiffRhythm** — full-length song-from-lyrics alternates; heavier.

Caveat: cloning a *singing* voice needs a singing reference clip; a spoken sample clones timbre but not vocal performance well. To enable generation, install a backend into `app/.data/song/venv`, implement the inference call in `scripts/gen_song.py`, then flip `draft_ready` in `song-service.songConfigPayload()`.

## App Contract

The local app uses file-backed JSON only:

- `app/.data/project.json`: canonical MV workspace (`song`, `treatment` = concept, `characters`, `shots`).
- `app/.data/image_config.json`: local-only image API configuration for storyboard generation.
- `app/.data/song_config.json`: optional local-only song-generation backend configuration.
- `app/.data/generated/songs/`: uploaded (or generated) song audio.
- `app/.data/generated/storyboards/`, `.../references/`, `.../videos/`: generated or uploaded images and shot videos.
- `app/.data/agent.lock`: temporary write lock.

The app must not call external models for free, publish files, send messages, or mutate external systems beyond the configured image/video generation the user triggers. The skill may prepare or execute other actions only after the user asks.

## When To Read References

- Read `references/mv-workflow.md` when designing or improving an MV concept, cast library, shot breakdown, or image/video prompt workflow.
- Read `references/ui-schema.md` when editing app files, generating project JSON, or validating data.

## Useful Commands

```bash
skills/kelly-mv/app/start.sh
node skills/kelly-mv/scripts/create_sample_project.mjs
node skills/kelly-mv/scripts/validate_ui_schema.mjs
node skills/kelly-mv/scripts/validate_shot_readiness.mjs
node skills/kelly-mv/scripts/export_story_bible.mjs
```

Run `validate_shot_readiness.mjs` (optionally `--strict`) before an image/video generation pass. Use paths relative to the skills repository root, or run the scripts from inside `skills/kelly-mv`.
