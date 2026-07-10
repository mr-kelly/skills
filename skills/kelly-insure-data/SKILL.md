---
name: kelly-insure-data
description: Insurance-industry App-in-Skill for high-quality data entry and governance, backed by a Busabase REST provider and operator scripts. Use when the user invokes $kelly-insure-data or /kelly-insure-data, wants an insurance data workspace with UI, needs to govern insurance files, metadata, QA pairs, or news records, restore a Busabase insurance workspace from local PDFs, or wants Busabase Drive/Base data surfaced for data quality review, metadata completeness, canonical insurance knowledge entry, and ongoing data governance.
---

# Kelly Insure Data

## Overview

Use this skill as Kelly's insurance data-entry and data-governance cockpit. It pairs a local App-in-Skill UI with a Busabase-backed data layer: one Busabase Drive node for the file drive, one Base for insurance QA pairs, and one Base for insurance news and market-intelligence records.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, start or reuse the local app with `app/start.sh` and give the actual URL. The first screen is the usable workspace, not a landing page.

## Purpose

This skill is for insurance-industry high-quality data entry and governance:

- govern files by metadata completeness and source hygiene;
- inspect the Busabase Drive node named by `config.busabase.drive_node_id` or `drive_node_slug`;
- inspect QA pairs from the Busabase Base named by `qa_base_id` or `qa_base_slug`;
- inspect insurance news records from the Busabase Base named by `news_base_id` or `news_base_slug`;
- surface missing fields, draft/review statuses, source gaps, and quality warnings before data becomes trusted insurance knowledge.

The UI has four primary routes:

- `#/overview`: counts, quality score, and records needing governance.
- `#/files`: "文件盘", corresponding to one Busabase Drive node, showing files and metadata fields.
- `#/qa`: "问答", corresponding to one Busabase Base of QA pairs.
- `#/news`: "新闻资讯", corresponding to one Busabase Base of news records.

## Boundary

- The app reads local handoff files or Busabase through the data-provider layer; it does not perform destructive remote actions.
- The skill may normalize, validate, and write local snapshots for review.
- Busabase mode is read-first. Record creation/updates should be proposed as Busabase change requests only after the user asks for data entry or cleanup actions.
- Never expose API keys, tokens, raw private config contents, cookies, or secret values in UI state, logs, screenshots, or chat.
- Treat insurance data quality as high-stakes: preserve source attribution, dates, jurisdiction, carrier/product names, and original wording where possible.

## Busabase Setup

Install dependencies in the skill folder before first use:

```bash
cd skills/kelly-insure-data
npm install
```

Configure `config.local.json` or `~/.config/kelly-insure-data/config.json`:

```json
{
  "data_provider": "busabase",
  "busabase": {
    "base_url": "http://127.0.0.1:15419",
    "space_id": "",
    "api_key_env": "KELLY_INSURE_DATA_BUSABASE_API_KEY",
    "drive_node_id": "drv_or_node_id",
    "qa_base_id": "bse_qa",
    "news_base_id": "bse_news",
    "record_limit": 200
  }
}
```

Environment overrides:

- `KELLY_INSURE_DATA_PROVIDER=local|busabase`
- `KELLY_INSURE_DATA_BUSABASE_URL`
- `KELLY_INSURE_DATA_BUSABASE_SPACE_ID`
- `KELLY_INSURE_DATA_BUSABASE_API_KEY`
- `KELLY_INSURE_DATA_BUSABASE_DRIVE_NODE_ID`
- `KELLY_INSURE_DATA_BUSABASE_QA_BASE_ID`
- `KELLY_INSURE_DATA_BUSABASE_NEWS_BASE_ID`
- `KELLY_INSURE_DATA_BUSABASE_RECORD_LIMIT`

Use `busabase-cli` for setup checks when useful. Runtime reads and operator scripts use the shared REST Busabase client in `lib/data-provider/busabase-client.ts`.

```bash
npx busabase-cli health --base-url http://127.0.0.1:15419
npx busabase-cli nodes list --base-url http://127.0.0.1:15419 --output json
npx busabase-cli records list --base-id bse_qa --limit 20 --output json
```

## File Contract

Read `references/insure-data-schema.md` before editing the app, scripts, or generated snapshot shape.

Primary local files:

- `app/.data/insure_snapshot.json`: local normalized snapshot for demo/local mode.
- `app/.data/onboarding.json`: onboarding marker.
- `app/.data/agent.lock`: temporary lock while the agent is importing or regenerating data.
- `config.local.json`: private Busabase/operator config, ignored by git.

The app follows the App-in-Skill provider boundary: all `/api/state`, config summary, onboarding, lock, and agent-task reads go through `lib/data-provider/`. The UI remains a local read-first operator surface; Busabase mutations happen only through explicit skill/operator scripts or user-requested change requests.

## Normal Workflow

1. Load config via `lib/config.ts`.
2. If provider is `busabase`, read through the skill's REST BusabaseProvider: Drive files, QA Base records, and News Base records. Use `busabase-cli` for operator diagnostics, not as the primary runtime API.
3. Normalize into the UI schema: `files`, `qa_pairs`, `news_items`, `metrics`, and governance blocks with `completeness_pct` and `missing_fields`.
4. Start/reuse the UI with `app/start.sh`.
5. For data-entry requests, draft proposed new records or metadata cleanup as reviewable changes first. Do not silently mutate Busabase canonical records.
6. Validate local snapshots with `scripts/validate_ui_schema.ts`.

## Backup / Restore Workflow

Read `references/restore-manifest-schema.md` before changing backup or restore behavior.

Use `npm run busabase:export -- --output app/.data/busabase_restore_manifest.json` to export a portable manifest for the active Kelly Insure Data Busabase folder. The manifest captures the folder/Drive/Base shape, Drive file paths, asset metadata, Base schemas, and QA/news record fields. It does not embed PDF bytes.

Use `npm run busabase:restore -- --manifest app/.data/busabase_restore_manifest.json --files-root /path/to/local/pdf-backup --dry-run` to preview restoration after a Busabase reset. Add `--apply` only when the user explicitly asks to recreate missing folder, Drive files, Bases, and records.

## PDF Metadata Backfill

Use `npm run busabase:backfill-pdf-metadata -- --drive-node-id <node-id> --files-root /path/to/local/pdf-backup --limit 5` to parse local PDFs and preview generated asset metadata.

Add `--apply` only when the user asks to write metadata back to Busabase assets. The parser is heuristic and should mark generated records as `needs_review`, preserving source file path, asset id, parser method, and extraction summary.

## Validation

Use these before handing off meaningful changes:

```bash
node scripts/generate_demo_snapshot.ts
node scripts/validate_ui_schema.ts
node --check app/app.js
npm run start
```

For UI changes, verify desktop and phone widths. On mobile, the sidebar drawer must open/close, selecting a row opens detail, back returns to list, and there must be no horizontal overflow.
