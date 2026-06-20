# Kelly Drama UI Schema

The app stores one canonical file at `app/.data/project.json`.

## Top Level

```json
{
  "project_id": "stable id",
  "updated_at": "ISO timestamp",
  "series": {},
  "characters": [],
  "relationships": [],
  "episodes": [],
  "shots": [],
  "tasks": []
}
```

## Series

Required fields: `title`, `logline`, `genre`, `platform`, `format`, `tone`, `audience`, `hook_rules`, `world_rules`.

`hook_rules` and `world_rules` are arrays of short strings.

## Character

Required fields:

- `id`: stable id such as `char-lin-wan`.
- `name`
- `role`: protagonist, antagonist, love_interest, family, rival, helper, etc.
- `actor_profile`: casting and performance notes.
- `character_card`: motivation, wound, secret, arc, voice, status.
- `visual`: `front`, `side`, `back`, `wardrobe`, `anchors`, `forbidden_drift`.
- `voice_profile` (optional but recommended): `type` (timbre), `pace`, `accent`, `signature`, `casting_reference`, `sample_script` (audition line).
- `voice_reference` (asset slot, active voice): `{ status: "planned"|"generated", provider, asset, generated_at, generation }`.
- `voice_candidates`: `[{ path, generated_at, generation }]` — every generated reference-voice sample (non-destructive). Active = `voice_reference.asset`; switch via `POST /api/character-voice-active { character_id, path }`.
- Reference voices are generated locally via Qwen3-TTS (mlx-audio, Apple Silicon): `POST /api/character-voice { character_id }` runs `scripts/gen_voice.py` using the character's `voice_profile` as the VoiceDesign `instruct` and `voice_profile.sample_script` as the line. Saved to `.data/generated/voices/`.
- `reference_card` (asset slot): `{ status, prompt, image_asset, generated_at, generation }`.
- `status`: draft, needs_review, approved.

## Relationship

Required fields: `id`, `from`, `to`, `type`, `public_status`, `hidden_truth`, `power_dynamic`, `emotional_temperature`, `conflict`, `evidence`.

`from` and `to` must reference character ids. `evidence` may contain episode ids or freeform notes.

## Episode

Required fields: `id`, `number`, `title`, `promise`, `a_plot`, `b_plot`, `beats`, `cliffhanger`, `status`.

Each beat should include `id`, `label`, `hook`, `conflict`, `turn`, `emotion`, `canon_update`, `characters`.

`characters` should reference character ids where possible.

## Shot

Structural required fields (checked by `validate_ui_schema.mjs`): `id`, `episode_id`, `beat_id`, `title`, `characters`, `composition`, `camera`, `setting`, `lighting`, `prompt`, `negative_prompt`, `status`.

`episode_id` references an episode. `beat_id` should reference a beat in that episode. `characters` should reference character ids.

### Video-ready fields (Definition of Done)

For a shot to be ready for image/video generation it should also carry (checked by `validate_shot_readiness.mjs`):

- `duration_seconds` (one of 4/5/6/8/10/12), `duration_preset` (e.g. `"8s"`), `aspect_ratio` (e.g. `"16:9"`), `emotion`.
- Camera spec: `shot_size`, `camera_angle`, `camera_movement`, `lens` (in addition to freeform `camera`).
- `action`: motion script — what moves during the shot, distinct from the still `composition`.
- `video_prompt`: model-agnostic image-to-video motion prompt (camera move + subject action + environment motion).
- `audio`: `{ "dialogue": [{ "speaker", "line", "tone" }], "narration", "sfx": [], "ambient", "music" }`.
- `srt`: `[{ "time": "HH:MM:SS,mmm --> HH:MM:SS,mmm", "text", "speaker"? }]` — cumulative episode timecodes, multiple short cues per shot; dialogue density ≤ ~8 chars/second.
- `silent` (optional, boolean): `true` marks an intentional pure-visual shot — no dialogue, empty `srt`; must still carry a sound bed (`audio.ambient`/`sfx`/`music`).
- `transition_in`, `transition_out`.
- `continuity`: `{ "wardrobe", "props": [], "carries_from_prev", "anchors": [] }` (anchors = forbidden-drift traits).

Generated-asset fields are written by the app (non-destructive — every generation appends a candidate, you pick the active one):

- `image_candidates`: `[{ path, generated_at, generation }]` — all generated storyboard images for this shot.
- `image_asset`: the **active** image path (one of the candidates); `image_generated_at`, `image_generation` (`{ provider, base_url, model, size, mode, reference_assets }`, `mode` = `image-edit` | `text-to-image`) mirror the active one.
- `video_candidates`: `[{ path, generated_at, generation }]` — all generated draft/prod videos.
- `video_asset`: the **active** video path; `video_generated_at`, `video_generation` (`{ mode: draft|prod, backend, width, height, fps, frames, source_image }`) mirror the active one.

Set the active candidate via `POST /api/shot-active { shot_id, kind: "image"|"video", path }`. Generation never overwrites a prior candidate.

## Task

Tasks are optional. Use them for agent work or human attention:

```json
{
  "id": "task-001",
  "kind": "character|relationship|episode|shot|export",
  "target_id": "char-lin-wan",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "title": "short task title",
  "note": "human or agent note"
}
```
