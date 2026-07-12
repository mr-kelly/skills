import {
  approvals,
  channelBadge,
  dateOnly,
  dateTime,
  els,
  enumLabel,
  escapeHtml,
  flashNotice,
  inquiries,
  inquiryById,
  isLocked,
  loadState,
  matchesQuery,
  money,
  productById,
  products,
  quoteById,
  quotes,
  render,
  state,
  statusChip,
  t,
} from "../app.js";
/* ----- quotes ----- */

export function renderQuotes() {
  els.title.textContent = t("quotes");
  const list = quotes().filter((quote) =>
    matchesQuery([
      quote.quote_no,
      quote.customer,
      quote.status,
      quote.terms,
      ...(quote.items || []).map((item) => item.sku),
    ]),
  );
  els.subtitle.textContent = `${list.length} ${t("quoteCount")} · ${state.snapshot?.metrics?.quotes_sent || 0} ${t("quotesSent").toLowerCase()}`;
  els.content.innerHTML = list.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("quotes")}</th><th>${t("customer")}</th><th>${t("items")}</th><th>${t("currency")}</th><th class="num">${t("total")}</th><th>${t("issueDate")}</th><th>${t("validity")}</th><th>${t("status")}</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (quote) => `
            <tr class="row-link" data-href="#/quotes/${encodeURIComponent(quote.quote_id)}">
              <td><a href="#/quotes/${encodeURIComponent(quote.quote_id)}"><strong>${escapeHtml(quote.quote_no)}</strong></a></td>
              <td class="interest">${escapeHtml(quote.customer || "")}</td>
              <td>${(quote.items || []).length}</td>
              <td>${escapeHtml(quote.currency)}</td>
              <td class="num">${money(quote.total, quote.currency)}</td>
              <td>${dateOnly(quote.issue_date)}</td>
              <td>${dateOnly(quote.valid_until)}</td>
              <td>${statusChip(quote.status)}</td>
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

function quoteGuardHtml(quote) {
  const alerts = quote.pricing_alerts || [];
  if (!alerts.length) return `<div class="guard ok">${t("minPriceGuard")}: ${t("guardOk")}</div>`;
  return `<div class="guard tripped">${t("minPriceGuard")}: ${alerts.map((alert) => escapeHtml(alert.message)).join(" ")}</div>`;
}

export function renderQuoteDetail() {
  const quote = quoteById(state.route.id);
  if (!quote) {
    renderQuotes();
    return;
  }
  els.title.textContent = quote.quote_no;
  els.subtitle.textContent = `${quote.customer || ""} · ${enumLabel(quote.status)}`;
  const locked = isLocked();
  const editable = quote.status === "draft" && !locked;
  const edits = state.quoteEdits[quote.quote_id] || { lines: {} };
  const inquiry = inquiryById(quote.inquiry_id);
  const productsById = new Map(products().map((product) => [product.product_id, product]));
  let liveSubtotal = 0;
  const rows = (quote.items || [])
    .map((line) => {
      const patch = edits.lines[line.line_id] || {};
      const qty = patch.qty !== undefined ? Number(patch.qty) : line.qty;
      const unit = patch.unit_price !== undefined ? Number(patch.unit_price) : line.unit_price;
      const total = (Number(qty) || 0) * (Number(unit) || 0);
      liveSubtotal += total;
      const product = productsById.get(line.product_id);
      const below = product && typeof product.price_min === "number" && Number(unit) < product.price_min;
      return `
      <tr>
        <td><strong>${escapeHtml(line.sku)}</strong>${product ? `<div class="muted"><a href="#/products/${encodeURIComponent(product.product_id)}">${escapeHtml(product.name)}</a></div>` : ""}</td>
        <td class="interest">${escapeHtml(line.description || "")}</td>
        <td class="num">${
          editable
            ? `<input class="line-input" type="number" min="0" step="1" value="${qty}" data-line="${escapeHtml(line.line_id)}" data-field="qty">`
            : qty
        }</td>
        <td class="num">${
          editable
            ? `<input class="line-input" type="number" min="0" step="0.01" value="${unit}" data-line="${escapeHtml(line.line_id)}" data-field="unit_price">`
            : money(unit, quote.currency)
        }
          ${below ? `<div class="overdue guard-inline">${t("guardTripped")} (${money(product.price_min, quote.currency)})</div>` : ""}
        </td>
        <td class="num">${money(total, quote.currency)}</td>
      </tr>
    `;
    })
    .join("");
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="quotes">← ${t("backToQuotes")}</button>
    <section class="detail">
      <div class="detail-main">
        ${editable ? `<div class="composer-hint">${t("quoteEditHint")}</div>` : `<div class="muted quote-lock-hint">${quote.status === "draft" ? "" : t("quoteReadOnly")}</div>`}
        <div class="table-wrap quote-items">
          <table>
            <thead>
              <tr><th>${t("sku")}</th><th>${t("description")}</th><th class="num">${t("qty")}</th><th class="num">${t("unitPrice")}</th><th class="num">${t("total")}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr><td colspan="4" class="num"><strong>${t("total")}</strong></td><td class="num"><strong id="quote-live-total">${money(liveSubtotal, quote.currency)}</strong></td></tr>
            </tfoot>
          </table>
        </div>
        ${quoteGuardHtml(quote)}
        ${
          editable
            ? `
          <div class="composer-actions">
            <div class="follow-up-field">
              <label for="quote-validity">${t("validity")}</label>
              <input id="quote-validity" type="date" value="${escapeHtml(edits.valid_until !== undefined ? edits.valid_until : quote.valid_until || "")}">
            </div>
            <button type="button" class="primary" data-action="save-quote" data-quote="${escapeHtml(quote.quote_id)}">${t("saveQuote")}</button>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("quoteDetail")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusChip(quote.status)}</dd>
          <dt>${t("customer")}</dt><dd>${escapeHtml(quote.customer || "")}</dd>
          <dt>${t("issueDate")}</dt><dd>${dateOnly(quote.issue_date)}</dd>
          <dt>${t("validity")}</dt><dd>${dateOnly(quote.valid_until)}</dd>
          <dt>${t("subtotal")}</dt><dd>${money(quote.subtotal, quote.currency)}</dd>
          <dt>${t("total")}</dt><dd>${money(quote.total, quote.currency)}</dd>
          <dt>${t("linkedInquiry")}</dt><dd>${inquiry ? `<a href="#/inquiries/${encodeURIComponent(inquiry.inquiry_id)}">${escapeHtml(inquiry.customer?.name || inquiry.inquiry_id)}</a>` : "—"}</dd>
        </dl>
        <h2>${t("terms")}</h2>
        <p class="side-text">${escapeHtml(quote.terms || "—")}</p>
        <h2>${t("pricingNotes")}</h2>
        <p class="side-text">${escapeHtml(quote.pricing_notes || "—")}</p>
      </aside>
    </section>
  `;
  els.content.querySelectorAll(".line-input").forEach((input) => {
    input.addEventListener("input", () => {
      const entry = state.quoteEdits[quote.quote_id] || (state.quoteEdits[quote.quote_id] = { lines: {} });
      const line = entry.lines[input.dataset.line] || (entry.lines[input.dataset.line] = {});
      line[input.dataset.field] = input.value;
      const totalEl = els.content.querySelector("#quote-live-total");
      if (totalEl) {
        let subtotal = 0;
        for (const item of quote.items || []) {
          const patch = entry.lines[item.line_id] || {};
          const qty = patch.qty !== undefined ? Number(patch.qty) : item.qty;
          const unit = patch.unit_price !== undefined ? Number(patch.unit_price) : item.unit_price;
          subtotal += (Number(qty) || 0) * (Number(unit) || 0);
        }
        totalEl.textContent = money(subtotal, quote.currency);
      }
    });
  });
  const validity = els.content.querySelector("#quote-validity");
  validity?.addEventListener("input", () => {
    const entry = state.quoteEdits[quote.quote_id] || (state.quoteEdits[quote.quote_id] = { lines: {} });
    entry.valid_until = validity.value;
  });
}

/* ----- approvals ----- */

export function renderApprovals() {
  els.title.textContent = t("approvals");
  const list = approvals().filter((item) =>
    matchesQuery([item.text, item.reason, item.customer, item.channel, item.status, item.kind, `#${item.ref}`]),
  );
  const needsReview = approvals().filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${approvals().length} · ${needsReview} ${enumLabel("needs_review")}`;
  const locked = isLocked();
  els.content.innerHTML = list.length
    ? `
    <div class="approval-list">
      ${list
        .map((item) => {
          const editable = item.status !== "done";
          const value = state.edits[item.item_id] !== undefined ? state.edits[item.item_id] : item.text;
          const quote = item.quote_id ? quoteById(item.quote_id) : null;
          return `
          <article class="approval-card" data-item-card="${escapeHtml(item.item_id)}">
            <header class="approval-head">
              <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
              ${statusChip(item.status)}
              ${channelBadge(item.channel)}
              <a class="approval-target" href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">${escapeHtml(item.customer || item.inquiry_id)}</a>
              ${quote ? `<a class="badge" href="#/quotes/${encodeURIComponent(quote.quote_id)}">${escapeHtml(quote.quote_no)}</a>` : ""}
              <small class="muted">${dateTime(item.created_at)}</small>
            </header>
            ${item.reason ? `<div class="approval-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</div>` : ""}
            ${item.note ? `<div class="approval-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(item.note)}</div>` : ""}
            ${
              editable
                ? `<textarea class="approval-text" data-item-text rows="4" ${locked ? "disabled" : ""}>${escapeHtml(value)}</textarea>`
                : `<div class="approval-sent-text">${escapeHtml(item.text)}</div>`
            }
            ${item.decision?.comment ? `<div class="approval-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(item.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(item.decision.decided_at)})</small></div>` : ""}
            ${item.status === "approved" ? `<div class="approval-waiting">${t("waitingForSend")}</div>` : ""}
            ${item.execution ? `<div class="approval-execution">${t("sentVia")} ${escapeHtml(enumLabel(item.execution.connector, "connector"))} · ${t("target")} ${escapeHtml(item.execution.target || "")} · ${escapeHtml(enumLabel(item.execution.status))} ${item.execution.executed_at ? `· ${dateTime(item.execution.executed_at)}` : ""}</div>` : ""}
            ${
              editable
                ? `
              <div class="approval-actions">
                <input type="text" data-item-comment placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
                <div class="approval-buttons">
                  <button type="button" class="primary" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                  <button type="button" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                  <button type="button" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="revise" ${locked ? "disabled" : ""}>${t("saveEdit")}</button>
                  <button type="button" class="danger" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
                </div>
              </div>
            `
                : ""
            }
          </article>
        `;
        })
        .join("")}
    </div>
  `
    : `<div class="empty">${t("noApprovals")}</div>`;
  els.content.querySelectorAll("[data-item-text]").forEach((textarea) => {
    const card = textarea.closest("[data-item-card]");
    textarea.addEventListener("input", () => {
      state.edits[card.dataset.itemCard] = textarea.value;
    });
  });
}

/* ----- products ----- */

export function renderProducts() {
  els.title.textContent = t("products");
  const list = products().filter((product) => matchesQuery([product.name, product.sku, product.category]));
  els.subtitle.textContent = `${list.length} ${t("productCount")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="product-grid">
      ${list
        .map(
          (product) => `
        <a class="product-card" href="#/products/${encodeURIComponent(product.product_id)}">
          <div class="row between">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="badge">${escapeHtml(product.sku)}</span>
          </div>
          <div class="muted">${escapeHtml(product.category || "")}</div>
          <dl class="product-meta">
            <dt>${t("moq")}</dt><dd>${product.moq}</dd>
            <dt>${t("priceRange")}</dt><dd>${money(product.price_min, product.currency)} – ${money(product.price_max, product.currency)}</dd>
            <dt>${t("leadTime")}</dt><dd>${product.lead_time_days} ${t("days")}</dd>
            <dt>${t("faq")}</dt><dd>${(product.faq || []).length} ${t("faqCount")}</dd>
          </dl>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export function renderProductDetail() {
  const product = productById(state.route.id);
  if (!product) {
    renderProducts();
    return;
  }
  els.title.textContent = product.name;
  els.subtitle.textContent = `${product.sku} · ${product.category || ""}`;
  const relatedInquiries = inquiries().filter((item) => (item.product_ids || []).includes(product.product_id));
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="products">← ${t("backToProducts")}</button>
    <section class="detail">
      <div class="detail-main">
        <div class="metrics kpis">
          <div class="metric"><span>${t("moq")}</span><strong>${product.moq}</strong></div>
          <div class="metric"><span>${t("priceRange")}</span><strong>${money(product.price_min, product.currency)} – ${money(product.price_max, product.currency)}</strong></div>
          <div class="metric"><span>${t("leadTime")}</span><strong>${product.lead_time_days} ${t("days")}</strong></div>
          <div class="metric"><span>${t("faq")}</span><strong>${(product.faq || []).length}</strong></div>
        </div>
        <div class="overview-panel faq-panel">
          <h2>${t("faq")}</h2>
          ${
            (product.faq || [])
              .map(
                (entry) => `
            <div class="faq-row">
              <strong>${escapeHtml(entry.q)}</strong>
              <p>${escapeHtml(entry.a)}</p>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">—</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("specs")}</h2>
        <dl>
          ${Object.entries(product.specs || {})
            .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
            .join("")}
        </dl>
        <h2>${t("inquiries")}</h2>
        ${
          relatedInquiries.length
            ? relatedInquiries
                .map(
                  (item) => `
          <a class="side-row" href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">
            <strong>${escapeHtml(item.customer?.name || "")}</strong>
            <span class="muted">${escapeHtml(item.customer?.company || "")} · ${escapeHtml(enumLabel(item.stage, "stage"))}</span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </aside>
    </section>
  `;
}

/* ----- settings ----- */

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  const guard = summary.quote_defaults?.min_price_guard;
  const sla = summary.follow_up?.sla_days;
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("productKb")}</dt><dd>${escapeHtml(summary.product_kb?.source_path || "—")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("quoteDefaults")}</h2>
        <dl>
          <dt>${t("currency")}</dt><dd>${escapeHtml(summary.quote_defaults?.currency || "—")}</dd>
          <dt>${t("validityDays")}</dt><dd>${escapeHtml(String(summary.quote_defaults?.validity_days ?? "—"))}</dd>
          <dt>${t("terms")}</dt><dd>${escapeHtml([summary.quote_defaults?.incoterm, summary.quote_defaults?.payment_terms].filter(Boolean).join(" · ") || "—")}</dd>
          <dt>${t("minPriceGuard")}</dt><dd>${guard ? (guard.enabled ? t("on") : t("off")) : "—"}</dd>
          <dt>${t("followUpSla")}</dt><dd>${
            sla
              ? Object.entries(sla)
                  .map(([stage, days]) => `${enumLabel(stage, "stage")}: ${days} ${t("days")}`)
                  .join(" · ")
              : "—"
          }</dd>
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.channel, "channel"))} · ${escapeHtml(enumLabel(account.connector, "connector"))} ${account.handle ? `· ${escapeHtml(account.handle)}` : ""}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog.length
            ? syncLog
                .slice(-8)
                .reverse()
                .map(
                  (entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </section>
      ${
        report
          ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || [])
            .map(
              (result) => `
            <div class="settings-account">
              <strong>${escapeHtml(enumLabel(result.kind || "reply", "kind"))} #${result.ref}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.connector, "connector"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
    </div>
  `;
}

/* ----- actions ----- */

export async function queueReplyAction(inquiryId) {
  const text = String(
    state.drafts[inquiryId] !== undefined
      ? state.drafts[inquiryId]
      : els.content.querySelector("#composer-text")?.value || "",
  ).trim();
  const note = String(state.notes[inquiryId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const inquiry = inquiryById(inquiryId);
    state.demoRef += 1;
    state.snapshot.approvals.push({
      item_id: `approval-demo-local-${state.demoRef}`,
      ref: approvals().reduce((max, item) => Math.max(max, item.ref || 0), 0) + 1,
      kind: "reply",
      inquiry_id: inquiryId,
      quote_id: "",
      account_id: inquiry?.account_id || "",
      channel: inquiry?.channel || "",
      customer: [inquiry?.customer?.name, inquiry?.customer?.company].filter(Boolean).join(" · "),
      text,
      note,
      reason: "Queued from the inquiry composer.",
      suggested_by: "human",
      status: "needs_review",
      decision: null,
      execution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    delete state.drafts[inquiryId];
    delete state.notes[inquiryId];
    flashNotice(`${t("queuedNotice")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/approvals/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inquiry_id: inquiryId, text, note }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Queue failed: ${res.status}`);
    return;
  }
  delete state.drafts[inquiryId];
  delete state.notes[inquiryId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

export async function decideAction(itemId, action, card) {
  const comment = String(card?.querySelector("[data-item-comment]")?.value || "").trim();
  const text = state.edits[itemId];
  if (state.settings?.demo) {
    const item = approvals().find((entry) => entry.item_id === itemId);
    if (!item) return;
    if (typeof text === "string" && text.trim()) item.text = text.trim();
    if (action === "approve") item.status = "approved";
    else if (action === "request_changes") item.status = "changes_requested";
    else if (action === "block") item.status = "blocked";
    item.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.edits[itemId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  const res = await fetch("/api/approvals/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item_id: itemId, action, comment, text }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Decision failed: ${res.status}`);
    return;
  }
  delete state.edits[itemId];
  await loadState();
}

export async function saveFollowUpAction(inquiryId) {
  const value = String(els.content.querySelector("#follow-up-date")?.value || "");
  if (state.settings?.demo) {
    const inquiry = inquiryById(inquiryId);
    if (inquiry) inquiry.next_follow_up = value;
    delete state.followUps[inquiryId];
    flashNotice(`${t("followUpSaved")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/inquiries/followup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inquiry_id: inquiryId, next_follow_up: value }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.followUps[inquiryId];
  flashNotice(t("followUpSaved"));
  await loadState();
}

export async function saveQuoteAction(quoteId) {
  const entry = state.quoteEdits[quoteId] || { lines: {} };
  const items = Object.entries(entry.lines).map(([line_id, patch]) => ({ line_id, ...patch }));
  const payload = { quote_id: quoteId, items };
  if (entry.valid_until !== undefined) payload.valid_until = entry.valid_until;
  if (state.settings?.demo) {
    const quote = quoteById(quoteId);
    if (quote) {
      for (const patch of items) {
        const line = (quote.items || []).find((item) => item.line_id === patch.line_id);
        if (!line) continue;
        if (patch.qty !== undefined) line.qty = Number(patch.qty) || 0;
        if (patch.unit_price !== undefined) line.unit_price = Number(patch.unit_price) || 0;
        line.total = Number((line.qty * line.unit_price).toFixed(2));
      }
      if (entry.valid_until !== undefined && entry.valid_until) quote.valid_until = entry.valid_until;
      quote.subtotal = Number((quote.items || []).reduce((sum, item) => sum + item.total, 0).toFixed(2));
      quote.total = quote.subtotal;
      quote.pricing_alerts = [];
      const productsById = new Map(products().map((product) => [product.product_id, product]));
      for (const line of quote.items || []) {
        const product = productsById.get(line.product_id);
        if (product && typeof product.price_min === "number" && line.unit_price < product.price_min) {
          quote.pricing_alerts.push({
            product_id: product.product_id,
            sku: product.sku,
            unit_price: line.unit_price,
            price_min: product.price_min,
            message: `${product.sku}: unit price ${line.unit_price} is below the KB floor ${product.price_min}.`,
          });
        }
      }
    }
    delete state.quoteEdits[quoteId];
    flashNotice(`${t("quoteSaved")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/quotes/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.quoteEdits[quoteId];
  flashNotice(t("quoteSaved"));
  await loadState();
}
