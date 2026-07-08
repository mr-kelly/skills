# Kelly Family Office

Kelly Family Office is a local App-in-Skill dashboard that consolidates the holdings of multiple entities and members — an individual, a family trust, an offshore company, and more — into one read-only consolidated investment view. Data comes from CSV import and manual entry (no live brokerage API in v1).

## What It Shows

- Overview: total AUM (base currency), unrealized P/L, entity count, and a headline asset allocation.
- Entities: sidebar of entities/members; drill into an entity's accounts, holdings, and subtotal.
- Asset Class: allocation donut and bars with weights (pure CSS/SVG, no libraries).
- Institutions: consolidated by custodian/institution.
- Performance: cost vs market value and unrealized P/L (absolute and %), per entity and total.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Family Office overview"></td>
    <td width="50%"><img src="assets/screenshots/entities.webp" alt="Kelly Family Office by entity"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Consolidated command desk with total AUM in the base currency, unrealized P/L, entity and account counts, and headline allocation.</td>
    <td><strong>By entity / member</strong><br>Each family entity (individual, trust, company) with its consolidated AUM, portfolio weight, and unrealized P/L.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/assets.webp" alt="Kelly Family Office by asset class"></td>
    <td width="50%"><img src="assets/screenshots/institutions.webp" alt="Kelly Family Office by institution"></td>
  </tr>
  <tr>
    <td><strong>By asset class</strong><br>Allocation across equity, bond, cash, crypto, real estate, private equity, and alternatives, with a donut, weighted bars, and a value table.</td>
    <td><strong>By account / institution</strong><br>Consolidation by custodian and institution to see where assets are held and concentration across banks and brokers.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/performance.webp" alt="Kelly Family Office performance"></td>
  </tr>
  <tr>
    <td><strong>Performance</strong><br>Cost basis versus market value and unrealized P/L, per entity and for the whole family office, in the base currency.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-family-office/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=entities&lang=en#/entities
/?demo=assets&lang=en#/assets
/?demo=institutions&lang=en#/institutions
/?demo=performance&lang=en#/performance
/?demo=detail&lang=en#/entities/family-trust
```

Demo mode never reads live brokerage/custody data or local private holdings files.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-family-office/config.json`. Set your `base_currency`, `fx_rates`, `entities`, and `institutions`. Never commit real holdings exports or files under `app/.data/`.

## CSV Import

Fill in `references/holdings-csv-template.csv` (or a copy) and run:

```bash
node scripts/import_csv.ts path/to/holdings.csv
```

It normalizes rows into `app/.data/snapshot.json`, converting each holding to the base currency via config `fx_rates`.
