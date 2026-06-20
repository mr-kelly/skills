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
- Respect AI video model shot limits: one generated shot should be planned as 4, 5, 6, 8, 10, or 12 seconds, and never exceed 12 seconds in a single generation unit.
- Keep image prompts grounded in stable anchors: character id, face/hair/body notes, wardrobe, camera, setting, mood, continuity constraints, and negative prompts.
- Storyboard images can be generated through an OpenAI-compatible Images API. Default model is `gpt-image-2`; default `BASE_URL` is `https://moonrouter.dev/v1`; the local UI stores the API key in `app/.data/image_config.json`, which must remain local-only.
- Generate in dependency order: visual bible/background reference images first, then character reference-card images, then episode storyboard images, then video generation units. If character or background references are missing, create those before generating storyboard/video assets to avoid consistency drift and wasted generations.
- For realism-oriented dramas, prompts should explicitly request live-action cinema stills, natural lensing, physical costumes, period-accurate sets, and "almost impossible to tell it is AI generated"; also forbid UI overlays, captions, watermarks, readable fake text, modern items, fantasy glow, and plastic-looking skin.
- Use "forbidden drift" on character cards for details the image or script generator must not change.
- Make relationship changes explicit. If two characters reconcile, betray, divorce, reveal kinship, or shift power, update the relationship map and evidence episode.
- Prefer concrete scene work over abstract summaries. A useful outline says what the audience sees, what the character chooses, and why the next episode is clicked.

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
node skills/kelly-drama/scripts/export_story_bible.mjs
```

Use paths relative to the skills repository root, or run the scripts from inside `skills/kelly-drama`.
