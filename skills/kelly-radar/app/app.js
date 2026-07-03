import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-radar-language") || "auto"),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-radar.sidebarCollapsed";
const REFRESH_INTERVAL_MS = 30000;

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
  triageCount: document.querySelector("#count-triage"),
  briefsCount: document.querySelector("#count-briefs"),
  reportsCount: document.querySelector("#count-reports"),
  language: document.querySelector("#language")
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
  return String(lang || "auto").toLowerCase().startsWith("zh") ? "zh" : (lang || "auto");
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key]
    || messages.en.enum?.[group]?.[key]
    || key.replaceAll("_", " ");
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
  const route = scenario === "signals"
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

function signals() {
  return state.snapshot?.signals || [];
}

function watchlist() {
  return state.snapshot?.watchlist || [];
}

function research() {
  return state.snapshot?.research || { questions: [], briefs: [], reports: [] };
}

function trends() {
  return state.snapshot?.trends || { movers: [], opportunities: [] };
}

function signalRef(signalId) {
  const index = signals().findIndex((item) => item.signal_id === signalId);
  return index >= 0 ? `Signal #${index + 1}` : "";
}

function briefById(briefId) {
  return research().briefs.find((item) => item.brief_id === briefId);
}

function reportById(reportId) {
  return research().reports.find((item) => item.report_id === reportId);
}

function targetName(targetId) {
  return watchlist().find((item) => item.target_id === targetId)?.name || targetId;
}

function isLocked() {
  return Boolean(state.settings?.lock);
}

function attentionCounts() {
  const triage = signals().filter((item) => item.status === "needs_review").length;
  const briefs = research().briefs.filter((item) => item.status === "needs_review").length;
  const reports = research().questions.filter((item) => item.status === "report_ready").length;
  const followups = research().questions.reduce((sum, question) => sum + (question.followups || []).filter((fu) => fu.status !== "closed").length, 0);
  return { triage, briefs, reports, followups };
}

function renderShell() {
  applyI18n();
  const counts = attentionCounts();
  els.syncStatus.textContent = state.snapshot?.generated_at && state.snapshot.generated_at !== new Date(0).toISOString()
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

function statusBadge(status) {
  return `<span class="badge status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function kindBadge(kind) {
  return `<span class="badge kind ${escapeHtml(kind)}">${escapeHtml(enumLabel(kind, "source_kind"))}</span>`;
}

function lockBanner() {
  if (!isLocked()) return "";
  const lock = state.settings.lock;
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")} · ${escapeHtml(lock.message || "")}</span></div></div>`;
}

function demoBanner() {
  return state.settings?.demo ? `<div class="demo-note">${t("demoNote")}</div>` : "";
}

function sparkline(momentum = []) {
  if (!momentum.length) return "";
  const width = 96;
  const height = 26;
  const max = Math.max(...momentum);
  const min = Math.min(...momentum);
  const span = max - min || 1;
  const step = width / Math.max(momentum.length - 1, 1);
  const points = momentum
    .map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`)
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function deltaArrow(delta) {
  const value = Number(delta || 0);
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}%</span>`;
}

/* ---------- Overview ---------- */

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}` : t("empty");
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
        ${topSignals.map((item) => `
          <a class="signal-row" href="#/signals/${encodeURIComponent(item.signal_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.headline)}</strong>
              <small>${escapeHtml(targetName(item.target_id))} · ${date(item.detected_at)}</small>
            </span>
            ${severityBadge(item.severity)}
            ${statusBadge(item.status)}
          </a>
        `).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="overview-panel">
        <h2>${t("freshness")}</h2>
        ${watchlist().map((item) => `
          <a class="freshness-row" href="#/watchlist/${encodeURIComponent(item.target_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(enumLabel(item.type, "target_type"))} · ${item.signals_7d} ${t("signalsWeek")}</small>
            </span>
            <span class="muted">${dateTime(item.last_check_at)}</span>
            ${statusBadge(item.status)}
          </a>
        `).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="overview-panel">
        <h2>${t("topMovers")}</h2>
        ${movers.map((item) => `
          <a class="mover-row" href="#/trends">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.keyword)}</strong>
              <small>${escapeHtml(enumLabel(item.source, "source_kind"))}</small>
            </span>
            ${sparkline(item.momentum)}
            ${deltaArrow(item.delta_pct)}
          </a>
        `).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="overview-panel">
        <h2>${t("researchPipeline")}</h2>
        <div class="pipeline">
          ${pipeline.map((stage) => `
            <div class="pipeline-stage">
              <strong>${questions.filter((question) => question.status === stage || (stage === "closed" && question.status === "annotated")).length}</strong>
              <span>${escapeHtml(enumLabel(stage))}</span>
            </div>
          `).join("")}
        </div>
        ${questions.filter((question) => question.status !== "closed").slice(0, 3).map((question) => `
          <a class="freshness-row" href="#/research/${encodeURIComponent(question.question_id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(question.question)}</strong>
              <small>${escapeHtml(enumLabel(question.depth, "depth"))} · ${date(question.asked_at)}</small>
            </span>
            ${statusBadge(question.status)}
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

/* ---------- Signals ---------- */

function filteredSignals() {
  const query = state.query.trim().toLowerCase();
  if (!query) return signals();
  return signals().filter((item) => [item.headline, item.summary, item.source_kind, item.severity, item.status, targetName(item.target_id)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query)));
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
          ${items.map((item) => `
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
          `).join("")}
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
  const items = watchlist().filter((item) => !query || [item.name, item.type, item.status, item.notes].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
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
          ${items.map((item) => `
            <tr>
              <td><a href="#/watchlist/${encodeURIComponent(item.target_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted clamp">${escapeHtml(item.notes || "")}</div></td>
              <td><span class="badge">${escapeHtml(enumLabel(item.type, "target_type"))}</span></td>
              <td>${(item.sources || []).map((source) => kindBadge(source.kind)).join(" ")}</td>
              <td class="muted">${dateTime(item.last_check_at)}</td>
              <td class="num">${item.signals_7d ?? 0}</td>
              <td>${statusBadge(item.status)}</td>
            </tr>
          `).join("")}
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
                ${(item.sources || []).map((source) => `
                  <tr>
                    <td><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.url)}</a></td>
                    <td>${kindBadge(source.kind)}</td>
                    <td>${escapeHtml(enumLabel(source.method, "method"))}</td>
                    <td class="muted">${dateTime(source.last_check_at)}</td>
                    <td class="muted">${dateTime(source.last_change_at)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <h2>${t("recentSignals")}</h2>
          ${history.map((signal) => `
            <a class="signal-row" href="#/signals/${encodeURIComponent(signal.signal_id)}">
              <span class="signal-row-main">
                <strong>${escapeHtml(signal.headline)}</strong>
                <small>${escapeHtml(signalRef(signal.signal_id))} · ${dateTime(signal.detected_at)}</small>
              </span>
              ${severityBadge(signal.severity)}
              ${statusBadge(signal.status)}
            </a>
          `).join("") || `<div class="empty-inline">${t("empty")}</div>`}
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

/* ---------- Research ---------- */

function renderResearch() {
  els.title.textContent = t("research");
  const questions = research().questions;
  const query = state.query.trim().toLowerCase();
  const items = questions.filter((item) => !query || [item.question, item.status, item.depth].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  els.subtitle.textContent = `${items.length} ${t("questions").toLowerCase()}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${t("question")}</th><th>${t("status")}</th><th>${t("depth")}</th><th>${t("askedAt")}</th><th>${t("costNote")}</th></tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td><a href="#/research/${encodeURIComponent(item.question_id)}"><span class="strong">${escapeHtml(item.question)}</span></a></td>
              <td>${statusBadge(item.status)}</td>
              <td>${escapeHtml(enumLabel(item.depth, "depth"))}</td>
              <td class="muted">${date(item.asked_at)}</td>
              <td class="muted">${escapeHtml(item.cost_note || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${items.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function briefStagePanel(question, brief) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `
    <div class="panel">
      <div class="detail-head">
        <h2>${t("briefFor")}</h2>
        ${statusBadge(brief.status)}
        <span class="muted">${escapeHtml(enumLabel(brief.depth, "depth"))} · ${dateTime(brief.drafted_at)}</span>
      </div>
      <h3>${t("scope")}</h3>
      <p>${escapeHtml(brief.scope)}</p>
      <h3>${t("plannedSources")}</h3>
      <ul>${(brief.planned_sources || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      <h3>${t("expectedDeliverable")}</h3>
      <p>${escapeHtml(brief.expected_deliverable || "")}</p>
      ${brief.notes ? `<p class="muted">${escapeHtml(brief.notes)}</p>` : ""}
    </div>
    <div class="panel">
      <h2>${t("triage")}</h2>
      <div class="action-row">
        <button type="button" class="action primary" data-action="approve" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("approveBrief")}</button>
        <button type="button" class="action" data-action="request_changes" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="action" data-action="block" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("block")}</button>
      </div>
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      <textarea id="review-note" class="review-note" placeholder="${t("reviewNote")}">${escapeHtml(brief.triage?.comment || "")}</textarea>
      <div id="decision-feedback" class="muted decision-feedback"></div>
    </div>
  `;
}

function reportStagePanel(question, report) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  const sourceIndex = new Map((report.sources || []).map((source, index) => [source.source_id, index + 1]));
  const confidence = Number(report.confidence || 0);
  return `
    <div class="panel">
      <div class="detail-head">
        <h2>${t("reportFor")}</h2>
        <span class="muted">${t("filedAt")} ${dateTime(report.filed_at)}</span>
      </div>
      <h3 class="report-title">${escapeHtml(report.title)}</h3>
      <p>${escapeHtml(report.summary)}</p>
      ${(report.sections || []).map((section) => `
        <section class="report-section">
          <h3>${escapeHtml(section.heading)}</h3>
          <p>${escapeHtml(section.body)}</p>
          <div class="citation-chips">
            ${(section.source_ids || []).map((sourceId) => {
              const index = sourceIndex.get(sourceId);
              const source = (report.sources || []).find((entry) => entry.source_id === sourceId);
              return source ? `<a class="citation-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(source.title)}">[${index}] ${escapeHtml(source.title)}</a>` : "";
            }).join("")}
          </div>
          ${(report.annotations || []).filter((annotation) => annotation.section_id === section.section_id).map((annotation) => `
            <div class="annotation"><strong>${escapeHtml(annotation.author)}</strong> · ${dateTime(annotation.at)}<p>${escapeHtml(annotation.text)}</p></div>
          `).join("")}
        </section>
      `).join("")}
      <h3>${t("sources")}</h3>
      <ol class="source-list">
        ${(report.sources || []).map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a></li>`).join("")}
      </ol>
    </div>
    <div class="panel">
      <h2>${t("rateConfidence")}</h2>
      <div class="action-row confidence-row">
        ${[1, 2, 3, 4, 5].map((value) => `
          <button type="button" class="action confidence ${confidence >= value ? "filled" : ""}" data-action="approve" data-kind="report" data-id="${escapeHtml(report.report_id)}" data-confidence="${value}" ${disabled} title="${t("confidence")} ${value}/5">${value}</button>
        `).join("")}
        <span class="muted">${t("confidence")}: ${confidence || "—"}/5</span>
      </div>
      <label class="note-label" for="followup-input">${t("followups")}</label>
      <textarea id="followup-input" class="review-note" placeholder="${t("followUpPlaceholder")}"></textarea>
      <div class="action-row">
        <button type="button" class="action primary" id="file-followup" data-question="${escapeHtml(question.question_id)}" ${disabled}>${t("askFollowup")}</button>
      </div>
      ${(question.followups || []).map((fu) => `
        <div class="followup-row"><span>${escapeHtml(fu.question)}</span>${statusBadge(fu.status)}</div>
      `).join("")}
      <div id="decision-feedback" class="muted decision-feedback"></div>
    </div>
  `;
}

function renderResearchDetail() {
  const question = research().questions.find((item) => item.question_id === state.route.id);
  if (!question) {
    renderResearch();
    return;
  }
  const brief = briefById(question.brief_id);
  const report = reportById(question.report_id);
  const briefStage = question.status === "brief_needs_review" && brief;
  els.title.textContent = question.question;
  els.subtitle.textContent = `${enumLabel(question.status)} · ${enumLabel(question.depth, "depth")} · ${t("askedAt")} ${date(question.asked_at)}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        ${briefStage ? briefStagePanel(question, brief) : ""}
        ${!briefStage && report ? reportStagePanel(question, report) : ""}
        ${!briefStage && !report ? `<div class="panel"><h2>${escapeHtml(enumLabel(question.status))}</h2><p class="muted">${escapeHtml(brief?.scope || "")}</p></div>` : ""}
      </div>
      <aside class="detail-side">
        <h2>${t("question")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${escapeHtml(enumLabel(question.status))}</dd>
          <dt>${t("depth")}</dt><dd>${escapeHtml(enumLabel(question.depth, "depth"))}</dd>
          <dt>${t("askedAt")}</dt><dd>${date(question.asked_at)}</dd>
          <dt>${t("costNote")}</dt><dd>${escapeHtml(question.cost_note || "")}</dd>
          ${question.confidence ? `<dt>${t("confidence")}</dt><dd>${question.confidence}/5</dd>` : ""}
        </dl>
        ${brief && !briefStage ? `<h2>${t("briefFor")}</h2><p class="muted">${escapeHtml(brief.scope)}</p>` : ""}
      </aside>
    </section>
  `;
  bindDecisionButtons();
  bindFollowup();
}

/* ---------- Trends ---------- */

function renderTrends() {
  els.title.textContent = t("trends");
  const { movers, opportunities } = trends();
  const query = state.query.trim().toLowerCase();
  const items = movers.filter((item) => !query || [item.keyword, item.source].some((value) => String(value).toLowerCase().includes(query)));
  els.subtitle.textContent = `${items.length} ${t("topMovers").toLowerCase()} · ${opportunities.length} ${t("opportunityCards").toLowerCase()}`;
  const opportunityById = new Map(opportunities.map((item) => [item.opportunity_id, item]));
  const disabled = isLocked() || state.saving ? "disabled" : "";
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${t("keyword")}</th><th>${t("source")}</th><th>${t("volume")}</th><th>${t("delta")}</th><th>${t("momentum")}</th><th>${t("opportunity")}</th></tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const opportunity = opportunityById.get(item.opportunity_id);
            return `
              <tr>
                <td><span class="strong">${escapeHtml(item.keyword)}</span></td>
                <td>${kindBadge(item.source)}</td>
                <td class="num">${Number(item.volume_proxy).toLocaleString()}</td>
                <td>${deltaArrow(item.delta_pct)}</td>
                <td><span class="spark-cell">${sparkline(item.momentum)}</span></td>
                <td>${opportunity ? statusBadge(opportunity.status) : `<span class="muted">${t("noOpportunity")}</span>`}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <h2 class="section-heading">${t("opportunityCards")}</h2>
    <div class="opportunity-grid">
      ${opportunities.map((item) => `
        <div class="opportunity-card">
          <div class="detail-head">
            ${statusBadge(item.status)}
            <span class="muted">${date(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.rationale)}</p>
          <div class="handoff-chip">${t("proposedNextStep")}: <strong>${escapeHtml(enumLabel(item.proposed_next_step?.operation, "operation"))}</strong><br>${escapeHtml(item.proposed_next_step?.summary || "")}</div>
          <div class="action-row">
            ${item.status === "needs_review" ? `
              <button type="button" class="action primary" data-action="approve" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("approve")}</button>
              <button type="button" class="action" data-action="ignore" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("ignore")}</button>
            ` : `<span class="muted">${escapeHtml(item.triage?.comment || "")}</span>`}
          </div>
        </div>
      `).join("") || `<div class="empty">${t("empty")}</div>`}
    </div>
    <div id="decision-feedback" class="muted decision-feedback"></div>
  `;
  bindDecisionButtons();
}

/* ---------- Settings ---------- */

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const defaults = summary.research_defaults || {};
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("cadence")}</dt><dd>${escapeHtml(Object.entries(summary.cadence || {}).map(([key, value]) => `${key}: ${value}`).join(" · ") || "—")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("products")}</h2>
        ${(summary.profile?.products || []).map((product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.positioning)}</span>
          </div>
        `).join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("watchlist")}</h2>
        ${(summary.watchlist || []).map((target) => `
          <div class="settings-row">
            <strong>${escapeHtml(target.name)}</strong>
            <span>${escapeHtml(enumLabel(target.type, "target_type"))} · ${target.source_count} ${t("sources").toLowerCase()}</span>
            <span>${(target.methods || []).map((method) => escapeHtml(enumLabel(method, "method"))).join(", ")}</span>
          </div>
        `).join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("researchDefaults")}</h2>
        <dl>
          <dt>${t("depth")}</dt><dd>${escapeHtml(enumLabel(defaults.default_depth, "depth"))}</dd>
          <dt>${t("sourcePolicy")}</dt><dd>${escapeHtml(defaults.source_policy || "")}</dd>
          <dt>${t("requireCitations")}</dt><dd>${defaults.require_citations ? "✓" : "✗"}</dd>
          <dt>${t("maxSources")}</dt><dd>${defaults.max_sources || "—"}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("trendSources")}</h2>
        ${(summary.trend_sources || []).map((source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${kindBadge(source.kind)}</span>
            <span>${escapeHtml(enumLabel(source.method, "method"))}</span>
          </div>
        `).join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("envReadiness")}</h2>
        ${(summary.env_readiness || []).map((entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.name)}</strong>
            <span class="${entry.ready ? "positive" : "negative"}">${entry.ready ? t("ready") : t("missing")}</span>
          </div>
        `).join("") || `<div class="empty-inline">—</div>`}
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${(state.snapshot?.sync_log || []).slice(0, 8).map((entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.action)}</strong>
            <span>${escapeHtml(entry.detail)}</span>
            <span class="muted">${dateTime(entry.at)}</span>
          </div>
        `).join("")}
      </section>
    </div>
  `;
}

/* ---------- Decisions ---------- */

function bindDecisionButtons() {
  els.content.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const note = els.content.querySelector("#review-note")?.value || "";
      submitDecision({
        kind: button.dataset.kind,
        id: button.dataset.id,
        action: button.dataset.action,
        comment: note,
        confidence: button.dataset.confidence ? Number(button.dataset.confidence) : undefined
      });
    });
  });
}

function bindFollowup() {
  const button = els.content.querySelector("#file-followup");
  if (!button) return;
  button.addEventListener("click", async () => {
    const input = els.content.querySelector("#followup-input");
    const question = input?.value.trim();
    if (!question) return;
    state.saving = true;
    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question_id: button.dataset.question, question, demo: Boolean(state.settings?.demo) })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `Request failed: ${res.status}`);
      if (state.settings?.demo) {
        const target = research().questions.find((item) => item.question_id === button.dataset.question);
        if (target) {
          target.followups = target.followups || [];
          target.followups.push({ followup_id: `fu-${Date.now()}`, question, status: "queued", asked_at: new Date().toISOString() });
        }
        render();
      } else {
        await loadState();
      }
    } catch (error) {
      showFeedback(error.message);
    } finally {
      state.saving = false;
    }
  });
}

async function submitDecision(payload) {
  if (state.saving) return;
  state.saving = true;
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, demo: Boolean(state.settings?.demo) })
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || `Request failed: ${res.status}`);
    if (state.settings?.demo) {
      applyLocalDecision(payload);
      render();
    } else {
      await loadState();
    }
  } catch (error) {
    showFeedback(error.message);
  } finally {
    state.saving = false;
  }
}

function statusForAction(action) {
  if (action === "approve") return "approved";
  if (action === "watch") return "needs_review";
  if (action === "ignore") return "done";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  return "needs_review";
}

function applyLocalDecision({ kind, id, action, comment, confidence }) {
  const triage = { kind, action, status: statusForAction(action), comment: comment || "", decided_at: new Date().toISOString() };
  if (kind === "signal") {
    const item = signals().find((signal) => signal.signal_id === id);
    if (item) Object.assign(item, { status: triage.status, triage });
  } else if (kind === "brief") {
    const item = briefById(id);
    if (item) Object.assign(item, { status: triage.status, triage });
    const question = research().questions.find((entry) => entry.brief_id === id);
    if (question && question.status === "brief_needs_review") {
      if (action === "approve") question.status = "researching";
      if (action === "block") question.status = "closed";
    }
  } else if (kind === "opportunity") {
    const item = trends().opportunities.find((entry) => entry.opportunity_id === id);
    if (item) Object.assign(item, { status: triage.status, triage });
  } else if (kind === "report") {
    const item = reportById(id);
    if (item) {
      item.triage = triage;
      if (confidence !== undefined) item.confidence = confidence;
      const question = research().questions.find((entry) => entry.report_id === id);
      if (question) question.confidence = confidence ?? question.confidence;
    }
  }
}

function showFeedback(message) {
  const node = els.content.querySelector("#decision-feedback");
  if (node) node.textContent = message;
}

/* ---------- Render ---------- */

function render() {
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
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
