---
name: kelly-drama
description: Short-drama development skill for planning vertical micro-dramas, maintaining a reusable character/actor library, relationship maps, series bibles, episode beat sheets, storyboard shots, and image-generation prompts through a bundled local App-in-Skill UI. Use when the user asks to create, edit, organize, or review short-drama scripts, character consistency cards, three-view character references, relationship webs, episode outlines, scene beats, storyboard image prompts, production checklists, or a short-drama editor/workbench.
---

# Kelly Drama

## Core Idea

Use this skill as a short-drama creative workspace. Keep the app as the human editing surface and keep the skill as the creative producer: the skill reasons, drafts, validates, exports, and prepares AI-generation prompts; the app only reads and writes local project files.

Default to the local app for ongoing creative work. Use chat-only mode only when the user explicitly asks for "chat only", "no UI", "纯聊天", or similar.

## Default Flow

1. Start or reuse the local app with `app/start.sh`.
2. Check `app/.data/project.json`. If missing, create a starter project with `scripts/create_sample_project.mjs`. The bundled starter is a short-drama adaptation of `异世来客：王爷揽砚入王府`.
3. Use the app to maintain:
   - Series bible: logline, genre, platform, target audience, episode format, hook rules, world rules.
   - Visual bible: aspect ratio, screen orientation, realism target, cinematography, color palette, period detail, background reference images, and generated style anchors.
   - Character library: stable role id, actor profile, character card, three-view visual notes, wardrobe, voice, secrets, forbidden drift.
   - Character reference cards: generate character card images before storyboard/video work when consistency matters.
   - Character voice: keep a `voice_profile` (timbre/type, pace, accent, signature delivery, casting reference, sample audition line) and a `voice_reference` asset slot for a generated reference voice. Reference voices are generated locally via Qwen3-TTS (mlx-audio, Apple Silicon, MLX): `POST /api/character-voice` runs `scripts/gen_voice.py` with the `voice_profile` as the VoiceDesign `instruct` and `sample_script` as the line; samples are non-destructive candidates (`voice_candidates`), pick the active one. Keep shot `audio.dialogue[].tone` and `srt` speakers aligned with each character's voice profile. Local TTS venv lives at `app/.data/tts/venv` (Python 3.11 + `mlx_audio`); first run downloads `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit`.
   - Relationship map: relationship type, power direction, emotional temperature, conflict, evidence episodes.
   - Episode ladder: episodes, acts, beats, turning points, cliffhangers, emotional payload.
   - Storyboard bench: shots, image prompts, negative prompts, continuity anchors, production status.
4. After major edits, run `scripts/validate_ui_schema.mjs` before exporting or using generated prompts.
5. Export a readable bible with `scripts/export_story_bible.mjs` when the user wants a handoff, pitch note, or production brief.

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

## App Contract

The local app uses file-backed JSON only:

- `app/.data/project.json`: canonical short-drama workspace.
- `app/.data/image_config.json`: local-only image API configuration for storyboard generation.
- `app/.data/generated/storyboards/`: local generated storyboard images.
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
