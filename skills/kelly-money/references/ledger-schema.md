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
