import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  followupFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-crm-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-crm.sidebarCollapsed";
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
  dealCount: document.querySelector("#count-deals"),
  contactCount: document.querySelector("#count-contacts"),
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
    scenario === "deals"
      ? "#/deals"
      : scenario === "contacts"
        ? "#/contacts"
        : scenario === "followups"
          ? "#/followups"
          : scenario === "detail"
            ? "#/deals/deal-beacon-api"
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

function decisionFor(followupId) {
  return state.settings?.decisions?.decisions?.[followupId] || null;
}

function effectiveStatus(followup) {
  const decision = decisionFor(followup.followup_id);
  if (!decision) return followup.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return followup.status;
}

function followups() {
  return state.snapshot?.followups || [];
}

function deals() {
  return state.snapshot?.deals || [];
}

function contacts() {
  return state.snapshot?.contacts || [];
}

function interactions() {
  return state.snapshot?.interactions || [];
}

function companyName(companyId) {
  return state.snapshot?.companies?.find((item) => item.company_id === companyId)?.name || companyId || "";
}

function contactById(contactId) {
  return contacts().find((item) => item.contact_id === contactId) || null;
}

function dealById(dealId) {
  return deals().find((item) => item.deal_id === dealId) || null;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  const openDealCount = deals().filter((item) => item.status === "open").length;
  const contactCount = contacts().length;
  els.syncStatus.textContent = snapshot?.contacts?.length ? `${openDealCount} ${t("openDeals")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.dealCount) els.dealCount.textContent = openDealCount;
  if (els.contactCount) els.contactCount.textContent = contactCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : `${openDealCount} ${t("openDeals")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "deals") return t("deals");
  if (view === "contacts") return t("contacts");
  if (view === "followups") return t("followups");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

function relationshipBadge(value) {
  return `<span class="relationship-badge rel-${escapeHtml(value)}">${escapeHtml(enumLabel(value, "relationship"))}</span>`;
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
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("pipelineValue")}</span><strong>${money(metrics.pipeline_value)}</strong></div>
      <div class="metric"><span>${t("weightedPipeline")}</span><strong>${money(metrics.weighted_pipeline_value)}</strong></div>
      <div class="metric"><span>${t("openDealCount")}</span><strong>${metrics.open_deal_count || 0}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount}</strong></div>
    </div>
  `;
}

function filteredDeals() {
  const query = state.query.trim().toLowerCase();
  if (!query) return deals();
  return deals().filter((item) =>
    [
      item.name,
      item.stage,
      item.status,
      item.next_step,
      item.owner,
      companyName(item.company_id),
      contactById(item.primary_contact_id)?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function filteredContacts() {
  const query = state.query.trim().toLowerCase();
  if (!query) return contacts();
  return contacts().filter((item) =>
    [item.name, item.role, item.relationship, item.email, companyName(item.company_id), ...(item.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function filteredFollowups() {
  const query = state.query.trim().toLowerCase();
  return followups().filter((item) => {
    const status = effectiveStatus(item);
    if (state.followupFilter !== "all" && status !== state.followupFilter) return false;
    if (!query) return true;
    return [
      item.subject,
      item.reason,
      item.suggested_reply,
      status,
      contactById(item.contact_id)?.name,
      companyName(contactById(item.contact_id)?.company_id),
    ]
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
  const openDeals = deals().filter((item) => item.status === "open");
  const maxStageValue = Math.max(
    1,
    ...stages.map((stage) =>
      deals()
        .filter((item) => item.stage === stage)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    ),
  );
  const dueFollowups = followups()
    .filter((item) => ["needs_review", "changes_requested", "approved"].includes(effectiveStatus(item)))
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
    .slice(0, 5);
  const recent = interactions()
    .slice()
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, 6);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("pipelineByStage")}</h2>
        ${stages
          .map((stage) => {
            const stageDeals = deals().filter((item) => item.stage === stage);
            const value = stageDeals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${stageBadge(stage)}<small>${stageDeals.length}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((value / maxStageValue) * 100)}%"></span></span>
              <span class="num">${money(value)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("followupsDue")}</h2>
        ${
          dueFollowups
            .map((item) => {
              const contact = contactById(item.contact_id);
              return `
            <a class="due-row" href="#/followups">
              <span><strong>${escapeHtml(item.subject || item.reason)}</strong><small>${escapeHtml(contact?.name || "")} · ${escapeHtml(companyName(contact?.company_id))}</small></span>
              <span class="due-meta">${statusBadge(effectiveStatus(item))}<small>${date(item.due_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noFollowups")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("recentActivity")}</h2>
        ${recent
          .map((item) => {
            const contact = contactById(item.contact_id);
            return `
            <div class="activity-row">
              <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
              <span><strong>${escapeHtml(contact?.name || "")}</strong><small>${escapeHtml(item.summary)}</small></span>
              <span class="muted">${date(item.occurred_at)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("network")}</h2>
        <div class="network-grid">
          <a href="#/contacts"><strong>${metrics.contact_count || 0}</strong><span>${t("contactsLower")}</span></a>
          <a href="#/deals"><strong>${metrics.company_count || 0}</strong><span>${t("companies")}</span></a>
          <a href="#/deals"><strong>${money(
            deals()
              .filter((item) => item.status === "won")
              .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          )}</strong><span>${t("wonValue")}</span></a>
          <a href="#/followups"><strong>${metrics.followups_due || 0}</strong><span>${t("dueSoon")}</span></a>
        </div>
        <div class="owner-note muted">${escapeHtml(openDeals.map((item) => item.owner).find(Boolean) || "")}</div>
      </div>
    </section>
  `;
}

function renderDeals() {
  els.title.textContent = t("deals");
  const items = filteredDeals();
  els.subtitle.textContent = `${items.filter((item) => item.status === "open").length} ${t("openDeals")}`;
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
              <th>${t("deal")}</th><th>${t("stage")}</th><th>${t("company")}</th><th>${t("contact")}</th><th>${t("amount")}</th><th>${t("probability")}</th><th>${t("nextStep")}</th><th>${t("owner")}</th><th>${t("lastActivity")}</th><th>${t("status")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const contact = contactById(item.primary_contact_id);
                return `
                <tr>
                  <td><a href="#/deals/${encodeURIComponent(item.deal_id)}"><span class="strong">${escapeHtml(item.name)}</span></a></td>
                  <td>${stageBadge(item.stage)}</td>
                  <td>${escapeHtml(companyName(item.company_id))}</td>
                  <td>${contact ? `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a>` : ""}</td>
                  <td class="num">${money(item.amount, item.currency)}</td>
                  <td class="num">${Math.round(Number(item.probability || 0) * 100)}%</td>
                  <td>${escapeHtml(item.next_step || "")}</td>
                  <td>${escapeHtml(item.owner || "")}</td>
                  <td>${date(item.last_activity_at)}</td>
                  <td>${statusBadge(item.status)}</td>
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

function renderDealDetail() {
  const item = dealById(state.route.id);
  if (!item) {
    renderDeals();
    return;
  }
  const linked = (item.contact_ids || [item.primary_contact_id]).map(contactById).filter(Boolean);
  const timeline = interactions()
    .filter((entry) => entry.deal_id === item.deal_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const related = followups().filter((entry) => entry.deal_id === item.deal_id);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${companyName(item.company_id)} · ${enumLabel(item.stage, "stage")} · ${money(item.amount, item.currency)}`;
  els.content.innerHTML = `
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="agent-panel">
          <h2>${t("agentNextAction")}</h2>
          <p>${escapeHtml(item.agent_next_action || item.next_step || "")}</p>
        </div>
        ${
          item.notes
            ? `
        <div class="overview-panel">
          <h2>${t("notes")}</h2>
          <p>${escapeHtml(item.notes)}</p>
        </div>
        `
            : ""
        }
        <div class="overview-panel">
          <h2>${t("timeline")}</h2>
          ${
            timeline
              .map(
                (entry) => `
            <div class="timeline-row">
              <span class="badge">${escapeHtml(enumLabel(entry.type, "type"))}</span>
              <span><strong>${escapeHtml(contactById(entry.contact_id)?.name || "")}</strong> <small class="muted">${escapeHtml(enumLabel(entry.direction, "direction"))} · ${date(entry.occurred_at)}</small><small>${escapeHtml(entry.summary)}</small></span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("empty")}</div>`
          }
        </div>
        ${
          related.length
            ? `
          <div class="overview-panel">
            <h2>${t("relatedFollowups")}</h2>
            ${related
              .map(
                (entry) => `
              <a class="due-row" href="#/followups">
                <span><strong>${t("followupRef")} #${entry.ref}</strong><small>${escapeHtml(entry.subject || entry.reason)}</small></span>
                <span class="due-meta">${statusBadge(effectiveStatus(entry))}<small>${date(entry.due_at)}</small></span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("dealDetail")}</h2>
        <dl>
          <dt>${t("stage")}</dt><dd>${stageBadge(item.stage)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(item.status)}</dd>
          <dt>${t("amount")}</dt><dd>${money(item.amount, item.currency)} ${escapeHtml(item.currency)}</dd>
          <dt>${t("probability")}</dt><dd>${Math.round(Number(item.probability || 0) * 100)}%</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "")}</dd>
          <dt>${t("expectedClose")}</dt><dd>${date(item.expected_close)}</dd>
          <dt>${t("nextStep")}</dt><dd>${escapeHtml(item.next_step || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(companyName(item.company_id))}</dd>
          <dt>${t("linkedContacts")}</dt><dd>${linked.map((contact) => `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a>`).join("<br>")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderContacts() {
  els.title.textContent = t("contacts");
  const items = filteredContacts();
  els.subtitle.textContent = `${items.length} ${t("contactsLower")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th><th>${t("company")}</th><th>${t("role")}</th><th>${t("relationship")}</th><th>${t("tags")}</th><th>${t("lastTouch")}</th><th>${t("nextFollowup")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/contacts/${encodeURIComponent(item.contact_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted">${escapeHtml(item.email || "")}</div></td>
              <td>${escapeHtml(companyName(item.company_id))}</td>
              <td>${escapeHtml(item.role || "")}</td>
              <td>${relationshipBadge(item.relationship)}</td>
              <td>${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</td>
              <td>${date(item.last_touch_at)}</td>
              <td>${item.next_followup_at ? date(item.next_followup_at) : `<span class="muted">—</span>`}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

function renderContactDetail() {
  const item = contactById(state.route.id);
  if (!item) {
    renderContacts();
    return;
  }
  const timeline = interactions()
    .filter((entry) => entry.contact_id === item.contact_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const openDeals = deals().filter(
    (entry) => (entry.contact_ids || [entry.primary_contact_id]).includes(item.contact_id) && entry.status === "open",
  );
  els.title.textContent = item.name;
  els.subtitle.textContent = `${item.role || ""} · ${companyName(item.company_id)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${
          item.agent_notes
            ? `
          <div class="agent-panel">
            <h2>${t("agentNotes")}</h2>
            <p>${escapeHtml(item.agent_notes)}</p>
          </div>
        `
            : ""
        }
        ${
          openDeals.length
            ? `
          <div class="overview-panel">
            <h2>${t("openDealsFor")}</h2>
            ${openDeals
              .map(
                (entry) => `
              <a class="due-row" href="#/deals/${encodeURIComponent(entry.deal_id)}">
                <span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.next_step || "")}</small></span>
                <span class="due-meta">${stageBadge(entry.stage)}<small class="num">${money(entry.amount, entry.currency)}</small></span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="overview-panel">
          <h2>${t("timeline")}</h2>
          ${
            timeline
              .map(
                (entry) => `
            <div class="timeline-row">
              <span class="badge">${escapeHtml(enumLabel(entry.type, "type"))}</span>
              <span><strong>${escapeHtml(enumLabel(entry.direction, "direction"))}</strong> <small class="muted">${date(entry.occurred_at)}</small><small>${escapeHtml(entry.summary)}</small></span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("empty")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("profile")}</h2>
        <dl>
          <dt>${t("email")}</dt><dd>${escapeHtml(item.email || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(companyName(item.company_id))}</dd>
          <dt>${t("role")}</dt><dd>${escapeHtml(item.role || "")}</dd>
          <dt>${t("relationship")}</dt><dd>${relationshipBadge(item.relationship)}</dd>
          <dt>${t("tags")}</dt><dd>${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</dd>
          <dt>${t("lastTouch")}</dt><dd>${date(item.last_touch_at)}</dd>
          <dt>${t("nextFollowup")}</dt><dd>${item.next_followup_at ? date(item.next_followup_at) : "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function followupFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all" ? followups().length : followups().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.followupFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function renderFollowups() {
  els.title.textContent = t("followups");
  const items = filteredFollowups();
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${followupFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const contact = contactById(item.contact_id);
            const deal = dealById(item.deal_id);
            const decision = decisionFor(item.followup_id);
            const edits = state.edits[item.followup_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.suggested_reply ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-followup="${escapeHtml(item.followup_id)}">
            <header class="queue-head">
              <span class="queue-ref">${t("followupRef")} #${item.ref}</span>
              ${statusBadge(status)}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${t("due")} ${date(item.due_at)}</span>
            </header>
            <div class="queue-meta">
              ${contact ? `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a> · ${escapeHtml(companyName(contact.company_id))}` : ""}
              ${deal ? ` · <a href="#/deals/${encodeURIComponent(deal.deal_id)}">${escapeHtml(deal.name)}</a>` : ""}
              · <span class="badge">${escapeHtml(enumLabel(item.channel_type, "type"))}</span>
            </div>
            ${item.subject ? `<div class="queue-subject strong">${escapeHtml(item.subject)}</div>` : ""}
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
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
          .join("") || `<div class="empty">${t("noFollowups")}</div>`
      }
    </div>
  `;
  bindFollowupEvents();
}

function bindFollowupEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.followupFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.followup;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.followup, button.dataset.action, card);
    });
  });
}

async function submitDecision(followupId, action, card) {
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
    body: JSON.stringify({ followup_id: followupId, action, comment: note, draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = body.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[followupId];
  state.notice = t("saved");
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
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
        <h2>${t("stages")}</h2>
        <div class="stage-list">${(summary.pipeline_stages || []).map((stage) => stageBadge(stage)).join(" ")}</div>
        <dl>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
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
            <span>${escapeHtml(channel.type)}${channel.handoff_skill ? ` · ${escapeHtml(channel.handoff_skill)}` : ""}</span>
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
  if (state.route.view === "deals" && state.route.id) renderDealDetail();
  else if (state.route.view === "deals") renderDeals();
  else if (state.route.view === "contacts" && state.route.id) renderContactDetail();
  else if (state.route.view === "contacts") renderContacts();
  else if (state.route.view === "followups") renderFollowups();
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
  localStorage.setItem("kelly-crm-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
