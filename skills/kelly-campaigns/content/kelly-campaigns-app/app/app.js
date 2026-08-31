import { messages } from "./i18n/messages.js";
import {
  renderCampaignDetail,
  renderCampaigns,
  renderDeliverability,
  renderPerformance,
  renderSettings,
} from "./js/campaign-views.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

export const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  campaignFilter: "all",
  phaseFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-campaigns-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-campaigns.sidebarCollapsed";
// Inverse of campaigns-model.js's statusForAction(): a send's own `status`
// plus `decided_at`/`decision_note`/`chosen_variant` are the single source of
// truth now (written directly onto the record) — this only recovers which
// verdict produced the current status, for display in the review queue.
const ACTION_FOR_STATUS = {
  approved: "approve",
  changes_requested: "request_changes",
  blocked: "block",
  needs_review: "revise",
};
const PHASES = ["setup", "engage", "nurture", "deliver"];

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
  approvedCount: document.querySelector("#count-approved"),
  riskCount: document.querySelector("#count-risk"),
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

export function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function count(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US").format(Number(value || 0));
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  const provider = await getProvider();
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-campaigns:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "campaigns"
      ? "#/campaigns"
      : scenario === "deliverability"
        ? "#/deliverability"
        : scenario === "performance"
          ? "#/performance"
          : scenario === "detail"
            ? "#/campaigns/send-summer-launch"
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

export function decisionFor(sendId) {
  const send = sendById(sendId);
  if (!send || !send.decided_at) return null;
  return {
    action: ACTION_FOR_STATUS[send.status] || "revise",
    comment: send.decision_note || "",
    chosen_variant: send.chosen_variant || "",
    decided_at: send.decided_at,
  };
}

export function effectiveStatus(send) {
  // Busabase reads are always live, so the record's own status is already
  // current — no separate decisions.json to reconcile against staleness.
  return send.status;
}

export function sends() {
  return state.snapshot?.sends || [];
}

function segments() {
  return state.snapshot?.segments || [];
}

function segmentById(segmentId) {
  return segments().find((item) => item.segment_id === segmentId) || null;
}

export function segmentName(segmentId) {
  return segmentById(segmentId)?.name || segmentId || "";
}

export function sendById(sendId) {
  return sends().find((item) => item.send_id === sendId) || null;
}

export function suppressionEntries() {
  return state.settings?.suppression?.entries || [];
}

// A send carries a precomputed `suppression` summary (from the provider's
// pre-send check) in demo/agent-prepared snapshots; render it read-only.
export function suppressionNote(send) {
  const info = send?.suppression;
  if (!info || !info.suppressed_count) return "";
  const cls = info.blocked ? "suppression-note blocked" : "suppression-note";
  const label = info.blocked ? t("suppressionBlocked") : `${info.suppressed_count} ${t("suppressionExcluded")}`;
  return `<div class="${cls}">${escapeHtml(label)}</div>`;
}

export function reviewCount() {
  return sends().filter((item) => effectiveStatus(item) === "needs_review").length;
}

function approvedCount() {
  return sends().filter((item) => effectiveStatus(item) === "approved").length;
}

export function atRiskCount() {
  return sends().filter((item) => item.deliverability?.risk === "high" || item.quality_gate?.verdict === "block")
    .length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const review = reviewCount();
  els.syncStatus.textContent = snapshot?.sends?.length
    ? `${count(snapshot.list_health?.subscriber_count)} ${t("subscribers")}`
    : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount();
  if (els.riskCount) els.riskCount.textContent = atRiskCount();
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review
      ? `${review} ${t("needReview")}`
      : `${count(snapshot?.list_health?.subscriber_count)} ${t("subscribers")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "campaigns") return t("campaigns");
  if (view === "deliverability") return t("deliverability");
  if (view === "performance") return t("performance");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function typeBadge(type) {
  return `<span class="type-badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

export function verdictBadge(verdict) {
  if (!verdict) return "";
  return `<span class="verdict-badge verdict-${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))}</span>`;
}

export function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

export function deliverabilityBadge(deliverability) {
  if (!deliverability) return "";
  const risk = deliverability.risk || "low";
  return `<span class="deliv-badge deliv-${escapeHtml(risk)}">${escapeHtml(enumLabel(risk, "deliverabilityRisk"))}</span>`;
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

function metricCards() {
  const health = state.snapshot?.list_health || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("subscribers")}</span><strong>${count(health.subscriber_count)}</strong></div>
      <div class="metric"><span>${t("avgOpen")}</span><strong>${pct(health.avg_open_rate)}</strong></div>
      <div class="metric"><span>${t("bounceRate")}</span><strong>${pct(health.bounce_rate)}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount()}</strong></div>
    </div>
  `;
}

export function phaseChips(scope) {
  const counts = {};
  for (const phase of PHASES) counts[phase] = 0;
  for (const item of scope) counts[item.phase] = (counts[item.phase] || 0) + 1;
  const chip = (value, label, n) =>
    `<button type="button" class="phase-chip ${state.phaseFilter === value ? "active" : ""}" data-phase="${value}">${escapeHtml(label)} <small>${n}</small></button>`;
  return `
    <div class="phase-chips" aria-label="${t("phase")}">
      ${chip("all", t("all"), scope.length)}
      ${PHASES.map((phase) => chip(phase, enumLabel(phase, "phase"), counts[phase] || 0)).join("")}
    </div>
  `;
}

export function matchesQuery(send) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return [
    send.subject,
    send.preview_text,
    send.reason,
    send.body,
    enumLabel(send.type, "type"),
    enumLabel(send.phase, "phase"),
    segmentName(send.segment_id),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function filteredCampaigns() {
  return sends().filter((item) => {
    const status = effectiveStatus(item);
    if (state.campaignFilter !== "all" && status !== state.campaignFilter) return false;
    if (state.phaseFilter !== "all" && item.phase !== state.phaseFilter) return false;
    return matchesQuery(item);
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const health = state.snapshot?.list_health || {};
  const upcoming = sends()
    .filter((item) => ["needs_review", "changes_requested", "approved"].includes(effectiveStatus(item)))
    .slice()
    .sort((a, b) => String(a.send_at).localeCompare(String(b.send_at)))
    .slice(0, 6);
  const phaseCounts = {};
  for (const phase of PHASES) phaseCounts[phase] = sends().filter((item) => item.phase === phase).length;
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("nextSends")}</h2>
        ${
          upcoming
            .map((item) => {
              return `
            <a class="due-row" href="#/campaigns/${encodeURIComponent(item.send_id)}">
              <span><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(segmentName(item.segment_id))} · ${count(item.audience_size)} ${t("audience")}</small></span>
              <span class="due-meta">${statusBadge(effectiveStatus(item))}<small>${dateTime(item.send_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noSends")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("listHealth")}</h2>
        <dl class="health-dl">
          <dt>${t("subscribers")}</dt><dd>${count(health.subscriber_count)}</dd>
          <dt>${t("avgOpen")}</dt><dd>${pct(health.avg_open_rate)}</dd>
          <dt>${t("avgClick")}</dt><dd>${pct(health.avg_click_rate)}</dd>
          <dt>${t("bounceRate")}</dt><dd>${pct(health.bounce_rate)}</dd>
          <dt>${t("complaintRate")}</dt><dd>${pct(health.complaint_rate)}</dd>
          <dt>${t("churnRate")}</dt><dd>${pct(health.churn_rate)}</dd>
        </dl>
      </div>
      <div class="overview-panel">
        <h2>${t("phase")}</h2>
        <div class="phase-grid">
          ${PHASES.map(
            (phase) => `
            <a href="#/campaigns" class="phase-tile phase-${phase}">
              <strong>${phaseCounts[phase]}</strong>
              <span>${escapeHtml(enumLabel(phase, "phase"))}</span>
            </a>
          `,
          ).join("")}
        </div>
      </div>
      <div class="overview-panel">
        <h2>${t("qualityGate")}</h2>
        <div class="network-grid">
          <a href="#/campaigns"><strong>${reviewCount()}</strong><span>${t("toReview")}</span></a>
          <a href="#/campaigns"><strong>${approvedCount()}</strong><span>${t("scheduled")}</span></a>
          <a href="#/deliverability"><strong>${atRiskCount()}</strong><span>${t("atRisk")}</span></a>
          <a href="#/performance"><strong>${sends().filter((item) => effectiveStatus(item) === "done").length}</strong><span>${t("done")}</span></a>
        </div>
      </div>
      ${suppressionPanel()}
    </section>
  `;
}

// Read-only consent/suppression panel: recipients & segments removed by
// unsubscribe, hard bounce, or complaint. This is the human-visible side of the
// pre-send guard that excludes/blocks suppressed recipients.
function suppressionPanel() {
  const entries = suppressionEntries();
  return `
    <div class="overview-panel">
      <h2>${t("suppression")} <small class="muted">${entries.length}</small></h2>
      ${
        entries.length
          ? `<ul class="suppression-list">${entries
              .map((entry) => {
                const scope = entry.address
                  ? escapeHtml(entry.address)
                  : `${t("segment")}: ${escapeHtml(segmentName(entry.segment_id))}`;
                return `<li>
                  <span class="suppression-scope">${scope}</span>
                  <span class="risk-badge">${escapeHtml(enumLabel(entry.reason, "suppressionReason"))}</span>
                  <small class="muted">${dateTime(entry.suppressed_at)}</small>
                </li>`;
              })
              .join("")}</ul>`
          : `<div class="empty-inline">${t("suppressionEmpty")}</div>`
      }
    </div>
  `;
}

export function qualityGatePanel(gate) {
  if (!gate) return "";
  return `
    <div class="gate-panel gate-${escapeHtml(gate.verdict)}">
      <div class="gate-head">
        <h2>${t("qualityGate")}</h2>
        ${verdictBadge(gate.verdict)}
        <span class="gate-eqs">${t("eqs")}: <strong>${escapeHtml(String(gate.eqs))}</strong></span>
      </div>
      <p class="gate-summary">${escapeHtml(gate.summary || "")}</p>
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) => `
          <li class="${check.pass ? "pass" : "fail"}">
            <span class="gate-key">${escapeHtml(check.key)}</span>
            <span class="gate-label">${escapeHtml(check.label)}</span>
            <span class="gate-note">${escapeHtml(check.note || "")}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function variantPicker(send, disabled) {
  const variants = send.subject_variants || [];
  if (variants.length < 2) return "";
  const decision = decisionFor(send.send_id);
  const chosen = state.edits[send.send_id]?.chosen_variant ?? decision?.chosen_variant ?? "";
  return `
    <label class="queue-label">${t("chooseVariant")}</label>
    <div class="variant-list">
      ${variants
        .map(
          (variant) => `
        <label class="variant-option ${chosen === variant.id ? "chosen" : ""}">
          <input type="radio" name="variant-${escapeHtml(send.send_id)}" value="${escapeHtml(variant.id)}" ${chosen === variant.id ? "checked" : ""} ${disabled}>
          <span class="variant-id">${escapeHtml(variant.id.toUpperCase())}</span>
          <span class="variant-subject">${escapeHtml(variant.subject)}</span>
        </label>
      `,
        )
        .join("")}
    </div>
  `;
}

export function campaignFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const n = value === "all" ? sends().length : sends().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.campaignFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${n}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "campaigns" && state.route.id) renderCampaignDetail();
  else if (state.route.view === "campaigns") renderCampaigns();
  else if (state.route.view === "deliverability") renderDeliverability();
  else if (state.route.view === "performance") renderPerformance();
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
  localStorage.setItem("kelly-campaigns-language", state.lang);
  render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

syncResponsiveShell();

const PAGE_BINDINGS = {
  campaigns: { key: "sends", path: "snapshot.sends" },
  deliverability: { key: "sends", path: "snapshot.sends" },
  performance: { key: "sends", path: "snapshot.sends" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 100;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const binding = Object.values(PAGE_BINDINGS).find((entry) => entry.key === key);
  if (!binding) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  if (typeof render === "function") render();
  else route();
  try {
    const provider = await getProvider();
    let result;
    for (let next = state.pageCursors[key].length; next <= page; next += 1) {
      const cursor = state.pageCursors[key][next - 1];
      if (next > 1 && !cursor) return;
      result = await provider.fetchPage(key, cursor);
      state.pageCursors[key][next] = result.nextCursor;
    }
    if (!result || state.pageCursors[key].length > page + 1) {
      result = await provider.fetchPage(key, state.pageCursors[key][page - 1]);
      state.pageCursors[key][page] = result.nextCursor;
    }
    replacePageRows(binding.path, result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    if (typeof render === "function") render();
    else route();
  }
}

function pagerMessage(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  const current = state.currentPage?.[key] || 1;
  return `${loadedCount}${state.pageCursors?.[key]?.[current] ? "+" : ""}`;
}

export function pagerControl(key) {
  if (!state.pageCursors[key]) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const loading = Boolean(state.pageLoading[key]);
  const hasNext = total == null ? Boolean(state.pageCursors[key][current]) : current < total;
  if ((total === 1 || total == null) && current === 1 && !hasNext) return "";
  const pages =
    total == null
      ? []
      : total <= 7
        ? Array.from({ length: total }, (_, index) => index + 1)
        : [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort(
            (a, b) => a - b,
          );
  const items = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) items.push('<span class="pager-ellipsis">…</span>');
    items.push(
      `<button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`,
    );
    previous = page;
  }
  return `<nav class="pager" aria-label="${pagerMessage("pagination", "Pagination")}">
    <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${pagerMessage("prevPage", "Prev")}</button>
    ${items.join("")}
    <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${pagerMessage("nextPage", "Next")}</button>
    ${total == null ? "" : `<span class="pager-summary">${pagerMessage("pageOf", "Page {current} of {total}").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

document.querySelector("#content")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (!button) return;
  const [key, page] = button.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
});

boot();
