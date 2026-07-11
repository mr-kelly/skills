import { messages } from "./i18n/messages.js";
import {
  bindDecisionButtons,
  renderResearch,
  renderResearchDetail,
  renderSettings,
  renderTrends,
} from "./js/research-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-radar-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-radar.sidebarCollapsed";
const REFRESH_INTERVAL_MS = 30000;

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
  triageCount: document.querySelector("#count-triage"),
  briefsCount: document.querySelector("#count-briefs"),
  reportsCount: document.querySelector("#count-reports"),
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

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
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

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
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
    scenario === "signals"
      ? "#/signals"
      : scenario === "detail"
        ? "#/signals/sig-formora-pricing"
        : scenario === "research"
          ? "#/research"
          : scenario === "trends"
            ? "#/trends"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

export function signals() {
  return state.snapshot?.signals || [];
}

function watchlist() {
  return state.snapshot?.watchlist || [];
}

export function research() {
  return state.snapshot?.research || { questions: [], briefs: [], reports: [] };
}

export function trends() {
  return state.snapshot?.trends || { movers: [], opportunities: [] };
}

function signalRef(signalId) {
  const index = signals().findIndex((item) => item.signal_id === signalId);
  return index >= 0 ? `Signal #${index + 1}` : "";
}

export function briefById(briefId) {
  return research().briefs.find((item) => item.brief_id === briefId);
}

export function reportById(reportId) {
  return research().reports.find((item) => item.report_id === reportId);
}

function targetName(targetId) {
  return watchlist().find((item) => item.target_id === targetId)?.name || targetId;
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function attentionCounts() {
  const triage = signals().filter((item) => item.status === "needs_review").length;
  const briefs = research().briefs.filter((item) => item.status === "needs_review").length;
  const reports = research().questions.filter((item) => item.status === "report_ready").length;
  const followups = research().questions.reduce(
    (sum, question) => sum + (question.followups || []).filter((fu) => fu.status !== "closed").length,
    0,
  );
  return { triage, briefs, reports, followups };
}

function renderShell() {
  applyI18n();
  const counts = attentionCounts();
  els.syncStatus.textContent =
    state.snapshot?.generated_at && state.snapshot.generated_at !== new Date(0).toISOString()
      ? `${signals().length} ${t("signals").toLowerCase()} · ${watchlist().length} ${t("watchTargets")}`
      : t("empty");
  if (els.triageCount) els.triageCount.textContent = counts.triage;
  if (els.briefsCount) els.briefsCount.textContent = counts.briefs;
  if (els.reportsCount) els.reportsCount.textContent = counts.reports;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = counts.triage
      ? `${counts.triage} ${t("signalsToTriage")}`
      : `${signals().length} ${t("signals").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "signals") return t("signals");
  if (view === "watchlist") return t("watchlist");
  if (view === "research") return t("research");
  if (view === "trends") return t("trends");
  if (view === "settings") return t("settings");
  return t("overview");
}

function severityBadge(severity) {
  return `<span class="badge severity ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function statusBadge(status) {
  return `<span class="badge status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function kindBadge(kind) {
  return `<span class="badge kind ${escapeHtml(kind)}">${escapeHtml(enumLabel(kind, "source_kind"))}</span>`;
}

export function lockBanner() {
  if (!isLocked()) return "";
  const lock = state.settings.lock;
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")} · ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function demoBanner() {
  return state.settings?.demo ? `<div class="demo-note">${t("demoNote")}</div>` : "";
}

export function sparkline(momentum = []) {
  if (!momentum.length) return "";
  const width = 96;
  const height = 26;
  const max = Math.max(...momentum);
  const min = Math.min(...momentum);
  const span = max - min || 1;
  const step = width / Math.max(momentum.length - 1, 1);
  const points = momentum
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function deltaArrow(delta) {
  const value = Number(delta || 0);
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}%</span>`;
}

/* ---------- Overview ---------- */

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const counts = attentionCounts();
  const topSignals = signals()
    .filter((item) => item.status === "needs_review" || item.severity === "high")
    .slice(0, 5);
  const movers = [...trends().movers].sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct)).slice(0, 5);
  const pipeline = ["brief_needs_review", "researching", "report_ready", "closed"];
  const questions = research().questions;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="metrics">
      <a class="metric" href="#/signals"><span>${t("signalsToTriage")}</span><strong>${counts.triage}</strong></a>
      <a class="metric" href="#/research"><span>${t("briefsAwaiting")}</span><strong>${counts.briefs}</strong></a>
      <a class="metric" href="#/research"><span>${t("reportsReady")}</span><strong>${counts.reports}</strong></a>
      <a class="metric" href="#/research"><span>${t("followupsRunning")}</span><strong>${counts.followups}</strong></a>
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("topSignals")}</h2>
        ${
          topSignals
            .map(
              (item) => `
          <a class="signal-row" href="#/signals/${encodeURIComponent(item.signal_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.headline)}</strong>
              <small>${escapeHtml(targetName(item.target_id))} · ${date(item.detected_at)}</small>
            </span>
            ${severityBadge(item.severity)}
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("freshness")}</h2>
        ${
          watchlist()
            .map(
              (item) => `
          <a class="freshness-row" href="#/watchlist/${encodeURIComponent(item.target_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(enumLabel(item.type, "target_type"))} · ${item.signals_7d} ${t("signalsWeek")}</small>
            </span>
            <span class="muted">${dateTime(item.last_check_at)}</span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("topMovers")}</h2>
        ${
          movers
            .map(
              (item) => `
          <a class="mover-row" href="#/trends">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.keyword)}</strong>
              <small>${escapeHtml(enumLabel(item.source, "source_kind"))}</small>
            </span>
            ${sparkline(item.momentum)}
            ${deltaArrow(item.delta_pct)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("researchPipeline")}</h2>
        <div class="pipeline">
          ${pipeline
            .map(
              (stage) => `
            <div class="pipeline-stage">
              <strong>${questions.filter((question) => question.status === stage || (stage === "closed" && question.status === "annotated")).length}</strong>
              <span>${escapeHtml(enumLabel(stage))}</span>
            </div>
          `,
            )
            .join("")}
        </div>
        ${questions
          .filter((question) => question.status !== "closed")
          .slice(0, 3)
          .map(
            (question) => `
          <a class="freshness-row" href="#/research/${encodeURIComponent(question.question_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(question.question)}</strong>
              <small>${escapeHtml(enumLabel(question.depth, "depth"))} · ${date(question.asked_at)}</small>
            </span>
            ${statusBadge(question.status)}
          </a>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

/* ---------- Signals ---------- */

function filteredSignals() {
  const query = state.query.trim().toLowerCase();
  if (!query) return signals();
  return signals().filter((item) =>
    [item.headline, item.summary, item.source_kind, item.severity, item.status, targetName(item.target_id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderSignals() {
  els.title.textContent = t("signals");
  const items = filteredSignals();
  const triage = items.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${items.length} ${t("signals").toLowerCase()} · ${triage} ${t("signalsToTriage")}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th><th>${t("source")}</th><th>${t("target")}</th><th>${t("headline")}</th><th>${t("severity")}</th><th>${t("detected")}</th><th>${t("triage")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td class="muted ref-cell">${escapeHtml(signalRef(item.signal_id))}</td>
              <td>${kindBadge(item.source_kind)}</td>
              <td><a href="#/watchlist/${encodeURIComponent(item.target_id)}">${escapeHtml(targetName(item.target_id))}</a></td>
              <td>
                <a href="#/signals/${encodeURIComponent(item.signal_id)}"><span class="strong">${escapeHtml(item.headline)}</span></a>
                <div class="muted clamp">${escapeHtml(item.summary)}</div>
              </td>
              <td>${severityBadge(item.severity)}</td>
              <td class="muted">${dateTime(item.detected_at)}</td>
              <td>${statusBadge(item.status)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${items.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function diffPanel(diff) {
  if (!diff?.lines?.length) return "";
  return `
    <div class="diff-panel">
      <div class="diff-labels"><span>${escapeHtml(diff.before_label || "before")}</span><span>${escapeHtml(diff.after_label || "after")}</span></div>
      <div class="diff-lines">
        ${diff.lines.map((line) => `<div class="diff-line ${escapeHtml(line.type)}"><span class="diff-sign">${line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}</span>${escapeHtml(line.text)}</div>`).join("")}
      </div>
    </div>
  `;
}

function triageButtons(item) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `
    <div class="action-row">
      <button type="button" class="action primary" data-action="approve" data-kind="signal" data-id="${escapeHtml(item.signal_id)}" ${disabled} title="${t("act")} — approve and queue the handoff">${t("act")}</button>
      <button type="button" class="action" data-action="watch" data-kind="signal" data-id="${escapeHtml(item.signal_id)}" ${disabled} title="${t("watch")} — leave in review with a note">${t("watch")}</button>
      <button type="button" class="action" data-action="ignore" data-kind="signal" data-id="${escapeHtml(item.signal_id)}" ${disabled} title="${t("ignore")} — mark done, no action">${t("ignore")}</button>
      <button type="button" class="action" data-action="block" data-kind="signal" data-id="${escapeHtml(item.signal_id)}" ${disabled} title="${t("needsInfo")} — blocked until the agent collects more">${t("needsInfo")}</button>
    </div>
  `;
}

function renderSignalDetail() {
  const item = signals().find((signal) => signal.signal_id === state.route.id);
  if (!item) {
    renderSignals();
    return;
  }
  els.title.textContent = item.headline;
  els.subtitle.textContent = `${signalRef(item.signal_id)} · ${targetName(item.target_id)} · ${enumLabel(item.source_kind, "source_kind")}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="detail-head">
          ${kindBadge(item.source_kind)}
          ${severityBadge(item.severity)}
          ${statusBadge(item.status)}
          <span class="muted">${t("detected")} ${dateTime(item.detected_at)}</span>
        </div>
        <div class="panel">
          <h2>${t("changeSummary")}</h2>
          <p>${escapeHtml(item.summary)}</p>
          ${diffPanel(item.diff)}
        </div>
        <div class="panel why-panel">
          <h2>${t("whyItMatters")}</h2>
          <p>${escapeHtml(item.why_it_matters || "")}</p>
          ${item.handoff ? `<div class="handoff-chip">${t("proposedNextStep")}: <strong>${escapeHtml(enumLabel(item.handoff.operation, "operation"))}</strong> · ${escapeHtml(item.handoff.summary || "")}</div>` : ""}
        </div>
        <div class="panel">
          <h2>${t("triage")}</h2>
          ${triageButtons(item)}
          <label class="note-label" for="review-note">${t("reviewNote")}</label>
          <textarea id="review-note" class="review-note" placeholder="${t("reviewNote")}">${escapeHtml(item.triage?.comment || "")}</textarea>
          <div id="decision-feedback" class="muted decision-feedback"></div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("evidence")}</h2>
        <ul class="evidence-list">
          ${(item.evidence || []).map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(entry.title)}</a></li>`).join("") || `<li class="muted">—</li>`}
        </ul>
        <h2>${t("target")}</h2>
        <dl>
          <dt>${t("target")}</dt><dd><a href="#/watchlist/${encodeURIComponent(item.target_id)}">${escapeHtml(targetName(item.target_id))}</a></dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(item.source_id)}</dd>
          <dt>${t("status")}</dt><dd>${escapeHtml(enumLabel(item.status))}</dd>
          ${item.triage?.decided_at ? `<dt>${t("triage")}</dt><dd>${escapeHtml(enumLabel(item.triage.action, "action"))} · ${dateTime(item.triage.decided_at)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
  bindDecisionButtons();
}

/* ---------- Watchlist ---------- */

function renderWatchlist() {
  els.title.textContent = t("watchlist");
  els.subtitle.textContent = `${watchlist().length} ${t("watchTargets")}`;
  const query = state.query.trim().toLowerCase();
  const items = watchlist().filter(
    (item) =>
      !query ||
      [item.name, item.type, item.status, item.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
  );
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("target")}</th><th>${t("type")}</th><th>${t("sourcesMonitored")}</th><th>${t("lastCheck")}</th><th>${t("signalsWeek")}</th><th>${t("status")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/watchlist/${encodeURIComponent(item.target_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted clamp">${escapeHtml(item.notes || "")}</div></td>
              <td><span class="badge">${escapeHtml(enumLabel(item.type, "target_type"))}</span></td>
              <td>${(item.sources || []).map((source) => kindBadge(source.kind)).join(" ")}</td>
              <td class="muted">${dateTime(item.last_check_at)}</td>
              <td class="num">${item.signals_7d ?? 0}</td>
              <td>${statusBadge(item.status)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${items.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function renderWatchTargetDetail() {
  const item = watchlist().find((target) => target.target_id === state.route.id);
  if (!item) {
    renderWatchlist();
    return;
  }
  const history = signals().filter((signal) => signal.target_id === item.target_id);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${enumLabel(item.type, "target_type")} · ${history.length} ${t("signals").toLowerCase()}`;
  els.content.innerHTML = `
    ${demoBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("sourcesMonitored")}</h2>
          <div class="table-wrap inner">
            <table>
              <thead><tr><th>${t("source")}</th><th>${t("type")}</th><th>${t("method")}</th><th>${t("lastCheck")}</th><th>${t("lastChange")}</th></tr></thead>
              <tbody>
                ${(item.sources || [])
                  .map(
                    (source) => `
                  <tr>
                    <td><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.url)}</a></td>
                    <td>${kindBadge(source.kind)}</td>
                    <td>${escapeHtml(enumLabel(source.method, "method"))}</td>
                    <td class="muted">${dateTime(source.last_check_at)}</td>
                    <td class="muted">${dateTime(source.last_change_at)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <h2>${t("recentSignals")}</h2>
          ${
            history
              .map(
                (signal) => `
            <a class="signal-row" href="#/signals/${encodeURIComponent(signal.signal_id)}">
              <span class="signal-row-main">
                <strong>${escapeHtml(signal.headline)}</strong>
                <small>${escapeHtml(signalRef(signal.signal_id))} · ${dateTime(signal.detected_at)}</small>
              </span>
              ${severityBadge(signal.severity)}
              ${statusBadge(signal.status)}
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("empty")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("notes")}</h2>
        <p>${escapeHtml(item.notes || "—")}</p>
        <dl>
          <dt>${t("type")}</dt><dd>${escapeHtml(enumLabel(item.type, "target_type"))}</dd>
          <dt>${t("status")}</dt><dd>${escapeHtml(enumLabel(item.status))}</dd>
          <dt>${t("lastCheck")}</dt><dd>${dateTime(item.last_check_at)}</dd>
          <dt>${t("signalsWeek")}</dt><dd>${item.signals_7d ?? 0}</dd>
        </dl>
      </aside>
    </section>
  `;
}

/* ---------- Render ---------- */

export function render() {
  renderShell();
  if (state.route.view === "signals" && state.route.id) renderSignalDetail();
  else if (state.route.view === "signals") renderSignals();
  else if (state.route.view === "watchlist" && state.route.id) renderWatchTargetDetail();
  else if (state.route.view === "watchlist") renderWatchlist();
  else if (state.route.view === "research" && state.route.id) renderResearchDetail();
  else if (state.route.view === "research") renderResearch();
  else if (state.route.view === "trends") renderTrends();
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

function isEditing() {
  const active = document.activeElement;
  return active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type !== "search"));
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
  localStorage.setItem("kelly-radar-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
  } else {
    render();
  }
});

setInterval(() => {
  if (state.demo || state.saving || isEditing()) return;
  loadState().catch(() => {});
}, REFRESH_INTERVAL_MS);

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
