import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  reviewFilter: "all",
  checkRuleFilter: "all",
  checkPlatformFilter: "all",
  checkProductFilter: "all",
  checkResultFilter: "all",
  edits: {},
  fieldEdits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-listing-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-listing.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};
const FEATURED_DEMO_DRAFT = "d-lunchbox-amazon-us";

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
  failedCount: document.querySelector("#count-failed"),
  exportCount: document.querySelector("#count-export"),
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
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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
    scenario === "products"
      ? "#/products"
      : scenario === "drafts"
        ? "#/drafts"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "review"
            ? "#/review"
            : scenario === "detail"
              ? `#/drafts/${FEATURED_DEMO_DRAFT}`
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

function products() {
  return state.snapshot?.products || [];
}

function drafts() {
  return state.snapshot?.drafts || [];
}

function checks() {
  return state.snapshot?.checks || [];
}

function rules() {
  return state.snapshot?.rules || [];
}

function reviewItems() {
  return state.snapshot?.review_items || [];
}

function productById(productId) {
  return products().find((item) => item.product_id === productId) || null;
}

function draftById(draftId) {
  return drafts().find((item) => item.draft_id === draftId) || null;
}

function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

function reviewForDraft(draftId) {
  return reviewItems().find((item) => item.draft_id === draftId) || null;
}

function decisionFor(reviewId) {
  return state.settings?.decisions?.decisions?.[reviewId] || null;
}

function effectiveReviewStatus(item) {
  const decision = decisionFor(item.review_id);
  if (!decision) return item.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return item.status;
}

function effectiveDraftStatus(draft) {
  const item = reviewForDraft(draft.draft_id);
  if (!item) return draft.status;
  const decision = decisionFor(item.review_id);
  if (!decision) return draft.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return draft.status;
}

function platformRulesFor(platform) {
  const entry = (state.settings?.config_summary?.platforms || []).find((item) => item.platform === platform);
  return entry?.rules || {};
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function charLength(value) {
  return [...String(value || "")].length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review").length;
  const failedCount = checks().filter((item) => item.result === "fail").length;
  const exportCount = drafts().filter((item) => effectiveDraftStatus(item) === "approved").length;
  els.syncStatus.textContent =
    snapshot && drafts().length
      ? `${snapshot.seller?.brand || ""}`.trim() || `${drafts().length} ${t("draftsLower")}`
      : t("setupNeeded");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.failedCount) els.failedCount.textContent = failedCount;
  if (els.exportCount) els.exportCount.textContent = exportCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("awaitingReview")}`
      : `${drafts().length} ${t("draftsLower")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "products") return t("products");
  if (view === "drafts") return t("drafts");
  if (view === "checks") return t("checks");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

function localeBadge(locale) {
  return locale ? `<span class="tag">${escapeHtml(locale)}</span>` : "";
}

function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
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

function warnings(draftId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !draftId || !item.draft_id || item.draft_id === draftId,
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

function draftLabel(draft) {
  const product = productById(draft.product_id);
  return `${product?.name || draft.product_id} · ${enumLabel(draft.platform, "platform")} ${draft.locale || ""}`.trim();
}

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  const byPlatform = metrics.drafts_by_platform || {};
  const platformBits = Object.entries(byPlatform)
    .map(
      ([platform, count]) =>
        `<span class="platform-badge ${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))} ${count}</span>`,
    )
    .join(" ");
  return `
    <div class="metrics">
      <div class="metric"><span>${t("products")}</span><strong>${metrics.product_count || 0}</strong></div>
      <div class="metric"><span>${t("drafts")}</span><strong>${metrics.draft_count || 0}</strong><div class="metric-badges">${platformBits}</div></div>
      <div class="metric"><span>${t("passRate")}</span><strong>${metrics.compliance_pass_rate || 0}%</strong></div>
      <div class="metric"><span>${t("exportedThisWeek")}</span><strong>${metrics.exported_this_week || 0}</strong></div>
    </div>
  `;
}

function matrixCell(product, platform) {
  if (!(product.platforms || []).includes(platform)) return { state: "none", drafts: [] };
  const cellDrafts = drafts().filter((draft) => draft.product_id === product.product_id && draft.platform === platform);
  if (!cellDrafts.length) return { state: "none", drafts: [] };
  const statuses = cellDrafts.map((draft) => effectiveDraftStatus(draft));
  if (statuses.includes("done")) return { state: "exported", drafts: cellDrafts };
  if (statuses.every((status) => status === "approved")) return { state: "approved", drafts: cellDrafts };
  return { state: "draft", drafts: cellDrafts };
}

function statusMatrix() {
  const platforms = (state.settings?.config_summary?.platforms || []).map((entry) => entry.platform);
  const allPlatforms = platforms.length ? platforms : [...new Set(drafts().map((draft) => draft.platform))];
  if (!products().length) return `<div class="empty-inline">${t("noProducts")}</div>`;
  return `
    <div class="matrix-grid table-wrap">
      <table>
        <thead>
          <tr><th>${t("product")}</th>${allPlatforms.map((platform) => `<th>${escapeHtml(enumLabel(platform, "platform"))}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${products()
            .map(
              (product) => `
            <tr>
              <td><a class="strong" href="#/products/${encodeURIComponent(product.product_id)}">${escapeHtml(product.name)}</a><div class="muted">${escapeHtml(product.sku)}</div></td>
              ${allPlatforms
                .map((platform) => {
                  const cell = matrixCell(product, platform);
                  const first = cell.drafts[0];
                  const label = enumLabel(cell.state, "cell");
                  if (cell.state === "none")
                    return `<td><span class="matrix-cell none">${escapeHtml(label)}</span></td>`;
                  return `<td><a class="matrix-cell ${escapeHtml(cell.state)}" href="#/drafts/${encodeURIComponent(first.draft_id)}">${escapeHtml(label)}${cell.drafts.length > 1 ? ` ×${cell.drafts.length}` : ""}</a></td>`;
                })
                .join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${state.snapshot.seller?.brand || ""} · ${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const awaiting = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review");
  const activity = (state.snapshot?.activity_log || [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel wide">
        <h2>${t("matrix")}</h2>
        ${statusMatrix()}
      </div>
      <div class="overview-panel">
        <h2>${t("reviewQueue")}</h2>
        ${
          awaiting
            .map((item) => {
              const draft = draftById(item.draft_id);
              return `
            <a class="due-row" href="#/review">
              <span><strong>${t("draftRef")} #${item.ref} · ${escapeHtml(draft ? draftLabel(draft) : item.draft_id)}</strong><small>${escapeHtml(item.compliance_summary || "")}</small></span>
              <span class="due-meta">${statusBadge(effectiveReviewStatus(item))}${draft ? `<small>${scoreCell(draft.compliance_score)}</small>` : ""}</span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noReviewItems")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("activities")}</h2>
        ${
          activity
            .map(
              (item) => `
          <div class="activity-row">
            <span class="badge">${escapeHtml(enumLabel(item.actor, "actor"))}</span>
            <span><small>${escapeHtml(item.detail)}</small></span>
            <span class="muted">${date(item.at)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noActivity")}</div>`
        }
      </div>
    </section>
  `;
}

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  if (!query) return products();
  return products().filter((item) =>
    [item.name, item.sku, item.category, item.source, ...(item.keywords || []), ...(item.platforms || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderProducts() {
  els.title.textContent = t("products");
  const items = filteredProducts();
  els.subtitle.textContent = `${items.length} ${t("products")} · ${state.snapshot?.seller?.brand || ""}`;
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
              <th>${t("product")}</th><th>${t("sku")}</th><th>${t("category")}</th><th>${t("source")}</th><th>${t("platforms")}</th><th>${t("drafts")}</th><th>${t("status")}</th><th>${t("lastUpdated")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const own = drafts().filter((draft) => draft.product_id === item.product_id);
                const needsReview = own.filter((draft) => effectiveDraftStatus(draft) === "needs_review").length;
                const exported = own.filter((draft) => effectiveDraftStatus(draft) === "done").length;
                const overall = needsReview
                  ? "needs_review"
                  : own.some((draft) => effectiveDraftStatus(draft) === "changes_requested")
                    ? "changes_requested"
                    : exported === own.length && own.length
                      ? "done"
                      : "approved";
                return `
                <tr>
                  <td><a href="#/products/${encodeURIComponent(item.product_id)}"><span class="strong">${escapeHtml(item.name)}</span></a></td>
                  <td>${escapeHtml(item.sku)}</td>
                  <td>${escapeHtml(item.category || "")}</td>
                  <td>${sourceBadge(item.source)}</td>
                  <td>${(item.platforms || []).map(platformBadge).join(" ")}</td>
                  <td>${own.length}</td>
                  <td>${own.length ? statusBadge(overall) : `<span class="muted">${enumLabel("none", "cell")}</span>`}</td>
                  <td>${date(item.updated_at)}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noProducts")}</div>`
    }
  `;
}

function renderProductDetail() {
  const product = productById(state.route.id);
  if (!product) {
    renderProducts();
    return;
  }
  const own = drafts().filter((draft) => draft.product_id === product.product_id);
  els.title.textContent = product.name;
  els.subtitle.textContent = `${product.sku} · ${product.category || ""} · ${enumLabel(product.source, "source")}`;
  els.content.innerHTML = `
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="section-block">
          <h2>${t("specs")}</h2>
          <div class="table-wrap spec-table">
            <table>
              <thead><tr><th>${t("name")}</th><th>${t("value")}</th></tr></thead>
              <tbody>
                ${(product.specs || []).map((spec) => `<tr><td class="strong">${escapeHtml(spec.name)}</td><td>${escapeHtml(spec.value)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="section-block">
          <h2>${t("features")}</h2>
          <ul>${(product.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
        </div>
        <div class="section-block">
          <h2>${t("keywords")}</h2>
          <div class="chip-list">${(product.keywords || []).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
        </div>
        <div class="section-block">
          <h2>${t("linkedDrafts")}</h2>
          ${
            own
              .map(
                (draft) => `
            <a class="due-row" href="#/drafts/${encodeURIComponent(draft.draft_id)}">
              <span><strong>${t("draftRef")} #${draft.ref} · ${escapeHtml(enumLabel(draft.platform, "platform"))} ${escapeHtml(draft.locale || "")}</strong><small>${escapeHtml(draft.fields?.title || "")}</small></span>
              <span class="due-meta">${statusBadge(effectiveDraftStatus(draft))}<small>${scoreCell(draft.compliance_score)}</small></span>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noDrafts")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <div>
          <h2>${t("productDetail")}</h2>
          <dl>
            <dt>${t("sku")}</dt><dd>${escapeHtml(product.sku)}</dd>
            <dt>${t("source")}</dt><dd>${sourceBadge(product.source)}</dd>
            <dt>${t("platforms")}</dt><dd>${(product.platforms || []).map(platformBadge).join(" ")}</dd>
            <dt>${t("locales")}</dt><dd>${(product.locales || []).map(localeBadge).join(" ")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(product.updated_at)}</dd>
          </dl>
          ${product.notes ? `<p class="muted product-notes">${escapeHtml(product.notes)}</p>` : ""}
        </div>
        <div>
          <h2>${t("imageChecklist")}</h2>
          ${(product.images || [])
            .map(
              (image) => `
            <div class="check-row">
              <span class="image-tick ${escapeHtml(image.status)}" aria-hidden="true">${image.status === "ready" ? "✓" : image.status === "missing" ? "✕" : "…"}</span>
              <span><strong>${escapeHtml(image.name)}</strong><small>${escapeHtml(enumLabel(image.status, "image"))}</small></span>
            </div>
          `,
            )
            .join("")}
        </div>
      </aside>
    </section>
  `;
}

function filteredDrafts() {
  const query = state.query.trim().toLowerCase();
  if (!query) return drafts();
  return drafts().filter((item) =>
    [
      item.fields?.title,
      item.platform,
      item.locale,
      effectiveDraftStatus(item),
      productById(item.product_id)?.name,
      productById(item.product_id)?.sku,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderDrafts() {
  els.title.textContent = t("drafts");
  const items = filteredDrafts();
  els.subtitle.textContent = `${items.length} ${t("draftsLower")}`;
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
              <th>${t("draft")}</th><th>${t("product")}</th><th>${t("platform")}</th><th>${t("locale")}</th><th>${t("title")}</th><th>${t("score")}</th><th>${t("status")}</th><th>${t("lastUpdated")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const product = productById(item.product_id);
                const title = item.fields?.title || "";
                return `
                <tr>
                  <td><a href="#/drafts/${encodeURIComponent(item.draft_id)}"><span class="strong">${t("draftRef")} #${item.ref}</span></a></td>
                  <td><a href="#/products/${encodeURIComponent(item.product_id)}">${escapeHtml(product?.name || item.product_id)}</a></td>
                  <td>${platformBadge(item.platform)}</td>
                  <td>${localeBadge(item.locale)}</td>
                  <td class="title-cell">${escapeHtml(title.length > 90 ? `${title.slice(0, 90)}…` : title)}</td>
                  <td>${scoreCell(item.compliance_score)}</td>
                  <td>${statusBadge(effectiveDraftStatus(item))}</td>
                  <td>${date(item.updated_at)}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noDrafts")}</div>`
    }
  `;
}

function editedFields(draft) {
  return { ...draft.fields, ...(state.fieldEdits[draft.draft_id] || {}) };
}

function counterMarkup(id, current, max, unit) {
  const over = max && current > max;
  return `<span class="counter ${over ? "over" : ""}" id="${id}">${current}${max ? ` / ${max}` : ""} ${unit}</span>`;
}

function textField({ draft, key, label, value, rows = 2, max = 0, unit = "chars", mono = false }) {
  const current = unit === "bytes" ? byteLength(value) : charLength(value);
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label>${counterMarkup(`count-${key}`, current, max, t(unit))}</div>
      <textarea id="f-${key}" class="field-input ${mono ? "mono" : ""}" data-field="${escapeHtml(key)}" data-max="${max}" data-unit="${unit}" rows="${rows}">${escapeHtml(value || "")}</textarea>
    </div>
  `;
}

function listField({ key, label, values, rows = 6, hint = "" }) {
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label><span class="counter" id="count-${key}">${(values || []).length}</span></div>
      <textarea id="f-${key}" class="field-input" data-field="${escapeHtml(key)}" data-kind="list" rows="${rows}">${escapeHtml((values || []).join("\n"))}</textarea>
      ${hint ? `<div class="muted field-hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function draftFieldsEditor(draft) {
  const fields = editedFields(draft);
  const rules = platformRulesFor(draft.platform);
  const titleMax = Number(rules.title_max_chars) || 0;
  if (draft.platform === "amazon") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 200 })}
      ${listField({ key: "bullets", label: `${t("bullets")} (5)`, values: fields.bullets, rows: 8 })}
      ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ draft, key: "search_terms", label: t("searchTerms"), value: fields.search_terms, rows: 3, max: Number(rules.search_terms_max_bytes) || 249, unit: "bytes", mono: true })}
      ${listField({ key: "aplus_outline", label: t("aplusOutline"), values: fields.aplus_outline, rows: 5 })}
    `;
  }
  if (draft.platform === "shopify") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 70 })}
      ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ draft, key: "seo_title", label: t("seoTitle"), value: fields.seo_title, rows: 2, max: Number(rules.seo_title_max_chars) || 60 })}
      ${textField({ draft, key: "seo_description", label: t("seoDescription"), value: fields.seo_description, rows: 3, max: Number(rules.seo_description_max_chars) || 160 })}
    `;
  }
  if (draft.platform === "tiktok_shop") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 255 })}
      ${listField({ key: "selling_points", label: t("sellingPoints"), values: fields.selling_points, rows: 5 })}
    `;
  }
  return `
    ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 80 })}
    ${textField({ draft, key: "subtitle", label: t("subtitle"), value: fields.subtitle, rows: 2 })}
    ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
    ${listField({ key: "item_specifics", label: t("itemSpecifics"), values: (fields.item_specifics || []).map((item) => `${item.name}: ${item.value}`), rows: 6 })}
  `;
}

function localeTabs(draft) {
  if (!draft.variant_group) return "";
  const variants = drafts().filter((item) => item.variant_group === draft.variant_group);
  if (variants.length < 2) return "";
  return `
    <div class="locale-tabs" role="tablist" aria-label="${t("variantTabs")}">
      <span class="muted">${t("variantTabs")}:</span>
      ${variants
        .map(
          (variant) => `
        <a role="tab" aria-selected="${variant.draft_id === draft.draft_id}" class="locale-tab ${variant.draft_id === draft.draft_id ? "active" : ""}" href="#/drafts/${encodeURIComponent(variant.draft_id)}">${escapeHtml(variant.locale || variant.draft_id)}</a>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderDraftDetail() {
  const draft = draftById(state.route.id);
  if (!draft) {
    renderDrafts();
    return;
  }
  const product = productById(draft.product_id);
  const draftChecks = checks().filter((item) => item.draft_id === draft.draft_id);
  const review = reviewForDraft(draft.draft_id);
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = `${t("draftRef")} #${draft.ref} · ${product?.name || draft.product_id}`;
  els.subtitle.textContent = `${enumLabel(draft.platform, "platform")} · ${draft.locale || ""} · ${enumLabel(effectiveDraftStatus(draft))}`;
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings(draft.draft_id)}
    <section class="detail">
      <div class="detail-main">
        ${localeTabs(draft)}
        <div class="section-block workbench" data-draft="${escapeHtml(draft.draft_id)}">
          <h2>${t("editFields")}</h2>
          ${draftFieldsEditor(draft)}
          <div class="notes-actions">
            <button id="saveFields" type="button" ${locked || !review ? "disabled" : ""}>${t("saveEdits")}</button>
            <span class="muted">${t("fieldsSavedHint")}</span>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <div>
          <h2>${t("draftDetail")}</h2>
          <dl>
            <dt>${t("status")}</dt><dd>${statusBadge(effectiveDraftStatus(draft))}</dd>
            <dt>${t("score")}</dt><dd>${scoreCell(draft.compliance_score)}</dd>
            <dt>${t("platform")}</dt><dd>${platformBadge(draft.platform)}</dd>
            <dt>${t("locale")}</dt><dd>${localeBadge(draft.locale)}</dd>
            <dt>${t("product")}</dt><dd><a href="#/products/${encodeURIComponent(draft.product_id)}">${escapeHtml(product?.name || draft.product_id)}</a></dd>
            <dt>${t("sku")}</dt><dd>${escapeHtml(product?.sku || "")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(draft.updated_at)}</dd>
          </dl>
        </div>
        ${
          draft.keyword_strategy
            ? `
          <div class="agent-panel">
            <h2>${t("keywordStrategy")}</h2>
            <p>${escapeHtml(draft.keyword_strategy)}</p>
          </div>
        `
            : ""
        }
        <div>
          <h2>${t("complianceChecks")}</h2>
          ${
            draftChecks
              .map(
                (item) => `
            <div class="check-row">
              ${resultBadge(item.result)}
              <span>
                <strong>${escapeHtml(ruleById(item.rule_id)?.name || item.rule_id)}</strong>
                <small>${escapeHtml(item.evidence || "")}</small>
              </span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
          }
        </div>
      </aside>
    </section>
  `;
  bindWorkbenchEvents(draft, review);
}

function bindWorkbenchEvents(draft, review) {
  const workbench = els.content.querySelector(".workbench");
  if (!workbench) return;
  workbench.querySelectorAll("textarea.field-input").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.field;
      const edits = state.fieldEdits[draft.draft_id] || (state.fieldEdits[draft.draft_id] = {});
      if (input.dataset.kind === "list") {
        const values = input.value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        edits[key] =
          key === "item_specifics"
            ? values.map((line) => {
                const idx = line.indexOf(":");
                return idx === -1
                  ? { name: line, value: "" }
                  : { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
              })
            : values;
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) counter.textContent = String(values.length);
      } else {
        edits[key] = input.value;
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) {
          const max = Number(input.dataset.max) || 0;
          const unit = input.dataset.unit || "chars";
          const current = unit === "bytes" ? byteLength(input.value) : charLength(input.value);
          counter.textContent = `${current}${max ? ` / ${max}` : ""} ${t(unit)}`;
          counter.classList.toggle("over", Boolean(max) && current > max);
        }
      }
    });
  });
  workbench.querySelector("#saveFields")?.addEventListener("click", () => {
    if (!review) return;
    submitDecision(review.review_id, "revise", { fields: editedFields(draft) });
  });
}

function filteredChecks() {
  const query = state.query.trim().toLowerCase();
  return checks().filter((item) => {
    if (state.checkRuleFilter !== "all" && item.rule_id !== state.checkRuleFilter) return false;
    const draft = draftById(item.draft_id);
    if (state.checkPlatformFilter !== "all" && draft?.platform !== state.checkPlatformFilter) return false;
    if (state.checkProductFilter !== "all" && draft?.product_id !== state.checkProductFilter) return false;
    if (state.checkResultFilter !== "all" && item.result !== state.checkResultFilter) return false;
    if (!query) return true;
    return [ruleById(item.rule_id)?.name, item.evidence, item.result, draft ? draftLabel(draft) : ""]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderChecks() {
  els.title.textContent = t("checks");
  const items = filteredChecks();
  const all = checks();
  const passCount = all.filter((item) => item.result === "pass").length;
  const warnCount = all.filter((item) => item.result === "warn").length;
  const failCount = all.filter((item) => item.result === "fail").length;
  els.subtitle.textContent = `${all.length} ${t("checksTotal")} · ${failCount} ${t("failedChecks")}`;
  const platforms = [...new Set(drafts().map((draft) => draft.platform))];
  els.content.innerHTML = `
    ${warnings()}
    <div class="metrics">
      <div class="metric"><span>${t("checks")}</span><strong>${all.length}</strong></div>
      <div class="metric"><span>${enumLabel("pass", "result")}</span><strong>${passCount}</strong></div>
      <div class="metric"><span>${enumLabel("warn", "result")}</span><strong>${warnCount}</strong></div>
      <div class="metric"><span>${enumLabel("fail", "result")}</span><strong>${failCount}</strong></div>
    </div>
    <div class="check-filters">
      <select id="ruleFilter" aria-label="${t("rule")}">
        <option value="all">${t("all")} · ${t("rule")}</option>
        ${rules()
          .map(
            (rule) =>
              `<option value="${escapeHtml(rule.rule_id)}" ${state.checkRuleFilter === rule.rule_id ? "selected" : ""}>${escapeHtml(rule.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="platformFilter" aria-label="${t("platform")}">
        <option value="all">${t("all")} · ${t("platform")}</option>
        ${platforms.map((platform) => `<option value="${escapeHtml(platform)}" ${state.checkPlatformFilter === platform ? "selected" : ""}>${escapeHtml(enumLabel(platform, "platform"))}</option>`).join("")}
      </select>
      <select id="productFilter" aria-label="${t("product")}">
        <option value="all">${t("all")} · ${t("product")}</option>
        ${products()
          .map(
            (product) =>
              `<option value="${escapeHtml(product.product_id)}" ${state.checkProductFilter === product.product_id ? "selected" : ""}>${escapeHtml(product.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="resultFilter" aria-label="${t("result")}">
        <option value="all">${t("all")} · ${t("result")}</option>
        ${["pass", "warn", "fail"].map((result) => `<option value="${result}" ${state.checkResultFilter === result ? "selected" : ""}>${escapeHtml(enumLabel(result, "result"))}</option>`).join("")}
      </select>
    </div>
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("draft")}</th><th>${t("platform")}</th><th>${t("rule")}</th><th>${t("severity")}</th><th>${t("result")}</th><th>${t("evidence")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const draft = draftById(item.draft_id);
                const rule = ruleById(item.rule_id);
                return `
                <tr>
                  <td><a href="#/drafts/${encodeURIComponent(item.draft_id)}"><span class="strong">${t("draftRef")} #${draft?.ref || ""} · ${escapeHtml(draft ? productById(draft.product_id)?.name || "" : item.draft_id)}</span></a><div class="muted">${escapeHtml(draft?.locale || "")}</div></td>
                  <td>${draft ? platformBadge(draft.platform) : ""}</td>
                  <td>${escapeHtml(rule?.name || item.rule_id)}</td>
                  <td>${severityBadge(item.severity)}</td>
                  <td>${resultBadge(item.result)}</td>
                  <td class="evidence-cell">${escapeHtml(item.evidence || "")}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noChecks")}</div>`
    }
  `;
  const bind = (id, prop) => {
    els.content.querySelector(id)?.addEventListener("change", (event) => {
      state[prop] = event.target.value;
      render();
    });
  };
  bind("#ruleFilter", "checkRuleFilter");
  bind("#platformFilter", "checkPlatformFilter");
  bind("#productFilter", "checkProductFilter");
  bind("#resultFilter", "checkResultFilter");
}

function filteredReviewItems() {
  const query = state.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    const status = effectiveReviewStatus(item);
    if (state.reviewFilter !== "all" && status !== state.reviewFilter) return false;
    if (!query) return true;
    const draft = draftById(item.draft_id);
    return [draft ? draftLabel(draft) : item.draft_id, item.compliance_summary, status, draft?.fields?.title]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function reviewFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all"
              ? reviewItems().length
              : reviewItems().filter((item) => effectiveReviewStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.reviewFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function renderReview() {
  els.title.textContent = t("review");
  const items = filteredReviewItems();
  const reviewCount = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("awaitingReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${reviewFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveReviewStatus(item);
            const draft = draftById(item.draft_id);
            const decision = decisionFor(item.review_id);
            const edits = state.edits[item.review_id] || {};
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-review="${escapeHtml(item.review_id)}">
            <header class="queue-head">
              <span class="queue-ref">${t("draftRef")} #${item.ref}</span>
              ${statusBadge(status)}
              ${draft ? platformBadge(draft.platform) : ""}
              ${draft ? localeBadge(draft.locale) : ""}
              <span class="queue-score muted">${t("score")} ${draft ? scoreCell(draft.compliance_score) : ""}</span>
            </header>
            <div class="queue-meta">
              ${draft ? `<a href="#/drafts/${encodeURIComponent(draft.draft_id)}">${escapeHtml(productById(draft.product_id)?.name || draft.draft_id)}</a> · ${escapeHtml(draft.fields?.title?.slice(0, 110) || "")}` : escapeHtml(item.draft_id)}
            </div>
            <p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary || "")}</p>
            ${draft?.keyword_strategy ? `<p class="queue-summary"><span class="muted">${t("keywordStrategy")}:</span> ${escapeHtml(draft.keyword_strategy)}</p>` : ""}
            ${
              item.suggestions?.length
                ? `
              <span class="queue-label">${t("suggestions")}</span>
              <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
            `
                : ""
            }
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
          .join("") || `<div class="empty">${t("noReviewItems")}</div>`
      }
    </div>
  `;
  bindReviewEvents();
}

function bindReviewEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.reviewFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.review;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      const note = card.querySelector('[data-field="note"]')?.value ?? "";
      submitDecision(card.dataset.review, button.dataset.action, { comment: note });
    });
  });
}

async function submitDecision(reviewId, action, { comment = "", fields } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = { review_id: reviewId, action, comment };
  if (fields !== undefined) body.fields = fields;
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = payload.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[reviewId];
  state.notice = t("saved");
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const seller = summary.seller || {};
  const exportPrefs = summary.export || {};
  const publish = summary.publish || {};
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
        <h2>${t("seller")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(seller.brand || "")}</dd>
          <dt>${t("entity")}</dt><dd>${escapeHtml(seller.entity || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(seller.tone || "")}</dd>
          <dt>${t("locales")}</dt><dd>${(summary.locales || []).map(localeBadge).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("platforms")} · ${t("rules")}</h2>
        ${
          (summary.platforms || [])
            .map((entry) => {
              const rulesList = Object.entries(entry.rules || {})
                .map(
                  ([key, value]) =>
                    `<span class="tag">${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? value.join(", ") : String(value))}</span>`,
                )
                .join(" ");
              return `
            <div class="settings-row">
              <strong>${escapeHtml(enumLabel(entry.platform, "platform"))}</strong>
              <span>${(entry.locales || []).map(localeBadge).join(" ")}</span>
              <span class="${entry.enabled ? "ok" : "warn"}">${entry.enabled ? t("yes") : t("no")}</span>
              <div class="chip-list rule-chips">${rulesList}</div>
            </div>
          `;
            })
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("bannedWords")} · ${t("competitorBrands")}</h2>
        <dl>
          <dt>${t("bannedWords")}</dt><dd>${summary.banned_words_count || 0}</dd>
          <dt>${t("competitorBrands")}</dt><dd>${summary.competitor_brands_count || 0}</dd>
          <dt>${t("maxRepeats")}</dt><dd>${summary.keyword_stuffing?.max_repeats || 3}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown+csv")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("publishHandoff")}</h2>
        <dl>
          <dt>${t("handoffToAgent")}</dt><dd>${publish.handoff_to_agent ? t("byAgentAfterApproval") : t("no")}</dd>
          <dt>${t("requiresApproval")}</dt><dd>${publish.requires_approval ? t("yes") : t("no")}</dd>
        </dl>
        ${
          (publish.secret_envs || []).length
            ? `
          <div class="settings-row">
            <strong>${(publish.secret_envs || []).join(", ")}</strong>
            <span></span>
            <span class="${publish.secrets_ready ? "ok" : "warn"}">${publish.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `
            : ""
        }
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "products" && state.route.id) renderProductDetail();
  else if (state.route.view === "products") renderProducts();
  else if (state.route.view === "drafts" && state.route.id) renderDraftDetail();
  else if (state.route.view === "drafts") renderDrafts();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "review") renderReview();
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
  localStorage.setItem("kelly-listing-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
