# Kelly Family Office

Kelly Family Office is a Busabase Cloud App-in-Skill dashboard that consolidates the holdings of multiple entities and members — an individual, a family trust, an offshore company, and more — into one read-only consolidated investment view. Data comes from CSV import (through a trusted skill-root script); there is no live brokerage API in v1.

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

Run the app locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-family-office/app dev
```

Then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=entities&lang=en#/entities
/?demo=assets&lang=en#/assets
/?demo=institutions&lang=en#/institutions
/?demo=performance&lang=en#/performance
/?demo=detail&lang=en#/entities/family-trust
```

Demo mode never reads or writes Busabase.

## Busabase Resources

Four Bases under one application Folder (`kelly-family-office`): `entities`, `accounts`, `holdings`, and `settings`. The AirApp is read-only — it only reads these Bases. See `SKILL.md` and `references/portfolio-schema.md` for exact field shapes.

## CSV Import

Fill in `references/holdings-csv-template.csv` (or a copy) and run the trusted importer:

```bash
BUSABASE_BASE_URL=... BUSABASE_API_KEY=... BUSABASE_SPACE_ID=... \
  node scripts/import_csv.mjs path/to/holdings.csv --apply
```

It resolves entity/account references against Busabase (creating a new entity or account record on the fly if the CSV names one that doesn't exist yet) and writes `holdings` rows via Busabase ChangeRequests. Without `--apply` it is a dry run.
