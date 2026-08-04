// Pure domain logic for kelly-money: turn normalized Busabase records into
// the ledger snapshot shape the UI renders. Read-only — this skill never
// writes from the browser; sync/import happens out of band through the
// trusted skill process, which writes these same Bases.

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildSnapshot({ accounts = [], transactions = [], invoices = [], invoiceMatches = [] } = {}) {
  const normalizedAccounts = accounts.map((row) => ({
    account_id: row.account_id || "",
    provider: row.provider || "",
    display_name: row.display_name || "",
    entity: row.entity || "",
    currency: row.currency || "",
    status: row.status || "not_configured",
    balance: {
      available: Number(row.balance_available || 0),
      pending: Number(row.balance_pending || 0),
      current: Number(row.balance_current || 0),
      as_of: row.balance_as_of || "",
    },
    totals: {
      gross_inflow: Number(row.gross_inflow || 0),
      gross_outflow: Number(row.gross_outflow || 0),
      fees: Number(row.fees || 0),
      net: Number(row.net || 0),
    },
    last_sync_at: row.last_sync_at || "",
    provider_account_id: row.provider_account_id || "",
    notes: row.notes || "",
  }));

  const normalizedTransactions = transactions.map((row) => ({
    transaction_id: row.transaction_id || "",
    provider: row.provider || "",
    account_id: row.account_id || "",
    provider_account_id: row.provider_account_id || "",
    provider_transaction_id: row.provider_transaction_id || "",
    occurred_at: row.occurred_at || "",
    available_at: row.available_at || null,
    description: row.description || "",
    counterparty: row.counterparty || "",
    type: row.type || "other",
    status: row.status || "posted",
    currency: row.currency || "",
    gross: Number(row.gross || 0),
    fee: Number(row.fee || 0),
    net: Number(row.net || 0),
    direction: row.direction || "neutral",
    source_url: row.source_url || "",
    tags: parseJsonList(row.tags),
  }));

  const normalizedInvoices = invoices.map((row) => ({
    invoice_id: row.invoice_id || "",
    invoice_number: row.invoice_number || "",
    direction: row.direction || "incoming",
    vendor: row.vendor || "",
    customer: row.customer || "",
    issue_date: row.issue_date || "",
    due_date: row.due_date || "",
    status: row.status || "open",
    currency: row.currency || "",
    subtotal: Number(row.subtotal || 0),
    tax: Number(row.tax || 0),
    total: Number(row.total || 0),
    source: row.source || "",
    source_url: row.source_url || "",
    file_path: row.file_path || "",
    notes: row.notes || "",
  }));

  const normalizedMatches = invoiceMatches.map((row) => ({
    match_id: row.match_id || "",
    invoice_id: row.invoice_id || "",
    transaction_id: row.transaction_id || "",
    status: row.status || "needs_review",
    amount_delta: Number(row.amount_delta || 0),
    date_delta_days: Number(row.date_delta_days || 0),
    confidence: Number(row.confidence || 0),
    matching_method: row.matching_method || "unmatched",
    matching_rule: row.matching_rule || "",
    review_status: row.review_status || "needs_review",
    amount_tolerance: Number(row.amount_tolerance || 0),
    date_tolerance_days: Number(row.date_tolerance_days || 0),
    candidate_transaction_ids: parseJsonList(row.candidate_transaction_ids),
    matched_at: row.matched_at || "",
    audit_events: parseJsonList(row.audit_events),
    notes: parseJsonList(row.notes),
  }));

  const metrics = normalizedAccounts.reduce(
    (acc, account) => {
      acc.gross_inflow += account.totals.gross_inflow;
      acc.gross_outflow += account.totals.gross_outflow;
      acc.fees += account.totals.fees;
      acc.net += account.totals.net;
      return acc;
    },
    {
      account_count: normalizedAccounts.length,
      transaction_count: normalizedTransactions.length,
      gross_inflow: 0,
      gross_outflow: 0,
      fees: 0,
      net: 0,
    },
  );

  const warnings = [];
  for (const account of normalizedAccounts) {
    if (account.status === "warning" || account.status === "error") {
      warnings.push({
        id: `account-${account.account_id}-${account.status}`,
        severity: account.status === "error" ? "error" : "warning",
        account_id: account.account_id,
        message: `${account.display_name || account.account_id} needs attention.`,
        detail: "",
      });
    }
  }

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-money",
    base_currency: "USD",
    range: { start: "", end: "" },
    metrics,
    accounts: normalizedAccounts,
    transactions: normalizedTransactions,
    invoices: normalizedInvoices,
    invoice_matches: normalizedMatches,
    warnings,
  };
}
