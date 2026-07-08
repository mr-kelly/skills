import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-products-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const FEATURED_PRODUCT = "prod-aurora-lamp";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-products.sidebarCollapsed";

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
  stockCount: document.querySelector("#count-stock"),
  channelCount: document.querySelector("#count-channel"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  const key = String(value || "");
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  setMobileSidebarOpen(false);
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
      : scenario === "inventory"
        ? "#/inventory"
        : scenario === "channels"
          ? "#/channels"
          : scenario === "review"
            ? "#/review"
            : scenario === "detail"
              ? `#/products/${FEATURED_PRODUCT}`
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
  for (const option of els.language.options) option.textContent = languageLabels[option.value] || option.textContent;
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function products() {
  return state.snapshot?.products || [];
}

function channels() {
  return state.snapshot?.channel_matrix || [];
}

function inventory() {
  return state.snapshot?.inventory || [];
}

function reviewItems() {
  return state.snapshot?.review_items || [];
}

function productById(productId) {
  return products().find((product) => product.product_id === productId) || null;
}

function channelsFor(productId) {
  return channels().filter((item) => item.product_id === productId);
}

function inventoryFor(productId) {
  return inventory().find((item) => item.product_id === productId) || null;
}

function reviewFor(productId) {
  return reviewItems().filter((item) => item.product_id === productId);
}

function filteredProducts() {
  const q = state.query.trim().toLowerCase();
  if (!q) return products();
  return products().filter((product) =>
    [product.name, product.sku, product.category, product.owner, product.vendor, ...(product.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function money2(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderShell() {
  applyI18n();
  const metrics = state.snapshot?.metrics || {};
  els.reviewCount.textContent = String(reviewItems().filter((item) => item.status === "needs_review").length);
  els.stockCount.textContent = String(metrics.low_stock_count || 0);
  els.channelCount.textContent = String(metrics.channel_issue_count || 0);
  els.syncStatus.textContent = state.settings?.demo
    ? t("demoNote")
    : `${t("generated")} ${date(state.snapshot?.generated_at)}`;
  els.language.value = state.lang;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function setPage(title, subtitle = "") {
  els.title.textContent = title;
  els.subtitle.textContent = subtitle;
  els.mobileViewTitle.textContent = title;
  els.mobileViewMeta.textContent = subtitle || (state.settings?.demo ? t("demoNote") : "");
}

function badge(value, group = "status") {
  return `<span class="badge badge-${String(value || "neutral").replaceAll("_", "-")}">${esc(enumLabel(value, group))}</span>`;
}

function metricCard(label, value, hint = "") {
  return `<article class="metric-card">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
    ${hint ? `<em>${esc(hint)}</em>` : ""}
  </article>`;
}

function productImage(product) {
  return `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">`;
}

function productCard(product) {
  const inv = product.inventory || {};
  return `<article class="product-card">
    <a class="product-card-image" href="#/products/${encodeURIComponent(product.product_id)}">${productImage(product)}</a>
    <div class="product-card-body">
      <div class="product-card-head">
        <div>
          <a class="product-title" href="#/products/${encodeURIComponent(product.product_id)}">${esc(product.name)}</a>
          <div class="muted">${esc(product.sku)} · ${esc(product.category)}</div>
        </div>
        ${badge(product.status)}
      </div>
      <p>${esc(product.subtitle)}</p>
      <div class="tag-row">${(product.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
      <div class="product-stats">
        <div><span>${t("grossMargin")}</span><strong>${pct(product.pricing?.gross_margin_pct)}</strong></div>
        <div><span>${t("daysCover")}</span><strong>${esc(inv.days_cover ?? "")}</strong></div>
        <div><span>${t("onHand")}</span><strong>${Number(inv.on_hand || 0).toLocaleString()}</strong></div>
      </div>
    </div>
  </article>`;
}

function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  const currency = state.snapshot?.seller?.base_currency || "USD";
  setPage(t("overview"), state.settings?.demo ? t("demoNote") : "");
  const review = reviewItems().slice(0, 3);
  els.content.innerHTML = `
    <section class="metrics-grid">
      ${metricCard(t("products"), String(metrics.product_count || 0), t("allProducts"))}
      ${metricCard(t("activeProducts"), String(metrics.active_count || 0), t("lifecycle"))}
      ${metricCard(t("avgMargin"), pct(metrics.avg_margin_pct), t("grossMargin"))}
      ${metricCard(t("inventoryValue"), money(metrics.inventory_value, currency), t("localFilesOnly"))}
    </section>
    <section class="overview-layout">
      <div class="panel">
        <div class="panel-head">
          <h2>${t("products")}</h2>
          <a href="#/products">${t("allProducts")}</a>
        </div>
        <div class="product-grid compact">
          ${products()
            .slice(0, 4)
            .map((product) => productCard(product))
            .join("")}
        </div>
      </div>
      <aside class="panel">
        <div class="panel-head">
          <h2>${t("reviewQueue")}</h2>
          <a href="#/review">${t("review")}</a>
        </div>
        <div class="review-list compact-list">
          ${review.map((item) => reviewRow(item)).join("")}
        </div>
      </aside>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>${t("activity")}</h2>
        <span class="muted">${date(state.snapshot?.generated_at)}</span>
      </div>
      <div class="timeline">
        ${(state.snapshot?.activity_log || [])
          .map(
            (item) => `<div class="timeline-item">
              <span>${date(item.at)}</span>
              <strong>${esc(item.actor)}</strong>
              <p>${esc(item.text)}</p>
            </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

function renderProducts() {
  const list = filteredProducts();
  setPage(t("products"), `${list.length} ${t("products").toLowerCase()}`);
  els.content.innerHTML = `<div class="product-grid">${list.map((product) => productCard(product)).join("")}</div>`;
}

function renderProductDetail(productId) {
  const product = productById(productId);
  if (!product) {
    setPage(t("product"), t("empty"));
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  const inv = inventoryFor(product.product_id);
  const channelRows = channelsFor(product.product_id);
  const reviewRows = reviewFor(product.product_id);
  const currency = state.snapshot?.seller?.base_currency || "USD";
  setPage(product.name, `${product.sku} · ${product.category}`);
  els.content.innerHTML = `
    <section class="detail-hero">
      <div class="detail-gallery">
        <div class="main-photo">${productImage(product)}</div>
        <div class="thumb-row">
          ${(product.gallery || [product.image]).map((src) => `<img src="${esc(src)}" alt="${esc(product.name)}">`).join("")}
        </div>
      </div>
      <div class="detail-summary">
        <div class="detail-heading">
          <div>
            <div class="muted">${esc(product.sku)} · ${esc(product.category)}</div>
            <h2>${esc(product.name)}</h2>
          </div>
          ${badge(product.status)}
        </div>
        <p>${esc(product.subtitle)}</p>
        <div class="tag-row">${(product.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
        <div class="summary-grid">
          <div><span>${t("owner")}</span><strong>${esc(product.owner)}</strong></div>
          <div><span>${t("vendor")}</span><strong>${esc(product.vendor)}</strong></div>
          <div><span>${t("launchDate")}</span><strong>${date(product.launch_date)}</strong></div>
          <div><span>${t("lifecycle")}</span><strong>${enumLabel(product.lifecycle, "lifecycle")}</strong></div>
        </div>
      </div>
    </section>
    <section class="detail-grid">
      <article class="panel">
        <h2>${t("price")}</h2>
        <div class="data-grid">
          <div><span>${t("currentPrice")}</span><strong>${money2(product.pricing?.current_price, currency)}</strong></div>
          <div><span>${t("targetPrice")}</span><strong>${money2(product.pricing?.target_price, currency)}</strong></div>
          <div><span>${t("landedCost")}</span><strong>${money2(product.pricing?.landed_cost, currency)}</strong></div>
          <div><span>${t("grossMargin")}</span><strong>${pct(product.pricing?.gross_margin_pct)}</strong></div>
        </div>
      </article>
      <article class="panel">
        <h2>${t("inventory")}</h2>
        <div class="data-grid">
          <div><span>${t("onHand")}</span><strong>${Number(inv?.on_hand || 0).toLocaleString()}</strong></div>
          <div><span>${t("inbound")}</span><strong>${Number(inv?.inbound || 0).toLocaleString()}</strong></div>
          <div><span>${t("daysCover")}</span><strong>${esc(inv?.days_cover || 0)}</strong></div>
          <div><span>${t("status")}</span><strong>${enumLabel(inv?.status)}</strong></div>
        </div>
      </article>
      <article class="panel">
        <h2>${t("content")}</h2>
        <div class="data-grid">
          <div><span>Images</span><strong>${product.content?.hero_images_ready}/${product.content?.hero_images_required}</strong></div>
          <div><span>Video</span><strong>${product.content?.video_ready ? t("ready") : t("needsReview")}</strong></div>
          <div><span>Copy</span><strong>${enumLabel(product.content?.copy_status)}</strong></div>
          <div><span>Source</span><strong>${esc(product.content?.listing_source)}</strong></div>
        </div>
      </article>
      <article class="panel">
        <h2>${t("compliance")}</h2>
        <div class="score-row">
          <strong>${product.compliance?.score}</strong>
          ${badge(product.compliance?.status)}
        </div>
        <ul class="clean-list">${(product.compliance?.notes || []).map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
      </article>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>${t("channels")}</h2><a href="#/channels">${t("channels")}</a></div>
      ${channelTable(channelRows, { showProduct: false })}
    </section>
    ${
      reviewRows.length
        ? `<section class="panel"><div class="panel-head"><h2>${t("reviewQueue")}</h2><a href="#/review">${t("review")}</a></div>${reviewRows
            .map((item) => reviewRow(item))
            .join("")}</section>`
        : ""
    }`;
}

function channelTable(rows, { showProduct = true } = {}) {
  return `<div class="table-wrap"><table>
    <thead><tr>${showProduct ? `<th>${t("product")}</th>` : ""}<th>${t("platform")}</th><th>${t("status")}</th><th>${t("price")}</th><th>Score</th><th>${t("channelIssue")}</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (item) => `<tr>
            ${showProduct ? `<td><a href="#/products/${encodeURIComponent(item.product_id)}">${esc(productById(item.product_id)?.name || item.product_id)}</a></td>` : ""}
            <td>${enumLabel(item.platform, "platform")}<div class="muted">${esc(item.listing_id)}</div></td>
            <td>${badge(item.status)}</td>
            <td>${money2(item.price, state.snapshot?.seller?.base_currency || "USD")}</td>
            <td><div class="score-bar"><span style="width:${Math.min(100, Number(item.content_score || 0))}%"></span></div>${item.content_score}</td>
            <td>${esc(item.issue || "OK")}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table></div>`;
}

function renderInventory() {
  setPage(t("inventory"), `${state.snapshot?.metrics?.low_stock_count || 0} ${t("stockRisk")}`);
  els.content.innerHTML = `<section class="panel">
    <div class="panel-head"><h2>${t("inventory")}</h2><span class="muted">${t("warehouses")}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>${t("product")}</th><th>${t("warehouses")}</th><th>${t("onHand")}</th><th>Available</th><th>${t("inbound")}</th><th>${t("daysCover")}</th><th>${t("status")}</th></tr></thead>
      <tbody>
        ${inventory()
          .map((item) => {
            const product = productById(item.product_id);
            return `<tr>
              <td>
                <a class="table-product" href="#/products/${encodeURIComponent(item.product_id)}">
                  <img src="${esc(product?.image || "")}" alt="">
                  <span><strong>${esc(product?.name || item.product_id)}</strong><em>${esc(product?.sku || "")}</em></span>
                </a>
              </td>
              <td>${esc(item.warehouse_name)}</td>
              <td>${Number(item.on_hand || 0).toLocaleString()}</td>
              <td>${Number(item.available || 0).toLocaleString()}</td>
              <td>${Number(item.inbound || 0).toLocaleString()}<div class="muted">${item.inbound_eta ? date(item.inbound_eta) : ""}</div></td>
              <td>${esc(item.days_cover)}</td>
              <td>${badge(item.status)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>
  </section>`;
}

function renderChannels() {
  setPage(t("channels"), `${state.snapshot?.metrics?.channel_issue_count || 0} ${t("channelIssues")}`);
  els.content.innerHTML = `<section class="panel">
    <div class="panel-head"><h2>${t("channels")}</h2><span class="muted">${t("sync")}</span></div>
    ${channelTable(channels())}
  </section>`;
}

function reviewRow(item) {
  const product = productById(item.product_id);
  return `<article class="review-item">
    <a class="review-image" href="#/products/${encodeURIComponent(item.product_id)}"><img src="${esc(product?.image || "")}" alt=""></a>
    <div>
      <div class="review-top">
        <span>Review #${esc(item.ref)}</span>
        ${badge(item.risk, "risk")}
        ${badge(item.type, "type")}
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.summary)}</p>
      <ul>${(item.evidence || []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      <div class="review-actions">
        <button data-action="approve" data-item="${esc(item.item_id)}">${t("approve")}</button>
        <button class="secondary" data-action="request_changes" data-item="${esc(item.item_id)}">${t("requestChanges")}</button>
        <button class="danger" data-action="block" data-item="${esc(item.item_id)}">${t("block")}</button>
      </div>
    </div>
  </article>`;
}

function renderReview() {
  setPage(t("reviewQueue"), `${reviewItems().length} ${t("needsReview")}`);
  els.content.innerHTML = `
    ${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}
    <div class="review-list">${reviewItems()
      .map((item) => reviewRow(item))
      .join("")}</div>`;
}

function renderSettings() {
  const summary = state.settings?.config_summary || {};
  setPage(t("settings"), t("localFilesOnly"));
  els.content.innerHTML = `<section class="panel settings-panel">
    <h2>${t("settings")}</h2>
    <div class="data-grid wide">
      <div><span>${t("dataProvider")}</span><strong>${esc(state.settings?.data_provider || "")}</strong></div>
      <div><span>${t("configPath")}</span><strong>${esc(summary.config_path || "demo")}</strong></div>
      <div><span>Brand</span><strong>${esc(summary.seller?.brand || state.snapshot?.seller?.brand || "")}</strong></div>
      <div><span>Currency</span><strong>${esc(summary.seller?.base_currency || "USD")}</strong></div>
    </div>
    <h2>${t("platform")}</h2>
    <div class="settings-list">
      ${(summary.platforms || [])
        .map(
          (platform) =>
            `<div><strong>${enumLabel(platform.platform, "platform")}</strong><span>${esc(platform.store_name)} · ${platform.secrets_ready ? "ready" : "missing env"}</span></div>`,
        )
        .join("")}
    </div>
    <h2>${t("warehouses")}</h2>
    <div class="settings-list">
      ${(summary.warehouses || []).map((warehouse) => `<div><strong>${esc(warehouse.name)}</strong><span>${esc(warehouse.region)}</span></div>`).join("")}
    </div>
    <h2>${t("onboarding")}</h2>
    <div class="data-grid wide">
      <div><span>${t("onboarding")}</span><strong>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</strong></div>
      ${state.settings?.onboarding?.completed_at ? `<div><span>${t("completed")}</span><strong>${esc(state.settings.onboarding.completed_at)}</strong></div>` : ""}
    </div>
  </section>`;
}

async function postDecision(action, itemId) {
  const comment = window.prompt(t("reviewNote"), "");
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  const res = await fetch(`/api/decision?${params}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, item_id: itemId, comment: comment || "" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    state.notice = data.error || `HTTP ${res.status}`;
  } else {
    state.notice = activeLang() === "zh" ? "决策已记录。" : "Decision recorded.";
  }
  render();
}

function render() {
  renderShell();
  if (!state.snapshot) {
    els.content.innerHTML = `<div class="empty">Loading...</div>`;
    return;
  }
  if (state.snapshot.warnings?.length && !products().length) {
    setPage(t("overview"), "");
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  if (state.route.view === "products" && state.route.id) renderProductDetail(state.route.id);
  else if (state.route.view === "products") renderProducts();
  else if (state.route.view === "inventory") renderInventory();
  else if (state.route.view === "channels") renderChannels();
  else if (state.route.view === "review") renderReview();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

function bindEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("resize", syncResponsiveShell);
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    if (state.route.view !== "products") location.hash = "#/products";
    else render();
  });
  els.refresh.addEventListener("click", loadState);
  els.mobileRefresh?.addEventListener("click", loadState);
  els.sidebarToggle?.addEventListener("click", toggleSidebar);
  els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
  els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
  els.language.addEventListener("change", () => {
    state.lang = normalizeLang(els.language.value);
    localStorage.setItem("kelly-products-language", state.lang);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
    loadState();
  });
  els.content.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action][data-item]");
    if (button) postDecision(button.dataset.action, button.dataset.item);
  });
}

syncResponsiveShell();
bindEvents();
loadState().catch((error) => {
  console.error(error);
  setPage("Error", "");
  els.content.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
});
