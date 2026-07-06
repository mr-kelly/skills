import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  assetFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-launch-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-launch.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};
const PHASES = ["research", "assemble", "mobilize", "prove"];

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

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function daysUntil(targetDate, from) {
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T00:00:00Z`).getTime();
  const base = from ? new Date(from).getTime() : Date.now();
  if (Number.isNaN(target) || Number.isNaN(base)) return null;
  return Math.ceil((target - base) / 86400000);
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
    scenario === "checklist"
      ? "#/checklist"
      : scenario === "assets"
        ? "#/assets"
        : scenario === "launchday"
          ? "#/launchday"
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

function decisionFor(itemId) {
  return state.settings?.decisions?.decisions?.[itemId] || null;
}

function effectiveStatus(item) {
  const decision = decisionFor(item.item_id);
  if (!decision) return item.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return item.status;
}

function items() {
  return state.snapshot?.items || [];
}

function channels() {
  return state.snapshot?.channels || [];
}

function runbook() {
  return state.snapshot?.runbook || [];
}

function itemById(id) {
  return items().find((entry) => entry.item_id === id) || null;
}

function channelName(channelId) {
  if (!channelId) return "";
  return channels().find((entry) => entry.channel_id === channelId)?.display_name || enumLabel(channelId, "channel");
}

function renderShell() {
  applyI18n();
  const reviewCount = items().filter((item) => effectiveStatus(item) === "needs_review").length;
  const approvedCount = items().filter((item) => effectiveStatus(item) === "approved").length;
  const blockedCount = items().filter((item) => effectiveStatus(item) === "blocked").length;
  const product = state.settings?.config_summary?.product?.name || state.snapshot?.product?.name || "";
  els.syncStatus.textContent = items().length ? product || `${reviewCount} ${t("needsReview")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount ? `${reviewCount} ${t("needsReview")}` : product;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "checklist") return t("checklist");
  if (view === "assets") return t("assets");
  if (view === "launchday") return t("launchday");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function readinessBadge(value) {
  if (!value) return "";
  return `<span class="readiness-badge readiness-${escapeHtml(value)}">${escapeHtml(enumLabel(value, "readiness"))}</span>`;
}

function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

function actionBadge(action) {
  if (!action || action === "no_action") return "";
  return `<span class="badge">${escapeHtml(enumLabel(action, "proposed_action"))}</span>`;
}

function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
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
  const list = state.snapshot?.warnings || [];
  if (!list.length) return "";
  return `<div class="warnings">${list
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

function readinessCard() {
  const readiness = state.snapshot?.readiness || {};
  const verdict = readiness.verdict || "BLOCK";
  const lqs = Number(readiness.lqs || 0);
  return `
    <div class="readiness-card verdict-${escapeHtml(verdict)}">
      <div class="readiness-head">
        <span class="readiness-label">${t("launchReadiness")}</span>
        ${readinessBadge(verdict)}
      </div>
      <div class="readiness-score">
        <strong>${lqs}</strong><span>${t("lqs")}</span>
      </div>
      <div class="readiness-breakdown">
        <span class="rb-ship">${readiness.ship || 0} ${t("ship")}</span>
        <span class="rb-fix">${readiness.fix || 0} ${t("fix")}</span>
        <span class="rb-block">${readiness.block || 0} ${t("block")}</span>
      </div>
      ${
        (readiness.blockers || []).length
          ? `<div class="readiness-blockers">
              <div class="rb-title">${t("blockers")}</div>
              ${readiness.blockers
                .map(
                  (blocker) =>
                    `<a href="#/checklist" class="rb-item"><span class="phase-tag">${escapeHtml(enumLabel(blocker.phase, "phase"))}</span>${escapeHtml(blocker.title)}</a>`,
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;
}

function countdownCard() {
  const target = state.settings?.config_summary?.launch?.target_date || state.snapshot?.launch?.target_date || "";
  const days = daysUntil(target, state.snapshot?.generated_at);
  const value = days === null ? "—" : days <= 0 ? "0" : String(days);
  const label = days !== null && days <= 0 ? t("launchedLabel") : t("daysToLaunch");
  return `
    <div class="metric countdown-metric">
      <span>${t("countdown")}</span>
      <strong>${escapeHtml(value)}</strong>
      <small class="muted">${escapeHtml(label)}${target ? ` · ${date(`${target}T00:00:00Z`)}` : ""}</small>
    </div>
  `;
}

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = items().filter((item) => effectiveStatus(item) === "needs_review").length;
  return `
    <div class="metrics">
      ${countdownCard()}
      <div class="metric"><span>${t("needsReview")}</span><strong>${reviewCount}</strong></div>
      <div class="metric"><span>${t("approved")}</span><strong>${metrics.approved || 0}</strong></div>
      <div class="metric"><span>${t("blocked")}</span><strong>${metrics.blocked || 0}</strong></div>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  const product = state.snapshot?.product || {};
  els.subtitle.textContent = product.name ? `${product.name} · ${product.tagline || ""}` : t("empty");
  const phaseProgress = state.snapshot?.phase_progress || [];
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel readiness-panel">
        ${readinessCard()}
      </div>
      <div class="overview-panel">
        <h2>${t("phaseProgress")}</h2>
        ${phaseProgress
          .map((entry) => {
            const pct = entry.total ? Math.round((entry.done / entry.total) * 100) : 0;
            return `
            <div class="stage-row">
              <span class="stage-row-head">${phaseBadge(entry.phase)}<small>${entry.done}/${entry.total}</small></span>
              <span class="stage-bar"><span style="width:${pct}%"></span></span>
              <span class="num">${pct}%</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("channelStatus")}</h2>
        ${
          channels()
            .map(
              (entry) => `
          <div class="activity-row channel-row">
            <span class="badge">${escapeHtml(entry.display_name || enumLabel(entry.channel_id, "channel"))}</span>
            <span class="muted">${escapeHtml(enumLabel(entry.type, "channel"))}</span>
            <span class="submission-badge sub-${escapeHtml(entry.submission_status)}">${escapeHtml(enumLabel(entry.submission_status, "submission"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("assets")}</h2>
        ${
          items()
            .filter((item) => effectiveStatus(item) === "needs_review")
            .slice(0, 5)
            .map(
              (item) => `
          <a class="due-row" href="#/assets">
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(channelName(item.channel_id))}</small></span>
            <span class="due-meta">${readinessBadge(item.readiness)}${phaseBadge(item.phase)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noItems")}</div>`
        }
      </div>
    </section>
  `;
}

function renderChecklist() {
  els.title.textContent = t("checklist");
  const query = state.query.trim().toLowerCase();
  const matches = (item) =>
    !query ||
    [item.title, item.reason, item.owner, item.channel_id, item.phase]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  const shown = items().filter(matches);
  els.subtitle.textContent = `${shown.length} / ${items().length}`;
  els.content.innerHTML = `
    ${warnings()}
    ${
      PHASES.map((phase) => {
        const phaseItems = shown.filter((item) => item.phase === phase);
        if (!phaseItems.length) return "";
        return `
      <section class="phase-group">
        <h2 class="phase-group-title">${phaseBadge(phase)} <small class="muted">${phaseItems.length}</small></h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>${t("status")}</th><th>${t("checklist")}</th><th>${t("readiness")}</th><th>${t("channel")}</th><th>${t("proposedAction")}</th><th>${t("owner")}</th>
              </tr>
            </thead>
            <tbody>
              ${phaseItems
                .map((item) => {
                  const status = effectiveStatus(item);
                  const hasDraft = Boolean(item.draft);
                  return `
                  <tr>
                    <td class="num">${item.ref}</td>
                    <td>${statusBadge(status)}</td>
                    <td>${hasDraft ? `<a href="#/assets">${escapeHtml(item.title)}</a>` : `<span class="strong">${escapeHtml(item.title)}</span>`}<div class="muted">${escapeHtml(item.reason || "")}</div></td>
                    <td>${readinessBadge(item.readiness)}</td>
                    <td>${escapeHtml(channelName(item.channel_id))}</td>
                    <td>${actionBadge(item.proposed_action) || `<span class="muted">—</span>`}</td>
                    <td>${escapeHtml(item.owner || "")}</td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
      }).join("") || `<div class="empty">${t("noItems")}</div>`
    }
  `;
}

function assetFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all"
              ? assetItems().length
              : assetItems().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.assetFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function assetItems() {
  // Assets = launch items that carry an editable draft (asset copy / submission / pitch).
  return items().filter((item) => Boolean(item.draft));
}

function filteredAssets() {
  const query = state.query.trim().toLowerCase();
  return assetItems().filter((item) => {
    const status = effectiveStatus(item);
    if (state.assetFilter !== "all" && status !== state.assetFilter) return false;
    if (!query) return true;
    return [item.title, item.reason, item.draft, item.channel_id, item.phase]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderAssets() {
  els.title.textContent = t("assets");
  const list = filteredAssets();
  const reviewCount = assetItems().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${assetFilters()}
    <div class="queue">
      ${
        list
          .map((item) => {
            const status = effectiveStatus(item);
            const decision = decisionFor(item.item_id);
            const edits = state.edits[item.item_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.draft ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-item="${escapeHtml(item.item_id)}">
            <header class="queue-head">
              <span class="queue-ref">#${item.ref}</span>
              ${phaseBadge(item.phase)}
              ${statusBadge(status)}
              ${readinessBadge(item.readiness)}
              ${riskBadges(item.risk)}
            </header>
            <div class="queue-subject strong">${escapeHtml(item.title)}</div>
            <div class="queue-meta">
              ${item.channel_id ? `<span class="badge">${escapeHtml(channelName(item.channel_id))}</span>` : ""}
              ${actionBadge(item.proposed_action)}
              ${item.format ? `<span class="muted">· ${escapeHtml(item.format)}</span>` : ""}
            </div>
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="9" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noItems")}</div>`
      }
    </div>
  `;
  bindAssetEvents();
}

function bindAssetEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.assetFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.item;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.item, button.dataset.action, card);
    });
  });
}

async function submitDecision(itemId, action, card) {
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
    body: JSON.stringify({ item_id: itemId, action, comment: note, draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = body.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[itemId];
  state.notice = t("saved");
  await loadState();
}

function renderLaunchDay() {
  els.title.textContent = t("launchday");
  const steps = runbook();
  const target = state.settings?.config_summary?.launch?.target_date || state.snapshot?.launch?.target_date || "";
  els.subtitle.textContent = target ? `${t("targetDate")}: ${date(`${target}T00:00:00Z`)}` : t("runbook");
  els.content.innerHTML = `
    ${warnings()}
    <div class="runbook">
      ${
        steps
          .map(
            (step) => `
        <article class="runbook-step">
          <div class="runbook-time">
            <span class="runbook-offset">${escapeHtml(step.offset || "")}</span>
            <span class="runbook-at muted">${escapeHtml(step.at || "")}</span>
          </div>
          <div class="runbook-body">
            <div class="runbook-title strong">${escapeHtml(step.title)}</div>
            ${step.owner ? `<div class="runbook-owner muted">${t("owner")}: ${escapeHtml(step.owner)}</div>` : ""}
            ${step.note ? `<div class="runbook-note"><span class="muted">${t("warRoomNote")}:</span> ${escapeHtml(step.note)}</div>` : ""}
          </div>
        </article>
      `,
          )
          .join("") || `<div class="empty">${t("empty")}</div>`
      }
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const product = summary.product || {};
  const launch = summary.launch || {};
  const policy = summary.readiness_policy || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("dataProvider") || "Data provider"}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("product")}</h2>
        <dl>
          <dt>${t("product")}</dt><dd>${escapeHtml(product.name || "")}</dd>
          <dt>${t("tagline")}</dt><dd>${escapeHtml(product.tagline || "")}</dd>
          <dt>${t("targetDate")}</dt><dd>${launch.target_date ? date(`${launch.target_date}T00:00:00Z`) : ""}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(launch.timezone || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("readinessPolicy")}</h2>
        <dl>
          <dt>${t("blockOn")}</dt><dd>${(policy.block_on || []).map((c) => `<span class="badge">${escapeHtml(enumLabel(c, "channel"))}</span>`).join(" ") || "—"}</dd>
          <dt>${t("minShipRatio")}</dt><dd>${policy.min_ship_ratio != null ? `${Math.round(policy.min_ship_ratio * 100)}%` : "—"}</dd>
        </dl>
        <div class="stage-list">${(summary.press_lists || []).map((list) => `<span class="tag">${escapeHtml(list.display_name)}</span>`).join(" ")}</div>
      </section>
      <section>
        <h2>${t("channels")}</h2>
        ${
          (summary.channels || [])
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(channel.display_name)}</strong>
            <span>${escapeHtml(enumLabel(channel.type, "channel"))}${channel.handoff_skill ? ` · ${escapeHtml(channel.handoff_skill)}` : ""}</span>
            <span class="${channel.secrets_ready ? "ok" : "warn"}">${channel.secret_envs?.length ? (channel.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
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
  if (state.route.view === "checklist") renderChecklist();
  else if (state.route.view === "assets") renderAssets();
  else if (state.route.view === "launchday") renderLaunchDay();
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
  localStorage.setItem("kelly-launch-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
