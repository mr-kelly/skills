# Kelly Ads

Kelly Ads is a local App-in-Skill ad-campaign command desk (投放指挥台) for a cross-border e-commerce seller: it aggregates Amazon Ads, Meta (FB/IG), TikTok Ads, and Google Ads into one board, detects anomalies deterministically, and queues agent-proposed adjustment cards for human approval.

## What It Shows

- Overview: what needs your decision, KPI cards (spend MTD vs last month, blended ROAS, blended ACOS vs target, conversions), per-platform mini-cards, a 14-day spend-vs-revenue bar chart, worst offenders (spend without orders), data freshness, and sync activity.
- Campaigns: per-campaign spend, budget pacing, ROAS, ACOS vs target, and trend; detail pages add the daily series, the search-terms/audiences/creatives table, linked anomalies, and adjustment history.
- Alerts: the anomaly feed (ACOS breach, budget exhausted, zero-conversion spend, CPC spike, rejected) with one-line evidence and links to adjustment cards.
- Adjustments: agent-proposed cards (negative keyword, bid down/up, pause target, budget shift, creative refresh) with current → proposed value, evidence, expected impact, notes, and approve / request changes / block buttons.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Ads overview"></td>
    <td width="50%"><img src="assets/screenshots/campaigns.webp" alt="Kelly Ads campaigns"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Cross-platform ads board: blended ROAS/ACOS vs target, per-platform cards, spend vs revenue bars, and worst offenders.</td>
    <td><strong>Campaigns</strong><br>Campaign table with budget pace, spend, ROAS, and color-coded ACOS vs target across Amazon, Meta, TikTok, and Google.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/adjustments.webp" alt="Kelly Ads adjustment queue"></td>
    <td width="50%"><img src="assets/screenshots/alerts.webp" alt="Kelly Ads anomaly alerts"></td>
  </tr>
  <tr>
    <td><strong>Adjustment queue</strong><br>Agent-proposed bid, budget, and negative-keyword changes with evidence and expected impact, gated on approval.</td>
    <td><strong>Alerts</strong><br>Deterministic anomaly feed: ACOS breaches, budget burnouts, zero-conversion spend, CPC spikes, rejected ads.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-ads/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=campaigns&lang=en#/campaigns
/?demo=alerts&lang=en#/alerts
/?demo=adjustments&lang=en#/adjustments
/?demo=detail&lang=en#/campaigns/amz-sp-manual-lunchbox
```

`lang=zh` localizes UI chrome and the demo reasons/evidence/impact estimates for Chinese screenshots. Demo mode never reads platform data or files under `app/.data/`, and never persists decisions.

## Report Ingestion

`scripts/ingest_reports.mjs` is the single write path for performance data. The agent gathers the data (platform API pulls, report exports, or a CSV you paste) and runs one of:

```bash
node skills/kelly-ads/scripts/ingest_reports.mjs payload.json
node skills/kelly-ads/scripts/ingest_reports.mjs --csv report.csv --platform amazon
```

JSON payload shape (see the script header for the full example):

```json
{
  "platform": "amazon",
  "currency": "USD",
  "campaigns": [
    {
      "campaign_id": "amz-sp-auto-lunchbox",
      "name": "SP Auto — Silicone Bento Lunchbox",
      "status": "active",
      "daily_budget": 35,
      "daily": [ { "date": "2026-07-01", "spend": 28.4, "impressions": 1350, "clicks": 30, "conversions": 5, "revenue": 124.5 } ],
      "targets": [ { "target_id": "t1", "type": "search_term", "text": "kids bento box", "spend_14d": 96.4, "clicks": 74, "conversions": 14, "revenue": 348.6 } ]
    }
  ]
}
```

CSV mode maps columns via `config.csv_mappings.<platform>` (campaign, date, spend, impressions, clicks, conversions, revenue, currency); the built-in parser handles quoted fields with embedded commas. Non-base currencies are converted via `config.currency_rates`. Re-ingesting the same dates is idempotent.

## Checks And Adjustments

- `node skills/kelly-ads/scripts/run_checks.mjs` detects anomalies from config thresholds (`acos_breach_days`, `budget_exhausted_pct`, `zero_conversion_spend_floor`, `cpc_spike_pct`), upserts them with stable ids, auto-resolves cleared ones, and drafts skeleton adjustment cards for new critical anomalies.
- `node skills/kelly-ads/scripts/execute_decisions.mjs` turns approved adjustment cards into a dry-run `execution_report.json` (`add_negative_keyword`, `set_bid`, `pause_target`, `shift_budget`, `refresh_creative`), all marked `handoff_to_agent`; the agent executes them via platform APIs outside the app.
- `node skills/kelly-ads/scripts/validate_ui_schema.mjs` validates the snapshot; `node skills/kelly-ads/scripts/generate_demo_snapshot.mjs` writes a small example snapshot.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-ads/config.json`, list your platforms (display-safe account ids only), ACOS/ROAS targets, anomaly thresholds, and currency table, and keep tokens in local env files only (referenced by `*_env` names). Never commit ad-account credentials, report exports, or files under `app/.data/`.

## Boundary

Report ingestion is read-only and agent-driven — the app only renders local snapshot files and never touches any network beyond `127.0.0.1`. Every bid, budget, keyword, or creative mutation requires an approved adjustment card and is executed by the agent outside the app via the platform APIs.
