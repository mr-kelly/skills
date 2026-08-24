# Kelly Drama

Kelly Drama is a Busabase-backed App-in-Skill workbench for planning short-drama series: series bible, character consistency cards, relationship map, episode ladder, and storyboard shots, with AI image/video/voice generation hooks and a HyperFrame handoff for final motion work.

## What It Shows

- Overview: project metrics, next-step cards, cached HyperFrame project status, and the visual bible.
- Characters: character cards, actor profiles, three-view visual notes, reference-card images, and voice profiles.
- Relationships: who relates to whom — public status, hidden truth, power dynamic, and evidence episodes.
- Episodes: the episode table (summary, status, shot counts) plus per-episode script beats and the storyboard shot list.
- Review queue: tasks that need human review or approval.
- Every character reference card, reference voice, and shot image/video is a real Busabase Asset — never a local file or a data URL (demo mode is the only exception, using synthetic placeholders).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Drama overview"></td>
    <td width="50%"><img src="assets/screenshots/episodes.webp" alt="Kelly Drama episode table"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Series workbench with health dashboard, execution timeline, stats, and settings for series parameters.</td>
    <td><strong>Episode table</strong><br>Episode list with script and storyboard status, shot readiness indicators, and per-episode detail pane.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/characters.webp" alt="Kelly Drama character library"></td>
    <td width="50%"><img src="assets/screenshots/relationships.webp" alt="Kelly Drama relationship map"></td>
  </tr>
  <tr>
    <td><strong>Character library</strong><br>Character list with three-view image status, actor settings, wardrobe, and voice preview controls.</td>
    <td><strong>Relationship map</strong><br>Character relationship view with power dynamics, evidence links, and relationship detail pane.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-drama-app install
pnpm --dir content/kelly-drama-app run build:sdk
pnpm --dir content/kelly-drama-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock drama project ("Walking Against the Light" /
《逆光而行》) without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=characters&lang=en#/characters
/?demo=relationships&lang=en#/relationships
/?demo=episodes&lang=en#/episodes
```

Use `lang=zh` for the localized Chinese copy. Demo mode is deterministic and
strictly read-only: it never reads or writes Busabase, and demo media are
synthetic hash-tinted SVG placeholders generated in the browser — never a
real generated or uploaded asset.

## AI Generation

Generating a character reference card, a reference voice, a storyboard
image, or a shot video needs either a paid image-API key, a local Python
with `mlx_audio` installed, a local LTX-Video checkout, or a Seedance/Ark
API key — the browser can only write a **request** onto the record (never
hold a key or spawn a local process). `scripts/execute_generation_requests.mjs
[--apply]` is the trusted process that fulfills those requests: it re-reads
Busabase, performs the real generation call, uploads the result as a
Busabase Asset, and flips the record's status to `generated` (or `blocked`
on failure).

## HyperFrame

The paired HyperFrame project lives on the operator's machine, so its status
can never be read from the browser. `scripts/read_hyperframe_status.mjs
[--apply]` scans the local HyperFrame project path (compositions, renders,
audio, changelog) and caches the result on the project record for the app's
HyperFrame panel to display.

## Data

The whole workspace — series bible, characters, relationships, episodes, and
storyboard shots — lives in seven Busabase Bases under one application
Folder; binary media are Busabase Drive Assets referenced by id. See
`SKILL.md` and `references/ui-schema.md` for the field-slug tables and the
Asset shape. Trusted skill-root scripts (`scripts/execute_generation_requests.mjs`,
`scripts/read_hyperframe_status.mjs`, `scripts/create_sample_project.mjs`,
`scripts/validate_shot_readiness.mjs`, `scripts/export_story_bible.mjs`)
connect with their own credentials (`BUSABASE_BASE_URL` / `BUSABASE_API_KEY`
/ `BUSABASE_SPACE_ID`), never the AirApp's ambient session, and default to a
dry run wherever they write.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
