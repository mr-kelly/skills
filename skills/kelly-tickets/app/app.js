import { messages } from "./i18n/messages.js";
import {
  renderBoard,
  renderBoardDetail,
  renderDispatch,
  renderIntake,
  renderIntakeDetail,
  renderSettings,
  submitDecision,
} from "./js/ticket-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  dispatchFilter: "all",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-tickets-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-tickets.sidebarCollapsed";
export const BOARD_STATUSES = ["open", "assigned", "in_progress", "waiting", "resolved"];
export const DISPATCH_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "elevator",
  "security",
  "noise",
  "parking",
  "cleaning",
  "amenity",
  "other",
];
export const URGENCIES = ["urgent", "high", "normal", "low"];

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
  unclassifiedCount: document.querySelector("#count-unclassified"),
  slaCount: document.querySelector("#count-sla"),
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

export function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function nowMs() {
  if (state.demo && state.snapshot?.generated_at) return Date.parse(state.snapshot.generated_at);
  return Date.now();
}

export function formatAge(iso) {
  if (!iso) return "";
  const hours = Math.max(0, (nowMs() - Date.parse(iso)) / 3600000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}${t("hours")}`;
  return `${Math.floor(hours / 24)}d`;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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
  const route =
    scenario === "intake"
      ? "#/intake"
      : scenario === "dispatch"
        ? "#/dispatch"
        : scenario === "board"
          ? "#/board"
          : scenario === "detail"
            ? "#/board/T-1001"
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

function applyLocalDecision(item, kindStatuses = true) {
  const local = state.demoDecisions[item.id];
  if (!local) return item;
  let status = item.status;
  if (kindStatuses) {
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
  }
  return { ...item, status, decision: local, note_to_crew: local.draft ?? item.note_to_crew };
}

export function proposals() {
  const list = state.snapshot?.dispatch_proposals || [];
  if (!state.demo) return list;
  return list.map((proposal) => applyLocalDecision(proposal));
}

export function intakeItems() {
  const list = state.snapshot?.intake || [];
  if (!state.demo) return list;
  return list.map((item) => {
    const local = state.demoDecisions[item.id];
    if (!local) return item;
    const triage_state = local.action === "ignore" ? "ignored" : item.triage_state;
    return { ...item, triage_state, decision: local };
  });
}

export function tickets() {
  const list = state.snapshot?.tickets || [];
  if (!state.demo) return list;
  return list.map((ticket) => {
    const local = state.demoDecisions[ticket.id];
    if (!local) return ticket;
    return { ...ticket, decision: local, resolution_note: local.note || ticket.resolution_note };
  });
}

function crews() {
  return state.snapshot?.crews || [];
}

export function crewName(crewId) {
  return crews().find((crew) => crew.crew_id === crewId)?.name || crewId || "";
}

export function ticketById(ticketId) {
  return tickets().find((ticket) => ticket.id === ticketId);
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredIntake() {
  return intakeItems().filter((item) =>
    matchesQuery([
      item.text,
      item.reporter,
      item.unit,
      item.location,
      item.channel,
      item.category_guess,
      item.triage_state,
      item.ticket_id,
    ]),
  );
}

export function filteredTickets() {
  return tickets().filter((ticket) =>
    matchesQuery([
      ticket.id,
      ticket.title,
      ticket.category,
      ticket.unit,
      ticket.location,
      ticket.reporter,
      crewName(ticket.crew_id),
      ticket.status,
    ]),
  );
}

export function filteredProposals() {
  return proposals().filter((proposal) => {
    if (state.dispatchFilter !== "all" && proposal.status !== state.dispatchFilter) return false;
    return matchesQuery([
      proposal.title,
      proposal.summary,
      proposal.reason,
      proposal.ticket_id,
      crewName(proposal.proposed_crew_id),
      proposal.status,
      proposal.priority,
    ]);
  });
}

function slaAtRiskCount() {
  return tickets().filter(
    (ticket) => ticket.status !== "resolved" && ["at_risk", "breached"].includes(ticket.sla_state),
  ).length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = proposals().filter((proposal) => proposal.status === "needs_review").length;
  const unclassified = intakeItems().filter((item) => item.triage_state === "new").length;
  const slaCount = slaAtRiskCount();
  els.syncStatus.textContent = snapshot?.property?.name || t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.unclassifiedCount) els.unclassifiedCount.textContent = unclassified;
  if (els.slaCount) els.slaCount.textContent = slaCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("dispatchToApprove")}`
      : `${tickets().length} ${t("tickets")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "intake") return t("intake");
  if (view === "dispatch") return t("dispatch");
  if (view === "board") return t("board");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function channelBadge(channel) {
  return `<span class="badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function categoryBadge(category) {
  return `<span class="badge category-badge">${escapeHtml(enumLabel(category, "category"))}</span>`;
}

export function urgencyBadge(urgency) {
  return `<span class="badge urgency-${escapeHtml(urgency)}">${escapeHtml(enumLabel(urgency, "urgency"))}</span>`;
}

export function statusBadge(status, group) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status, group))}</span>`;
}

export function slaBadge(ticket) {
  const stateName = ticket.sla_state || "ok";
  const due = ticket.sla_due_at ? ` · ${date(ticket.sla_due_at)}` : "";
  return `<span class="badge sla-${escapeHtml(stateName)}" title="${t("slaTarget")}${escapeHtml(due)}">${escapeHtml(enumLabel(stateName, "sla"))}${due ? escapeHtml(due) : ""}</span>`;
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

function overviewAttention() {
  const reviewCount = proposals().filter((proposal) => proposal.status === "needs_review").length;
  const unclassified = intakeItems().filter((item) => item.triage_state === "new").length;
  const breaching = tickets().filter(
    (ticket) => ticket.status !== "resolved" && ticket.sla_state === "breached",
  ).length;
  return `
    <div class="attention-row">
      <a class="attention-card ${reviewCount ? "hot" : ""}" href="#/dispatch">
        <strong>${reviewCount}</strong>
        <span>${t("dispatchToApprove")}</span>
      </a>
      <a class="attention-card" href="#/intake">
        <strong>${unclassified}</strong>
        <span>${t("unclassified")}</span>
      </a>
      <a class="attention-card ${breaching ? "hot" : ""}" href="#/board">
        <strong>${breaching}</strong>
        <span>${t("slaBreaching")}</span>
      </a>
    </div>
  `;
}

function overviewMetrics() {
  const metrics = state.snapshot?.metrics || {};
  const byChannel = metrics.intake_by_channel || {};
  const channelBadges = Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([channel, count]) =>
        `<span class="badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))} ${count}</span>`,
    )
    .join(" ");
  return `
    <div class="metrics">
      <div class="metric"><span>${t("openTickets")}</span><strong>${metrics.open_tickets ?? 0}</strong></div>
      <div class="metric"><span>${t("avgResolution")}</span><strong>${metrics.avg_resolution_hours ?? 0}${t("hours")}</strong></div>
      <div class="metric"><span>${t("slaAtRisk")}</span><strong>${metrics.sla_at_risk ?? 0}</strong></div>
      <div class="metric"><span>${t("weekIntake")}</span><strong>${metrics.intake_count ?? 0}</strong><div class="channel-badges">${channelBadges}</div></div>
    </div>
  `;
}

function categoryDistributionSvg() {
  const counts = new Map();
  for (const ticket of tickets()) {
    counts.set(ticket.category, (counts.get(ticket.category) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">${t("empty")}</div>`;
  const max = entries[0][1];
  const rowHeight = 26;
  const labelWidth = 96;
  const barSpan = 190;
  const rows = entries
    .map(([category, count], index) => {
      const y = index * rowHeight;
      const width = Math.max(4, Math.round((count / max) * barSpan));
      return `
      <text x="${labelWidth - 8}" y="${y + 16}" text-anchor="end" class="svg-label">${escapeHtml(enumLabel(category, "category"))}</text>
      <rect x="${labelWidth}" y="${y + 6}" width="${barSpan}" height="12" rx="3" class="svg-track"></rect>
      <rect x="${labelWidth}" y="${y + 6}" width="${width}" height="12" rx="3" class="svg-bar"></rect>
      <text x="${labelWidth + barSpan + 8}" y="${y + 16}" class="svg-count">${count}</text>
    `;
    })
    .join("");
  return `
    <svg viewBox="0 0 320 ${entries.length * rowHeight}" role="img" aria-label="${t("categoryDistribution")}" class="category-svg" preserveAspectRatio="xMinYMin meet">
      ${rows}
    </svg>
  `;
}

function crewLoadPanel() {
  const openByCrew = new Map();
  for (const ticket of tickets()) {
    if (ticket.status === "resolved" || !ticket.crew_id) continue;
    openByCrew.set(ticket.crew_id, (openByCrew.get(ticket.crew_id) || 0) + 1);
  }
  const max = Math.max(1, ...openByCrew.values());
  return (
    crews()
      .map((crew) => {
        const count = openByCrew.get(crew.crew_id) || 0;
        return `
      <div class="crew-row">
        <span class="crew-name"><strong>${escapeHtml(crew.name)}</strong><small>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</small></span>
        <span class="crew-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
        <span class="crew-count">${count}</span>
      </div>
    `;
      })
      .join("") || `<div class="empty">${t("setupNeeded")}</div>`
  );
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${escapeText(state.snapshot?.property?.name || "")} · ${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  els.content.innerHTML = `
    ${overviewAttention()}
    ${warnings()}
    ${overviewMetrics()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("categoryDistribution")}</h2>
        ${categoryDistributionSvg()}
      </div>
      <div class="overview-panel">
        <h2>${t("crewLoad")}</h2>
        ${crewLoadPanel()}
      </div>
      <div class="overview-panel wide">
        <h2>${t("syncLog")}</h2>
        ${
          (state.snapshot?.sync_log || [])
            .slice(-6)
            .reverse()
            .map(
              (entry) => `
          <div class="log-row">
            <span class="badge">${escapeHtml(entry.source)}</span>
            <span class="log-detail">${escapeHtml(entry.detail || entry.action || "")}</span>
            <span class="muted">${date(entry.at)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "intake" && state.route.id) renderIntakeDetail();
  else if (state.route.view === "intake") renderIntake();
  else if (state.route.view === "dispatch") renderDispatch();
  else if (state.route.view === "board" && state.route.id) renderBoardDetail();
  else if (state.route.view === "board") renderBoard();
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

function escapeText(value) {
  return String(value ?? "");
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
els.content.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-dispatch-filter]");
  if (filterButton) {
    state.dispatchFilter = filterButton.dataset.dispatchFilter;
    render();
    return;
  }
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) {
    submitDecision(button.dataset.id, button.dataset.decision);
  }
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-tickets-language", state.lang);
  if (state.demo) {
    loadState();
    return;
  }
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
