# RBF Portfolio Health Dashboard

RBF Portfolio Health is a Busabase-backed App-in-Skill dashboard for a
revenue-based-financing (RBF) fund or private-credit book made up of many
small SME (small/medium enterprise) contracts. Each contract is a cash
advance repaid as a share of the SME's future revenue, up to a repayment
cap. The app aggregates a portfolio of such contracts into a health summary,
a repayment-progress view, a concentration breakdown, and a revenue-decline
watchlist — with one lightweight human action: flag a contract for review,
clear a flag, or leave a note, written directly to Busabase.

Generic and brand-free by design: the shipped dataset is a synthetic, seeded
mock book (no real company, fund, or SME names).

## What It Shows

- **Overview**: total AUM, total collected, weighted-average repayment
  progress, an at-risk contract count, a category allocation donut, and the
  contracts most behind on expected repayment pace.
- **Contracts**: sortable table (business, category, city, funding amount,
  actual progress, lag, status).
- **Concentration**: funding-amount concentration by industry/category and
  by city, so a fund can see if it is overexposed to one segment.
- **Watchlist**: contracts whose most recent month's revenue dropped
  materially below their trailing average, each with a revenue sparkline and
  a `Flag for review` / `Clear flag` action, written directly to Busabase.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Overview"></td>
    <td width="50%"><img src="assets/screenshots/concentration.webp" alt="Concentration"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Total AUM, total collected, weighted-average repayment progress, at-risk count, category allocation, and the contracts most behind on expected repayment pace.</td>
    <td><strong>Concentration</strong><br>Industry/category and city concentration by funding amount and contract count.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/watchlist.webp" alt="Watchlist"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Watchlist</strong><br>Contracts with a recent revenue decline, each with a sparkline and a flag-for-review action.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview-zh-CN.webp" alt="Overview (Chinese)"></td>
    <td width="50%"><img src="assets/screenshots/watchlist-zh-CN.webp" alt="Watchlist (Chinese)"></td>
  </tr>
  <tr>
    <td><strong>Overview (中文)</strong></td>
    <td><strong>Watchlist (中文)</strong></td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-portfolio-health/content/kelly-portfolio-health-app dev
```

Use the printed local URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=overview&lang=en#/overview
/?demo=concentration&lang=en#/concentration
/?demo=watchlist&lang=en#/watchlist
```

Add `lang=zh` for the Chinese UI chrome, e.g. `/?demo=1&lang=zh#/overview`.

Demo mode is fully offline (~52 contracts across 8 categories and 10
cities, ported verbatim from the retired `content/kelly-portfolio-health-app/server/dataset.ts`) and never
reads or writes Busabase; flag/note actions taken while `?demo=` is set only
update in-memory state in the browser tab.

## Busabase Data

The AirApp is Busabase-backed: contracts and settings both live in Busabase
Bases declared in `content/kelly-portfolio-health-app/app/js/config.js` (see
`references/portfolio-schema.md`). Resources provision lazily on first run.
There is no local file storage and no separate provider choice.
