import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-money-language") || "auto",
  demo: new URLSearchParams(location.search).get("demo") || ""
};

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  syncStatus: document.querySelector("#sync-status"),
  attentionPrimary: document.querySelector("#attention-primary"),
  attentionSecondary: document.querySelector("#attention-secondary"),
  language: document.querySelector("#language")
};

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/ledger").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "ledger", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = scenario === "accounts"
    ? "#/accounts"
    : scenario === "detail"
      ? "#/accounts/stripe-main"
      : scenario === "ledger"
        ? "#/ledger"
        : scenario === "invoices"
          ? "#/invoices"
        : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const warningCount = snapshot?.warnings?.length || 0;
  const reviewCount = invoiceMatches().filter((match) => match.status !== "matched").length;
  const configuredCount = state.settings?.config_summary?.accounts?.length || 0;
  const txCount = snapshot?.transactions?.length || 0;
  els.syncStatus.textContent = snapshot ? `${txCount} ${t("tx")}` : t("empty");
  els.attentionPrimary.textContent = reviewCount ? `${reviewCount} ${t("invoiceNeedsReview")}` : (warningCount ? `${warningCount} ${t("warnings")}` : (configuredCount ? t("synced") : t("setupNeeded")));
  els.attentionSecondary.textContent = `${configuredCount} ${t("configured")}`;
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("grossIn")}</span><strong>${money(metrics.gross_inflow)}</strong></div>
      <div class="metric"><span>${t("grossOut")}</span><strong>${money(metrics.gross_outflow)}</strong></div>
      <div class="metric"><span>${t("fees")}</span><strong>${money(metrics.fees)}</strong></div>
      <div class="metric"><span>${t("net")}</span><strong>${money(metrics.net)}</strong></div>
    </div>
  `;
}

function filteredTransactions(accountId = "") {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.transactions || []).filter((tx) => {
    if (accountId && tx.account_id !== accountId) return false;
    if (!query) return true;
    const match = matchForTransaction(tx.transaction_id);
    return [tx.description, tx.counterparty, tx.provider, tx.account_id, tx.type, tx.status, match?.status, invoiceForMatch(match)?.invoice_number]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function ledgerTable(transactions) {
  if (!transactions.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Description</th><th>Provider</th><th>Account</th><th>Type</th><th>Status</th><th>Invoice</th><th>Gross</th><th>Fee</th><th>Net</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((tx) => `
            <tr>
              <td>${date(tx.occurred_at)}</td>
              <td><div class="strong">${escapeHtml(tx.description)}</div><div class="muted">${escapeHtml(tx.counterparty || tx.provider_transaction_id || "")}</div></td>
              <td><span class="badge">${escapeHtml(tx.provider)}</span></td>
              <td><a href="#/accounts/${encodeURIComponent(tx.account_id)}">${escapeHtml(accountName(tx.account_id))}</a></td>
              <td>${escapeHtml(tx.type)}</td>
              <td>${escapeHtml(tx.status)}</td>
              <td>${invoiceBadgeForTransaction(tx.transaction_id)}</td>
              <td class="num">${money(tx.gross, tx.currency)}</td>
              <td class="num">${money(tx.fee, tx.currency)}</td>
              <td class="num ${Number(tx.net) < 0 ? "negative" : "positive"}">${money(tx.net, tx.currency)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function accountName(accountId) {
  return state.snapshot?.accounts?.find((account) => account.account_id === accountId)?.display_name || accountId;
}

function renderLedger() {
  els.title.textContent = t("ledger");
  els.subtitle.textContent = state.snapshot?.generated_at ? `Generated ${new Date(state.snapshot.generated_at).toLocaleString()}` : t("empty");
  els.content.innerHTML = `${metricCards()}${warnings()}${ledgerTable(filteredTransactions())}`;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at ? `Generated ${new Date(state.snapshot.generated_at).toLocaleString()}` : t("empty");
  const accounts = state.snapshot?.accounts || [];
  const recent = filteredTransactions().slice(0, 6);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>Account Health</h2>
        ${accounts.map((account) => `
          <a class="health-row" href="#/accounts/${encodeURIComponent(account.account_id)}">
            <span><strong>${escapeHtml(account.display_name)}</strong><small>${escapeHtml(account.provider)} · ${escapeHtml(account.currency)}</small></span>
            <span class="num">${money(account.balance?.current, account.currency)}</span>
            <span class="status ${account.status}">${escapeHtml(account.status)}</span>
          </a>
        `).join("")}
      </div>
      <div class="overview-panel">
        <h2>Recent Money Movement</h2>
        ${recent.map((tx) => `
          <div class="movement-row">
            <span><strong>${escapeHtml(tx.description)}</strong><small>${escapeHtml(tx.counterparty || tx.provider)}</small></span>
            <span class="num ${Number(tx.net) < 0 ? "negative" : "positive"}">${money(tx.net, tx.currency)}</span>
          </div>
        `).join("")}
      </div>
      <div class="overview-panel wide">
        <h2>Invoice Matching</h2>
        <div class="invoice-summary">
          ${invoiceSummaryCards()}
        </div>
      </div>
    </section>
  `;
}

function renderAccounts() {
  els.title.textContent = t("accounts");
  els.subtitle.textContent = `${state.snapshot?.accounts?.length || 0} ${t("configured")}`;
  const accounts = state.snapshot?.accounts || [];
  els.content.innerHTML = accounts.length ? `
    <div class="account-grid">
      ${accounts.map((account) => `
        <a class="account-card" href="#/accounts/${encodeURIComponent(account.account_id)}">
          <div class="row between"><strong>${escapeHtml(account.display_name)}</strong><span class="badge">${escapeHtml(account.provider)}</span></div>
          <div class="muted">${escapeHtml(account.entity || account.account_id)} · ${escapeHtml(account.currency)}</div>
          <div class="balance">${money(account.balance?.current, account.currency)}</div>
          <div class="row stats">
            <span>${t("grossIn")} ${money(account.totals?.gross_inflow, account.currency)}</span>
            <span>${t("net")} ${money(account.totals?.net, account.currency)}</span>
          </div>
          <div class="status ${account.status}">${escapeHtml(account.status)}</div>
        </a>
      `).join("")}
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function renderInvoices() {
  els.title.textContent = t("invoices");
  const invoices = filteredInvoices();
  const matches = invoiceMatches();
  const needsReview = matches.filter((match) => match.status !== "matched").length;
  els.subtitle.textContent = `${invoices.length} invoices · ${needsReview} ${t("invoiceNeedsReview")}`;
  els.content.innerHTML = `
    <div class="metrics invoice-metrics">
      ${invoiceSummaryCards()}
    </div>
    <div class="invoice-layout">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice</th><th>Vendor / Customer</th><th>Issue date</th><th>Due date</th><th>Status</th><th>Match</th><th>Review</th><th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map((invoice) => {
              const match = matchForInvoice(invoice.invoice_id);
              return `
                <tr>
                  <td><a href="#/invoices/${encodeURIComponent(invoice.invoice_id)}"><strong>${escapeHtml(invoice.invoice_number)}</strong></a><div class="muted">${escapeHtml(invoice.direction)}</div></td>
                  <td>${escapeHtml(invoice.vendor || invoice.customer || "")}</td>
                  <td>${date(invoice.issue_date)}</td>
                  <td>${date(invoice.due_date)}</td>
                  <td>${escapeHtml(invoice.status)}</td>
                  <td>${invoiceMatchBadge(match)}</td>
                  <td>${escapeHtml(match?.review_status?.replaceAll("_", " ") || "needs review")}</td>
                  <td class="num">${money(invoice.total, invoice.currency)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderInvoiceDetail() {
  const invoice = invoices().find((item) => item.invoice_id === state.route.id);
  if (!invoice) {
    renderInvoices();
    return;
  }
  const match = matchForInvoice(invoice.invoice_id);
  const tx = match?.transaction_id ? transactionById(match.transaction_id) : null;
  els.title.textContent = invoice.invoice_number;
  els.subtitle.textContent = `${invoice.vendor || invoice.customer || ""} · ${invoice.status}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${invoiceDetailPanel(invoice, match, tx)}
        ${match?.notes?.length ? `<div class="warnings">${match.notes.map((note) => `<div><strong>${escapeHtml(note)}</strong></div>`).join("")}</div>` : ""}
        ${tx ? ledgerTable([tx]) : `<div class="empty">No matching transaction selected yet.</div>`}
      </div>
      <aside class="detail-side">
        <h2>Invoice Detail</h2>
        <dl>
          <dt>Direction</dt><dd>${escapeHtml(invoice.direction)}</dd>
          <dt>Currency</dt><dd>${escapeHtml(invoice.currency)}</dd>
          <dt>Subtotal</dt><dd>${money(invoice.subtotal, invoice.currency)}</dd>
          <dt>Tax</dt><dd>${money(invoice.tax, invoice.currency)}</dd>
          <dt>Total</dt><dd>${money(invoice.total, invoice.currency)}</dd>
          <dt>Source</dt><dd>${escapeHtml(invoice.source || "")}</dd>
          <dt>Rule</dt><dd>${escapeHtml(match?.matching_rule || "")}</dd>
          <dt>Review</dt><dd>${escapeHtml(match?.review_status?.replaceAll("_", " ") || "needs review")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderAccountDetail() {
  const account = state.snapshot?.accounts?.find((item) => item.account_id === state.route.id);
  if (!account) {
    renderAccounts();
    return;
  }
  els.title.textContent = account.display_name;
  els.subtitle.textContent = `${account.provider} · ${account.currency} · ${account.status}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${warnings(account.account_id)}
        ${metricCardsFor(account)}
        ${ledgerTable(filteredTransactions(account.account_id))}
      </div>
      <aside class="detail-side">
        <h2>Account Detail</h2>
        <dl>
          <dt>Provider</dt><dd>${escapeHtml(account.provider)}</dd>
          <dt>Account ID</dt><dd>${escapeHtml(account.account_id)}</dd>
          <dt>Provider ID</dt><dd>${escapeHtml(account.provider_account_id || "")}</dd>
          <dt>Last sync</dt><dd>${escapeHtml(account.last_sync_at || "")}</dd>
          <dt>Available</dt><dd>${money(account.balance?.available, account.currency)}</dd>
          <dt>Pending</dt><dd>${money(account.balance?.pending, account.currency)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function metricCardsFor(account) {
  return `
    <div class="metrics">
      <div class="metric"><span>Current</span><strong>${money(account.balance?.current, account.currency)}</strong></div>
      <div class="metric"><span>${t("grossIn")}</span><strong>${money(account.totals?.gross_inflow, account.currency)}</strong></div>
      <div class="metric"><span>${t("fees")}</span><strong>${money(account.totals?.fees, account.currency)}</strong></div>
      <div class="metric"><span>${t("net")}</span><strong>${money(account.totals?.net, account.currency)}</strong></div>
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = "Local files only";
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>Configuration</h2>
        <dl>
          <dt>Provider</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>Config path</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>Onboarding</dt><dd>${state.settings?.onboarding?.completed ? "completed" : "incomplete"}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${(summary.accounts || []).map((account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(account.provider)} · ${escapeHtml(account.currency || "")}</span>
            <span>${account.secrets_ready ? "secrets ready" : "missing secrets"}</span>
          </div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
      </section>
    </div>
  `;
}

function invoices() {
  return state.snapshot?.invoices || [];
}

function invoiceMatches() {
  return state.snapshot?.invoice_matches || [];
}

function filteredInvoices() {
  const query = state.query.trim().toLowerCase();
  if (!query) return invoices();
  return invoices().filter((invoice) => {
    const match = matchForInvoice(invoice.invoice_id);
    return [invoice.invoice_number, invoice.vendor, invoice.customer, invoice.status, invoice.direction, invoice.source, match?.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function matchForTransaction(transactionId) {
  return invoiceMatches().find((match) => match.transaction_id === transactionId);
}

function matchForInvoice(invoiceId) {
  return invoiceMatches().find((match) => match.invoice_id === invoiceId);
}

function invoiceForMatch(match) {
  if (!match) return null;
  return invoices().find((invoice) => invoice.invoice_id === match.invoice_id);
}

function transactionById(transactionId) {
  return (state.snapshot?.transactions || []).find((tx) => tx.transaction_id === transactionId);
}

function invoiceBadgeForTransaction(transactionId) {
  const match = matchForTransaction(transactionId);
  if (!match) return `<span class="invoice-badge missing">missing</span>`;
  const invoice = invoiceForMatch(match);
  return `<a class="invoice-badge ${escapeHtml(match.status)}" href="#/invoices/${encodeURIComponent(match.invoice_id)}">${escapeHtml(invoice?.invoice_number || match.status)}</a>`;
}

function invoiceMatchBadge(match) {
  if (!match) return `<span class="invoice-badge missing">missing</span>`;
  return `<span class="invoice-badge ${escapeHtml(match.status)}">${escapeHtml(match.status.replaceAll("_", " "))}</span>`;
}

function invoiceSummaryCards() {
  const matches = invoiceMatches();
  const matched = matches.filter((match) => match.status === "matched").length;
  const review = matches.filter((match) => match.status !== "matched").length;
  const missing = invoices().filter((invoice) => !matchForInvoice(invoice.invoice_id)).length;
  const total = invoices().reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  return `
    <div class="metric"><span>${t("invoices")}</span><strong>${invoices().length}</strong></div>
    <div class="metric"><span>${t("invoiceMatched")}</span><strong>${matched}</strong></div>
    <div class="metric"><span>${t("invoiceNeedsReview")}</span><strong>${review + missing}</strong></div>
    <div class="metric"><span>Total</span><strong>${money(total)}</strong></div>
  `;
}

function invoiceDetailPanel(invoice, match, tx) {
  return `
    <div class="invoice-detail-panel">
      <div>
        <span class="muted">Invoice amount</span>
        <strong>${money(invoice.total, invoice.currency)}</strong>
      </div>
      <div>
        <span class="muted">Match status</span>
        ${invoiceMatchBadge(match)}
      </div>
      <div>
        <span class="muted">Confidence</span>
        <strong>${match ? `${Math.round(Number(match.confidence || 0) * 100)}%` : "0%"}</strong>
      </div>
      <div>
        <span class="muted">Amount delta</span>
        <strong class="${Number(match?.amount_delta || 0) === 0 ? "positive" : "negative"}">${money(match?.amount_delta || 0, invoice.currency)}</strong>
      </div>
      <div>
        <span class="muted">Date delta</span>
        <strong>${match ? `${match.date_delta_days || 0} days` : "n/a"}</strong>
      </div>
      <div>
        <span class="muted">Tolerance</span>
        <strong>${match ? `${money(match.amount_tolerance || 0, invoice.currency)} / ${match.date_tolerance_days || 0} days` : "n/a"}</strong>
      </div>
      <div>
        <span class="muted">Method</span>
        <strong>${escapeHtml(match?.matching_method || "unmatched")}</strong>
      </div>
      <div>
        <span class="muted">Transaction</span>
        <strong>${escapeHtml(tx?.description || "Not selected")}</strong>
      </div>
    </div>
    ${match?.audit_events?.length ? `
      <div class="audit-panel">
        <h2>Match Audit Trail</h2>
        ${match.audit_events.map((event) => `
          <div class="audit-row">
            <strong>${escapeHtml(event.event?.replaceAll("_", " ") || "")}</strong>
            <span>${escapeHtml(event.actor || "")} · ${escapeHtml(event.at || "")}</span>
            <p>${escapeHtml(event.note || "")}</p>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter((item) => !accountId || !item.account_id || item.account_id === accountId);
  if (!items.length) return "";
  return `<div class="warnings">${items.map((item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `).join("")}</div>`;
}

function render() {
  renderShell();
  if (state.route.view === "accounts" && state.route.id) renderAccountDetail();
  else if (state.route.view === "accounts") renderAccounts();
  else if (state.route.view === "invoices" && state.route.id) renderInvoiceDetail();
  else if (state.route.view === "invoices") renderInvoices();
  else if (state.route.view === "settings") renderSettings();
  else if (state.route.view === "overview") renderOverview();
  else renderLedger();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

window.addEventListener("hashchange", setRoute);
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = els.language.value;
  localStorage.setItem("kelly-money-language", state.lang);
  render();
});

loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
