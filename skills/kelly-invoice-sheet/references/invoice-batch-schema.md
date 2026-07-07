# Kelly Invoice Sheet Batch Schema

Use this reference before writing `app/.data/current_batch.json` or changing the app, scripts, or validator.

## Handoff Files

- `app/.data/current_batch.json`: agent/OCR-generated invoice extraction batch.
- `app/.data/decisions.json`: human review decisions, field edits, and notes.
- `app/.data/agent_tasks.json`: invoice rows where the human requested revision or mentioned `@ai`.
- `app/.data/execution_report.json`: export result written by `scripts/export_decisions.ts`.
- `app/.data/agent.lock`: temporary lock while the agent writes batch/report files.

## Batch Shape

```json
{
  "schema_version": "1",
  "batch_id": "invoice-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-invoice-sheet",
  "mode": "app-in-skill",
  "extractor": {
    "name": "agent|ocr-engine|manual",
    "model": "optional model/provider",
    "notes": "optional extraction note"
  },
  "input_files": [
    {
      "path": "local/source/path.pdf",
      "name": "source/path.pdf",
      "type": "pdf|image|doc|xls",
      "pages": 1
    }
  ],
  "metrics": {},
  "invoices": []
}
```

Run `node scripts/validate_ui_schema.ts app/.data/current_batch.json` after writing or editing a batch. The validator recomputes and checks required fields.

## Invoice Fields

Required invoice fields:

- `id`: stable local id, e.g. `inv-001`.
- `ref`: stable visible row reference, e.g. `Review #1`.
- `title`: human-readable title.
- `status`: `needs_review`, `changes_requested`, `approved`, `done`, or `blocked`.
- `category`: `vendor_invoice`, `receipt`, `credit_note`, `statement`, or `other`.
- `source_file`: display filename.
- `vendor_name`
- `invoice_number`
- `invoice_date`: ISO date when possible.
- `currency`: ISO code where possible.
- `total`: number.
- `confidence`: 0 to 1.
- `risk`: string array.
- `warnings`: string array.
- `line_items`: array.

Recommended optional fields:

- `vendor_tax_id`
- `due_date`
- `subtotal`
- `tax`
- `amount_due`
- `payment_terms`
- `bill_to`
- `purchase_order`
- `iban_or_account_hint`
- `source_path`
- `source_type`
- `source_page`
- `field_confidence`: per-field confidence/source snippets.
- `proposed_action`
- `reason`
- `notes`

## Line Item Fields

Each line item should include:

- `line_id`
- `description`
- `quantity`
- `unit_price`
- `amount`
- `tax_rate`
- `category`
- `confidence`
- `notes`

Line items are useful for accounting import and audit, but a missing line item is a warning, not a hard validation failure.

## Extraction Guidance

- Preserve source values. Do not invent missing invoice numbers, tax ids, dates, vendors, payment terms, or totals.
- Keep totals numeric and use the source currency. Do not silently convert currencies.
- Put uncertain or ambiguous values into `warnings`, and record confidence under `field_confidence`.
- Mark rows `blocked` when core fields are missing or reconciliation cannot proceed.
- Use `needs_review` for normal human review and `approved` only when the user has approved or an explicit review policy makes it safe.
- Keep file paths local. Do not upload or send invoice files from the app.
