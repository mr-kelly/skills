import { messages } from "./i18n/messages.js";
import {
  renderContactDetail,
  renderContacts,
  renderDealDetail,
  renderDeals,
  renderFollowups,
  renderSettings,
} from "./js/crm-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  followupFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-crm-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-crm.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export const els = {
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
  reviewCount: document.querySelector("#count-review"),
  dealCount: document.querySelector("#count-deals"),
  contactCount: document.querySelector("#count-contacts"),
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

export async function loadState() {
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
  const route =
    scenario === "deals"
      ? "#/deals"
      : scenario === "contacts"
        ? "#/contacts"
        : scenario === "followups"
          ? "#/followups"
          : scenario === "detail"
            ? "#/deals/deal-beacon-api"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
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

export function decisionFor(followupId) {
  return state.settings?.decisions?.decisions?.[followupId] || null;
}

export function effectiveStatus(followup) {
  const decision = decisionFor(followup.followup_id);
  if (!decision) return followup.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return followup.status;
}

export function followups() {
  return state.snapshot?.followups || [];
}

export function deals() {
  return state.snapshot?.deals || [];
}

function contacts() {
  return state.snapshot?.contacts || [];
}

export function interactions() {
  return state.snapshot?.interactions || [];
}

export function companyName(companyId) {
  return state.snapshot?.companies?.find((item) => item.company_id === companyId)?.name || companyId || "";
}

export function contactById(contactId) {
  return contacts().find((item) => item.contact_id === contactId) || null;
}

export function dealById(dealId) {
  return deals().find((item) => item.deal_id === dealId) || null;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  const openDealCount = deals().filter((item) => item.status === "open").length;
  const contactCount = contacts().length;
  els.syncStatus.textContent = snapshot?.contacts?.length ? `${openDealCount} ${t("openDeals")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.dealCount) els.dealCount.textContent = openDealCount;
  if (els.contactCount) els.contactCount.textContent = contactCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : `${openDealCount} ${t("openDeals")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "deals") return t("deals");
  if (view === "contacts") return t("contacts");
  if (view === "followups") return t("followups");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function relationshipBadge(value) {
  return `<span class="relationship-badge rel-${escapeHtml(value)}">${escapeHtml(enumLabel(value, "relationship"))}</span>`;
}

export function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

export function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("pipelineValue")}</span><strong>${money(metrics.pipeline_value)}</strong></div>
      <div class="metric"><span>${t("weightedPipeline")}</span><strong>${money(metrics.weighted_pipeline_value)}</strong></div>
      <div class="metric"><span>${t("openDealCount")}</span><strong>${metrics.open_deal_count || 0}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount}</strong></div>
    </div>
  `;
}

export function filteredDeals() {
  const query = state.query.trim().toLowerCase();
  if (!query) return deals();
  return deals().filter((item) =>
    [
      item.name,
      item.stage,
      item.status,
      item.next_step,
      item.owner,
      companyName(item.company_id),
      contactById(item.primary_contact_id)?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function filteredContacts() {
  const query = state.query.trim().toLowerCase();
  if (!query) return contacts();
  return contacts().filter((item) =>
    [item.name, item.role, item.relationship, item.email, companyName(item.company_id), ...(item.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function filteredFollowups() {
  const query = state.query.trim().toLowerCase();
  return followups().filter((item) => {
    const status = effectiveStatus(item);
    if (state.followupFilter !== "all" && status !== state.followupFilter) return false;
    if (!query) return true;
    return [
      item.subject,
      item.reason,
      item.suggested_reply,
      status,
      contactById(item.contact_id)?.name,
      companyName(contactById(item.contact_id)?.company_id),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const stages = state.snapshot?.pipeline_stages || [];
  const openDeals = deals().filter((item) => item.status === "open");
  const maxStageValue = Math.max(
    1,
    ...stages.map((stage) =>
      deals()
        .filter((item) => item.stage === stage)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    ),
  );
  const dueFollowups = followups()
    .filter((item) => ["needs_review", "changes_requested", "approved"].includes(effectiveStatus(item)))
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
    .slice(0, 5);
  const recent = interactions()
    .slice()
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, 6);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("pipelineByStage")}</h2>
        ${stages
          .map((stage) => {
            const stageDeals = deals().filter((item) => item.stage === stage);
            const value = stageDeals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${stageBadge(stage)}<small>${stageDeals.length}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((value / maxStageValue) * 100)}%"></span></span>
              <span class="num">${money(value)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("followupsDue")}</h2>
        ${
          dueFollowups
            .map((item) => {
              const contact = contactById(item.contact_id);
              return `
            <a class="due-row" href="#/followups">
              <span><strong>${escapeHtml(item.subject || item.reason)}</strong><small>${escapeHtml(contact?.name || "")} · ${escapeHtml(companyName(contact?.company_id))}</small></span>
              <span class="due-meta">${statusBadge(effectiveStatus(item))}<small>${date(item.due_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noFollowups")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("recentActivity")}</h2>
        ${recent
          .map((item) => {
            const contact = contactById(item.contact_id);
            return `
            <div class="activity-row">
              <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
              <span><strong>${escapeHtml(contact?.name || "")}</strong><small>${escapeHtml(item.summary)}</small></span>
              <span class="muted">${date(item.occurred_at)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("network")}</h2>
        <div class="network-grid">
          <a href="#/contacts"><strong>${metrics.contact_count || 0}</strong><span>${t("contactsLower")}</span></a>
          <a href="#/deals"><strong>${metrics.company_count || 0}</strong><span>${t("companies")}</span></a>
          <a href="#/deals"><strong>${money(
            deals()
              .filter((item) => item.status === "won")
              .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          )}</strong><span>${t("wonValue")}</span></a>
          <a href="#/followups"><strong>${metrics.followups_due || 0}</strong><span>${t("dueSoon")}</span></a>
        </div>
        <div class="owner-note muted">${escapeHtml(openDeals.map((item) => item.owner).find(Boolean) || "")}</div>
      </div>
    </section>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "deals" && state.route.id) renderDealDetail();
  else if (state.route.view === "deals") renderDeals();
  else if (state.route.view === "contacts" && state.route.id) renderContactDetail();
  else if (state.route.view === "contacts") renderContacts();
  else if (state.route.view === "followups") renderFollowups();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
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
  localStorage.setItem("kelly-crm-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
