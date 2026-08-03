---
name: kelly-invest-stock
description: Build and operate a Busabase-backed stock strategy experiment desk with a bundled local Hono App-in-Skill, the same source deployable to AirApp, L1/L2/L3 candidate screening, and strategy-level virtual ledgers. Use when the user invokes $kelly-invest-stock or /kelly-invest-stock, wants to define and compare stock-selection strategies, move candidates through research and paper-validation stages, inspect evidence and invalidation rules, or review virtual performance and drawdown. It never connects to a brokerage, places orders, moves money, or presents generated analysis as personalized investment advice.
---

# Kelly Invest Stock

Build a compact strategy experiment desk. Keep the workflow centered on three
questions: which strategy is being tested, why a stock belongs at its current
level, and what the virtual ledger says about the strategy's behavior.

## Mandatory Dependencies

Before designing, creating, or changing the app:

1. Read and follow `$kelly-app-skill-creator` for product behavior, visual quality, responsive layout, and the complete local `app/` artifact.
2. Read and follow `$busabase` for connection, target Space, API, ChangeRequest, review, and merge behavior.
3. Read and follow `$busabase-app-creator` for resource modeling, AirApp runtime limits, security, validation, and deployment.
4. Read `references/stock-sdk.md` before implementing or changing market-data ingestion.

If a required skill is unavailable, continue safe local app work but stop before
the unavailable Busabase or deployment operation and report the missing dependency.
Never replace Busabase persistence with local JSON, browser storage, SQLite, or a
file-backed provider.

## Product Boundary

- Treat every account, position, return, and promotion as research simulation.
  Never connect to a brokerage, create an order ticket, or label L3 as live money.
- Support a small set of explicit strategies. Each strategy must define a thesis,
  selection rule, invalidation rule, benchmark, review cadence, and virtual account.
- Use the three stages consistently:
  - `L1`: research pool; hypothesis exists but evidence may still be incomplete.
  - `L2`: paper validation; candidate is tracked in a virtual ledger and evaluated
    for return, drawdown, and consistency with the strategy.
  - `L3`: graduation watch; validation passed, but the candidate remains virtual
    and read-only.
- Keep facts, assumptions, scores, and judgment separate. A high score is not a
  recommendation and does not bypass evidence or invalidation rules.
- Use exact-pinned `stock-sdk@2.4.0` only in reviewed server, Agent, or Workflow
  execution. Do not call public market sites from browser code or require a
  market-data API key, token, Vault secret, Python runtime, native binary, or subprocess.

## App Artifact

- Keep the complete canonical project under `<skill-root>/app/` and provide a
  working `pnpm --dir <skill-root>/app dev` command.
- Follow the UI and product contract from `$kelly-app-skill-creator`; delegate the
  runtime, SDK, security, validation, and deployment contract to
  `$busabase-app-creator` rather than defining another runtime here.
- Read all persistent config, state, decisions, strategies, candidates, and ledger
  records through `busabase-sdk` from Busabase.
- Keep deterministic Demo data explicit and read-only. Demo mode may mirror the
  same four-resource shape but must never become the persistent backend.
- Build and sync AirApp from the committed local source. Do not maintain a second
  remote implementation.

## Core Resources

Model the simplified product with four application-owned Bases under one
application Folder:

- `strategies`: name, key, family, status, thesis, selection rule, invalidation
  rule, review cadence, benchmark, and confidence.
- `candidates`: security identity, strategy key, L1/L2/L3 stage, component scores,
  reference price, thesis, evidence, invalidation, next review, and freshness.
- `ledger-accounts`: one virtual account per strategy with nominal capital, NAV,
  cash, benchmark return, maximum drawdown, and update time.
- `ledger-positions`: virtual quantity, entry price, reference price, market value,
  weight, and strategy key.

Provision missing application-owned resources lazily through a Busabase
ChangeRequest, then re-read the Folder and use only materialized IDs. Do not ask the
user to create Nodes or copy Base IDs. Ignore legacy app-owned resources that are
outside the current declared resource set; never delete them implicitly. When an
older Busabase runtime dropped ownership metadata, lazily repair it only after the
Folder and every declared Base match the exact name, description, type, and field
fingerprint. Persist the ownership marker when the runtime supports node metadata;
otherwise use the verified materialized IDs in legacy compatibility mode. Never
adopt a same-slug resource from its slug alone.

## Operating Loop

### Research

Define the strategy before adding candidates. For each candidate, gather cited
evidence, record freshness and source time, score only declared dimensions, and
write a falsifiable invalidation condition. Missing evidence keeps the candidate
in L1.

### Plan

Create a review plan that states the next evidence needed, the review date, and the
graduation or demotion condition. Promote to L2 only when the thesis and
invalidation rule are reviewable. Promote to L3 only after enough paper history
exists to evaluate return, drawdown, and benchmark behavior.

### Action

Allow only reviewable research actions: refresh market observations through
trusted execution, update evidence, change a stage through Busabase's reviewed
mutation flow, and record virtual ledger events. Never make a stage change from a
browser-only local state mutation.

### Retrospective

Compare each strategy's virtual return, benchmark return, maximum drawdown, and
candidate outcomes. Record whether the thesis or process was wrong before changing
rules. Route proposed rule changes back through Plan rather than silently rewriting
the strategy.

## UI Contract

Keep the first screen as the operating desk, not a landing page:

- Fixed desktop sidebar with a human-attention summary and navigation for Strategy,
  L1, L2, L3, Virtual Ledger, and Help & Settings.
- A visible L1 -> L2 -> L3 funnel with counts and distinct but restrained stage colors.
- Desktop list/detail split for strategy, candidate, and virtual account views.
- On mobile, use the shared off-canvas sidebar and separate list/detail route; keep
  a sticky back action and prevent horizontal overflow at 390px and 360px widths.
- Show strategy rules, candidate score components, evidence, invalidation, next
  review, account NAV, benchmark, drawdown, and virtual positions without nested cards.
- Keep “all accounts are virtual” visible and describe L3 as graduation watch,
  never as real trading.

## Metric Rules

- Preserve the security code, exchange, currency, upstream source, source time,
  fetch time, and freshness. Do not infer a missing reference price.
- Calculate virtual position P/L as `quantity * (latest reference price - virtual
  entry price)` and account return as `NAV / nominal capital - 1`.
- Calculate weights only from usable virtual market values. Mark account summaries
  partial when any included position lacks a usable price.
- Compare strategies on the same time window and benchmark before ranking them.
  Do not compare raw returns from different inception dates as if equivalent.
- Keep Demo observations fixed and dated. Never present them as live market data.

## Completion Criteria

Finish only when:

- `pnpm --dir app dev` starts the complete local Hono application;
- Strategy, L1, L2, L3, and Virtual Ledger routes work on desktop and mobile;
- each strategy has explicit selection and invalidation rules plus a virtual account;
- candidate detail shows scores, evidence, invalidation, stage, and next review;
- the four-resource declaration and lazy provisioning pass fixture tests, including
  compatibility with a legacy app-owned root Folder;
- all persistent state uses Busabase and Demo remains explicitly deterministic;
- `stock-sdk` is pinned exactly and browser code performs no public market fetch;
- local OAuth credentials remain local and business data requires no Vault secret;
- local OAuth verifies Spaces before resource access, auto-selects a single or
  open-source `local` Space, and requires an explicit native selector when the
  account can access several Spaces;
- no brokerage path, real-money stage, trading action, or personalized investment
  claim exists; and
- deployment and real-data checks required by the dependency skills pass.

## Stop Conditions

Stop before consequential Busabase mutation when the target Space is ambiguous,
the current user lacks permission, a same-slug resource is not application-owned,
security identity cannot be resolved, freshness is unknown for a consequential
calculation, or the requested workflow crosses into brokerage execution or money movement.
