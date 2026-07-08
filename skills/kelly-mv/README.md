# Kelly MV

Kelly MV is a local App-in-Skill workbench for turning an existing MP3 into a pure-visual music video: a one-line concept, a cast with reference cards, and a storyboard of shots where each image/video can be AI-generated or uploaded.

## What It Shows

- Concept: readiness checklist (song, concept, cast refs, storyboard) plus the MV summary, look, and aspect ratio.
- Song: the uploaded MP3, auto-detected duration, and title/artist metadata.
- Cast: on-screen characters with three-view visual notes, anchors, and character reference-card images.
- Storyboard: the ordered shot list with durations, image/video status badges, and a per-shot detail sheet.

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

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-mv/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/concept
/?demo=song&lang=en#/song
/?demo=cast&lang=en#/cast
/?demo=storyboard&lang=en#/storyboard
```

Use `lang=zh` for the localized Chinese sample project (《霓虹潮汐》). Demo mode is deterministic and strictly read-only: it never reads or writes project files under `app/.data/`, all write endpoints are rejected with a demo notice, and demo media are synthetic placeholders served from memory (`/generated/demo/*` — flat SVG frames and a silent WAV), never real project assets.

## Private Config

Project state lives in `app/.data/project.json`; uploaded songs and generated images/videos live under `app/.data/generated/`. The image-generation backend (base URL, API key, model) is configured in the app's Settings panel and stored in `app/.data/image_config.json`; the song-generation backend is a documented stub in `config.example.json`. Never commit anything under `app/.data/` — real API keys, songs, project files, and generated assets stay local.
