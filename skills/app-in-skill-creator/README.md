# Introducing App-in-Skill

App-in-Skill is a pattern for skills that need a small human review surface without becoming a full product.

The idea is simple: the agent still does the hard work, but the user gets a local app for reviewing, approving, commenting, and correcting batches. The app does not own the workflow. It reads and writes local handoff files, while the skill remains responsible for reasoning, external actions, safety checks, and execution.

This is useful when chat gets too tiring:

- inbox-zero workflows where many items need quick approval
- review queues with drafts, risk labels, and notes
- dashboards over local agent-generated files
- approval flows where the user needs context before saying yes
- lightweight operations that are too personal or too early for a real SaaS backend

## The Boundary

An App-in-Skill has three parts:

- `SKILL.md`: the agent's operating instructions and safety rules
- `app/`: a local browser UI for review and editing
- `scripts/` plus `lib/`: deterministic generation, validation, execution, and data access helpers

The app should be boring in the best way. It shows the batch, lets the user decide, and saves those decisions locally. It should not send email, delete records, charge money, mutate remote systems, or perform side effects. Those actions belong to the skill, after explicit approval.

## The File Contract

The handoff files are the contract:

- `app/.cache/current_batch.json`: what the agent prepared
- `app/.cache/decisions.json`: what the user decided
- `app/.cache/execution_report.json`: what the agent executed
- `app/.cache/agent.lock`: whether the agent is currently writing or executing

This keeps the workflow recoverable. If the browser refreshes, the batch is still there. If the agent pauses, the user's decisions are still there. If a run is interrupted, the execution report can explain what happened.

## Why This Pattern Works

Chat is great for judgment, but it is not always great for repetitive review. A local app gives the user a stable surface: filters, numbered items, previews, draft boxes, notes, and approval buttons. The skill gives the app intelligence: classification, summaries, suggested replies, execution, and safety gates.

The result is a small but powerful loop:

1. The skill prepares a batch.
2. The app shows the batch.
3. The user reviews and edits.
4. The skill executes approved decisions.
5. The app shows what is done, blocked, or waiting.

## Configuration

App-in-Skill projects should keep public code generic and private context local. Accounts, aliases, operator profile, brand settings, style, URLs, knowledge sources, and risk rules should live in ignored config files such as:

- `~/.config/<skill-name>/config.yml`
- `~/.config/<skill-name>/.env`
- `<skill-name>/config.local.yml`

The code should read config through a data-reader layer, not by hardcoding local files everywhere. Today that reader may load YAML from disk. Later it can load from Supabase, Postgres, SQLite, or a product cloud without rewriting the UI.

## Default Shape

Use Node.js for the local server and scripts unless the skill has a strong reason to do otherwise.

```text
skill-name/
├── SKILL.md
├── agents/openai.yaml
├── app/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── start.sh
│   └── server/
├── lib/
│   ├── paths.mjs
│   ├── common.mjs
│   └── data-reader/
├── scripts/
├── references/
└── config.example.yml
```

Keep shared code in `lib/`. Keep `scripts/` as thin entrypoints. Keep real config, secrets, cache files, and generated local state out of git.

## The Taste

An App-in-Skill should feel like a quiet cockpit for one workflow. It is not a landing page. It is not a SaaS app pretending to be finished. It is a local tool that helps the user steer the agent with less fatigue and more control.
