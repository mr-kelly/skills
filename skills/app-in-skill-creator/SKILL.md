---
name: app-in-skill-creator
description: "Create or update App-in-Skill patterns: Codex skills that bundle a local file-backed web app for review, approval, dashboards, or lightweight workflows. Use when the user wants a skill with an embedded local UI, file handoff, lock files, app launcher, schemas, or a reusable App-in-Skill scaffold."
---

# App-in-Skill Creator

## Purpose

Use this skill to design skills that include a small local app inside the skill folder. The app is an operator surface for humans; the skill remains responsible for real work, external reads/writes, and safety gates.

Good fits:

- Batch review and approval queues.
- Local dashboards over skill-generated files.
- Human comments, edits, or decisions that an agent later executes.
- Workflows where chat is too tiring but full product infrastructure is unnecessary.

## Core Pattern

Keep the boundary clear:

- The skill reads external systems, reasons, drafts, and executes approved actions.
- The app reads and writes local files only.
- The app never sends emails, deletes data, charges money, changes remote systems, or performs other external side effects.
- The handoff files are the contract between app and skill.

For workflows that become tiring in chat, make the App UI the default interaction mode. The skill should generate/update the local batch, start or reuse the local app, and send the user there for review. Still support an explicit chat-only mode when the user says "chat only", "no UI", "纯聊天", or similar: in that mode, present numbered items and approvals directly in the conversation.

Use this default structure when creating a new App-in-Skill:

```text
skill-name/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── app/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── start.sh
│   ├── server/
│   │   ├── index.mjs
│   │   ├── launcher.mjs
│   │   ├── paths.mjs
│   │   ├── lock.mjs
│   │   ├── batch-store.mjs
│   │   ├── decisions.mjs
│   │   ├── state.mjs
│   │   └── routes.mjs
│   └── .cache/
├── scripts/
│   ├── generate_batch.mjs
│   ├── execute_decisions.mjs
│   └── validate_ui_schema.mjs
├── lib/
│   ├── paths.mjs
│   ├── common.mjs
│   └── data-reader/
│       ├── index.mjs
│       └── local-file-reader.mjs
├── references/
│   └── ui-schema.md
├── config.example.yml
└── config.local.yml  # gitignored
```

Use Node.js by default for both the local app server and deterministic App-in-Skill scripts. Prefer built-in `node:http`, `node:fs/promises`, and ESM `.mjs` modules for the app server; add a small `package.json` only when external integrations clearly need dependencies such as IMAP, SMTP, document parsing, or API clients. Default local app ports should prefer the `3000-4000` range, starting at `3000`, while still allowing an explicit env override such as `<SKILL_ENV_PREFIX>_UI_PORT`.

Keep shared runtime code in `lib/`: path constants in `lib/paths.mjs`, JSON/lock/batch helpers in `lib/common.mjs`, and configurable data access in `lib/data-reader/`. Keep `scripts/` as thin CLI entrypoints that import from `lib/`; do not create a parallel `scripts/lib/` tree.

Keep `config.local.yml`, `*.local.yml`, `.env.local`, `.env`, and `app/.cache/` ignored by git.

## Private Configuration

Use a layered private configuration pattern for any App-in-Skill that connects to user accounts, APIs, mailboxes, calendars, CRMs, billing systems, or other personal/business data. The skill code and committed templates should be generic; user-specific accounts, aliases, operator profile, brands/products, style, knowledge sources, policy, endpoints, and risk keywords should live in private config.

Keep the data layer polymorphic. App code, scripts, onboarding, and UI summaries should read domain config through a `lib/data-reader/` interface instead of directly importing local YAML/JSON readers. The first implementation can be `local-file-reader`, but the public interface should stay stable for future providers such as Supabase, Postgres, SQLite, remote config APIs, or product-specific clouds. Use an env selector such as `<SKILL_ENV_PREFIX>_DATA_READER=local` and reserve provider names such as `supabase`, `postgres`, or `pusa-cloud` for later implementations.

Recommended config priority:

1. `<SKILL_ENV_PREFIX>_CONFIG=/absolute/path/to/config.yml`
2. `skill-name/config.local.yml`
3. `~/.config/skill-name/config.yml`
4. `skill-name/config.example.yml`

Recommended env priority:

1. Existing system environment variables
2. `<SKILL_ENV_PREFIX>_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skill-name/.env.local`
5. `~/.config/skill-name/.env`

Store non-secret settings in YAML: accounts, aliases, outbound identities, default folders, UI preferences, user role/profile, brand or product profiles, official URLs, safe knowledge-base sources, tone/style, CTA URLs, approval policies, risk keywords, and routing rules. Store secret values only in environment variables or private env files, then reference them from YAML by variable name such as `password_env`, `api_key_env`, or `token_env`.

For agent-assisted reply, support, review, or outreach workflows, treat private config as the skill's local operating context, not just credentials. Useful blocks include `user_profile` for the operator's role/contact methods, `brands` for product positioning, `official_urls` for canonical links the agent may use, `knowledge_base` for public URLs/local files/short facts/"do not say" guardrails, and `style` for tone, length, formatting, quote, signature, and CTA rules.

When the app shows configuration in the UI, expose only safe summaries: account ids, display names, non-secret emails, provider hosts, aliases, identity names, profile fields meant for replies, brand names, official URLs, style choices, knowledge-source titles/paths/URLs, and whether each required env var is configured. Never return secret values, private knowledge-file contents, token-like fields, or credential values to `/api/state`, logs, batch files, or screenshots.

Example:

```yaml
accounts:
  - account_id: "main"
    display_name: "Main Account"
    provider: "imap"
    aliases:
      - "support@example.com"
      - "founder@example.com"
    credentials:
      password_env: "SKILL_PASSWORD_MAIN"

identities:
  - identity_id: "support"
    account_id: "main"
    send_as: "support@example.com"
    use_when:
      recipient_addresses: ["support@example.com"]

style:
  tone: "concise, warm, direct"

official_urls:
  homepage: "https://example.com"
  docs: "https://docs.example.com"

knowledge_base:
  enabled: true
  sources:
    - source_id: "docs"
      type: "url"
      title: "Product docs"
      url: "https://docs.example.com"

risk_policy:
  review_keywords:
    money: ["invoice", "payment", "账单"]
    security: ["password", "token", "privacy"]
```

The app server and scripts should share the same data-reader logic so the UI accurately reflects what the execution scripts will use. If the UI has a settings/account panel, read the config through the data reader via the server and return a sanitized `config_summary` or domain-specific summary such as `email_accounts`. Include the active reader/provider name in the summary so the user can see whether the skill is using local files or a remote data source.

Support onboarding as a first-class state for any App-in-Skill that depends on private config. If no private config exists, if only `config.example.yml` exists, or if required secret env vars are missing, greet the user and show setup instructions instead of running external reads/writes. Templates are examples only; never treat `config.example.yml` as a live configuration. The app UI should show a setup card and the skill should explain exactly which local config/env files to create without asking the user to paste secrets into chat. Onboarding should also prompt for the domain context that makes the agent useful: operator role, brand/product, official URLs, style, risk preferences, and safe knowledge sources.

## File Contract

Use predictable JSON files so both the agent and UI can recover after interruption:

- `app/.cache/current_batch.json`: latest agent-generated batch.
- `app/.cache/decisions.json`: user decisions and notes keyed by item id.
- `app/.cache/execution_report.json`: latest execution results.
- `app/.cache/agent.lock`: temporary lock while the skill is generating or executing.

Prefer workflow states over domain categories:

- `needs_review`: user must give a note, approve, block, or request a draft.
- `to_approve`: agent has a concrete plan or draft ready for approval.
- `approved`: user approved an action; skill may execute it on the next run.
- `done`: action completed or intentionally no-op.
- `blocked`: cannot proceed without new information or external state.

Show categories and risks as badges, not primary navigation.

## Locking

Create `app/.cache/agent.lock` before the skill writes batch/decision/report files or executes external actions. Remove it in a `finally` step.

Lock shape:

```json
{
  "owner": "skill-name",
  "message": "Generating review batch",
  "started_at": "ISO timestamp"
}
```

The app server should:

- Poll the lock on a timer.
- Disable editing while the lock exists.
- Reject write endpoints while locked.
- Continue showing read-only batch content.
- Keep routes thin and delegate file handling, lock checks, state derivation, and decisions to separate `app/server/*.mjs` modules.

The skill should:

- Refuse to execute if required approvals are missing.
- Re-read decisions immediately before executing.
- Write per-item execution results back to the batch or report file.

## UI Rules

Build the app as a quiet local tool, not a landing page. Keep controls obvious and stable.

- Default to launching/reusing the local app when the skill is invoked for review/approval work; use chat-only review only when the user explicitly asks for it.
- Use fixed sidebar workflow filters: `All`, `Needs Review`, `To approve`, `Approved`, `Done`, `Blocked`.
- Add hover tooltips for icon buttons, workflow filters, and action buttons.
- Prefer one `Review note` textarea for user guidance.
- Show an editable draft only when a draft exists or the user requests a reply draft.
- For review workflows where the likely next step is a reply, include a `suggested_reply` draft or reply outline so the user can approve/edit directly instead of asking the agent to draft later.
- For queues that users discuss back in chat, show stable per-batch row references such as `Review #1` in both the list and detail views so comments like "change #2" can be resolved unambiguously.
- Auto-refresh files on a timer, but do not redraw while the user is actively editing a textarea or non-search input.
- Keep the top bar and sidebar fixed if the item list scrolls.
- Use local HTTP on `127.0.0.1`; do not expose the app externally.
- Prefer local app ports in the `3000-4000` range, starting at `3000`; if the port is occupied, reuse an already-ready app on that port or choose the next available port in the range. Always report the actual URL printed by the launcher.
- If the skill uses private config, show a compact read-only `Help & Settings` summary in the UI so the user can confirm which accounts, identities, profile, style choices, official links, knowledge sources, or data sources are active.

## Batch Schema

Start with this minimal item contract and extend only when needed:

```json
{
  "batch_id": "skill-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "skill-name",
  "mode": "app-in-skill",
  "metrics": {
    "needs_review": 0,
    "to_approve": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "items": [
    {
      "id": "stable local id",
      "title": "human-readable title",
      "summary": "short summary",
      "body": "trimmed source content for review",
      "category": "customer|system|finance|other",
      "risk": ["money"],
      "status": "needs_review|to_approve|approved|done|blocked",
      "proposed_action": "archive|send_reply|draft_reply|no_action",
      "reason": "why this action is proposed",
      "draft": "optional editable draft",
      "suggested_reply": "optional agent-recommended reply draft for review-first items",
      "decision": {
        "action": "approve|draft_reply|revise|block|no_action",
        "comment": "user note",
        "decided_at": "ISO timestamp"
      },
      "execution": {
        "status": "pending|executed|blocked|error",
        "reason": "optional result detail",
        "executed_at": "ISO timestamp"
      }
    }
  ]
}
```

Write a validator for the schema before relying on it for external actions.

## Creation Workflow

When creating or updating an App-in-Skill:

1. Define the human story: what the agent prepares, what the user reviews, and what the skill executes.
2. Define the file contract before building UI controls.
3. Create the local app inside `app/`, with static UI files at the app root and Node server modules under `app/server/`.
4. Add generator, executor, and validator scripts under `scripts/`.
5. Add lock handling to both the skill workflow and the app server.
6. Add `config.example.yml` with placeholders only; keep real accounts, tokens, URLs, and personal identities out of the skill.
7. Add onboarding detection for missing private config, example-only config, and missing secret env vars.
8. Add data-reader helpers shared by scripts and the app server. The default reader may implement local config/env discovery using the private configuration priority above, but callers should depend on the reader interface.
9. Add a sanitized config summary, active data-reader name, and onboarding status to `/api/state` when the user needs to verify configured accounts, operator profile, style, official URLs, knowledge sources, or data sources.
10. Start the app with `app/start.sh` and verify the onboarding and main workflow in a browser when available.
11. Run the validator and a dry-run execution before enabling real side effects.

## Safety Defaults

- Treat money, legal, privacy, account access, destructive actions, and outbound messages as approval-required.
- Store only the minimum local content needed for review.
- Do not commit cache files, secrets, personal inbox configuration, or customer exports.
- Do not expose secret values through UI state, logs, reports, batch files, or browser screenshots; expose only boolean readiness for configured secret env vars.
- Make execution idempotent where possible by storing stable item ids and execution results.
- If the UI and batch schema disagree, stop and update the schema or UI before executing.
