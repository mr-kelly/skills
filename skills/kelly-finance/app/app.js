import { messages } from "./i18n/messages.js";

const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-finance-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  selectedAction: "approve",
};

const els = {
  content: document.querySelector("#content"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  syncStatus: document.querySelector("#syncStatus"),
  attentionMain: document.querySelector("#attentionMain"),
  attentionMeta: document.querySelector("#attentionMeta"),
  language: document.querySelector("#language"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileTitle: document.querySelector("#mobileTitle"),
  mobileMeta: document.querySelector("#mobileMeta"),
};

function normalizeLang(lang) {
  if (String(lang).toLowerCase().startsWith("zh")) return "zh";
  if (lang === "en") return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function fmt(value) {
  const currency = state.data?.snapshot?.currency || "USD";
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function snapshot() {
  return state.data?.snapshot || { periods: [], checks: [], metrics: {}, warnings: [], workbook: { tabs: [] } };
}

function checks() {
  return snapshot().checks || [];
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  params.set("lang", activeLang());
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  state.data = await res.json();
  render();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.refresh.textContent = t("refresh");
  els.language.value = state.lang;
}

function setShell() {
  const snap = snapshot();
  const metrics = snap.metrics || {};
  els.syncStatus.textContent = state.data?.demo ? t("demo_notice") : t("ready");
  els.attentionMain.textContent = `${metrics.needs_review || 0} ${t("needs_review")}`;
  els.attentionMeta.textContent = `${metrics.approved || 0} ${t("approved")} · ${metrics.blocked || 0} ${t("blocked")}`;
  els.mobileMeta.textContent = `${checks().length} ${t("model_checks").toLowerCase()}`;
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === state.route.view);
  });
}

function metricCard(label, value, hint = "") {
  return `<div class="metric"><div class="muted">${label}</div><strong>${value}</strong><span>${hint}</span></div>`;
}

function renderOverview() {
  const snap = snapshot();
  const first = snap.periods?.[0] || {};
  const last = snap.periods?.[snap.periods.length - 1] || {};
  return `<div class="grid metrics">
    ${metricCard(t("revenue"), fmt(first.revenue), first.label || "")}
    ${metricCard(t("gross_margin"), pct(first.gross_profit && first.revenue ? first.gross_profit / first.revenue : 0), first.label || "")}
    ${metricCard(t("ending_cash"), fmt(last.ending_cash), last.label || "")}
    ${metricCard(t("free_cash_flow"), fmt(last.free_cash_flow), last.label || "")}
  </div>
  <section class="panel">
    <div class="panel-head"><h2>${snap.company || "Model"}</h2><span>${snap.model_purpose || ""}</span></div>
    ${renderTable(snap.periods || [])}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>${t("model_checks")}</h2><a href="#/checks">${checks().length}</a></div>
    ${renderCheckList(checks().slice(0, 4))}
  </section>`;
}

function renderTable(periods) {
  if (!periods.length) return `<p class="empty">${t("no_checks")}</p>`;
  const rows = [
    ["Revenue", "revenue"],
    ["Gross profit", "gross_profit"],
    ["EBITDA", "ebitda"],
    ["Net income", "net_income"],
    ["Ending cash", "ending_cash"],
    ["Free cash flow", "free_cash_flow"],
  ];
  return `<div class="table-wrap"><table><thead><tr><th>Metric</th>${periods.map((p) => `<th>${p.label}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr><td>${row[0]}</td>${periods.map((p) => `<td>${fmt(p[row[1]])}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function renderCheckList(items) {
  if (!items.length) return `<p class="empty">${t("no_checks")}</p>`;
  return `<div class="checks">${items
    .map(
      (item, index) => `<a class="check-row ${item.status}" href="#/checks/${encodeURIComponent(item.id)}">
        <span class="ref">Check #${index + 1}</span>
        <strong>${item.title}</strong>
        <span>${item.summary}</span>
        <em>${item.status.replaceAll("_", " ")}</em>
      </a>`,
    )
    .join("")}</div>`;
}

function renderChecks() {
  const selected = checks().find((item) => item.id === state.route.id) || checks()[0];
  return `<div class="split">
    <section class="panel list-panel">${renderCheckList(checks())}</section>
    <section class="panel detail-panel">${selected ? renderCheckDetail(selected) : `<p class="empty">${t("no_checks")}</p>`}</section>
  </div>`;
}

function renderCheckDetail(item) {
  return `<div class="detail-head">
    <div><span class="ref">${item.check_type}</span><h2>${item.title}</h2><p>${item.summary}</p></div>
    <span class="severity ${item.severity}">${item.severity}</span>
  </div>
  <div class="evidence">${(item.evidence || []).map((line) => `<span>${line}</span>`).join("")}</div>
  <label>${t("review_note")}<textarea id="decisionComment" rows="4">${item.decision?.comment || ""}</textarea></label>
  <label>Draft<textarea id="decisionDraft" rows="5">${item.draft || ""}</textarea></label>
  <div class="actions">
    ${["approve", "request_changes", "block", "dismiss"].map((action) => `<button type="button" data-action="${action}">${t(action)}</button>`).join("")}
  </div>`;
}

function renderWorkbook() {
  const snap = snapshot();
  return `<section class="panel">
    <div class="panel-head"><h2>${t("workbook")}</h2><span>${snap.workbook?.last_generated_path || ""}</span></div>
    <div class="tabs">${(snap.workbook?.tabs || []).map((tab) => `<span>${tab}</span>`).join("")}</div>
    <p class="muted">Approved export actions are recorded to execution_report.json; the app never sends files or mutates external systems.</p>
  </section>`;
}

function renderSettings() {
  return `<section class="panel"><h2>${t("settings")}</h2><pre>${JSON.stringify(
    {
      data_provider: state.data?.data_provider,
      onboarding: state.data?.onboarding,
      lock: state.data?.lock,
      config_summary: state.data?.config_summary,
    },
    null,
    2,
  )}</pre></section>`;
}

function render() {
  applyI18n();
  setShell();
  const view = state.route.view;
  els.pageTitle.textContent =
    view === "checks"
      ? t("checks")
      : view === "workbook"
        ? t("workbook")
        : view === "settings"
          ? t("settings")
          : "Kelly Finance";
  els.pageSubtitle.textContent = snapshot().model_purpose || t("subtitle");
  els.content.innerHTML =
    view === "checks"
      ? renderChecks()
      : view === "workbook"
        ? renderWorkbook()
        : view === "settings"
          ? renderSettings()
          : renderOverview();
}

async function submitDecision(action) {
  const selected = checks().find((item) => item.id === state.route.id) || checks()[0];
  if (!selected) return;
  if (state.data?.demo) {
    selected.status =
      action === "approve"
        ? "approved"
        : action === "request_changes"
          ? "changes_requested"
          : action === "block"
            ? "blocked"
            : "done";
    render();
    return;
  }
  await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: selected.id,
      action,
      comment: document.querySelector("#decisionComment")?.value || "",
      draft: document.querySelector("#decisionDraft")?.value || "",
    }),
  });
  await loadState();
}

function setMobileSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  els.sidebarScrim.hidden = !open;
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  setMobileSidebar(false);
  render();
});
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.language.addEventListener("change", () => {
  state.lang = els.language.value;
  localStorage.setItem("kelly-finance-language", state.lang);
  loadState();
});
els.sidebarToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
els.mobileSidebarToggle.addEventListener("click", () => setMobileSidebar(true));
els.sidebarScrim.addEventListener("click", () => setMobileSidebar(false));
els.content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) submitDecision(button.dataset.action);
});

await loadState();
