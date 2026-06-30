import { MESSAGES, resolveLang } from "/i18n/messages.js";

let state = null;
let view = "overview";
let selectedId = null;
let query = "";
let episodeMode = "list";
let episodeTab = "summary";
let imageConfig = null;
let hyperframeStatus = null;
let hyperframeLoading = false;
let isApplyingRoute = false;
let routeNeedsReplace = false;
let lastAppliedHash = "";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-drama.sidebarCollapsed";
const LANG_STORAGE_KEY = "kdrama_lang";

let langPref = localStorage.getItem(LANG_STORAGE_KEY) || "auto";

function lang() { return resolveLang(langPref); }
function t(key) { const l = lang(); return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key; }

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => { node.title = t(node.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel)); });
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
  const langSel = document.getElementById("languageSelect");
  if (langSel) {
    langSel.value = langPref;
    langSel.querySelectorAll("[data-i18n]").forEach((opt) => { opt.textContent = t(opt.dataset.i18n); });
  }
}

const $ = (id) => document.getElementById(id);

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(selectedId) && view !== "overview");
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function viewMeta() {
  return {
    overview: [t("view_overview"), t("view_overview_sub")],
    characters: [t("view_characters"), t("view_characters_sub")],
    relationships: [t("view_relationships"), t("view_relationships_sub")],
    episodes: [t("view_episodes"), t("view_episodes_sub")],
    tasks: [t("view_tasks"), t("view_tasks_sub")],
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function lines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function statusBadge(status) {
  const label = {
    draft: t("status_draft"),
    needs_review: t("status_needs_review"),
    changes_requested: t("status_changes_requested"),
    approved: t("status_approved"),
    done: t("status_done"),
    blocked: t("status_blocked"),
  }[status] || status || t("status_draft");
  return `<span class="badge status-${escapeHtml(status || "draft")}">${escapeHtml(label)}</span>`;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

async function api(path, body = null) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function load() {
  state = await api("/api/state");
  imageConfig = await api("/api/image-config").catch(() => null);
  applyRouteFromHash({ replaceEmpty: true });
}

function project() {
  return state?.project || {};
}

function encodeRoutePart(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function routeFor(next = {}) {
  const nextView = next.view || view || "overview";
  const nextSelectedId = next.selectedId ?? selectedId;
  const nextEpisodeMode = next.episodeMode || episodeMode;
  const nextEpisodeTab = next.episodeTab || episodeTab || "summary";
  if (nextView === "overview") return "/overview";
  if (nextView === "episodes") {
    if (nextEpisodeMode === "detail" && nextSelectedId) {
      return `/episodes/${encodeRoutePart(nextSelectedId)}/${nextEpisodeTab === "shots" ? "shots" : "summary"}`;
    }
    return "/episodes";
  }
  return nextSelectedId ? `/${nextView}/${encodeRoutePart(nextSelectedId)}` : `/${nextView}`;
}

function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  const meta = viewMeta();
  const routeView = meta[parts[0]] ? parts[0] : "overview";
  if (routeView === "episodes") {
    const routeSelectedId = parts[1] || null;
    return {
      view: "episodes",
      selectedId: routeSelectedId,
      episodeMode: routeSelectedId ? "detail" : "list",
      episodeTab: parts[2] === "shots" ? "shots" : "summary",
    };
  }
  return {
    view: routeView,
    selectedId: parts[1] || null,
    episodeMode: "list",
    episodeTab: "summary",
  };
}

function applyRoute(route) {
  view = route.view;
  selectedId = route.selectedId;
  episodeMode = route.episodeMode;
  episodeTab = route.episodeTab;
}

function applyRouteFromHash({ replaceEmpty = false } = {}) {
  const route = parseHashRoute();
  isApplyingRoute = true;
  routeNeedsReplace = false;
  applyRoute(route);
  if (replaceEmpty && !window.location.hash) {
    history.replaceState(null, "", `#${routeFor(route)}`);
  }
  render();
  if (routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    routeNeedsReplace = false;
  }
  lastAppliedHash = window.location.hash || `#${routeFor()}`;
  isApplyingRoute = false;
}

function navigateTo(partial = {}, { replace = false } = {}) {
  const next = {
    view,
    selectedId,
    episodeMode,
    episodeTab,
    ...partial,
  };
  if (partial.view && partial.view !== "episodes") {
    next.episodeMode = "list";
    next.episodeTab = "summary";
  }
  if (partial.view && partial.view !== view) {
    next.selectedId = partial.selectedId ?? null;
  }
  const target = `#${routeFor(next)}`;
  if (window.location.hash === target) {
    applyRoute(next);
    render();
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    applyRouteFromHash();
  } else {
    window.location.hash = target;
  }
}

function syncRoute({ replace = true } = {}) {
  if (isApplyingRoute) {
    routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (replace) history.replaceState(null, "", target);
  else window.location.hash = target;
}

function collectionFor(currentView = view) {
  const p = project();
  if (currentView === "characters") return p.characters || [];
  if (currentView === "relationships") return p.relationships || [];
  if (currentView === "episodes") return p.episodes || [];
  if (currentView === "shots") return p.shots || [];
  if (currentView === "tasks") return p.tasks || [];
  return [];
}

function matches(item) {
  if (!query) return true;
  return JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
}

function selectedItem() {
  return collectionFor().find((item) => String(item.id) === String(selectedId)) || collectionFor()[0] || null;
}

function characterName(id) {
  return (project().characters || []).find((character) => character.id === id)?.name || id || "";
}

function episodeTitle(id) {
  return (project().episodes || []).find((episode) => episode.id === id)?.title || id || "";
}

function updateChrome() {
  const p = project();
  document.body.classList.toggle("episodes-list-mode", view === "episodes" && episodeMode === "list");
  document.body.classList.toggle("episode-focus-mode", view === "episodes" && episodeMode === "detail");
  renderProjectSwitcher();
  $("projectTitle").textContent = p.series?.title || t("project_unnamed");
  $("projectMeta").textContent = `${p.series?.genre || t("project_meta_genre_placeholder")} · ${p.series?.format || t("project_meta_format_placeholder")}`;
  $("projectPath").textContent = state.paths?.project_path || "";
  $("attentionNeeds").textContent = state.attention?.needs_review || 0;
  $("attentionShots").textContent = state.completeness?.shots_missing_prompt || 0;
  $("attentionViews").textContent = state.completeness?.characters_missing_views || 0;
  $("lockBanner").classList.toggle("hidden", !state.lock?.locked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const meta = viewMeta();
  const [title, subtitle] = meta[view] || ["", ""];
  $("viewTitle").textContent = title;
  $("viewSubtitle").textContent = subtitle;
  applyI18n();
}

function renderProjectSwitcher() {
  const select = $("projectSelect");
  const projects = state.projects?.length ? state.projects : [{
    id: state.project?.project_id,
    title: state.project?.series?.title,
    genre: state.project?.series?.genre,
    format: state.project?.series?.format,
  }];
  const currentId = state.active_project_id || state.project?.project_id || projects[0]?.id || "";
  select.innerHTML = projects.map((item) => {
    const selected = item.id === currentId ? "selected" : "";
    return `<option value="${escapeHtml(item.id || item.title)}" ${selected}>${escapeHtml(item.title || t("project_unnamed"))}</option>`;
  }).join("");
  const current = projects.find((item) => item.id === currentId) || projects[0] || {};
  $("projectSwitchMeta").innerHTML = `
    <span>${escapeHtml(current.genre || state.project?.series?.genre || "")}</span>
    <span>${escapeHtml(current.format || state.project?.series?.format || "")}</span>
  `;
}

function render() {
  if (!state) return;
  updateChrome();
  if (view === "overview") renderOverview();
  else if (view === "episodes") renderEpisodesWorkspace();
  else renderListAndDetail();
}

function renderOverview() {
  const p = project();
  $("itemCount").textContent = t("overview_label");
  $("newItemButton").style.visibility = "hidden";
  const list = $("list");
  list.innerHTML = `
    <div class="metrics">
      <div class="metric"><strong>${p.characters?.length || 0}</strong><span>${t("overview_metric_characters")}</span></div>
      <div class="metric"><strong>${p.relationships?.length || 0}</strong><span>${t("overview_metric_relationships")}</span></div>
      <div class="metric"><strong>${p.episodes?.length || 0}</strong><span>${t("overview_metric_episodes")}</span></div>
      <div class="metric"><strong>${p.shots?.length || 0}</strong><span>${t("overview_metric_shots")}</span></div>
    </div>
    <div class="section-label">${t("overview_next_steps")}</div>
    ${overviewCard(t("overview_card_char_consistency"), t("overview_card_char_consistency_body").replace("{n}", state.completeness.characters_missing_views), "characters", t("view_characters"))}
    ${overviewCard(t("overview_card_plot"), t("overview_card_plot_body").replace("{n}", state.completeness.episodes_missing_cliffhanger), "episodes", t("view_episodes"))}
    ${overviewCard(t("overview_card_storyboard"), t("overview_card_storyboard_body").replace("{n}", state.completeness.shots_missing_prompt), "episodes", t("stat_shots"))}
    ${overviewCard(t("overview_card_relationship"), t("overview_card_relationship_body").replace("{n}", state.completeness.relationships_missing_evidence), "relationships", t("view_relationships"))}
    ${hyperframeOverview(p)}
    ${visualBiblePreview(p.series?.visual_bible || {})}
  `;
  $("detail").innerHTML = seriesForm(p.series || {});
  bindForm();
}

function hyperframeOverview(p) {
  const series = p.series || {};
  const path = series.hyperframe_project_path || series.hyperframe_source?.project_path || "";
  const status = hyperframeStatus;
  const matches = status?.project_path && path && status.project_path === path;
  return `
    <section class="hyperframe-card">
      <div class="section-head">
        <div>
          <h3>HyperFrame</h3>
          <p class="muted">${escapeHtml(path || "No project path set")}</p>
        </div>
        <button type="button" class="mini-button" data-hyperframe-refresh ${hyperframeLoading ? "disabled" : ""}>${hyperframeLoading ? "Reading..." : "Read project"}</button>
      </div>
      ${!path ? `<div class="asset-placeholder">Set the HyperFrame project path in the project form.</div>` : ""}
      ${path && status && !matches ? `<p class="muted">Status was read for another path. Refresh to read this project.</p>` : ""}
      ${path && matches ? hyperframeStatusPanel(status) : ""}
    </section>`;
}

function hyperframeStatusPanel(status) {
  if (!status.ok) return `<p class="form-note">${escapeHtml(status.error || "Could not read HyperFrame project.")}</p>`;
  const compositions = status.compositions || [];
  const renders = status.renders || [];
  const audio = status.audio || [];
  const changelogs = status.changelogs || [];
  return `
    <div class="hyperframe-metrics">
      <div><strong>${status.counts?.compositions || 0}</strong><span>compositions</span></div>
      <div><strong>${status.counts?.scenes || 0}</strong><span>scenes</span></div>
      <div><strong>${status.counts?.renders || 0}</strong><span>renders</span></div>
      <div><strong>${status.counts?.audio || 0}</strong><span>audio</span></div>
    </div>
    <div class="hyperframe-list">
      <h4>Compositions</h4>
      ${compositions.map((item) => `
        <div class="hyperframe-row">
          <code>${escapeHtml(item.path)}</code>
          <span>${escapeHtml(item.scenes?.length || 0)} scenes</span>
          <span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds}s` : ""}</span>
        </div>`).join("") || `<p class="muted">No HTML compositions found.</p>`}
    </div>
    <div class="hyperframe-list compact">
      <h4>Renders</h4>
      ${renders.slice(0, 5).map((item) => `<div class="hyperframe-row"><code>${escapeHtml(item.path)}</code><span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds.toFixed(1)}s` : ""}</span><span>${formatBytes(item.size_bytes)}</span></div>`).join("") || `<p class="muted">No rendered videos found.</p>`}
    </div>
    <div class="hyperframe-list compact">
      <h4>Audio</h4>
      ${audio.slice(0, 8).map((item) => `<span class="hf-chip">${escapeHtml(item.path)}</span>`).join("") || `<p class="muted">No audio files found.</p>`}
    </div>
    ${changelogs.length ? `<div class="hyperframe-list compact"><h4>Latest changelog</h4><div class="hyperframe-row"><code>${escapeHtml(changelogs[0].path)}</code><span>${escapeHtml((changelogs[0].updated_at || "").slice(0, 10))}</span></div></div>` : ""}
  `;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function overviewCard(title, body, target, tag) {
  return `
    <button class="item-card overview-row" data-go="${target}">
      <span class="row-key">${escapeHtml(tag)}</span>
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body)}</small>
      </span>
      <span class="row-arrow">${t("overview_card_open")}</span>
    </button>`;
}

function visualBiblePreview(bible) {
  const assets = bible.background_reference_assets || [];
  return `
    <section class="visual-bible-card">
      <div>
        <h3>${t("visual_bible_title")}</h3>
        <p>${escapeHtml(bible.format_note || "")}</p>
        <p class="muted">${escapeHtml(bible.realism_target || "")}</p>
      </div>
      <div class="reference-grid">
        ${assets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.title || t("visual_bible_title"))}" /><figcaption>${escapeHtml(asset.title || t("visual_bible_title"))}</figcaption></figure>`).join("") || `<div class="asset-placeholder">${t("visual_bible_placeholder")}</div>`}
      </div>
    </section>`;
}

function renderListAndDetail() {
  $("newItemButton").style.visibility = "visible";
  const items = collectionFor().filter(matches);
  $("itemCount").textContent = String(items.length);
  if (!selectedId || !collectionFor().some((item) => item.id === selectedId)) {
    selectedId = items[0]?.id || null;
    syncRoute({ replace: true });
  }
  $("list").innerHTML = items.map(itemCard).join("") || `<div class="item-card"><h3>${t("empty_list")}</h3><p>${t("empty_list_hint")}</p></div>`;
  $("detail").innerHTML = detailForm(selectedItem());
  bindForm();
}

function renderEpisodesWorkspace() {
  $("newItemButton").style.visibility = "visible";
  const allEpisodes = collectionFor("episodes");
  const items = allEpisodes.filter(matches).sort((a, b) => (a.number || 0) - (b.number || 0));
  $("itemCount").textContent = String(items.length);
  if (episodeMode === "detail" && (!selectedId || !allEpisodes.some((item) => item.id === selectedId))) {
    selectedId = items[0]?.id || null;
    syncRoute({ replace: true });
  }
  const workspace = document.querySelector(".workspace");
  workspace?.classList.toggle("episode-detail-mode", episodeMode === "detail");
  workspace?.classList.toggle("episodes-list-layout", episodeMode === "list");
  if (episodeMode === "detail") {
    $("list").innerHTML = episodeDetail(selectedItem());
    $("detail").innerHTML = "";
  } else {
    $("list").innerHTML = episodeTable(items);
    $("detail").innerHTML = "";
  }
  bindForm();
}

function episodeTable(items) {
  if (!items.length) {
    return `<div class="item-card"><h3>${t("episode_empty")}</h3><p>${t("episode_empty_hint")}</p></div>`;
  }
  return `
    <div class="episode-table-wrap">
      <table class="episode-table">
        <thead>
          <tr>
            <th>${t("episode_table_ep")}</th>
            <th>${t("episode_table_title")}</th>
            <th>${t("episode_table_summary")}</th>
            <th>${t("episode_table_status")}</th>
            <th>${t("episode_table_shots")}</th>
            <th>${t("episode_table_actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((episode) => episodeRow(episode)).join("")}
        </tbody>
      </table>
    </div>`;
}

function episodeRow(episode) {
  const shots = shotsForEpisode(episode.id);
  const summary = episode.summary || episode.promise || "";
  return `
    <tr class="${episode.id === selectedId ? "active" : ""}" data-row-episode="${escapeHtml(episode.id)}">
      <td class="episode-no">${escapeHtml(String(episode.number || "").padStart(3, "0"))}</td>
      <td>
        <button class="episode-link" data-episode-detail="${escapeHtml(episode.id)}">${escapeHtml(episode.title || episode.id)}</button>
        <div class="table-sub">${escapeHtml(episode.source_chapter?.chapter_title || "")}</div>
      </td>
      <td>${escapeHtml(summary).slice(0, 86)}</td>
      <td>${statusBadge(episode.status)}</td>
      <td><span class="badge">${shots.length}</span></td>
      <td><button class="mini-button table-action" data-episode-detail="${escapeHtml(episode.id)}">${t("episode_view_detail")}</button></td>
    </tr>`;
}

function shotsForEpisode(episodeId) {
  return (project().shots || []).filter((shot) => shot.episode_id === episodeId);
}

function episodeDetail(item) {
  if (!item) return `<div class="detail-card"><h2>${t("episode_select_hint")}</h2><p class="muted">${t("episode_select_hint_sub")}</p></div>`;
  const shots = shotsForEpisode(item.id);
  return `
    <form class="detail-card episode-detail" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <button type="button" class="back-button" data-episode-list>${t("episode_back")}</button>
      <div class="detail-head">
        <div>
          <div class="eyebrow">${t("episode_detail_eyebrow")}</div>
          <h2>${escapeHtml(item.title || "New episode")}</h2>
          <p>${escapeHtml(item.source_chapter?.work || "")}${item.source_chapter?.work ? " · " : ""}${escapeHtml(item.source_chapter?.chapter_number || item.number || "")}${item.source_chapter?.chapter_number || item.number ? " · " : ""}${escapeHtml(item.runtime || "")}</p>
        </div>
        ${statusBadge(item.status)}
      </div>

      <div class="episode-tabs" role="tablist" aria-label="Episode detail">
        <button type="button" class="${episodeTab === "summary" ? "active" : ""}" data-episode-tab="summary">${t("episode_tab_summary")}</button>
        <button type="button" class="${episodeTab === "shots" ? "active" : ""}" data-episode-tab="shots">${t("episode_tab_shots")}</button>
      </div>

      ${episodeTab === "shots" ? episodeShotsTab(item, shots) : episodeSummaryTab(item)}
      ${episodeTab === "shots" ? `<div class="form-actions"><span class="muted">${t("episode_shots_note")}</span></div>` : formActions()}
    </form>`;
}

function episodeSummaryTab(item) {
  return `
    <section class="script-section">
      <h3>${t("script_section_episode_summary")}</h3>
      <div class="form-grid">
        ${input("id", "ID", item.id)}
        ${input("number", "Ep #", item.number || "", "number")}
        ${input("title", "Title", item.title)}
        ${statusSelect(item.status)}
        ${textarea("summary", "Summary", item.summary || item.promise)}
        ${textarea("promise", "Source anchor / episode promise", item.promise)}
        ${textarea("a_plot", "A-plot", item.a_plot, false)}
        ${textarea("b_plot", "B-plot", item.b_plot, false)}
        ${textarea("cliffhanger", "Cliffhanger", item.cliffhanger)}
        ${textarea("beats_json", "Beats JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
    </section>
    ${scriptPreview(item)}`;
}

const expandedShots = new Set();

function episodeShotsTab(item, shots) {
  return executionTimeline(item, shots);
}

function shotListRow(shot, index) {
  const expanded = expandedShots.has(shot.id);
  const r = shotReadiness(shot);
  const asset = shot.image_asset || "";
  const isImg = asset.startsWith("/generated/");
  const dur = shot.duration_preset || (shot.duration_seconds ? `${shot.duration_seconds}s` : "—");
  const pendingCount = r.missing.length + (r.pacingWarn ? 1 : 0);
  const readyDot = r.ready
    ? `<span class="row-ready ok" title="${t("shot_video_ready")}">●</span>`
    : `<span class="row-ready warn" title="${t("shot_pending").replace("{n}", pendingCount)}">●</span>`;
  const specs = [shot.shot_size, shot.camera_movement].filter(Boolean).join(" · ");
  return `
    <div class="shot-row-wrap ${expanded ? "open" : ""}">
      <button type="button" class="shot-row" data-shot-toggle="${escapeHtml(shot.id)}" aria-expanded="${expanded}">
        <span class="shot-row-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="shot-row-thumb">${isImg ? `<img src="${escapeHtml(asset)}" alt="" loading="lazy" />` : `<span class="thumb-empty">${t("shot_no_image")}</span>`}</span>
        <span class="shot-row-main">
          <strong>${readyDot}${escapeHtml(shot.title || shot.id)}</strong>
          <small>${escapeHtml(shot.composition || "")}</small>
        </span>
        <span class="shot-row-meta">
          <span class="badge">${escapeHtml(dur)}</span>
          ${specs ? `<span class="badge soft">${escapeHtml(specs)}</span>` : ""}
          ${statusBadge(shot.status)}
        </span>
        <span class="shot-row-caret">${expanded ? "▾" : "▸"}</span>
      </button>
      ${expanded ? `<div class="shot-row-detail">${shotPreview(shot)}</div>` : ""}
    </div>`;
}

function scriptPreview(item) {
  const beats = item.beats || [];
  return `
    <section class="script-section">
      <h3>${t("script_section_title")}</h3>
      <div class="beat-stack">
        ${beats.map((beat, index) => `
          <article class="beat-row">
            <div class="beat-index">${String(index + 1).padStart(2, "0")}</div>
            <div>
              <strong>${escapeHtml(beat.label || beat.id)}</strong>
              <p>${escapeHtml(beat.hook || "")}</p>
              <p class="muted">${escapeHtml(beat.conflict || "")}</p>
            </div>
          </article>
        `).join("") || `<p class="muted">${t("script_beats_empty")}</p>`}
      </div>
    </section>`;
}

function executionTimeline(item, shots) {
  const execution = item.execution || {};
  const allExpanded = shots.every((s) => expandedShots.has(s.id));
  return `
    <section class="script-section">
      <div class="section-head">
        <div>
          <h3>Storyboard</h3>
          <p class="muted">${t("exec_card_01_body")}</p>
        </div>
      </div>
      <div class="execution-grid">
        <div class="execution-card">
          <span>01</span>
          <strong>${t("exec_card_01_title")}</strong>
          <p>${escapeHtml(execution.shot_description || t("exec_card_01_body"))}</p>
        </div>
        <div class="execution-card">
          <span>02</span>
          <strong>${t("exec_card_02_title")}</strong>
          <p>${escapeHtml(execution.srt_status || t("exec_card_02_body"))}</p>
        </div>
        <div class="execution-card">
          <span>03</span>
          <strong>${t("exec_card_03_title")}</strong>
          <p>${escapeHtml(execution.image_status || t("exec_card_03_body"))}</p>
        </div>
        <div class="execution-card">
          <span>04</span>
          <strong>${t("exec_card_04_title")}</strong>
          <p>${escapeHtml(execution.video_status || t("exec_card_04_body"))}</p>
        </div>
      </div>
      <div class="shot-list-head">
        <span>${t("shot_count").replace("{n}", shots.length)}</span>
        ${shots.length ? `<button type="button" class="mini-button ghost" data-shots-expand-all>${allExpanded ? t("shot_collapse_all") : t("shot_expand_all")}</button>` : ""}
      </div>
      <div class="shot-list">
        ${shots.map((shot, index) => shotListRow(shot, index)).join("") || `<div class="empty-shot">${t("shot_empty")}</div>`}
      </div>
    </section>`;
}

function imageConfigPanel() {
  const config = imageConfig || {};
  const keyPlaceholder = config.has_api_key
    ? t("image_config_key_configured").replace("{preview}", config.api_key_preview)
    : t("image_config_key_placeholder");
  return `
    <form class="image-config" data-image-config>
      <div class="field">
        <label for="imageBaseUrl">BASE_URL</label>
        <input id="imageBaseUrl" name="base_url" value="${escapeHtml(config.base_url || "https://moonrouter.dev/v1")}" />
      </div>
      <div class="field">
        <label for="imageApiKey">API Key</label>
        <input id="imageApiKey" name="api_key" type="password" placeholder="${escapeHtml(keyPlaceholder)}" value="" />
      </div>
      <div class="field">
        <label for="imageModel">${t("image_config_model")}</label>
        <input id="imageModel" name="model" value="${escapeHtml(config.model || "gpt-image-2")}" />
      </div>
      <div class="field">
        <label for="imageSize">${t("image_config_size")}</label>
        <select id="imageSize" name="size">
          ${["1024x1024", "1536x1024", "1024x1536"].map((size) => `<option value="${size}" ${size === (config.size || "1024x1024") ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </div>
      <button type="submit">${t("image_config_save")}</button>
    </form>`;
}

function setSettingsTab(name) {
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === name);
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === name);
  });
}

function openSettings() {
  const modal = $("settingsModal");
  const titleSuffix = project().series?.title ? `《${project().series.title}》 · ` : "";
  $("settingsSubtitle").textContent = titleSuffix + t("settings_title_default");
  $("imageSettingsMount").innerHTML = imageConfigPanel();
  bindImageConfigForm();
  bindLangSelect();
  setSettingsTab("image");
  applyI18n();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  const modal = $("settingsModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function bindLangSelect() {
  const langSel = document.getElementById("languageSelect");
  if (!langSel) return;
  langSel.value = langPref;
  langSel.addEventListener("change", (e) => {
    langPref = e.target.value;
    localStorage.setItem(LANG_STORAGE_KEY, langPref);
    render();
    openSettings();
  });
}

function bindImageConfigForm() {
  const imageConfigForm = document.querySelector("[data-image-config]");
  if (!imageConfigForm) return;
  imageConfigForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const keepKey = !value(imageConfigForm, "api_key");
    imageConfig = await api("/api/image-config", {
      base_url: value(imageConfigForm, "base_url"),
      api_key: keepKey ? "__KEEP__" : value(imageConfigForm, "api_key"),
      model: value(imageConfigForm, "model"),
      size: value(imageConfigForm, "size"),
    });
    toast(t("image_config_saved"));
    openSettings();
  });
}

const SHOT_READINESS_FIELDS = [
  ["composition", "Composition", (s) => s.composition],
  ["camera", "Camera spec", (s) => s.shot_size || s.camera_movement || s.camera],
  ["setting", "Setting", (s) => s.setting],
  ["lighting", "Lighting", (s) => s.lighting],
  ["action", "Action script", (s) => s.action],
  ["prompt", "Image prompt", (s) => s.prompt],
  ["video_prompt", "Video prompt", (s) => s.video_prompt],
  ["audio", "Sound design", (s) => s.audio && (s.audio.ambient || (s.audio.dialogue || []).length || s.audio.narration || (s.audio.sfx || []).length || s.audio.music)],
  ["transition", "Transition", (s) => s.transition_in && s.transition_out],
  ["continuity", "Continuity anchors", (s) => s.continuity && (s.continuity.anchors || []).length],
];

function shotIsSilent(shot) {
  if (shot.silent === true) return true;
  const a = shot.audio || {};
  return !(a.dialogue || []).length && !a.narration;
}

function hasSoundBed(shot) {
  const a = shot.audio || {};
  return Boolean(a.ambient || (a.sfx || []).length || a.music);
}

function dialogueCps(shot) {
  const seconds = Number(shot.duration_seconds) || 0;
  if (!seconds) return 0;
  const chars = (shot.srt || []).map((l) => (typeof l === "string" ? l : l.text || "")).join("").replace(/\s/g, "").length;
  return chars / seconds;
}

function shotReadiness(shot) {
  const missing = SHOT_READINESS_FIELDS.filter(([, , get]) => !get(shot)).map(([, label]) => label);
  const durOk = [4, 5, 6, 8, 10, 12].includes(Number(shot.duration_seconds));
  if (!durOk) missing.push("Duration");
  const silent = shotIsSilent(shot);
  const cps = dialogueCps(shot);
  let pacingWarn = false;
  if (silent) {
    if (!hasSoundBed(shot)) missing.push("Sound bed");
  } else {
    if (!(shot.srt || []).length) missing.push("Dialogue SRT");
    pacingWarn = cps > 8;
  }
  return { missing, cps, pacingWarn, silent, ready: missing.length === 0 && !pacingWarn };
}

function audioBlock(audio) {
  if (!audio) return `<p class="muted">${t("shot_pending_audio")}</p>`;
  const dlg = (audio.dialogue || []).map((d) => `<li><b>${escapeHtml(d.speaker || "")}</b>${d.tone ? `<span class="tag">${escapeHtml(d.tone)}</span>` : ""}：${escapeHtml(d.line || "")}</li>`).join("");
  return `
    ${dlg ? `<ul class="audio-lines">${dlg}</ul>` : ""}
    ${audio.narration ? `<p><span class="mini-label">${t("audio_narration")}</span>${escapeHtml(audio.narration)}</p>` : ""}
    <div class="audio-grid">
      ${audio.sfx && audio.sfx.length ? `<div><span class="mini-label">${t("audio_sfx")}</span>${escapeHtml((audio.sfx || []).join(", "))}</div>` : ""}
      ${audio.ambient ? `<div><span class="mini-label">${t("audio_ambient")}</span>${escapeHtml(audio.ambient)}</div>` : ""}
      ${audio.music ? `<div><span class="mini-label">${t("audio_music")}</span>${escapeHtml(audio.music)}</div>` : ""}
    </div>`;
}

function specRow(shot) {
  const specs = [
    [t("spec_shot_size"), shot.shot_size],
    [t("spec_angle"), shot.camera_angle],
    [t("spec_movement"), shot.camera_movement],
    [t("spec_lens"), shot.lens],
    [t("spec_ratio"), shot.aspect_ratio],
    [t("spec_emotion"), shot.emotion],
  ].filter(([, v]) => v);
  if (!specs.length) return shot.camera ? `<p class="muted">${escapeHtml(shot.camera)}</p>` : "";
  return `<div class="spec-row">${specs.map(([k, v]) => `<span class="spec"><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`).join("")}</div>`;
}

function shotPreview(shot) {
  const srt = shot.srt || [];
  const r = shotReadiness(shot);
  const pendingCount = r.missing.length + (r.pacingWarn ? 1 : 0);
  const readinessChip = r.ready
    ? `<span class="ready-chip ok">${t("shot_video_ready")}</span>`
    : `<span class="ready-chip warn" title="${escapeHtml([...r.missing.map((m) => m), r.pacingWarn ? `Pace: ${r.cps.toFixed(1)} chars/s` : ""].filter(Boolean).join(", "))}">${t("shot_pending").replace("{n}", pendingCount)}</span>`;
  const cont = shot.continuity || {};
  return `
    <article class="shot-script-card">
      <div class="shot-script-head">
        <div>
          <span class="badge">${escapeHtml(shot.beat_id || "beat")}</span>
          <span class="badge">${escapeHtml(shot.duration_preset || `${shot.duration_seconds || ""}s` || "—")}</span>
          ${r.silent ? `<span class="badge soft">${t("shot_pure_visual")}</span>` : ""}
          ${readinessChip}
          <h4>${escapeHtml(shot.title || shot.id)}</h4>
        </div>
        ${statusBadge(shot.status)}
      </div>
      <div class="shot-sheet">
        <section class="sheet-block">
          <label>${t("shot_label_composition")}</label>
          <p>${escapeHtml(shot.composition || "")}</p>
          ${specRow(shot)}
          <p class="muted">${escapeHtml([shot.setting, shot.lighting].filter(Boolean).join(" · "))}</p>
        </section>
        ${shot.action ? `<section class="sheet-block"><label>${t("shot_label_action")}</label><p>${escapeHtml(shot.action)}</p></section>` : ""}
        ${shot.video_prompt ? `<section class="sheet-block"><label>${t("shot_label_video_prompt")}</label><pre class="soft-pre">${escapeHtml(shot.video_prompt)}</pre></section>` : ""}
        <section class="sheet-block">
          <label>${t("shot_label_audio")}</label>
          ${audioBlock(shot.audio)}
        </section>
        <section class="sheet-block">
          <label>${t("shot_label_srt")} ${r.silent ? "" : (srt.length ? `<span class="cps ${r.pacingWarn ? "warn" : ""}">${r.cps.toFixed(1)} chars/s · ${srt.length} cues</span>` : "")}</label>
          ${r.silent
            ? `<p class="muted">${t("shot_pure_visual_note")}</p>`
            : `<pre>${escapeHtml(srt.length ? srt.map(formatSrtLine).join("\n\n") : t("shot_srt_pending"))}</pre>`}
        </section>
        ${(shot.transition_in || shot.transition_out) ? `<section class="sheet-block"><label>${t("shot_label_transition")}</label><p class="muted">${t("trans_in")}：${escapeHtml(shot.transition_in || "cut")} ／ ${t("trans_out")}：${escapeHtml(shot.transition_out || "cut")}</p></section>` : ""}
        ${(cont.anchors || cont.props || cont.wardrobe) ? `<section class="sheet-block"><label>${t("shot_label_continuity")}</label>
          ${cont.wardrobe ? `<p><span class="mini-label">${t("cont_wardrobe")}</span>${escapeHtml(cont.wardrobe)}</p>` : ""}
          ${(cont.props || []).length ? `<p><span class="mini-label">${t("cont_props")}</span>${escapeHtml((cont.props || []).join(", "))}</p>` : ""}
          ${cont.carries_from_prev ? `<p><span class="mini-label">${t("cont_carries")}</span>${escapeHtml(cont.carries_from_prev)}</p>` : ""}
          ${(cont.anchors || []).length ? `<p><span class="mini-label">${t("cont_anchors")}</span>${escapeHtml((cont.anchors || []).join("; "))}</p>` : ""}
        </section>` : ""}
        <section class="sheet-block sheet-assets">
          <div>
            <label>${t("shot_label_storyboard_image")}</label>
            ${storyboardImageBlock(shot)}
          </div>
          <div>
            <label>${t("shot_label_video")}</label>
            ${shotVideoBlock(shot)}
          </div>
        </section>
      </div>
    </article>`;
}

function candidateList(shot, kind) {
  const list = kind === "video" ? shot.video_candidates : shot.image_candidates;
  const active = kind === "video" ? shot.video_asset : shot.image_asset;
  if (Array.isArray(list) && list.length) return { list, active };
  if (active && active.startsWith("/generated/")) return { list: [{ path: active }], active };
  return { list: [], active };
}

function imageCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "image");
  if (list.length < 2) return "";
  return `<div class="cand-strip">${list.map((c, i) => `
    <button type="button" class="cand-thumb ${c.path === active ? "active" : ""}" data-set-active-image="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}" title="v${i + 1}${c.path === active ? " (active)" : " — click to select"}">
      <img src="${escapeHtml(c.path)}" alt="" loading="lazy" />
      ${c.path === active ? `<span class="cand-pick">✓</span>` : ""}
    </button>`).join("")}</div>`;
}

function videoModelLabel(generation) {
  if (!generation) return "Video";
  const b = generation.backend || "";
  const model = /seedance/i.test(b) ? "Seedance" : /ltx/i.test(b) ? "LTX" : (generation.model || "Video");
  const m = generation.method === "text-to-video" ? "T2V" : generation.method === "image-to-video" ? "I2V" : "";
  return m ? `${model}·${m}` : model;
}

function videoCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "video");
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list.map((c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-active-video="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}">v${i + 1}·${escapeHtml(videoModelLabel(c.generation))}${c.path === active ? " ✓" : ""}</button>`).join("")}</div>`;
}

function shotVideoBlock(shot) {
  const v = shot.video_asset || "";
  const isVideo = v.startsWith("/generated/");
  const hasImage = (shot.image_asset || "").startsWith("/generated/");
  return `
    <div class="shot-video">
      ${isVideo
        ? `<video src="${escapeHtml(v)}" controls preload="metadata" playsinline></video><span class="img-mode-badge">${escapeHtml(videoModelLabel(shot.video_generation))}</span>`
        : `<div class="asset-placeholder">${hasImage ? t("video_pending") : t("video_pending_image")}</div>`}
      ${videoCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-video-button" data-generate-video="${escapeHtml(shot.id)}" ${hasImage ? "" : "disabled"}>${isVideo ? t("regenerate_video") : t("generate_video")}</button>
      </div>
    </div>`;
}

function storyboardImageBlock(shot) {
  const asset = shot.image_asset || "";
  const isGenerated = asset.startsWith("/generated/");
  const mode = shot.image_generation?.mode;
  const modeBadge = isGenerated && mode ? `<span class="img-mode-badge">${mode === "image-edit" ? t("modal_mode_image_edit") : t("modal_mode_text")}</span>` : "";
  return `
    <div class="storyboard-image">
      ${isGenerated ? `<img src="${escapeHtml(asset)}" alt="${escapeHtml(shot.title || "Storyboard image")}" data-image-zoom="${escapeHtml(asset)}" title="Click to enlarge" />` : `<div class="asset-placeholder">${escapeHtml(asset || t("image_pending"))}</div>`}
      ${modeBadge}
      ${imageCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-image-button" data-generate-image="${escapeHtml(shot.id)}">${isGenerated ? t("regenerate_image") : t("generate_image")}</button>
        <button type="button" class="mini-button ghost" data-prompt-preview="${escapeHtml(shot.id)}">${t("view_prompt")}</button>
      </div>
    </div>`;
}

function formatSrtLine(line, index) {
  if (typeof line === "string") return line;
  return `${index + 1}\n${line.time || "00:00:00,000 --> 00:00:03,000"}\n${line.text || ""}`;
}

function ensureModalHost() {
  let host = document.getElementById("modalHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "modalHost";
    document.body.appendChild(host);
  }
  return host;
}

function closeModal() {
  const host = document.getElementById("modalHost");
  if (host) host.innerHTML = "";
}

function mountModal(inner) {
  const host = ensureModalHost();
  host.innerHTML = `<div class="modal-overlay" data-modal-close="1"><div class="modal-card">${inner}</div></div>`;
  host.querySelectorAll("[data-modal-close]").forEach((node) => {
    node.addEventListener("click", (event) => { if (event.target === node) closeModal(); });
  });
  const closeBtn = host.querySelector(".modal-close-button");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
}

function openImageModal(src) {
  if (!src) return;
  mountModal(`
    <button type="button" class="modal-close-button" aria-label="Close">${t("modal_close")}</button>
    <div class="modal-image-wrap"><img src="${escapeHtml(src)}" alt="Storyboard enlarged" /></div>`);
}

function refThumb(ref) {
  return `
    <figure class="ref-thumb">
      <img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.name)}" data-image-zoom="${escapeHtml(ref.path)}" />
      <figcaption>${escapeHtml(ref.name)}<small>${ref.kind === "character" ? "Character card" : "Background"}</small></figcaption>
    </figure>`;
}

function openPromptModal(data) {
  const refs = data.references || [];
  const modeLabel = data.mode === "image-edit" ? t("modal_mode_image_edit") : t("modal_mode_text");
  const ctx = data.context || {};
  const contextRows = [
    ["Episode", ctx.episode_title],
    ["Logline", ctx.logline],
    ["Realism target", ctx.realism_target],
    ["Color palette", ctx.color_palette],
    ["Period detail", ctx.period_detail],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="ctx-row"><span>${escapeHtml(k)}</span><p>${escapeHtml(v)}</p></div>`).join("");
  const characters = (data.characters || []).map((c) => `
    <div class="ctx-row"><span>${escapeHtml(c.name)}</span><p>${escapeHtml(c.visual_front || "")}${c.reference_image ? "" : t("char_no_ref")}</p></div>`).join("");
  mountModal(`
    <button type="button" class="modal-close-button" aria-label="Close">${t("modal_close")}</button>
    <div class="modal-head">
      <h3>${escapeHtml(data.title || t("modal_prompt_title"))}</h3>
      <div class="modal-tags">
        <span class="badge">${escapeHtml(modeLabel)}</span>
        ${data.model ? `<span class="badge">${escapeHtml(data.model)}</span>` : ""}
        ${data.size ? `<span class="badge">${escapeHtml(data.size)}</span>` : ""}
        ${data.duration ? `<span class="badge">${escapeHtml(data.duration)}</span>` : ""}
      </div>
    </div>
    <div class="modal-body">
      ${refs.length ? `<section class="modal-section"><label>${t("modal_prompt_refs_label")}</label><div class="ref-grid">${refs.map(refThumb).join("")}</div></section>` : `<section class="modal-section"><p class="muted">${t("modal_prompt_no_refs")}</p></section>`}
      <section class="modal-section"><label>${t("modal_prompt_label")}</label><pre class="prompt-pre">${escapeHtml(data.prompt || "")}</pre></section>
      ${data.negative_prompt ? `<section class="modal-section"><label>${t("modal_negative_prompt_label")}</label><pre class="prompt-pre">${escapeHtml(data.negative_prompt)}</pre></section>` : ""}
      ${characters ? `<section class="modal-section"><label>${t("modal_characters_label")}</label>${characters}</section>` : ""}
      ${contextRows ? `<section class="modal-section"><label>${t("modal_context_label")}</label>${contextRows}</section>` : ""}
    </div>`);
  document.getElementById("modalHost").querySelectorAll("[data-image-zoom]").forEach((node) => {
    node.addEventListener("click", () => openImageModal(node.dataset.imageZoom));
  });
}

function itemCard(item) {
  const title = item.name || item.title || item.type || item.id;
  const body = item.logline || item.promise || item.conflict || item.note || item.prompt || item.character_card?.identity || item.hidden_truth || "";
  const key = item.number ? `EP-${String(item.number).padStart(3, "0")}` : String(item.id || "").split("-").slice(-2).join("-").toUpperCase();
  const thumb = item.reference_card?.image_asset || item.image_asset || "";
  const hasThumb = typeof thumb === "string" && thumb.startsWith("/generated/");
  const meta = [
    item.role,
    item.type,
    item.status ? statusBadge(item.status) : "",
    item.number ? `<span class="badge">Ep ${item.number}</span>` : "",
  ].filter(Boolean).map((part) => String(part).startsWith("<") ? part : `<span class="badge">${escapeHtml(part)}</span>`).join("");
  return `
    <button class="item-card ${hasThumb ? "has-thumb" : ""} ${item.id === selectedId ? "active" : ""}" data-select="${escapeHtml(item.id)}">
      ${hasThumb ? `<span class="item-card-thumb"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" /></span>` : `<span class="row-key">${escapeHtml(key)}</span>`}
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body).slice(0, 140)}</small>
      </span>
      <span class="card-meta">${meta}</span>
    </button>`;
}

function input(name, label, value = "", type = "text") {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" /></div>`;
}

function textarea(name, label, value = "", full = true) {
  return `<div class="field ${full ? "full" : ""}"><label for="${name}">${label}</label><textarea id="${name}" name="${name}">${escapeHtml(value)}</textarea></div>`;
}

function select(name, label, value, options) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
  </select></div>`;
}

function seriesForm(series) {
  return `
    <form class="detail-card" data-kind="series">
      <h2>${t("form_series_title")}</h2>
      <div class="form-grid">
        ${input("title", "Title", series.title)}
        ${input("genre", "Genre", series.genre)}
        ${input("platform", "Platform / format", series.platform)}
        ${input("format", "Episodes / runtime", series.format)}
        ${input("tone", "Tone", series.tone)}
        ${input("audience", "Target audience", series.audience)}
        ${input("hyperframe_project_path", "HyperFrame project path", series.hyperframe_project_path || series.hyperframe_source?.project_path || "")}
        ${textarea("logline", "One-line logline", series.logline)}
        ${textarea("hook_rules", "Hook rules (one per line)", lines(series.hook_rules))}
        ${textarea("world_rules", "World rules (one per line)", lines(series.world_rules))}
      </div>
      <div class="form-actions"><button type="submit">${t("form_series_save")}</button></div>
    </form>`;
}

function detailForm(item) {
  if (!item) return `<div class="detail-card"><h2>${t("form_select_or_new")}</h2><p class="muted">${t("form_select_or_new_hint")}</p></div>`;
  if (view === "characters") return characterForm(item);
  if (view === "relationships") return relationshipForm(item);
  if (view === "episodes") return episodeForm(item);
  if (view === "shots") return shotForm(item);
  if (view === "tasks") return taskForm(item);
  return "";
}

function statusSelect(value) {
  return select("status", "Status", value || "draft", ["draft", "needs_review", "changes_requested", "approved", "done", "blocked"]);
}

function characterForm(item) {
  const card = item.character_card || {};
  const visual = item.visual || {};
  const reference = item.reference_card || {};
  const vp = item.voice_profile || {};
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || "New character")}</h2>
      ${characterReferencePreview(reference)}
      ${characterVoicePreview(item)}
      <div class="form-grid">
        ${input("id", "Character ID", item.id)}
        ${input("name", "Name", item.name)}
        ${input("role", "Dramatic function", item.role)}
        ${statusSelect(item.status)}
        ${textarea("actor_profile", "Actor / performance notes", item.actor_profile)}
        ${textarea("identity", "Identity", card.identity, false)}
        ${textarea("motivation", "Desire", card.motivation, false)}
        ${textarea("wound", "Wound", card.wound, false)}
        ${textarea("secret", "Secret", card.secret, false)}
        ${textarea("arc", "Character arc", card.arc, false)}
        ${textarea("voice", "Dialogue voice (tone baseline)", card.voice, false)}
        ${input("voice_type", "Timbre / type", vp.type)}
        ${input("voice_pace", "Pace", vp.pace)}
        ${input("voice_accent", "Accent / dialect", vp.accent)}
        ${input("voice_signature", "Signature delivery", vp.signature)}
        ${input("voice_casting", "Casting reference voice", vp.casting_reference)}
        ${textarea("voice_sample", "Audition line (voice script sample)", vp.sample_script, false)}
        ${textarea("front", "Three-view: front", visual.front, false)}
        ${textarea("side", "Three-view: side", visual.side, false)}
        ${textarea("back", "Three-view: back", visual.back, false)}
        ${textarea("wardrobe", "Wardrobe", visual.wardrobe, false)}
        ${textarea("anchors", "Consistency anchors (one per line)", lines(visual.anchors))}
        ${textarea("forbidden_drift", "Forbidden drift (one per line)", lines(visual.forbidden_drift))}
      </div>
      ${formActions()}
    </form>`;
}

function characterReferencePreview(reference) {
  return `
    <section class="character-reference">
      <div>
        <h3>${t("char_ref_title")}</h3>
        <p class="muted">${escapeHtml(reference.purpose || t("char_ref_hint"))}</p>
      </div>
      ${reference.image_asset ? `<img src="${escapeHtml(reference.image_asset)}" alt="${t("char_ref_title")}" />` : `<div class="asset-placeholder">${t("char_ref_placeholder")}</div>`}
    </section>`;
}

function characterVoicePreview(item) {
  const vp = item.voice_profile || {};
  const vr = item.voice_reference || {};
  const summary = [vp.type, vp.pace, vp.accent, vp.signature].filter(Boolean).join(" · ");
  const generated = vr.asset && vr.status === "generated";
  return `
    <section class="character-voice">
      <div class="voice-head">
        <div>
          <h3>${t("char_voice_title")}</h3>
          <p class="muted">${escapeHtml(summary || t("char_voice_hint"))}</p>
        </div>
        <span class="voice-status ${generated ? "ok" : "planned"}">${generated ? t("char_voice_generated") : t("char_voice_planned")}</span>
      </div>
      ${vp.casting_reference ? `<p class="voice-line"><span class="mini-label">${t("char_voice_casting")}</span>${escapeHtml(vp.casting_reference)}</p>` : ""}
      ${vp.sample_script ? `<p class="voice-line"><span class="mini-label">${t("char_voice_sample")}</span>${escapeHtml(vp.sample_script)}</p>` : ""}
      <div class="voice-ref">
        ${generated
          ? `<audio controls src="${escapeHtml(vr.asset)}"></audio>`
          : `<div class="asset-placeholder">${t("char_voice_placeholder")}</div>`}
        <button type="button" class="mini-button generate-voice-button" data-generate-voice="${escapeHtml(item.id)}">${generated ? t("regenerate_voice") : t("generate_voice")}</button>
      </div>
      ${voiceCandidateStrip(item)}
    </section>`;
}

function voiceCandidateStrip(character) {
  const list = character.voice_candidates || [];
  const active = character.voice_reference?.asset || "";
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list.map((c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-voice-active="${escapeHtml(c.path)}" data-char="${escapeHtml(character.id)}">v${i + 1}${c.path === active ? " ✓" : ""}</button>`).join("")}</div>`;
}

function relationshipForm(item) {
  return `
    <form class="detail-card" data-kind="relationships" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.type || "New relationship")}</h2>
      <div class="form-grid">
        ${input("id", "Relationship ID", item.id)}
        ${characterSelect("from", "From", item.from)}
        ${characterSelect("to", "To", item.to)}
        ${input("type", "Relationship type", item.type)}
        ${input("emotional_temperature", "Emotional temperature", item.emotional_temperature)}
        ${textarea("public_status", "Public relationship", item.public_status, false)}
        ${textarea("hidden_truth", "Hidden truth", item.hidden_truth, false)}
        ${textarea("power_dynamic", "Power direction", item.power_dynamic, false)}
        ${textarea("conflict", "Current conflict", item.conflict)}
        ${textarea("evidence", "Evidence (one per line)", lines(item.evidence))}
      </div>
      ${relationshipPreview(item)}
      ${formActions()}
    </form>`;
}

function characterSelect(name, label, value) {
  const options = (project().characters || []).map((character) => character.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(characterName(id))}</option>`).join("")}
  </select></div>`;
}

function relationshipPreview(item) {
  return `<div class="relationship-node"><strong>${escapeHtml(characterName(item.from))}</strong> → <strong>${escapeHtml(characterName(item.to))}</strong><p>${escapeHtml(item.conflict || "")}</p></div>`;
}

function episodeForm(item) {
  return `
    <form class="detail-card" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <h2>Ep ${escapeHtml(item.number || "")} — ${escapeHtml(item.title || "")}</h2>
      <div class="form-grid">
        ${input("id", "Episode ID", item.id)}
        ${input("number", "Episode number", item.number || "", "number")}
        ${input("title", "Title", item.title)}
        ${statusSelect(item.status)}
        ${input("hyperframe_composition", "HyperFrame composition", item.hyperframe_composition || item.source_composition || "")}
        ${input("hyperframe_video_asset", "HyperFrame video asset", item.hyperframe_video_asset || item.source_video_asset || "")}
        ${textarea("promise", "Episode promise", item.promise)}
        ${textarea("a_plot", "A-plot", item.a_plot, false)}
        ${textarea("b_plot", "B-plot", item.b_plot, false)}
        ${textarea("cliffhanger", "Cliffhanger", item.cliffhanger)}
        ${textarea("beats_json", "Beats JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
      ${formActions()}
    </form>`;
}

function shotForm(item) {
  return `
    <form class="detail-card" data-kind="shots" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "New shot")}</h2>
      <div class="form-grid">
        ${input("id", "Shot ID", item.id)}
        ${episodeSelect("episode_id", "Episode", item.episode_id)}
        ${input("beat_id", "Beat ID", item.beat_id)}
        ${input("title", "Shot title", item.title)}
        ${statusSelect(item.status)}
        ${input("duration_seconds", "Duration (s — 4/5/6/8/10/12)", item.duration_seconds)}
        ${input("emotion", "Emotion", item.emotion)}
        ${input("shot_size", "Shot size", item.shot_size)}
        ${input("camera_angle", "Camera angle", item.camera_angle)}
        ${input("camera_movement", "Camera movement", item.camera_movement)}
        ${input("lens", "Lens", item.lens)}
        ${input("transition_in", "Transition in", item.transition_in)}
        ${input("transition_out", "Transition out", item.transition_out)}
        ${textarea("characters", "Characters (one ID per line)", lines(item.characters), false)}
        ${textarea("composition", "Composition (still frame)", item.composition, false)}
        ${textarea("camera", "Camera (freeform)", item.camera, false)}
        ${textarea("setting", "Setting", item.setting, false)}
        ${textarea("lighting", "Lighting", item.lighting, false)}
        ${textarea("action", "Action script (motion)", item.action, false)}
        ${textarea("prompt", "Image prompt", item.prompt)}
        ${textarea("video_prompt", "Video motion prompt", item.video_prompt)}
        ${textarea("negative_prompt", "Negative prompt", item.negative_prompt)}
      </div>
      <p class="form-note">Sound design (audio), continuity, and SRT are structured fields — preserved on save. Edit via @ai or directly in project.json.</p>
      ${formActions()}
    </form>`;
}

function episodeSelect(name, label, value) {
  const options = (project().episodes || []).map((episode) => episode.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(episodeTitle(id))}</option>`).join("")}
  </select></div>`;
}

function taskForm(item) {
  return `
    <form class="detail-card" data-kind="tasks" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "New task")}</h2>
      <div class="form-grid">
        ${input("id", "Task ID", item.id)}
        ${input("kind", "Kind", item.kind)}
        ${input("target_id", "Target ID", item.target_id)}
        ${statusSelect(item.status)}
        ${input("title", "Title", item.title)}
        ${textarea("note", "Note / @ai request", item.note)}
      </div>
      ${formActions()}
    </form>`;
}

function formActions() {
  return `<div class="form-actions"><button type="submit">${t("form_save")}</button><button type="button" class="danger" data-delete>${t("form_delete")}</button><span class="muted save-hint">${t("form_saved_connected")}</span></div>`;
}

function bindForm() {
  document.querySelectorAll("[data-go]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: node.dataset.go, selectedId: null, episodeMode: "list", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-select]").forEach((node) => {
    node.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ selectedId: node.dataset.select });
    });
  });
  document.querySelectorAll("[data-episode-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ view: "episodes", selectedId: node.dataset.episodeDetail, episodeMode: "detail", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-row-episode]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ view: "episodes", selectedId: node.dataset.rowEpisode, episodeMode: "detail", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-episode-list]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-episode-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: "episodes", episodeMode: "detail", episodeTab: node.dataset.episodeTab });
    });
  });
  document.querySelectorAll("[data-shot-toggle]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("[data-generate-image], [data-prompt-preview], [data-image-zoom]")) return;
      const id = node.dataset.shotToggle;
      if (expandedShots.has(id)) expandedShots.delete(id);
      else expandedShots.add(id);
      render();
    });
  });
  const expandAll = document.querySelector("[data-shots-expand-all]");
  if (expandAll) {
    expandAll.addEventListener("click", () => {
      const shots = shotsForEpisode(selectedId);
      const allOpen = shots.every((s) => expandedShots.has(s.id));
      shots.forEach((s) => allOpen ? expandedShots.delete(s.id) : expandedShots.add(s.id));
      render();
    });
  }
  document.querySelectorAll("[data-generate-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateImage;
      node.disabled = true;
      node.textContent = t("generating");
      try {
        const result = await api("/api/storyboard-image", { shot_id: shotId });
        state = result.state || await api("/api/state");
        toast(t("toast_image_generated"));
        render();
      } catch (error) {
        toast(error.message || t("generate_image_failed"));
        node.disabled = false;
        node.textContent = t("generate_image");
      }
    });
  });
  document.querySelectorAll("[data-generate-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateVideo;
      node.disabled = true;
      node.textContent = t("generating_video");
      try {
        const result = await api("/api/shot-video", { shot_id: shotId });
        state = result.state || await api("/api/state");
        toast(t("toast_video_generated"));
        render();
      } catch (error) {
        toast(error.message || t("generate_video_failed"));
        node.disabled = false;
        node.textContent = t("generate_video");
      }
    });
  });
  document.querySelectorAll("[data-generate-voice]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.dataset.generateVoice;
      node.disabled = true;
      node.textContent = t("generating_voice");
      try {
        const result = await api("/api/character-voice", { character_id: id });
        state = result.state || await api("/api/state");
        toast(t("toast_voice_generated"));
        render();
      } catch (error) {
        toast(error.message || t("generate_voice_failed"));
        node.disabled = false;
        node.textContent = t("generate_voice");
      }
    });
  });
  document.querySelectorAll("[data-set-voice-active]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/character-voice-active", { character_id: node.dataset.char, path: node.dataset.setVoiceActive });
        toast(t("toast_voice_active"));
        render();
      } catch (error) { toast(error.message || "Failed"); }
    });
  });
  document.querySelectorAll("[data-set-active-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/shot-active", { shot_id: node.dataset.shot, kind: "image", path: node.dataset.setActiveImage });
        toast(t("toast_image_active"));
        render();
      } catch (error) { toast(error.message || "Failed"); }
    });
  });
  document.querySelectorAll("[data-set-active-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/shot-active", { shot_id: node.dataset.shot, kind: "video", path: node.dataset.setActiveVideo });
        toast(t("toast_video_active"));
        render();
      } catch (error) { toast(error.message || "Failed"); }
    });
  });
  document.querySelectorAll("[data-prompt-preview]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        const data = await api(`/api/storyboard-prompt?shot_id=${encodeURIComponent(node.dataset.promptPreview)}`);
        openPromptModal(data);
      } catch (error) {
        toast(error.message || "Could not load prompt");
      }
    });
  });
  document.querySelectorAll("[data-image-zoom]").forEach((node) => {
    node.addEventListener("click", () => openImageModal(node.dataset.imageZoom));
  });
  document.querySelectorAll("[data-hyperframe-refresh]").forEach((node) => {
    node.addEventListener("click", refreshHyperframeStatus);
  });
  const form = document.querySelector("form.detail-card");
  if (!form) return;
  form.addEventListener("input", () => {
    form.classList.add("is-dirty");
    const hint = form.querySelector(".save-hint");
    if (hint) hint.textContent = t("form_unsaved");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveForm(form);
  });
  const deleteButton = form.querySelector("[data-delete]");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!confirm(t("confirm_delete"))) return;
      const kind = form.dataset.kind;
      const id = form.dataset.id;
      state = await api(`/api/${kind}/${encodeURIComponent(id)}`, { delete: true });
      selectedId = null;
      toast(t("toast_deleted"));
      render();
    });
  }
}

async function refreshHyperframeStatus() {
  const path = project().series?.hyperframe_project_path || project().series?.hyperframe_source?.project_path || "";
  if (!path) {
    toast("Set a HyperFrame project path first.");
    return;
  }
  hyperframeLoading = true;
  render();
  try {
    hyperframeStatus = await api(`/api/hyperframe-status?path=${encodeURIComponent(path)}`);
    toast(hyperframeStatus.ok ? "HyperFrame project read." : (hyperframeStatus.error || "Could not read HyperFrame project."));
  } catch (error) {
    toast(error.message || "Could not read HyperFrame project.");
  } finally {
    hyperframeLoading = false;
    render();
  }
}

function value(form, name) {
  return form.elements[name]?.value ?? "";
}

async function saveForm(form) {
  const kind = form.dataset.kind;
  let payload;
  if (kind === "series") {
    payload = {
      title: value(form, "title"),
      genre: value(form, "genre"),
      platform: value(form, "platform"),
      format: value(form, "format"),
      tone: value(form, "tone"),
      audience: value(form, "audience"),
      hyperframe_project_path: value(form, "hyperframe_project_path"),
      logline: value(form, "logline"),
      hook_rules: arr(value(form, "hook_rules")),
      world_rules: arr(value(form, "world_rules")),
    };
    state = await api("/api/series", { series: payload });
  } else {
    payload = serializeItem(form, kind);
    state = await api(`/api/${kind}/${encodeURIComponent(payload.id)}`, payload);
    selectedId = payload.id;
  }
  toast(t("toast_saved"));
  syncRoute({ replace: true });
  render();
}

function serializeItem(form, kind) {
  const base = { id: value(form, "id") || form.dataset.id };
  if (kind === "characters") {
    return {
      ...base,
      name: value(form, "name"),
      role: value(form, "role"),
      status: value(form, "status"),
      actor_profile: value(form, "actor_profile"),
      character_card: {
        identity: value(form, "identity"),
        motivation: value(form, "motivation"),
        wound: value(form, "wound"),
        secret: value(form, "secret"),
        arc: value(form, "arc"),
        voice: value(form, "voice"),
      },
      visual: {
        front: value(form, "front"),
        side: value(form, "side"),
        back: value(form, "back"),
        wardrobe: value(form, "wardrobe"),
        anchors: arr(value(form, "anchors")),
        forbidden_drift: arr(value(form, "forbidden_drift")),
      },
      voice_profile: {
        type: value(form, "voice_type"),
        pace: value(form, "voice_pace"),
        accent: value(form, "voice_accent"),
        signature: value(form, "voice_signature"),
        casting_reference: value(form, "voice_casting"),
        sample_script: value(form, "voice_sample"),
      },
    };
  }
  if (kind === "relationships") {
    return {
      ...base,
      from: value(form, "from"),
      to: value(form, "to"),
      type: value(form, "type"),
      public_status: value(form, "public_status"),
      hidden_truth: value(form, "hidden_truth"),
      power_dynamic: value(form, "power_dynamic"),
      emotional_temperature: value(form, "emotional_temperature"),
      conflict: value(form, "conflict"),
      evidence: arr(value(form, "evidence")),
    };
  }
  if (kind === "episodes") {
    let beats = [];
    try {
      beats = JSON.parse(value(form, "beats_json") || "[]");
    } catch {
      throw new Error("Invalid beats JSON");
    }
    return {
      ...base,
      number: Number.parseInt(value(form, "number"), 10) || 0,
      title: value(form, "title"),
      status: value(form, "status"),
      hyperframe_composition: value(form, "hyperframe_composition"),
      hyperframe_video_asset: value(form, "hyperframe_video_asset"),
      summary: value(form, "summary"),
      promise: value(form, "promise"),
      a_plot: value(form, "a_plot"),
      b_plot: value(form, "b_plot"),
      cliffhanger: value(form, "cliffhanger"),
      beats,
    };
  }
  if (kind === "shots") {
    const durRaw = value(form, "duration_seconds");
    const dur = Number.parseInt(durRaw, 10);
    const payload = {
      ...base,
      episode_id: value(form, "episode_id"),
      beat_id: value(form, "beat_id"),
      title: value(form, "title"),
      status: value(form, "status"),
      characters: arr(value(form, "characters")),
      emotion: value(form, "emotion"),
      shot_size: value(form, "shot_size"),
      camera_angle: value(form, "camera_angle"),
      camera_movement: value(form, "camera_movement"),
      lens: value(form, "lens"),
      transition_in: value(form, "transition_in"),
      transition_out: value(form, "transition_out"),
      composition: value(form, "composition"),
      camera: value(form, "camera"),
      setting: value(form, "setting"),
      lighting: value(form, "lighting"),
      action: value(form, "action"),
      prompt: value(form, "prompt"),
      video_prompt: value(form, "video_prompt"),
      negative_prompt: value(form, "negative_prompt"),
    };
    if (Number.isFinite(dur) && dur > 0) {
      payload.duration_seconds = dur;
      payload.duration_preset = `${dur}s`;
    }
    return payload;
  }
  return {
    ...base,
    kind: value(form, "kind"),
    target_id: value(form, "target_id"),
    status: value(form, "status"),
    title: value(form, "title"),
    note: value(form, "note"),
  };
}

function newItem() {
  const timestamp = Date.now().toString().slice(-5);
  const templates = {
    characters: { id: `char-new-${timestamp}`, name: "New character", role: "helper", status: "draft", character_card: {}, visual: { anchors: [], forbidden_drift: [] } },
    relationships: { id: `rel-new-${timestamp}`, from: project().characters?.[0]?.id || "", to: project().characters?.[1]?.id || "", type: "new relationship", evidence: [] },
    episodes: { id: `ep-new-${timestamp}`, number: (project().episodes?.length || 0) + 1, title: "New episode", status: "draft", beats: [] },
    shots: { id: `shot-new-${timestamp}`, episode_id: project().episodes?.[0]?.id || "", title: "New shot", status: "draft", characters: [] },
    tasks: { id: `task-new-${timestamp}`, kind: "episode", status: "needs_review", title: "New task", note: "" },
  };
  const item = templates[view];
  selectedId = item.id;
  state.project[view].push(item);
  navigateTo({ selectedId: item.id, episodeMode: view === "episodes" ? "detail" : episodeMode, episodeTab: "summary" });
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    navigateTo({ view: viewButton.dataset.view, selectedId: null, episodeMode: "list", episodeTab: "summary" });
  }
});

$("searchInput").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

$("projectSelect").addEventListener("change", async () => {
  const option = $("projectSelect").selectedOptions[0];
  selectedId = null;
  episodeMode = "list";
  episodeTab = "summary";
  state = await api("/api/active-project", { project_id: $("projectSelect").value });
  toast(t("toast_switch_project").replace("{title}", option?.textContent || ""));
  navigateTo({ view: "overview", selectedId: null, episodeMode: "list", episodeTab: "summary" }, { replace: true });
});

$("newItemButton").addEventListener("click", newItem);
$("sidebarToggle").addEventListener("click", toggleSidebar);
$("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
$("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
$("backToList").addEventListener("click", () => {
  if (view === "episodes" && episodeMode === "detail") navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
  else setMobileDetailOpen(false);
});
window.addEventListener("resize", syncResponsiveShell);
$("settingsButton").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
$("settingsModal").addEventListener("click", (event) => {
  if (event.target === $("settingsModal")) closeSettings();
});
document.querySelectorAll("[data-settings-tab]").forEach((node) => {
  node.addEventListener("click", () => setSettingsTab(node.dataset.settingsTab));
});

function isTypingTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
}

function moveSelection(direction) {
  if (view === "overview") return;
  if (view === "episodes" && episodeMode === "detail") return;
  const items = collectionFor().filter(matches).sort((a, b) => view === "episodes" ? (a.number || 0) - (b.number || 0) : 0);
  if (!items.length) return;
  const foundIndex = items.findIndex((item) => item.id === selectedId);
  const currentIndex = foundIndex < 0 ? (direction > 0 ? -1 : items.length) : foundIndex;
  const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + direction));
  navigateTo({ selectedId: items[nextIndex].id }, { replace: true });
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("searchInput").focus();
    $("searchInput").select();
    return;
  }
  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    $("searchInput").focus();
    return;
  }
  if (event.key.toLowerCase() === "n" && !isTypingTarget(event.target) && view !== "overview") {
    event.preventDefault();
    newItem();
    return;
  }
  if (event.key === "Escape") {
    const modalHost = document.getElementById("modalHost");
    if (modalHost && modalHost.innerHTML) {
      closeModal();
      return;
    }
    if (!$("settingsModal").classList.contains("hidden")) {
      closeSettings();
      return;
    }
    if (document.activeElement === $("searchInput") && query) {
      query = "";
      $("searchInput").value = "";
      render();
      return;
    }
    if (view === "episodes" && episodeMode === "detail") {
      navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
    }
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
  if (!isTypingTarget(event.target) && event.key === "Enter" && view === "episodes" && episodeMode === "list" && selectedId) {
    event.preventDefault();
    navigateTo({ view: "episodes", selectedId, episodeMode: "detail", episodeTab: "summary" });
  }
});

window.addEventListener("hashchange", () => {
  if (state) applyRouteFromHash();
});

window.addEventListener("popstate", () => {
  if (state) applyRouteFromHash();
});

window.addEventListener("pageshow", () => {
  if (state) applyRouteFromHash({ replaceEmpty: true });
});

setInterval(() => {
  if (!state || isApplyingRoute || isTypingTarget(document.activeElement)) return;
  const currentHash = window.location.hash || "#/overview";
  if (currentHash !== lastAppliedHash || currentHash !== `#${routeFor()}`) {
    applyRouteFromHash({ replaceEmpty: true });
  }
}, 300);

syncResponsiveShell();
load().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
