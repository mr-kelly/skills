import {
  badge,
  channels,
  channelsForProduct,
  date,
  detailUrl,
  els,
  enumLabel,
  esc,
  inventory,
  inventoryForProduct,
  money,
  money2,
  pagination,
  pct,
  productById,
  products,
  recordById,
  recordUrl,
  reviewForProduct,
  reviewItems,
  state,
  t,
} from "../app.js";

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not already show (the sidebar's "need
// attention" block already surfaces review/low-stock/channel-issue counts).
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const currency = state.snapshot?.seller?.base_currency || "USD";
  return [
    [t("avgMargin"), pct(metrics.avg_margin_pct)],
    [t("inventoryValue"), money(metrics.inventory_value, currency)],
    [t("activeProducts"), String(metrics.active_count || 0)],
  ]
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function productImage(product) {
  return `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">`;
}

function productCard(product) {
  const inv = product.inventory || {};
  return `<article class="product-card">
    <a class="product-card-image" href="${recordUrl(product.product_id, "products")}">${productImage(product)}</a>
    <div class="product-card-body">
      <div class="product-card-head">
        <div>
          <a class="product-title" href="${recordUrl(product.product_id, "products")}">${esc(product.name)}</a>
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

function reviewPreviewRow(item) {
  const product = productById(item.product_id);
  return `<a class="review-item" href="${recordUrl(item.item_id, "review")}">
    <div class="review-image">${product?.image ? `<img src="${esc(product.image)}" alt="">` : ""}</div>
    <div>
      <div class="review-top">
        <span>#${esc(item.ref)}</span>
        ${badge(item.risk, "risk")}
        ${badge(item.type, "type")}
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.summary)}</p>
    </div>
  </a>`;
}

export function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  document.getElementById("overviewTitle").textContent = t("overview");
  document.getElementById("overviewSummary").textContent = state.settings?.demo
    ? t("demoNote")
    : [
        `${pagination.total("products", metrics.product_count || 0)} ${t("products").toLowerCase()}`,
        `${t("generated")} ${date(state.snapshot?.generated_at)}`,
      ].join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const review = reviewItems().slice(0, 3);
  document.getElementById("overviewBody").innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel overview-wide">
        <h2>${t("products")}</h2>
        <div class="product-grid compact">
          ${products()
            .slice(0, 4)
            .map((product) => productCard(product))
            .join("") || `<div class="empty-inline">${t("empty")}</div>`}
        </div>
      </div>
      <div class="card overview-panel">
        <h2>${t("reviewQueue")}</h2>
        <div class="review-list compact-list">
          ${review.map((item) => reviewPreviewRow(item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
        </div>
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("activity")}</h2>
        <div class="timeline">
          ${(state.snapshot?.activity_log || [])
            .map(
              (item) => `<div class="timeline-item">
                <span>${date(item.at)}</span>
                <strong>${esc(item.actor)}</strong>
                <p>${esc(item.text)}</p>
              </div>`,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`}
        </div>
      </div>
    </section>`;
}

// ── Products: one toolbar row over a full-bleed table; detail mode "page" ──
function productsTable(items) {
  return `<table class="ws-table">
    <thead><tr>
      <th>${t("product")}</th>
      <th>${t("lifecycle")}</th>
      <th>${t("owner")}</th>
      <th class="ws-col-num">${t("grossMargin")}</th>
      <th class="ws-col-num">${t("daysCover")}</th>
      <th>${t("status")}</th>
    </tr></thead>
    <tbody>
      ${items
        .map((product) => {
          const inv = product.inventory || {};
          const selected = product.product_id === state.route.selectedId ? ' class="ws-selected"' : "";
          return `<tr data-id="${esc(product.product_id)}"${selected}>
            <td title="${esc(product.name)}">
              <span class="table-product">
                <img src="${esc(product.image || "")}" alt="">
                <span><strong>${esc(product.name)}</strong><em>${esc(product.sku)} · ${esc(product.category)}</em></span>
              </span>
            </td>
            <td>${enumLabel(product.lifecycle, "lifecycle")}</td>
            <td title="${esc(product.owner)}">${esc(product.owner)}</td>
            <td class="ws-col-num">${pct(product.pricing?.gross_margin_pct)}</td>
            <td class="ws-col-num">${esc(inv.days_cover ?? "")}</td>
            <td>${badge(product.status)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

export function renderProductsView() {
  const query = state.route.query.trim().toLowerCase();
  const all = products();
  const list = query
    ? all.filter((product) =>
        [product.name, product.sku, product.category, product.owner, product.vendor, ...(product.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : all;
  document.getElementById("productsCount").textContent = String(pagination.total("products", list.length));
  const empty = `<div class="empty-state"><strong>${esc(query ? t("noMatches") : t("empty"))}</strong></div>`;
  els.productsList.innerHTML = `${list.length ? productsTable(list) : empty}${query ? "" : pagination.control("products")}`;
  renderProductDetail();
}

function channelTable(rows, { showProduct = true } = {}) {
  return `<table class="ws-table">
    <thead><tr>
      ${showProduct ? `<th>${t("product")}</th>` : ""}
      <th>${t("platform")}</th>
      <th>${t("status")}</th>
      <th class="ws-col-num">${t("price")}</th>
      <th class="ws-col-num">Score</th>
      <th>${t("channelIssue")}</th>
    </tr></thead>
    <tbody>
      ${rows
        .map(
          (item) => `<tr>
            ${showProduct ? `<td><a href="${recordUrl(item.product_id, "products")}">${esc(productById(item.product_id)?.name || item.product_id)}</a></td>` : ""}
            <td>${enumLabel(item.platform, "platform")}</td>
            <td>${badge(item.status)}</td>
            <td class="ws-col-num">${money2(item.price, state.snapshot?.seller?.base_currency || "USD")}</td>
            <td class="ws-col-num">${item.content_score}</td>
            <td title="${esc(item.issue || "")}">${esc(item.issue || "OK")}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderProductDetail() {
  const { id } = state.route;
  if (!id) {
    els.productsDetail.querySelector(".ws-detail-bar").hidden = true;
    els.productsDetailBody.innerHTML = "";
    return;
  }
  els.productsDetail.querySelector(".ws-detail-bar").hidden = false;
  const product = recordById("products", id);
  if (!product) {
    const pending = state.extra.products.has(id) && state.extra.products.get(id) === undefined;
    els.productsDetailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : `<div class="empty-state"><strong>${esc(t("recordMissing"))}</strong><p>${esc(t("recordMissingDetail"))}</p></div>`;
    return;
  }
  const inv = inventoryForProduct(product.product_id);
  const channelRows = channelsForProduct(product.product_id);
  const reviewRows = reviewForProduct(product.product_id);
  const currency = state.snapshot?.seller?.base_currency || "USD";
  els.productsDetailBody.innerHTML = `
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
      ${channelRows.length ? channelTable(channelRows, { showProduct: false }) : `<div class="empty-inline">${t("empty")}</div>`}
    </section>
    ${
      reviewRows.length
        ? `<section class="panel"><div class="panel-head"><h2>${t("reviewQueue")}</h2><a href="#/review">${t("review")}</a></div><div class="review-list">${reviewRows
            .map((item) => reviewPreviewRow(item))
            .join("")}</div></section>`
        : ""
    }`;
}

// ── Inventory / Channels: rollup tables, no record of their own ────────────
export function renderInventoryView() {
  const list = inventory();
  document.getElementById("inventoryCount").textContent = String(pagination.total("inventory", list.length));
  const rows = list
    .map((item) => {
      const product = productById(item.product_id);
      return `<tr>
        <td title="${esc(product?.name || item.product_id)}">
          <a class="table-product" href="${recordUrl(item.product_id, "products")}">
            <img src="${esc(product?.image || "")}" alt="">
            <span><strong>${esc(product?.name || item.product_id)}</strong><em>${esc(product?.sku || "")}</em></span>
          </a>
        </td>
        <td>${esc(item.warehouse_name)}</td>
        <td class="ws-col-num">${Number(item.on_hand || 0).toLocaleString()}</td>
        <td class="ws-col-num">${Number(item.available || 0).toLocaleString()}</td>
        <td class="ws-col-num">${Number(item.inbound || 0).toLocaleString()}</td>
        <td class="ws-col-narrow">${esc(item.days_cover)}</td>
        <td>${badge(item.status)}</td>
      </tr>`;
    })
    .join("");
  const table = `<table class="ws-table">
    <thead><tr>
      <th>${t("product")}</th>
      <th>${t("warehouses")}</th>
      <th class="ws-col-num">${t("onHand")}</th>
      <th class="ws-col-num">Available</th>
      <th class="ws-col-num">${t("inbound")}</th>
      <th class="ws-col-narrow">${t("daysCover")}</th>
      <th>${t("status")}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  els.inventoryList.innerHTML = `${list.length ? table : `<div class="empty-state"><strong>${esc(t("empty"))}</strong></div>`}${pagination.control("inventory")}`;
}

export function renderChannelsView() {
  const list = channels();
  document.getElementById("channelsCount").textContent = String(pagination.total("channels", list.length));
  els.channelsList.innerHTML = `${list.length ? channelTable(list) : `<div class="empty-state"><strong>${esc(t("empty"))}</strong></div>`}${pagination.control("channels")}`;
}

// ── Review: detail mode "split" ─────────────────────────────────────────────
// Two columns only -- in the narrow split queue (base-ui.css forces the list
// to --ws-split-list, ~300-380px) anything past a title + a status badge has
// no room to breathe; risk/type/evidence live in the detail pane instead.
function reviewTable(items) {
  return `<table class="ws-table">
    <thead><tr>
      <th>${t("title")}</th>
      <th>${t("status")}</th>
    </tr></thead>
    <tbody>
      ${items
        .map((item) => {
          const selected = item.item_id === state.route.selectedId ? ' class="ws-selected"' : "";
          return `<tr data-id="${esc(item.item_id)}"${selected}>
            <td title="${esc(item.title)}"><span class="strong">${esc(item.title)}</span></td>
            <td>${badge(item.status)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

export function renderReviewView() {
  const list = reviewItems();
  document.getElementById("reviewViewCount").textContent = String(pagination.total("review", list.length));
  const empty = `<div class="empty-state"><strong>${esc(t("empty"))}</strong></div>`;
  els.reviewList.innerHTML = `${list.length ? reviewTable(list) : empty}${pagination.control("review")}`;
  renderReviewDetail();
}

function renderReviewDetail() {
  const { selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 760px)").matches;
  els.reviewDetailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.reviewDetailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.reviewDetailExpand.href = detailUrl(selectedId, "review");
  els.reviewDetail.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.reviewDetailBody.innerHTML = `<div class="ws-detail-empty">${esc(t("selectReviewItem"))}</div>`;
    return;
  }
  const item = recordById("review", selectedId);
  if (!item) {
    const pending = state.extra.review.has(selectedId) && state.extra.review.get(selectedId) === undefined;
    els.reviewDetailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : `<div class="empty-state"><strong>${esc(t("recordMissing"))}</strong><p>${esc(t("recordMissingDetail"))}</p></div>`;
    return;
  }
  const product = productById(item.product_id);
  const actions =
    item.status === "needs_review"
      ? `<div class="review-actions">
        <button data-action="approve" data-item="${esc(item.item_id)}" ${state.busy ? "disabled" : ""}>${t("approve")}</button>
        <button class="secondary" data-action="request_changes" data-item="${esc(item.item_id)}" ${state.busy ? "disabled" : ""}>${t("requestChanges")}</button>
        <button class="danger" data-action="block" data-item="${esc(item.item_id)}" ${state.busy ? "disabled" : ""}>${t("block")}</button>
      </div>`
      : `<div class="review-actions">
        ${badge(item.status)}
        ${item.decision_note ? `<span class="muted">${esc(item.decision_note)}</span>` : ""}
      </div>`;
  els.reviewDetailBody.innerHTML = `
    ${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}
    <header class="detail-head">
      <h2>${esc(item.title)}</h2>
      <p class="muted">#${esc(item.ref)} · ${esc(product?.name || item.product_id)}</p>
    </header>
    <div class="review-top">
      ${badge(item.risk, "risk")}
      ${badge(item.type, "type")}
      ${badge(item.status)}
    </div>
    <p>${esc(item.summary)}</p>
    <ul class="clean-list">${(item.evidence || []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    ${actions}`;
}

// ── Help & Settings ──────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  document.getElementById("settingsBody").innerHTML = `<section class="panel settings-panel">
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
            `<div><strong>${enumLabel(platform.platform, "platform")}</strong><span>${esc(platform.store_name)}</span></div>`,
        )
        .join("") || `<div class="empty-inline">${t("empty")}</div>`}
    </div>
    <h2>${t("warehouses")}</h2>
    <div class="settings-list">
      ${(summary.warehouses || []).map((warehouse) => `<div><strong>${esc(warehouse.name)}</strong><span>${esc(warehouse.region)}</span></div>`).join("") || `<div class="empty-inline">${t("empty")}</div>`}
    </div>
    <h2>${t("onboarding")}</h2>
    <div class="data-grid wide">
      <div><span>${t("onboarding")}</span><strong>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</strong></div>
      ${state.settings?.onboarding?.completed_at ? `<div><span>${t("completed")}</span><strong>${esc(state.settings.onboarding.completed_at)}</strong></div>` : ""}
    </div>
  </section>`;
}
