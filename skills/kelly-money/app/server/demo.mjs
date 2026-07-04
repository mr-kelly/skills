const now = "2026-06-30T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-money",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-money/config.json",
      is_example: false,
      accounts: snapshot.accounts.map((account) => ({
        account_id: account.account_id,
        provider: account.provider,
        display_name: account.display_name,
        entity: account.entity,
        currency: account.currency,
        secret_envs: [`KELLY_MONEY_${account.provider.toUpperCase()}_API_KEY_DEMO`],
        secrets_ready: true,
      })),
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot) {
  const accountNames = {
    "mercury-main": "Mercury 运营账户",
    "stripe-main": "Stripe 全球收款",
    "airwallex-main": "Airwallex 多币种账户",
    "creem-main": "Creem SaaS 收款",
  };
  snapshot.accounts = snapshot.accounts.map((account) => ({
    ...account,
    display_name: accountNames[account.account_id] || account.display_name,
    entity: "Atlas Studio LLC",
  }));
  const txText = {
    "stripe-bal-1024": ["团队版订阅收入", "北星实验室"],
    "stripe-ref-1025": ["重复席位退款", "明桌科技"],
    "creem-pay-330": ["年度授权结账", "月光工具"],
    "mercury-ach-882": ["外包付款批次", "设计伙伴"],
    "airwallex-fx-231": ["美元到港币兑换点差", "Airwallex FX"],
    "stripe-pay-1026": ["创作者课程付款", "陈琳"],
    "mercury-int-184": ["金库收益入账", "Mercury 金库"],
    "creem-sub-331": ["月度产品订阅", "星环工作室"],
    "airwallex-card-942": ["云渲染发票付款", "渲染湾"],
    "stripe-payout-77": ["Stripe 提现到 Mercury", "Stripe"],
  };
  snapshot.transactions = snapshot.transactions.map((tx) => {
    const pair = txText[tx.transaction_id];
    return pair ? { ...tx, description: pair[0], counterparty: pair[1] } : tx;
  });
  const vendors = {
    "inv-northstar-20260629": "北星实验室",
    "inv-bright-20260629": "明桌科技",
    "inv-moonlit-20260628": "月光工具",
    "inv-design-20260628": "设计伙伴",
    "inv-render-20260625": "渲染湾",
    "inv-orbit-20260626": "星环工作室",
  };
  snapshot.invoices = snapshot.invoices.map((invoice) => ({
    ...invoice,
    vendor: vendors[invoice.invoice_id] || invoice.vendor,
  }));
  snapshot.invoice_matches = snapshot.invoice_matches.map((match) => {
    if (match.match_id !== "match-render")
      return {
        ...match,
        notes: match.notes.map((note) =>
          note
            .replace(
              "Amount and counterparty match Stripe balance transaction.",
              "金额和交易对手与 Stripe balance transaction 匹配。",
            )
            .replace("Credit note matches refund transaction.", "Credit note 与退款交易匹配。")
            .replace("Creem checkout total matches invoice.", "Creem checkout 总额与发票匹配。")
            .replace("ACH payout amount and due date match bill.", "ACH 付款金额和到期日与账单匹配。"),
        ),
        audit_events: match.audit_events.map((event) => ({ ...event, note: event.note })),
      };
    const note = "发票总额为 US$700.00，但交易金额为 US$680.00。请检查折扣、credit 或部分付款。";
    return {
      ...match,
      notes: [note],
      audit_events: match.audit_events.map((event) => ({ ...event, note })),
    };
  });
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "Stripe 待入账余额高于平时；月结前请核对下一笔提现。",
    detail: "演示提醒，没有读取真实平台数据。",
  }));
  return snapshot;
}

function demoSnapshot(scenario) {
  const accounts = [
    account("mercury-main", "mercury", "Mercury Operating", "Atlas Studio LLC", "USD", 84250.42, 0, "ok"),
    account(
      "stripe-main",
      "stripe",
      "Stripe Global",
      "Atlas Studio LLC",
      "USD",
      12840.2,
      3410.78,
      ["detail", "invoices"].includes(scenario) ? "warning" : "ok",
    ),
    account("airwallex-main", "airwallex", "Airwallex Multi-currency", "Atlas Studio LLC", "USD", 23750.66, 0, "ok"),
    account("creem-main", "creem", "Creem SaaS", "Atlas Studio LLC", "USD", 6240.15, 980.44, "ok"),
  ];
  const transactions = [
    tx(
      "stripe-bal-1024",
      "stripe",
      "stripe-main",
      "2026-06-29T16:12:00.000Z",
      "Team plan subscription",
      "Northstar Labs",
      "payment",
      "posted",
      2490,
      82.17,
      2407.83,
      "in",
    ),
    tx(
      "stripe-ref-1025",
      "stripe",
      "stripe-main",
      "2026-06-29T11:04:00.000Z",
      "Refund for duplicate seat",
      "Bright Desk",
      "refund",
      "posted",
      320,
      0,
      -320,
      "out",
    ),
    tx(
      "creem-pay-330",
      "creem",
      "creem-main",
      "2026-06-28T20:34:00.000Z",
      "Annual license checkout",
      "Moonlit Tools",
      "payment",
      "posted",
      1188,
      46.25,
      1141.75,
      "in",
    ),
    tx(
      "mercury-ach-882",
      "mercury",
      "mercury-main",
      "2026-06-28T09:15:00.000Z",
      "Contractor payout batch",
      "Design Partners",
      "transfer",
      "posted",
      4500,
      0,
      -4500,
      "out",
    ),
    tx(
      "airwallex-fx-231",
      "airwallex",
      "airwallex-main",
      "2026-06-27T14:22:00.000Z",
      "USD to HKD conversion spread",
      "Airwallex FX",
      "conversion",
      "posted",
      38.2,
      38.2,
      -38.2,
      "out",
    ),
    tx(
      "stripe-pay-1026",
      "stripe",
      "stripe-main",
      "2026-06-27T10:47:00.000Z",
      "Creator course payment",
      "Lina Chen",
      "payment",
      "pending",
      799,
      26.68,
      772.32,
      "in",
    ),
    tx(
      "mercury-int-184",
      "mercury",
      "mercury-main",
      "2026-06-26T18:00:00.000Z",
      "Treasury yield credit",
      "Mercury Treasury",
      "interest",
      "posted",
      124.56,
      0,
      124.56,
      "in",
    ),
    tx(
      "creem-sub-331",
      "creem",
      "creem-main",
      "2026-06-26T13:18:00.000Z",
      "Monthly product subscription",
      "Orbit Works",
      "payment",
      "posted",
      149,
      6.28,
      142.72,
      "in",
    ),
    tx(
      "airwallex-card-942",
      "airwallex",
      "airwallex-main",
      "2026-06-25T08:40:00.000Z",
      "Cloud rendering invoice",
      "Render Bay",
      "charge",
      "posted",
      680,
      0,
      -680,
      "out",
    ),
    tx(
      "stripe-payout-77",
      "stripe",
      "stripe-main",
      "2026-06-24T07:00:00.000Z",
      "Stripe payout to Mercury",
      "Stripe",
      "payout",
      "posted",
      7800,
      0,
      -7800,
      "out",
    ),
  ];
  const byAccount = new Map(accounts.map((item) => [item.account_id, item]));
  for (const item of transactions) {
    const totals = byAccount.get(item.account_id).totals;
    if (item.direction === "in") totals.gross_inflow += item.gross;
    if (item.direction === "out") totals.gross_outflow += item.gross;
    totals.fees += item.fee;
    totals.net += item.net;
  }
  const metrics = accounts.reduce(
    (acc, item) => {
      acc.gross_inflow += item.totals.gross_inflow;
      acc.gross_outflow += item.totals.gross_outflow;
      acc.fees += item.totals.fees;
      acc.net += item.totals.net;
      return acc;
    },
    {
      account_count: accounts.length,
      transaction_count: transactions.length,
      gross_inflow: 0,
      gross_outflow: 0,
      fees: 0,
      net: 0,
    },
  );
  const invoices = demoInvoices();
  const invoice_matches = demoInvoiceMatches();
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-money-demo",
    base_currency: "USD",
    range: { start: "2026-06-01", end: "2026-06-30" },
    metrics,
    accounts,
    transactions,
    invoices,
    invoice_matches,
    warnings: ["detail", "invoices"].includes(scenario)
      ? [
          {
            id: "stripe-pending-spike",
            severity: "warning",
            account_id: "stripe-main",
            message: "Stripe pending balance is higher than usual; reconcile next payout before month close.",
            detail: "Demo warning, no live provider data.",
          },
        ]
      : [],
  };
}

function demoInvoices() {
  return [
    invoice(
      "inv-northstar-20260629",
      "INV-2026-0618",
      "incoming",
      "Northstar Labs",
      "",
      "2026-06-29",
      "2026-06-29",
      "paid",
      "USD",
      2490,
      0,
      2490,
      "stripe",
    ),
    invoice(
      "inv-bright-20260629",
      "CN-2026-0042",
      "outgoing",
      "Bright Desk",
      "",
      "2026-06-29",
      "2026-06-29",
      "credited",
      "USD",
      320,
      0,
      320,
      "stripe",
    ),
    invoice(
      "inv-moonlit-20260628",
      "INV-2026-0617",
      "incoming",
      "Moonlit Tools",
      "",
      "2026-06-28",
      "2026-06-28",
      "paid",
      "USD",
      1188,
      0,
      1188,
      "creem",
    ),
    invoice(
      "inv-design-20260628",
      "BILL-2026-117",
      "outgoing",
      "Design Partners",
      "",
      "2026-06-27",
      "2026-06-28",
      "paid",
      "USD",
      4500,
      0,
      4500,
      "mercury",
    ),
    invoice(
      "inv-render-20260625",
      "RB-8841",
      "outgoing",
      "Render Bay",
      "",
      "2026-06-25",
      "2026-06-25",
      "needs_review",
      "USD",
      700,
      0,
      700,
      "airwallex",
    ),
    invoice(
      "inv-orbit-20260626",
      "INV-2026-0616",
      "incoming",
      "Orbit Works",
      "",
      "2026-06-26",
      "2026-06-26",
      "open",
      "USD",
      149,
      0,
      149,
      "creem",
    ),
  ];
}

function demoInvoiceMatches() {
  return [
    match(
      "match-northstar",
      "inv-northstar-20260629",
      "stripe-bal-1024",
      "matched",
      0,
      0,
      1,
      "auto",
      "amount_currency_counterparty_date",
      "auto_accepted",
      [],
      ["Amount and counterparty match Stripe balance transaction."],
    ),
    match(
      "match-bright",
      "inv-bright-20260629",
      "stripe-ref-1025",
      "matched",
      0,
      0,
      0.98,
      "auto",
      "credit_note_refund_amount",
      "auto_accepted",
      [],
      ["Credit note matches refund transaction."],
    ),
    match(
      "match-moonlit",
      "inv-moonlit-20260628",
      "creem-pay-330",
      "matched",
      0,
      0,
      0.97,
      "auto",
      "provider_checkout_reference",
      "auto_accepted",
      [],
      ["Creem checkout total matches invoice."],
    ),
    match(
      "match-design",
      "inv-design-20260628",
      "mercury-ach-882",
      "matched",
      0,
      1,
      0.95,
      "auto",
      "amount_counterparty_near_date",
      "auto_accepted",
      [],
      ["ACH payout amount and due date match bill."],
    ),
    match(
      "match-render",
      "inv-render-20260625",
      "airwallex-card-942",
      "amount_mismatch",
      -20,
      0,
      0.72,
      "suggested",
      "counterparty_near_date_amount_outside_tolerance",
      "needs_review",
      ["airwallex-card-942"],
      ["Invoice total is $700.00 but transaction is $680.00. Check discount, credit, or partial payment."],
    ),
  ];
}

function account(account_id, provider, display_name, entity, currency, available, pending, status) {
  return {
    account_id,
    provider,
    display_name,
    entity,
    currency,
    status,
    balance: { available, pending, current: available + pending, as_of: now },
    totals: { gross_inflow: 0, gross_outflow: 0, fees: 0, net: 0 },
    last_sync_at: now,
    provider_account_id: `${provider}_demo_account`,
  };
}

function tx(
  id,
  provider,
  account_id,
  occurred_at,
  description,
  counterparty,
  type,
  status,
  gross,
  fee,
  net,
  direction,
) {
  return {
    transaction_id: id,
    provider,
    account_id,
    provider_account_id: `${provider}_demo_account`,
    provider_transaction_id: id,
    occurred_at,
    available_at: status === "pending" ? null : occurred_at,
    description,
    counterparty,
    type,
    status,
    currency: "USD",
    gross,
    fee,
    net,
    direction,
    source_url: "",
    tags: [],
  };
}

function invoice(
  invoice_id,
  invoice_number,
  direction,
  vendor,
  customer,
  issue_date,
  due_date,
  status,
  currency,
  subtotal,
  tax,
  total,
  source,
) {
  return {
    invoice_id,
    invoice_number,
    direction,
    vendor,
    customer,
    issue_date,
    due_date,
    status,
    currency,
    subtotal,
    tax,
    total,
    source,
    source_url: "",
    file_path: "",
    notes: "",
  };
}

function match(
  match_id,
  invoice_id,
  transaction_id,
  status,
  amount_delta,
  date_delta_days,
  confidence,
  matching_method,
  matching_rule,
  review_status,
  candidate_transaction_ids,
  notes,
) {
  return {
    match_id,
    invoice_id,
    transaction_id,
    status,
    amount_delta,
    date_delta_days,
    confidence,
    matching_method,
    matching_rule,
    review_status,
    amount_tolerance: 1,
    date_tolerance_days: 3,
    candidate_transaction_ids,
    matched_at: now,
    audit_events: [
      {
        event: status === "matched" ? "auto_matched" : "exception_flagged",
        actor: "kelly-money-demo",
        at: now,
        note: notes[0] || "",
      },
    ],
    notes,
  };
}
