# Kelly MV UI Schema

The app stores one canonical file at `app/.data/project.json`. Four areas: concept, song, cast, shots. Keep it simple.

## Top Level

```json
{
  "project_id": "stable id",
  "updated_at": "ISO timestamp",
  "song": {},
  "treatment": {},
  "characters": [],
  "shots": []
}
```

`treatment` holds the **concept** (the key name is `treatment` for historical reasons). `projects` / `library` may also be present for a multi-project library.

## song

Minimal — the point is to drop in an existing track.

- `title` (required), `artist` (optional).
- `audio_asset`: public path under `/generated/songs/...` once an MP3 is uploaded (empty until then).
- `duration_seconds`: read automatically from the uploaded audio.
- `source`: `"uploaded"`.

Endpoint: `POST /api/song-upload { filename, data_base64, duration_seconds, title?, artist? }` (browser reads the file as a base64 data URL and the audio duration from an `<audio>` element). `POST /api/song { title, artist }` edits metadata. There are **no** genre/mood/bpm/key/lyrics/section fields.

## treatment (concept)

- `summary`: one line — what the MV is and its tonality (also feeds the image prompt).
- `look`: one line — visual style (e.g. "写实电影感古风" / "赛博霓虹").
- `aspect_ratio`: e.g. `"16:9"`.

Save via `POST /api/treatment { treatment }`.

## character (cast)

Same model as kelly-drama (minus voice).

- `id` (required, e.g. `char-poet`), `name` (required), `role` (required).
- `actor_profile`, `character_card` (freeform notes).
- `visual`: `front`, `side`, `back` (required), `wardrobe`, `anchors` (array), `forbidden_drift` (array).
- `reference_card`: `{ status, prompt, image_asset, generated_at, generation }`. Generate via `POST /api/character-card-image { character_id }`. The card is then fed as real input pixels into storyboard image-to-image for consistency.
- `status`: `draft|needs_review|approved|blocked`.

CRUD: `POST /api/characters[/{id}]` (`{ delete: true }` to remove).

## shot

An ordered list (array order). Structural fields checked by `validate_ui_schema.mjs`: `id`, `title`, `characters` reference real ids.

- `id`, `title`.
- `description`: 画面描述 — what this shot shows / what moves. This is the main field and doubles as the image prompt.
- `characters`: cast ids on screen (drives image-to-image consistency).
- `duration_seconds`: one of 4/5/6/8/10/12 for AI generation (uploaded clips can be any length).
- `negative_prompt` (optional): things to avoid in generation.
- `video_prompt` (optional): image-to-video motion hint.

Each shot's image and video can be **generated** or **uploaded**; both append non-destructive candidates and you pick the active one:

- `image_candidates`: `[{ path, generated_at, generation }]`; `image_asset` = active path; `image_generation.mode` = `image-edit` | `text-to-image` | `upload`.
- `video_candidates`: `[{ path, generated_at, generation }]`; `video_asset` = active path; `video_generation.mode` = `draft` | `upload`.

Endpoints:

- Generate image: `POST /api/storyboard-image { shot_id }` (image-to-image when cast cards exist).
- Generate draft video: `POST /api/shot-video { shot_id, mode: "draft" }` (local LTX).
- Upload image/video: `POST /api/shot-asset-upload { shot_id, kind: "image"|"video", filename, data_base64 }`.
- Pick active candidate: `POST /api/shot-active { shot_id, kind, path }`.
- Prompt preview: `GET /api/storyboard-prompt?shot_id=...` (returns mode, the reference cards fed in, and the prompt).

CRUD: `POST /api/shots[/{id}]` (`{ delete: true }` to remove).

There are **no** `song_start`/`song_end`/`section_id`/`shot_type`/camera-spec/`music_cue`/`lyric_lines` fields — those were removed to keep shots simple.
