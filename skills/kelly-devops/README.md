# Kelly DevOps

Kelly DevOps is a Busabase App-in-Skill ops desk for a multi-product SaaS fleet: service uptime, SSL certificate expiry, domain renewals, API key rotation reminders, cloud spend anomalies, and a review queue of agent-proposed action cards. `scripts/check_services.mjs` probes service health and TLS certificates, `scripts/sync_domains.mjs` checks domain expiry via RDAP, `scripts/ingest_spend.mjs` writes cloud billing data, and `scripts/execute_decisions.mjs` prints the plan for approved action cards — the AirApp itself never probes a URL, checks WHOIS/RDAP, or touches a billing API.

## What It Shows

- Overview: what needs your decision, fleet summary (services, certs, domains, spend), recent events, and check freshness.
- Services: monitored endpoints with status, latency, 7-day uptime, and cert days-left; detail pages include a latency sparkline and certificate summary.
- Expiries: one ledger across domains, SSL certs, key rotations, and plan renewals with color-coded days-left and renewal guidance.
- Spend: per-provider month-to-date vs last month with anomaly flags, plus per-product allocation.
- Actions: agent-proposed action cards (renew domain, rotate key, investigate spend, restart service, ack incident) with evidence, a concrete plan, notes, and approve / request changes / block buttons.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly DevOps overview"></td>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly DevOps action queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Fleet health desk with service, certificate, domain, and spend summaries plus a recent events feed.</td>
    <td><strong>Action queue</strong><br>Agent-proposed renew/rotate/investigate action cards with evidence and approval controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/expiries.webp" alt="Kelly DevOps expiry ledger"></td>
    <td width="50%"><img src="assets/screenshots/services.webp" alt="Kelly DevOps services"></td>
  </tr>
  <tr>
    <td><strong>Expiry ledger</strong><br>Domains, SSL certificates, key rotations, and plan renewals in one table with color-coded days-left.</td>
    <td><strong>Services</strong><br>Monitored endpoints with uptime, latency sparklines, TLS certificate status, and check history.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/spend.webp" alt="Kelly DevOps spend"></td>
  </tr>
  <tr>
    <td><strong>Spend</strong><br>Cloud spend across AWS, Google Cloud, and Cloudflare with month-to-date totals and per-product allocation.</td>
  </tr>
</table>

## Demo Mode

Start the local preview and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-devops/app dev
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=services&lang=en#/services
/?demo=expiries&lang=en#/expiries
/?demo=spend&lang=en#/spend
/?demo=actions&lang=en#/actions
```

Demo mode never probes real endpoints, never reads or writes Busabase, and never persists decisions.

## Check Setup

- `node skills/kelly-devops/scripts/check_services.mjs [roster.json] --apply` probes configured endpoints (HTTP status + latency), reads TLS certificate expiry, and computes key-rotation due dates. Pass a roster JSON to register new services/key-rotation policies.
- `node skills/kelly-devops/scripts/sync_domains.mjs [roster.json] --apply` fetches domain expiry dates via public RDAP. Pass a roster JSON to register new domains.
- `node skills/kelly-devops/scripts/ingest_spend.mjs payload.json --apply` merges billing data the agent gathered and flags spend anomalies, proposing `investigate_spend` action cards.
- `node skills/kelly-devops/scripts/execute_decisions.mjs` prints the plan for every approved action card, with no external side effects and no Busabase writes.
- `node skills/kelly-devops/scripts/execute_decisions.mjs --complete <action_id> --note "..."` marks one action card `done` after the agent performs the real action outside the app.

All four scripts are dry runs by default (no `--apply` flag, or `execute_decisions.mjs` without `--complete`) so you can preview what would change before writing anything to Busabase.

## Boundary

Checks are read-only probes of your own endpoints, public RDAP, and billing exports the agent gathered — the AirApp itself only reads and writes Busabase records. Renewals, rotations, and restarts happen only after you approve the matching action card, and are executed by the agent outside the app with your own tools. See `references/ops-schema.md` for the full Busabase field schema.
