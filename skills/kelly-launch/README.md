# Kelly Launch

Kelly Launch is a local App-in-Skill command desk for shipping a product, built on the **RAMP** discipline — **Research / Assemble / Mobilize / Prove**. The agent assembles the launch checklist and drafts the launch assets, channel submissions, press pitches, and launch-day runbook; you approve the launch-readiness gate and steer launch day in a quiet local review UI.

This is launch **operations** — the checklist, assets, submissions, and runbook. For a promotional launch *video*, use `product-launch-video`.

## What It Shows

- **Overview**: the launch-readiness gate — a **Launch Quality Score (LQS)** with a **SHIP / FIX / BLOCK** verdict and its blockers — plus a countdown to the target date, RAMP phase progress, and channel-submission status.
- **Checklist**: every launch task and asset grouped by RAMP phase, with status, per-item readiness, channel, and proposed action.
- **Assets**: the approval queue over agent-drafted assets and submissions (press kit, Product Hunt submission, Show HN post, launch email, press pitch, changelog) with editable drafts, risk badges, review notes, and Approve / Request changes / Block decisions.
- **Launch Day**: an ordered launch-day runbook (`T-60m … T+8h`) with an owner and a war-room note per step.
- The app never submits or sends anything. Approved submissions and pitches are executed by the skill through other channels (for example `kelly-email`) only after explicit approval.

## Demo Mode

Run the app and open a safe mock-data scene for an invented product ("Trailhead") launching ~10 days out:

```bash
skills/kelly-launch/app/start.sh
```

Use the URL printed by the launcher (default port `3220`), then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=checklist&lang=en#/checklist
/?demo=assets&lang=en#/assets
/?demo=launchday&lang=en#/launchday
```

Demo mode never reads local launch files or private config. The demo gate is intentionally **FIX** (a demo recording and press kit are still blocking) so you can see the readiness gate at work.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-launch/config.json`, then put channel/email tokens in local env files only. Configure the product profile, launch target date, channels, press lists, readiness policy, and risk keywords. Never commit real launch copy, tokens, press contacts, or files under `app/.data/`.

## Ports & Env

- Default UI port **3220** (override with `KELLY_LAUNCH_UI_PORT`); falls through `3220`–`3999` if occupied.
- Config: `KELLY_LAUNCH_CONFIG`; env file: `KELLY_LAUNCH_ENV_FILE`; data provider: `KELLY_LAUNCH_DATA_PROVIDER` (default `local`).

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small local companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
