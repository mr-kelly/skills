# Kelly DevOps

Kelly DevOps is a local App-in-Skill ops desk for a multi-product SaaS fleet: service uptime, SSL certificate expiry, domain renewals, API key rotation reminders, cloud spend anomalies, and a review queue of agent-proposed action cards.

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
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-devops/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=services&lang=en#/services
/?demo=expiries&lang=en#/expiries
/?demo=spend&lang=en#/spend
/?demo=actions&lang=en#/actions
```

Demo mode never probes real endpoints, never reads files under `app/.data/`, and never persists decisions.

## Check Setup

- `node skills/kelly-devops/scripts/check_services.ts` probes configured endpoints (HTTP status + latency) and reads TLS certificate expiry.
- `node skills/kelly-devops/scripts/sync_domains.ts` fetches domain expiry dates via public RDAP.
- `node skills/kelly-devops/scripts/ingest_spend.ts payload.json` merges billing data the agent gathered and flags spend anomalies.
- `node skills/kelly-devops/scripts/execute_decisions.ts` turns approved action cards into a dry-run execution report; the agent executes approved operations outside the app.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-devops/config.json`, list your products, endpoints, domains, key-rotation policies, and billing sources, and keep secrets in local env files only (referenced by `*_env` names). Never commit registrar or cloud credentials, or files under `app/.data/`.

## Boundary

Checks are read-only probes of your own endpoints and public RDAP. The app itself only renders local snapshot files. Renewals, rotations, and restarts happen only after you approve the matching action card, and are executed by the agent outside the app.
