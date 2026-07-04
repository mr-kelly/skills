import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-devops-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-devops.sidebarCollapsed";

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
  expiringCount: document.querySelector("#count-expiring"),
  downCount: document.querySelector("#count-down"),
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

function money(value, currency = state.snapshot?.currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
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

function dateTime(value) {
  if (!value) return t("never");
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.notice = "";
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
  const route =
    scenario === "services"
      ? "#/services"
      : scenario === "expiries"
        ? "#/expiries"
        : scenario === "spend"
          ? "#/spend"
          : scenario === "actions"
            ? "#/actions"
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

function services() {
  return state.snapshot?.services || [];
}

function expiries() {
  return state.snapshot?.expiries || [];
}

function actions() {
  return state.snapshot?.actions || [];
}

function events() {
  return state.snapshot?.events || [];
}

function spend() {
  return state.snapshot?.spend || { providers: [], products: [] };
}

function metrics() {
  return state.snapshot?.metrics || {};
}

function actionById(actionId) {
  return actions().find((item) => item.action_id === actionId);
}

function renderShell() {
  applyI18n();
  const reviewCount = actions().filter((item) => item.status === "needs_review").length;
  const expiringCount = expiries().filter((item) => Number(item.days_left) <= 14).length;
  const downCount = services().filter((item) => item.status === "down").length;
  els.syncStatus.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${services().length} ${t("services").toLowerCase()}`
      : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.expiringCount) els.expiringCount.textContent = expiringCount;
  if (els.downCount) els.downCount.textContent = downCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needDecision")}`
      : downCount
        ? `${downCount} ${t("servicesDown")}`
        : `${services().length} ${t("services").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "services") return t("services");
  if (view === "expiries") return t("expiries");
  if (view === "spend") return t("spend");
  if (view === "actions") return t("actions");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusDot(status) {
  return `<span class="dot ${escapeHtml(status || "unknown")}" aria-hidden="true"></span>`;
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

function daysLeftBadge(daysLeft) {
  const days = Number(daysLeft);
  const cls = days < 7 ? "crit" : days < 30 ? "warn" : "ok";
  const label = days < 0 ? `${Math.abs(days)} ${t("days")} ${t("overdue")}` : `${days} ${t("days")}`;
  return `<span class="days-badge ${cls}">${escapeHtml(label)}</span>`;
}

function typeBadge(type) {
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

function warnings(serviceId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !serviceId || !item.service_id || item.service_id === serviceId,
  );
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

function sparkline(history) {
  const points = (history || []).map((entry) => Number(entry.latency_ms || 0));
  if (!points.length) return `<div class="empty">${t("notAvailable")}</div>`;
  const width = 260;
  const height = 64;
  const pad = 6;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const coords = points.map((value, index) => [pad + index * step, y(value)]);
  const line = coords.map(([x, yy], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const dots = coords
    .map(([x, yy], index) => {
      const status = history[index]?.status || "up";
      return status === "up"
        ? ""
        : `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3" class="spark-dot ${escapeHtml(status)}"></circle>`;
    })
    .join("");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("latency")}" preserveAspectRatio="none">
      <path d="${line}" fill="none"></path>
      ${dots}
    </svg>
  `;
}

function fleetCards() {
  const m = metrics();
  const spendDelta =
    Number(m.spend_last_month) > 0
      ? ((Number(m.spend_mtd) - Number(m.spend_last_month)) / Number(m.spend_last_month)) * 100
      : 0;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("services")}</span><strong>${m.services_up || 0} / ${m.services_total || 0}</strong><small>${m.services_degraded || 0} ${enumLabel("degraded")} · ${m.services_down || 0} ${enumLabel("down")}</small></div>
      <div class="metric"><span>${t("certs")}</span><strong>${m.certs_ok || 0} ${t("ok")}</strong><small>${m.certs_expiring || 0} ${t("expiring")}</small></div>
      <div class="metric"><span>${t("domains")}</span><strong>${m.domains_ok || 0} ${t("ok")}</strong><small>${m.domains_expiring || 0} ${t("expiring")}</small></div>
      <div class="metric"><span>${t("mtdVsLastMonth")}</span><strong>${money(m.spend_mtd)}</strong><small>${money(m.spend_last_month)} · ${pct(spendDelta)}</small></div>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("empty");
  const needsDecision = actions().filter((item) => item.status === "needs_review");
  const expiring = expiries().filter((item) => Number(item.days_left) <= 14);
  const down = services().filter((item) => item.status !== "up");
  const checks = state.snapshot?.checks || {};
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    ${fleetCards()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        ${needsDecision
          .map(
            (item) => `
          <a class="attention-row" href="#/actions/${encodeURIComponent(item.action_id)}">
            <span><strong>${t("actionRef")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></span>
            ${typeBadge(item.type)}
          </a>
        `,
          )
          .join("")}
        ${expiring
          .map(
            (item) => `
          <a class="attention-row" href="#/expiries/${encodeURIComponent(item.expiry_id)}">
            <span><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.product)} · ${date(item.expires_on)}</small></span>
            ${daysLeftBadge(item.days_left)}
          </a>
        `,
          )
          .join("")}
        ${down
          .map(
            (item) => `
          <a class="attention-row" href="#/services/${encodeURIComponent(item.service_id)}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.url)}</small></span>
            ${statusBadge(item.status)}
          </a>
        `,
          )
          .join("")}
        ${!needsDecision.length && !expiring.length && !down.length ? `<div class="empty">${t("empty")}</div>` : ""}
      </div>
      <div class="overview-panel">
        <h2>${t("recentEvents")}</h2>
        ${
          events()
            .slice(0, 8)
            .map(
              (event) => `
          <div class="event-row">
            <span class="event-meta">${statusDot(event.severity)}<small>${dateTime(event.at)}</small>${typeBadge(event.kind)}</span>
            <span class="event-message">${escapeHtml(event.message)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel wide">
        <h2>${t("checkFreshness")}</h2>
        <div class="freshness">
          <div class="freshness-item"><span>${t("serviceCheck")}</span><strong>${dateTime(checks.services_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("domainCheck")}</span><strong>${dateTime(checks.domains_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("spendIngest")}</span><strong>${dateTime(checks.spend_ingested_at)}</strong></div>
        </div>
      </div>
    </section>
  `;
}

function filteredServices() {
  const query = state.query.trim().toLowerCase();
  if (!query) return services();
  return services().filter((service) =>
    [service.name, service.product, service.url, service.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderServices() {
  els.title.textContent = t("services");
  const rows = filteredServices();
  els.subtitle.textContent = `${rows.length} ${t("configured")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("services")}</th><th>${t("product")}</th><th>${t("url")}</th><th>${t("status")}</th><th class="num">${t("latency")}</th><th class="num">${t("uptime7d")}</th><th>${t("certDaysLeft")}</th><th>${t("lastCheck")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (service) => `
            <tr>
              <td><a href="#/services/${encodeURIComponent(service.service_id)}"><strong>${escapeHtml(service.name)}</strong></a></td>
              <td><span class="badge">${escapeHtml(service.product)}</span></td>
              <td class="muted mono">${escapeHtml(service.url)}</td>
              <td>${statusBadge(service.status)}</td>
              <td class="num">${service.status === "down" ? t("notAvailable") : `${Number(service.latency_ms || 0)} ms`}</td>
              <td class="num">${Number(service.uptime_7d || 0).toFixed(2)}%</td>
              <td>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</td>
              <td class="muted">${dateTime(service.last_check_at)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function renderServiceDetail() {
  const service = services().find((item) => item.service_id === state.route.id);
  if (!service) {
    renderServices();
    return;
  }
  els.title.textContent = service.name;
  els.subtitle.textContent = `${service.product} · ${service.url}`;
  const linkedAction = actions().find(
    (item) => item.target?.id === service.service_id || item.target?.service_id === service.service_id,
  );
  els.content.innerHTML = `
    ${notice()}
    ${service.warnings?.length ? `<div class="warnings">${service.warnings.map((message) => `<div class="warning"><strong>${escapeHtml(message)}</strong></div>`).join("")}</div>` : ""}
    <div class="metrics">
      <div class="metric"><span>${t("status")}</span><strong>${statusBadge(service.status)}</strong></div>
      <div class="metric"><span>${t("latency")}</span><strong>${service.status === "down" ? t("notAvailable") : `${Number(service.latency_ms || 0)} ms`}</strong></div>
      <div class="metric"><span>${t("uptime7d")}</span><strong>${Number(service.uptime_7d || 0).toFixed(2)}%</strong></div>
      <div class="metric"><span>${t("certDaysLeft")}</span><strong>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</strong></div>
    </div>
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("checkHistory")}</h2>
          ${sparkline(service.history)}
          <div class="history-list">
            ${(service.history || [])
              .slice(-6)
              .reverse()
              .map(
                (entry) => `
              <div class="history-row">
                <span>${statusDot(entry.status)}${dateTime(entry.at)}</span>
                <span class="num">${entry.status === "down" ? `HTTP ${entry.http_status || "—"}` : `${entry.latency_ms} ms`}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        ${
          linkedAction
            ? `
          <div class="panel">
            <h2>${t("actions")}</h2>
            <a class="attention-row" href="#/actions/${encodeURIComponent(linkedAction.action_id)}">
              <span><strong>${t("actionRef")} #${linkedAction.ref} · ${escapeHtml(linkedAction.title)}</strong><small>${escapeHtml(linkedAction.reason)}</small></span>
              ${statusBadge(linkedAction.status)}
            </a>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("cert")}</h2>
        <dl>
          <dt>${t("issuer")}</dt><dd>${escapeHtml(service.ssl?.issuer || t("notAvailable"))}</dd>
          <dt>${t("expiresOn")}</dt><dd>${service.ssl?.valid_to ? date(service.ssl.valid_to) : t("notAvailable")}</dd>
          <dt>${t("daysLeft")}</dt><dd>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</dd>
        </dl>
        <h2>${t("metadata")}</h2>
        <dl>
          <dt>HTTP</dt><dd>${escapeHtml(String(service.meta?.http_status ?? t("notAvailable")))}</dd>
          <dt>Server</dt><dd>${escapeHtml(service.meta?.server || t("notAvailable"))}</dd>
          <dt>${t("lastCheck")}</dt><dd>${dateTime(service.last_check_at)}</dd>
          ${service.meta?.note ? `<dt>${t("note")}</dt><dd>${escapeHtml(service.meta.note)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function filteredExpiries() {
  const query = state.query.trim().toLowerCase();
  const rows = [...expiries()].sort((a, b) => Number(a.days_left) - Number(b.days_left));
  if (!query) return rows;
  return rows.filter((item) =>
    [item.item, item.product, item.type, item.registrar, item.detail]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderExpiries() {
  els.title.textContent = t("expiries");
  const rows = filteredExpiries();
  const expiring = rows.filter((item) => Number(item.days_left) <= 30).length;
  els.subtitle.textContent = `${rows.length} ${t("expiries").toLowerCase()} · ${expiring} ${t("expiring")}`;
  els.content.innerHTML = `
    ${notice()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("item")}</th><th>${t("product")}</th><th>${t("type")}</th><th>${t("expiresOn")}</th><th>${t("daysLeft")}</th><th>${t("autoRenew")}</th><th>${t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (item) => `
            <tr>
              <td><a href="#/expiries/${encodeURIComponent(item.expiry_id)}"><strong>${escapeHtml(item.item)}</strong></a></td>
              <td><span class="badge">${escapeHtml(item.product)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td>${date(item.expires_on)}</td>
              <td>${daysLeftBadge(item.days_left)}</td>
              <td>${item.auto_renew ? "✓" : "—"}</td>
              <td>${item.action_id ? actionLink(item.action_id) : `<span class="muted">${t("notAvailable")}</span>`}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function actionLink(actionId) {
  const action = actionById(actionId);
  if (!action) return `<span class="muted">${t("notAvailable")}</span>`;
  return `<a class="badge action-link" href="#/actions/${encodeURIComponent(actionId)}">${t("actionRef")} #${action.ref} · ${escapeHtml(enumLabel(action.status))}</a>`;
}

function renderExpiryDetail() {
  const item = expiries().find((row) => row.expiry_id === state.route.id);
  if (!item) {
    renderExpiries();
    return;
  }
  els.title.textContent = item.item;
  els.subtitle.textContent = `${enumLabel(item.type, "type")} · ${item.product}`;
  els.content.innerHTML = `
    ${notice()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("guidance")}</h2>
          <p class="guidance">${escapeHtml(item.detail || t("notAvailable"))}</p>
          ${item.action_id ? `<div class="guidance-action">${actionLink(item.action_id)}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("expiries")}</h2>
        <dl>
          <dt>${t("type")}</dt><dd>${typeBadge(item.type)}</dd>
          <dt>${t("expiresOn")}</dt><dd>${date(item.expires_on)}</dd>
          <dt>${t("daysLeft")}</dt><dd>${daysLeftBadge(item.days_left)}</dd>
          <dt>${t("autoRenew")}</dt><dd>${item.auto_renew ? "✓" : "—"}</dd>
          ${item.registrar ? `<dt>${t("registrar")}</dt><dd>${escapeHtml(item.registrar)}</dd>` : ""}
          <dt>${t("source")}</dt><dd>${escapeHtml(item.source || "")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderSpend() {
  els.title.textContent = t("spend");
  const data = spend();
  const anomalies = data.providers.filter((row) => row.anomaly).length;
  els.subtitle.textContent = `${money(metrics().spend_mtd)} ${t("mtd").toLowerCase()} · ${anomalies} ${t("anomalies")}`;
  els.content.innerHTML = `
    ${notice()}
    <div class="spend-grid">
      ${data.providers
        .map(
          (row) => `
        <div class="spend-card ${row.anomaly ? "anomaly" : ""}">
          <div class="row between">
            <strong>${escapeHtml(row.name)}</strong>
            ${row.anomaly ? `<span class="days-badge crit">${t("anomaly")}</span>` : ""}
          </div>
          <div class="balance">${money(row.mtd, row.currency)}</div>
          <div class="muted">${t("lastMonth")} ${money(row.last_month, row.currency)} · <span class="${Number(row.delta_pct) > 0 ? "negative" : "positive"}">${pct(row.delta_pct)}</span></div>
          ${row.note ? `<div class="muted spend-note">${escapeHtml(row.note)}</div>` : ""}
          ${row.action_id ? `<div>${actionLink(row.action_id)}</div>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="panel">
      <h2>${t("allocation")}</h2>
      <div class="table-wrap inset">
        <table class="compact">
          <thead>
            <tr><th>${t("product")}</th><th class="num">${t("mtd")}</th><th class="num">${t("lastMonth")}</th><th class="num">${t("delta")}</th><th class="num">${t("share")}</th></tr>
          </thead>
          <tbody>
            ${data.products
              .map((row) => {
                const delta =
                  Number(row.last_month) > 0
                    ? ((Number(row.mtd) - Number(row.last_month)) / Number(row.last_month)) * 100
                    : 0;
                return `
                <tr>
                  <td><strong>${escapeHtml(row.product)}</strong></td>
                  <td class="num">${money(row.mtd, row.currency)}</td>
                  <td class="num">${money(row.last_month, row.currency)}</td>
                  <td class="num ${delta > 0 ? "negative" : "positive"}">${pct(delta)}</td>
                  <td class="num">${Number(row.share_pct || 0)}%</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filteredActions() {
  const query = state.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...actions()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    [item.title, item.reason, item.type, item.status, item.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderActions() {
  els.title.textContent = t("actionsQueue");
  const rows = filteredActions();
  const review = rows.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${rows.length} ${t("actions").toLowerCase()} · ${review} ${t("needDecision")}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <div class="action-list">
      ${rows
        .map(
          (item) => `
        <a class="action-card" href="#/actions/${encodeURIComponent(item.action_id)}">
          <div class="action-card-head">
            <span class="action-ref">${t("actionRef")} #${item.ref}</span>
            ${typeBadge(item.type)}
            ${statusBadge(item.status)}
          </div>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="muted">${escapeHtml(item.reason)}</span>
          ${item.decision?.note ? `<span class="action-note">“${escapeHtml(item.decision.note)}”</span>` : ""}
        </a>
      `,
        )
        .join("")}
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

function renderActionDetail() {
  const action = actionById(state.route.id);
  if (!action) {
    renderActions();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = `${t("actionRef")} #${action.ref} · ${action.title}`;
  els.subtitle.textContent = `${enumLabel(action.type, "type")} · ${enumLabel(action.status)}`;
  const target = action.target || {};
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("reason")}</h2>
          <p class="guidance">${escapeHtml(action.reason)}</p>
        </div>
        <div class="panel">
          <h2>${t("evidence")}</h2>
          <ul class="evidence-list">
            ${(action.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>
        <div class="panel">
          <h2>${t("plan")}</h2>
          <ol class="plan-list">
            ${(action.plan || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ol>
        </div>
        <div class="panel">
          <h2>${t("note")}</h2>
          <textarea id="action-note" rows="3" placeholder="${t("notePlaceholder")}" ${locked ? "disabled" : ""}>${escapeHtml(action.note || "")}</textarea>
          <div class="decision-actions">
            <button type="button" class="primary" data-verdict="approve" ${locked ? "disabled" : ""} title="${t("approve")}">${t("approve")}</button>
            <button type="button" data-verdict="request_changes" ${locked ? "disabled" : ""} title="${t("requestChanges")}">${t("requestChanges")}</button>
            <button type="button" class="danger" data-verdict="block" ${locked ? "disabled" : ""} title="${t("block")}">${t("block")}</button>
            <button type="button" data-verdict="note" ${locked ? "disabled" : ""} title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("decision")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(action.status)}</dd>
          ${
            action.decision
              ? `
            <dt>${t("decision")}</dt><dd>${escapeHtml(enumLabel(action.decision.verdict === "approve" ? "approved" : action.decision.verdict === "block" ? "blocked" : "changes_requested"))}</dd>
            <dt>${t("generated")}</dt><dd>${dateTime(action.decision.decided_at)}</dd>
          `
              : ""
          }
        </dl>
        <h2>${t("target")}</h2>
        <dl>
          ${
            Object.entries(target)
              .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd class="mono">${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("notAvailable")}</dd>`
          }
        </dl>
      </aside>
    </section>
  `;
  els.content.querySelectorAll("[data-verdict]").forEach((button) => {
    button.addEventListener("click", () => submitDecision(action.action_id, button.dataset.verdict));
  });
}

async function submitDecision(actionId, verdict) {
  const note = els.content.querySelector("#action-note")?.value || "";
  if (state.settings?.demo) {
    const action = actionById(actionId);
    if (action) {
      if (verdict !== "note") {
        action.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      action.note = note;
      action.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_id: actionId, verdict, note }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Decision failed: ${res.status}`);
    state.notice = t("decisionSaved");
    await loadState();
  } catch (error) {
    state.notice = error.message;
    render();
  }
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    ${notice()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd class="mono">${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("services")}</h2>
        ${
          (summary.services || [])
            .map(
              (service) => `
          <div class="settings-row">
            <strong>${escapeHtml(service.name)}</strong>
            <span>${escapeHtml(service.product || "")}</span>
            <span class="mono muted">${escapeHtml(service.url || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("domains")}</h2>
        ${
          (summary.domains || [])
            .map(
              (domain) => `
          <div class="settings-row">
            <strong>${escapeHtml(domain.domain)}</strong>
            <span>${escapeHtml(domain.registrar || "")}</span>
            <span>${t("autoRenew")}: ${domain.auto_renew ? "✓" : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("keyRotation")}</h2>
        ${
          (summary.key_rotation || [])
            .map(
              (key) => `
          <div class="settings-row">
            <strong>${escapeHtml(key.name)}</strong>
            <span class="mono muted">${escapeHtml(key.env || "")}</span>
            <span>${key.env_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("billingSources")}</h2>
        ${
          (summary.billing_sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span class="mono muted">${escapeHtml((source.secret_envs || []).join(", "))}</span>
            <span>${source.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
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
  if (state.route.view === "services" && state.route.id) renderServiceDetail();
  else if (state.route.view === "services") renderServices();
  else if (state.route.view === "expiries" && state.route.id) renderExpiryDetail();
  else if (state.route.view === "expiries") renderExpiries();
  else if (state.route.view === "spend") renderSpend();
  else if (state.route.view === "actions" && state.route.id) renderActionDetail();
  else if (state.route.view === "actions") renderActions();
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
  localStorage.setItem("kelly-devops-language", state.lang);
  loadState();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
