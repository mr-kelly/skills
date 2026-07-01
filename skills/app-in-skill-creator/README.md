# Introducing App-in-Skill

App-in-Skill is a pattern for skills that deliver their capabilities through a small local visual app, without becoming a full product.

The idea is simple: the agent keeps its reasoning and execution ability, while humans get a visible, operable, and collaborative interface for participating in the workflow. The app does not own the workflow. It reads and writes local handoff files, while the skill remains responsible for reasoning, external actions, safety checks, and execution.

It is a bridge between chat and software. Chat is the fastest way to describe intent and adjust a workflow, but many real tasks eventually need a visual surface: status, queues, dashboards, previews, editors, controls, settings, and clear feedback. App-in-Skill keeps the flexibility of agent collaboration while giving users a stable interface for seeing and steering the work.

This is useful when chat alone is too flat:

- inbox-zero workflows where many items need quick approval
- review queues with drafts, risk labels, and notes
- dashboards over agent-generated data, status, and progress
- workspaces for drafts, assets, configuration, and intermediate outputs
- control panels for starting batches, choosing modes, and adjusting parameters
- collaboration surfaces where humans comment, edit, confirm, or hand work off
- lightweight operations that are too personal or too early for a real SaaS backend

It is especially useful for long-tail workflows: tasks that are important to a person or team, change often, and do not justify a full application. A skill can be adapted through conversation, while the app gives that evolving workflow enough structure for other people to use it.

## Why Users Need This

Most users do not want a skill's output to exist only as a chat transcript. Chat is good for asking, correcting, and giving judgment, but many workflows need visible state, structured outputs, controls, and a place where humans can work together around the agent's results.

An App-in-Skill gives the user:

- a visible queue, dashboard, workspace, or control panel instead of only a scrolling conversation
- one place to inspect outputs, source context, settings, risks, and suggested actions
- controls for launching batches, choosing modes, editing drafts, and adjusting parameters
- stable item references such as `Review #1` or `Task #3` so chat comments can refer back to the UI
- a help and settings panel that shows where batch files, decision files, config, and account summaries live
- persistent human input that survives refreshes, pauses, and interrupted runs
- a safer execution habit: the app records what humans changed, confirmed, or approved, while the skill performs sensitive actions later

This makes agent-assisted work easier to hand to teammates. The expert can still shape the workflow through chat, but other users get a concrete interface instead of needing to understand the whole agent conversation.

## Why Developers Use This Pattern

For developers, App-in-Skill is a lightweight way to ship useful workflow software without turning every workflow into a large app project.

The pattern works because it separates concerns:

- the skill owns reasoning, orchestration, external reads/writes, and approval gates
- the app owns visual delivery, human controls, collaboration, editing, filtering, and local state display
- handoff files define the contract, so the app and agent can evolve independently
- config readers keep private local files, databases, and future remote providers behind one interface
- the UI can stay simple because the agent generates the data, state, drafts, recommendations, and explanations

This keeps the first version small. A developer can start with local files and a local HTTP app, then later swap the data source to PostgreSQL, AITable.ai, Notion, Busabase, or another provider through the data-provider layer. The user-facing workflow does not need to be rebuilt just because the storage shape changes.

## Good Fits

App-in-Skill works best when the workflow needs both agent capability and human participation:

- Review: email triage, customer-support queues, PRs, release notes, content, and copy.
- Dashboard: agent-generated metrics, status, task progress, GA/ad analysis, and execution reports.
- Workspace: drafts, source material, assets, content repurposing, configuration checks, and intermediate outputs.
- Control panel: batch launchers, mode selection, parameter tuning, scheduled workflow checks, and dry-run controls.
- Collaboration: comments, edits, confirmations, handoffs, and shared decisions around agent output.

The common shape is: the agent prepares data, state, options, evidence, drafts, or recommendations; humans inspect, edit, steer, or confirm them in the app; the skill handles the next reasoning or execution step.

## The Boundary

An App-in-Skill has three parts:

- `SKILL.md`: the agent's operating instructions and safety rules
- `app/`: a local browser UI for visual delivery, workflow control, collaboration, review, and editing
- `scripts/` plus `lib/`: deterministic generation, validation, execution, and data access helpers

The app should be boring in the best way. It shows the workflow state, gives humans the right controls, and saves human input locally. It should not send email, delete records, charge money, mutate remote systems, or perform side effects. Those actions belong to the skill, after explicit approval when approval is required.

## The File Contract

The handoff files are the contract:

- `app/.data/current_batch.json`: what the agent prepared
- `app/.data/decisions.json`: what the user decided
- `app/.data/execution_report.json`: what the agent executed
- `app/.data/agent.lock`: whether the agent is currently writing or executing

This keeps the workflow recoverable. If the browser refreshes, the batch is still there. If the agent pauses, the user's decisions are still there. If a run is interrupted, the execution report can explain what happened.

## Why This Pattern Works

Chat is great for intent, judgment, and changing direction. UI is better for state, structure, batch operations, visual feedback, and collaboration. The skill is better for reasoning, automation, execution, and safety gates. App-in-Skill combines the three into a clearer delivery shape for agent work.

The result is a small but powerful loop:

1. The skill prepares data, state, drafts, options, or recommendations.
2. The app shows the work in a usable visual surface.
3. Humans inspect, edit, configure, comment, or approve.
4. The skill continues reasoning or executes approved/safe actions.
5. The app shows what changed, what is done, what is blocked, and what needs attention.

This loop also makes the workflow teachable. A user can start in chat, ask the agent to prepare a workspace or batch, inspect it visually, then return to chat with precise feedback like "change Task #2", "rerun with stricter filters", or "approve everything except the blocked item." The interface carries state and collaboration, while chat stays available for higher-level judgment and changes.

## Configuration

App-in-Skill projects should keep public code generic and private context local. Accounts, aliases, operator profile, brand settings, style, URLs, knowledge sources, and risk rules should live in ignored config files such as:

- `~/.config/<skill-name>/config.json`
- `~/.config/<skill-name>/.env`
- `<skill-name>/config.local.json`

The code should read config through a data-provider layer, not by hardcoding local files everywhere. The default provider should load JSON and env files using only built-in Node.js modules, so a new App-in-Skill starts with zero npm dependencies. Later it can load from Busabase, PostgreSQL, AITable.ai, Notion, or a product cloud without rewriting the UI. We recommend Busabase as the cloud provider: it gives AI-generated articles, assets, and records a review Inbox before they become canonical records — the App-in-Skill loop as a shared system of record.

For users, this means the app can show a safe summary of what is connected: which accounts, identities, config source, batch file, and decision file are active. For developers, it means local-file mode and database-backed mode can share the same UI and execution scripts.

## Default Shape

Use Node.js for the local server and scripts unless the skill has a strong reason to do otherwise. The default scaffold should have no npm dependencies: no `package.json`, no `npm install`, and no framework requirement. Use built-in Node modules for HTTP, files, paths, locking, launching, JSON parsing, and validation. Add dependencies only for real integrations such as IMAP/SMTP, MIME parsing, OAuth/API clients, document parsing, browser automation, or database drivers, and keep those dependencies out of the base local app.

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
│   └── data-provider/
├── scripts/
├── references/
└── config.example.json
```

Keep shared code in `lib/`. Keep `scripts/` as thin entrypoints. Keep real config, secrets, handoff data files (`app/.data/`), and generated local state out of git. Use JSON for runtime config in zero-dependency skills; convert old YAML notes to JSON before runtime instead of adding a YAML parser.

## UI Pattern

Put a small human-attention panel at the top-left of the app, above the normal sidebar filters. It should answer "what do I need to do?" immediately: one primary task such as `Need a note or decision`, plus secondary counts such as `Ready for agent next` and `Blocked`. Add a divider below it before the ordinary views.

Use a quiet, minimal visual language by default: neutral surfaces, soft borders, sparse shadows, restrained accent color, and transparent icon buttons. Avoid black floating mobile buttons, hamburger glyphs, loud selected-row fills, heavy card shadows, decorative gradients, and hover states that make every control feel primary.

For zero-dependency single-page apps, use native hash routing by default. Meaningful states should have copyable URLs such as `#/items`, `#/items/<id>`, or `#/settings`, without adding a router package. Route sidebar views, selected rows, detail tabs, and settings/help panels through one small hash router so refresh restores the same view and browser back/forward works. Use `history.replaceState` for keyboard selection or automatic cleanup so rapid navigation does not fill the history stack.

Mobile responsiveness is part of the default contract. At phone widths, collapse to one column, use an off-canvas sidebar drawer with a scrim, add a compact top bar with the current view and count, and show list/detail as separate full-height panes with a sticky back control. Keep primary actions sticky, secondary actions in a compact menu, and bulk actions as a selection-only horizontal toolbar. Verify at a phone viewport and a desktop viewport, including no horizontal page overflow.

See `references/mobile-shell-layout.md` for the reusable checklist and patch template for the mobile shell, sidebar icon, scrim behavior, modal layout, and Linear-style desktop shell.

Avoid extra approval layers. If an item already has a safe, concrete next step, show it as approved/ready for the agent rather than making the human click through a `To approve` holding state. Save human clicks for judgment, edits, exceptions, and irreversible actions.

Execution reports should describe the real operation and target, not only a generic action label. If a connector needs a folder, channel, path, account id, or other target and it is missing, block and ask for configuration instead of guessing.

## The Taste

An App-in-Skill should feel like a quiet cockpit for one workflow. It is not a landing page. It is not a SaaS app pretending to be finished. It is a local tool that helps the user receive, inspect, steer, and collaborate with the skill's output with less fatigue and more control.

Keep it specific to the work. The best App-in-Skill apps are not generic dashboards; they are small, concrete work surfaces for the task at hand.
