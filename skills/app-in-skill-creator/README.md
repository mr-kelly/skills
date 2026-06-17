# Introducing App-in-Skill

App-in-Skill is a pattern for skills that need a small human review surface without becoming a full product.

The idea is simple: the agent still does the hard work, but the user gets a local app for reviewing, approving, commenting, and correcting batches. The app does not own the workflow. It reads and writes local handoff files, while the skill remains responsible for reasoning, external actions, safety checks, and execution.

It is a bridge between chat and software. Chat is the fastest way to describe intent and adjust a workflow, but many real tasks eventually need a visual surface: a queue, a preview, a draft editor, filters, status, and a clear place to approve or reject work. App-in-Skill keeps the flexibility of agent collaboration while giving users a stable interface for repeated decisions.

This is useful when chat gets too tiring:

- inbox-zero workflows where many items need quick approval
- review queues with drafts, risk labels, and notes
- dashboards over local agent-generated files
- approval flows where the user needs context before saying yes
- lightweight operations that are too personal or too early for a real SaaS backend

It is especially useful for long-tail workflows: tasks that are important to a person or team, change often, and do not justify a full application. A skill can be adapted through conversation, while the app gives that evolving workflow enough structure for other people to use it.

## Why Users Need This

Most users do not want to manage repetitive work purely through a chat transcript. Chat is good for asking, correcting, and giving judgment, but it becomes tiring when the user has to review many similar items or remember what happened in a previous turn.

An App-in-Skill gives the user:

- a visible queue instead of a scrolling conversation
- one place to review drafts, source context, risks, and suggested actions
- stable item numbers such as `Review #1` so chat comments can refer back to the UI
- a help and settings panel that shows where batch files, decision files, config, and account summaries live
- persistent decisions that survive refreshes, pauses, and interrupted runs
- a safer approval habit: the app records what the user approved, while the skill performs the action later

This makes agent-assisted work easier to hand to teammates. The expert can still shape the workflow through chat, but other users get a concrete interface instead of needing to understand the whole agent conversation.

## Why Developers Use This Pattern

For developers, App-in-Skill is a lightweight way to ship useful workflow software without turning every workflow into a large app project.

The pattern works because it separates concerns:

- the skill owns reasoning, orchestration, external reads/writes, and approval gates
- the app owns human review, editing, filtering, and local state display
- handoff files define the contract, so the app and agent can evolve independently
- config readers keep private local files, databases, and future remote providers behind one interface
- the UI can stay simple because the agent generates the batch and explains the work

This keeps the first version small. A developer can start with local files and a local HTTP app, then later swap the data source to SQLite, Postgres, Supabase, or another provider through the data-reader layer. The user-facing workflow does not need to be rebuilt just because the storage shape changes.

## Good Fits

App-in-Skill works best when the workflow has both agent work and human judgment:

- email triage and reply review
- customer-support queues
- PR, release-note, or copy review
- video publishing checklists, title/description review, and thumbnail feedback
- content repurposing across blog, YouTube, newsletters, and social channels
- SEO keyword or landing-page review where metrics and recommendations need approval
- ad, GA, or growth-plan proposals that should be reviewed before execution

The common shape is: the agent prepares options, evidence, drafts, or recommendations; the user edits or approves them in the app; the skill executes only the approved decisions.

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

This loop also makes the workflow teachable. A user can start in chat, ask the agent to prepare a batch, review it visually, then return to chat with precise feedback like "change Review #2" or "approve everything except the blocked item." The interface carries the repetitive state, while chat stays available for higher-level judgment and changes.

## Configuration

App-in-Skill projects should keep public code generic and private context local. Accounts, aliases, operator profile, brand settings, style, URLs, knowledge sources, and risk rules should live in ignored config files such as:

- `~/.config/<skill-name>/config.yml`
- `~/.config/<skill-name>/.env`
- `<skill-name>/config.local.yml`

The code should read config through a data-reader layer, not by hardcoding local files everywhere. Today that reader may load YAML from disk. Later it can load from Supabase, Postgres, SQLite, or a product cloud without rewriting the UI.

For users, this means the app can show a safe summary of what is connected: which accounts, identities, config source, batch file, and decision file are active. For developers, it means local-file mode and database-backed mode can share the same UI and execution scripts.

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

Keep it specific to the work. The best App-in-Skill apps are not generic dashboards; they are small, concrete review rooms for the task at hand.
