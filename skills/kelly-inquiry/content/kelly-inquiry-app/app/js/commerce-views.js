import {
  DETAIL_MODES,
  VIEW_HINT,
  approvalById,
  approvals,
  channelBadge,
  countryCell,
  dateOnly,
  dateTime,
  els,
  enumLabel,
  escapeHtml,
  flashNotice,
  inquiries,
  inquiryById,
  isFollowUpOverdue,
  isLocked,
  loadState,
  matchesQuery,
  money,
  pagerControl,
  pendingApprovalsFor,
  productById,
  products,
  quoteById,
  quotes,
  recordCountLabel,
  recordUrl,
  render,
  state,
  statusChip,
  t,
  waitingLabel,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const emptyState = (text) => `<div class="empty-inline">${escapeHtml(text)}</div>`;

/* ----- list filters ----- */

function filteredInquiries() {
  return inquiries().filter((item) =>
    matchesQuery([
      item.customer?.name,
      item.customer?.company,
      item.customer?.country,
      item.channel,
      item.stage,
      item.product_interest,
      item.owner,
      ...(item.messages || []).slice(-4).map((message) => message.text),
    ]),
  );
}

function filteredQuotes() {
  return quotes().filter((quote) =>
    matchesQuery([
      quote.quote_no,
      quote.customer,
      quote.status,
      quote.terms,
      ...(quote.items || []).map((item) => item.sku),
    ]),
  );
}

function filteredApprovals() {
  return approvals().filter((item) =>
    matchesQuery([item.text, item.reason, item.customer, item.channel, item.status, item.kind, `#${item.ref}`]),
  );
}

function filteredProducts() {
  return products().filter((product) => matchesQuery([product.name, product.sku, product.category]));
}

/* ----- tables (list panels) ----- */

const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function inquiriesTable(list) {
  return `
    <table class="ws-table inquiries-table">
      <thead>
        <tr>
          <th>${t("customer")}</th><th class="ws-col-narrow">${t("country")}</th><th class="ws-col-narrow">${t("channel")}</th><th class="ws-col-wide">${t("productInterest")}</th><th class="ws-col-narrow">${t("stage")}</th><th class="ws-col-num">${t("value")}</th><th class="ws-col-narrow">${t("lastMessage")}</th><th class="ws-col-narrow">${t("followUp")}</th><th class="ws-col-narrow">${t("owner")}</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (item) => `
          ${rowOpen(item.inquiry_id)}
            <td>
              <strong>${escapeHtml(item.customer?.name || "")}</strong>
              ${item.unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ""}
              <div class="muted">${escapeHtml(item.customer?.company || "")}</div>
            </td>
            <td>${countryCell(item.customer?.country)}</td>
            <td>${channelBadge(item.channel)}</td>
            <td class="interest">${escapeHtml(item.product_interest || "")}</td>
            <td>${statusChipFor(item.stage)}</td>
            <td class="ws-col-num">${money(item.value_estimate, item.currency)}</td>
            <td><span class="muted">${waitingLabel(item.last_message_at)}</span></td>
            <td>${item.next_follow_up ? `<span class="${isFollowUpOverdue(item) ? "overdue" : "muted"}">${dateOnly(item.next_follow_up)}${isFollowUpOverdue(item) ? ` · ${t("followUpOverdue")}` : ""}</span>` : "—"}</td>
            <td>${escapeHtml(item.owner || "")}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function statusChipFor(stage) {
  return `<span class="stage-chip ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

function quotesTable(list) {
  return `
    <table class="ws-table quotes-table">
      <thead>
        <tr>
          <th>${t("quotes")}</th><th class="ws-col-wide">${t("customer")}</th><th class="ws-col-narrow">${t("items")}</th><th class="ws-col-narrow">${t("currency")}</th><th class="ws-col-num">${t("total")}</th><th class="ws-col-narrow">${t("issueDate")}</th><th class="ws-col-narrow">${t("validity")}</th><th class="ws-col-narrow">${t("status")}</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (quote) => `
          ${rowOpen(quote.quote_id)}
            <td><strong>${escapeHtml(quote.quote_no)}</strong></td>
            <td class="interest">${escapeHtml(quote.customer || "")}</td>
            <td>${(quote.items || []).length}</td>
            <td>${escapeHtml(quote.currency)}</td>
            <td class="ws-col-num">${money(quote.total, quote.currency)}</td>
            <td>${dateOnly(quote.issue_date)}</td>
            <td>${dateOnly(quote.valid_until)}</td>
            <td>${statusChip(quote.status)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Split mode defaults to the first two columns; the rest live in the detail
// pane on the right, so the queue list stays a quick scan of ref + status.
function approvalsTable(list) {
  return `
    <table class="ws-table approvals-table">
      <thead>
        <tr><th>${t("approvals")}</th><th class="ws-col-narrow">${t("status")}</th></tr>
      </thead>
      <tbody>
        ${list
          .map((item) => {
            const title = `${enumLabel(item.kind, "kind")} #${item.ref} · ${item.customer || item.inquiry_id}`;
            return `
          ${rowOpen(item.item_id)}
            <td><strong>${escapeHtml(title)}</strong> ${channelBadge(item.channel)}</td>
            <td>${statusChip(item.status)}</td>
          </tr>
        `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function productsTable(list) {
  return `
    <table class="ws-table products-table">
      <thead>
        <tr>
          <th>${t("products")}</th><th class="ws-col-narrow">${t("moq")}</th><th class="ws-col-wide">${t("priceRange")}</th><th class="ws-col-narrow">${t("leadTime")}</th><th class="ws-col-narrow">${t("faq")}</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (product) => `
          ${rowOpen(product.product_id)}
            <td><strong>${escapeHtml(product.name)}</strong><div class="muted">${escapeHtml(product.sku)} · ${escapeHtml(product.category || "")}</div></td>
            <td class="ws-col-num">${product.moq}</td>
            <td>${money(product.price_min, product.currency)} – ${money(product.price_max, product.currency)}</td>
            <td class="ws-col-num">${product.lead_time_days} ${t("days")}</td>
            <td class="ws-col-num">${(product.faq || []).length}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* ----- detail bodies ----- */

function inquiryDetailBody(inquiry) {
  const pending = pendingApprovalsFor(inquiry.inquiry_id);
  const draft = state.drafts[inquiry.inquiry_id];
  const prefill =
    draft !== undefined ? draft : !pending.length && inquiry.suggested_reply ? inquiry.suggested_reply : "";
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(inquiry.suggested_reply);
  const locked = isLocked();
  const linkedQuotes = (inquiry.quote_ids || []).map((id) => quoteById(id)).filter(Boolean);
  const linkedProducts = (inquiry.product_ids || []).map((id) => productById(id)).filter(Boolean);
  const followUpValue =
    state.followUps[inquiry.inquiry_id] !== undefined
      ? state.followUps[inquiry.inquiry_id]
      : inquiry.next_follow_up || "";
  return `
    <header class="detail-head">
      <h2>${escapeHtml(inquiry.customer?.name || inquiry.inquiry_id)}</h2>
      <p class="muted">${escapeHtml(
        [inquiry.customer?.company, enumLabel(inquiry.channel, "channel"), enumLabel(inquiry.stage, "stage")]
          .filter(Boolean)
          .join(" · "),
      )}</p>
    </header>
    <section class="detail" data-inquiry="${escapeHtml(inquiry.inquiry_id)}">
      <div class="detail-main conv-detail">
        <div class="transcript">
          ${(inquiry.messages || [])
            .map(
              (message) => `
            <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
              <div class="bubble">
                <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
                <div class="bubble-text">${escapeHtml(message.text)}</div>
                ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
              </div>
            </div>
          `,
            )
            .join("")}
          ${pending
            .map(
              (item) => `
            <div class="bubble-row out">
              <div class="bubble queued-bubble">
                <div class="bubble-meta">
                  <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
                  <span class="status-chip ${escapeHtml(item.status)}">${t("queued")} · ${escapeHtml(enumLabel(item.status))}</span>
                </div>
                <div class="bubble-text">${escapeHtml(item.text)}</div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="composer">
          ${showSuggestedNote ? `<div class="composer-hint">${t("agentSuggestedPrefill")}</div>` : ""}
          <textarea id="composer-text" rows="4" placeholder="${escapeHtml(t("replyPlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(prefill)}</textarea>
          <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[inquiry.inquiry_id] || "")}" ${locked ? "disabled" : ""}>
          <div class="composer-actions">
            <div class="follow-up-field">
              <label for="follow-up-date">${t("followUp")}</label>
              <input id="follow-up-date" type="date" value="${escapeHtml(followUpValue)}" ${locked ? "disabled" : ""}>
              <button type="button" data-action="save-follow-up" data-inquiry="${escapeHtml(inquiry.inquiry_id)}" ${locked ? "disabled" : ""}>${t("saveFollowUp")}</button>
            </div>
            <button type="button" class="primary" data-action="queue-reply" data-inquiry="${escapeHtml(inquiry.inquiry_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("customer")}</h2>
        <dl>
          <dt>${t("company")}</dt><dd>${escapeHtml(inquiry.customer?.company || "")}</dd>
          <dt>${t("country")}</dt><dd>${countryCell(inquiry.customer?.country)}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(inquiry.customer?.source || "")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(inquiry.channel)}</dd>
          <dt>${t("stage")}</dt><dd>${statusChipFor(inquiry.stage)}</dd>
          <dt>${t("value")}</dt><dd>${money(inquiry.value_estimate, inquiry.currency)}</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(inquiry.owner || "")}</dd>
          <dt>${t("followUp")}</dt><dd>${inquiry.next_follow_up ? `${dateOnly(inquiry.next_follow_up)}${isFollowUpOverdue(inquiry) ? ` <span class="overdue">· ${t("followUpOverdue")}</span>` : ""}` : "—"}</dd>
        </dl>
        <h2>${t("linkedProducts")}</h2>
        ${
          linkedProducts.length
            ? linkedProducts
                .map(
                  (product) => `
          <a class="side-row" href="${recordUrl(product.product_id, "products")}">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="muted">${escapeHtml(product.sku)} · ${t("moq")} ${product.moq} · ${money(product.price_min, product.currency)}–${money(product.price_max, product.currency)}</span>
          </a>
        `,
                )
                .join("")
            : emptyState("—")
        }
        <h2>${t("quoteHistory")}</h2>
        ${
          linkedQuotes.length
            ? linkedQuotes
                .map(
                  (quote) => `
          <a class="side-row" href="${recordUrl(quote.quote_id, "quotes")}">
            <strong>${escapeHtml(quote.quote_no)} ${statusChip(quote.status)}</strong>
            <span class="muted">${money(quote.total, quote.currency)} · ${t("validity")} ${dateOnly(quote.valid_until)}</span>
          </a>
        `,
                )
                .join("")
            : emptyState("—")
        }
      </aside>
    </section>
  `;
}

function quoteGuardHtml(quote) {
  const alerts = quote.pricing_alerts || [];
  if (!alerts.length) return `<div class="guard ok">${t("minPriceGuard")}: ${t("guardOk")}</div>`;
  return `<div class="guard tripped">${t("minPriceGuard")}: ${alerts.map((alert) => escapeHtml(alert.message)).join(" ")}</div>`;
}

function quoteDetailBody(quote) {
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
        <td><strong>${escapeHtml(line.sku)}</strong>${product ? `<div class="muted"><a href="${recordUrl(product.product_id, "products")}">${escapeHtml(product.name)}</a></div>` : ""}</td>
        <td class="interest">${escapeHtml(line.description || "")}</td>
        <td class="num">${
          editable
            ? `<input class="line-input" type="number" min="0" step="1" value="${qty}" data-quote="${escapeHtml(quote.quote_id)}" data-line="${escapeHtml(line.line_id)}" data-field="qty">`
            : qty
        }</td>
        <td class="num">${
          editable
            ? `<input class="line-input" type="number" min="0" step="0.01" value="${unit}" data-quote="${escapeHtml(quote.quote_id)}" data-line="${escapeHtml(line.line_id)}" data-field="unit_price">`
            : money(unit, quote.currency)
        }
          ${below ? `<div class="overdue guard-inline">${t("guardTripped")} (${money(product.price_min, quote.currency)})</div>` : ""}
        </td>
        <td class="num">${money(total, quote.currency)}</td>
      </tr>
    `;
    })
    .join("");
  return `
    <header class="detail-head">
      <h2>${escapeHtml(quote.quote_no)}</h2>
      <p class="muted">${escapeHtml(quote.customer || "")} · ${escapeHtml(enumLabel(quote.status))}</p>
    </header>
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
              <input id="quote-validity" type="date" data-quote="${escapeHtml(quote.quote_id)}" value="${escapeHtml(edits.valid_until !== undefined ? edits.valid_until : quote.valid_until || "")}">
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
          <dt>${t("linkedInquiry")}</dt><dd>${inquiry ? `<a href="${recordUrl(inquiry.inquiry_id, "inquiries")}">${escapeHtml(inquiry.customer?.name || inquiry.inquiry_id)}</a>` : "—"}</dd>
        </dl>
        <h2>${t("terms")}</h2>
        <p class="side-text">${escapeHtml(quote.terms || "—")}</p>
        <h2>${t("pricingNotes")}</h2>
        <p class="side-text">${escapeHtml(quote.pricing_notes || "—")}</p>
      </aside>
    </section>
  `;
}

function approvalDetailBody(item) {
  const locked = isLocked();
  const editable = item.status !== "done";
  const value = state.edits[item.item_id] !== undefined ? state.edits[item.item_id] : item.text;
  const quote = item.quote_id ? quoteById(item.quote_id) : null;
  return `
    <article class="approval-card" data-item-card="${escapeHtml(item.item_id)}">
      <header class="approval-head">
        <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
        ${statusChip(item.status)}
        ${channelBadge(item.channel)}
        <a class="approval-target" href="${recordUrl(item.inquiry_id, "inquiries")}">${escapeHtml(item.customer || item.inquiry_id)}</a>
        ${quote ? `<a class="badge" href="${recordUrl(quote.quote_id, "quotes")}">${escapeHtml(quote.quote_no)}</a>` : ""}
        <small class="muted">${dateTime(item.created_at)}</small>
      </header>
      ${item.reason ? `<div class="approval-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</div>` : ""}
      ${item.note ? `<div class="approval-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(item.note)}</div>` : ""}
      ${
        editable
          ? `<textarea class="approval-text" data-item-text rows="6" ${locked ? "disabled" : ""}>${escapeHtml(value)}</textarea>`
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
}

function productDetailBody(product) {
  const relatedInquiries = inquiries().filter((item) => (item.product_ids || []).includes(product.product_id));
  return `
    <header class="detail-head">
      <h2>${escapeHtml(product.name)}</h2>
      <p class="muted">${escapeHtml(product.sku)} · ${escapeHtml(product.category || "")}</p>
    </header>
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
              .join("") || emptyState("—")
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
          <a class="side-row" href="${recordUrl(item.inquiry_id, "inquiries")}">
            <strong>${escapeHtml(item.customer?.name || "")}</strong>
            <span class="muted">${escapeHtml(item.customer?.company || "")} · ${escapeHtml(enumLabel(item.stage, "stage"))}</span>
          </a>
        `,
                )
                .join("")
            : emptyState("—")
        }
      </aside>
    </section>
  `;
}

/* ----- record view dispatcher ----- */

const LIST_BUILDERS = {
  inquiries: { items: filteredInquiries, table: inquiriesTable, byId: inquiryById, idField: "inquiry_id" },
  quotes: { items: filteredQuotes, table: quotesTable, byId: quoteById, idField: "quote_id" },
  approvals: { items: filteredApprovals, table: approvalsTable, byId: approvalById, idField: "item_id" },
  products: { items: filteredProducts, table: productsTable, byId: productById, idField: "product_id" },
};

const DETAIL_BUILDERS = {
  inquiries: inquiryDetailBody,
  quotes: quoteDetailBody,
  approvals: approvalDetailBody,
  products: productDetailBody,
};

export function renderRecordView() {
  const { view } = state.route;
  const builder = LIST_BUILDERS[view];
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const list = builder.items();
  els.viewCount.textContent = recordCountLabel(view, list.length, Boolean(state.route.query));
  els.listPanel.innerHTML = `${
    list.length ? builder.table(list) : emptyState(view === "approvals" ? t("noApprovals") : t("empty"))
  }${pagerControl(view)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = `#/${view}/${encodeURIComponent(selectedId)}`;
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectApproval")) : "";
    return;
  }
  const item = LIST_BUILDERS[view].byId(selectedId);
  if (!item) {
    els.detailBody.innerHTML = emptyState(t("empty"));
    return;
  }
  els.detailBody.innerHTML = DETAIL_BUILDERS[view](item);
}

/* ----- settings ----- */

export function renderSettings() {
  els.settingsTitle.title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  const guard = summary.quote_defaults?.min_price_guard;
  const sla = summary.follow_up?.sla_days;
  els.settingsContent.innerHTML = `
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
            .join("") || emptyState(t("setupNeeded"))
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
            : emptyState("—")
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

async function queueReplyAction(inquiryId) {
  const text = String(
    state.drafts[inquiryId] !== undefined
      ? state.drafts[inquiryId]
      : els.detailBody.querySelector("#composer-text")?.value || "",
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
  try {
    const provider = await getProvider();
    await provider.queueReply({ inquiry_id: inquiryId, text, note, suggested_by: "human" });
  } catch (error) {
    flashNotice(error.message || "Queue failed");
    return;
  }
  delete state.drafts[inquiryId];
  delete state.notes[inquiryId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

async function decideAction(itemId, action, card) {
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
  try {
    const provider = await getProvider();
    await provider.decideApproval({ item_id: itemId, action, comment, text });
  } catch (error) {
    flashNotice(error.message || "Decision failed");
    return;
  }
  delete state.edits[itemId];
  await loadState();
}

async function saveFollowUpAction(inquiryId) {
  const value = String(els.detailBody.querySelector("#follow-up-date")?.value || "");
  if (state.settings?.demo) {
    const inquiry = inquiryById(inquiryId);
    if (inquiry) inquiry.next_follow_up = value;
    delete state.followUps[inquiryId];
    flashNotice(`${t("followUpSaved")} ${t("demoNotice")}`);
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.setFollowUp({ inquiry_id: inquiryId, next_follow_up: value });
  } catch (error) {
    flashNotice(error.message || "Save failed");
    return;
  }
  delete state.followUps[inquiryId];
  flashNotice(t("followUpSaved"));
  await loadState();
}

async function saveQuoteAction(quoteId) {
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
  try {
    const provider = await getProvider();
    await provider.updateQuote(payload);
  } catch (error) {
    flashNotice(error.message || "Save failed");
    return;
  }
  delete state.quoteEdits[quoteId];
  flashNotice(t("quoteSaved"));
  await loadState();
}

function editQuoteLine(input) {
  const quoteId = input.dataset.quote;
  const quote = quoteById(quoteId);
  if (!quote) return;
  const entry = state.quoteEdits[quoteId] || (state.quoteEdits[quoteId] = { lines: {} });
  const line = entry.lines[input.dataset.line] || (entry.lines[input.dataset.line] = {});
  line[input.dataset.field] = input.value;
  const totalEl = els.detailBody.querySelector("#quote-live-total");
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
}

function editQuoteValidity(input) {
  const quoteId = input.dataset.quote;
  const entry = state.quoteEdits[quoteId] || (state.quoteEdits[quoteId] = { lines: {} });
  entry.valid_until = input.value;
}

// Grouped so app.js's single delegated click/input listener can dispatch by
// data-action without importing each function by name.
export const submitDecision = {
  queueReply: queueReplyAction,
  saveFollowUp: saveFollowUpAction,
  saveQuote: saveQuoteAction,
  decide: decideAction,
  editQuoteLine,
  editQuoteValidity,
};
