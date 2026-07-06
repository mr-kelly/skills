import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  outreachFilter: "all",
  creatorSort: "fit_score",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-creators-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-creators.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
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
  reviewCount: document.querySelector("#count-review"),
  approvedCount: document.querySelector("#count-approved"),
  blockedCount: document.querySelector("#count-blocked"),
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

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function compactNumber(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
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
    scenario === "creators"
      ? "#/creators"
      : scenario === "outreach"
        ? "#/outreach"
        : scenario === "roi"
          ? "#/roi"
          : scenario === "detail"
            ? "#/creators/cr-lena-glow"
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

function decisionFor(creatorId) {
  return state.settings?.decisions?.decisions?.[creatorId] || null;
}

function effectiveStatus(creator) {
  const decision = decisionFor(creator.creator_id);
  if (!decision) return creator.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return creator.status;
}

function creators() {
  return state.snapshot?.creators || [];
}

function engagements() {
  return creators().filter((item) => item.item_type !== "quality_gate");
}

function creatorById(creatorId) {
  return creators().find((item) => item.creator_id === creatorId) || null;
}

function renderShell() {
  applyI18n();
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  const approvedCount = creators().filter((item) => ["approved", "done"].includes(effectiveStatus(item))).length;
  const blockedCount = creators().filter((item) => effectiveStatus(item) === "blocked").length;
  const reach = state.snapshot?.metrics?.total_reach || 0;
  els.syncStatus.textContent = creators().length ? `${compactNumber(reach)} ${t("reach")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : `${compactNumber(reach)} ${t("reach")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "creators") return t("creators");
  if (view === "outreach") return t("outreach");
  if (view === "roi") return t("roi");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

function platformBadge(platform) {
  return `<span class="platform-badge platform-${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

function nicheBadge(niche) {
  return `<span class="badge">${escapeHtml(enumLabel(niche, "niche"))}</span>`;
}

function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

function gateBadge(verdict) {
  return `<span class="gate-badge gate-${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "gate"))}</span>`;
}

function fitBadge(score) {
  const value = Number(score || 0);
  const tier = value >= 80 ? "high" : value >= 60 ? "mid" : "low";
  return `<span class="fit-badge fit-${tier}" title="${t("fitScore")}">${value}</span>`;
}

function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

function warnings() {
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
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("reach")}</span><strong>${compactNumber(metrics.total_reach)}</strong></div>
      <div class="metric"><span>${t("estValue")}</span><strong>${money(metrics.est_value)}</strong></div>
      <div class="metric"><span>${t("budgetAllocated")}</span><strong>${money(metrics.budget_allocated)}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount}</strong></div>
    </div>
  `;
}

function riskFilter(item) {
  return item.item_type !== "quality_gate";
}

function filteredCreators() {
  const query = state.query.trim().toLowerCase();
  let items = creators().filter(riskFilter);
  if (query) {
    items = items.filter((item) =>
      [item.name, item.handle, item.platform, item.niche, item.stage, item.reason]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }
  const sort = state.creatorSort;
  return items.slice().sort((a, b) => {
    if (sort === "followers") return Number(b.followers || 0) - Number(a.followers || 0);
    if (sort === "engagement_rate") return Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0);
    if (sort === "est_rate") return Number(a.est_rate || 0) - Number(b.est_rate || 0);
    return Number(b.fit_score || 0) - Number(a.fit_score || 0);
  });
}

function filteredOutreach() {
  const query = state.query.trim().toLowerCase();
  return creators().filter((item) => {
    const status = effectiveStatus(item);
    if (state.outreachFilter !== "all" && status !== state.outreachFilter) return false;
    if (!query) return true;
    return [item.name, item.handle, item.reason, item.suggested_reply, status]
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
  const list = engagements();
  const maxStageCount = Math.max(1, ...stages.map((stage) => list.filter((item) => item.stage === stage).length));
  const budgetTotal = Number(metrics.budget_total || 0);
  const budgetAllocated = Number(metrics.budget_allocated || 0);
  const budgetPct = budgetTotal ? Math.min(100, Math.round((budgetAllocated / budgetTotal) * 100)) : 0;
  const top = list
    .slice()
    .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0))
    .slice(0, 5);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("pipelineFunnel")}</h2>
        ${stages
          .map((stage) => {
            const stageItems = list.filter((item) => item.stage === stage);
            const reach = stageItems.reduce((sum, item) => sum + Number(item.followers || 0), 0);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${phaseBadge(phaseForStage(stage))}<strong>${escapeHtml(enumLabel(stage, "stage"))}</strong><small>${stageItems.length}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((stageItems.length / maxStageCount) * 100)}%"></span></span>
              <span class="num">${compactNumber(reach)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("budget")}</h2>
        <div class="budget-head">
          <strong>${money(budgetAllocated)}</strong>
          <span class="muted">/ ${money(budgetTotal)} ${t("budgetTotal")}</span>
        </div>
        <span class="stage-bar budget-bar"><span style="width:${budgetPct}%"></span></span>
        <div class="network-grid">
          <a href="#/creators"><strong>${metrics.creator_count || 0}</strong><span>${t("creatorsLower")}</span></a>
          <a href="#/roi"><strong>${money(metrics.est_value)}</strong><span>${t("estValue")}</span></a>
          <a href="#/outreach"><strong>${metrics.needs_review || 0}</strong><span>${t("toReview")}</span></a>
          <a href="#/creators"><strong>${compactNumber(metrics.total_reach)}</strong><span>${t("reach")}</span></a>
        </div>
      </div>
      <div class="overview-panel span-2">
        <h2>${t("topCreators")}</h2>
        ${
          top
            .map((item) => {
              return `
            <a class="due-row" href="#/creators/${encodeURIComponent(item.creator_id)}">
              <span><strong>${escapeHtml(item.name)} <small class="muted">${escapeHtml(item.handle)}</small></strong><small>${platformBadge(item.platform)} ${nicheBadge(item.niche)}</small></span>
              <span class="due-meta">${fitBadge(item.fit_score)}<small>${statusBadge(effectiveStatus(item))}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

function phaseForStage(stage) {
  return (
    { discovery: "discover", outreach: "activate", negotiating: "plan", live: "activate", measured: "measure" }[
      stage
    ] || "discover"
  );
}

function renderCreators() {
  els.title.textContent = t("creators");
  const items = filteredCreators();
  els.subtitle.textContent = `${items.length} ${t("creatorsLower")}`;
  const sorts = [
    ["fit_score", t("fitScore")],
    ["followers", t("followers")],
    ["engagement_rate", t("engagementRate")],
    ["est_rate", t("estRate")],
  ];
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <div class="queue-filters">
      ${sorts
        .map(
          ([value, label]) =>
            `<button type="button" class="queue-filter ${state.creatorSort === value ? "active" : ""}" data-sort="${value}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`,
        )
        .join("")}
    </div>
    ${
      items.length
        ? `<div class="card-grid">
      ${items
        .map((item) => {
          const status = effectiveStatus(item);
          return `
          <a class="creator-card" href="#/creators/${encodeURIComponent(item.creator_id)}">
            <div class="creator-card-top">
              <span class="creator-name"><strong>${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.handle)}</small></span>
              ${fitBadge(item.fit_score)}
            </div>
            <div class="creator-card-badges">${platformBadge(item.platform)} ${nicheBadge(item.niche)} ${phaseBadge(item.phase)}</div>
            <div class="creator-card-stats">
              <span><small>${t("followers")}</small><strong>${compactNumber(item.followers)}</strong></span>
              <span><small>${t("engagementRate")}</small><strong>${(Number(item.engagement_rate || 0) * 100).toFixed(1)}%</strong></span>
              <span><small>${t("estRate")}</small><strong>${money(item.est_rate)}</strong></span>
            </div>
            <div class="creator-card-foot">${statusBadge(status)} ${riskBadges(item.risk)}</div>
          </a>
        `;
        })
        .join("")}
    </div>`
        : `<div class="empty">${t("empty")}</div>`
    }
  `;
  els.content.querySelectorAll(".queue-filter[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.creatorSort = button.dataset.sort;
      render();
    });
  });
}

function renderCreatorDetail() {
  const item = creatorById(state.route.id);
  if (!item) {
    renderCreators();
    return;
  }
  const status = effectiveStatus(item);
  const fit = item.fit_breakdown || {};
  const fitKeys = ["content", "community", "credibility", "audience", "cost", "engagement"];
  els.title.textContent = `${item.name}`;
  els.subtitle.textContent = `${item.handle} · ${enumLabel(item.platform, "platform")} · ${enumLabel(item.niche, "niche")}`;
  els.content.innerHTML = `
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="agent-panel">
          <h2>${t("reason")}</h2>
          <p>${escapeHtml(item.reason || "")}</p>
          ${item.audience_note ? `<p class="muted">${t("audience")}: ${escapeHtml(item.audience_note)}</p>` : ""}
        </div>
        ${
          item.item_type === "quality_gate"
            ? gatePanel(item)
            : item.suggested_reply
              ? `
          <div class="overview-panel">
            <h2>${t("draft")}</h2>
            <pre class="draft-preview">${escapeHtml(item.suggested_reply)}</pre>
          </div>
        `
              : ""
        }
        <div class="overview-panel">
          <h2>${t("fitBreakdown")}</h2>
          ${fitKeys
            .map((key) => {
              const value = Number(fit[key] || 0);
              return `
            <div class="stage-row">
              <span class="stage-row-head"><strong>${escapeHtml(enumLabel(key, "fit"))}</strong></span>
              <span class="stage-bar"><span style="width:${Math.min(100, value)}%"></span></span>
              <span class="num">${value}</span>
            </div>
          `;
            })
            .join("")}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("creatorDetail")}</h2>
        <dl>
          <dt>${t("fitScore")}</dt><dd>${fitBadge(item.fit_score)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
          <dt>${t("phase")}</dt><dd>${phaseBadge(item.phase)}</dd>
          <dt>${t("platform")}</dt><dd>${platformBadge(item.platform)}</dd>
          <dt>${t("niche")}</dt><dd>${escapeHtml(enumLabel(item.niche, "niche"))}</dd>
          <dt>${t("followers")}</dt><dd>${compactNumber(item.followers)}</dd>
          <dt>${t("engagementRate")}</dt><dd>${(Number(item.engagement_rate || 0) * 100).toFixed(1)}%</dd>
          <dt>${t("estRate")}</dt><dd>${money(item.est_rate)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</dd>
          <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel"))}</dd>
          ${item.risk?.length ? `<dt>${t("warnings")}</dt><dd>${riskBadges(item.risk)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function gatePanel(item) {
  const checks = item.gate_checks || [];
  return `
    <div class="overview-panel gate-panel">
      <h2>${t("gate")} ${item.gate_verdict ? gateBadge(item.gate_verdict) : ""}</h2>
      <div class="gate-checks">
        ${checks
          .map(
            (check) => `
          <div class="gate-check-row">
            ${gateBadge(check.result)}
            <span><strong>${escapeHtml(enumLabel(check.check, "check"))}</strong><small>${escapeHtml(check.note || "")}</small></span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function outreachFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all" ? creators().length : creators().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.outreachFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function renderOutreach() {
  els.title.textContent = t("outreach");
  const items = filteredOutreach();
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${outreachFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const isGate = item.item_type === "quality_gate";
            const decision = decisionFor(item.creator_id);
            const edits = state.edits[item.creator_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.suggested_reply ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-creator="${escapeHtml(item.creator_id)}">
            <header class="queue-head">
              <span class="queue-ref">#${item.ref}</span>
              ${statusBadge(status)}
              ${isGate ? gateBadge(item.gate_verdict) : phaseBadge(item.phase)}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${fitBadge(item.fit_score)}</span>
            </header>
            <div class="queue-meta">
              <a href="#/creators/${encodeURIComponent(item.creator_id)}">${escapeHtml(item.name)}</a>
              <span class="muted">${escapeHtml(item.handle)}</span>
              · ${platformBadge(item.platform)} ${nicheBadge(item.niche)}
              · <span class="badge">${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</span>
            </div>
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            ${isGate ? gatePanel(item) : ""}
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("gateFix")}" ${disabled}>${t("gateFix")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noCreators")}</div>`
      }
    </div>
  `;
  bindOutreachEvents();
}

function bindOutreachEvents() {
  els.content.querySelectorAll(".queue-filter[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.outreachFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.creator;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.creator, button.dataset.action, card);
    });
  });
}

async function submitDecision(creatorId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creator_id: creatorId, action, comment: note, draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = body.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[creatorId];
  state.notice = t("saved");
  await loadState();
}

function renderRoi() {
  els.title.textContent = t("roi");
  const query = state.query.trim().toLowerCase();
  let items = engagements();
  if (query) {
    items = items.filter((item) =>
      [item.name, item.handle, item.platform, item.niche].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }
  items = items.slice().sort((a, b) => Number(b.est_value || 0) - Number(a.est_value || 0));
  const metrics = state.snapshot?.metrics || {};
  els.subtitle.textContent = `${money(metrics.est_value)} ${t("estValue")}`;
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("creator")}</th><th>${t("platform")}</th><th>${t("niche")}</th><th>${t("stage")}</th><th>${t("spend")}</th><th>${t("estValue")}</th><th>${t("cpm")}</th><th>ROI</th><th>${t("status")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const spend = Number(item.spend || 0);
                const estValue = Number(item.est_value || 0);
                const roi = spend > 0 ? `${((estValue / spend - 1) * 100).toFixed(0)}%` : "—";
                return `
                <tr>
                  <td><a href="#/creators/${encodeURIComponent(item.creator_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted">${escapeHtml(item.handle)}</div></td>
                  <td>${platformBadge(item.platform)}</td>
                  <td>${nicheBadge(item.niche)}</td>
                  <td>${escapeHtml(enumLabel(item.stage, "stage"))}</td>
                  <td class="num">${spend ? money(spend) : "—"}</td>
                  <td class="num">${money(estValue)}</td>
                  <td class="num">${item.cpm ? money(item.cpm) : "—"}</td>
                  <td class="num">${roi}</td>
                  <td>${statusBadge(effectiveStatus(item))}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("empty")}</div>`
    }
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const program = summary.program || {};
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
        <h2>${t("operator")}</h2>
        <dl>
          <dt>${t("name")}</dt><dd>${escapeHtml(operator.name || "")}</dd>
          <dt>${t("role")}</dt><dd>${escapeHtml(operator.role || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(operator.company || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(operator.timezone || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("budget")}</h2>
        <dl>
          <dt>${t("budgetTotal")}</dt><dd>${money(program.budget_total, program.base_currency || "USD")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(program.base_currency || "USD")}</dd>
          <dt>${t("targetNiches")}</dt><dd class="stage-list">${(program.target_niches || []).map((niche) => nicheBadge(niche)).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("brands")}</h2>
        ${
          (summary.brands || [])
            .map(
              (brand) => `
          <div class="settings-channel">
            <strong>${escapeHtml(brand.display_name)}</strong>
            <span>${escapeHtml(brand.positioning || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("platform")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-channel">
            <strong>${escapeHtml(platform.display_name)}</strong>
            <span>${escapeHtml(platform.type)}${platform.handoff_skill ? ` · ${escapeHtml(platform.handoff_skill)}` : ""}</span>
            <span class="${platform.secrets_ready ? "ok" : "warn"}">${platform.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "creators" && state.route.id) renderCreatorDetail();
  else if (state.route.view === "creators") renderCreators();
  else if (state.route.view === "outreach") renderOutreach();
  else if (state.route.view === "roi") renderRoi();
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
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-creators-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
