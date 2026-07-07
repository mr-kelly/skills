const messages = window.KELLY_INVOICE_SHEET_MESSAGES || {};

const state = {
  data: null,
  view: "all",
  selectedId: "",
  settingsOpen: false,
  sidebarOpen: false,
  mobileDetailOpen: false,
  uploadOpen: true,
  lang: localStorage.getItem("kelly-invoice-sheet-lang") || "auto",
  accent: localStorage.getItem("kelly-invoice-sheet-accent") || "green",
};

const accents = {
  blue: ["#0a84ff", "#0067d6", "#e8f2ff", "#c7ddff", "#0057b8", "#fff"],
  purple: ["#8e8cff", "#6b5de6", "#f0efff", "#d7d3ff", "#5647c2", "#fff"],
  pink: ["#ff2d55", "#d91f48", "#fff0f4", "#ffd0dc", "#b6153c", "#fff"],
  red: ["#ff3b30", "#d9281e", "#fff1ef", "#ffd1cc", "#b51d15", "#fff"],
  orange: ["#ff9500", "#b85f00", "#fff4e2", "#ffd9a1", "#8a4700", "#fff"],
  yellow: ["#ffcc00", "#8a6500", "#fff8d7", "#ffe88a", "#715200", "#111827"],
  green: ["#34c759", "#147d2c", "#ebf9ee", "#b9ebc7", "#0f6624", "#fff"],
  graphite: ["#8e8e93", "#57575c", "#f1f1f3", "#d6d6da", "#3f3f46", "#fff"],
};

function t(key) {
  const lang = activeLang();
  return messages[lang]?.[key] || messages.en?.[key] || key;
}

function activeLang() {
  if (state.lang === "zh" || state.lang === "en") return state.lang;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function formatMoney(value, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value);
}

function statusLabel(status) {
  return t(status) || status.replaceAll("_", " ");
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function setMobileSidebarOpen(open) {
  state.sidebarOpen = open;
  document.body.classList.toggle("sidebar-open", open);
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
}

function applyAccent() {
  const [accent, strong, wash, line, text, contrast] = accents[state.accent] || accents.green;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-strong", strong);
  document.documentElement.style.setProperty("--accent-wash", wash);
  document.documentElement.style.setProperty("--accent-line", line);
  document.documentElement.style.setProperty("--accent-text", text);
  document.documentElement.style.setProperty("--accent-contrast", contrast);
  document.documentElement.style.setProperty("--accent-focus", `${accent}55`);
}

function routeFromHash() {
  const hash = window.location.hash || "#/invoices";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "settings") {
    state.settingsOpen = true;
    return;
  }
  state.settingsOpen = false;
  if (parts[0] === "invoices") {
    state.view = parts[1] || "all";
    state.selectedId = parts[2] || state.selectedId;
    state.mobileDetailOpen = Boolean(parts[2]);
  }
}

function routeTo(view = state.view, id = state.selectedId, replace = false) {
  const next = `#/invoices/${view || "all"}${id ? `/${id}` : ""}`;
  if (replace) history.replaceState(null, "", next);
  else window.location.hash = next;
}

function selectedInvoice() {
  const invoices = state.data?.batch?.invoices || [];
  return invoices.find((invoice) => invoice.id === state.selectedId) || invoices[0] || null;
}

function filteredInvoices() {
  const invoices = state.data?.batch?.invoices || [];
  if (state.view === "all") return invoices;
  return invoices.filter((invoice) => invoice.status === state.view);
}

async function loadState({ quiet = false } = {}) {
  const active = document.activeElement;
  const editing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  if (editing && quiet) return;
  const res = await fetch("/api/state", { cache: "no-store" });
  state.data = await res.json();
  const invoices = state.data?.batch?.invoices || [];
  if (!state.selectedId && invoices[0]) state.selectedId = invoices[0].id;
  if (state.selectedId && !invoices.some((invoice) => invoice.id === state.selectedId) && invoices[0]) {
    state.selectedId = invoices[0].id;
  }
  render();
}

function sidebarHtml() {
  const metrics = state.data?.batch?.metrics || {};
  const filters = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  const humanTask =
    metrics.needs_review > 0
      ? `${metrics.needs_review} need review`
      : metrics.blocked > 0
        ? `${metrics.blocked} blocked`
        : `${metrics.approved || 0} ready for export`;
  return `
    <aside class="sidebar" id="appSidebar">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">IS</div>
        <div class="brand-copy">
          <div class="brand-title">Kelly Invoice Sheet</div>
          <div class="brand-subtitle">Extract Data</div>
        </div>
        <button class="sidebar-toggle" type="button" aria-label="Toggle sidebar" title="Toggle sidebar">
          <span class="sidebar-toggle-icon" aria-hidden="true"></span>
        </button>
      </div>
      <section class="human-work">
        <div class="human-label">Human task</div>
        <strong>${humanTask}</strong>
        <div class="human-counts">
          <span>${metrics.approved || 0} ready</span>
          <span>${metrics.low_confidence || 0} low confidence</span>
        </div>
      </section>
      <nav class="filters">
        ${filters
          .map((filter) => {
            const count = filter === "all" ? metrics.total || 0 : metrics[filter] || 0;
            return `<button class="filter ${state.view === filter ? "active" : ""}" data-view="${filter}" title="${statusLabel(filter)}">
              <span>${statusLabel(filter)}</span><b>${count}</b>
            </button>`;
          })
          .join("")}
      </nav>
      <button class="settings-link" type="button" data-open-settings title="${t("settings")}">${t("settings")}</button>
    </aside>
  `;
}

function spreadsheetChromeHtml() {
  return `
    <div class="sheet-chrome">
      <div class="sheet-topbar">
        <div class="file-dot"></div>
        <strong>untitled</strong>
        <span>File</span><span>Edit</span><span>View</span><span>Tools</span><span>Automations</span><span>Help</span>
        <span class="topbar-spacer"></span>
        <button class="ghost-button" type="button">Help & Support</button>
        <button class="share-button" type="button">Share</button>
      </div>
      <div class="sheet-toolbar">
        <button class="extract-button" type="button" data-toggle-upload>Extract Data</button>
        <span class="sheet-tab">Sheet1</span>
        <span class="formula-box">D:D</span>
        <span class="formula-input">ƒ</span>
      </div>
    </div>
  `;
}

function tableHtml() {
  const invoices = filteredInvoices();
  const columns = ["Vendor", "Invoice #", "Date", "Due", "Currency", "Total", "Status", "Confidence"];
  return `
    <section class="list-panel">
      ${spreadsheetChromeHtml()}
      <div class="sheet-grid-wrap">
        <table class="invoice-grid">
          <thead>
            <tr>
              <th class="row-head"></th>
              ${columns.map((column) => `<th>${column}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${invoices
              .map(
                (invoice, index) => `
                <tr class="${invoice.id === state.selectedId ? "selected" : ""}" data-select="${invoice.id}">
                  <td class="row-head">${index + 1}</td>
                  <td>${invoice.vendor_name || "-"}</td>
                  <td>${invoice.invoice_number || "-"}</td>
                  <td>${invoice.invoice_date || "-"}</td>
                  <td>${invoice.due_date || "-"}</td>
                  <td>${invoice.currency || "-"}</td>
                  <td class="money">${formatMoney(invoice.total, invoice.currency)}</td>
                  <td><span class="status ${invoice.status}">${statusLabel(invoice.status)}</span></td>
                  <td>${Math.round((invoice.confidence || 0) * 100)}%</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
        ${invoices.length ? "" : `<div class="empty-state">No invoices in this view.</div>`}
      </div>
    </section>
  `;
}

function uploadDialogHtml() {
  if (!state.uploadOpen) return "";
  const used = state.data?.batch?.input_files?.reduce((sum, file) => sum + (file.pages || 1), 0) || 0;
  return `
    <div class="extract-modal" role="dialog" aria-label="Extract Data">
      <div class="extract-head">
        <div class="extract-badge" aria-hidden="true">⌘</div>
        <div>
          <h2>Extract Data</h2>
          <p>Worksheet: Sheet1</p>
        </div>
        <label class="game-check"><input type="checkbox" /> Play game while extracting</label>
        <button class="close-extract" type="button" data-close-upload title="Close">×</button>
      </div>
      <div class="extract-tabs">
        <button class="active" type="button">${t("upload")}</button>
        <button type="button">${t("googleDrive")}</button>
        <button type="button">${t("oneDrive")}</button>
        <button type="button">${t("email")}</button>
        <span class="usage"><i></i>${used} of 50 pages used</span>
        <button class="upgrade" type="button">Upgrade</button>
        <button class="help" type="button">Help</button>
      </div>
      <div class="drop-zone">
        <div class="upload-icon" aria-hidden="true">⇧</div>
        <strong>${t("uploadTitle")}</strong>
        <span>${t("uploadSub")}</span>
      </div>
    </div>
  `;
}

function inputHtml(label, key, value, type = "text") {
  return `<label class="field"><span>${label}</span><input name="${key}" type="${type}" value="${value ?? ""}" /></label>`;
}

function detailHtml() {
  const invoice = selectedInvoice();
  if (!invoice) {
    return `<aside class="detail-panel"><div class="empty-detail">Run the demo generator or ask the agent to extract invoice files.</div></aside>`;
  }
  return `
    <aside class="detail-panel">
      <button class="back-to-list" type="button">${t("back")}</button>
      <div class="detail-actions-top">
        <button class="primary" type="button" data-action="approve">${t("approve")}</button>
        <button type="button" data-action="request_changes">${t("requestChanges")}</button>
        <button type="button" data-action="block">${t("block")}</button>
      </div>
      <form class="detail-form" data-form="${invoice.id}">
        <div class="detail-title">
          <span>${invoice.ref}</span>
          <h2>${invoice.title || invoice.vendor_name}</h2>
          <div class="detail-meta">
            <span class="status ${invoice.status}">${statusLabel(invoice.status)}</span>
            <span>${invoice.source_file}</span>
            <span>${Math.round((invoice.confidence || 0) * 100)}% confidence</span>
          </div>
        </div>
        <section class="fields-grid">
          ${inputHtml("Vendor", "vendor_name", invoice.vendor_name)}
          ${inputHtml("Tax ID", "vendor_tax_id", invoice.vendor_tax_id || "")}
          ${inputHtml("Invoice #", "invoice_number", invoice.invoice_number)}
          ${inputHtml("Invoice Date", "invoice_date", invoice.invoice_date)}
          ${inputHtml("Due Date", "due_date", invoice.due_date || "")}
          ${inputHtml("Currency", "currency", invoice.currency)}
          ${inputHtml("Subtotal", "subtotal", formatNumber(invoice.subtotal), "number")}
          ${inputHtml("Tax", "tax", formatNumber(invoice.tax), "number")}
          ${inputHtml("Total", "total", formatNumber(invoice.total), "number")}
          ${inputHtml("Amount Due", "amount_due", formatNumber(invoice.amount_due), "number")}
          ${inputHtml("Payment Terms", "payment_terms", invoice.payment_terms || "")}
          ${inputHtml("PO", "purchase_order", invoice.purchase_order || "")}
        </section>
        <label class="field wide"><span>Review note</span><textarea name="notes">${invoice.notes || ""}</textarea></label>
        <section class="line-items">
          <div class="section-head"><h3>Line Items</h3><span>${invoice.line_items.length} rows</span></div>
          <table>
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
            <tbody>
              ${invoice.line_items
                .map(
                  (line) => `<tr>
                    <td>${line.description}</td>
                    <td>${line.quantity ?? ""}</td>
                    <td>${line.unit_price ?? ""}</td>
                    <td>${line.amount ?? ""}</td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </section>
        <section class="warnings ${invoice.warnings.length || invoice.risk.length ? "" : "quiet"}">
          <h3>Extraction Notes</h3>
          ${[...invoice.risk, ...invoice.warnings].map((item) => `<span>${item}</span>`).join("") || "<p>No warnings.</p>"}
        </section>
        <button class="save-edit" type="submit">${t("save")}</button>
      </form>
    </aside>
  `;
}

function mobileTopbarHtml() {
  const metrics = state.data?.batch?.metrics || {};
  return `
    <div class="mobile-topbar">
      <button class="mobile-sidebar-toggle" type="button" aria-label="Open sidebar"><span class="sidebar-toggle-icon"></span></button>
      <div class="mobile-title">
        <strong>${statusLabel(state.view)}</strong>
        <span>${filteredInvoices().length} shown · ${metrics.total || 0} total</span>
      </div>
      <button class="ghost-button" type="button" data-open-settings>?</button>
    </div>
  `;
}

function settingsHtml() {
  if (!state.settingsOpen) return "";
  const summary = state.data?.config_summary || {};
  return `
    <div class="modal-backdrop" data-close-settings>
      <section class="modal" role="dialog" aria-label="${t("settings")}">
        <header>
          <h2>${t("settings")}</h2>
          <button type="button" data-close-settings>×</button>
        </header>
        <div class="modal-tabs">
          <button class="active" type="button">Config</button>
          <button type="button">Display</button>
        </div>
        <div class="modal-body">
          <div class="settings-card">
            <h3>Local handoff</h3>
            ${Object.entries(summary.handoff_files || {})
              .map(([key, value]) => `<p><strong>${key}</strong><code>${value}</code></p>`)
              .join("")}
          </div>
          <div class="settings-card">
            <h3>Export</h3>
            <p><strong>Directory</strong><code>${summary.export?.directory || "exports/<batch-id>"}</code></p>
            <p><strong>Provider</strong><code>${summary.data_provider || "local"}</code></p>
          </div>
          <div class="settings-card">
            <h3>Accent</h3>
            <div class="swatches">
              ${Object.keys(accents)
                .map(
                  (name) =>
                    `<button class="swatch ${state.accent === name ? "active" : ""}" style="--swatch:${accents[name][0]}" data-accent="${name}" title="${name}"></button>`,
                )
                .join("")}
            </div>
          </div>
          <div class="settings-card">
            <h3>Language</h3>
            <select data-language>
              <option value="auto" ${state.lang === "auto" ? "selected" : ""}>Auto</option>
              <option value="en" ${state.lang === "en" ? "selected" : ""}>English</option>
              <option value="zh" ${state.lang === "zh" ? "selected" : ""}>中文</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  `;
}

function render() {
  applyAccent();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div class="app-shell">
      ${sidebarHtml()}
      <main class="main">
        ${mobileTopbarHtml()}
        <section class="content">
          ${tableHtml()}
          ${detailHtml()}
        </section>
        ${uploadDialogHtml()}
      </main>
    </div>
    ${settingsHtml()}
  `;
  setMobileDetailOpen(state.mobileDetailOpen && isMobileLayout());
}

function patchFromForm(form) {
  const data = new FormData(form);
  const patch = {};
  for (const [key, value] of data.entries()) {
    if (["subtotal", "tax", "total", "amount_due"].includes(key)) {
      patch[key] = value === "" ? undefined : Number(value);
    } else {
      patch[key] = value;
    }
  }
  return patch;
}

async function submitDecision(action, patch = null, comment = "") {
  const invoice = selectedInvoice();
  if (!invoice) return;
  await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item_id: invoice.id, action, comment, patch }),
  });
  await loadState();
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  const row = target.closest?.("[data-select]");
  if (row) {
    state.selectedId = row.getAttribute("data-select");
    state.mobileDetailOpen = true;
    routeTo(state.view, state.selectedId);
    render();
    return;
  }
  const filter = target.closest?.("[data-view]");
  if (filter) {
    state.view = filter.getAttribute("data-view") || "all";
    state.mobileDetailOpen = false;
    setMobileSidebarOpen(false);
    routeTo(state.view, state.selectedId);
    render();
    return;
  }
  if (target.closest?.("[data-toggle-upload]")) {
    state.uploadOpen = !state.uploadOpen;
    render();
    return;
  }
  if (target.closest?.("[data-close-upload]")) {
    state.uploadOpen = false;
    render();
    return;
  }
  const action = target.closest?.("[data-action]")?.getAttribute("data-action");
  if (action) {
    const form = document.querySelector(".detail-form");
    const comment = form ? new FormData(form).get("notes") || "" : "";
    await submitDecision(action, null, String(comment));
    return;
  }
  if (target.closest?.(".back-to-list")) {
    state.mobileDetailOpen = false;
    setMobileDetailOpen(false);
    return;
  }
  if (target.closest?.(".mobile-sidebar-toggle") || target.closest?.(".sidebar-toggle")) {
    setMobileSidebarOpen(!state.sidebarOpen);
    return;
  }
  if (target.closest?.("[data-open-settings]")) {
    state.settingsOpen = true;
    window.location.hash = "#/settings";
    render();
    return;
  }
  if (target.matches?.("[data-accent]")) {
    state.accent = target.getAttribute("data-accent");
    localStorage.setItem("kelly-invoice-sheet-accent", state.accent);
    render();
    return;
  }
  if (target.closest?.("[data-close-settings]") && (target === event.target || target.tagName === "BUTTON")) {
    state.settingsOpen = false;
    routeTo(state.view, state.selectedId, true);
    render();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest?.(".detail-form");
  if (!form) return;
  event.preventDefault();
  const patch = patchFromForm(form);
  await submitDecision("revise", patch, String(patch.notes || ""));
});

document.addEventListener("change", (event) => {
  const lang = event.target.matches?.("[data-language]") ? event.target.value : "";
  if (lang) {
    state.lang = lang;
    localStorage.setItem("kelly-invoice-sheet-lang", lang);
    render();
  }
});

document.getElementById("sidebarScrim")?.addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("hashchange", () => {
  routeFromHash();
  render();
});
window.addEventListener("resize", () => {
  if (!isMobileLayout()) {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
  }
});

routeFromHash();
loadState();
setInterval(() => loadState({ quiet: true }), 4000);
