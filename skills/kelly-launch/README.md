# Kelly Launch

Kelly Launch is a Busabase-backed App-in-Skill command desk for shipping a product, built on the **RAMP** discipline — **Research / Assemble / Mobilize / Prove**. The agent assembles the launch checklist and drafts the launch assets, channel submissions, press pitches, and launch-day runbook; you approve the launch-readiness gate and steer launch day in a quiet review UI.

This is launch **operations** — the checklist, assets, submissions, and runbook. For a promotional launch *video*, use `product-launch-video`.

## What It Shows

- **Overview**: the launch-readiness gate — a **Launch Quality Score (LQS)** with a **SHIP / FIX / BLOCK** verdict and its blockers — plus a countdown to the target date, RAMP phase progress, and channel-submission status.
- **Checklist**: every launch task and asset grouped by RAMP phase, with status, per-item readiness, channel, and proposed action.
- **Assets**: the approval queue over agent-drafted assets and submissions (press kit, Product Hunt submission, Show HN post, launch email, press pitch, changelog) with editable drafts, risk badges, review notes, and Approve / Request changes / Block decisions.
- **Launch Day**: an ordered launch-day runbook (`T-60m … T+8h`) with an owner and a war-room note per step.
- The AirApp never submits or sends anything. Approved submissions and pitches are executed by the skill through other channels (for example `kelly-email`) only after explicit approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Launch overview"></td>
    <td width="50%"><img src="assets/screenshots/assets.webp" alt="Kelly Launch assets queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Launch countdown, the RAMP readiness gate with its LQS score, phase progress, and channel status.</td>
    <td><strong>Assets</strong><br>Approval queue for launch assets, Product Hunt / Hacker News submissions, and press pitches.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checklist.webp" alt="Kelly Launch checklist"></td>
    <td width="50%"><img src="assets/screenshots/launchday.webp" alt="Kelly Launch launch-day runbook"></td>
  </tr>
  <tr>
    <td><strong>Checklist</strong><br>Launch tasks grouped by RAMP phase — Research, Assemble, Mobilize, Prove.</td>
    <td><strong>Launch day</strong><br>An ordered launch-day runbook with war-room notes.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-launch-app install
pnpm --dir content/kelly-launch-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock launch for an invented product ("Trailhead")
launching ~10 days out, without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=checklist&lang=en#/checklist
/?demo=assets&lang=en#/assets
/?demo=launchday&lang=en#/launchday
```

Demo mode never reads or writes Busabase. The demo gate is intentionally
**FIX** (a demo recording and press kit are still blocking) so you can see
the readiness gate at work.

## Data

All state — launch items, channels, the launch-day runbook, and the
product/launch profile — lives in four Busabase Bases under one application
Folder. See `SKILL.md` and `references/launch-schema.md` for the resource
map. `scripts/execute_decisions.mjs` is the trusted process that hands off
an approved item's status; it connects with `BUSABASE_BASE_URL` /
`BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs no public submission or
send itself.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
