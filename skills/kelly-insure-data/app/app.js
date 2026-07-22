import { messages } from "./i18n/messages.js";

const state = {
  route: parseRoute(),
  snapshot: null,
  settings: null,
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-insure-data-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-insure-data.sidebarCollapsed";

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
  qualityScore: document.querySelector("#quality-score"),
  fileCount: document.querySelector("#count-files"),
  qaCount: document.querySelector("#count-qa"),
  newsCount: document.querySelector("#count-news"),
  feedbackCount: document.querySelector("#count-feedback"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
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

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
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
    setMobileDetailOpen(Boolean(state.route.id));
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
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

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  if (isMobileLayout()) setMobileSidebarOpen(false);
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  state.settings = await res.json();
  state.snapshot = state.settings.snapshot;
  render();
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

function metrics() {
  return state.snapshot?.metrics || {};
}

function allItems() {
  return [
    ...(state.snapshot?.files || []),
    ...(state.snapshot?.qa_pairs || []),
    ...(state.snapshot?.news_items || []),
    ...(state.snapshot?.feedback_items || []),
  ];
}

function qualityScore() {
  const score = metrics().data_quality_score;
  if (Number.isFinite(Number(score))) return Number(score);
  const items = allItems();
  if (!items.length) return 0;
  return Math.round(
    items.reduce((sum, item) => sum + Number(item.governance?.completeness_pct || 0), 0) / items.length,
  );
}

function viewLabel(view = state.route.view) {
  if (view === "files") return t("files");
  if (view === "qa") return t("qa");
  if (view === "news") return t("news");
  if (view === "feedback") return t("feedback");
  if (view === "settings") return t("settings");
  return t("overview");
}

function viewSubtitle(view = state.route.view) {
  if (view === "files") return t("filesSubtitle");
  if (view === "qa") return t("qaSubtitle");
  if (view === "news") return t("newsSubtitle");
  if (view === "feedback") return t("feedbackSubtitle");
  if (view === "settings") return t("settingsSubtitle");
  return t("overviewSubtitle");
}

function renderShell() {
  applyI18n();
  const m = metrics();
  const score = qualityScore();
  els.syncStatus.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  els.qualityScore.textContent = score;
  els.fileCount.textContent = m.file_count || 0;
  els.qaCount.textContent = m.qa_count || 0;
  els.newsCount.textContent = m.news_count || 0;
  els.feedbackCount.textContent = m.feedback_count || 0;
  els.mobileViewTitle.textContent = viewLabel();
  els.mobileViewMeta.textContent = `${score} ${t("qualityScore")} · ${m.needs_governance || 0} ${t("needsGovernance")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function setPage(view = state.route.view) {
  els.title.textContent = viewLabel(view);
  els.subtitle.textContent = viewSubtitle(view);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function tagsMarkup(tags = []) {
  return tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
}

function completeness(item) {
  const value = Number(item.governance?.completeness_pct ?? 100);
  const tone = value >= 90 ? "good" : value >= 65 ? "warn" : "bad";
  return `<span class="quality-pill ${tone}">${value}%</span>`;
}

function missingMarkup(item) {
  const missing = item.governance?.missing_fields || [];
  if (!missing.length) return `<span class="muted">${t("complete")}</span>`;
  return missing.map((field) => `<span class="missing-chip">${escapeHtml(field)}</span>`).join("");
}

function matchesQuery(item, fields) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) =>
    String(item[field] || "")
      .toLowerCase()
      .includes(q),
  );
}

function metricCard(label, value, detail = "") {
  return `<div class="metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-detail">${escapeHtml(detail)}</div></div>`;
}

function renderOverview() {
  setPage("overview");
  const m = metrics();
  const warnings = state.snapshot?.warnings || [];
  const governed = allItems()
    .filter((item) => Number(item.governance?.completeness_pct || 0) < 100)
    .slice(0, 8);
  els.content.className = "content overview-content";
  els.content.innerHTML = `
    <section class="overview-grid">
      ${metricCard(t("qualityScore"), `${qualityScore()}`, `${m.needs_governance || 0} ${t("needsGovernance")}`)}
      ${metricCard(t("files"), m.file_count || 0, `${m.metadata_field_count || 0} ${t("metadataFields")}`)}
      ${metricCard(t("qa"), m.qa_count || 0, "Base")}
      ${metricCard(t("news"), m.news_count || 0, `${m.featured_count || 0} ${t("featured")} · ${m.notice_count || 0} ${t("notices")}`)}
      ${metricCard(t("feedback"), m.feedback_count || 0, "Base")}
      ${metricCard(t("totalRecords"), m.total_records || 0, state.settings?.data_provider || "")}
    </section>
    <section class="governance-section">
      <div class="section-heading">
        <h2>${escapeHtml(t("needsGovernance"))}</h2>
        <span>${escapeHtml(t("missingFields"))}</span>
      </div>
      <div class="governance-list">
        ${
          governed.length
            ? governed
                .map(
                  (item) => `
                    <article class="governance-row">
                      <div>
                        <strong>${escapeHtml(item.name || item.question || item.title)}</strong>
                        <p>${escapeHtml(item.path || item.category || item.source || "")}</p>
                      </div>
                      <div>${completeness(item)}</div>
                      <div class="missing-list">${missingMarkup(item)}</div>
                    </article>
                  `,
                )
                .join("")
            : `<div class="empty-state">${escapeHtml(t("complete"))}</div>`
        }
      </div>
    </section>
    ${
      warnings.length
        ? `<section class="warnings"><h2>${escapeHtml(t("warnings"))}</h2>${warnings
            .map((warning) => `<p>${escapeHtml(warning.message)}</p>`)
            .join("")}</section>`
        : ""
    }
  `;
}

function rowRef(index) {
  return `#${index + 1}`;
}

function renderListDetail({ view, items, idKey, titleKey, subtitleKey, meta, detail }) {
  setPage(view);
  const filtered = items.filter((item) => matchesQuery(item, [titleKey, subtitleKey, "category", "source", "path"]));
  const selected =
    filtered.find((item) => String(item[idKey]) === state.route.id) || (!isMobileLayout() ? filtered[0] : null);
  if (selected && !state.route.id && filtered.length && !isMobileLayout()) {
    history.replaceState(null, "", `#/${view}/${encodeURIComponent(selected[idKey])}`);
    state.route = parseRoute();
  }
  setMobileDetailOpen(isMobileLayout() && Boolean(state.route.id));
  els.content.className = "content split-content";
  els.content.innerHTML = `
    <div class="list-panel">
      <div class="list-header">
        <strong>${escapeHtml(viewLabel(view))}</strong>
        <span>${filtered.length}</span>
      </div>
      <div class="item-list">
        ${
          filtered.length
            ? filtered
                .map((item, index) => {
                  const active = selected && item[idKey] === selected[idKey] ? "active" : "";
                  return `
                    <a class="item-row ${active}" href="#/${view}/${encodeURIComponent(item[idKey])}">
                      <span class="row-ref">${rowRef(index)}</span>
                      <span class="row-main">
                        <strong>${escapeHtml(item[titleKey])}</strong>
                        <small>${escapeHtml(item[subtitleKey] || "")}</small>
                      </span>
                      ${completeness(item)}
                    </a>
                  `;
                })
                .join("")
            : `<div class="empty-state">${escapeHtml(t("noResults"))}</div>`
        }
      </div>
    </div>
    <aside class="detail-panel">
      ${
        selected
          ? `
            <button class="back-to-list" type="button" data-back>${escapeHtml(viewLabel(view))}</button>
            <div class="detail-scroll">
              <div class="detail-kicker">${escapeHtml(meta(selected))}</div>
              <h2>${escapeHtml(selected[titleKey])}</h2>
              <div class="detail-badges">
                ${completeness(selected)}
                ${tagsMarkup(selected.tags || [])}
              </div>
              ${detail(selected)}
            </div>
          `
          : `<div class="empty-state">${escapeHtml(t("noResults"))}</div>`
      }
    </aside>
  `;
  els.content.querySelector("[data-back]")?.addEventListener("click", () => {
    history.pushState(null, "", `#/${view}`);
    state.route = parseRoute();
    setMobileDetailOpen(false);
    render();
  });
}

function keyValueTable(obj = {}) {
  const entries = Object.entries(obj);
  if (!entries.length) return `<p class="muted">${escapeHtml(t("empty"))}</p>`;
  return `<dl class="kv-table">${entries
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</dd></div>`,
    )
    .join("")}</dl>`;
}

function fieldTable(fields = []) {
  if (!fields.length) return `<p class="muted">${escapeHtml(t("empty"))}</p>`;
  return `<dl class="kv-table">${fields
    .map((field) => `<div><dt>${escapeHtml(field.key)}</dt><dd>${escapeHtml(field.value)}</dd></div>`)
    .join("")}</dl>`;
}

function renderFiles() {
  renderListDetail({
    view: "files",
    items: state.snapshot?.files || [],
    idKey: "id",
    titleKey: "name",
    subtitleKey: "path",
    meta: (item) => `${formatBytes(item.size)} · ${formatDate(item.updated_at)}`,
    detail: (item) => `
      <section class="detail-section">
        <h3>${escapeHtml(t("fileMetadata"))}</h3>
        ${keyValueTable(item.metadata)}
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("missingFields"))}</h3>
        <div class="missing-list">${missingMarkup(item)}</div>
      </section>
    `,
  });
}

function renderQa() {
  renderListDetail({
    view: "qa",
    items: state.snapshot?.qa_pairs || [],
    idKey: "id",
    titleKey: "question",
    subtitleKey: "category",
    meta: (item) => `${item.source || t("source")} · ${formatDate(item.updated_at)}`,
    detail: (item) => `
      <section class="detail-section">
        <h3>${escapeHtml(t("answer"))}</h3>
        <p class="detail-body">${escapeHtml(item.answer)}</p>
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("missingFields"))}</h3>
        <div class="missing-list">${missingMarkup(item)}</div>
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("baseFields"))}</h3>
        ${keyValueTable(item.fields)}
      </section>
    `,
  });
}

function renderNews() {
  const items = (state.snapshot?.news_items || []).map((item) => ({
    ...item,
    collection_label: `${item.collection === "featured" ? t("featured") : t("notices")} · ${item.source || ""}`,
  }));
  renderListDetail({
    view: "news",
    items,
    idKey: "id",
    titleKey: "title",
    subtitleKey: "collection_label",
    meta: (item) =>
      `${item.collection === "featured" ? t("featured") : t("notices")} · ${item.category || t("category")} · ${formatDate(item.published_at)}`,
    detail: (item) => `
      <section class="detail-section">
        <h3>${escapeHtml(t("summary"))}</h3>
        <p class="detail-body">${escapeHtml(item.summary)}</p>
        ${item.url ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></p>` : ""}
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("missingFields"))}</h3>
        <div class="missing-list">${missingMarkup(item)}</div>
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("baseFields"))}</h3>
        ${keyValueTable(item.fields)}
      </section>
    `,
  });
}

function renderFeedback() {
  renderListDetail({
    view: "feedback",
    items: state.snapshot?.feedback_items || [],
    idKey: "id",
    titleKey: "title",
    subtitleKey: "source",
    meta: (item) => `${item.category || t("category")} · ${formatDate(item.created_at)}`,
    detail: (item) => `
      <section class="detail-section">
        <h3>${escapeHtml(t("feedbackContent"))}</h3>
        <p class="detail-body">${escapeHtml(item.content)}</p>
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("status"))}</h3>
        ${keyValueTable({
          status: item.status,
          user_name: item.user_name,
          contact: item.contact,
          rating: item.rating,
        })}
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("missingFields"))}</h3>
        <div class="missing-list">${missingMarkup(item)}</div>
      </section>
      <section class="detail-section">
        <h3>${escapeHtml(t("baseFields"))}</h3>
        ${keyValueTable(item.fields)}
      </section>
    `,
  });
}

function renderSettings() {
  setPage("settings");
  const summary = state.settings?.config_summary || {};
  els.content.className = "content settings-content";
  els.content.innerHTML = `
    <section class="settings-grid">
      <article class="settings-card">
        <h2>${escapeHtml(t("operator"))}</h2>
        ${keyValueTable(summary.operator || {})}
      </article>
      <article class="settings-card">
        <h2>${escapeHtml(t("busabaseTargets"))}</h2>
        ${keyValueTable({
          [t("dataProvider")]: state.settings?.data_provider || "",
          base_url: summary.busabase?.base_url || "",
          space_id: summary.busabase?.space_id || "",
          drive: `${summary.busabase?.drive_node_id || ""} · ${summary.busabase?.drive_node_slug || ""}`,
          featured: `${summary.busabase?.featured_base_id || ""} · ${summary.busabase?.featured_base_slug || ""}`,
          notices: `${summary.busabase?.notices_base_id || ""} · ${summary.busabase?.notices_base_slug || ""}`,
          qa: `${summary.busabase?.qa_base_id || ""} · ${summary.busabase?.qa_base_slug || ""}`,
          feedback: `${summary.busabase?.feedback_base_id || ""} · ${summary.busabase?.feedback_base_slug || ""}`,
          [t("recordLimit")]: summary.busabase?.record_limit || "",
          [t("apiKeyReady")]: summary.busabase?.api_key_ready ? "yes" : "no",
        })}
      </article>
      <article class="settings-card">
        <h2>${escapeHtml(t("driveMetadata"))}</h2>
        ${fieldTable(state.snapshot?.drive?.metadata_fields || [])}
      </article>
      <article class="settings-card">
        <h2>${escapeHtml(t("baseFields"))}</h2>
        <h3>${escapeHtml(t("featured"))}</h3>
        ${fieldTable(state.snapshot?.bases?.featured?.fields || [])}
        <h3>${escapeHtml(t("notices"))}</h3>
        ${fieldTable(state.snapshot?.bases?.notices?.fields || [])}
        <h3>${escapeHtml(t("qa"))}</h3>
        ${fieldTable(state.snapshot?.bases?.qa?.fields || [])}
        <h3>${escapeHtml(t("feedback"))}</h3>
        ${fieldTable(state.snapshot?.bases?.feedback?.fields || [])}
      </article>
    </section>
  `;
}

function render() {
  if (!state.snapshot) return;
  renderShell();
  if (state.route.view === "files") renderFiles();
  else if (state.route.view === "qa") renderQa();
  else if (state.route.view === "news") renderNews();
  else if (state.route.view === "feedback") renderFeedback();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

els.sidebarToggle.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-insure-data-language", state.lang);
  render();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
