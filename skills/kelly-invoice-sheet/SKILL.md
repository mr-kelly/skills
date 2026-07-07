---
name: kelly-invoice-sheet
description: Extract invoices, receipts, credit notes, statements, PDFs, images, docs, and spreadsheet-like invoice exports into a local reviewable table with field confidence, line items, approval decisions, and CSV/JSON export. Use when the user invokes /kelly-invoice-sheet or $kelly-invoice-sheet, asks for "Invoice转表格", invoice OCR, receipt-to-spreadsheet, invoice data extraction, bookkeeping import prep, or a Lido-style Extract Data workflow with a local App-in-Skill UI.
---

# Kelly Invoice Sheet

## Overview

Use this skill to turn invoice files or extracted invoice text into a structured batch that the user can review in a local spreadsheet-style UI. The skill owns extraction, reasoning, validation, and export; the app only reads/writes local handoff files and records human decisions.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, prepare or load a batch, start/reuse the local app with `app/start.sh`, and give the actual local URL.

## App UI Screenshots

<table>
  <tr>
    <td width="33%"><img src="assets/screenshots/overview.png" alt="Kelly Invoice Sheet spreadsheet extraction desk"></td>
    <td width="33%"><img src="assets/screenshots/detail.png" alt="Kelly Invoice Sheet invoice detail review"></td>
    <td width="33%"><img src="assets/screenshots/extract-data.png" alt="Kelly Invoice Sheet Extract Data upload modal"></td>
  </tr>
  <tr>
    <td><strong>Spreadsheet extraction desk</strong><br>Sheet-like invoice table with extracted rows, status filters, confidence flags, and human-attention counts.</td>
    <td><strong>Invoice detail review</strong><br>Editable invoice fields, line items, confidence notes, and approve/request-changes/block controls.</td>
    <td><strong>Extract Data upload</strong><br>Lido-style upload modal with local file, Google Drive, OneDrive, and email source options.</td>
  </tr>
</table>

## Workflow

1. Accept invoice source files or source text from the user. Supported workflow inputs include PDFs, images, Word docs, CSV/XLS/XLSX exports, OCR text, email attachments, and pasted invoice text.
2. Extract invoice header fields, line items, totals, currency, dates, vendor identity, bill-to, payment terms, and source snippets. If OCR or document parsing needs another installed skill or tool, use it, then normalize the result into this skill's batch schema.
3. Read `references/invoice-batch-schema.md` before writing `app/.data/current_batch.json`.
4. Write a batch to `app/.data/current_batch.json`, keeping stable `id` and `ref` values such as `Review #1`.
5. Run `node scripts/validate_ui_schema.ts app/.data/current_batch.json`.
6. Launch or reuse the local app with `app/start.sh`, then send the user to the printed URL.
7. After the user approves or edits rows, run `node scripts/export_decisions.ts` to export approved invoices to CSV and JSON.

Use chat-only mode only when the user says "chat only", "no UI", "纯聊天", "不要打开 UI", or similar.

## App Contract

Local handoff files:

- `app/.data/current_batch.json`: current invoice extraction batch.
- `app/.data/decisions.json`: human review decisions, edits, and notes.
- `app/.data/agent_tasks.json`: queued revision tasks from `request_changes` or `@ai` comments.
- `app/.data/execution_report.json`: latest export report.
- `app/.data/agent.lock`: temporary lock while the skill writes batch/report files.

Workflow statuses:

- `needs_review`: extracted row needs human review.
- `changes_requested`: user asked the agent to revise extraction.
- `approved`: row is ready for export.
- `done`: row has been exported or intentionally completed.
- `blocked`: row cannot proceed without missing information or source correction.

## Extraction Rules

- Preserve source values. Do not invent invoice numbers, dates, tax ids, vendors, totals, or payment instructions.
- Keep original currency. Do not convert currencies unless the user explicitly asks and provides rates.
- Treat money fields as high-risk: totals, tax, amount due, currency, and bank/payment hints should be reviewed when confidence is low.
- Use `field_confidence` and `warnings` for ambiguous OCR, cropped images, handwritten values, missing references, negative totals, credit notes, duplicate invoice numbers, or total/line-item mismatches.
- Mark rows `blocked` if required fields are missing: vendor name, invoice number, invoice date, currency, or total.
- Never send invoice files to external services from the app. Any external OCR/API use belongs to the skill workflow and should be explicit.

## Scripts

- `node scripts/generate_demo_batch.ts`
  Writes a safe synthetic batch and onboarding marker for UI testing.
- `node scripts/validate_ui_schema.ts [batch-path]`
  Validates the invoice batch schema.
- `node scripts/export_decisions.ts`
  Exports approved or human-revised invoices to `exports/<batch-id>/invoices.csv`, `line_items.csv`, and `approved_invoices.json`, then writes `execution_report.json`.

## Local App

Start the UI:

```bash
skills/kelly-invoice-sheet/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, prefers ports `3000-4000`, and stores private runtime state under ignored `app/.data/`.

## Safety Defaults

- Treat invoice data as sensitive. Do not commit `app/.data/`, source invoices, exports, `config.local.json`, or env files.
- The app only edits local decision files. It does not upload invoices, import into accounting systems, send email, pay vendors, or mutate remote systems.
- Export only after explicit approval in the UI or chat.
