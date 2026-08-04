# Kelly Creators

Kelly Creators is a Busabase-backed App-in-Skill command desk for influencer / creator marketing. The agent sweeps creator candidates, scores fit, and drafts outreach and briefs; you review creator cards, approve outreach and briefs, gate content before it publishes, and track campaign ROI. It is organized around the four phases of the discipline: **Discover → Plan → Activate → Measure**.

## What It Shows

- **Overview** — pipeline funnel (discovery → outreach → negotiating → live → measured), budget allocation, and total reach.
- **Creators** — candidate cards with the C³ ACE fit score, platform, niche, followers, engagement rate, and rate — sortable by fit, followers, engagement, or cost.
- **Outreach** — the needs-review approval queue with editable outreach/brief drafts, risk badges, and Approve / Request changes / Block decisions. Includes the content-reviewer quality gate (SHIP / FIX / BLOCK).
- **ROI** — per-creator spend, estimated value, CPM, and ROI.
- The AirApp never sends anything. Approved outreach, briefs, and contracts are executed by the skill through other channels (for example `instagram-outreach` or `kelly-email`) only after explicit approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Creators overview"></td>
    <td width="50%"><img src="assets/screenshots/creators.webp" alt="Kelly Creators candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pipeline funnel across the four phases, budget allocation, total reach, and the top fit-scored candidates.</td>
    <td><strong>Creators</strong><br>Sortable candidate cards with C³ ACE fit scores, platform, niche, and audience size.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/outreach.webp" alt="Kelly Creators outreach queue"></td>
    <td width="50%"><img src="assets/screenshots/roi.webp" alt="Kelly Creators ROI board"></td>
  </tr>
  <tr>
    <td><strong>Outreach</strong><br>Needs-review approval queue with editable outreach drafts and the FTC/claim disclosure gate.</td>
    <td><strong>ROI</strong><br>Per-creator spend, estimated value, CPM, and return once a partnership goes live.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir app install
pnpm --dir app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock program for an invented brand ("Aurelia
Skincare") without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=creators&lang=en#/creators
/?demo=outreach&lang=en#/outreach
/?demo=roi&lang=en#/roi
/?demo=detail&lang=en#/creators/cr-lena-glow
```

Demo mode never reads or writes Busabase. Handles are invented — no real creators.

## Data

All state — creator engagements, outreach drafts, content-review quality
gates, and the operator profile — lives in two Busabase Bases under one
application Folder. See `SKILL.md` and `references/creators-schema.md` for
the resource map. `scripts/execute_decisions.mjs` is the trusted process
that hands off an approved engagement's status; it connects with
`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs
no sending or contract execution itself.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
