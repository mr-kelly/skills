---
name: app-in-skill-creator
license: MIT
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
├── package.json  # hono + @hono/node-server (base deps); "type":"module" + "engines":{"node":">=23.6"}
├── agents/
│   └── openai.yaml
├── app/
│   # ── frontend: plain vanilla .js, served to the browser (NO .ts here) ──────
│   ├── index.html   # zero-build vanilla frontend (no bundler, no client framework)
│   ├── app.js       # browser code stays .js — browsers can't strip TS types
│   ├── styles.css
│   ├── start.sh
│   ├── i18n/
│   │   └── messages.js
│   ├── server/      # backend: TypeScript, run directly by Node ≥23.6 (or bun) — no build step
│   │   ├── index.ts   # bootstrap: @hono/node-server serve({ fetch: app.fetch })
│   │   ├── hono.ts    # Hono app: API routes + static serving (platform-neutral fetch)
│   │   ├── launcher.ts
│   │   ├── paths.ts
│   │   ├── types.ts   # domain interfaces (snapshot/batch/item/state/config)
│   │   ├── lock.ts
│   │   ├── batch-store.ts
│   │   ├── decisions.ts
│   │   └── state.ts
│   └── .data/  # handoff files (gitignored)
├── scripts/          # backend TypeScript CLIs
│   ├── generate_batch.ts
│   ├── execute_decisions.ts
│   └── validate_ui_schema.ts
├── lib/
│   ├── paths.ts
│   ├── common.ts
│   └── data-provider/
│       ├── provider-interface.ts
│       ├── index.ts
│       └── local-file-provider.ts
├── references/
│   └── ui-schema.md
├── config.example.json
└── config.local.json  # gitignored
```

Use Node.js by default for the deterministic App-in-Skill scripts and the local app server. The app server is a **Hono** app: the base scaffold has one small `package.json` with exactly two dependencies, `hono` and `@hono/node-server`. Bootstrap it in `app/server/index.ts` with `serve({ fetch: app.fetch, hostname, port })` and put the routes in `app/server/hono.ts`. Hono is chosen for one concrete reason: it is Web-standard `fetch(Request) -> Response` code, so the same `app.fetch` runs locally under `@hono/node-server` and deploys to **Cloudflare Workers unchanged** once the data layer is cloud-backed (see Data Provider Spectrum). Keep the rest — scripts, locking, JSON reads/writes, validation, launching — on built-in `node:fs/promises`, `node:path`, `node:crypto`, `node:child_process`, and ESM modules. Default local app ports should prefer the `3000-4000` range, starting at `3000`, while still allowing an explicit env override such as `<SKILL_ENV_PREFIX>_UI_PORT`.

**Author the Node side in TypeScript (`.ts`).** Server, scripts, and `lib/` are `.ts`, run directly by **Node ≥23.6 native type-stripping** (or **bun**) — no bundler, no build step, still drop-and-run. Set `"type": "module"` and `"engines": { "node": ">=23.6" }`, and point the `package.json` scripts and `start.sh` at the `.ts` entrypoints. Use **erasable-only syntax** — type annotations, `interface`/`type`, `as`, `as const`, `satisfies`, `import type` — and **not** `enum`, `namespace`, constructor parameter-properties, or decorators (Node throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on those). Relative imports carry the real `.ts` extension, and the repo `tsconfig.json` needs `allowImportingTsExtensions` plus `skills/**/*.ts` in `include`. Put the domain shapes (snapshot/batch/item/state/config) in `app/server/types.ts`, annotate exported function boundaries, and keep `catch`/config edges honest with small interfaces or `as` casts; `kelly-invest-webull` and `kelly-family-office` are the typed references. CI runs `biome check` + `tsc --noEmit`, so both must stay clean.

The frontend stays **zero-build vanilla `.js`**: `index.html` + `app.js` + `styles.css` + `i18n/`, served as static files by the Hono app. The client files are `.js`, **not** `.ts` — the browser loads them directly and cannot strip TypeScript types, so a `.ts` client would require the bundler this pattern forbids; the `.ts` rule is backend-only. Do not add a client framework or build step — **no Vite, React, Preact, wouter, esbuild, or bundler of any kind.** The vanilla app already owns hash routing, i18n, and the mobile shell (see UI Rules); a client framework solves problems this pattern does not have and breaks drop-and-run. If you want save-and-refresh during development, add a ~15-line dev-only SSE live-reload, not a bundler.

**Why vanilla is the default, and the escape hatch.** This was deliberated: a full **Preact + wouter + Vite** SPA version was actually built for this pattern and then reverted to stay minimal. The decisive reason is an iron law — on Node, **JSX ⟺ a build tool**. Native type-stripping (the reason the server is now zero-build TypeScript) strips types but does **not** transform JSX, so "zero-build + Preact JSX" does not exist: a client framework reintroduces exactly the build step we removed on the server, which breaks drop-and-run and the per-skill `npm install` install path. It also inflates the dependency/supply-chain surface of a tool that only renders a small operator dashboard, and fragments a fleet whose apps already share one working vanilla shell (routing, i18n, mobile, auto-refresh). So a client framework is **not** the default — on purpose, not by omission. **Escape hatch:** if a single app genuinely outgrows string templates (many interdependent, strongly-stateful components), reach **first** for **`preact` + `htm` loaded via ESM / import-map** — `htm` is a tagged-template alternative to JSX, so you get components and reactivity while staying **zero-build, no bundler**. Only if even that is insufficient for one exceptionally complex app may you add Vite **for that one skill as a documented exception** — never as the default, and never bundle the whole fleet.

**Recommended frontend selection by skill complexity** (a recommendation, not a mandate — pick the *lowest* tier that fits, and keep the server Hono + TypeScript either way):

| Tier | Choose when the app is… | Stack | Build step? |
| --- | --- | --- | --- |
| **Default** | a dashboard, review queue, or form — i.e. almost every App-in-Skill | **vanilla `.js`** (`index.html` + `app.js` + `styles.css` + `i18n/`) with the built-in hash router / mobile shell | none |
| **Reactive, still zero-build** | string templates get unwieldy: many interdependent, strongly-stateful components | **`preact` + `htm`** via ESM / import-map (+ `@preact/signals` if needed) | none |
| **Complex SPA (per-skill exception)** | a large stateful UI that genuinely outgrows `htm` | **Preact** + `preact/compat` + `@preact/signals` + `wouter`, via `@preact/preset-vite`, TSX | Vite — that one skill only |
| **React proper (rare)** | you truly need a React-only capability: RSC, a heavy component library, a library that depends on React internals, or mature concurrent features | **React** + Vite | Vite — that one skill only |

Prefer Preact over React at the SPA tier: `preact/compat` gives the React API and most of the ecosystem at ~1/10 the shipped size, which suits a small operator tool; reach for React only when a React-specific need can't be met on `preact/compat`. Moving up a tier is a per-skill decision justified by that skill's complexity, and each build-step tier is a documented exception — the fleet default stays zero-build.

The Hono app must be platform-neutral: its handlers reach handoff files and config **only through `lib/data-provider/`**, never `node:fs` directly, so the same app runs on Node (local files) and later on Workers (a cloud provider such as Busabase). Attachment/file serving that must touch the disk stays behind a guard and is understood to be Node-only until the provider serves it.

Add further dependencies only when the skill truly needs an external integration or specialized parser that native Node cannot reasonably provide — IMAP, SMTP, MIME email parsing, browser automation, document parsing, OAuth/API clients, database drivers, or a cloud data-provider SDK such as `busabase`. Keep those in integration/adapter code (e.g. `lib/data-provider/<name>.ts`), not in the base App UI; if the app can run and review local handoff files without the dependency, it must still do so.

Prefer JSON for runtime config and handoff files: `config.example.json`, `config.local.json`, `.env`, and files under `app/.data/`. Do not add YAML runtime config or the `yaml` package to a default App-in-Skill template; if a user has old YAML notes, convert them to JSON before the skill reads them. Do not add `dotenv`, Express, or a frontend build stack to the base template.

Keep shared runtime code in `lib/`: path constants in `lib/paths.ts`, JSON/lock/batch helpers in `lib/common.ts`, and configurable data access in `lib/data-provider/`. Keep `scripts/` as thin CLI entrypoints that import from `lib/`; do not create a parallel `scripts/lib/` tree.

Keep `config.local.json`, legacy `config.local.yml`, `*.local.json`, legacy `*.local.yml`, `.env.local`, `.env`, and `app/.data/` ignored by git. Note that `.data/` is not a name most default `.gitignore` templates exclude (unlike `.cache/`), so it must be added to `.gitignore` explicitly — the handoff files contain user decisions and execution history and must never be committed.

## Private Configuration

Use a layered private configuration pattern for any App-in-Skill that connects to user accounts, APIs, mailboxes, calendars, CRMs, billing systems, or other personal/business data. The skill code and committed templates should be generic; user-specific accounts, aliases, operator profile, brands/products, style, knowledge sources, policy, endpoints, and risk keywords should live in private config.

Keep the data layer polymorphic. App code, scripts, onboarding, and UI summaries should access domain config and handoff data through a `lib/data-provider/` interface instead of directly importing local JSON/env readers or optional YAML readers. "Provider" (not "reader") is the right word: the same interface both reads state and writes input, and may be backed by a database or cloud service, not just a file reader. The first implementation is `local-file-provider` (the default), but the public interface should stay stable for future providers such as PostgreSQL, AITable.ai, Notion, Busabase, SQLite, remote config APIs, or product-specific clouds. Use an env selector such as `<SKILL_ENV_PREFIX>_DATA_PROVIDER=local` and reserve provider names such as `postgres`, `aitable`, `notion`, and `busabase` for later implementations.

Make the interface explicit and enforce it, so providers are truly interchangeable and drift fails loud. Define the contract in one `lib/data-provider/provider-interface.ts` module: a real `interface DataProvider` listing the members every provider MUST implement (core reads/writes) plus any optional per-provider extensions. Each provider is a `class … implements DataProvider`, so a missing/mismatched method fails at author time (tsc/editor). The selector (`getProvider()`) MUST also run a **consistency guard** — an `assertProvider(name, provider)` that checks every core member is present — at registration, so a dynamic/JS caller still gets one actionable error there instead of failing later with `provider.getX is not a function`. Keep a stable provider `name` on each. Copy `references/provider-interface.ts` as a starting template (the `interface` + `CORE_METHODS`/`OPTIONAL_METHODS` + `assertProvider` + the typed `getProvider()` selector) and adapt the member list to your domain. (Pure-`.mjs` fallback for older Node: express the same contract as a JSDoc `@typedef` and keep the runtime `assertProvider` guard — the shape is identical, only the compile-time check is lost.)

### Data Provider Spectrum

The default backing store is local files — this is what keeps an App-in-Skill zero-dependency, private, and runnable anywhere (including inside a cloud drive). But the same app must be able to graduate to a database or cloud service without rewriting the UI, scripts, or skill logic — moving along the spectrum is a config change, not a rewrite.

| Provider | Best for | Trade-off |
| --- | --- | --- |
| `local` (files) | single operator, private, offline, fastest start | no sharing, no remote access |
| `postgres` | self-hosted teams, full SQL control | you operate the database |
| `aitable` | AITable.ai: visual-database teams, spreadsheet-like editing + 6,000+ app integrations | hosted service, API limits |
| `notion` | doc-centric teams, content living in Notion | not built for high-volume rows |
| `busabase` | AI-generated content needing a review→canonical pipeline | cloud dependency |

**Recommended cloud provider: Busabase.** Busabase gives AI-generated articles, assets, and structured records a single review Inbox before they become canonical records: approve, request changes, keep the audit trail, and ship trusted content downstream. This is the App-in-Skill loop expressed as a data service — where a local App-in-Skill keeps "what the agent prepared" and "what the human approved" in local handoff files, Busabase keeps them as Inbox records and canonical records with an audit trail between them. Backing an App-in-Skill with `busabase` turns a personal tool into a shared, multi-operator system of record for human-approved AI output, with no change to the app the operators use. Prefer it for App-in-Skills whose output should become trusted, shared, canonical content.

Recommended config priority:

1. `<SKILL_ENV_PREFIX>_CONFIG=/absolute/path/to/config.json`
2. `skill-name/config.local.json`
3. `~/.config/skill-name/config.json`
4. `skill-name/config.example.json`

Recommended env priority:

1. Existing system environment variables
2. `<SKILL_ENV_PREFIX>_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skill-name/.env.local`
5. `~/.config/skill-name/.env`

Store non-secret settings in JSON by default: accounts, aliases, outbound identities, default folders, UI preferences, user role/profile, brand or product profiles, official URLs, safe knowledge-base sources, tone/style, CTA URLs, approval policies, risk keywords, and routing rules. Store secret values only in environment variables or private env files, then reference them from JSON by variable name such as `password_env`, `api_key_env`, or `token_env`.

For agent-assisted reply, support, review, or outreach workflows, treat private config as the skill's local operating context, not just credentials. Useful blocks include `user_profile` for the operator's role/contact methods, `brands` for product positioning, `official_urls` for canonical links the agent may use, `knowledge_base` for public URLs/local files/short facts/"do not say" guardrails, and `style` for tone, length, formatting, quote, signature, and CTA rules.

When the app shows configuration in the UI, expose only safe summaries: account ids, display names, non-secret emails, provider hosts, aliases, identity names, profile fields meant for replies, brand names, official URLs, style choices, knowledge-source titles/paths/URLs, and whether each required env var is configured. Never return secret values, private knowledge-file contents, token-like fields, or credential values to `/api/state`, logs, batch files, or screenshots.

Example:

```json
{
  "accounts": [
    {
      "account_id": "main",
      "display_name": "Main Account",
      "provider": "imap",
      "aliases": ["support@example.com", "founder@example.com"],
      "credentials": {
        "password_env": "SKILL_PASSWORD_MAIN"
      }
    }
  ],
  "identities": [
    {
      "identity_id": "support",
      "account_id": "main",
      "send_as": "support@example.com",
      "use_when": {
        "recipient_addresses": ["support@example.com"]
      }
    }
  ],
  "style": {
    "tone": "concise, warm, direct"
  },
  "official_urls": {
    "homepage": "https://example.com",
    "docs": "https://docs.example.com"
  },
  "knowledge_base": {
    "enabled": true,
    "sources": [
      {
        "source_id": "docs",
        "type": "url",
        "title": "Product docs",
        "url": "https://docs.example.com"
      }
    ]
  },
  "risk_policy": {
    "review_keywords": {
      "money": ["invoice", "payment", "账单"],
      "security": ["password", "token", "privacy"]
    }
  }
}
```

The app server and scripts should share the same data-provider logic so the UI accurately reflects what the execution scripts will use. If the UI has a settings/account panel, read the config through the data provider via the server and return a sanitized `config_summary` or domain-specific summary such as `email_accounts`. Include the active provider name in the summary so the user can see whether the skill is using local files or a remote data source.

Onboarding is the default initial phase of every App-in-Skill, not just a fallback for missing config (see the Onboarding section). Private config and secrets are never pasted into chat: the user creates local config/env files, while the skill and app guide that setup turn by turn until the configuration is complete.

## File Contract

Use predictable JSON files so both the agent and UI can recover after interruption:

- `app/.data/onboarding.json`: onboarding completion marker (`{ "completed": true, "completed_at": "...", "config_version": "..." }`). Absent or `completed:false` means the skill is still in onboarding. This marker gates the transition to real work (see the Onboarding section).
- `app/.data/current_batch.json`: latest agent-generated batch.
- `app/.data/decisions.json`: user decisions and notes keyed by item id.
- `app/.data/execution_report.json`: latest execution results (merge log).
- `app/.data/agent_tasks.json`: queued agent work — items in `changes_requested` or carrying an `@ai` comment (see Review Model). The agent polls this to pick up revisions.
- `app/.data/agent.lock`: temporary lock while the skill is generating or executing.

Prefer workflow states over domain categories. These states mirror Busabase's change-request lifecycle so the same vocabulary holds whether the backing store is local files or Busabase (see Review Model below):

- `needs_review` (Busabase `in_review`): user must give a verdict — approve, request changes, block, or edit.
- `changes_requested` (Busabase `changes_requested`): the user asked the agent to revise; the agent re-drafts and the item returns to `needs_review`. This is the revision loop — a non-terminal state, not a rejection.
- `approved`: a concrete next step is ready for the agent to merge/execute or continue. Use this for items that do not need another human click.
- `done` (Busabase `merged`): action completed / merged to the canonical artifact, or intentionally no-op.
- `blocked` (Busabase `rejected`/closed): cannot proceed without new information or external state.

Avoid an extra `to_approve` layer unless the human truly must approve each item before anything can continue. If the item already has a safe, concrete, reversible next step, put it under `approved` or an equivalent "ready for agent next" state. Extra intermediate states create fatigue and make the app feel like it is asking the human to click through obvious work.

Show categories and risks as badges, not primary navigation.

## Review Model

The file handoff is the local serialization of a single **review model**, shared verbatim with the recommended cloud provider Busabase (see Data Provider Spectrum). Use this vocabulary consistently across the skill, the app, and every provider so that switching backends is a configuration change, not a rewrite:

| Term | Meaning | Local file | Busabase |
| --- | --- | --- | --- |
| change request | what the agent prepared: a proposed creation or edit awaiting review | items in `current_batch.json` | `change_request` |
| operation | one change inside a change request, with before → after fields | an item's fields + draft | `operation` (`baseFields` → head commit) |
| review | a human verdict on a change request | an entry in `decisions.json` | `review` |
| verdict | the decision verb (see below) | `decision.action` | review verdict + `operations.revise` |
| merge | apply an approved change to the canonical/published artifact | `execution_report.json` + export | `merge` → canonical record |
| comment | a note on an item; an `@ai` comment asks the agent to act | comment/note field | `comment` (`mentionsAi`) |
| agent task | queued work for the agent: items in `changes_requested` or carrying an `@ai` comment | `app/.data/agent_tasks.json` | `GET /api/v1/agent/tasks` |

The verdict verbs are provider-neutral:

- `approve` — verdict approved; the item becomes `approved` and is eligible for merge.
- `request_changes` — ask the agent to revise; the item moves to `changes_requested` and is enqueued as an agent task. After the agent revises, it returns to `needs_review` for re-review. This is the revision loop, not a rejection.
- `revise` — the human saved their own edit as a new version; the item stays in review.
- `block` — reject/close the item.

Busabase is the canonical remote implementation of this model; the local files are its offline form. The local provider should still hold the same shapes so the agent loop and UI behave identically across providers.

## Onboarding

Onboarding is the default initial phase of every App-in-Skill---not a fallback for missing config. A freshly installed skill always starts in onboarding: before it does any real work, it must learn its operating context from the user.

The onboarding loop:

1. On invocation, check for the onboarding marker `app/.data/onboarding.json`. If it is absent or `completed` is false, the skill is in onboarding.
2. While onboarding, the app shows a setup wizard and the skill asks the user---turn by turn---for the configuration that makes it useful: accounts/credentials (created as local config/env files, never pasted into chat), operator profile, brand/product, official URLs, style, risk policy, and safe knowledge sources. The skill performs no external reads/writes during onboarding.
3. The skill validates as it goes (required env vars present, config parses, accounts reachable when checkable) and keeps prompting until the configuration is complete and the user confirms "done".
4. On confirmation, the skill writes the completion marker `app/.data/onboarding.json` (`{ "completed": true, "completed_at": "...", "config_version": "..." }`). This marker latches the transition---like a lock that, once set, lets normal work begin.
5. Only once the marker exists (and the config still validates) does the skill enter normal operation: generating batches, rendering dashboards, executing approved actions, and so on.

Re-entry: if required config or secrets later go missing or fail validation, the skill drops back to onboarding rather than running with a broken context. Onboarding may also be re-run deliberately ("reconfigure") to update the operating context; doing so clears or rewrites the marker.

Templates are examples only: never treat `config.example.json` as a live configuration, and never write the completion marker on its behalf.

## Locking

Create `app/.data/agent.lock` before the skill writes batch/decision/report files or executes external actions. Remove it in a `finally` step.

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
- Keep routes thin and delegate file handling, lock checks, state derivation, and decisions to separate `app/server/*.ts` modules.

The skill should:

- Refuse to execute if required approvals are missing.
- Re-read decisions immediately before executing.
- Write per-item execution results back to the batch or report file.

## UI Rules

Build the app as a quiet local tool, not a landing page. Keep controls obvious and stable.

- Default to launching/reusing the local app when the skill is invoked for review/approval work; use chat-only review only when the user explicitly asks for it.
- Use a quiet, minimal visual language by default: neutral surfaces, soft borders, sparse shadows, restrained accent color, and transparent icon buttons. Avoid black floating mobile buttons, hamburger glyphs, loud selected-row fills, heavy card shadows, decorative gradients, and hover states that turn every control into a high-contrast call-to-action.
- Prefer the minimal panel-style sidebar icon from `references/mobile-shell-layout.md` for sidebar collapse/open controls. It should look like a tool affordance, not a primary action button.
- Always include a small brand/skill icon in the sidebar's top-left brand area and keep it visible when the sidebar is collapsed. The collapse/open control is separate from the brand icon.
- Put a human-attention summary at the top-left of the app, above the normal sidebar navigation. This area answers "what do I need to do?" before anything else. Show the primary human task first, such as `Need a note or decision`, then secondary counts such as `Ready for agent next` and `Blocked`. Add a visual divider below this area before the ordinary filters.
- Use fixed sidebar workflow filters such as `All`, `Needs Review`, `Approved`, `Done`, and `Blocked`. Add `To approve` only when it represents a genuinely distinct human decision, not as a default waiting room for obvious next steps.
- Add hover tooltips for icon buttons, workflow filters, and action buttons.
- Prefer one `Review note` textarea for user guidance.
- Show an editable draft only when a draft exists or the user requests a reply draft.
- For review workflows where the likely next step is a reply, include a `suggested_reply` draft or reply outline so the user can approve/edit directly instead of asking the agent to draft later.
- For queues that users discuss back in chat, show stable per-batch row references such as `Review #1` in both the list and detail views so comments like "change #2" can be resolved unambiguously.
- Auto-refresh files on a timer, but do not redraw while the user is actively editing a textarea or non-search input.
- Keep the top bar and sidebar fixed if the item list scrolls.
- Treat mobile responsiveness as part of the default app contract, not a polish pass. At `<=720px`, collapse the app to one column, use a top mobile bar with the current view/item count and a drawer button, move the sidebar into an off-canvas drawer with a scrim, and show list and detail as separate full-height panes instead of squeezing them side by side. Selecting a row should open the detail pane; the detail pane must have a sticky back-to-list control.
- Make mobile action surfaces touch-friendly and stable. Keep primary detail actions sticky near the top of the detail pane, put secondary actions in a compact menu, and make bulk actions appear only after selection as a horizontally scrollable toolbar. Buttons and row targets should be at least about 36-44px tall where practical, text must truncate or wrap within its container, and no toolbar/menu should create horizontal page overflow.
- Verify the app in both desktop and phone-sized browser viewports before handing it off. For review queues, check at least a 390px-wide viewport and one desktop viewport: the sidebar drawer opens/closes, list rows are scannable, selecting a row opens detail, back returns to the list, sticky actions do not cover content, modals fit, and `document.documentElement.scrollWidth <= window.innerWidth`.
- Use `references/mobile-shell-layout.md` as the reusable checklist/patch template for this pattern: Linear-style desktop shell, phone shell, sidebar icon, scrim behavior, Help & Settings modal, and viewport verification.
- For zero-dependency single-page apps, use native hash routing by default for meaningful view state: `#/items`, `#/items/<id>`, `#/settings`, or workflow-specific equivalents. Do not add a router dependency just to make URLs change. Route all sidebar navigation, list selection, detail tabs, settings/help panels, and other share-worthy states through one small hash router so browser back/forward works, refresh restores the same view, and users can copy a URL back into chat. Use `history.replaceState` for keyboard selection or automatic route cleanup so arrow-key browsing does not flood history; use normal hash changes for user-initiated navigation. Prefer hash routes over `history.pushState` unless the local server intentionally implements an index.html fallback for every app path.
- Use local HTTP on `127.0.0.1`; do not expose the app externally.
- Prefer local app ports in the `3000-4000` range, starting at `3000`; if the port is occupied, reuse it only when the health/state response proves it is the same app, otherwise choose the next available port in the range. Always report the actual URL printed by the launcher.
- If the skill uses private config, show a compact read-only `Help & Settings` summary in the UI so the user can confirm which accounts, identities, profile, style choices, official links, knowledge sources, or data sources are active.
- Support multilingual UI chrome for App-in-Skill apps that have non-English users or mixed-language workflows. Put UI message catalogs in `app/i18n/` (for example `app/i18n/messages.js`) and keep translation data out of the main app logic. Default language mode should be `Auto`, following `navigator.languages`/browser language; also provide an explicit language selector in `Help & Settings` for supported languages, persist the override locally, and keep user data/domain content untranslated unless the workflow explicitly asks to translate it.

### Human Attention Pattern

The first screen should reduce uncertainty. A user opening the app should not need to inspect filters, counts, and item statuses to understand what is expected of them.

Use this sidebar order by default:

1. Brand/app name.
2. Human attention panel: one prominent primary human task plus one or two secondary counters.
3. Divider.
4. Workflow filters/views.
5. Help/settings at the bottom.

The human attention panel should use task language, not data-model language. Prefer labels like `Need a note or decision`, `Ready for agent next`, `Blocked`, `Needs configuration`, or `Waiting on connector`. Avoid vague labels like `Pending`, `Queue`, or `Review required` without saying what action the human can take.

Do not make the user approve the same thing twice. If clicking `Approve plan` only moves an item from a waiting state into another waiting state, collapse those states. The app should reserve human clicks for judgment, edits, exceptions, and irreversible actions.

### Execution Semantics

Model execution plans as real domain actions, not generic verbs. A local approval may be named simply (`archive`, `publish`, `send`, `export`), but the execution report should contain the concrete operation the connector will perform, target identifiers, and safety flags. If a target is missing, block and ask for configuration instead of guessing.

Examples of good execution detail:

- `operation`: `move_to_folder`, `target_folder`: configured destination, `mark_read`: true.
- `operation`: `publish_post`, `channel`: configured channel id, `draft_id`: stable local id.
- `operation`: `export_file`, `path`: output path, `format`: `markdown`.

This keeps the UI simple while making the agent/connector boundary precise and auditable.

## App Types

App-in-Skill does not mandate one app shape. The five-state review flow below is the most common pattern, but it is a *recommended usage for the review-queue type*, not a requirement of the pattern. Pick the type that fits the work, or combine several in one app.

| App type | The user is… | Data shape | Stateful? |
| --- | --- | --- | --- |
| Review queue | judging / editing exceptions and approving meaningful actions | list of items + decisions | yes (workflow states) |
| Dashboard | monitoring | metrics, status, reports | no (read-mostly) |
| Workspace | creating / editing | drafts, assets, collections | partly (creative stages) |
| Control panel | configuring / launching | parameters, modes, triggers | no |
| Collaboration | handing off / deciding together | shared items + actors | yes (usually cloud-backed) |

- **Review queue** — agent prepares a batch with proposed actions and drafts; human judges exceptions, edits, blocks, or approves meaningful actions; skill executes. Email triage, support, content moderation, release approval. Recommended navigation: by *workflow stage* (`Needs Review`, `Approved`/`Ready for agent next`, `Done`, `Blocked`), not by entity/category. Categories and risks are badges. The Batch Schema below is for this type.
- **Dashboard** — read-mostly view over agent-generated metrics/status; no approval lifecycle; often omits `decisions.json`.
- **Workspace** — draft/asset bench organized by creative stage (idea → draft → in progress → finished), with inline editing.
- **Control panel** — steers the agent (launch batch, choose mode, tune params, schedule, dry-run); input file carries parameters/triggers, state file carries run status.
- **Collaboration** — multiple humans around the agent's output (handoffs, multi-stakeholder approval); usually moves the data provider off local files to a shared backend (e.g. `busabase`).

Types compose: a content workflow may show a workspace for drafting, a review queue for approval, and a dashboard for performance — in one app or several sharing a provider. What is universal is only the spec: a skill-launched local UI, a file handoff, a lock, a data provider, private config, onboarding, and a chat-only fallback.

## Batch Schema

The schema below is the contract for the **review-queue** app type. Other app types adapt it (a dashboard replaces `items` with metrics and drops `decisions.json`; a workspace carries drafts with a creative-stage field; a control panel inverts the dominant direction). Start with this minimal item contract and extend only when needed:

```json
{
  "batch_id": "skill-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "skill-name",
  "mode": "app-in-skill",
  "metrics": {
    "needs_review": 0,
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
      "status": "needs_review|changes_requested|approved|done|blocked",
      "proposed_action": "archive|send_reply|draft_reply|no_action",
      "reason": "why this action is proposed",
      "draft": "optional editable draft",
      "suggested_reply": "optional agent-recommended reply draft for review-first items",
      "decision": {
        "action": "approve|request_changes|draft_reply|revise|block|no_action",
        "comment": "user note",
        "decided_at": "ISO timestamp"
      },
      "execution": {
        "status": "pending|executed|blocked|error",
        "operation": "domain-specific operation",
        "target": "optional target id/path/folder/channel",
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
3. Create the local app inside `app/`, with zero-build vanilla **`.js`** UI files at the app root (browser-served; not TypeScript) and TypeScript Node server modules under `app/server/`. The server is a Hono app in `app/server/hono.ts` (API routes + static serving of the vanilla files, with a `.data`/traversal guard) bootstrapped by `app/server/index.ts` via `@hono/node-server`, run on Node ≥23.6 (native type-stripping, no build). Add a root `package.json` with `"type": "module"` and `"engines": { "node": ">=23.6" }` whose only base dependencies are `hono` and `@hono/node-server`, and have `start.sh` run `npm install` on first launch.
4. Add generator, executor, and validator scripts under `scripts/`.
5. Add lock handling to both the skill workflow and the app server.
6. Add `config.example.json` with placeholders only; keep real accounts, tokens, URLs, and personal identities out of the skill. Avoid YAML runtime config in default App-in-Skill projects.
7. Make onboarding the initial phase: on every run, gate real work on the `app/.data/onboarding.json` completion marker. While it is absent/incomplete (or config/secrets are missing or invalid), run the ask-and-configure loop in the app's setup wizard and chat; write the marker only when the user confirms setup is complete.
8. Add data-provider helpers shared by scripts and the app server. The default provider may implement local config/env discovery using the private configuration priority above, but callers should depend on the provider interface.
9. Add a sanitized config summary, active data-provider name, and onboarding status to `/api/state` when the user needs to verify configured accounts, operator profile, style, official URLs, knowledge sources, or data sources.
10. Add the human-attention panel at the top-left and verify that it clearly tells the user what they need to do before they inspect the list.
11. Add a zero-dependency hash router for the app's meaningful state and verify deep links, refresh restore, and browser back/forward behavior. At minimum, sidebar views and selected item/detail routes should have stable hashes.
12. Add the mobile responsive shell: drawer sidebar, mobile top bar, single-pane list/detail navigation, touch-sized action controls, scroll-contained panels, and overflow-safe text. Use `references/mobile-shell-layout.md` as the checklist/patch template for the Linear-style desktop shell, phone shell, sidebar icon, scrim behavior, Help & Settings modal, and verification checks.
13. Start the app with `app/start.sh` and verify the onboarding and main workflow in a browser when available, including at least one phone viewport and one desktop viewport.
14. Run the validator and a dry-run execution before enabling real side effects.

## Safety Defaults

- Treat money, legal, privacy, account access, destructive actions, and outbound messages as approval-required.
- Store only the minimum local content needed for review.
- Do not commit handoff data files (`app/.data/`), secrets, personal inbox configuration, or customer exports.
- Do not expose secret values through UI state, logs, reports, batch files, or browser screenshots; expose only boolean readiness for configured secret env vars.
- Make execution idempotent where possible by storing stable item ids and execution results.
- If the UI and batch schema disagree, stop and update the schema or UI before executing.
