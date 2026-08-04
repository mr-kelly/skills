# Kelly DevOps Schema

Use this schema when reading or writing Kelly DevOps's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/devops-model.js`).
`days_left` for every expiry row, SSL certificate expiry rows, spend
`delta_pct`/`anomaly`/`share_pct`, and every metric are computed client-side
from the stored rows on every read — they are never stored, so the ledger is
always fresh regardless of when a browser session loads it relative to the
last check run.

Workflow statuses (actions): `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision verdicts: `approve`, `request_changes`, `block`, `note`.

Action types: `renew_domain`, `rotate_key`, `investigate_spend`, `restart_service`, `ack_incident`.

Expiry types: `domain`, `ssl_cert`, `api_key_rotation`, `plan_renewal`.

## Services (`kelly-devops-services-v1`)

Roster (name, product, url) and the latest HTTP/TLS check result share one
row per service — there is no separate config store.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `service-id` | `service_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `product` | `product` | text | |
| `url` | `url` | text | monitored endpoint |
| `status` | `status` | text | `up\|degraded\|down\|unknown` |
| `latency-ms` | `latency_ms` | number | latest check |
| `uptime-7d` | `uptime_7d` | number | computed from `history` by `scripts/check_services.mjs` |
| `ssl-issuer` | `ssl_issuer` | text | empty for plain-HTTP endpoints |
| `ssl-valid-to` | `ssl_valid_to` | text | ISO timestamp; empty if no TLS probe succeeded |
| `last-check-at` | `last_check_at` | text | ISO timestamp |
| `history` | `history` | longtext | JSON array of `{at, status, latency_ms, http_status}`, capped at 30 entries |
| `meta` | `meta` | longtext | JSON `{http_status, server, note}` |
| `warnings` | `warnings` | longtext | JSON array of short strings |

Status rules used by `check_services.mjs`: 2xx/3xx within the latency
threshold is `up`; a response slower than `thresholds.degraded_latency_ms`
or a 4xx is `degraded`; a 5xx or network/timeout failure is `down`.

An `ssl_cert` row is synthesized into the Expiries ledger (client-side, from
`ssl-issuer`/`ssl-valid-to`) whenever a service has a certificate — it is
never written into the Expiries Base directly.

## Expiries (`kelly-devops-expiries-v1`)

One ledger row per domain, API key rotation, or plan renewal. Roster fields
(registrar, auto-renew) and the live check result share the same row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `expiry-id` | `expiry_id` | text | stable domain id, required (`domain-<name>`, `key-<key_id>`, or a manual id for `plan_renewal`) |
| `type` | `type` | text | `domain\|api_key_rotation\|plan_renewal` (`ssl_cert` is derived, never stored here) |
| `item` | `item` | text | domain name, env var name, or plan label |
| `product` | `product` | text | |
| `expires-on` | `expires_on` | text | `YYYY-MM-DD`; for `api_key_rotation` this is the computed rotation due date |
| `auto-renew` | `auto_renew` | text | `"true"\|"false"` |
| `registrar` | `registrar` | text | domains only |
| `source` | `source` | text | `rdap\|config\|manual` |
| `detail` | `detail` | longtext | renewal guidance shown in the detail view |
| `updated-at` | `updated_at` | text | ISO timestamp, written by the check script |

`days_left` (UI severity: `< 7` critical/red, `< 30` warning/amber) is
`ceil((expires_on - now) / 1 day)`, computed client-side. Domain rows come
from `sync_domains.mjs` (RDAP), key-rotation rows from `check_services.mjs`
(computed due date), `plan_renewal` rows are entered manually (no automated
check exists for them). `action_id` linking an expiry to its action card is
computed client-side by matching `action.target.kind`/`target.id` against
the expiry's `type`/`item` — never stored on the expiry row itself.

## Spend Providers (`kelly-devops-spend-providers-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `provider-id` | `provider_id` | text | e.g. `gcp`, required |
| `name` | `name` | text | |
| `currency` | `currency` | text | |
| `mtd` | `mtd` | number | month-to-date spend |
| `last-month` | `last_month` | number | last month's total |
| `note` | `note` | longtext | optional short explanation |
| `updated-at` | `updated_at` | text | ISO timestamp |

`delta_pct`, `anomaly`, and the linked `action_id` are computed client-side:
`ingest_spend.mjs` flags (and proposes an `investigate_spend` action card
for) `anomaly: true` when `mtd > last_month * (1 + thresholds.spend_anomaly_pct / 100)`
and `last_month` is non-zero.

## Spend Products (`kelly-devops-spend-products-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | required |
| `product` | `product` | text | |
| `currency` | `currency` | text | |
| `mtd` | `mtd` | number | |
| `last-month` | `last_month` | number | |
| `updated-at` | `updated_at` | text | ISO timestamp |

`share_pct` (this product's percentage of total MTD spend across all
providers) is computed client-side.

## Actions (`kelly-devops-actions-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `action-id` | `action_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-fleet integer so chat can say "approve Action #2"; assigned once at creation, never renumbered |
| `type` | `type` | text | action type |
| `title` | `title` | text | |
| `status` | `status` | text | workflow status |
| `reason` | `reason` | longtext | why the agent proposed this |
| `evidence` | `evidence` | longtext | JSON array of short factual lines |
| `plan` | `plan` | longtext | JSON array of concrete ordered steps |
| `target` | `target` | longtext | JSON `{kind, id, registrar?, provider?, host?, service_id?}` |
| `note` | `note` | longtext | editable user note |
| `created-at` | `created_at` | text | ISO timestamp |
| `decision-verdict` | `decision_verdict` | text | `approve\|request_changes\|block` (unset for `note`) |
| `decision-note` | `decision_note` | longtext | written with the verdict |
| `decided-at` | `decided_at` | text | written with the verdict |

`done` is terminal: `scripts/execute_decisions.mjs --complete` is the only
process that sets it, only for a card already `approved`, only after the
agent reports the real external action succeeded.

## Events (`kelly-devops-events-v1`)

Append-only feed, newest-first, capped at 50 entries in the UI.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `event-id` | `event_id` | text | stable domain id, required |
| `at` | `at` | text | ISO timestamp |
| `severity` | `severity` | text | `info\|warning\|error` |
| `kind` | `kind` | text | `incident\|check\|expiry\|spend\|action` |
| `message` | `message` | longtext | short human-readable message |
| `service-id` | `service_id` | text | optional related service |

## Settings (`kelly-devops-settings-v1`)

One row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `expiry-warning-days` | `expiry_warning_days` | number | default 30 |
| `expiry-critical-days` | `expiry_critical_days` | number | default 7 |
| `degraded-latency-ms` | `degraded_latency_ms` | number | default 1500 |
| `spend-anomaly-pct` | `spend_anomaly_pct` | number | default 40 |

## Roster And Payload Files (trusted-script input, never committed)

The service/domain/key-rotation roster used to live in `config.local.json`;
in the Busabase-only shape the roster IS the Services/Expiries Bases
themselves. To register something new, pass a local JSON file to the
relevant script (never committed, never read by the browser):

```json
{
  "services": [{ "service_id": "formkit-web", "name": "FormKit Web App", "product": "FormKit", "url": "https://formkit.io" }],
  "domains": [{ "domain": "formkit.io", "product": "FormKit", "registrar": "Namecheap", "auto_renew": false }],
  "key_rotation": [{ "key_id": "relayapi-sendgrid", "name": "RelayAPI SendGrid key", "env": "RELAYAPI_SENDGRID_KEY", "product": "RelayAPI", "rotate_every_days": 90, "last_rotated_on": "2026-02-20" }],
  "thresholds": { "expiry_warning_days": 30, "expiry_critical_days": 7, "degraded_latency_ms": 1500, "spend_anomaly_pct": 40 }
}
```

`scripts/check_services.mjs` reads `services`/`key_rotation`/`thresholds`;
`scripts/sync_domains.mjs` reads `domains`. `scripts/ingest_spend.mjs` takes
a separate payload shape:

```json
{
  "currency": "USD",
  "providers": [{ "provider_id": "gcp", "name": "Google Cloud", "mtd": 812.4, "last_month": 501.42, "note": "optional" }],
  "products": [{ "product_id": "relayapi", "product": "RelayAPI", "mtd": 1244.48, "last_month": 987.87 }]
}
```
