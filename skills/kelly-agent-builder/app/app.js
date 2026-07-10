import { messages } from "./i18n/messages.js";

const state = {
  summary: null,
  agents: [],
  toolCatalog: [],
  route: parseRoute(),
  query: "",
  sort: { key: "updated_at", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-agent-builder-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  draft: null, // in-progress create/edit form state, keyed by agent id or "new"
  formError: null,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-builder.sidebarCollapsed";

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
  attentionCount: document.querySelector("#attention-count"),
  countLive: document.querySelector("#count-live"),
  countTotal: document.querySelector("#count-total"),
  language: document.querySelector("#language"),
  newAgentButton: document.querySelector("#newAgentButton"),
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

function tf(key, replacements = {}) {
  const template = t(key);
  return Object.entries(replacements).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, value), template);
}

function statusLabel(status) {
  return messages[activeLang()]?.enum?.status?.[status] || messages.en.enum?.status?.[status] || status;
}

function reasonLabel(reason) {
  return messages[activeLang()]?.reason?.[reason] || messages.en.reason?.[reason] || reason;
}

function fieldLabel(field) {
  return messages[activeLang()]?.field?.[field] || messages.en.field?.[field] || field;
}

function toolLabel(id) {
  const entry = state.toolCatalog.find((tool) => tool.id === id);
  if (!entry) return id;
  return activeLang() === "zh" ? entry.label_zh : entry.label_en;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.draft = null;
  state.formError = null;
  render();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const [data, toolData] = await Promise.all([
    fetch(`/api/state?${params}`, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error(`State request failed: ${res.status}`);
      return res.json();
    }),
    state.toolCatalog.length ? Promise.resolve({ tools: state.toolCatalog }) : api("/api/tool-catalog"),
  ]);
  state.summary = data.summary;
  state.agents = data.agents || [];
  state.toolCatalog = toolData.tools || [];
  render();
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
  if (els.newAgentButton) els.newAgentButton.textContent = t("newAgent");
}

function renderShell() {
  applyI18n();
  const summary = state.summary || {};
  els.syncStatus.textContent = state.agents.length || state.demo ? t("synced") : t("empty");
  if (els.attentionCount) els.attentionCount.textContent = summary.needs_attention_count || 0;
  if (els.countLive) els.countLive.textContent = summary.live_count || 0;
  if (els.countTotal) els.countTotal.textContent = summary.total || 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = `${summary.live_count || 0} ${t("liveAgents")} · ${summary.needs_attention_count || 0} ${t("needsAttention")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "catalog") return t("catalogTitle");
  if (view === "agent") return t("agentDetail");
  if (view === "settings") return t("settings");
  return t("overview");
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

function statusBadge(agent) {
  const status = agent.derived?.is_over_quota ? "over_quota" : agent.status;
  const label = agent.derived?.is_over_quota ? `${statusLabel(agent.status)} · ⚠` : statusLabel(agent.status);
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function attentionReasons(agent) {
  const reasons = agent.derived?.attention_reasons || [];
  if (!reasons.length) return "";
  return `<div class="attention-reasons">${reasons.map((r) => `<span class="chip warn">${escapeHtml(reasonLabel(r))}</span>`).join("")}</div>`;
}

// ---- Overview ----

function renderOverview() {
  els.title.textContent = t("overview");
  const summary = state.summary || {};
  els.subtitle.textContent = t("localFilesOnly");
  const attentionAgents = state.agents.filter((a) => a.derived?.needs_attention);
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("liveAgents")}</span><strong>${summary.live_count || 0}</strong></div>
      <div class="metric"><span>${t("quotaUsage")}</span><strong>${(summary.usage_pct || 0).toFixed(1)}%</strong><small>${summary.total_calls || 0} / ${summary.total_quota || 0}</small></div>
      <div class="metric"><span>${t("needsAttention")}</span><strong class="${attentionAgents.length ? "negative" : ""}">${summary.needs_attention_count || 0}</strong></div>
      <div class="metric"><span>${t("totalAgents")}</span><strong>${summary.total || 0}</strong></div>
    </div>
    <div class="overview-panel wide">
      <h2>${t("needsAttention")}</h2>
      ${
        attentionAgents.length
          ? `<div class="attention-list">${attentionAgents
              .map(
                (agent) => `
            <a class="attention-row" href="#/agent/${encodeURIComponent(agent.id)}">
              <span class="attention-row-name">${escapeHtml(agent.name || t("newAgent"))}</span>
              ${statusBadge(agent)}
              ${attentionReasons(agent)}
            </a>
          `,
              )
              .join("")}</div>`
          : `<div class="empty">${t("noAgents")}</div>`
      }
    </div>
  `;
}

// ---- Catalog ----

function sortedAgents(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = key === "usage" ? a.derived?.usage_pct || 0 : a[key];
    const bv = key === "usage" ? b.derived?.usage_pct || 0 : b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function filteredAgents() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.agents;
  return state.agents.filter((agent) =>
    [agent.name, agent.owning_team, agent.trigger_description, agent.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function sortHeader(key, label) {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function catalogTable(agents) {
  if (!agents.length) return `<div class="empty">${t("noAgents")}</div>`;
  const rows = sortedAgents(agents);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("name", t("name"))}
            ${sortHeader("owning_team", t("team"))}
            ${sortHeader("status", t("status"))}
            ${sortHeader("usage", t("usage"))}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (agent) => `
            <tr>
              <td><a href="#/agent/${encodeURIComponent(agent.id)}"><span class="strong">${escapeHtml(agent.name || t("newAgent"))}</span></a>${attentionReasons(agent)}</td>
              <td>${agent.owning_team ? escapeHtml(agent.owning_team) : `<span class="muted">${escapeHtml(t("missingOwner"))}</span>`}</td>
              <td>${statusBadge(agent)}</td>
              <td class="num">${(agent.derived?.usage_pct || 0).toFixed(1)}% <span class="muted">(${agent.calls_this_month}/${agent.monthly_quota})</span></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCatalog() {
  els.title.textContent = t("catalogTitle");
  const agents = filteredAgents();
  els.subtitle.textContent = `${agents.length} ${t("totalAgents")}`;
  els.content.innerHTML = catalogTable(agents);
}

// ---- Agent detail / edit form ----

function emptyDraft() {
  return {
    name: "",
    trigger_description: "",
    allowed_tools: [],
    approval_required: false,
    monthly_quota: 1000,
    owning_team: "",
  };
}

function toolChecklist(selected) {
  return state.toolCatalog
    .map(
      (tool) => `
      <label class="tool-check">
        <input type="checkbox" name="allowed_tools" value="${escapeHtml(tool.id)}" ${selected.includes(tool.id) ? "checked" : ""}>
        <span>${escapeHtml(toolLabel(tool.id))}</span>
      </label>
    `,
    )
    .join("");
}

function agentForm(agent, draft) {
  const isNew = !agent;
  const readOnly = agent?.status === "archived";
  return `
    <form id="agentForm" class="agent-form">
      <div class="form-row">
        <label for="f-name">${t("name")}</label>
        <input id="f-name" name="name" type="text" value="${escapeHtml(draft.name)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row">
        <label for="f-trigger">${t("triggerDescription")}</label>
        <textarea id="f-trigger" name="trigger_description" rows="3" ${readOnly ? "disabled" : ""}>${escapeHtml(draft.trigger_description)}</textarea>
      </div>
      <div class="form-row">
        <label>${t("allowedTools")}</label>
        <div class="tool-checklist" ${readOnly ? "inert" : ""}>${toolChecklist(draft.allowed_tools)}</div>
      </div>
      <div class="form-row form-row-inline">
        <label for="f-quota">${t("monthlyQuota")}</label>
        <input id="f-quota" name="monthly_quota" type="number" min="0" value="${Number(draft.monthly_quota || 0)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row form-row-inline">
        <label for="f-team">${t("owningTeam")}</label>
        <input id="f-team" name="owning_team" type="text" value="${escapeHtml(draft.owning_team)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row form-row-inline">
        <label class="checkbox-label">
          <input type="checkbox" name="approval_required" ${draft.approval_required ? "checked" : ""} ${readOnly ? "disabled" : ""}>
          <span>${t("approvalRequired")}</span>
        </label>
      </div>
      ${state.formError ? `<div class="form-error">${escapeHtml(state.formError)}</div>` : ""}
      ${
        readOnly
          ? ""
          : `<div class="form-actions">
        <button type="submit" class="primary">${isNew ? t("create") : t("save")}</button>
        <a class="action" href="${isNew ? "#/catalog" : `#/agent/${encodeURIComponent(agent.id)}`}">${t("cancel")}</a>
      </div>`
      }
    </form>
  `;
}

function agentMeta(agent) {
  return `
    <aside class="detail-side">
      <h2>${t("agentDetail")}</h2>
      <dl>
        <dt>${t("status")}</dt><dd>${statusBadge(agent)}</dd>
        <dt>${t("callsThisMonth")}</dt><dd>${agent.calls_this_month} / ${agent.monthly_quota}</dd>
        <dt>${t("createdAt")}</dt><dd>${new Date(agent.created_at).toLocaleString()}</dd>
        <dt>${t("updatedAt")}</dt><dd>${new Date(agent.updated_at).toLocaleString()}</dd>
      </dl>
      ${attentionReasons(agent)}
      <div class="detail-actions">
        ${
          agent.status === "draft"
            ? `<button type="button" data-action="activate" class="primary">${t("activate")}</button>`
            : ""
        }
        ${agent.status === "live" ? `<button type="button" data-action="pause">${t("pause")}</button>` : ""}
        ${agent.status !== "archived" ? `<button type="button" data-action="archive">${t("archive")}</button>` : ""}
      </div>
    </aside>
  `;
}

function renderAgentDetail() {
  const isNew = state.route.id === "new";
  const agent = isNew ? null : state.agents.find((a) => a.id === state.route.id);
  if (!isNew && !agent) {
    location.hash = "#/catalog";
    return;
  }
  if (!state.draft) state.draft = agent ? { ...agent } : emptyDraft();
  els.title.textContent = isNew ? t("newAgent") : agent.name || t("newAgent");
  els.subtitle.textContent = isNew ? t("localFilesOnly") : agent.trigger_description || "";
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/catalog">← ${t("back")}</a>
        ${agentForm(agent, state.draft)}
      </div>
      ${agent ? agentMeta(agent) : ""}
    </section>
  `;
}

// ---- Settings ----

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("localFilesOnly")}</h2>
        <p>${escapeHtml(t("boundaryNote"))}</p>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "catalog") renderCatalog();
  else if (state.route.view === "agent") renderAgentDetail();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

// ---- Form + action handling ----

function readForm(form) {
  const data = new FormData(form);
  return {
    name: data.get("name") || "",
    trigger_description: data.get("trigger_description") || "",
    allowed_tools: data.getAll("allowed_tools"),
    approval_required: data.get("approval_required") === "on",
    monthly_quota: Number(data.get("monthly_quota") || 0),
    owning_team: data.get("owning_team") || "",
  };
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target.closest("#agentForm");
  if (!form) return;
  const payload = readForm(form);
  state.formError = null;
  try {
    const isNew = state.route.id === "new";
    if (isNew) {
      const { agent } = await api("/api/agents", { method: "POST", body: JSON.stringify(payload) });
      await loadState();
      location.hash = `#/agent/${encodeURIComponent(agent.id)}`;
    } else {
      await api(`/api/agents/${encodeURIComponent(state.route.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await loadState();
      render();
    }
  } catch (error) {
    state.formError = error.message;
    render();
  }
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = state.route.id;
  try {
    if (action === "archive") {
      if (!window.confirm(t("archiveConfirm"))) return;
      await api(`/api/agents/${encodeURIComponent(id)}/archive`, { method: "POST" });
    } else if (action === "pause") {
      await api(`/api/agents/${encodeURIComponent(id)}/pause`, { method: "POST" });
    } else if (action === "activate") {
      await api(`/api/agents/${encodeURIComponent(id)}/activate`, { method: "POST" });
    }
    state.formError = null;
    await loadState();
    render();
  } catch (error) {
    if (error.status === 422) {
      const fields = (error.body?.missing_fields || []).map(fieldLabel).join(", ");
      state.formError = tf("activationBlocked", { fields });
    } else {
      state.formError = error.message;
    }
    render();
  }
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
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, dir: key === "name" || key === "owning_team" ? "asc" : "desc" };
    }
    render();
    return;
  }
  handleAction(event);
});
els.content.addEventListener("submit", handleFormSubmit);
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.newAgentButton?.addEventListener("click", () => {
  location.hash = "#/agent/new";
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-builder-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
