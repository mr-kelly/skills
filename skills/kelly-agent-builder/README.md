# Agent Builder & Governance Console

Agent Builder & Governance Console is a Busabase-backed App-in-Skill for a
platform team that wants to let other teams safely spin up simple LLM agent
configs. It is a **mock** governance tool: it never provisions or calls a real
agent. Every create, edit, activate, pause, and archive action reads or
writes an `agents` record in Busabase.

## What It Shows

- **Overview**: live agent count, aggregate quota usage (calls vs. total
  quota), and a list of agents that need attention with the specific reason
  (draft missing required fields, no owning team, over quota, or approval
  required with no owner).
- **Catalog**: sortable, searchable table of every agent config — name,
  owning team, status badge, and quota usage.
- **Agent detail / edit**: trigger/intent description, a checklist of allowed
  tools from a fixed catalog, an approval-required toggle, a monthly quota
  input, the owning team field, current status, and lifecycle actions
  (activate, pause, archive).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Agent Builder overview"></td>
    <td width="50%"><img src="assets/screenshots/catalog.webp" alt="Agent Builder catalog"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Governance summary with live count, quota usage, and agents needing attention.</td>
    <td><strong>Catalog</strong><br>Sortable, searchable agent config table.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/agent-detail.webp" alt="Agent Builder agent detail"></td>
    <td width="50%"><img src="assets/screenshots/overview-zh-CN.webp" alt="Agent Builder overview zh-CN"></td>
  </tr>
  <tr>
    <td><strong>Agent detail / edit</strong><br>Tool checklist, quota, approval toggle, owning team, and lifecycle actions.</td>
    <td><strong>Overview (中文)</strong><br>Full zh-CN UI parity via <code>content/kelly-agent-builder-app/app/i18n/messages.js</code>.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-agent-builder-app install
pnpm --dir content/kelly-agent-builder-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add the demo query param to see mock data without a Busabase connection:

```text
/?demo=1&lang=en#/overview
/?demo=1&lang=en#/catalog
/?demo=1&lang=zh#/overview
```

Demo mode is fully offline and never reads or writes Busabase.

## Data

All state — the agent config catalog, onboarding marker, and agent lock —
lives in two Busabase Bases under one application Folder. See `SKILL.md` and
`references/agent-config-schema.md` for the full schema and governance rules
(draft → live gating, needs-attention rules, archive/pause semantics).

## Boundary

This console never provisions, deploys, or calls any real agent, model, or
external tool. It only proposes and records mock governance state in
Busabase.
