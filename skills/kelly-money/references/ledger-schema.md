# Kelly Money Ledger Schema

Use this schema for `app/.data/ledger_snapshot.json`. Keep the shape stable so the local app, scripts, and future connectors can evolve independently.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-money",
  "base_currency": "USD",
  "range": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "metrics": {
    "account_count": 0,
    "transaction_count": 0,
    "gross_inflow": 0,
    "gross_outflow": 0,
    "fees": 0,
    "net": 0
  },
  "accounts": [],
  "transactions": [],
  "invoices": [],
  "invoice_matches": [],
  "warnings": []
}
```

## Account

```json
{
  "account_id": "stable local id",
  "provider": "mercury|stripe|airwallex|creem|manual",
  "display_name": "Mercury Main",
  "entity": "Company or owner",
  "currency": "USD",
  "status": "ok|warning|error|not_configured",
  "balance": {
    "available": 0,
    "pending": 0,
    "current": 0,
    "as_of": "ISO timestamp"
  },
  "totals": {
    "gross_inflow": 0,
    "gross_outflow": 0,
    "fees": 0,
    "net": 0
  },
  "last_sync_at": "ISO timestamp",
  "provider_account_id": "safe provider id",
  "notes": "optional"
}
```

## Transaction

```json
{
  "transaction_id": "stable local id",
  "provider": "mercury|stripe|airwallex|creem|manual",
  "account_id": "stable local account id",
  "provider_account_id": "safe provider id",
  "provider_transaction_id": "provider id",
  "occurred_at": "ISO timestamp",
  "available_at": "ISO timestamp or null",
  "description": "human-readable description",
  "counterparty": "optional name",
  "type": "payment|payout|fee|refund|transfer|charge|adjustment|conversion|interest|other",
  "status": "posted|pending|failed|canceled",
  "currency": "USD",
  "gross": 0,
  "fee": 0,
  "net": 0,
  "direction": "in|out|neutral",
  "source_url": "optional provider dashboard URL",
  "tags": ["optional"]
}
```

Amounts are decimal numbers in the transaction currency. Inflows are positive `gross`; outflows may be represented as positive `gross` with `direction:"out"` or negative gross, but `net` must be signed consistently for totals. Prefer signed `net`: positive increases account value, negative decreases it.

## Invoice

```json
{
  "invoice_id": "stable local id",
  "invoice_number": "INV-2026-001",
  "direction": "incoming|outgoing",
  "vendor": "optional vendor/payee name",
  "customer": "optional customer name",
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "status": "open|paid|credited|void|needs_review",
  "currency": "USD",
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "source": "stripe|mercury|airwallex|creem|pdf|manual",
  "source_url": "optional source URL",
  "file_path": "optional local invoice PDF/path",
  "notes": "optional"
}
```

Invoices may come from provider exports, PDF imports, bookkeeping systems, or manual entries. Keep raw PDFs or exports outside git and store only local paths or safe references in the snapshot.

## Invoice Match

```json
{
  "match_id": "stable local id",
  "invoice_id": "invoice id",
  "transaction_id": "transaction id",
  "status": "matched|amount_mismatch|date_mismatch|needs_review|rejected",
  "amount_delta": 0,
  "date_delta_days": 0,
  "confidence": 0.98,
  "matching_method": "auto|suggested|manual",
  "matching_rule": "amount_currency_counterparty_date",
  "review_status": "auto_accepted|needs_review|human_approved|rejected",
  "amount_tolerance": 1,
  "date_tolerance_days": 3,
  "candidate_transaction_ids": ["optional candidate transaction ids"],
  "matched_at": "ISO timestamp",
  "audit_events": [
    {
      "event": "auto_matched|exception_flagged|human_approved|rejected|rematched",
      "actor": "agent or operator id",
      "at": "ISO timestamp",
      "note": "short explanation"
    }
  ],
  "notes": ["why the match was made or why review is needed"]
}
```

Use `matched` only when amount/currency, counterparty, direction, and timing are consistent enough for bookkeeping. Use `amount_mismatch` for partial payments, credits, platform fees accidentally compared against gross, or invoice totals that do not equal the transaction amount. Use `needs_review` when a human should choose between candidates. Keep tolerances explicit and preserve audit events rather than overwriting the history of a match.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "account_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

Use warnings for missing credentials, stale syncs, unsupported provider fields, reconciliation mismatches, or dedupe uncertainty.
