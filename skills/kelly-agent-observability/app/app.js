import { loadMessages, messages } from "./i18n/messages.js";

const state = {
  fleet: null,
  summary: null,
  handoffs: [],
  bootstrap: null,
  route: parseRoute(),
  query: "",
  sort: { key: "calls_24h", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-agent-observability-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-observability.sidebarCollapsed";

const STATUS_COLORS = {
  healthy: "#1f7a4d",
  degraded: "#9c5a12",
  critical: "#b33434",
};

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
  degradedCount: document.querySelector("#summary-degraded-count"),
  agentCount: document.querySelector("#count-agents"),
  handoffCount: document.querySelector("#count-handoffs"),
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

function tNested(group, key) {
  return messages[activeLang()]?.[group]?.[key] || messages.en[group]?.[key] || key;
}

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2,
  }).format(n);
}

function num(value, digits = 0) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function ms(value) {
  const n = Number(value || 0);
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

function statusClass(status) {
  return status === "critical" ? "negative" : status === "degraded" ? "warn" : "positive";
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
  state.fleet = data.fleet;
  state.summary = data.summary;
  state.bootstrap = data;
  if (!state.demo) {
    const handoffsRes = await fetch("/api/handoffs", { cache: "no-store" });
    state.handoffs = handoffsRes.ok ? (await handoffsRes.json()).handoffs : [];
  } else {
    state.handoffs = [];
  }
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.bootstrap?.demo || location.hash) return;
  const scenario = state.bootstrap.demo_scenario || "overview";
  const route =
    scenario === "agents"
      ? "#/agents"
      : scenario === "trace"
        ? `#/traces/${encodeURIComponent(state.fleet.traces.find((t) => t.status === "error")?.trace_id || "")}`
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

function isConnected() {
  return Boolean(state.fleet?.agents?.length);
}

function agentName(agentId) {
  return state.fleet?.agents?.find((a) => a.agent_id === agentId)?.name || agentId;
}

function agentMetrics(agentId) {
  return state.fleet?.metrics?.find((m) => m.agent_id === agentId) || null;
}

function renderShell() {
  applyI18n();
  const summary = state.summary || {};
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? state.fleet?.generated_at
      ? `${t("generated")} ${new Date(state.fleet.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.degradedCount) els.degradedCount.textContent = num(summary.degraded_agent_count || 0);
  if (els.agentCount) els.agentCount.textContent = num(summary.agent_count || 0);
  if (els.handoffCount) els.handoffCount.textContent = num(state.handoffs.length);
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${num(summary.total_calls_24h || 0)} ${t("totalCalls").toLowerCase()}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "agents") return t("agentsTitle");
  if (view === "traces") return t("traceDetail");
  if (view === "handoffs") return t("handoffHistory");
  if (view === "settings") return t("settings");
  return t("overview");
}

function summaryCards() {
  const s = state.summary || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("totalCalls")}</span><strong>${num(s.total_calls_24h)}</strong></div>
      <div class="metric"><span>${t("totalCost")}</span><strong>${money(s.total_cost_today_usd)}</strong></div>
      <div class="metric"><span>${t("degradedAgents")}</span><strong class="warn">${num(s.degraded_agent_count)}</strong></div>
      <div class="metric"><span>${t("criticalAgents")}</span><strong class="negative">${num(s.critical_agent_count)}</strong></div>
      <div class="metric"><span>${t("healthyAgents")}</span><strong class="positive">${num(s.healthy_agent_count)}</strong></div>
    </div>
  `;
}

function sparkline(hourly) {
  const last24 = (hourly || []).slice(-24);
  if (!last24.length) return "";
  const max = Math.max(1, ...last24.map((b) => b.calls));
  const bars = last24
    .map((b) => {
      const heightPct = Math.max(4, Math.round((b.calls / max) * 100));
      const hasErrors = b.errors > 0;
      return `<span class="spark-bar${hasErrors ? " spark-bar-error" : ""}" style="height:${heightPct}%" title="${new Date(b.hour).toLocaleString()}: ${b.calls} calls, ${b.errors} errors"></span>`;
    })
    .join("");
  return `<div class="sparkline">${bars}</div><div class="muted spark-caption">${t("sparklineCaption")}</div>`;
}

function fleetOverviewGrid() {
  const agents = state.fleet?.agents || [];
  const cards = agents
    .map((agent) => {
      const metrics = agentMetrics(agent.agent_id) || {};
      return `
      <a class="overview-panel agent-card" href="#/agents/${encodeURIComponent(agent.agent_id)}">
        <div class="row between">
          <strong>${escapeHtml(agent.name)}</strong>
          <span class="badge status-${metrics.status || "healthy"}"><span class="status-dot"></span>${t(`status${capitalize(metrics.status || "healthy")}`)}</span>
        </div>
        <p class="muted">${escapeHtml(agent.description)}</p>
        ${sparkline(metrics.hourly)}
        <div class="row stats">
          <span>${num(metrics.calls_24h)} ${t("totalCalls").toLowerCase()}</span>
          <span class="${statusClass(metrics.status)}">${pct(metrics.error_rate_pct)} ${t("errorRate").toLowerCase()}</span>
        </div>
      </a>
    `;
    })
    .join("");
  return `<section class="overview-grid agent-overview-grid">${cards}</section>`;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.fleet?.generated_at
    ? `${t("generated")} ${new Date(state.fleet.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${demoBanner()}
    ${summaryCards()}
    ${fleetOverviewGrid()}
  `;
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="warnings"><div class="info"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div></div>`;
}

function capitalize(value) {
  const s = String(value || "");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function sortedAgentRows(rows) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = key === "name" ? a.name : a.metrics?.[key];
    const bv = key === "name" ? b.name : b.metrics?.[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function filteredAgentRows() {
  const query = state.query.trim().toLowerCase();
  const rows = (state.fleet?.agents || []).map((agent) => ({ ...agent, metrics: agentMetrics(agent.agent_id) }));
  if (!query) return rows;
  return rows.filter((row) =>
    [row.name, row.agent_id, row.description].some((v) => String(v).toLowerCase().includes(query)),
  );
}

function agentHealthTable() {
  const rows = sortedAgentRows(filteredAgentRows());
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("name", t("agentsTitle"))}
            ${sortHeader("calls_24h", t("callVolume"), "num")}
            ${sortHeader("p50_latency_ms", t("p50Latency"), "num")}
            ${sortHeader("p95_latency_ms", t("p95Latency"), "num")}
            ${sortHeader("error_rate_pct", t("errorRate"), "num")}
            ${sortHeader("cost_today_usd", t("costToday"), "num")}
            ${sortHeader("status", t("status"), "num")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const m = row.metrics || {};
              return `
            <tr>
              <td><a href="#/agents/${encodeURIComponent(row.agent_id)}"><span class="strong">${escapeHtml(row.name)}</span></a><div class="muted agent-id">${escapeHtml(row.agent_id)}</div></td>
              <td class="num">${num(m.calls_24h)}</td>
              <td class="num">${ms(m.p50_latency_ms)}</td>
              <td class="num">${ms(m.p95_latency_ms)}</td>
              <td class="num ${statusClass(m.status)}">${pct(m.error_rate_pct)}</td>
              <td class="num">${money(m.cost_today_usd)}</td>
              <td class="num"><span class="badge status-${m.status || "healthy"}"><span class="status-dot"></span>${t(`status${capitalize(m.status || "healthy")}`)}</span></td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAgents() {
  els.title.textContent = t("agentsTitle");
  const rows = filteredAgentRows();
  els.subtitle.textContent = `${rows.length} ${t("agents")}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `${demoBanner()}${agentHealthTable()}`;
}

function tracesTable(agentId) {
  const traces = (state.fleet?.traces || [])
    .filter((tr) => tr.agent_id === agentId)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .slice(0, 30);
  if (!traces.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("traceId")}</th>
            <th>${t("startedAt")}</th>
            <th class="num">${t("duration")}</th>
            <th class="num">${t("steps")}</th>
            <th class="num">${t("cost")}</th>
            <th class="num">${t("status")}</th>
          </tr>
        </thead>
        <tbody>
          ${traces
            .map(
              (tr) => `
            <tr>
              <td><a href="#/traces/${encodeURIComponent(tr.trace_id)}"><span class="strong">${escapeHtml(tr.trace_id)}</span></a></td>
              <td>${new Date(tr.started_at).toLocaleString()}</td>
              <td class="num">${ms(tr.duration_ms)}</td>
              <td class="num">${num(tr.steps.length)}</td>
              <td class="num">${money(tr.cost_usd)}</td>
              <td class="num ${tr.status === "error" ? "negative" : "positive"}">${tr.status === "error" ? t("error") : t("ok")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function agentMetricCards(metrics) {
  return `
    <div class="metrics">
      <div class="metric"><span>${t("callVolume")}</span><strong>${num(metrics.calls_24h)}</strong></div>
      <div class="metric"><span>${t("p50Latency")}</span><strong>${ms(metrics.p50_latency_ms)}</strong></div>
      <div class="metric"><span>${t("p95Latency")}</span><strong>${ms(metrics.p95_latency_ms)}</strong></div>
      <div class="metric"><span>${t("errorRate")}</span><strong class="${statusClass(metrics.status)}">${pct(metrics.error_rate_pct)}</strong></div>
      <div class="metric"><span>${t("costToday")}</span><strong>${money(metrics.cost_today_usd)}</strong></div>
      <div class="metric"><span>${t("cost7d")}</span><strong>${money(metrics.cost_7d_usd)}</strong></div>
    </div>
  `;
}

function handoffForm(targetType, targetId, agentId) {
  return `
    <form class="handoff-form" data-handoff-form data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}" data-agent-id="${escapeHtml(agentId)}">
      <label class="handoff-label" for="handoffNote">${t("handoffNote")}</label>
      <textarea id="handoffNote" name="note" rows="3" placeholder="${escapeHtml(t("handoffNotePlaceholder"))}"></textarea>
      <div class="handoff-actions">
        <button type="submit" data-status="acknowledged">${t("acknowledge")}</button>
        <button type="submit" data-status="needs_investigation" class="primary">${t("needsInvestigation")}</button>
      </div>
      <div class="handoff-form-message" data-handoff-message hidden></div>
    </form>
  `;
}

function renderAgentDetail() {
  const agentId = state.route.id;
  const agent = state.fleet?.agents?.find((a) => a.agent_id === agentId);
  if (!agent) {
    renderAgents();
    return;
  }
  const metrics = agentMetrics(agentId) || {};
  els.title.textContent = agent.name;
  els.subtitle.textContent = agent.description;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/agents">← ${t("back")}</a>
        ${agentMetricCards(metrics)}
        ${sparkline(metrics.hourly)}
        <h2>${t("recentTraces")}</h2>
        ${tracesTable(agentId)}
      </div>
      <aside class="detail-side">
        <h2>${t("acknowledge")} / ${t("needsInvestigation")}</h2>
        ${handoffForm("agent", agentId, agentId)}
      </aside>
    </section>
  `;
  bindHandoffForms();
}

function traceStepTimeline(trace) {
  const lastIndex = trace.steps.length - 1;
  return `
    <ol class="step-timeline">
      ${trace.steps
        .map((step, index) => {
          const isBreak = step.status === "error" && step.step_id === trace.broke_at_step_id;
          const isLast = index === lastIndex;
          return `
        <li class="step-item ${step.status === "error" ? "step-error" : "step-ok"} ${isBreak ? "step-break" : ""}">
          <div class="step-node">
            <div class="step-index">${step.status === "error" ? "!" : "✓"}</div>
            ${isLast ? "" : `<div class="step-connector"></div>`}
          </div>
          <div class="step-body">
            <div class="row between">
              <strong>${escapeHtml(step.name)}</strong>
              <span class="num step-duration">${ms(step.duration_ms)}</span>
            </div>
            <div class="muted step-status-line">${step.status === "error" ? `⚠ ${escapeHtml(step.detail || t("error"))}` : t("ok")}</div>
            ${isBreak ? `<div class="chain-break-flag">${t("chainBroke")}</div>` : ""}
          </div>
        </li>
      `;
        })
        .join("")}
    </ol>
  `;
}

function renderTraceDetail() {
  const traceId = state.route.id;
  const trace = state.fleet?.traces?.find((tr) => tr.trace_id === traceId);
  if (!trace) {
    els.title.textContent = t("traceDetail");
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  els.title.textContent = trace.trace_id;
  els.subtitle.textContent = `${agentName(trace.agent_id)} · ${new Date(trace.started_at).toLocaleString()}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/agents/${encodeURIComponent(trace.agent_id)}">← ${t("back")}</a>
        ${demoBanner()}
        <div class="metrics">
          <div class="metric"><span>${t("duration")}</span><strong>${ms(trace.duration_ms)}</strong></div>
          <div class="metric"><span>${t("cost")}</span><strong>${money(trace.cost_usd)}</strong></div>
          <div class="metric"><span>${t("steps")}</span><strong>${num(trace.steps.length)}</strong></div>
          <div class="metric"><span>${t("status")}</span><strong class="${trace.status === "error" ? "negative" : "positive"}">${trace.status === "error" ? t("error") : t("ok")}</strong></div>
        </div>
        <h2>${t("stepTimeline")}</h2>
        ${traceStepTimeline(trace)}
      </div>
      <aside class="detail-side">
        <h2>${t("acknowledge")} / ${t("needsInvestigation")}</h2>
        ${handoffForm("trace", trace.trace_id, trace.agent_id)}
      </aside>
    </section>
  `;
  bindHandoffForms();
}

function renderHandoffs() {
  els.title.textContent = t("handoffHistory");
  const handoffs = [...state.handoffs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  els.subtitle.textContent = `${handoffs.length} ${t("handoffs")}`;
  if (!handoffs.length) {
    els.content.innerHTML = `<div class="empty">${t("noHandoffs")}</div>`;
    return;
  }
  els.content.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("createdBy")}</th>
            <th>${t("targetType.agent") || "Target"}</th>
            <th>${t("status")}</th>
            <th>${t("handoffNote")}</th>
            <th>${t("startedAt")}</th>
          </tr>
        </thead>
        <tbody>
          ${handoffs
            .map(
              (h) => `
            <tr>
              <td>${escapeHtml(h.created_by)}</td>
              <td>${escapeHtml(tNested("targetType", h.target_type))} · <a href="#/${h.target_type === "agent" ? "agents" : "traces"}/${encodeURIComponent(h.target_id)}">${escapeHtml(h.target_id)}</a></td>
              <td><span class="badge status-${h.status === "needs_investigation" ? "critical" : "healthy"}">${escapeHtml(tNested("handoffStatus", h.status))}</span></td>
              <td>${escapeHtml(h.note || "")}</td>
              <td>${new Date(h.created_at).toLocaleString()}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "local")}</dd>
          <dt>${t("agentCount")}</dt><dd>${num(state.summary?.agent_count || 0)}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("thresholds")}</h2>
        <dl>
          <dt>${t("errorRateDegraded")}</dt><dd>3%</dd>
          <dt>${t("errorRateCritical")}</dt><dd>8%</dd>
          <dt>${t("latencyDegraded")}</dt><dd>4000ms</dd>
          <dt>${t("latencyCritical")}</dt><dd>8000ms</dd>
        </dl>
      </section>
    </div>
  `;
}

function bindHandoffForms() {
  document.querySelectorAll("[data-handoff-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const status = submitter?.dataset.status || "acknowledged";
      const note = form.querySelector("textarea[name='note']").value.trim();
      const messageEl = form.querySelector("[data-handoff-message]");
      try {
        const res = await fetch("/api/handoffs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target_type: form.dataset.targetType,
            target_id: form.dataset.targetId,
            agent_id: form.dataset.agentId,
            status,
            note,
            created_by: "operator",
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        state.handoffs.push(data.handoff);
        messageEl.hidden = false;
        messageEl.textContent = t("handoffSubmitted");
        messageEl.className = "handoff-form-message positive";
        form.querySelector("textarea[name='note']").value = "";
        if (els.handoffCount) els.handoffCount.textContent = num(state.handoffs.length);
      } catch (error) {
        messageEl.hidden = false;
        messageEl.textContent = t("handoffError");
        messageEl.className = "handoff-form-message negative";
      }
    });
  });
}

function render() {
  renderShell();
  if (state.route.view === "agents" && state.route.id) renderAgentDetail();
  else if (state.route.view === "agents") renderAgents();
  else if (state.route.view === "traces" && state.route.id) renderTraceDetail();
  else if (state.route.view === "handoffs") renderHandoffs();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
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
els.content.addEventListener("click", (event) => {
  const header = event.target.closest("[data-sort]");
  if (!header) return;
  const key = header.dataset.sort;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort = { key, dir: key === "name" ? "asc" : "desc" };
  }
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-observability-language", state.lang);
  render();
});

syncResponsiveShell();
loadMessages()
  .then(() => loadState())
  .catch((error) => {
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  });
