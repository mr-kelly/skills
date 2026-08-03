---
name: kelly-app-skill-creator
description: Design and create Busabase-backed App-in-Skill packages with a canonical app project, Busabase-native setup and product onboarding, review/execution workflows, a standardized responsive UI, and AirApp-first delivery. Use when a user wants a Busabase research desk, review queue, planner, action console, operating dashboard, control panel, collaboration workspace, onboarding/readiness flow, or an existing Kelly App-based skill updated. Every generated skill contains a complete app/ project, deploys that source to Busabase AirApp by default, runs pnpm dev only when local preview is explicitly requested, follows the Kelly desktop and phone UI contract, delegates AirApp runtime, SDK, security, scaffolding, and deployment constraints to busabase-app-creator, and delegates repository-level conformance testing to kelly-app-skill-creator-tests.
---

# Kelly App Skill Creator

Turn a recurring human-and-Agent operation into a Busabase-backed skill with a
canonical Hono project whose normal delivery target is Busabase AirApp. Own the
product workflow and the App-in-Skill artifact contract; delegate Busabase
resource implementation and AirApp deployment mechanics.

## Ownership Boundary

Keep the two creator skills complementary and non-overlapping:

- This skill owns product behavior, information architecture, visible UI, layout,
  interaction patterns, responsive behavior, accessibility, Help & Settings,
  hash routing, and visual acceptance for every generated app.
- `$busabase-app-creator` owns AirApp runtime language, framework, server shape,
  dependency and SDK constraints, security boundaries, validation, sync, and
  deployment mechanics.
- `$kelly-app-skill-creator-tests` owns repository-level conformance, process,
  responsive browser, OSS Busabase, Cloud OAuth, persistence, and AirApp parity
  tests for the generated app.
- Do not delegate Kelly UI decisions to `$busabase-app-creator`, and do not let a
  runtime scaffold replace or weaken this skill's desktop or phone shell.
- Do not restate AirApp runtime limits here. When a runtime rule affects UI
  implementation, satisfy it inside the UI contract rather than creating a
  competing runtime contract.

## Mandatory Dependencies

Before creating or changing an app:

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, merge, and trusted mutations.
2. Read and follow `$busabase-app-creator` for resource modeling, native Views,
   Vault boundaries, AirApp constraints, scaffolding, validation, sync, and
   deployment.

If a dependency is unavailable, preserve this skill's local artifact and product
contracts, stop before the unavailable Busabase operation, and report the exact
missing dependency. Do not invent a second data backend.

Before declaring a generated app complete, read and follow
`$kelly-app-skill-creator-tests`. Keep app-owned unit tests in `<skill-root>/app/test/`
and delegate shared harness, external Busabase, OAuth, responsive browser, and
AirApp parity acceptance to that testing skill. If it is unavailable, run the
app's deterministic local checks and report the missing conformance suites rather
than claiming full completion.

## Reference Map

Read the two UI references completely for every app creation or UI change. Read
the other selected references completely before acting:

| Need | Reference |
| --- | --- |
| Busabase SDK, node selection, config, state, locks, readiness, secrets | `references/busabase-data-contract.md` |
| Runtime readiness, product onboarding, setup UX, reconfiguration | `references/setup-onboarding.md` |
| Human verdicts, Agent revision, claims, external execution, recovery | `references/review-and-execution-contract.md` |
| Product shape selection | `references/app-types.md` |
| Research/Plan/Action/Retrospective patterns | `references/workflow-patterns.md` |
| Attention UI, review actions, routing, settings, i18n | `references/ui-workflow-patterns.md` |
| Desktop and mobile shell implementation | `references/mobile-shell-layout.md` |
| Large zero-build frontend module splits | `references/frontend-modules.md` |
| Large stylesheet splits with cascade layers | `references/css-modules.md` |
| Requested screenshots or demo recordings | `references/demo-recording.md` |

## App-in-Skill Contract

- Every generated skill includes a complete canonical project at
  `<skill-root>/app/`, including its own `package.json`, lockfile, server entry,
  browser files, checks, and blueprint/resource map. It must remain locally
  runnable with `cd <skill-root>/app && pnpm dev` or
  `pnpm --dir <skill-root>/app dev`, but do not start it unless the user
  explicitly asks for local preview or local debugging.
- Delegate the runtime language, framework, dependency, SDK bundle, server,
  Nodepod, validation, and deployable-file rules to `$busabase-app-creator`.
  Never restate or override those rules here or in a generated domain skill.
- Treat the committed local source as canonical. Build and sync the AirApp from
  that source; never leave a remote-only AirApp edit without back-porting it.
- Use the same UI, routes, domain logic, validation, and Busabase resource map
  locally and in AirApp. Isolate only the runtime bootstrap/transport adapter.
- Use `busabase-sdk` as the application data boundary. Persistent domain config,
  workflow state, user decisions, locks/claims, and domain records belong in
  Busabase, not local JSON, `app/.data/`, SQLite, or browser storage.
- Permit environment variables only for connection bootstrap such as
  `BUSABASE_BASE_URL`, `BUSABASE_API_KEY`, and `BUSABASE_SPACE_ID`. They are not a
  parallel domain-config system.
- Never expose an API key or Vault value to browser code, UI state, logs, demos,
  or screenshots. Secret access stays in the Hono server or trusted AirApp
  execution boundary.
- Keep external side effects outside the AirApp. The AirApp may submit a
  ChangeRequest-producing decision or proposal; only a trusted Agent or Workflow
  may use Vault-backed integrations to send, publish, delete, charge, transfer,
  or mutate an external system after its own required authorization.
- Use local storage only for disposable browser presentation state when it cannot
  affect behavior, authorization, workflow, or cross-device expectations. Store
  operator preferences in Busabase when they should follow the operator.
- Do not offer provider choice. Local development connects to local, Cloud, or
  self-hosted Busabase through the same SDK contract.

## Default Delivery Mode

Use `airapp-first` unless the user explicitly asks for `pnpm dev`, a local URL,
local preview, or local debugging.

- In `airapp-first`, generate and keep `<skill-root>/app/` as the canonical
  source, run its deterministic checks, and submit that same reviewed tree as a
  Busabase AirApp ChangeRequest. Do not start a standalone local server merely
  because the project supports one.
- After the named AirApp CR is merged with explicit authority, Run the AirApp in
  the selected Busabase and perform product, desktop, phone, ambient-session,
  resource, and real-data acceptance there. Return the exact clickable AirApp
  URL; do not substitute a localhost URL.
- Use `local-preview` only after an explicit user request. Then start `pnpm dev`,
  apply the Connection UX Contract, report the local URL, and state plainly that
  the process is standalone and has not uploaded or deployed an AirApp.
- A Folder or Base created in Busabase does not prove that the AirApp exists.
  Confirm an actual `airapp` node and its merged version before saying it was
  uploaded, deployed, or is running in Busabase.
- Local preview never becomes a second implementation. Whether or not it is
  started, the same `<skill-root>/app/` tree remains the only source submitted to
  AirApp.

## Connection UX Contract

When `local-preview` was explicitly requested, every standalone loopback
App-in-Skill must be usable without a CLI login or pasted API key. Only in that
standalone local context, when no connection exists, show one focused setup
screen with:

- a selected `Busabase Cloud` option using the canonical Cloud URL;
- a `Custom server` option that reveals one URL field for self-hosted or
  enterprise Busabase;
- one primary `Connect Busabase` action that starts browser OAuth;
- one secondary, visually quieter Demo action when the app has a deterministic
  Demo provider.

Do not ask for an API key, device code, terminal command, provider selection, or
secret-storage choice. Cloud/custom is a hosting target choice, not a data
provider choice. Preserve the chosen server only as connection bootstrap; all
product configuration still comes from Busabase nodes through `busabase-sdk`.

After OAuth returns, distinguish successful authentication from resource
readiness. Show the sanitized server origin and then guide the user through
Space ambiguity, missing Folder/resources, schema migration, and Vault
requirements as separate states. An expired or revoked session returns to the
same connection screen with a concise retry message. Demo never impersonates a
successful connection and remains explicitly labeled read-only.

Apply `references/setup-onboarding.md` after authentication. Infrastructure
readiness and product onboarding are separate: a connected, materialized AirApp
may still need operator context, policies, sources, thresholds, schedules, or
approval rules before the workflow can act.

Never tell the operator to create Nodes/Bases, approve a list of unnamed
ChangeRequests, or copy materialized ids into deployment config. For an approved
lazy-provisioning blueprint, show one `Initialize workspace` action and concise
progress while `$busabase-app-creator` submits the exact declared structure as an
idempotent ChangeRequest. Continue automatically when it materializes. If the
viewer lacks write permission, show the one pending CR id or the exact permission
needed; the operator reviews that request, not a manual schema recipe.

This screen must fit the same phone contract as the main app: one-column server
choices and full-width primary action at 390px and 360px, no horizontal overflow,
and no terminal instructions. A deployed AirApp uses the ambient Busabase
session and must not show the local OAuth gate, call `/auth/status` or
`/auth/start`, or navigate to a Busabase OAuth endpoint.

Delegate PKCE, callback validation, owner-only local credential registration,
refresh/revoke behavior, proxy injection, and AirApp ambient-session rules to
`$busabase-app-creator`. Browser JavaScript must never receive an OAuth access
token, refresh token, PKCE verifier, or Vault value.

## Mandatory UI Contract

Build a quiet operator tool, not a landing page or generic dashboard. Apply
`references/ui-workflow-patterns.md` and
`references/mobile-shell-layout.md` as hard implementation and acceptance gates.

- Put the brand, human-attention summary, workflow navigation, and Help &
  Settings in a fixed desktop sidebar. Collapse it to an icon rail with a panel
  icon; keep the brand icon visible.
- State the human task in action language and show the primary attention count
  above workflow navigation. Use stable row references for review queues.
- For item-oriented work, use a desktop list/detail split such as
  `minmax(360px, 38%) minmax(0, 1fr)`. Keep list and detail scrolling inside
  their panes.
- Use native hash routes for meaningful views, selection, and Help & Settings so
  refresh and browser back/forward restore context.
- At widths up to 720px, switch to a real phone shell: compact top bar,
  off-canvas sidebar with scrim, separate full-height list and detail panes,
  sticky back-to-list control, and sticky primary detail action when the workflow
  has one. Do not merely shrink the desktop UI.
- Keep touch targets 36-44px, wrap long values, and prevent page-level horizontal
  overflow. Make Help & Settings a responsive modal and a full-screen panel on
  phones.
- Verify at approximately 1280x820, 390x844, and 360x740. Exercise sidebar
  collapse/drawer, scrim, navigation, row selection, detail back, modal tabs,
  browser history, and overflow before handoff.

## Busabase Resource Discipline

Select nodes for their native strengths instead of putting everything in one
JSON blob:

- use Folder and the Node tree for the app root, resource discovery, hierarchy,
  stable ownership, and navigation;
- use Base for structured configuration, policies, workflow rows, review items,
  claims, metrics, and relations;
- use Vault for secrets and secret references; surface readiness only;
- use Doc for long-form instructions, research templates, playbooks, and editable
  narrative content;
- use Drive and File for imports, attachments, exports, and large artifacts;
- use native Views for routine table, gallery, kanban, calendar, and gantt work;
- use AirApp for cross-resource synthesis, prioritization, guidance, and focused
  commands.

Create an explicit resource map before implementation. Record stable node ids or
slugs, purpose, schema/version, read/write behavior, mutation path, and the screens
or jobs that consume each resource. See `references/busabase-data-contract.md`.

## Product Loop

Default to this four-stage operating loop.

### Research

Collect evidence on a schedule or on demand. Update an idempotent report for its
period key and record source freshness, coverage, uncertainty, and findings.

### Plan

Turn evidence into concrete, deduplicated work items linked back to their sources.
Let humans opt out, block, reprioritize, reschedule, or request revision. Use an
attention queue instead of forcing users to inspect every row.

### Action

Claim eligible work atomically, create reviewable deliverables or ChangeRequests,
record progress and failures, and keep consequential side effects behind the
trusted approval/execution path.

### Retrospective

Compare outcomes with original evidence and decisions. Propose improvements to
prompts, skills, thresholds, sources, schedules, resource schemas, or UI as new
Plan items; do not silently rewrite production rules from one outcome.

Not every stage needs its own screen. State where each stage happens or why it is
intentionally omitted.

## Discovery

Ask one question at a time. Learn enough to determine:

- who operates the app, how often, and what outcome they own;
- what triggers Research and defines one reporting period;
- how evidence becomes a deduplicated Plan item;
- what defaults to eligible and what humans may stop or revise;
- what Action produces, where it is reviewed, and which effects are external;
- what makes Retrospective useful;
- which states require human attention;
- which operations belong in native Views versus AirApp;
- which existing Busabase Folder, Base, Doc, Drive, File, Skill, or Vault nodes
  should be reused and which must be proposed.

Do not ask the user to choose a provider, framework, schema mechanism, local
config path, or secret-storage method.

## Product Overlay

Before creation, produce this concise overlay for `$busabase-app-creator`:

```markdown
# Product Overlay

User and outcome: ...
App type: ...

Research: trigger, period key, evidence, freshness, idempotency
Plan: issue/recommendation rule, traceability, default eligibility, opt-out
Action: atomic claim, deliverable, review point, external side effects
Retrospective: outcome signals, cadence, skill/process feedback

Human attention states: ...
Agent responsibilities: ...
Product onboarding: required operating context and completion/version rule
Native Views needed: ...
AirApp screens and focused actions: ...
Busabase resource map: Folder/Node root, Bases, Docs, Drives/Files, Vault refs
Delivery mode: airapp-first unless the user explicitly requested local-preview
Guide copy in plain language: ...
Explicit exclusions: ...
```

The overlay describes product behavior. `$busabase-app-creator` translates it
into the complete resource graph, capability matrix, security model, canonical
`<skill-root>/app/` scaffold, AirApp-compatible implementation, validation, sync,
and deployment.

## Creation Workflow

1. Read the relevant references and inspect nearby App-based skills before
   choosing a structure.
2. Establish the Busabase connection and explicit target Space.
3. Discover the target Node tree and draft the resource map.
4. Agree on the Product Overlay and let `$busabase-app-creator` validate the
   technical blueprint.
5. Have `$busabase-app-creator` create or update the complete canonical project at
   `<skill-root>/app/`. Do not invent a second runtime layout in this skill.
6. Implement one Busabase repository/service boundary over `busabase-sdk`.
   Browser code calls Hono/AirApp routes; it does not hold credentials.
7. Implement the runtime/product onboarding state and every review/execution
   lifecycle required by the overlay. Apply `references/setup-onboarding.md` and
   `references/review-and-execution-contract.md`; do not invent local markers,
   locks, or a second provider.
8. Keep setup, seed, refresh, migration, validation, and sync scripts as thin
   entrypoints over shared modules. Avoid Python, native binaries, subprocess
   orchestration, and filesystem-backed workflow state unless a domain adapter
   strictly requires them and AirApp compatibility is preserved.
9. Run app-owned lint/typecheck/tests/build without starting a persistent local
   server, then use `$kelly-app-skill-creator-tests` for repository-level
   contract, browser, OSS, and available Cloud suites. When the user explicitly
   selected `local-preview`, also run `pnpm --dir <skill-root>/app dev` and
   complete local connection, workflow, recovery, desktop, and phone acceptance
   before continuing.
10. By default, submit the same canonical source directly as a reviewable AirApp
   CR through `$busabase-app-creator`; return its clickable Busabase review URL
   and wait for the named merge authorization.
11. After merge, Run the AirApp in Busabase and verify the same resource map,
    representative data, ambient session, main workflow, recovery states, and
    mandatory desktop/phone shell behavior. Report the canonical AirApp URL.
    Report a local URL only when `local-preview` was explicitly requested.

## Onboarding And Readiness

Apply `references/setup-onboarding.md`. The app must remain startable in an
explicit local preview even when Busabase is not ready, and the hosted AirApp
must render one setup/onboarding gate rather than silently switching to local or
Demo data. Distinguish runtime readiness from product onboarding.

Runtime readiness states include:

- missing connection bootstrap;
- unauthenticated or unreachable Busabase;
- ambiguous or inaccessible Space;
- missing app Folder/resources;
- schema migration needed;
- missing Vault references;
- ready.

Product onboarding separately covers the durable operating context, policies,
sources, schedules, thresholds, and approval rules required by this workflow.
Persist its fields and completion/version state in Busabase. Do not enable
external reads or consequential actions whose product prerequisites are
incomplete.

For missing or expired authentication, apply the Connection UX Contract above;
do not replace its OAuth action with CLI instructions or a credential input.

Show sanitized connection and resource identifiers plus an actionable recovery
step. Never accept or echo secret values in the browser. Provision or repair
resources through reviewed ChangeRequests when required. A recovery step may ask
the operator to initialize, retry, select a Space, or review one named CR; it must
not delegate Node/Base construction or id wiring to them.

## Completion Criteria

Finish only when:

- the skill contains a complete canonical `<skill-root>/app/` project and
  `pnpm --dir <skill-root>/app dev` remains supported, whether or not local
  preview was requested;
- `$busabase-app-creator` runtime, SDK, security, validation, and deployment checks
  pass without a conflicting local runtime contract;
- `$kelly-app-skill-creator-tests` required local and OSS suites pass, and its
  Cloud/AirApp suites pass when their declared environment is available; skipped
  external suites are reported explicitly;
- the Busabase connection, target Space, app root, and resource map are explicit;
- all persistent config, state, decisions, claims, and domain data use
  `busabase-sdk` and appropriate Busabase nodes;
- Vault values and API credentials never reach browser-visible surfaces;
- local setup offers Cloud/custom URL OAuth plus an explicit Demo path, while
  deployed AirApp uses its ambient session;
- Research, Plan, Action, and Retrospective are represented or intentionally
  omitted;
- human attention, opt-out, review, and Agent claim rules are unambiguous;
- runtime readiness, product onboarding, review verdicts, Agent revision,
  external execution, and recovery obey their selected reference contracts;
- local and AirApp runs use the same application source and resource contract;
- the default delivery produced a merged, verified AirApp and a clickable target
  URL; a local URL is reported only for an explicitly requested local preview;
- the Kelly desktop sidebar, attention, workflow navigation, list/detail, hash
  routing, and Help & Settings contract is implemented where applicable;
- 1280px desktop, 390px phone, and 360px narrow-phone workflows pass visual,
  interaction, and horizontal-overflow checks;
- validation, deployment, and real-data checks required by dependency skills
  pass.

## Stop Conditions

Stop when a dependency is unavailable for the next required operation, the target
Space or app root is ambiguous, node capabilities cannot support the intended
model, a secret would cross into the browser, a side effect lacks a reviewed
trusted-execution path, or local and AirApp implementations would require separate
business logic.
