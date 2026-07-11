import { messages } from "./i18n/messages.js";
import {
  renderChecks,
  renderClaims,
  renderDraftDetail,
  renderDrafts,
  renderReview,
  renderSettings,
} from "./js/review-views.js";

export const state = {
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
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-legal-contracts-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-legal-contracts.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};
const FEATURED_DEMO_DRAFT = "d-msa-liability-us";

export const els = {
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

export async function loadState() {
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
          : scenario === "claims"
            ? "#/claims"
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

export function products() {
  return state.snapshot?.products || [];
}

export function drafts() {
  return state.snapshot?.drafts || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

export function rules() {
  return state.snapshot?.rules || [];
}

export function reviewItems() {
  return state.snapshot?.review_items || [];
}

export function claimsRegistry() {
  return state.settings?.claims || { claims: [], rules: [] };
}

export function productById(productId) {
  return products().find((item) => item.product_id === productId) || null;
}

export function draftById(draftId) {
  return drafts().find((item) => item.draft_id === draftId) || null;
}

export function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

export function reviewForDraft(draftId) {
  return reviewItems().find((item) => item.draft_id === draftId) || null;
}

export function decisionFor(reviewId) {
  return state.settings?.decisions?.decisions?.[reviewId] || null;
}

export function effectiveReviewStatus(item) {
  const decision = decisionFor(item.review_id);
  if (!decision) return item.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return item.status;
}

export function effectiveDraftStatus(draft) {
  const item = reviewForDraft(draft.draft_id);
  if (!item) return draft.status;
  const decision = decisionFor(item.review_id);
  if (!decision) return draft.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return draft.status;
}

export function platformRulesFor(platform) {
  const entry = (state.settings?.config_summary?.platforms || []).find((item) => item.platform === platform);
  return entry?.rules || {};
}

export function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

export function charLength(value) {
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
  if (view === "claims") return t("claims");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function claimStatusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status, "claim"))}</span>`;
}

// Links a claims_registry check back to the offending rule / claim in the
// Claims view (deep-links to the anchored row).
export function claimRefLinks(refs) {
  if (!refs) return "";
  const registry = claimsRegistry();
  const parts = [];
  for (const ruleId of refs.rules || []) {
    const rule = (registry.rules || []).find((entry) => entry.rule_id === ruleId);
    parts.push(
      `<a class="tag" href="#/claims" title="${escapeHtml(rule?.reason || "")}">${escapeHtml(rule?.phrase || ruleId)}</a>`,
    );
  }
  for (const claimId of refs.claims || []) {
    const claim = (registry.claims || []).find((entry) => entry.claim_id === claimId);
    parts.push(`<a class="tag" href="#/claims">${escapeHtml(claim?.text || claimId)}</a>`);
  }
  return parts.length ? `<span class="claim-refs">${parts.join(" ")}</span>` : "";
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

export function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function localeBadge(locale) {
  return locale ? `<span class="tag">${escapeHtml(locale)}</span>` : "";
}

export function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings(draftId = "") {
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

export function draftLabel(draft) {
  const product = productById(draft.product_id);
  return `${product?.name || draft.product_id} · ${enumLabel(draft.platform, "platform")} ${draft.locale || ""}`.trim();
}

export function metricCards() {
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

export function filteredDrafts() {
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

export function render() {
  renderShell();
  if (state.route.view === "products" && state.route.id) renderProductDetail();
  else if (state.route.view === "products") renderProducts();
  else if (state.route.view === "drafts" && state.route.id) renderDraftDetail();
  else if (state.route.view === "drafts") renderDrafts();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "claims") renderClaims();
  else if (state.route.view === "review") renderReview();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
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
  localStorage.setItem("kelly-legal-contracts-language", state.lang);
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
