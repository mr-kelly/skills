import { messages } from "./i18n/messages.js";

const state = {
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
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};
const PHASES = ["setup", "engage", "nurture", "deliver"];

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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function count(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US").format(Number(value || 0));
}

function dateTime(value) {
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

function decisionFor(sendId) {
  return state.settings?.decisions?.decisions?.[sendId] || null;
}

function effectiveStatus(send) {
  const decision = decisionFor(send.send_id);
  if (!decision) return send.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return send.status;
}

function sends() {
  return state.snapshot?.sends || [];
}

function segments() {
  return state.snapshot?.segments || [];
}

function segmentById(segmentId) {
  return segments().find((item) => item.segment_id === segmentId) || null;
}

function segmentName(segmentId) {
  return segmentById(segmentId)?.name || segmentId || "";
}

function sendById(sendId) {
  return sends().find((item) => item.send_id === sendId) || null;
}

function reviewCount() {
  return sends().filter((item) => effectiveStatus(item) === "needs_review").length;
}

function approvedCount() {
  return sends().filter((item) => effectiveStatus(item) === "approved").length;
}

function atRiskCount() {
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

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function typeBadge(type) {
  return `<span class="type-badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

function verdictBadge(verdict) {
  if (!verdict) return "";
  return `<span class="verdict-badge verdict-${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))}</span>`;
}

function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

function deliverabilityBadge(deliverability) {
  if (!deliverability) return "";
  const risk = deliverability.risk || "low";
  return `<span class="deliv-badge deliv-${escapeHtml(risk)}">${escapeHtml(enumLabel(risk, "deliverabilityRisk"))}</span>`;
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

function phaseChips(scope) {
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

function matchesQuery(send) {
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

function filteredCampaigns() {
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
    </section>
  `;
}

function qualityGatePanel(gate) {
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

function variantPicker(send, disabled) {
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

function campaignFilters() {
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

function renderCampaigns() {
  els.title.textContent = t("campaigns");
  const items = filteredCampaigns();
  els.subtitle.textContent = `${reviewCount()} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${campaignFilters()}
    ${phaseChips(sends())}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const decision = decisionFor(item.send_id);
            const edits = state.edits[item.send_id] || {};
            const body = edits.body ?? decision?.body ?? item.body ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-send="${escapeHtml(item.send_id)}">
            <header class="queue-head">
              <a class="queue-ref" href="#/campaigns/${encodeURIComponent(item.send_id)}">${t("sendRef")} #${item.ref}</a>
              ${statusBadge(status)}
              ${typeBadge(item.type)}
              ${phaseBadge(item.phase)}
              ${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : ""}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${t("due")} ${dateTime(item.send_at)}</span>
            </header>
            <div class="queue-meta">
              ${escapeHtml(segmentName(item.segment_id))} · ${count(item.audience_size)} ${t("audience")} · ${deliverabilityBadge(item.deliverability)}
            </div>
            <div class="queue-subject strong">${escapeHtml(item.subject)}</div>
            <div class="queue-preview muted">${escapeHtml(item.preview_text || "")}</div>
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            ${variantPicker(item, disabled)}
            <label class="queue-label">${t("body")}</label>
            <textarea class="queue-draft" data-field="body" rows="8" ${disabled}>${escapeHtml(body)}</textarea>
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
          .join("") || `<div class="empty">${t("noSends")}</div>`
      }
    </div>
  `;
  bindCampaignEvents();
}

function renderCampaignDetail() {
  const item = sendById(state.route.id);
  if (!item) {
    renderCampaigns();
    return;
  }
  const status = effectiveStatus(item);
  const deliverability = item.deliverability || {};
  els.title.textContent = item.subject;
  els.subtitle.textContent = `${enumLabel(item.type, "type")} · ${enumLabel(item.phase, "phase")} · ${segmentName(item.segment_id)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="detail-badges">
          ${statusBadge(status)} ${typeBadge(item.type)} ${phaseBadge(item.phase)} ${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : ""} ${riskBadges(item.risk)}
        </div>
        ${qualityGatePanel(item.quality_gate)}
        <div class="overview-panel">
          <h2>${t("body")}</h2>
          <pre class="body-preview">${escapeHtml(item.body || "")}</pre>
        </div>
        ${
          (item.subject_variants || []).length >= 2
            ? `
          <div class="overview-panel">
            <h2>${t("subject")} A/B</h2>
            ${(item.subject_variants || [])
              .map(
                (variant) => `
              <div class="detail-variant"><span class="variant-id">${escapeHtml(variant.id.toUpperCase())}</span> ${escapeHtml(variant.subject)}</div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          item.performance
            ? `
          <div class="overview-panel">
            <h2>${t("performance")}</h2>
            <dl class="health-dl">
              <dt>${t("delivered")}</dt><dd>${count(item.performance.delivered)}</dd>
              <dt>${t("openRate")}</dt><dd>${pct(item.performance.open_rate)}</dd>
              <dt>${t("clickRate")}</dt><dd>${pct(item.performance.click_rate)}</dd>
              <dt>${t("unsubRate")}</dt><dd>${pct(item.performance.unsub_rate)}</dd>
              <dt>${t("bounceRate")}</dt><dd>${pct(item.performance.bounce_rate)}</dd>
            </dl>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("sendRef")} #${item.ref}</h2>
        <dl>
          <dt>${t("type")}</dt><dd>${typeBadge(item.type)}</dd>
          <dt>${t("phase")}</dt><dd>${phaseBadge(item.phase)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "action"))}</dd>
          <dt>${t("segment")}</dt><dd>${escapeHtml(segmentName(item.segment_id))}</dd>
          <dt>${t("audience")}</dt><dd>${count(item.audience_size)}</dd>
          <dt>${t("previewText")}</dt><dd>${escapeHtml(item.preview_text || "")}</dd>
          <dt>${t("sendAt")}</dt><dd>${dateTime(item.send_at)}</dd>
          <dt>${t("spf")}</dt><dd>${deliverability.spf_pass ? "✓" : "✗"}</dd>
          <dt>${t("dkim")}</dt><dd>${deliverability.dkim_pass ? "✓" : "✗"}</dd>
          <dt>${t("dmarc")}</dt><dd>${deliverability.dmarc_pass ? "✓" : "✗"}</dd>
          <dt>${t("spamScore")}</dt><dd>${escapeHtml(String(deliverability.spam_score ?? ""))}</dd>
          <dt>${t("inboxReadiness")}</dt><dd>${pct(deliverability.inbox_readiness)} ${deliverabilityBadge(deliverability)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderDeliverability() {
  els.title.textContent = t("deliverability");
  const items = sends().filter(matchesQuery);
  els.subtitle.textContent = `${atRiskCount()} ${t("atRisk")}`;
  els.content.innerHTML = `
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sendRef")}</th><th>${t("subject")}</th><th>${t("type")}</th><th>${t("spf")}</th><th>${t("dkim")}</th><th>${t("dmarc")}</th><th>${t("spamScore")}</th><th>${t("inboxReadiness")}</th><th>${t("verdict")}</th><th>${t("deliverability")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const d = item.deliverability || {};
              return `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(item.send_id)}">#${item.ref}</a></td>
              <td><span class="strong">${escapeHtml(item.subject)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td class="${d.spf_pass ? "ok" : "warn"}">${d.spf_pass ? "✓" : "✗"}</td>
              <td class="${d.dkim_pass ? "ok" : "warn"}">${d.dkim_pass ? "✓" : "✗"}</td>
              <td class="${d.dmarc_pass ? "ok" : "warn"}">${d.dmarc_pass ? "✓" : "✗"}</td>
              <td class="num">${escapeHtml(String(d.spam_score ?? ""))}</td>
              <td class="num">${pct(d.inbox_readiness)}</td>
              <td>${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : `<span class="muted">—</span>`}</td>
              <td>${deliverabilityBadge(d)}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPerformance() {
  els.title.textContent = t("performance");
  const items = sends()
    .filter((item) => item.performance)
    .filter(matchesQuery);
  els.subtitle.textContent = `${items.length} ${t("done")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sendRef")}</th><th>${t("subject")}</th><th>${t("type")}</th><th>${t("delivered")}</th><th>${t("openRate")}</th><th>${t("clickRate")}</th><th>${t("unsubRate")}</th><th>${t("bounceRate")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const p = item.performance || {};
              return `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(item.send_id)}">#${item.ref}</a></td>
              <td><span class="strong">${escapeHtml(item.subject)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td class="num">${count(p.delivered)}</td>
              <td class="num">${pct(p.open_rate)}</td>
              <td class="num">${pct(p.click_rate)}</td>
              <td class="num">${pct(p.unsub_rate)}</td>
              <td class="num">${pct(p.bounce_rate)}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("noSends")}</div>`;
}

function bindCampaignEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.campaignFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".phase-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.phaseFilter = button.dataset.phase;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.send;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll('.queue-card input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const id = radio.closest(".queue-card").dataset.send;
      state.edits[id] = { ...state.edits[id], chosen_variant: radio.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.send, button.dataset.action, card);
    });
  });
}

async function submitDecision(sendId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = card.querySelector('[data-field="body"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  const chosenVariant = card.querySelector('input[type="radio"]:checked')?.value;
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ send_id: sendId, action, comment: note, body, chosen_variant: chosenVariant }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = payload.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[sendId];
  state.notice = t("saved");
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const brand = summary.brand || {};
  const esp = summary.esp || {};
  const policy = summary.sending_policy || {};
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
        <h2>${t("brand")} · ${t("esp")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("unsubUrl")}</dt><dd>${escapeHtml(brand.unsubscribe_url || "")}</dd>
          <dt>${t("esp")}</dt><dd>${escapeHtml(esp.display_name || "")}</dd>
          <dt>${t("provider")}</dt><dd>${escapeHtml(esp.provider || "")}</dd>
          <dt>${t("secretsReady")}</dt><dd class="${esp.secrets_ready ? "ok" : "warn"}">${esp.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sendingPolicy")}</h2>
        <dl>
          <dt>${t("dailyCap")}</dt><dd>${count(policy.daily_send_cap)}</dd>
          <dt>${t("hourlyCap")}</dt><dd>${count(policy.hourly_send_cap)}</dd>
          <dt>${t("minInboxReadiness")}</dt><dd>${pct(policy.min_inbox_readiness)}</dd>
          <dt>${t("maxSpamScore")}</dt><dd>${escapeHtml(String(policy.max_spam_score ?? ""))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("fromIdentities")}</h2>
        ${
          (summary.from_identities || [])
            .map(
              (identity) => `
          <div class="settings-channel">
            <strong>${escapeHtml(identity.from_name || "")}</strong>
            <span>${escapeHtml(identity.from_email || "")}</span>
            <span class="muted">${(identity.use_when || []).map((v) => escapeHtml(enumLabel(v, "type"))).join(", ")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("segments")}</h2>
        ${
          (summary.segments || [])
            .map(
              (segment) => `
          <div class="settings-channel">
            <strong>${escapeHtml(segment.name || "")}</strong>
            <span class="muted">${escapeHtml(segment.description || "")}</span>
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
  if (state.route.view === "campaigns" && state.route.id) renderCampaignDetail();
  else if (state.route.view === "campaigns") renderCampaigns();
  else if (state.route.view === "deliverability") renderDeliverability();
  else if (state.route.view === "performance") renderPerformance();
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
  localStorage.setItem("kelly-campaigns-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
