# Kelly Invoice Sheet Batch Schema

Use this schema when reading or writing Kelly Invoice Sheet's Busabase
Bases, and before writing a batch JSON file for `scripts/import_batch.mjs`.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-invoice-sheet-app/app/js/providers/busabase-provider.js`,
`content/kelly-invoice-sheet-app/app/js/invoice-model.js`).

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise` (a `revise`
decision moves a `done` row back to `needs_review`; any other status is left
unchanged, so an edit-only save on a row still under review does not change
its status).

## Invoices (`kelly-invoice-sheet-invoices`)

One row per extracted invoice/receipt/credit note/statement.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `invoice-id` | `id` | text | stable domain id, e.g. `inv-001`, required |
| `ref` | `ref` | text | stable display reference, e.g. `Review #1` |
| `batch-id` | `batch_id` | text | id of the `scripts/import_batch.mjs` run that wrote this row |
| `title` | `title` | text | |
| `status` | `status` | text | workflow status |
| `category` | `category` | text | `vendor_invoice\|receipt\|credit_note\|statement\|other` |
| `source-file` | `source_file` | text | display filename |
| `source-path` | `source_path` | text | local source path (never uploaded) |
| `source-type` | `source_type` | text | `pdf\|image\|doc\|xls` |
| `source-page` | `source_page` | number | |
| `vendor-name` | `vendor_name` | text | required |
| `vendor-tax-id` | `vendor_tax_id` | text | |
| `invoice-number` | `invoice_number` | text | required |
| `invoice-date` | `invoice_date` | text | ISO date when possible, required |
| `due-date` | `due_date` | text | |
| `currency` | `currency` | text | ISO code where possible, required |
| `subtotal` | `subtotal` | number | |
| `tax` | `tax` | number | |
| `total` | `total` | number | required |
| `amount-due` | `amount_due` | number | |
| `payment-terms` | `payment_terms` | text | |
| `bill-to` | `bill_to` | text | |
| `purchase-order` | `purchase_order` | text | |
| `iban-or-account-hint` | `iban_or_account_hint` | text | |
| `confidence` | `confidence` | number | 0-1, required |
| `field-confidence` | `field_confidence` | longtext | JSON object keyed by field name: `{value?, confidence?, source_text?}` |
| `risk` | `risk` | longtext | JSON array of strings |
| `warnings` | `warnings` | longtext | JSON array of strings |
| `notes` | `notes` | longtext | reviewer/agent note |
| `line-items` | `line_items` | longtext | JSON array, see below |
| `proposed-action` | `proposed_action` | text | |
| `reason` | `reason` | longtext | |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|block\|revise`, set by a human decision |
| `decision-note` | `decision_note` | longtext | reviewer comment |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp, set by `scripts/import_batch.mjs` |

### Line item shape (inside the `line-items` JSON array)

| Key | Type | Notes |
| --- | --- | --- |
| `line_id` | string | stable within the invoice |
| `description` | string | |
| `quantity` | number | |
| `unit_price` | number | |
| `amount` | number | |
| `tax_rate` | number | |
| `category` | string | |
| `confidence` | number | 0-1 |
| `notes` | string | |

Line items are useful for accounting import and audit, but a missing line
item is a warning, not a hard validation failure.

## Settings (`kelly-invoice-sheet-settings`)

Sanitized config summary, one row keyed by `kind` (currently only `config`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | stable domain id, required |
| `kind` | `kind` | text | required, e.g. `config` |
| `payload` | `payload` | longtext | JSON object: `{default_currency, extraction: {preferred_ocr, low_confidence_threshold}, review_policy: {auto_approve_min_confidence, block_missing_fields[]}, export: {directory, include_line_items}}` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Batch File Shape (input to `scripts/import_batch.mjs`)

```json
{
  "batch_id": "invoice-YYYYMMDD-HHMMSS",
  "invoices": [
    {
      "id": "inv-001",
      "ref": "Review #1",
      "title": "human-readable title",
      "status": "needs_review",
      "category": "vendor_invoice",
      "source_file": "source/path.pdf",
      "vendor_name": "...",
      "invoice_number": "...",
      "invoice_date": "2026-06-30",
      "currency": "USD",
      "total": 1360.8,
      "confidence": 0.94,
      "risk": [],
      "warnings": [],
      "line_items": []
    }
  ]
}
```

A bare JSON array of invoice objects (no `batch_id`/`invoices` wrapper) is
also accepted. `node scripts/import_batch.mjs --file <path>` validates the
batch with `validateInvoicesShape()` (ported verbatim from the retired
`lib/invoice-schema.ts`'s `validateBatchShape()`) before printing a dry run;
add `--apply` to write to Busabase.

## Extraction Guidance

- Preserve source values. Do not invent missing invoice numbers, tax ids, dates, vendors, payment terms, or totals.
- Keep totals numeric and use the source currency. Do not silently convert currencies.
- Put uncertain or ambiguous values into `warnings`, and record confidence under `field_confidence`.
- Mark rows `blocked` when core fields are missing or reconciliation cannot proceed.
- Use `needs_review` for normal human review and `approved` only when the user has approved or an explicit review policy makes it safe.
- Keep file paths local. Do not upload or send invoice files from the app.
