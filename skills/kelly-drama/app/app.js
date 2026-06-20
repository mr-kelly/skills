let state = null;
let view = "overview";
let selectedId = null;
let query = "";
let episodeMode = "list";
let episodeTab = "summary";
let imageConfig = null;
let isApplyingRoute = false;
let routeNeedsReplace = false;
let lastAppliedHash = "";

const $ = (id) => document.getElementById(id);

const viewMeta = {
  overview: ["总览", "项目状态和下一步"],
  characters: ["人物", "角色卡、演员设定和三视图"],
  relationships: ["关系", "公开关系、隐藏真相和证据"],
  episodes: ["剧集", "剧集表、单集剧本和分镜执行"],
  tasks: ["审批", "人工判断、AI 改稿和导出准备"],
};

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
    draft: "草稿",
    needs_review: "待审",
    changes_requested: "需改稿",
    approved: "已定稿",
    done: "完成",
    blocked: "卡住",
  }[status] || status || "草稿";
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
  const routeView = viewMeta[parts[0]] ? parts[0] : "overview";
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
  $("projectTitle").textContent = p.series?.title || "未命名短剧";
  $("projectMeta").textContent = `${p.series?.genre || "类型未定"} · ${p.series?.format || "格式未定"}`;
  $("projectPath").textContent = state.paths?.project_path || "";
  $("attentionNeeds").textContent = state.attention?.needs_review || 0;
  $("attentionShots").textContent = state.completeness?.shots_missing_prompt || 0;
  $("attentionViews").textContent = state.completeness?.characters_missing_views || 0;
  $("lockBanner").classList.toggle("hidden", !state.lock?.locked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const [title, subtitle] = viewMeta[view];
  $("viewTitle").textContent = title;
  $("viewSubtitle").textContent = subtitle;
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
    return `<option value="${escapeHtml(item.id || item.title)}" ${selected}>${escapeHtml(item.title || "未命名短剧")}</option>`;
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
  $("itemCount").textContent = "总览";
  $("newItemButton").style.visibility = "hidden";
  const list = $("list");
  list.innerHTML = `
    <div class="metrics">
      <div class="metric"><strong>${p.characters?.length || 0}</strong><span>人物</span></div>
      <div class="metric"><strong>${p.relationships?.length || 0}</strong><span>关系</span></div>
      <div class="metric"><strong>${p.episodes?.length || 0}</strong><span>剧集</span></div>
      <div class="metric"><strong>${p.shots?.length || 0}</strong><span>分镜</span></div>
    </div>
    <div class="section-label">下一步</div>
    ${overviewCard("人物一致性", `${state.completeness.characters_missing_views} 个角色缺三视图`, "characters", "人物")}
    ${overviewCard("剧情推进", `${state.completeness.episodes_missing_cliffhanger} 集缺少明确悬念`, "episodes", "剧集")}
    ${overviewCard("分镜生图", `${state.completeness.shots_missing_prompt} 个分镜缺提示词`, "episodes", "分镜")}
    ${overviewCard("关系证据", `${state.completeness.relationships_missing_evidence} 条关系缺证据集`, "relationships", "关系")}
    ${visualBiblePreview(p.series?.visual_bible || {})}
  `;
  $("detail").innerHTML = seriesForm(p.series || {});
  bindForm();
}

function overviewCard(title, body, target, tag) {
  return `
    <button class="item-card overview-row" data-go="${target}">
      <span class="row-key">${escapeHtml(tag)}</span>
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body)}</small>
      </span>
      <span class="row-arrow">打开</span>
    </button>`;
}

function visualBiblePreview(bible) {
  const assets = bible.background_reference_assets || [];
  return `
    <section class="visual-bible-card">
      <div>
        <h3>画面基准</h3>
        <p>${escapeHtml(bible.format_note || "")}</p>
        <p class="muted">${escapeHtml(bible.realism_target || "")}</p>
      </div>
      <div class="reference-grid">
        ${assets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.title || "背景参考")}" /><figcaption>${escapeHtml(asset.title || "背景参考")}</figcaption></figure>`).join("") || `<div class="asset-placeholder">背景参考图待生成</div>`}
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
  $("list").innerHTML = items.map(itemCard).join("") || `<div class="item-card"><h3>还没有内容</h3><p>点击右上角新建，先搭一个骨架。</p></div>`;
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
    return `<div class="item-card"><h3>还没有剧集</h3><p>点击右上角新建，先搭一个单集骨架。</p></div>`;
  }
  return `
    <div class="episode-table-wrap">
      <table class="episode-table">
        <thead>
          <tr>
            <th>回</th>
            <th>剧集</th>
            <th>总结</th>
            <th>状态</th>
            <th>分镜</th>
            <th>操作</th>
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
      <td><span class="badge">${shots.length} 镜</span></td>
      <td><button class="mini-button table-action" data-episode-detail="${escapeHtml(episode.id)}">查看详情</button></td>
    </tr>`;
}

function shotsForEpisode(episodeId) {
  return (project().shots || []).filter((shot) => shot.episode_id === episodeId);
}

function episodeDetail(item) {
  if (!item) return `<div class="detail-card"><h2>选择一集</h2><p class="muted">从左侧剧集表格进入单集详情。</p></div>`;
  const shots = shotsForEpisode(item.id);
  return `
    <form class="detail-card episode-detail" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <button type="button" class="back-button" data-episode-list>返回剧集列表</button>
      <div class="detail-head">
        <div>
          <div class="eyebrow">约 3 分钟 · 单集工作台</div>
          <h2>${escapeHtml(item.title || "新一集")}</h2>
          <p>${escapeHtml(item.source_chapter?.work || "三国演义")} · 第 ${escapeHtml(item.source_chapter?.chapter_number || item.number || "")} 回 · ${escapeHtml(item.runtime || "about 3 minutes")}</p>
        </div>
        ${statusBadge(item.status)}
      </div>

      <div class="episode-tabs" role="tablist" aria-label="剧集详情">
        <button type="button" class="${episodeTab === "summary" ? "active" : ""}" data-episode-tab="summary">剧集总述</button>
        <button type="button" class="${episodeTab === "shots" ? "active" : ""}" data-episode-tab="shots">分镜详情</button>
      </div>

      ${episodeTab === "shots" ? episodeShotsTab(item, shots) : episodeSummaryTab(item)}
      ${episodeTab === "shots" ? `<div class="form-actions"><span class="muted">分镜详情当前用于查看执行层，编辑分镜可后续接到单镜头弹窗。</span></div>` : formActions()}
    </form>`;
}

function episodeSummaryTab(item) {
  return `
    <section class="script-section">
      <h3>单集总结</h3>
      <div class="form-grid">
        ${input("id", "剧集 ID", item.id)}
        ${input("number", "回目 / 集数", item.number || "", "number")}
        ${input("title", "标题", item.title)}
        ${statusSelect(item.status)}
        ${textarea("summary", "总结", item.summary || item.promise)}
        ${textarea("promise", "原著锚点 / 本集承诺", item.promise)}
        ${textarea("a_plot", "A 剧情", item.a_plot, false)}
        ${textarea("b_plot", "B 剧情", item.b_plot, false)}
        ${textarea("cliffhanger", "结尾悬念", item.cliffhanger)}
        ${textarea("beats_json", "节拍 JSON", JSON.stringify(item.beats || [], null, 2))}
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
  const readyDot = r.ready ? `<span class="row-ready ok" title="视频就绪">●</span>` : `<span class="row-ready warn" title="待补 ${r.missing.length + (r.pacingWarn ? 1 : 0)} 项">●</span>`;
  const specs = [shot.shot_size, shot.camera_movement].filter(Boolean).join(" · ");
  return `
    <div class="shot-row-wrap ${expanded ? "open" : ""}">
      <button type="button" class="shot-row" data-shot-toggle="${escapeHtml(shot.id)}" aria-expanded="${expanded}">
        <span class="shot-row-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="shot-row-thumb">${isImg ? `<img src="${escapeHtml(asset)}" alt="" loading="lazy" />` : `<span class="thumb-empty">无图</span>`}</span>
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
      <h3>剧本结构</h3>
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
        `).join("") || `<p class="muted">还没有节拍。</p>`}
      </div>
    </section>`;
}

function executionTimeline(item, shots) {
  const execution = item.execution || {};
  return `
    <section class="script-section">
      <div class="section-head">
        <div>
          <h3>Storyboard</h3>
          <p class="muted">逐镜确认画面、台词、分镜图和视频状态。</p>
        </div>
      </div>
      <div class="execution-grid">
        <div class="execution-card">
          <span>01</span>
          <strong>镜头描述</strong>
          <p>${escapeHtml(execution.shot_description || "按下方分镜逐镜确认画面、构图、场景和镜头运动。")}</p>
        </div>
        <div class="execution-card">
          <span>02</span>
          <strong>台词 SRT</strong>
          <p>${escapeHtml(execution.srt_status || "先放样例台词和时间轴，后续再逐集精修。")}</p>
        </div>
        <div class="execution-card">
          <span>03</span>
          <strong>分镜图片</strong>
          <p>${escapeHtml(execution.image_status || "分镜图片先作为占位状态，不急着生成。")}</p>
        </div>
        <div class="execution-card">
          <span>04</span>
          <strong>最终分镜视频</strong>
          <p>${escapeHtml(execution.video_status || "视频生成保持未开始，只保留未来入口。")}</p>
        </div>
      </div>
      <div class="shot-list-head">
        <span>共 ${shots.length} 个分镜 · 点击展开详情</span>
        ${shots.length ? `<button type="button" class="mini-button ghost" data-shots-expand-all>${shots.every((s) => expandedShots.has(s.id)) ? "全部收起" : "全部展开"}</button>` : ""}
      </div>
      <div class="shot-list">
        ${shots.map((shot, index) => shotListRow(shot, index)).join("") || `<div class="empty-shot">本集还没有独立分镜。可以先用剧本节拍推进，后面再补镜头。</div>`}
      </div>
    </section>`;
}

function imageConfigPanel() {
  const config = imageConfig || {};
  return `
    <form class="image-config" data-image-config>
      <div class="field">
        <label for="imageBaseUrl">BASE_URL</label>
        <input id="imageBaseUrl" name="base_url" value="${escapeHtml(config.base_url || "https://moonrouter.dev/v1")}" />
      </div>
      <div class="field">
        <label for="imageApiKey">API Key</label>
        <input id="imageApiKey" name="api_key" type="password" placeholder="${escapeHtml(config.has_api_key ? `已配置：${config.api_key_preview}` : "粘贴 API Key")}" value="" />
      </div>
      <div class="field">
        <label for="imageModel">模型</label>
        <input id="imageModel" name="model" value="${escapeHtml(config.model || "gpt-image-2")}" />
      </div>
      <div class="field">
        <label for="imageSize">尺寸</label>
        <select id="imageSize" name="size">
          ${["1024x1024", "1536x1024", "1024x1536"].map((size) => `<option value="${size}" ${size === (config.size || "1024x1024") ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </div>
      <button type="submit">保存图像配置</button>
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
  $("settingsSubtitle").textContent = project().series?.title
    ? `《${project().series.title}》 · 短剧生成与本地项目配置`
    : "短剧生成与本地项目配置";
  $("imageSettingsMount").innerHTML = imageConfigPanel();
  bindImageConfigForm();
  setSettingsTab("image");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  const modal = $("settingsModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
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
    toast("图像配置已保存");
    openSettings();
  });
}

const SHOT_READINESS_FIELDS = [
  ["composition", "构图", (s) => s.composition],
  ["camera", "镜头规格", (s) => s.shot_size || s.camera_movement || s.camera],
  ["setting", "场景", (s) => s.setting],
  ["lighting", "光线", (s) => s.lighting],
  ["action", "动作脚本", (s) => s.action],
  ["prompt", "生图提示词", (s) => s.prompt],
  ["video_prompt", "视频运动提示", (s) => s.video_prompt],
  ["audio", "声音设计", (s) => s.audio && (s.audio.ambient || (s.audio.dialogue || []).length || s.audio.narration || (s.audio.sfx || []).length || s.audio.music)],
  ["transition", "转场", (s) => s.transition_in && s.transition_out],
  ["continuity", "连续性锚点", (s) => s.continuity && (s.continuity.anchors || []).length],
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
  if (!durOk) missing.push("合规时长");
  const silent = shotIsSilent(shot);
  const cps = dialogueCps(shot);
  let pacingWarn = false;
  if (silent) {
    if (!hasSoundBed(shot)) missing.push("声音床");
  } else {
    if (!(shot.srt || []).length) missing.push("台词时间轴");
    pacingWarn = cps > 8;
  }
  return { missing, cps, pacingWarn, silent, ready: missing.length === 0 && !pacingWarn };
}

function audioBlock(audio) {
  if (!audio) return `<p class="muted">待补声音设计</p>`;
  const dlg = (audio.dialogue || []).map((d) => `<li><b>${escapeHtml(d.speaker || "")}</b>${d.tone ? `<span class="tag">${escapeHtml(d.tone)}</span>` : ""}：${escapeHtml(d.line || "")}</li>`).join("");
  return `
    ${dlg ? `<ul class="audio-lines">${dlg}</ul>` : ""}
    ${audio.narration ? `<p><span class="mini-label">旁白</span>${escapeHtml(audio.narration)}</p>` : ""}
    <div class="audio-grid">
      ${audio.sfx && audio.sfx.length ? `<div><span class="mini-label">音效</span>${escapeHtml((audio.sfx || []).join("、"))}</div>` : ""}
      ${audio.ambient ? `<div><span class="mini-label">环境声</span>${escapeHtml(audio.ambient)}</div>` : ""}
      ${audio.music ? `<div><span class="mini-label">配乐</span>${escapeHtml(audio.music)}</div>` : ""}
    </div>`;
}

function specRow(shot) {
  const specs = [
    ["景别", shot.shot_size],
    ["机位", shot.camera_angle],
    ["运镜", shot.camera_movement],
    ["镜头", shot.lens],
    ["画幅", shot.aspect_ratio],
    ["情绪", shot.emotion],
  ].filter(([, v]) => v);
  if (!specs.length) return shot.camera ? `<p class="muted">${escapeHtml(shot.camera)}</p>` : "";
  return `<div class="spec-row">${specs.map(([k, v]) => `<span class="spec"><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`).join("")}</div>`;
}

function shotPreview(shot) {
  const srt = shot.srt || [];
  const r = shotReadiness(shot);
  const readinessChip = r.ready
    ? `<span class="ready-chip ok">视频就绪 ✓</span>`
    : `<span class="ready-chip warn" title="${escapeHtml([...r.missing.map((m) => "缺" + m), r.pacingWarn ? `台词过密 ${r.cps.toFixed(1)}字/秒` : ""].filter(Boolean).join("，"))}">待补 ${r.missing.length + (r.pacingWarn ? 1 : 0)} 项</span>`;
  const cont = shot.continuity || {};
  return `
    <article class="shot-script-card">
      <div class="shot-script-head">
        <div>
          <span class="badge">${escapeHtml(shot.beat_id || "beat")}</span>
          <span class="badge">${escapeHtml(shot.duration_preset || `${shot.duration_seconds || ""}s` || "时长待定")}</span>
          ${r.silent ? `<span class="badge soft">纯画面</span>` : ""}
          ${readinessChip}
          <h4>${escapeHtml(shot.title || shot.id)}</h4>
        </div>
        ${statusBadge(shot.status)}
      </div>
      <div class="shot-sheet">
        <section class="sheet-block">
          <label>镜头描述 / 规格</label>
          <p>${escapeHtml(shot.composition || "")}</p>
          ${specRow(shot)}
          <p class="muted">${escapeHtml([shot.setting, shot.lighting].filter(Boolean).join(" · "))}</p>
        </section>
        ${shot.action ? `<section class="sheet-block"><label>动作脚本（运动）</label><p>${escapeHtml(shot.action)}</p></section>` : ""}
        ${shot.video_prompt ? `<section class="sheet-block"><label>视频运动提示（图生视频）</label><pre class="soft-pre">${escapeHtml(shot.video_prompt)}</pre></section>` : ""}
        <section class="sheet-block">
          <label>声音设计</label>
          ${audioBlock(shot.audio)}
        </section>
        <section class="sheet-block">
          <label>台词 SRT ${r.silent ? "" : (srt.length ? `<span class="cps ${r.pacingWarn ? "warn" : ""}">${r.cps.toFixed(1)} 字/秒 · ${srt.length} 条</span>` : "")}</label>
          ${r.silent
            ? `<p class="muted">纯画面镜头 · 无台词，由画面、音效与配乐承载。</p>`
            : `<pre>${escapeHtml(srt.length ? srt.map(formatSrtLine).join("\n\n") : "00:00:00,000 --> 00:00:03,000\n（待补台词）")}</pre>`}
        </section>
        ${(shot.transition_in || shot.transition_out) ? `<section class="sheet-block"><label>转场</label><p class="muted">入：${escapeHtml(shot.transition_in || "cut")} ／ 出：${escapeHtml(shot.transition_out || "cut")}</p></section>` : ""}
        ${(cont.anchors || cont.props || cont.wardrobe) ? `<section class="sheet-block"><label>连续性</label>
          ${cont.wardrobe ? `<p><span class="mini-label">服装</span>${escapeHtml(cont.wardrobe)}</p>` : ""}
          ${(cont.props || []).length ? `<p><span class="mini-label">道具</span>${escapeHtml((cont.props || []).join("、"))}</p>` : ""}
          ${cont.carries_from_prev ? `<p><span class="mini-label">承接</span>${escapeHtml(cont.carries_from_prev)}</p>` : ""}
          ${(cont.anchors || []).length ? `<p><span class="mini-label">锚点</span>${escapeHtml((cont.anchors || []).join("；"))}</p>` : ""}
        </section>` : ""}
        <section class="sheet-block sheet-assets">
          <div>
            <label>分镜图片</label>
            ${storyboardImageBlock(shot)}
          </div>
          <div>
            <label>最终分镜视频</label>
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
    <button type="button" class="cand-thumb ${c.path === active ? "active" : ""}" data-set-active-image="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}" title="第${i + 1}版${c.path === active ? "（当前选用）" : "，点击选用"}">
      <img src="${escapeHtml(c.path)}" alt="" loading="lazy" />
      ${c.path === active ? `<span class="cand-pick">✓</span>` : ""}
    </button>`).join("")}</div>`;
}

function videoCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "video");
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list.map((c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-active-video="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}">草稿${i + 1}${c.path === active ? " ✓" : ""}</button>`).join("")}</div>`;
}

function shotVideoBlock(shot) {
  const v = shot.video_asset || "";
  const isVideo = v.startsWith("/generated/");
  const vmode = shot.video_generation?.mode;
  const hasImage = (shot.image_asset || "").startsWith("/generated/");
  return `
    <div class="shot-video">
      ${isVideo
        ? `<video src="${escapeHtml(v)}" controls preload="metadata" playsinline></video>${vmode ? `<span class="img-mode-badge">${vmode === "draft" ? "草稿·LTX本地" : "成片"}</span>` : ""}`
        : `<div class="asset-placeholder">${hasImage ? "草稿视频待生成" : "先生成分镜图，再生成草稿视频"}</div>`}
      ${videoCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-video-button" data-generate-video="${escapeHtml(shot.id)}" ${hasImage ? "" : "disabled"}>${isVideo ? "再生一版" : "生成草稿视频"}</button>
        <button type="button" class="mini-button ghost" disabled title="Seedance 2.0 成片模式尚未接入">成片(待接入)</button>
      </div>
    </div>`;
}

function storyboardImageBlock(shot) {
  const asset = shot.image_asset || "";
  const isGenerated = asset.startsWith("/generated/");
  const mode = shot.image_generation?.mode;
  const modeBadge = isGenerated && mode ? `<span class="img-mode-badge">${mode === "image-edit" ? "图生图·参考人物卡" : "纯文字生图"}</span>` : "";
  return `
    <div class="storyboard-image">
      ${isGenerated ? `<img src="${escapeHtml(asset)}" alt="${escapeHtml(shot.title || "分镜图")}" data-image-zoom="${escapeHtml(asset)}" title="点击查看大图" />` : `<div class="asset-placeholder">${escapeHtml(asset || "待生成")}</div>`}
      ${modeBadge}
      ${imageCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-image-button" data-generate-image="${escapeHtml(shot.id)}">${isGenerated ? "再生一版" : "生成分镜图"}</button>
        <button type="button" class="mini-button ghost" data-prompt-preview="${escapeHtml(shot.id)}">查看提示词</button>
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
    <button type="button" class="modal-close-button" aria-label="关闭">×</button>
    <div class="modal-image-wrap"><img src="${escapeHtml(src)}" alt="分镜大图" /></div>`);
}

function refThumb(ref) {
  return `
    <figure class="ref-thumb">
      <img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.name)}" data-image-zoom="${escapeHtml(ref.path)}" />
      <figcaption>${escapeHtml(ref.name)}<small>${ref.kind === "character" ? "人物卡" : "背景"}</small></figcaption>
    </figure>`;
}

function openPromptModal(data) {
  const refs = data.references || [];
  const modeLabel = data.mode === "image-edit" ? "图生图（多图参考）" : "纯文字生图";
  const ctx = data.context || {};
  const contextRows = [
    ["剧集", ctx.episode_title],
    ["故事背景", ctx.logline],
    ["真实度目标", ctx.realism_target],
    ["色彩", ctx.color_palette],
    ["年代细节", ctx.period_detail],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="ctx-row"><span>${escapeHtml(k)}</span><p>${escapeHtml(v)}</p></div>`).join("");
  const characters = (data.characters || []).map((c) => `
    <div class="ctx-row"><span>${escapeHtml(c.name)}</span><p>${escapeHtml(c.visual_front || "")}${c.reference_image ? "" : "（无参考卡）"}</p></div>`).join("");
  mountModal(`
    <button type="button" class="modal-close-button" aria-label="关闭">×</button>
    <div class="modal-head">
      <h3>${escapeHtml(data.title || "分镜提示词")}</h3>
      <div class="modal-tags">
        <span class="badge">${escapeHtml(modeLabel)}</span>
        ${data.model ? `<span class="badge">${escapeHtml(data.model)}</span>` : ""}
        ${data.size ? `<span class="badge">${escapeHtml(data.size)}</span>` : ""}
        ${data.duration ? `<span class="badge">${escapeHtml(data.duration)}</span>` : ""}
      </div>
    </div>
    <div class="modal-body">
      ${refs.length ? `<section class="modal-section"><label>参考图（实际喂给模型）</label><div class="ref-grid">${refs.map(refThumb).join("")}</div></section>` : `<section class="modal-section"><p class="muted">本镜暂无可用参考卡，将走纯文字生图。</p></section>`}
      <section class="modal-section"><label>生成提示词（Prompt）</label><pre class="prompt-pre">${escapeHtml(data.prompt || "")}</pre></section>
      ${data.negative_prompt ? `<section class="modal-section"><label>负面提示词</label><pre class="prompt-pre">${escapeHtml(data.negative_prompt)}</pre></section>` : ""}
      ${characters ? `<section class="modal-section"><label>人物背景</label>${characters}</section>` : ""}
      ${contextRows ? `<section class="modal-section"><label>故事 / 视觉背景</label>${contextRows}</section>` : ""}
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
    item.number ? `<span class="badge">第 ${item.number} 集</span>` : "",
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
      <h2>系列设定</h2>
      <div class="form-grid">
        ${input("title", "剧名", series.title)}
        ${input("genre", "类型", series.genre)}
        ${input("platform", "平台/形态", series.platform)}
        ${input("format", "集数/时长", series.format)}
        ${input("tone", "气质", series.tone)}
        ${input("audience", "目标观众", series.audience)}
        ${textarea("logline", "一句话卖点", series.logline)}
        ${textarea("hook_rules", "钩子规则（一行一条）", lines(series.hook_rules))}
        ${textarea("world_rules", "世界规则（一行一条）", lines(series.world_rules))}
      </div>
      <div class="form-actions"><button type="submit">保存系列</button></div>
    </form>`;
}

function detailForm(item) {
  if (!item) return `<div class="detail-card"><h2>选择或新建一项</h2><p class="muted">这里会显示当前视图的编辑表单。</p></div>`;
  if (view === "characters") return characterForm(item);
  if (view === "relationships") return relationshipForm(item);
  if (view === "episodes") return episodeForm(item);
  if (view === "shots") return shotForm(item);
  if (view === "tasks") return taskForm(item);
  return "";
}

function statusSelect(value) {
  return select("status", "状态", value || "draft", ["draft", "needs_review", "changes_requested", "approved", "done", "blocked"]);
}

function characterForm(item) {
  const card = item.character_card || {};
  const visual = item.visual || {};
  const reference = item.reference_card || {};
  const vp = item.voice_profile || {};
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || "新角色")}</h2>
      ${characterReferencePreview(reference)}
      ${characterVoicePreview(item)}
      <div class="form-grid">
        ${input("id", "角色 ID", item.id)}
        ${input("name", "姓名", item.name)}
        ${input("role", "戏剧功能", item.role)}
        ${statusSelect(item.status)}
        ${textarea("actor_profile", "演员/表演设定", item.actor_profile)}
        ${textarea("identity", "身份", card.identity, false)}
        ${textarea("motivation", "欲望", card.motivation, false)}
        ${textarea("wound", "创伤", card.wound, false)}
        ${textarea("secret", "秘密", card.secret, false)}
        ${textarea("arc", "人物弧光", card.arc, false)}
        ${textarea("voice", "台词声音（语气基调）", card.voice, false)}
        ${input("voice_type", "音色", vp.type)}
        ${input("voice_pace", "语速节奏", vp.pace)}
        ${input("voice_accent", "口音 / 官话", vp.accent)}
        ${input("voice_signature", "标志性语气", vp.signature)}
        ${input("voice_casting", "配音参考声线", vp.casting_reference)}
        ${textarea("voice_sample", "试音台词（参考声音脚本）", vp.sample_script, false)}
        ${textarea("front", "三视图：正面", visual.front, false)}
        ${textarea("side", "三视图：侧面", visual.side, false)}
        ${textarea("back", "三视图：背面", visual.back, false)}
        ${textarea("wardrobe", "服装", visual.wardrobe, false)}
        ${textarea("anchors", "一致性锚点（一行一条）", lines(visual.anchors))}
        ${textarea("forbidden_drift", "禁止漂移（一行一条）", lines(visual.forbidden_drift))}
      </div>
      ${formActions()}
    </form>`;
}

function characterReferencePreview(reference) {
  return `
    <section class="character-reference">
      <div>
        <h3>人物资料卡图</h3>
        <p class="muted">${escapeHtml(reference.purpose || "用于后续分镜和视频一致性。")}</p>
      </div>
      ${reference.image_asset ? `<img src="${escapeHtml(reference.image_asset)}" alt="人物资料卡图" />` : `<div class="asset-placeholder">人物资料卡图待生成</div>`}
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
          <h3>人物声音</h3>
          <p class="muted">${escapeHtml(summary || "音色 / 语速 / 口音 / 标志语气（用于配音与对白一致性）")}</p>
        </div>
        <span class="voice-status ${generated ? "ok" : "planned"}">${generated ? "参考声音已生成" : "参考声音：待生成"}</span>
      </div>
      ${vp.casting_reference ? `<p class="voice-line"><span class="mini-label">配音参考</span>${escapeHtml(vp.casting_reference)}</p>` : ""}
      ${vp.sample_script ? `<p class="voice-line"><span class="mini-label">试音台词</span>${escapeHtml(vp.sample_script)}</p>` : ""}
      <div class="voice-ref">
        ${generated
          ? `<audio controls src="${escapeHtml(vr.asset)}"></audio>`
          : `<div class="asset-placeholder">参考声音待生成（Qwen3-TTS 本地）</div>`}
        <button type="button" class="mini-button generate-voice-button" data-generate-voice="${escapeHtml(item.id)}">${generated ? "再生一版" : "生成参考声音"}</button>
      </div>
      ${voiceCandidateStrip(item)}
    </section>`;
}

function voiceCandidateStrip(character) {
  const list = character.voice_candidates || [];
  const active = character.voice_reference?.asset || "";
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list.map((c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-voice-active="${escapeHtml(c.path)}" data-char="${escapeHtml(character.id)}">声${i + 1}${c.path === active ? " ✓" : ""}</button>`).join("")}</div>`;
}

function relationshipForm(item) {
  return `
    <form class="detail-card" data-kind="relationships" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.type || "新关系")}</h2>
      <div class="form-grid">
        ${input("id", "关系 ID", item.id)}
        ${characterSelect("from", "关系起点", item.from)}
        ${characterSelect("to", "关系终点", item.to)}
        ${input("type", "关系类型", item.type)}
        ${input("emotional_temperature", "情感温度", item.emotional_temperature)}
        ${textarea("public_status", "公开关系", item.public_status, false)}
        ${textarea("hidden_truth", "隐藏真相", item.hidden_truth, false)}
        ${textarea("power_dynamic", "权力方向", item.power_dynamic, false)}
        ${textarea("conflict", "当前冲突", item.conflict)}
        ${textarea("evidence", "证据集（一行一条）", lines(item.evidence))}
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
      <h2>第 ${escapeHtml(item.number || "")} 集：${escapeHtml(item.title || "")}</h2>
      <div class="form-grid">
        ${input("id", "剧集 ID", item.id)}
        ${input("number", "集数", item.number || "", "number")}
        ${input("title", "标题", item.title)}
        ${statusSelect(item.status)}
        ${textarea("promise", "本集承诺", item.promise)}
        ${textarea("a_plot", "A 剧情", item.a_plot, false)}
        ${textarea("b_plot", "B 剧情", item.b_plot, false)}
        ${textarea("cliffhanger", "结尾悬念", item.cliffhanger)}
        ${textarea("beats_json", "节拍 JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
      ${formActions()}
    </form>`;
}

function shotForm(item) {
  return `
    <form class="detail-card" data-kind="shots" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "新分镜")}</h2>
      <div class="form-grid">
        ${input("id", "分镜 ID", item.id)}
        ${episodeSelect("episode_id", "所属剧集", item.episode_id)}
        ${input("beat_id", "节拍 ID", item.beat_id)}
        ${input("title", "画面标题", item.title)}
        ${statusSelect(item.status)}
        ${input("duration_seconds", "时长(秒,取4/5/6/8/10/12)", item.duration_seconds)}
        ${input("emotion", "情绪", item.emotion)}
        ${input("shot_size", "景别", item.shot_size)}
        ${input("camera_angle", "机位角度", item.camera_angle)}
        ${input("camera_movement", "运镜", item.camera_movement)}
        ${input("lens", "镜头", item.lens)}
        ${input("transition_in", "入场转场", item.transition_in)}
        ${input("transition_out", "出场转场", item.transition_out)}
        ${textarea("characters", "出场角色 ID（一行一条）", lines(item.characters), false)}
        ${textarea("composition", "构图(静帧)", item.composition, false)}
        ${textarea("camera", "镜头(自由文本)", item.camera, false)}
        ${textarea("setting", "场景", item.setting, false)}
        ${textarea("lighting", "光线", item.lighting, false)}
        ${textarea("action", "动作脚本(运动)", item.action, false)}
        ${textarea("prompt", "生图提示词", item.prompt)}
        ${textarea("video_prompt", "视频运动提示", item.video_prompt)}
        ${textarea("negative_prompt", "负面提示词", item.negative_prompt)}
      </div>
      <p class="form-note">声音设计 (audio)、连续性 (continuity) 与台词 SRT 为结构化字段，保存时自动保留；如需编辑可用 @ai 或直接改 project.json。</p>
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
      <h2>${escapeHtml(item.title || "新任务")}</h2>
      <div class="form-grid">
        ${input("id", "任务 ID", item.id)}
        ${input("kind", "类型", item.kind)}
        ${input("target_id", "目标 ID", item.target_id)}
        ${statusSelect(item.status)}
        ${input("title", "标题", item.title)}
        ${textarea("note", "说明 / @ai 请求", item.note)}
      </div>
      ${formActions()}
    </form>`;
}

function formActions() {
  return `<div class="form-actions"><button type="submit">保存</button><button type="button" class="danger" data-delete>删除</button><span class="muted save-hint">已连接本地 project.json</span></div>`;
}

function bindForm() {
  document.querySelectorAll("[data-go]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: node.dataset.go, selectedId: null, episodeMode: "list", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-select]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ selectedId: node.dataset.select });
    });
  });
  document.querySelectorAll("[data-episode-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: "episodes", selectedId: node.dataset.episodeDetail, episodeMode: "detail", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-row-episode]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
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
      node.textContent = "生成中...";
      try {
        const result = await api("/api/storyboard-image", { shot_id: shotId });
        state = result.state || await api("/api/state");
        toast("分镜图已生成");
        render();
      } catch (error) {
        toast(error.message || "生成失败");
        node.disabled = false;
        node.textContent = "生成分镜图";
      }
    });
  });
  document.querySelectorAll("[data-generate-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateVideo;
      node.disabled = true;
      node.textContent = "生成中(本地LTX,较慢)...";
      try {
        const result = await api("/api/shot-video", { shot_id: shotId, mode: "draft" });
        state = result.state || await api("/api/state");
        toast("草稿视频已生成");
        render();
      } catch (error) {
        toast(error.message || "草稿视频生成失败");
        node.disabled = false;
        node.textContent = "生成草稿视频";
      }
    });
  });
  document.querySelectorAll("[data-generate-voice]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.dataset.generateVoice;
      node.disabled = true;
      node.textContent = "生成中(本地TTS)...";
      try {
        const result = await api("/api/character-voice", { character_id: id });
        state = result.state || await api("/api/state");
        toast("参考声音已生成");
        render();
      } catch (error) {
        toast(error.message || "语音生成失败");
        node.disabled = false;
        node.textContent = "生成参考声音";
      }
    });
  });
  document.querySelectorAll("[data-set-voice-active]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/character-voice-active", { character_id: node.dataset.char, path: node.dataset.setVoiceActive });
        toast("已设为选用声音");
        render();
      } catch (error) { toast(error.message || "切换失败"); }
    });
  });
  document.querySelectorAll("[data-set-active-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/shot-active", { shot_id: node.dataset.shot, kind: "image", path: node.dataset.setActiveImage });
        toast("已设为选用图");
        render();
      } catch (error) { toast(error.message || "切换失败"); }
    });
  });
  document.querySelectorAll("[data-set-active-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        state = await api("/api/shot-active", { shot_id: node.dataset.shot, kind: "video", path: node.dataset.setActiveVideo });
        toast("已设为选用视频");
        render();
      } catch (error) { toast(error.message || "切换失败"); }
    });
  });
  document.querySelectorAll("[data-prompt-preview]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        const data = await api(`/api/storyboard-prompt?shot_id=${encodeURIComponent(node.dataset.promptPreview)}`);
        openPromptModal(data);
      } catch (error) {
        toast(error.message || "无法加载提示词");
      }
    });
  });
  document.querySelectorAll("[data-image-zoom]").forEach((node) => {
    node.addEventListener("click", () => openImageModal(node.dataset.imageZoom));
  });
  const form = document.querySelector("form.detail-card");
  if (!form) return;
  form.addEventListener("input", () => {
    form.classList.add("is-dirty");
    const hint = form.querySelector(".save-hint");
    if (hint) hint.textContent = "有未保存修改";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveForm(form);
  });
  const deleteButton = form.querySelector("[data-delete]");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!confirm("确定删除这一项？")) return;
      const kind = form.dataset.kind;
      const id = form.dataset.id;
      state = await api(`/api/${kind}/${encodeURIComponent(id)}`, { delete: true });
      selectedId = null;
      toast("已删除");
      render();
    });
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
  toast("已保存");
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
      throw new Error("节拍 JSON 格式不正确");
    }
    return {
      ...base,
      number: Number.parseInt(value(form, "number"), 10) || 0,
      title: value(form, "title"),
      status: value(form, "status"),
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
    characters: { id: `char-new-${timestamp}`, name: "新角色", role: "helper", status: "draft", character_card: {}, visual: { anchors: [], forbidden_drift: [] } },
    relationships: { id: `rel-new-${timestamp}`, from: project().characters?.[0]?.id || "", to: project().characters?.[1]?.id || "", type: "new relationship", evidence: [] },
    episodes: { id: `ep-new-${timestamp}`, number: (project().episodes?.length || 0) + 1, title: "新一集", status: "draft", beats: [] },
    shots: { id: `shot-new-${timestamp}`, episode_id: project().episodes?.[0]?.id || "", title: "新分镜", status: "draft", characters: [] },
    tasks: { id: `task-new-${timestamp}`, kind: "episode", status: "needs_review", title: "新任务", note: "" },
  };
  const item = templates[view];
  selectedId = item.id;
  state.project[view].push(item);
  navigateTo({ selectedId: item.id, episodeMode: view === "episodes" ? "detail" : episodeMode, episodeTab: "summary" });
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
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
  toast(`已切换到《${option?.textContent || "当前短剧"}》`);
  navigateTo({ view: "overview", selectedId: null, episodeMode: "list", episodeTab: "summary" }, { replace: true });
});

$("newItemButton").addEventListener("click", newItem);
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

load().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
