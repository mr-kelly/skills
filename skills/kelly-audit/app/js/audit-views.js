import {
  anomalies,
  anomalyBadges,
  anomalyById,
  date,
  els,
  enumLabel,
  escapeHtml,
  filteredOrders,
  invoiceById,
  invoices,
  money,
  n,
  orderById,
  paymentById,
  render,
  ruleBadge,
  severityBadge,
  state,
  statusBadge,
  t,
} from "../app.js";
export function renderOrders() {
  els.title.textContent = t("orders");
  const items = [...filteredOrders()].sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)));
  els.subtitle.textContent = `${items.length} ${t("orders").toLowerCase()}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("orderNo")}</th><th>${t("customer")}</th><th>${t("date")}</th><th class="num">${t("amount")}</th><th>${t("currency")}</th><th>${t("invoiceStatus")}</th><th>${t("paymentStatus")}</th><th>${t("linkedAnomaly")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (order) => `
            <tr>
              <td><a href="#/orders/${encodeURIComponent(order.order_id)}"><div class="strong">${escapeHtml(order.order_no)}</div></a></td>
              <td>${escapeHtml(order.customer)}</td>
              <td>${date(order.order_date)}</td>
              <td class="num">${money(order.amount, order.currency)}</td>
              <td>${escapeHtml(order.currency)}</td>
              <td>${statusBadge(order.invoice_status)}</td>
              <td>${statusBadge(order.payment_status)}</td>
              <td>${anomalyBadges(order.anomaly_ids)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

function chainRow(tone, title, detail, amountHtml, badgeHtml) {
  return `
    <div class="chain-row ${tone}">
      <span class="chain-dot" aria-hidden="true"></span>
      <span><strong>${title}</strong><small>${detail}</small></span>
      <span class="num">${amountHtml}</span>
      ${badgeHtml}
    </div>
  `;
}

function invoiceTone(status) {
  if (status === "paid" || status === "credit_note") return "ok";
  if (status === "overdue") return "bad";
  return "warn";
}

export function renderOrderDetail() {
  const order = orderById(state.route.id);
  if (!order) {
    renderOrders();
    return;
  }
  els.title.textContent = order.order_no;
  els.subtitle.textContent = `${order.customer} · ${date(order.order_date)}`;
  const linkedInvoices = (order.invoice_ids || []).map((id) => invoiceById(id)).filter(Boolean);
  const chainRows = [
    chainRow(
      "ok",
      `${escapeHtml(t("orderNo"))} ${escapeHtml(order.order_no)}`,
      `${escapeHtml(order.customer)} · ${date(order.order_date)}`,
      money(order.amount, order.currency),
      statusBadge(order.invoice_status),
    ),
  ];
  if (!linkedInvoices.length) {
    chainRows.push(chainRow("bad", escapeHtml(t("invoiceNo")), escapeHtml(t("none")), "—", statusBadge("missing")));
  }
  for (const invoice of linkedInvoices) {
    chainRows.push(
      chainRow(
        invoiceTone(invoice.status),
        `<a href="#/invoices/${encodeURIComponent(invoice.invoice_id)}">${escapeHtml(t("invoiceNo"))} ${escapeHtml(invoice.invoice_no)}</a>`,
        `${date(invoice.issue_date)} → ${date(invoice.due_date)}${invoice.days_overdue ? ` · ${invoice.days_overdue} ${t("days")} ${enumLabel("overdue")}` : ""}`,
        money(invoice.amount, invoice.currency),
        statusBadge(invoice.status),
      ),
    );
    for (const paymentId of invoice.payment_ids || []) {
      const payment = paymentById(paymentId);
      if (!payment) continue;
      chainRows.push(
        chainRow(
          "ok",
          `${escapeHtml(t("payments"))} ${escapeHtml(payment.payment_ref)}`,
          `${escapeHtml(enumLabel(payment.method, "method"))} · ${date(payment.paid_date)}`,
          money(payment.amount, payment.currency),
          statusBadge(payment.match_status),
        ),
      );
    }
    if (!(invoice.payment_ids || []).length && invoice.status !== "credit_note") {
      chainRows.push(
        chainRow(
          invoice.days_overdue ? "bad" : "warn",
          escapeHtml(t("payments")),
          escapeHtml(t("none")),
          money(0, invoice.currency),
          statusBadge("unpaid"),
        ),
      );
    }
  }
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="overview-panel wide">
          <h2>${t("documentChain")}</h2>
          <div class="chain">${chainRows.join("")}</div>
        </div>
        ${
          (order.anomaly_ids || []).length
            ? `
          <div class="overview-panel wide">
            <h2>${t("anomalies")}</h2>
            ${(order.anomaly_ids || [])
              .map((id) => anomalyById(id))
              .filter(Boolean)
              .map(
                (anomaly) => `
              <a class="health-row" href="#/anomalies/${encodeURIComponent(anomaly.id)}">
                <span><strong>${t("anomaly")} #${anomaly.ref} · ${escapeHtml(anomaly.title)}</strong><small>${escapeHtml(enumLabel(anomaly.rule, "rule"))}</small></span>
                <span class="num">${money(anomaly.amount_at_stake, anomaly.currency)}</span>
                ${statusBadge(anomaly.status)}
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("orderDetail")}</h2>
        <dl>
          <dt>${t("customer")}</dt><dd>${escapeHtml(order.customer)}</dd>
          <dt>${t("date")}</dt><dd>${date(order.order_date)}</dd>
          <dt>${t("amount")}</dt><dd>${money(order.amount, order.currency)}</dd>
          <dt>${t("invoiceStatus")}</dt><dd>${statusBadge(order.invoice_status)}</dd>
          <dt>${t("paymentStatus")}</dt><dd>${statusBadge(order.payment_status)}</dd>
          <dt>${t("files")}</dt><dd>${escapeHtml(order.source_file || "")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

/* ---------- Invoices ---------- */

function filteredInvoices() {
  const query = state.query.trim().toLowerCase();
  if (!query) return invoices();
  return invoices().filter((invoice) =>
    [invoice.invoice_no, invoice.order_no, invoice.customer, invoice.status, invoice.currency]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderInvoices() {
  els.title.textContent = t("invoices");
  const items = [...filteredInvoices()].sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
  const overdue = items.filter((item) => item.status === "overdue").length;
  els.subtitle.textContent = `${items.length} ${t("invoices").toLowerCase()} · ${overdue} ${enumLabel("overdue")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("invoiceNo")}</th><th>${t("orderRef")}</th><th>${t("customer")}</th><th>${t("issueDate")}</th><th>${t("dueDate")}</th><th class="num">${t("amount")}</th><th class="num">${t("paid")}</th><th class="num">${t("daysOverdue")}</th><th>${t("status")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (invoice) => `
            <tr>
              <td><a href="#/invoices/${encodeURIComponent(invoice.invoice_id)}"><div class="strong">${escapeHtml(invoice.invoice_no)}</div></a></td>
              <td>${invoice.order_id ? `<a href="#/orders/${encodeURIComponent(invoice.order_id)}">${escapeHtml(invoice.order_no)}</a>` : `<span class="muted">—</span>`}</td>
              <td>${escapeHtml(invoice.customer)}</td>
              <td>${date(invoice.issue_date)}</td>
              <td>${invoice.due_date ? date(invoice.due_date) : `<span class="muted">—</span>`}</td>
              <td class="num">${money(invoice.amount, invoice.currency)}</td>
              <td class="num">${money(invoice.paid_amount, invoice.currency)}</td>
              <td class="num">${invoice.days_overdue ? `<span class="negative">${invoice.days_overdue}</span>` : "0"}</td>
              <td>${statusBadge(invoice.status)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export function renderInvoiceDetail() {
  const invoice = invoiceById(state.route.id);
  if (!invoice) {
    renderInvoices();
    return;
  }
  els.title.textContent = invoice.invoice_no;
  els.subtitle.textContent = `${invoice.customer} · ${enumLabel(invoice.status)}`;
  const linkedPayments = (invoice.payment_ids || []).map((id) => paymentById(id)).filter(Boolean);
  const order = orderById(invoice.order_id || "");
  const orderDelta = order ? Number(invoice.amount || 0) - Number(order.amount || 0) : 0;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="metrics">
          <div class="metric"><span>${t("amount")}</span><strong>${money(invoice.amount, invoice.currency)}</strong></div>
          <div class="metric"><span>${t("paid")}</span><strong>${money(invoice.paid_amount, invoice.currency)}</strong></div>
          <div class="metric"><span>${t("outstanding")}</span><strong class="${Number(invoice.outstanding) > 0 ? "negative" : "positive"}">${money(invoice.outstanding, invoice.currency)}</strong></div>
          <div class="metric"><span>${t("daysOverdue")}</span><strong class="${invoice.days_overdue ? "negative" : ""}">${n(invoice.days_overdue)} ${t("days")}</strong></div>
        </div>
        <div class="overview-panel wide">
          <h2>${t("matchedPayments")}</h2>
          ${
            linkedPayments.length
              ? `
            <div class="table-wrap flush">
              <table class="mini">
                <thead>
                  <tr><th>${t("reference")}</th><th>${t("payer")}</th><th>${t("method")}</th><th>${t("paidDate")}</th><th class="num">${t("amount")}</th></tr>
                </thead>
                <tbody>
                  ${linkedPayments
                    .map(
                      (payment) => `
                    <tr>
                      <td class="strong">${escapeHtml(payment.payment_ref)}</td>
                      <td>${escapeHtml(payment.payer)}</td>
                      <td>${escapeHtml(enumLabel(payment.method, "method"))}</td>
                      <td>${date(payment.paid_date)}</td>
                      <td class="num">${money(payment.amount, payment.currency)}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : `<div class="empty">${t("none")}</div>`
          }
        </div>
        ${
          (invoice.anomaly_ids || []).length
            ? `
          <div class="overview-panel wide">
            <h2>${t("anomalies")}</h2>
            ${(invoice.anomaly_ids || [])
              .map((id) => anomalyById(id))
              .filter(Boolean)
              .map(
                (anomaly) => `
              <a class="health-row" href="#/anomalies/${encodeURIComponent(anomaly.id)}">
                <span><strong>${t("anomaly")} #${anomaly.ref} · ${escapeHtml(anomaly.title)}</strong><small>${escapeHtml(enumLabel(anomaly.rule, "rule"))}</small></span>
                <span class="num">${money(anomaly.amount_at_stake, anomaly.currency)}</span>
                ${statusBadge(anomaly.status)}
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("invoiceDetail")}</h2>
        <dl>
          <dt>${t("orderRef")}</dt><dd>${invoice.order_id ? `<a href="#/orders/${encodeURIComponent(invoice.order_id)}">${escapeHtml(invoice.order_no)}</a>` : t("none")}</dd>
          <dt>${t("customer")}</dt><dd>${escapeHtml(invoice.customer)}</dd>
          <dt>${t("issueDate")}</dt><dd>${date(invoice.issue_date)}</dd>
          <dt>${t("dueDate")}</dt><dd>${invoice.due_date ? date(invoice.due_date) : t("none")}</dd>
          ${order ? `<dt>${t("orderNo")} Δ</dt><dd class="${orderDelta ? "negative" : ""}">${money(orderDelta, invoice.currency)}</dd>` : ""}
          <dt>${t("status")}</dt><dd>${statusBadge(invoice.status)}</dd>
        </dl>
        ${invoice.notes ? `<h2 style="margin-top:14px">${t("notes")}</h2><p class="agent-notes">${escapeHtml(invoice.notes)}</p>` : ""}
      </aside>
    </section>
  `;
}

/* ---------- Anomalies ---------- */

const ANOMALY_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

function filteredAnomalies() {
  const query = state.query.trim().toLowerCase();
  return anomalies().filter((item) => {
    if (state.route.id && item.id !== state.route.id) return false;
    if (!state.route.id && state.anomalyFilter !== "all" && item.status !== state.anomalyFilter) return false;
    if (!query) return true;
    return [item.title, item.customer, item.rule, item.reason, String(item.ref)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function renderAnomalies() {
  els.title.textContent = t("anomalies");
  const all = anomalies();
  const items = filteredAnomalies();
  els.subtitle.textContent = `${all.filter((item) => item.status === "needs_review").length} ${t("needsReview")}`;
  const locked = Boolean(state.settings?.lock);
  const chips = state.route.id
    ? `<a class="chip" href="#/anomalies" title="${escapeHtml(t("showAll"))}">← ${escapeHtml(t("showAll"))} <b>${all.length}</b></a>`
    : ANOMALY_FILTERS.map((filter) => {
        const count = filter === "all" ? all.length : all.filter((item) => item.status === filter).length;
        const label = filter === "all" ? t("viewAll") : enumLabel(filter);
        return `<button type="button" class="chip ${state.anomalyFilter === filter ? "active" : ""}" data-anomaly-filter="${filter}" title="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`;
      }).join("");
  els.content.innerHTML = `
    ${locked ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    <div class="chip-row">${chips}</div>
    <div class="opp-list">
      ${items.map((item) => anomalyCard(item, locked)).join("") || `<div class="empty">${t("noAnomalies")}</div>`}
    </div>
  `;
}

function evidencePanel(evidence) {
  if (!evidence) return "";
  const rows = (evidence.rows || [])
    .map(
      (row) => `
    <div class="evidence-row">
      <span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail || "")}</small></span>
      <span class="num">${money(row.amount, row.currency)}</span>
    </div>
  `,
    )
    .join("");
  return `
    <div>
      <div class="opp-label">${t("evidence")}</div>
      <div class="evidence">
        ${rows}
        ${evidence.computed ? `<div class="evidence-computed">${escapeHtml(evidence.computed)}</div>` : ""}
      </div>
    </div>
  `;
}

function anomalyCard(item, locked) {
  const disabled = locked ? "disabled" : "";
  return `
    <article class="opp-card" data-anomaly-id="${escapeHtml(item.id)}">
      <header class="opp-head">
        <span class="opp-ref">${t("anomaly")} #${item.ref}</span>
        ${ruleBadge(item.rule)}
        ${severityBadge(item.severity)}
        ${statusBadge(item.status)}
        <span class="muted opp-customer">${escapeHtml(item.customer || "")}</span>
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      <div class="opp-stake">${money(item.amount_at_stake, item.currency)} <span class="muted">${t("atStake")}</span></div>
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      ${evidencePanel(item.evidence)}
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      <div class="opp-label">${t("proposedAction")}: <span class="badge">${escapeHtml(enumLabel(item.proposed_action, "operation"))}</span></div>
      <label class="opp-label" for="draft-${escapeHtml(item.id)}">${t("draft")}</label>
      <textarea id="draft-${escapeHtml(item.id)}" class="opp-draft" rows="7" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
      ${
        item.decision
          ? `
        <div class="opp-decision">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(decisionStatus(item.decision.action)))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        item.execution
          ? `
        <div class="opp-execution">
          <strong>${t("execution")}: ${escapeHtml(enumLabel(item.execution.operation, "operation"))} · ${escapeHtml(enumLabel(item.execution.status))}</strong>
          ${item.execution.detail ? `<span>${escapeHtml(item.execution.detail)}</span>` : ""}
        </div>
      `
          : ""
      }
      <label class="opp-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      <div class="opp-actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(item.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(item.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(item.id)}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(item.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
        <button type="button" data-decision="dismiss" data-id="${escapeHtml(item.id)}" title="${t("dismiss")}" ${disabled}>${t("dismiss")}</button>
      </div>
    </article>
  `;
}

function decisionStatus(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "dismiss") return "done";
  return "needs_review";
}

export async function submitDecision(id, action) {
  const note = document.querySelector(`#note-${cssEscape(id)}`)?.value || "";
  const draft = document.querySelector(`#draft-${cssEscape(id)}`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = { action, note, draft: draft ?? null, decided_at: new Date().toISOString() };
    render();
    return;
  }
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, action, note, draft }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    els.subtitle.textContent = body.error || `Decision failed: ${res.status}`;
    return;
  }
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  render();
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/* ---------- Settings ---------- */

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const rules = summary.rules || {};
  const env = summary.env || {};
  const importCfg = summary.import || {};
  const tableRow = (name, table) => `
    <div class="settings-account">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml((table?.format || "csv").toUpperCase())}</span>
      <span>${escapeHtml(
        Object.entries(table?.columns || {})
          .map(([key, value]) => `${key}←${value}`)
          .join(", ") || t("setupNeeded"),
      )}</span>
    </div>
  `;
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(summary.company?.name || "") || t("setupNeeded")}</dd>
          <dt>${t("contactEmail")}</dt><dd>${escapeHtml(summary.company?.contact_email || "") || "—"}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("rules")}</h2>
        <dl>
          <dt>${t("daysToInvoice")}</dt><dd>${escapeHtml(String(rules.days_to_invoice ?? 14))} ${t("days")}</dd>
          <dt>${t("tolerance")}</dt><dd>${escapeHtml(String(rules.amount_tolerance_pct ?? 1))}%</dd>
          <dt>${t("agingTitle")}</dt><dd>${escapeHtml((rules.aging_buckets || []).join(" / "))} ${t("days")}</dd>
          <dt>${t("duplicateWindow")}</dt><dd>${escapeHtml(String(rules.duplicate_window_days ?? 7))} ${t("days")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("importSources")}</h2>
        ${tableRow(t("orders"), importCfg.orders)}
        ${tableRow(t("invoices"), importCfg.invoices)}
        ${tableRow(t("payments"), importCfg.payments)}
      </section>
      <section>
        <h2>${t("envReadiness")}</h2>
        <dl>
          <dt><code>${escapeHtml(env.config_env || "KELLY_AUDIT_CONFIG")}</code></dt><dd>${env.config_env_set ? t("envReady") : t("envMissing")}</dd>
          <dt><code>${escapeHtml(env.env_file_env || "KELLY_AUDIT_ENV_FILE")}</code></dt><dd>${env.env_file_set ? t("envReady") : t("envMissing")}</dd>
        </dl>
      </section>
    </div>
  `;
}
