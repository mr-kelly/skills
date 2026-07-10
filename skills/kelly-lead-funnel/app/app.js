import { messages } from "./i18n/messages.js";

const STAGES = ["new", "data_verified", "scored", "term_sheet_ready", "rejected"];

const state = {
  leads: [],
  summary: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-lead-funnel-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-lead-funnel.sidebarCollapsed";

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  newCount: document.querySelector("#new-count"),
  readyCount: document.querySelector("#ready-count"),
  rejectedCount: document.querySelector("#rejected-count"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function stageLabel(stage) {
  return messages[activeLang()]?.stage?.[stage] || messages.en.stage?.[stage] || stage;
}

function categoryLabel(category) {
  return messages[activeLang()]?.category_enum?.[category] || messages.en.category_enum?.[category] || category;
}

function sourceLabel(source) {
  return messages[activeLang()]?.source_enum?.[source] || messages.en.source_enum?.[source] || source;
}

function actionLabel(action) {
  return messages[activeLang()]?.action_enum?.[action] || messages.en.action_enum?.[action] || action;
}

function factorLabel(factor) {
  return messages[activeLang()]?.factor_enum?.[factor] || messages.en.factor_enum?.[factor] || factor;
}

function money(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function scoreClass(score) {
  const n = Number(score || 0);
  if (n >= 75) return "high";
  if (n >= 55) return "medium";
  return "low";
}

function riskClass(category) {
  const criteria = state.settings?.config_summary?.scoring_criteria || {};
  if ((criteria.low_risk_categories || []).includes(category)) return "risk-low";
  if ((criteria.medium_risk_categories || []).includes(category)) return "risk-medium";
  if ((criteria.higher_risk_categories || []).includes(category)) return "risk-higher";
  return "";
}

function parseRoute() {
  const parts = (location.hash || "#/board").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "board", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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
  state.leads = data.leads || [];
  state.summary = data.summary;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "board";
  const route =
    scenario === "lead"
      ? `#/leads/${encodeURIComponent(state.leads[0]?.id || "")}`
      : scenario === "settings"
        ? "#/settings"
        : "#/board";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-stage]").forEach((node) => {
    node.textContent = stageLabel(node.dataset.i18nStage);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function stageCount(stage) {
  return (state.summary?.by_stage || []).find((item) => item.stage === stage)?.count || 0;
}

function renderShell() {
  applyI18n();
  const total = state.summary?.total || 0;
  els.syncStatus.textContent = state.leads.length ? `${t("total")}: ${total}` : t("empty");
  if (els.newCount) els.newCount.textContent = stageCount("new");
  if (els.readyCount) els.readyCount.textContent = stageCount("scored");
  if (els.rejectedCount) els.rejectedCount.textContent = stageCount("rejected");
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel();
  if (els.mobileViewMeta) els.mobileViewMeta.textContent = `${total} ${t("leads")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.dataset.route;
    const active = route === state.route.view || (STAGES.includes(route) && state.route.id === route);
    link.classList.toggle("active", active);
  });
}

function viewLabel() {
  if (state.route.view === "settings") return t("settings");
  if (state.route.view === "leads") return t("boardTitle");
  if (state.route.id) return stageLabel(state.route.id);
  return t("boardTitle");
}

function funnelSummaryPanel() {
  const byStage = state.summary?.by_stage || [];
  return `
    <div class="funnel-track">
      ${byStage
        .map(
          (item) => `
        <a class="funnel-step" data-stage="${item.stage}" href="#/board/${item.stage}">
          <span class="funnel-step-label">${escapeHtml(stageLabel(item.stage))}</span>
          <span class="funnel-step-row">
            <strong class="funnel-step-count">${item.count}</strong>
            <span class="funnel-step-pct">${item.conversion_from_new_pct}%</span>
          </span>
          <span class="funnel-step-bar"><span style="width:${item.conversion_from_new_pct}%"></span></span>
        </a>
      `,
        )
        .join("")}
    </div>
    <div class="metrics">
      <div class="metric"><span>${t("total")}</span><strong>${state.summary?.total || 0}</strong></div>
      <div class="metric"><span>${t("overallConversion")}</span><strong>${state.summary?.overall_conversion_pct || 0}%</strong></div>
      <div class="metric"><span>${t("rejectionRate")}</span><strong>${state.summary?.rejection_rate_pct || 0}%</strong></div>
    </div>
  `;
}

function filteredLeads(stage = "") {
  const query = state.query.trim().toLowerCase();
  return state.leads.filter((lead) => {
    if (stage && lead.stage !== stage) return false;
    if (!query) return true;
    return [lead.brand_name, lead.city, lead.category, lead.lead_source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function leadCard(lead) {
  return `
    <a class="lead-card" href="#/leads/${encodeURIComponent(lead.id)}">
      <div class="lead-card-head">
        <strong>${escapeHtml(lead.brand_name)}</strong>
        <span class="score-chip ${scoreClass(lead.score)}">${lead.score}</span>
      </div>
      <div class="lead-card-meta">
        <span class="badge ${riskClass(lead.category)}">${escapeHtml(categoryLabel(lead.category))}</span>
        <span>${escapeHtml(lead.city)}</span>
        <span>${lead.store_count} ${escapeHtml(t("storeCount")).toLowerCase()}</span>
      </div>
      <div class="lead-card-meta">
        <span>${money(lead.est_monthly_revenue)}/mo</span>
        <span>${escapeHtml(sourceLabel(lead.lead_source))}</span>
      </div>
    </a>
  `;
}

function renderBoard() {
  els.title.textContent = t("boardTitle");
  els.subtitle.textContent = `${state.leads.length} ${t("leads")}`;
  if (!state.leads.length) {
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  const columns = STAGES.map((stage) => {
    const leads = filteredLeads(stage);
    return `
      <div class="board-column">
        <div class="board-column-head">
          <strong>${escapeHtml(stageLabel(stage))}</strong>
          <span>${leads.length}</span>
        </div>
        <div class="board-cards">${leads.map(leadCard).join("") || `<div class="empty">${t("empty")}</div>`}</div>
      </div>
    `;
  }).join("");
  els.content.innerHTML = `${funnelSummaryPanel()}<div class="board">${columns}</div>`;
}

function renderStageQueue(stage) {
  els.title.textContent = stageLabel(stage);
  const leads = filteredLeads(stage);
  els.subtitle.textContent = `${leads.length} ${t("leads")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/board">← ${t("board")}</a>
    <div class="board-cards">${leads.map(leadCard).join("") || `<div class="empty">${t("empty")}</div>`}</div>
  `;
}

function scoreBreakdown(lead) {
  return `
    <div class="score-breakdown">
      ${(lead.score_breakdown || [])
        .map(
          (factor) => `
        <div class="score-factor-row">
          <div class="row-head">
            <span>${escapeHtml(factorLabel(factor.factor))}</span>
            <span>${factor.contribution} / ${factor.weight}</span>
          </div>
          <div class="score-factor-bar"><span style="width:${Math.round((factor.contribution / factor.weight) * 100)}%"></span></div>
          <div class="row-rationale">${escapeHtml(factor.rationale)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function stageActionButtons(lead) {
  const nextStages = STAGES.filter((stage) => stage !== lead.stage && stage !== "rejected");
  return `
    <div class="stage-actions">
      ${nextStages
        .map(
          (stage) =>
            `<button type="button" class="${stage === "term_sheet_ready" ? "primary" : ""}" data-move="${stage}">${t("moveTo")} ${escapeHtml(stageLabel(stage))}</button>`,
        )
        .join("")}
      ${lead.stage !== "rejected" ? `<button type="button" class="danger" data-toggle-reject="1">${t("reject")}</button>` : ""}
    </div>
    <form class="reject-form" id="rejectForm">
      <label for="rejectReason">${t("rejectReason")}</label>
      <textarea id="rejectReason" required></textarea>
      <div class="stage-actions">
        <button type="submit" class="danger">${t("rejectConfirm")}</button>
        <button type="button" data-toggle-reject="0">${t("cancel")}</button>
      </div>
    </form>
  `;
}

function notesPanel(lead) {
  const rows = (lead.notes || [])
    .map(
      (note) => `
      <div class="note-row">
        <div>${escapeHtml(note.text)}</div>
        <div class="note-meta">${escapeHtml(note.author)} · ${new Date(note.created_at).toLocaleString()}</div>
      </div>
    `,
    )
    .join("");
  return `
    <h2>${t("notes")}</h2>
    <div class="notes-list">${rows || `<div class="empty">${t("empty")}</div>`}</div>
    <form class="note-form" id="noteForm">
      <textarea id="noteText" placeholder="${escapeHtml(t("noteText"))}" required></textarea>
      <div><button type="submit">${t("save")}</button></div>
    </form>
  `;
}

function stageHistoryPanel(lead) {
  const rows = (lead.stage_history || [])
    .map(
      (change) =>
        `<div>${change.from ? `${escapeHtml(stageLabel(change.from))} → ` : ""}${escapeHtml(stageLabel(change.to))} · ${new Date(change.at).toLocaleString()}${change.reason ? ` — ${escapeHtml(change.reason)}` : ""}</div>`,
    )
    .join("");
  return `<h2>${t("stageHistory")}</h2><div class="stage-history">${rows}</div>`;
}

function renderLeadDetail() {
  const lead = state.leads.find((item) => item.id === state.route.id);
  if (!lead) {
    location.hash = "#/board";
    return;
  }
  els.title.textContent = lead.brand_name;
  els.subtitle.textContent = `${categoryLabel(lead.category)} · ${lead.city}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/board">← ${t("board")}</a>
        <div class="metrics">
          <div class="metric"><span>${t("score")}</span><strong class="${scoreClass(lead.score)}">${lead.score} / 100</strong></div>
          <div class="metric"><span>${t("monthlyRevenue")}</span><strong>${money(lead.est_monthly_revenue)}</strong></div>
          <div class="metric"><span>${t("storeCount")}</span><strong>${lead.store_count}</strong></div>
          <div class="metric"><span>${t("suggestedAction")}</span><strong>${escapeHtml(actionLabel(lead.suggested_action))}</strong></div>
        </div>
        <h2>${t("scoreBreakdown")}</h2>
        ${scoreBreakdown(lead)}
        ${notesPanel(lead)}
      </div>
      <aside class="detail-side">
        <h2>${escapeHtml(stageLabel(lead.stage))}</h2>
        <dl>
          <dt>${t("brandName")}</dt><dd>${escapeHtml(lead.brand_name)}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(categoryLabel(lead.category))}</dd>
          <dt>${t("city")}</dt><dd>${escapeHtml(lead.city)}</dd>
          <dt>${t("leadSource")}</dt><dd>${escapeHtml(sourceLabel(lead.lead_source))}</dd>
          <dt>${t("dataVerifiable")}</dt><dd>${lead.data_verifiable ? "✓" : "—"}</dd>
          ${lead.rejection_reason ? `<dt>${t("rejectionReason")}</dt><dd>${escapeHtml(lead.rejection_reason)}</dd>` : ""}
        </dl>
        ${stageActionButtons(lead)}
        ${stageHistoryPanel(lead)}
      </aside>
    </section>
  `;

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => moveLeadStage(lead.id, button.dataset.move));
  });
  document.querySelectorAll("[data-toggle-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#rejectForm")?.classList.toggle("open", button.dataset.toggleReject === "1");
    });
  });
  document.querySelector("#rejectForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const reason = document.querySelector("#rejectReason")?.value.trim();
    if (!reason) return;
    moveLeadStage(lead.id, "rejected", reason);
  });
  document.querySelector("#noteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = document.querySelector("#noteText")?.value.trim();
    if (!text) return;
    addLeadNote(lead.id, text);
  });
}

async function moveLeadStage(id, stage, reason) {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}/stage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || `Request failed: ${res.status}`);
    return;
  }
  await loadState();
}

async function addLeadNote(id, text) {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || `Request failed: ${res.status}`);
    return;
  }
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const fund = summary.fund_profile || {};
  const criteria = summary.scoring_criteria || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("fundProfile")}</h2>
        <dl>
          <dt>${t("fundName")}</dt><dd>${escapeHtml(fund.display_name || "")}</dd>
          <dt>${t("product")}</dt><dd>${escapeHtml(fund.product || "")}</dd>
          <dt>${t("targetCheckSize")}</dt><dd>${escapeHtml(fund.target_check_size || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("scoringCriteria")}</h2>
        <dl>
          <dt>${t("idealStoreBand")}</dt><dd>${criteria.ideal_store_count_min}-${criteria.ideal_store_count_max}</dd>
          <dt>${t("idealRevenueBand")}</dt><dd>${money(criteria.ideal_monthly_revenue_min)} - ${money(criteria.ideal_monthly_revenue_max)}</dd>
          <dt>${t("lowRiskCategories")}</dt><dd>${(criteria.low_risk_categories || []).map(categoryLabel).map(escapeHtml).join(", ")}</dd>
          <dt>${t("mediumRiskCategories")}</dt><dd>${(criteria.medium_risk_categories || []).map(categoryLabel).map(escapeHtml).join(", ")}</dd>
          <dt>${t("higherRiskCategories")}</dt><dd>${(criteria.higher_risk_categories || []).map(categoryLabel).map(escapeHtml).join(", ")}</dd>
        </dl>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "leads" && state.route.id) renderLeadDetail();
  else if (state.route.view === "settings") renderSettings();
  else if (state.route.view === "board" && state.route.id) renderStageQueue(state.route.id);
  else renderBoard();
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-lead-funnel-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
