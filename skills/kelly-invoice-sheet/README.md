# Kelly Invoice Sheet

Kelly Invoice Sheet turns invoices, receipts, credit notes, and statements into a reviewable table backed by Busabase. It is inspired by Lido's spreadsheet-first "Extract Data" flow: upload or hand off files, inspect extracted fields in a sheet-like workspace, fix low-confidence cells, approve rows, then export clean CSV/JSON for bookkeeping or audit.

## What It Does

- Converts invoice sources into a structured `invoices` Base row with embedded line items.
- Tracks confidence, source warnings, ambiguous OCR, missing fields, and money risks.
- Gives the human a spreadsheet-style review UI before anything is exported.
- Exports approved rows to `invoices.csv`, `line_items.csv`, and `approved_invoices.json`, then marks them `done`.

## App UI Screenshots

<table>
  <tr>
    <td width="33%"><img src="assets/screenshots/overview.webp" alt="Kelly Invoice Sheet spreadsheet extraction desk"></td>
    <td width="33%"><img src="assets/screenshots/detail.webp" alt="Kelly Invoice Sheet invoice detail review"></td>
    <td width="33%"><img src="assets/screenshots/extract-data.webp" alt="Kelly Invoice Sheet Extract Data upload modal"></td>
  </tr>
  <tr>
    <td><strong>Spreadsheet extraction desk</strong><br>Sheet-like invoice table with extracted rows, status filters, confidence flags, and human-attention counts.</td>
    <td><strong>Invoice detail review</strong><br>Editable invoice fields, line items, confidence notes, and approve/request-changes/block controls.</td>
    <td><strong>Extract Data upload</strong><br>Lido-style upload modal with local file, Google Drive, OneDrive, and email source options.</td>
  </tr>
  <tr>
    <td width="33%"><img src="assets/screenshots/overview-mobile.webp" alt="Kelly Invoice Sheet mobile shell"></td>
  </tr>
  <tr>
    <td><strong>Mobile shell</strong><br>390px responsive layout for the invoice review table on a phone.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-invoice-sheet/content/kelly-invoice-sheet-app dev
```

Then open the printed URL with `/?demo=1#/invoices/all`. Demo mode never reads or writes Busabase; demo decisions are read-only.

## Real Workflow

1. Ask the agent to extract invoice files into `/kelly-invoice-sheet`.
2. The agent writes a batch JSON file using `references/invoice-batch-schema.md`, then runs:

   ```bash
   node scripts/import_batch.mjs --file batch.json --apply
   ```

3. The app displays the batch for review and writes approve/request-changes/block/revise decisions straight onto each invoice's Busabase record.
4. Run:

   ```bash
   node scripts/export_decisions.mjs --apply
   ```

Approved rows are exported under `exports/<batch-id>/` and marked `done`.

## Busabase Resources

Two Bases under one application Folder (`kelly-invoice-sheet`):

- `invoices`: one row per extracted invoice/receipt/credit note/statement, including embedded line items (JSON) and the reviewer's decision.
- `settings`: sanitized config summary (default currency, extraction preferences, review policy, export preferences).

See `references/invoice-batch-schema.md` for the exact Busabase field contract, and `SKILL.md` for the full workflow.

## Safety

The app never uploads invoice files, pays invoices, emails vendors, or writes to accounting software. Those actions require separate connectors and explicit approval.
