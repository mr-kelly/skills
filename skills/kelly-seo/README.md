# Kelly SEO

Kelly SEO is a local App-in-Skill dashboard over Google Search Console search analytics, plus an agent-prepared SEO opportunities review queue.

## What It Shows

- Overview: per-site KPI cards with 28d vs previous 28d deltas, a daily clicks/impressions trend, top movers, site freshness, and what needs review.
- Queries: top queries with clicks, impressions, CTR, position, deltas, and opportunity badges; per-query detail with trend and top pages.
- Pages: top pages with the same metrics plus indexing/canonical warnings; per-page detail with trend and top queries.
- Opportunities: agent-proposed SEO actions (title/meta rewrites, internal links, content briefs, page fixes) with editable drafts and approve / request changes / block decisions.
- Sites: configured properties with verification type, last sync, and 28d totals.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-seo/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=queries&lang=en#/queries
/?demo=pages&lang=en#/pages
/?demo=opportunities&lang=en#/opportunities
/?demo=detail&lang=en#/queries/q-featherlog-app-release-notes-vs-changelog
```

Demo mode never reads live GSC data or files under `app/.data/`.

## GSC Auth Setup

Both methods use the read-only scope `https://www.googleapis.com/auth/webmasters.readonly`.

Service account (recommended):

1. In Google Cloud, create a service account and download its JSON key file.
2. In Search Console, open each property → Settings → Users and permissions → Add user, and add the service account's email address (read access is enough).
3. In a local env file (for example `skills/kelly-seo/.env.local`), set `KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE=/absolute/path/to/key.json`.

Plain access token (quick manual runs):

1. Obtain a short-lived OAuth access token with the read-only webmasters scope (for example via `gcloud auth print-access-token` on an authorized account, or the OAuth playground).
2. Set `KELLY_SEO_GSC_ACCESS_TOKEN=<token>` and run `node skills/kelly-seo/scripts/sync_gsc.mjs`.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-seo/config.json` and list your site properties. Secrets live only in local env files referenced by name (`KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE`, `KELLY_SEO_GSC_ACCESS_TOKEN`). Never commit keys, tokens, or files under `app/.data/`.

## Boundary

GSC access is read-only. The app itself never calls the GSC API or edits site content; approved opportunities are executed by the agent outside the app (in the site's repo/CMS) and reported back to `app/.data/execution_report.json`.
