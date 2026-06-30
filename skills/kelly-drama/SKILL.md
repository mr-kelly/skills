---
name: kelly-drama
description: Short-drama and product-video development skill for planning drama projects through a bundled local App-in-Skill UI, with each project linked to a specified HyperFrame project and each episode linked to a HyperFrame composition for final motion/video tuning. Use when the user asks to create, edit, organize, or review short-drama scripts, product explainer episodes, character consistency cards, series bibles, episode beat sheets, storyboard shots, HyperFrame project/composition links, production checklists, or a drama planning workbench.
---

# Kelly Drama

## Core Idea

Use this skill as a short-drama and product-video planning workspace. Keep the app as the human editing surface and planning system of record: the skill reasons, drafts, validates, exports, and prepares AI-generation prompts; the app only reads and writes local project files.

Kelly Drama is **not** the final motion editor. For final video tuning, each Kelly Drama project should point to a concrete HyperFrame project path, and each episode should point to a concrete HyperFrame composition. Kelly Drama manages the creative plan, canonical beats, storyboard metadata, review state, and asset index; HyperFrame owns the final composition, animation, captions, audio timing, render, and publish pass.

Default to the local app for ongoing creative work. Use chat-only mode only when the user explicitly asks for "chat only", "no UI", "纯聊天", or similar.

## Default Flow

1. Start or reuse the local app with `app/start.sh`.
2. Check `app/.data/project.json`. If missing, create a starter project with `scripts/create_sample_project.mjs`. The bundled starter is a short-drama adaptation of `异世来客：王爷揽砚入王府`.
3. Use the app to maintain:
   - Series bible: logline, genre, platform, target audience, episode format, hook rules, world rules.
   - HyperFrame project link: `series.hyperframe_project_path` is the absolute path to the matching HyperFrame project. Do not guess it when the user has provided a path; store the explicit path.
   - Episode HyperFrame links: each episode can carry `hyperframe_composition` (for example `index.html` or `compositions/ep-002.html`) and `hyperframe_video_asset` (the rendered/reference output indexed back into Kelly Drama).
   - Visual bible: aspect ratio, screen orientation, realism target, cinematography, color palette, period detail, background reference images, and generated style anchors.
   - Character library: stable role id, actor profile, character card, three-view visual notes, wardrobe, voice, secrets, forbidden drift.
   - Character reference cards: generate character card images before storyboard/video work when consistency matters.
   - Character voice: keep a `voice_profile` (timbre/type, pace, accent, signature delivery, casting reference, sample audition line) and a `voice_reference` asset slot for a generated reference voice. Reference voices are generated locally via Qwen3-TTS (mlx-audio, Apple Silicon, MLX): `POST /api/character-voice` runs `scripts/gen_voice.py` with the `voice_profile` as the VoiceDesign `instruct` and `sample_script` as the line; samples are non-destructive candidates (`voice_candidates`), pick the active one. Keep shot `audio.dialogue[].tone` and `srt` speakers aligned with each character's voice profile. Local TTS venv lives at `app/.data/tts/venv` (Python 3.11 + `mlx_audio`); first run downloads `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit`.
   - Relationship map: relationship type, power direction, emotional temperature, conflict, evidence episodes.
   - Episode ladder: episodes, acts, beats, turning points, cliffhangers, emotional payload.
   - Storyboard bench: shots, image prompts, negative prompts, continuity anchors, production status.
4. After major edits, run `scripts/validate_ui_schema.mjs` before exporting or using generated prompts.
5. Export a readable bible with `scripts/export_story_bible.mjs` when the user wants a handoff, pitch note, or production brief.

## Kelly Drama ↔ HyperFrame Contract

Default architecture:

- One Kelly Drama project = one HyperFrame project.
- One Kelly Drama episode = one HyperFrame composition inside that project.
- Kelly Drama is for planning and management; HyperFrame is for final visual/motion/audio polish.

Use these fields consistently:

- `series.hyperframe_project_path`: absolute path to the HyperFrame project, e.g. `/Users/kelly/Documents/kapps/.../videos/busabase`.
- `episode.hyperframe_composition`: composition filename/path relative to the HyperFrame project, e.g. `index.html` or `compositions/ep-001-introducing.html`.
- `episode.hyperframe_video_asset`: rendered/reference video asset path indexed in Kelly Drama, often under `/generated/hyperframes/...`.

The app can read the paired HyperFrame project status through a read-only local API. It scans the configured path for `hyperframes.json`, `design.md`, HTML compositions, scene ids, embedded audio tracks, rendered video files, thumbnails, and changelog notes. This is for planning visibility and sync checks only; it must not mutate the HyperFrame project.

When importing an existing HyperFrame episode into Kelly Drama:

1. Read the HyperFrame project path the user supplied.
2. Inspect the composition HTML, project `design.md`, relevant changelog notes, rendered video, and thumbnails/frames when available.
3. Create/update the Kelly Drama episode beats and storyboard shots to mirror the composition scenes.
4. Extract or copy scene reference frames and rendered video into `app/.data/generated/hyperframes/<project-episode>/`.
5. Store the original source path and time ranges on the episode/shots so future syncs are traceable.
6. Run `scripts/validate_ui_schema.mjs` and `scripts/validate_shot_readiness.mjs`.

When planning a new episode first in Kelly Drama:

1. Draft the episode promise, beats, and storyboard shots in Kelly Drama.
2. Assign/confirm `series.hyperframe_project_path`.
3. Choose a stable `episode.hyperframe_composition` path before final production.
4. Treat the HyperFrame composition as the canonical final-cut surface once it exists; if the composition changes, re-import the new scene structure or update the Kelly Drama shots to match.

## Creative Operating Rules

- Preserve continuity first: every new scene should point to character ids, relationship ids, and prior facts instead of rewriting canon.
- Treat actors and characters separately. An actor can play a character, but the character card is the story source of truth.
- Write short-drama beats as production units: each beat needs a hook, conflict turn, emotional value, and either a reveal, reversal, choice, or cliffhanger.
- Treat episode runtime as flexible: a short-drama episode is usually 2-4 minutes, adjusted by story density rather than forced to a fixed length.
- Respect AI video model shot limits: one generated shot should be planned as 4, 5, 6, 8, 10, or 12 seconds, and never exceed 12 seconds in a single generation unit. Float the duration to the shot's information density — quick reactions/close-ups run short (4-6s), establishing/ceremony/group/action runs longer (8-12s). Do not pin every shot at 12s.
- Keep dialogue deliverable: Chinese dialogue should stay at or below ~8 characters per second of shot duration (ideal 5-7). Overdense lines cannot be performed in the shot length and waste video generations — trim the line, split the shot, or extend the duration.
- Keep image prompts grounded in stable anchors: character id, face/hair/body notes, wardrobe, camera, setting, mood, continuity constraints, and negative prompts.
- Storyboard images can be generated through an OpenAI-compatible Images API. Default model is `gpt-image-2`; default `BASE_URL` is `https://moonrouter.dev/v1`; the local UI stores the API key in `app/.data/image_config.json`, which must remain local-only.
- Use real image-to-image conditioning for character consistency: storyboard generation feeds the existing character reference-card images (and the visual background reference) to the `/images/edits` endpoint as actual input images, not just as text. Text mentions of a reference path do nothing — the model must receive the pixels. If a character lacks a generated reference card, that shot falls back to text-to-image and consistency will drift, so generate the card first.
- Generate in dependency order: visual bible/background reference images first, then character reference-card images, then episode storyboard images, then video generation units. If character or background references are missing, create those before generating storyboard/video assets to avoid consistency drift and wasted generations.
- Finish the text before spending on pixels: a shot must reach the video-ready Definition of Done (below) and pass `scripts/validate_shot_readiness.mjs` before you generate its image or video. Thin shot data (missing motion, audio, transitions, timed dialogue) produces wasted image and video generations.
- For realism-oriented dramas, prompts should explicitly request live-action cinema stills, natural lensing, physical costumes, period-accurate sets, and "almost impossible to tell it is AI generated"; also forbid UI overlays, captions, watermarks, readable fake text, modern items, fantasy glow, and plastic-looking skin.
- Use "forbidden drift" on character cards for details the image or script generator must not change.
- Make relationship changes explicit. If two characters reconcile, betray, divorce, reveal kinship, or shift power, update the relationship map and evidence episode.
- Prefer concrete scene work over abstract summaries. A useful outline says what the audience sees, what the character chooses, and why the next episode is clicked.

## Storyboard Shot Definition of Done (video-ready)

A storyboard shot is "image-ready" once it describes a still frame, but final shot-video production needs more. Before generating a shot's image or video, the shot should carry a complete production sheet:

- Identity & timing: `id`, `episode_id`, `beat_id`, `title`, `characters` (valid ids), `duration_seconds` (in {4,5,6,8,10,12}), `duration_preset`, `aspect_ratio`, `emotion`.
- Camera spec (structured, not only free text): `shot_size`, `camera_angle`, `camera_movement`, `lens`, plus freeform `camera`, `composition`, `setting`, `lighting`.
- Motion: `action` — what actually moves over the shot's seconds (subject action, blocking changes, eyelines, prop and environment motion), distinct from the still composition.
- Generation prompts: `prompt` (structured still/keyframe prompt with character anchors and forbidden drift), `negative_prompt`, and `video_prompt` (a model-agnostic image-to-video motion prompt: camera move + subject action + environment motion).
- Audio/sound design: `audio` = `{ dialogue:[{speaker,line,tone}], narration, sfx:[], ambient, music }`.
- Timed dialogue: `srt` = `[{time, text, speaker?}]` with cumulative episode timecodes matching the durations, and dialogue density ≤ ~8 chars/second. Segment into multiple short cues (~1.5-4s, ≤18 chars each), not one block per shot.
- Pure-visual shots are allowed and encouraged for rhythm: a montage/atmosphere/action beat can be intentionally silent (set `silent: true`, no dialogue, empty `srt`). A silent shot still needs a sound bed (`audio.ambient`/`sfx`/`music`). Do not force a subtitle into every shot — let some breathe.
- Editorial: `transition_in`, `transition_out`.
- Continuity: `continuity` = `{ wardrobe, props:[], carries_from_prev, anchors:[] }` (anchors are forbidden-drift traits that must stay consistent).

The app's shot detail panel renders this whole sheet and shows a per-shot readiness chip; `scripts/validate_shot_readiness.mjs` enforces it (and flags overdense dialogue and characters missing reference cards). Treat any shot below this bar as not ready to generate.

## Video, Audio & Episode Assembly

Turning storyboards into an actual short drama (continuous episode with characters speaking) has its own pipeline and hard-won constraints:

- Visual style is a strategic choice tied to both audience and the video model's content filter. For an overseas (Western / Japan-Korea) audience, a non-photoreal **cinematic painterly ("Arcane-style") look** was chosen: it reads premium and international, and it avoids photoreal pitfalls. Drive the whole look from `series.visual_bible.style_medium`; every shot/character prompt inherits it. Switching style = update the visual bible + rewrite each prompt's `Style/medium` line + set `negative_prompt` to forbid `photorealistic, real person, live-action`, then regenerate character cards → storyboards (image-to-image keeps consistency).
- Storyboard video uses **Seedance 2.0 via BytePlus/Volcengine Ark** (`POST /contents/generations/tasks` → poll `GET …/{id}` → download). Constraints learned the hard way:
  - **Real-person filter**: rejects photoreal human keyframes for image-to-video; even stylized **close-up faces** can be flagged ("input image may contain real person"), while wide / group / medium shots pass. Do NOT silently fall back to text-to-video — surface the error. Mitigations: push faces more illustrated/cel-shaded (less photoreal), use 3/4 or non-front framing for close-ups, or add a second provider.
  - **Native audio**: `generate_audio` is on by default (synced ambient/foley); that auto-audio can trip an audio-safety filter, so retry the same shot with `generate_audio:false` (we dub our own dialogue anyway).
- **Non-destructive generation + candidates**: every image/video/voice generation appends a candidate (`image_candidates` / `video_candidates` / `voice_candidates`); the user picks the active one (`/api/shot-active`, `/api/character-voice-active`). Different models/providers just add more candidates. Never overwrite.
- **Character voices**: local Qwen3-TTS (mlx-audio, Apple Silicon), VoiceDesign `instruct` built from each character's `voice_profile`. It tends to speak slowly — fit each line into its shot window with ffmpeg `atempo` during assembly.
- **Episode assembly** (the step that makes clips into a drama): per-shot visual sized to exactly the shot's duration (Seedance clip where available, else a Ken Burns `zoompan` move on the storyboard still) → `concat` into one silent episode video → synthesize each dialogue line (right voice), place it at its cumulative SRT time (`adelay`), atempo-fit to its shot window, and `amix` all lines → mux audio onto the video. Burned-in subtitles need an ffmpeg built with **libass** (the default Homebrew build here lacked the `subtitles` filter) — otherwise ship a `.srt` sidecar. **Lip-sync** is a later polish (cut to the speaker's close-up + a dedicated lip-sync model); ship voiceover-over-picture first.
- Local video generation on Mac (LTX-Video on MPS) proved impractical (tens of GB across multiple models, slow/thermal MPS, stalling downloads) — use cloud (Seedance/Ark) for video.

## App Contract

The local app uses file-backed JSON only:

- `app/.data/project.json`: canonical short-drama workspace.
- `app/.data/image_config.json`: local-only image API config (storyboard/character image generation).
- `app/.data/video_config.json`: local-only video config (Seedance/Ark `ark_api_key`/`ark_model`, `generate_audio`, optional second provider).
- `app/.data/tts/`: local Qwen3-TTS (mlx-audio) virtualenv for character voices.
- `app/.data/generated/storyboards/`: generated storyboard images. `…/references/`: character cards + scene/background refs. `…/videos/`: shot clips + assembled episodes. `…/voices/`: generated character voices + per-episode dialogue.
- `app/.data/generated/hyperframes/`: imported HyperFrame reference frames and rendered videos indexed back into Kelly Drama episodes.
- `app/.data/agent.lock`: temporary write lock.
- `app/.data/execution_report.json`: optional export or generation report.
- `app/.data/agent_tasks.json`: optional tasks created from `@ai` notes or missing fields.

The app must not call external image models, publish files, send messages, or mutate external systems. The skill may prepare or execute those actions only after the user asks.

## When To Read References

- Read `references/drama-workflow.md` when designing or improving a short-drama project, character library, relationship map, episode ladder, or image prompt workflow.
- Read `references/ui-schema.md` when editing app files, generating project JSON, or validating data.

## Useful Commands

```bash
skills/kelly-drama/app/start.sh
node skills/kelly-drama/scripts/create_sample_project.mjs
node skills/kelly-drama/scripts/validate_ui_schema.mjs
node skills/kelly-drama/scripts/validate_shot_readiness.mjs --episode ep-001
node skills/kelly-drama/scripts/export_story_bible.mjs
```

Run `validate_shot_readiness.mjs` (optionally `--strict` to fail on warnings) before any image/video generation pass to confirm shots meet the video-ready Definition of Done.

Use paths relative to the skills repository root, or run the scripts from inside `skills/kelly-drama`.
