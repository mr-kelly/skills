# Kelly DevOps

Kelly DevOps is a local App-in-Skill ops desk for a multi-product SaaS fleet: service uptime, SSL certificate expiry, domain renewals, API key rotation reminders, cloud spend anomalies, and a review queue of agent-proposed action cards.

## What It Shows

- Overview: what needs your decision, fleet summary (services, certs, domains, spend), recent events, and check freshness.
- Services: monitored endpoints with status, latency, 7-day uptime, and cert days-left; detail pages include a latency sparkline and certificate summary.
- Expiries: one ledger across domains, SSL certs, key rotations, and plan renewals with color-coded days-left and renewal guidance.
- Spend: per-provider month-to-date vs last month with anomaly flags, plus per-product allocation.
- Actions: agent-proposed action cards (renew domain, rotate key, investigate spend, restart service, ack incident) with evidence, a concrete plan, notes, and approve / request changes / block buttons.

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

- `node skills/kelly-devops/scripts/check_services.mjs` probes configured endpoints (HTTP status + latency) and reads TLS certificate expiry.
- `node skills/kelly-devops/scripts/sync_domains.mjs` fetches domain expiry dates via public RDAP.
- `node skills/kelly-devops/scripts/ingest_spend.mjs payload.json` merges billing data the agent gathered and flags spend anomalies.
- `node skills/kelly-devops/scripts/execute_decisions.mjs` turns approved action cards into a dry-run execution report; the agent executes approved operations outside the app.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-devops/config.json`, list your products, endpoints, domains, key-rotation policies, and billing sources, and keep secrets in local env files only (referenced by `*_env` names). Never commit registrar or cloud credentials, or files under `app/.data/`.

## Boundary

Checks are read-only probes of your own endpoints and public RDAP. The app itself only renders local snapshot files. Renewals, rotations, and restarts happen only after you approve the matching action card, and are executed by the agent outside the app.
