# Kelly MV

Kelly MV is a Busabase-backed App-in-Skill workbench for turning an existing MP3 into a pure-visual music video: a one-line concept, a cast with reference cards, and a storyboard of shots where each image/video can be AI-generated or uploaded.

## What It Shows

- Concept: readiness checklist (song, concept, cast refs, storyboard) plus the MV summary, look, and aspect ratio.
- Song: the uploaded MP3, auto-detected duration, and title/artist metadata.
- Cast: on-screen characters with three-view visual notes, anchors, and character reference-card images.
- Storyboard: the ordered shot list with durations, image/video status badges, and a per-shot detail sheet.
- Every uploaded MP3, character reference image, and shot image/video is a real Busabase Asset — never a local file or a data URL (demo mode is the only exception, using synthetic placeholders).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly MV concept view"></td>
    <td width="50%"><img src="assets/screenshots/storyboard.webp" alt="Kelly MV storyboard"></td>
  </tr>
  <tr>
    <td><strong>Concept</strong><br>MV concept workbench with project checklist, next-step guidance, concept form, and how-to walkthrough.</td>
    <td><strong>Storyboard</strong><br>Shot list with duration, image status, and a detail pane for description, image generation, and video upload.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/cast.webp" alt="Kelly MV cast"></td>
    <td width="50%"><img src="assets/screenshots/song.webp" alt="Kelly MV song"></td>
  </tr>
  <tr>
    <td><strong>Cast</strong><br>Character list with reference card status and a detail form for visual description, wardrobe, and consistency anchors.</td>
    <td><strong>Song</strong><br>MP3 upload and song metadata form with auto-detected duration and song-gen backend status.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir app install
pnpm --dir app run build:sdk
pnpm --dir app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock MV project (《霓虹潮汐》 / "Neon Tide") without a
Busabase connection:

```text
/?demo=overview&lang=en#/concept
/?demo=song&lang=en#/song
/?demo=cast&lang=en#/cast
/?demo=storyboard&lang=en#/storyboard
```

Use `lang=zh` for the localized Chinese copy. Demo mode is deterministic and
strictly read-only: it never reads or writes Busabase, and demo media are
synthetic placeholders generated in the browser (hash-tinted SVG frames, a
short silent WAV) — never a real uploaded or generated asset.

## AI Generation

Generating a character reference card, a storyboard image, or a draft shot
video needs either a paid image-API key or a local LTX-Video checkout — the
browser can only write a **request** onto the record (never hold the key or
spawn the local model). `scripts/execute_generation_requests.mjs [--apply]`
is the trusted process that fulfills those requests: it re-reads Busabase,
performs the real generation call, uploads the result as a Busabase Asset,
and flips the record's status to `generated` (or `blocked` on failure).
Song generation (including a voice-cloned singing performance) is a
documented future capability — see `SKILL.md`'s "Song Generation" section
and `scripts/generate_song_draft.mjs` / `scripts/gen_song.py`.

## Data

The whole MV workspace — project meta (song + concept), cast, and storyboard
shots — lives in four Busabase Bases under one application Folder; binary
media are Busabase Drive Assets referenced by id. See `SKILL.md` and
`references/ui-schema.md` for the field-slug tables and the Asset shape.
Trusted skill-root scripts (`scripts/execute_generation_requests.mjs`,
`scripts/create_sample_project.mjs`, `scripts/validate_shot_readiness.mjs`,
`scripts/export_story_bible.mjs`, `scripts/generate_song_draft.mjs`) connect
with their own credentials (`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` /
`BUSABASE_SPACE_ID`), never the AirApp's ambient session, and default to a
dry run wherever they write.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
