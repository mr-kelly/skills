import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  statusFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-brand-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-brand.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};
const DRIFT_DECISION_STATUS = {
  resolve_drift: "resolved",
  dismiss_drift: "dismissed",
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
  driftCount: document.querySelector("#count-drift"),
  canonicalCount: document.querySelector("#count-canonical"),
  statusFilters: document.querySelector("#statusFilters"),
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
    scenario === "narrative"
      ? "#/narrative"
      : scenario === "stories"
        ? "#/stories"
        : scenario === "drift"
          ? "#/drift"
          : scenario === "settings"
            ? "#/settings"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.statusFilters?.querySelectorAll("[data-status]").forEach((button) => {
    const status = button.dataset.status;
    button.textContent = status === "all" ? t("all") : status === "approved" ? t("canonical") : enumLabel(status);
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

function driftStatus(alert) {
  const decision = decisionFor(alert.alert_id);
  if (!decision) return alert.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DRIFT_DECISION_STATUS[decision.action]) return DRIFT_DECISION_STATUS[decision.action];
  return alert.status;
}

function items() {
  return state.snapshot?.items || [];
}

function itemsOfType(type) {
  return items().filter((item) => item.type === type);
}

function driftAlerts() {
  return state.snapshot?.drift_alerts || [];
}

function itemById(itemId) {
  return items().find((item) => item.item_id === itemId) || null;
}

function channelName(channelId) {
  const channels = state.settings?.config_summary?.channels || [];
  return channels.find((channel) => channel.channel_id === channelId)?.display_name || channelId || "";
}

function renderShell() {
  applyI18n();
  const reviewCount = items().filter((item) => effectiveStatus(item) === "needs_review").length;
  const canonicalCount = items().filter((item) => effectiveStatus(item) === "approved").length;
  const driftOpen = driftAlerts().filter((alert) => driftStatus(alert) === "open").length;
  els.syncStatus.textContent = items().length ? `${canonicalCount} ${t("canonical")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.driftCount) els.driftCount.textContent = driftOpen;
  if (els.canonicalCount) els.canonicalCount.textContent = canonicalCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : `${canonicalCount} ${t("canonical")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  els.statusFilters?.querySelectorAll("[data-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === state.statusFilter);
  });
}

function viewLabel(view) {
  if (view === "narrative") return t("narrative");
  if (view === "stories") return t("stories");
  if (view === "drift") return t("drift");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function typeBadge(type) {
  return `<span class="type-badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

function phaseBadge(phase) {
  if (!phase) return "";
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

function gateBadge(gate) {
  if (!gate) return "";
  return `<span class="gate-badge gate-${escapeHtml(gate)}">${escapeHtml(enumLabel(gate, "gate"))}</span>`;
}

function severityBadge(severity) {
  if (!severity) return "";
  return `<span class="severity-badge sev-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

function nqsChip(nqs) {
  if (!nqs || typeof nqs.score !== "number") return "";
  return `<span class="nqs-chip"><span class="nqs-label">${t("nqs")}</span><strong>${nqs.score}</strong>${gateBadge(nqs.gate)}</span>`;
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

function matchesQuery(item) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return [item.title, item.draft, item.reason, item.type, item.phase, item.sub_skill, item.evidence?.source]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function matchesStatus(item) {
  if (state.statusFilter === "all") return true;
  return effectiveStatus(item) === state.statusFilter;
}

function renderOverview() {
  els.title.textContent = t("messageHouse");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const positioning = state.snapshot?.positioning || {};
  const pillars = itemsOfType("message_pillar");
  const overallNqs = metrics.overall_nqs || 0;
  const overallGate = overallNqs >= 80 ? "SHIP" : overallNqs >= 55 ? "FIX" : "BLOCK";
  const driftOpen = driftAlerts().filter((alert) => driftStatus(alert) === "open").length;
  els.content.innerHTML = `
    ${warnings()}
    <section class="house">
      <div class="house-roof">
        <div class="house-roof-label">${t("positioningStatement")} ${positioning.status ? statusBadge(effectiveStatus(itemById(positioning.item_id) || positioning)) : ""}</div>
        <p class="house-statement">${escapeHtml(positioning.statement || t("empty"))}</p>
      </div>
      <div class="house-metrics">
        <div class="metric nqs-metric gate-tint-${overallGate}">
          <span>${t("overallNqs")}</span>
          <strong>${overallNqs} ${gateBadge(overallGate)}</strong>
        </div>
        <a class="metric" href="#/narrative"><span>${t("canonical")}</span><strong>${metrics.canonical_count || 0}</strong></a>
        <a class="metric" href="#/narrative"><span>${t("toReview")}</span><strong>${metrics.needs_review_count || 0}</strong></a>
        <a class="metric ${driftOpen ? "metric-alert" : ""}" href="#/drift"><span>${t("driftAlerts")}</span><strong>${driftOpen}</strong></a>
      </div>
      <div class="house-pillars">
        <h2>${t("messagePillars")}</h2>
        <div class="pillar-grid">
          ${
            pillars
              .map(
                (pillar) => `
            <a class="pillar-card" href="#/narrative">
              <div class="pillar-head">${escapeHtml(pillar.title)} ${statusBadge(effectiveStatus(pillar))}</div>
              <p>${escapeHtml(pillar.draft)}</p>
              <div class="pillar-foot">${nqsChip(pillar.nqs)}${phaseBadge(pillar.phase)}</div>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noItems")}</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderItemCard(item, { editable }) {
  const status = effectiveStatus(item);
  const decision = decisionFor(item.item_id);
  const edits = state.edits[item.item_id] || {};
  const draft = edits.draft ?? decision?.draft ?? item.draft ?? "";
  const note = edits.note ?? decision?.comment ?? "";
  const locked = Boolean(state.settings?.lock);
  const disabled = locked || !editable ? "disabled" : "";
  return `
    <article class="asset-card status-${escapeHtml(status)}" data-item="${escapeHtml(item.item_id)}">
      <header class="asset-head">
        <span class="asset-ref">#${item.ref}</span>
        ${typeBadge(item.type)}
        ${phaseBadge(item.phase)}
        ${statusBadge(status)}
        ${nqsChip(item.nqs)}
      </header>
      <div class="asset-title strong">${escapeHtml(item.title)}</div>
      ${item.sub_skill ? `<div class="asset-subskill muted">${t("subSkill")}: ${escapeHtml(item.sub_skill)}</div>` : ""}
      <label class="asset-label">${t("draft")}</label>
      <textarea class="asset-draft" data-field="draft" rows="5" ${disabled}>${escapeHtml(draft)}</textarea>
      ${
        item.type === "proof_point"
          ? `<div class="asset-evidence">${
              item.evidence
                ? `<span class="ev-label">${t("evidence")}:</span> <strong>${escapeHtml(item.evidence.source || "")}</strong> — ${escapeHtml(item.evidence.stat || "")}${item.evidence.url ? ` <a href="${escapeHtml(item.evidence.url)}" target="_blank" rel="noopener">↗</a>` : ""}`
                : `<span class="ev-missing">${t("evidence")}: —</span>`
            }</div>`
          : ""
      }
      ${item.reason ? `<p class="asset-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>` : ""}
      <label class="asset-label">${t("reviewNote")}</label>
      <textarea class="asset-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      <div class="asset-actions">
        <button type="button" class="approve" data-action="approve" title="${t("adopt")}" ${disabled}>${t("adopt")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${decision && DECISION_STATUS[decision.action] ? `<span class="asset-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
      </div>
    </article>
  `;
}

function renderAssetList(list) {
  const filtered = list.filter((item) => matchesStatus(item) && matchesQuery(item));
  if (!filtered.length) return `<div class="empty">${t("noItems")}</div>`;
  return `<div class="asset-list">${filtered.map((item) => renderItemCard(item, { editable: true })).join("")}</div>`;
}

function sectionHeading(label, count) {
  return `<h2 class="section-heading">${escapeHtml(label)} <small>${count}</small></h2>`;
}

function renderNarrative() {
  els.title.textContent = t("narrative");
  const pillars = itemsOfType("message_pillar");
  const vocab = itemsOfType("vocabulary");
  const guardrails = itemsOfType("guardrail");
  const positioning = itemsOfType("positioning");
  const reviewCount = items().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const guardrailVocab = [...vocab, ...guardrails];
  const positioningList = positioning.filter((item) => matchesStatus(item) && matchesQuery(item));
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${positioningList.length ? `${sectionHeading(t("positioning"), positioningList.length)}${renderAssetList(positioning)}` : ""}
    ${sectionHeading(t("messagePillars"), pillars.length)}
    ${renderAssetList(pillars)}
    ${sectionHeading(t("guardrailsAndVocab"), guardrailVocab.length)}
    ${renderAssetList(guardrailVocab)}
  `;
  bindAssetEvents();
}

function renderStories() {
  els.title.textContent = t("stories");
  const stories = itemsOfType("story");
  const proofPoints = itemsOfType("proof_point");
  const reviewCount = [...stories, ...proofPoints].filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${sectionHeading(t("storyBank"), stories.length)}
    ${renderAssetList(stories)}
    ${sectionHeading(t("proofPoints"), proofPoints.length)}
    ${renderAssetList(proofPoints)}
  `;
  bindAssetEvents();
}

function bindAssetEvents() {
  els.content.querySelectorAll(".asset-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".asset-card").dataset.item;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".asset-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".asset-card");
      submitDecision(card.dataset.item, button.dataset.action, card);
    });
  });
}

function renderDrift() {
  els.title.textContent = t("driftAlerts");
  const alerts = driftAlerts().filter((alert) => {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    return [alert.title, alert.offending_usage, alert.canonical_guidance, channelName(alert.channel_id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const open = alerts.filter((alert) => driftStatus(alert) === "open").length;
  els.subtitle.textContent = `${open} ${t("driftOpen")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    <div class="drift-list">
      ${
        alerts
          .map((alert) => {
            const status = driftStatus(alert);
            const guardrail = itemById(alert.guardrail_item_id);
            const decision = decisionFor(alert.alert_id);
            return `
          <article class="drift-card drift-${escapeHtml(status)}" data-alert="${escapeHtml(alert.alert_id)}">
            <header class="drift-head">
              ${severityBadge(alert.severity)}
              <span class="drift-channel badge">${escapeHtml(channelName(alert.channel_id))}</span>
              ${statusBadge(status)}
              <span class="drift-date muted">${date(alert.detected_at)}</span>
            </header>
            <div class="drift-title strong">${escapeHtml(alert.title)}</div>
            <div class="drift-compare">
              <div class="drift-offending">
                <span class="drift-label">${t("offending")}</span>
                <p>${escapeHtml(alert.offending_usage)}</p>
              </div>
              <div class="drift-canonical">
                <span class="drift-label">${t("guidance")}</span>
                <p>${escapeHtml(alert.canonical_guidance)}</p>
                ${guardrail ? `<a class="drift-ref" href="#/narrative">${escapeHtml(guardrail.title)} →</a>` : ""}
              </div>
            </div>
            <div class="drift-actions">
              <button type="button" class="approve" data-action="resolve_drift" title="${t("resolveFix")}" ${disabled}>${t("resolveFix")}</button>
              <button type="button" data-action="dismiss_drift" title="${t("dismissFix")}" ${disabled}>${t("dismissFix")}</button>
              ${decision && DRIFT_DECISION_STATUS[decision.action] ? `<span class="asset-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noDrift")}</div>`
      }
    </div>
  `;
  els.content.querySelectorAll(".drift-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".drift-card");
      submitDecision(card.dataset.alert, button.dataset.action, card);
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

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const brand = summary.brand || {};
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
        <h2>${t("brand")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("type")}</dt><dd>${escapeHtml(brand.category || "")}</dd>
          <dt>${t("mission")}</dt><dd>${escapeHtml(brand.mission || "")}</dd>
          <dt>${t("framework")}</dt><dd>${escapeHtml(brand.framework || "TALE")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
          <dt>${t("readingLevel")}</dt><dd>${escapeHtml(summary.reading_level || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("guardrails")}</h2>
        <dl>
          <dt>${t("banned")}</dt><dd>${(summary.banned_phrases || []).map((phrase) => `<span class="tag">${escapeHtml(phrase)}</span>`).join(" ") || "—"}</dd>
          <dt>${t("regulated")}</dt><dd>${(summary.regulated_claims || []).map((phrase) => `<span class="tag">${escapeHtml(phrase)}</span>`).join(" ") || "—"}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("officialUrls")}</h2>
        <dl>
          ${(summary.official_urls || []).map((entry) => `<dt>${escapeHtml(entry.key)}</dt><dd>${escapeHtml(entry.url)}</dd>`).join("") || "<dd>—</dd>"}
        </dl>
      </section>
      <section>
        <h2>${t("channels")}</h2>
        ${
          (summary.channels || [])
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(channel.display_name)}</strong>
            <span>${escapeHtml(channel.type)}${channel.monitored ? ` · ${t("drift")}` : ""}</span>
            <span class="${channel.secrets_ready ? "ok" : "warn"}">${channel.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
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
  if (state.route.view === "narrative") renderNarrative();
  else if (state.route.view === "stories") renderStories();
  else if (state.route.view === "drift") renderDrift();
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
els.statusFilters?.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.statusFilter = button.dataset.status;
    if (!["narrative", "stories"].includes(state.route.view)) {
      location.hash = "#/narrative";
    } else {
      render();
    }
  });
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-brand-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
