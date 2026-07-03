import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  dispatchFilter: "all",
  lang: normalizeLang(new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-tickets-language") || "auto"),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {}
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-tickets.sidebarCollapsed";
const BOARD_STATUSES = ["open", "assigned", "in_progress", "waiting", "resolved"];
const DISPATCH_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
const CATEGORIES = ["plumbing", "electrical", "hvac", "elevator", "security", "noise", "parking", "cleaning", "amenity", "other"];
const URGENCIES = ["urgent", "high", "normal", "low"];

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
  reviewCount: document.querySelector("#count-review"),
  unclassifiedCount: document.querySelector("#count-unclassified"),
  slaCount: document.querySelector("#count-sla"),
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

function enumLabel(value, group) {
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
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function nowMs() {
  if (state.demo && state.snapshot?.generated_at) return Date.parse(state.snapshot.generated_at);
  return Date.now();
}

function formatAge(iso) {
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
  const route = scenario === "intake"
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
  const languageLabels = activeLang() === "zh"
    ? { auto: "自动", en: "English", zh: "中文" }
    : { auto: "Auto", en: "English", zh: "中文" };
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

function proposals() {
  const list = state.snapshot?.dispatch_proposals || [];
  if (!state.demo) return list;
  return list.map((proposal) => applyLocalDecision(proposal));
}

function intakeItems() {
  const list = state.snapshot?.intake || [];
  if (!state.demo) return list;
  return list.map((item) => {
    const local = state.demoDecisions[item.id];
    if (!local) return item;
    const triage_state = local.action === "ignore" ? "ignored" : item.triage_state;
    return { ...item, triage_state, decision: local };
  });
}

function tickets() {
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

function crewName(crewId) {
  return crews().find((crew) => crew.crew_id === crewId)?.name || crewId || "";
}

function ticketById(ticketId) {
  return tickets().find((ticket) => ticket.id === ticketId);
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredIntake() {
  return intakeItems().filter((item) =>
    matchesQuery([item.text, item.reporter, item.unit, item.location, item.channel, item.category_guess, item.triage_state, item.ticket_id]));
}

function filteredTickets() {
  return tickets().filter((ticket) =>
    matchesQuery([ticket.id, ticket.title, ticket.category, ticket.unit, ticket.location, ticket.reporter, crewName(ticket.crew_id), ticket.status]));
}

function filteredProposals() {
  return proposals().filter((proposal) => {
    if (state.dispatchFilter !== "all" && proposal.status !== state.dispatchFilter) return false;
    return matchesQuery([proposal.title, proposal.summary, proposal.reason, proposal.ticket_id, crewName(proposal.proposed_crew_id), proposal.status, proposal.priority]);
  });
}

function slaAtRiskCount() {
  return tickets().filter((ticket) => ticket.status !== "resolved" && ["at_risk", "breached"].includes(ticket.sla_state)).length;
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

function channelBadge(channel) {
  return `<span class="badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function categoryBadge(category) {
  return `<span class="badge category-badge">${escapeHtml(enumLabel(category, "category"))}</span>`;
}

function urgencyBadge(urgency) {
  return `<span class="badge urgency-${escapeHtml(urgency)}">${escapeHtml(enumLabel(urgency, "urgency"))}</span>`;
}

function statusBadge(status, group) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status, group))}</span>`;
}

function slaBadge(ticket) {
  const stateName = ticket.sla_state || "ok";
  const due = ticket.sla_due_at ? ` · ${date(ticket.sla_due_at)}` : "";
  return `<span class="badge sla-${escapeHtml(stateName)}" title="${t("slaTarget")}${escapeHtml(due)}">${escapeHtml(enumLabel(stateName, "sla"))}${due ? escapeHtml(due) : ""}</span>`;
}

function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items.map((item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `).join("")}</div>`;
}

function overviewAttention() {
  const reviewCount = proposals().filter((proposal) => proposal.status === "needs_review").length;
  const unclassified = intakeItems().filter((item) => item.triage_state === "new").length;
  const breaching = tickets().filter((ticket) => ticket.status !== "resolved" && ticket.sla_state === "breached").length;
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
    .map(([channel, count]) => `<span class="badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))} ${count}</span>`)
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
  const rows = entries.map(([category, count], index) => {
    const y = index * rowHeight;
    const width = Math.max(4, Math.round((count / max) * barSpan));
    return `
      <text x="${labelWidth - 8}" y="${y + 16}" text-anchor="end" class="svg-label">${escapeHtml(enumLabel(category, "category"))}</text>
      <rect x="${labelWidth}" y="${y + 6}" width="${barSpan}" height="12" rx="3" class="svg-track"></rect>
      <rect x="${labelWidth}" y="${y + 6}" width="${width}" height="12" rx="3" class="svg-bar"></rect>
      <text x="${labelWidth + barSpan + 8}" y="${y + 16}" class="svg-count">${count}</text>
    `;
  }).join("");
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
  return crews().map((crew) => {
    const count = openByCrew.get(crew.crew_id) || 0;
    return `
      <div class="crew-row">
        <span class="crew-name"><strong>${escapeHtml(crew.name)}</strong><small>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</small></span>
        <span class="crew-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
        <span class="crew-count">${count}</span>
      </div>
    `;
  }).join("") || `<div class="empty">${t("setupNeeded")}</div>`;
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
        ${(state.snapshot?.sync_log || []).slice(-6).reverse().map((entry) => `
          <div class="log-row">
            <span class="badge">${escapeHtml(entry.source)}</span>
            <span class="log-detail">${escapeHtml(entry.detail || entry.action || "")}</span>
            <span class="muted">${date(entry.at)}</span>
          </div>
        `).join("") || `<div class="empty">${t("empty")}</div>`}
      </div>
    </section>
  `;
}

function renderIntake() {
  const items = filteredIntake();
  els.title.textContent = t("intake");
  els.subtitle.textContent = `${items.length} ${t("intakeItems")}`;
  els.content.innerHTML = items.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("channel")}</th><th>${t("received")}</th><th>${t("reporter")}</th><th>${t("unit")} / ${t("location")}</th><th>${t("text")}</th><th>${t("urgencyGuess")}</th><th>${t("triageState")}</th><th>${t("ticket")}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${channelBadge(item.channel)}</td>
              <td>${date(item.received_at)}</td>
              <td>${escapeHtml(item.reporter)}</td>
              <td>${escapeHtml([item.unit, item.location].filter(Boolean).join(" · "))}</td>
              <td class="cell-text"><a href="#/intake/${encodeURIComponent(item.id)}"><span class="strong">${escapeHtml(item.text)}</span></a></td>
              <td>${urgencyBadge(item.urgency_guess)}</td>
              <td>${statusBadge(item.triage_state, "triage")}</td>
              <td>${item.ticket_id ? `<a class="ticket-link" href="#/board/${encodeURIComponent(item.ticket_id)}">${escapeHtml(item.ticket_id)}</a>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function classificationEditor(item) {
  const locked = Boolean(state.settings?.lock);
  const done = item.triage_state === "ticketed" || item.triage_state === "ignored";
  const disabled = locked || done ? "disabled" : "";
  return `
    <div class="editor-panel">
      <h2>${t("classification")}</h2>
      <div class="editor-grid">
        <label>${t("category")}
          <select data-field="category" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${CATEGORIES.map((category) => `<option value="${category}" ${category === item.category_guess ? "selected" : ""}>${escapeHtml(enumLabel(category, "category"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("urgency")}
          <select data-field="urgency" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${URGENCIES.map((urgency) => `<option value="${urgency}" ${urgency === item.urgency_guess ? "selected" : ""}>${escapeHtml(enumLabel(urgency, "urgency"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("unit")}
          <input type="text" data-field="unit" data-for="${escapeHtml(item.id)}" value="${escapeHtml(item.unit || "")}" ${disabled}>
        </label>
      </div>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(item.id)}" rows="2" ${disabled}></textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="convert_to_ticket" data-id="${escapeHtml(item.id)}" ${disabled}>${t("convertToTicket")}</button>
        <button type="button" class="danger" data-decision="ignore" data-id="${escapeHtml(item.id)}" ${disabled}>${t("ignore")}</button>
      </div>
      ${item.decision ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(item.decision.action, "action"))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")} · ${t("agentQueued")}</small>
        </div>
      ` : ""}
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    </div>
  `;
}

function renderIntakeDetail() {
  const item = intakeItems().find((entry) => entry.id === state.route.id);
  if (!item) {
    renderIntake();
    return;
  }
  els.title.textContent = `${enumLabel(item.channel, "channel")} · ${item.reporter}`;
  els.subtitle.textContent = `${date(item.received_at)} · ${enumLabel(item.triage_state, "triage")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/intake">← ${t("intake")}</a>
    <section class="detail">
      <div class="detail-main">
        <div class="text-panel">
          <div class="text-head">${channelBadge(item.channel)} ${urgencyBadge(item.urgency_guess)} ${statusBadge(item.triage_state, "triage")}</div>
          <p class="full-text">${escapeHtml(item.text)}</p>
          ${item.attachments_note ? `<p class="muted">${t("attachments")}: ${escapeHtml(item.attachments_note)}</p>` : ""}
        </div>
        ${classificationEditor(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("intakeDetail")}</h2>
        <dl>
          <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel"))} ${item.external_id ? `· ${escapeHtml(item.external_id)}` : ""}</dd>
          <dt>${t("received")}</dt><dd>${date(item.received_at)}</dd>
          <dt>${t("reporter")}</dt><dd>${escapeHtml(item.reporter)}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(item.contact_masked || "")}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(item.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(item.location || "")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(enumLabel(item.category_guess, "category"))}</dd>
          <dt>${t("linkedTicket")}</dt><dd>${item.ticket_id ? `<a class="ticket-link" href="#/board/${encodeURIComponent(item.ticket_id)}">${escapeHtml(item.ticket_id)}</a>` : "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function dispatchFilters() {
  const all = proposals();
  const chip = (key, count) => `
    <button type="button" class="chip ${state.dispatchFilter === key ? "active" : ""}" data-dispatch-filter="${key}" title="${key === "all" ? t("dispatchQueue") : escapeHtml(enumLabel(key, "proposal_status"))}">
      ${key === "all" ? t("dispatchQueue") : escapeHtml(enumLabel(key, "proposal_status"))} <span>${count}</span>
    </button>
  `;
  return `
    <div class="chip-row">
      ${chip("all", all.length)}
      ${DISPATCH_STATUSES.map((status) => chip(status, all.filter((proposal) => proposal.status === status).length)).join("")}
    </div>
  `;
}

function proposalCard(proposal) {
  const ticket = ticketById(proposal.ticket_id);
  const locked = Boolean(state.settings?.lock);
  const terminal = ["done"].includes(proposal.status);
  const disabled = locked || terminal ? "disabled" : "";
  return `
    <article class="proposal-card status-edge-${escapeHtml(proposal.status)}">
      <header class="proposal-head">
        <span class="ref">Dispatch #${proposal.ref}</span>
        ${statusBadge(proposal.status, "proposal_status")}
        <span class="badge priority-${escapeHtml(proposal.priority)}">${escapeHtml(proposal.priority)}</span>
        ${ticket ? slaBadge({ sla_state: ticket.sla_state, sla_due_at: proposal.sla_due_at }) : ""}
      </header>
      <h3>${escapeHtml(proposal.title)}</h3>
      <p class="muted">
        <a class="ticket-link" href="#/board/${encodeURIComponent(proposal.ticket_id)}">${escapeHtml(proposal.ticket_id)}</a>
        ${escapeHtml(proposal.summary)}
      </p>
      <dl class="proposal-meta">
        <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(proposal.proposed_crew_id))}${proposal.proposed_assignee ? ` · ${escapeHtml(proposal.proposed_assignee)}` : ""}</dd>
        <dt>${t("priority")}</dt><dd>${escapeHtml(proposal.priority)}</dd>
        <dt>${t("slaTarget")}</dt><dd>${date(proposal.sla_due_at)} (${proposal.sla_hours}${t("hours")})</dd>
      </dl>
      <div class="reason"><span>${t("reason")}</span>${escapeHtml(proposal.reason)}</div>
      <label class="note-label">${t("noteToCrew")}
        <textarea data-draft-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.note_to_crew || "")}</textarea>
      </label>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.decision?.note || "")}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(proposal.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(proposal.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(proposal.id)}" title="${t("saveNote")}" ${disabled}>${t("saveNote")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(proposal.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
      ${proposal.decision ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(proposal.decision.action, "action"))}</strong>
          ${proposal.decision.note ? `<span>${escapeHtml(proposal.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(proposal.decision.decided_at ? new Date(proposal.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      ` : ""}
      ${proposal.execution ? `
        <div class="execution-info">
          ${(proposal.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(op.target || "")} ${escapeHtml(op.detail || "")}</div>`).join("")}
          <small>${escapeHtml(proposal.execution.detail || "")}</small>
        </div>
      ` : ""}
    </article>
  `;
}

function renderDispatch() {
  const items = filteredProposals();
  els.title.textContent = t("dispatch");
  els.subtitle.textContent = `${proposals().filter((proposal) => proposal.status === "needs_review").length} ${t("dispatchToApprove")}`;
  els.content.innerHTML = `
    ${dispatchFilters()}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    ${state.settings?.lock ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.settings.lock.message || "Agent lock present")}</strong></div></div>` : ""}
    <div class="proposal-list">
      ${items.map((proposal) => proposalCard(proposal)).join("") || `<div class="empty">${t("empty")}</div>`}
    </div>
  `;
}

function boardTable(items) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("ticket")}</th><th>${t("category")}</th><th>${t("unit")} / ${t("location")}</th><th>${t("crew")}</th><th>${t("age")}</th><th>${t("sla")}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((ticket) => `
            <tr>
              <td class="cell-text"><a href="#/board/${encodeURIComponent(ticket.id)}"><span class="ticket-link">${escapeHtml(ticket.id)}</span> <span class="strong">${escapeHtml(ticket.title)}</span></a></td>
              <td>${categoryBadge(ticket.category)} ${urgencyBadge(ticket.urgency)}</td>
              <td>${escapeHtml([ticket.unit, ticket.location].filter(Boolean).join(" · "))}</td>
              <td>${escapeHtml(crewName(ticket.crew_id)) || "—"}</td>
              <td>${formatAge(ticket.created_at)}</td>
              <td>${slaBadge(ticket)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBoard() {
  const items = filteredTickets();
  els.title.textContent = t("board");
  els.subtitle.textContent = `${items.length} ${t("tickets")}`;
  els.content.innerHTML = BOARD_STATUSES.map((status) => {
    const group = items.filter((ticket) => ticket.status === status);
    if (!group.length) return "";
    return `
      <section class="board-group">
        <h2>${escapeHtml(enumLabel(status, "ticket_status"))} <span class="muted">${group.length}</span></h2>
        ${boardTable(group)}
      </section>
    `;
  }).join("") || `<div class="empty">${t("empty")}</div>`;
}

function renderBoardDetail() {
  const ticket = tickets().find((entry) => entry.id === state.route.id);
  if (!ticket) {
    renderBoard();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const relatedIntake = intakeItems().filter((item) => (ticket.intake_ids || []).includes(item.id));
  els.title.textContent = `${ticket.id} · ${ticket.title}`;
  els.subtitle.textContent = `${enumLabel(ticket.status, "ticket_status")} · ${enumLabel(ticket.category, "category")} · ${enumLabel(ticket.urgency, "urgency")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/board">← ${t("board")}</a>
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="timeline-panel">
          <h2>${t("timeline")}</h2>
          <ol class="timeline">
            ${(ticket.history || []).map((event) => `
              <li class="timeline-item event-${escapeHtml(event.event)}">
                <div class="timeline-head">
                  <strong>${escapeHtml(enumLabel(event.event, "event"))}</strong>
                  <span class="muted">${escapeHtml(event.actor || "")} · ${date(event.at)}</span>
                </div>
                ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
              </li>
            `).join("")}
          </ol>
        </div>
        <div class="editor-panel">
          <label class="note-label">${t("resolutionNote")}
            <textarea data-note-for="${escapeHtml(ticket.id)}" rows="3" ${locked ? "disabled" : ""}>${escapeHtml(ticket.resolution_note || "")}</textarea>
          </label>
          <div class="actions">
            <button type="button" class="primary" data-decision="revise" data-id="${escapeHtml(ticket.id)}" title="${t("saveNote")}" ${locked ? "disabled" : ""}>${t("saveNote")}</button>
          </div>
          ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("ticketDetail")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(ticket.status, "ticket_status")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(enumLabel(ticket.category, "category"))}</dd>
          <dt>${t("urgency")}</dt><dd>${escapeHtml(enumLabel(ticket.urgency, "urgency"))}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(ticket.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(ticket.location || "")}</dd>
          <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(ticket.crew_id)) || "—"}</dd>
          <dt>${t("assignee")}</dt><dd>${escapeHtml(ticket.assignee || "")}</dd>
          <dt>${t("created")}</dt><dd>${date(ticket.created_at)}</dd>
          <dt>${t("updated")}</dt><dd>${date(ticket.updated_at)}</dd>
          <dt>${t("slaTarget")}</dt><dd>${slaBadge(ticket)}</dd>
          <dt>${t("reporter")}</dt><dd>${escapeHtml(ticket.reporter || "")}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(ticket.contact_masked || "")}</dd>
          <dt>${t("intake")}</dt><dd>${relatedIntake.map((item) => `<a href="#/intake/${encodeURIComponent(item.id)}">${escapeHtml(item.id)}</a>`).join(", ") || "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("property")}</dt><dd>${escapeHtml(summary.property?.name || "")} · ${summary.property?.buildings || 0} ${t("buildings")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(summary.property?.timezone || "")}</dd>
          <dt>${t("channels")}</dt><dd>${(summary.channels || []).map((channel) => channelBadge(channel)).join(" ")}</dd>
          <dt>${t("categories")}</dt><dd>${(summary.categories || []).map((category) => categoryBadge(category)).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("crews")}</h2>
        ${(summary.crews || []).map((crew) => `
          <div class="settings-account">
            <strong>${escapeHtml(crew.name)}</strong>
            <span>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</span>
            <span><code>${escapeHtml(crew.contact_env || "")}</code> ${crew.contact_ready ? t("contactReady") : t("contactMissing")}</span>
          </div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("slaRules")}</h2>
        ${(summary.sla_rules || []).map((rule) => `
          <div class="settings-account">
            <strong>${escapeHtml(rule.category === "*" ? "*" : enumLabel(rule.category, "category"))}</strong>
            <span>${escapeHtml(enumLabel(rule.urgency, "urgency"))}</span>
            <span>${rule.hours}${t("hours")}</span>
          </div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
        <p class="muted">${t("defaultSla")}: ${summary.sla_default_hours || 72}${t("hours")}</p>
      </section>
    </div>
  `;
}

async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  const fields = {};
  document.querySelectorAll(`[data-field][data-for="${cssAttr(id)}"]`).forEach((input) => {
    fields[input.dataset.field] = input.value;
  });
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      fields: Object.keys(fields).length ? fields : null,
      decided_at: new Date().toISOString()
    };
    render();
    return;
  }
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      fields: Object.keys(fields).length ? fields : null
    })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    els.subtitle.textContent = body.error || `Decision failed: ${res.status}`;
    return;
  }
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  render();
}

function cssAttr(value) {
  return String(value).replaceAll('"', '\\"');
}

function render() {
  renderShell();
  if (state.route.view === "intake" && state.route.id) renderIntakeDetail();
  else if (state.route.view === "intake") renderIntake();
  else if (state.route.view === "dispatch") renderDispatch();
  else if (state.route.view === "board" && state.route.id) renderBoardDetail();
  else if (state.route.view === "board") renderBoard();
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
