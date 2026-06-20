import { MESSAGES, resolveLang } from "/i18n/messages.js";

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------
const state = {
  data: null,
  imageConfig: null,
  songConfig: null,
  view: "concept",
  selectedId: null,
  search: "",
  lang: localStorage.getItem("kmv_lang") || "auto",
  toast: null,
};

const VIEWS = ["concept", "song", "cast", "storyboard"];
const DURATIONS = [4, 5, 6, 8, 10, 12];
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-mv.sidebarCollapsed";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function lang() { return resolveLang(state.lang); }
function t(key) { const l = lang(); return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key; }
function secs(n) {
  const v = Math.round(Number(n) || 0);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
function project() { return state.data?.project || {}; }

function isMobileLayout() { return window.matchMedia("(max-width: 720px)").matches; }
function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  document.getElementById("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}
function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}
function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
}
function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(state.selectedId) && !["concept", "song"].includes(state.view));
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

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}
async function post(path, body) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
}
function applyState(payload) {
  state.data = payload.state || payload;
  render();
}
function toast(message, kind = "ok") {
  state.toast = { message, kind };
  render();
  setTimeout(() => { if (state.toast?.message === message) { state.toast = null; render(); } }, 4200);
}

// File pickers / readers for uploads.
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function audioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { resolve(audio.duration || 0); URL.revokeObjectURL(audio.src); };
    audio.onerror = () => resolve(0);
    audio.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Routing (hash: #/view or #/view/id)
// ---------------------------------------------------------------------------
function parseHash() {
  const raw = (location.hash || "#/concept").replace(/^#\/?/, "");
  const [view, id] = raw.split("/");
  state.view = VIEWS.includes(view) ? view : "concept";
  state.selectedId = id ? decodeURIComponent(id) : null;
}
function go(view, id, replace = false) {
  const hash = id ? `#/${view}/${encodeURIComponent(id)}` : `#/${view}`;
  if (replace) history.replaceState(null, "", hash);
  else location.hash = hash;
  parseHash();
  render();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  parseHash();
  syncResponsiveShell();
  wireChrome();
  await Promise.all([refresh(), loadImageConfig(), loadSongConfig()]);
  setInterval(pollLock, 5000);
}
async function refresh() {
  try { state.data = await api("/api/state"); render(); } catch (e) { console.error(e); }
}
async function pollLock() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
  await refresh();
}
async function loadImageConfig() { try { state.imageConfig = await api("/api/image-config"); } catch {} }
async function loadSongConfig() { try { state.songConfig = await api("/api/song-config"); } catch {} }

window.addEventListener("hashchange", () => { parseHash(); render(); });

// ---------------------------------------------------------------------------
// Chrome wiring
// ---------------------------------------------------------------------------
function wireChrome() {
  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      go(btn.dataset.view);
    }
  });
  document.getElementById("nextStepButton").addEventListener("click", () => routeNextStep());
  document.getElementById("newItemButton").addEventListener("click", () => onNewItem());
  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
  document.getElementById("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
  document.getElementById("backToList").addEventListener("click", () => setMobileDetailOpen(false));
  window.addEventListener("resize", syncResponsiveShell);
  document.getElementById("searchInput").addEventListener("input", (e) => { state.search = e.target.value; renderList(); });
  document.getElementById("projectSelect").addEventListener("change", async (e) => {
    try { applyState(await post("/api/active-project", { project_id: e.target.value })); } catch (err) { toast(err.message, "danger"); }
  });
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsButton").addEventListener("click", () => openSettings());
  document.getElementById("closeSettings").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  document.querySelector(".modal-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-settings-tab]");
    if (!btn) return;
    document.querySelectorAll(".modal-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".settings-panel").forEach((p) => p.classList.toggle("active", p.dataset.settingsPanel === btn.dataset.settingsTab));
  });
  const langSel = document.getElementById("languageSelect");
  langSel.value = state.lang;
  langSel.addEventListener("change", (e) => {
    state.lang = e.target.value;
    localStorage.setItem("kmv_lang", state.lang);
    applyChrome();
    render();
  });
  applyChrome();
}

function applyChrome() {
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
}

const VIEW_TITLES = {
  concept: ["nav_concept", "一句话讲清这支 MV"],
  song: ["nav_song", "上传一首 MP3，MV 就围着它做"],
  cast: ["nav_cast", "出镜角色与参考卡"],
  storyboard: ["nav_storyboard", "画面描述 + 上图 / 上视频"],
};

function render() {
  if (!state.data) return;
  syncSidebar();
  const [titleKey, subtitle] = VIEW_TITLES[state.view];
  document.getElementById("viewTitle").textContent = t(titleKey);
  document.getElementById("viewSubtitle").textContent = subtitle;
  document.getElementById("lockBanner").classList.toggle("hidden", !state.data.lock?.locked);
  document.getElementById("newItemButton").style.visibility = (state.view === "cast" || state.view === "storyboard") ? "visible" : "hidden";
  renderToast();
  renderList();
  renderDetail();
}

function syncSidebar() {
  const data = state.data;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  const song = project().song || {};
  document.getElementById("projectTitle").textContent = song.title || "未命名 MV";
  document.getElementById("projectMeta").textContent = [song.artist, song.duration_seconds ? secs(song.duration_seconds) : ""].filter(Boolean).join(" · ") || "本地音乐视频项目";
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = (data.projects || []).map((p) => `<option value="${esc(p.id)}" ${p.id === data.active_project_id ? "selected" : ""}>${esc(p.title || p.id)}</option>`).join("");
  document.getElementById("nextStepLabel").textContent = t(`step_${data.next_step || "review"}`);
}

function renderToast() {
  let node = document.getElementById("kmvToast");
  if (!state.toast) { if (node) node.remove(); return; }
  if (!node) { node = document.createElement("div"); node.id = "kmvToast"; document.body.appendChild(node); }
  node.className = `toast ${state.toast.kind}`;
  node.textContent = state.toast.message;
}

function routeNextStep() {
  const map = {
    upload_song: "song", set_concept: "concept", add_cast: "cast", generate_cast_refs: "cast",
    add_shots: "storyboard", fill_shot_images: "storyboard", fill_shot_videos: "storyboard", review: "concept",
  };
  go(map[state.data?.next_step] || "concept");
}
function onNewItem() {
  if (state.view === "cast") return newCharacter();
  if (state.view === "storyboard") return newShot();
}

// ---------------------------------------------------------------------------
// LIST panel
// ---------------------------------------------------------------------------
function statusClass(status) {
  return { approved: "status-approved", needs_review: "status-needs", blocked: "status-blocked" }[status] || "status-draft";
}
function matchSearch(item) {
  if (!state.search) return true;
  return JSON.stringify(item).toLowerCase().includes(state.search.toLowerCase());
}

function renderList() {
  const host = document.getElementById("list");
  const countPill = document.getElementById("itemCount");
  const renderers = { concept: listConcept, song: listSong, cast: listCast, storyboard: listStoryboard };
  const { html, count } = renderers[state.view]();
  host.innerHTML = html;
  countPill.textContent = count;
  host.querySelectorAll("[data-select]").forEach((node) => node.addEventListener("click", () => {
    if (isMobileLayout()) setMobileDetailOpen(true);
    go(state.view, node.dataset.select, true);
  }));
  host.querySelectorAll("[data-jump]").forEach((node) => node.addEventListener("click", () => {
    setMobileDetailOpen(false);
    go(node.dataset.jump);
  }));
}

function listConcept() {
  const c = state.data.completeness || {};
  const song = project().song || {};
  const rows = [
    ["song", "Song（MP3）", c.song_ready ? `已上传 · ${secs(song.duration_seconds)}` : "未上传", c.song_ready],
    ["concept", "概括", c.concept_ready ? "已填写" : "待填写", c.concept_ready],
    ["cast", "角色参考卡", `${(project().characters || []).length} 个 · 缺卡 ${c.characters_missing_refs ?? 0}`, c.characters_missing_refs === 0 && (project().characters || []).length > 0],
    ["storyboard", "分镜", `${(project().shots || []).length} 个 · 缺图 ${c.shots_missing_image ?? 0} · 缺视频 ${c.shots_missing_video ?? 0}`, (project().shots || []).length > 0 && c.shots_missing_video === 0],
  ];
  const html = rows.map(([view, label, sub, ok]) => `
    <div class="item-card" data-jump="${view}">
      <span class="ready-chip ${ok ? "ok" : "planned"}">${ok ? "✓" : "…"}</span>
      <div class="row-main"><div class="row-key">${esc(label)}</div><div class="table-sub">${esc(sub)}</div></div>
      <span class="row-arrow">›</span>
    </div>`).join("");
  return { html, count: `${rows.filter((r) => r[3]).length}/${rows.length}` };
}

function listSong() {
  const song = project().song || {};
  const html = song.audio_asset?.startsWith("/generated/")
    ? `<div class="item-card"><div class="row-main"><div class="row-key">${esc(song.title || "歌曲")}</div><div class="table-sub">${esc(song.artist || "")} · ${secs(song.duration_seconds)}</div></div><span class="badge ok">已上传</span></div>`
    : `<div class="empty-shot">还没有歌曲。点右侧「上传 MP3」。</div>`;
  return { html, count: song.audio_asset ? 1 : 0 };
}

function listCast() {
  const items = (project().characters || []).filter(matchSearch);
  const html = items.length ? items.map((c) => {
    const thumb = c.reference_card?.image_asset?.startsWith("/generated/")
      ? `<img class="item-card-thumb" src="${esc(c.reference_card.image_asset)}" alt="" />`
      : `<div class="item-card-thumb thumb-empty">无卡</div>`;
    return `
      <div class="item-card ${c.id === state.selectedId ? "active" : ""}" data-select="${esc(c.id)}">
        ${thumb}
        <div class="row-main"><div class="row-key">${esc(c.name)}</div><div class="table-sub">${esc(c.role || "")}</div></div>
        <span class="badge ${statusClass(c.status)}">${esc(c.status || "draft")}</span>
      </div>`;
  }).join("") : `<div class="empty-shot">还没有角色。点右上角 + 新建。</div>`;
  return { html, count: items.length };
}

function listStoryboard() {
  const shots = (project().shots || []).filter(matchSearch);
  const c = state.data.completeness || {};
  const song = project().song || {};
  const hint = `<div class="mv-timeline-meta">分镜 ${(project().shots || []).length} 个 · 总时长 ${secs(c.shots_total_seconds)}${song.duration_seconds ? ` / 歌曲 ${secs(song.duration_seconds)}` : ""}</div>`;
  let html = hint;
  if (!shots.length) { html += `<div class="empty-shot">还没有分镜。点右上角 + 新建分镜，写画面描述、上图或上视频。</div>`; return { html, count: 0 }; }
  html += shots.map((shot, i) => {
    const thumb = shot.image_asset?.startsWith("/generated/")
      ? `<img class="shot-row-thumb" src="${esc(shot.image_asset)}" alt="" />`
      : `<div class="shot-row-thumb thumb-empty">无图</div>`;
    const hasVideo = shot.video_asset?.startsWith("/generated/");
    return `
      <div class="shot-row ${shot.id === state.selectedId ? "active" : ""}" data-select="${esc(shot.id)}">
        <span class="shot-row-no">${i + 1}</span>
        ${thumb}
        <div class="shot-row-main">
          <div class="row-key">${esc(shot.title || shot.id)}</div>
          <div class="shot-row-meta">
            <span class="table-sub">${shot.duration_seconds || "?"}s</span>
            ${shot.image_asset?.startsWith("/generated/") ? `<span class="badge soft">图</span>` : ""}
            ${hasVideo ? `<span class="badge status-done">视频</span>` : ""}
          </div>
        </div>
        <span class="row-arrow">›</span>
      </div>`;
  }).join("");
  return { html, count: (project().shots || []).length };
}

// ---------------------------------------------------------------------------
// DETAIL panel
// ---------------------------------------------------------------------------
function renderDetail() {
  const host = document.getElementById("detail");
  const renderers = { concept: detailConcept, song: detailSong, cast: detailCast, storyboard: detailStoryboard };
  host.innerHTML = renderers[state.view]();
  bindDetail(host);
}

function field(label, name, value, opts = {}) {
  const { textarea, type = "text", placeholder = "", full } = opts;
  const control = textarea
    ? `<textarea data-field="${name}" rows="${opts.rows || 3}" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>`
    : `<input data-field="${name}" type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" />`;
  return `<label class="field ${full ? "full" : ""}"><span>${esc(label)}</span>${control}</label>`;
}
function selectField(label, name, value, options, opts = {}) {
  const opts2 = options.map((o) => `<option value="${esc(o)}" ${String(o) === String(value) ? "selected" : ""}>${esc(o)}</option>`).join("");
  return `<label class="field ${opts.full ? "full" : ""}"><span>${esc(label)}</span><select data-field="${name}">${opts2}</select></label>`;
}
function collect(scope) {
  const out = {};
  scope.querySelectorAll("[data-field]").forEach((node) => { out[node.dataset.field] = node.value; });
  return out;
}
function listToArray(value) { return String(value || "").split(/[\n,，、]/).map((s) => s.trim()).filter(Boolean); }

function detailConcept() {
  const c = project().treatment || {};
  return `
    <div class="detail-card">
      <div class="detail-head"><h3>MV 概括</h3></div>
      <div class="form-grid" id="conceptForm">
        ${field("一句话概括（这支 MV 讲什么、什么调性）", "summary", c.summary || c.concept, { textarea: true, rows: 4, full: true, placeholder: "例：深夜城市独行，霓虹与雨，孤独到释然。" })}
        ${field("视觉风格（一句话）", "look", c.look || c.realism_target, { full: true, placeholder: "例：写实电影感 / 古风水墨 / 赛博霓虹" })}
        ${field("画幅", "aspect_ratio", c.aspect_ratio || "16:9")}
      </div>
      <div class="form-actions"><button class="mini-button" id="conceptSave">保存概括</button></div>
    </div>
    <div class="detail-card">
      <div class="detail-head"><h3>怎么用</h3></div>
      <p class="muted">① Song 上传 MP3 → ② 概括写清调性 → ③ 角色生成参考卡 → ④ 分镜里写画面描述，逐镜「生成」或「上传」图与视频。纯画面 MV，最终把分镜画面剪到歌上。</p>
    </div>`;
}

function detailSong() {
  const s = project().song || {};
  const has = s.audio_asset?.startsWith("/generated/");
  return `
    <div class="detail-card">
      <div class="detail-head"><h3>Song</h3>${s.source ? `<span class="badge soft">${esc(s.source)}</span>` : ""}</div>
      ${has ? `<audio controls src="${esc(s.audio_asset)}" style="width:100%"></audio>` : `<div class="asset-placeholder">还没有歌曲，点下面上传一首 MP3</div>`}
      <div class="form-actions"><button class="generate-image-button" id="songUpload">${has ? "换一首 MP3" : "上传 MP3"}</button></div>
      <div class="form-grid">
        ${field("歌名", "title", s.title)}
        ${field("歌手 / 艺人（可选）", "artist", s.artist)}
      </div>
      <div class="form-actions"><button class="mini-button" id="songSave">保存信息</button></div>
      <p class="muted">${has ? `时长 ${secs(s.duration_seconds)}，自动识别。` : "选一首现成的 MP3 即可，时长会自动识别。"}</p>
    </div>`;
}

function detailCast() {
  const c = (project().characters || []).find((x) => x.id === state.selectedId);
  if (!c) return `<div class="detail-card"><p class="muted">选择左侧角色，或点右上角 + 新建。</p></div>`;
  const v = c.visual || {};
  const card = c.reference_card || {};
  const hasRef = card.image_asset?.startsWith("/generated/");
  return `
    <div class="detail-card" data-character="${esc(c.id)}">
      <div class="detail-head"><h3>${esc(c.name)}</h3><span class="badge ${statusClass(c.status)}">${esc(c.status || "draft")}</span></div>
      ${hasRef ? `<img class="character-reference" src="${esc(card.image_asset)}" alt="" />` : `<div class="asset-placeholder">未生成参考卡</div>`}
      <div class="form-grid">
        ${field("名字", "name", c.name)}
        ${field("角色定位", "role", c.role)}
        ${selectField("状态", "status", c.status || "draft", ["draft", "needs_review", "approved", "blocked"])}
        ${field("形象说明", "actor_profile", c.actor_profile, { textarea: true, rows: 2, full: true })}
        ${field("正面", "front", v.front, { full: true })}
        ${field("侧面", "side", v.side, { full: true })}
        ${field("背面", "back", v.back, { full: true })}
        ${field("服装", "wardrobe", v.wardrobe, { full: true })}
        ${field("一致性锚点（逗号分隔）", "anchors", (v.anchors || []).join("、"), { full: true })}
        ${field("禁止漂移（逗号分隔）", "forbidden_drift", (v.forbidden_drift || []).join("、"), { full: true })}
        ${field("参考卡提示词", "ref_prompt", card.prompt, { textarea: true, rows: 4, full: true })}
      </div>
      <div class="form-actions">
        <button class="mini-button" id="castSave">保存角色</button>
        <button class="generate-image-button" id="castGenRef">生成参考卡</button>
        <button class="mini-button danger" id="castDelete">删除</button>
      </div>
    </div>`;
}

function assetMode(gen) {
  if (!gen) return "";
  if (gen.mode === "upload") return `<span class="img-mode-badge">已上传</span>`;
  if (gen.mode === "image-edit") return `<span class="img-mode-badge">图生图·参考角色卡</span>`;
  if (gen.mode === "text-to-image") return `<span class="img-mode-badge">文字生图</span>`;
  if (gen.mode === "draft") return `<span class="img-mode-badge">草稿·LTX 本地</span>`;
  return "";
}

function detailStoryboard() {
  const shot = (project().shots || []).find((x) => x.id === state.selectedId);
  if (!shot) return `<div class="detail-card"><p class="muted">选择左侧分镜，或点右上角 + 新建分镜。</p></div>`;
  const chars = project().characters || [];
  const charChecks = chars.map((c) => `<label class="cand-chip"><input type="checkbox" data-char="${esc(c.id)}" ${(shot.characters || []).includes(c.id) ? "checked" : ""}/> ${esc(c.name)}</label>`).join("");
  const refChars = chars.filter((c) => (shot.characters || []).includes(c.id));
  const refReady = refChars.filter((c) => c.reference_card?.image_asset?.startsWith("/generated/")).length;

  const candStrip = (cands, activePath, kind) => cands.length ? `<div class="cand-strip">${cands.map((cd) => `
    <div class="cand-thumb ${cd.path === activePath ? "active" : ""}">
      ${kind === "video" ? `<video src="${esc(cd.path)}" muted></video>` : `<img src="${esc(cd.path)}" data-img-active="${esc(cd.path)}" alt="" />`}
      ${cd.path === activePath ? `<span class="cand-pick">选用</span>` : `<button class="cand-pick" data-${kind === "video" ? "vid" : "img"}-active="${esc(cd.path)}">设为选用</button>`}
    </div>`).join("")}</div>` : "";

  return `
    <div class="detail-card shot-sheet" data-shot="${esc(shot.id)}">
      <div class="detail-head"><h3>${esc(shot.title || shot.id)}</h3><span class="badge soft">${shot.duration_seconds || "?"}s</span></div>

      <div class="section-label">画面（图）</div>
      ${shot.image_asset?.startsWith("/generated/") ? `<div class="storyboard-actions"><img class="storyboard-image" src="${esc(shot.image_asset)}" alt="" />${assetMode(shot.image_generation)}</div>` : `<div class="asset-placeholder">还没有画面，下面可「生成」或「上传」</div>`}
      ${candStrip(shot.image_candidates || [], shot.image_asset, "image")}
      ${refChars.length ? `<p class="form-note">基于角色生图：${refReady}/${refChars.length} 个出镜角色已有参考卡。${refReady < refChars.length ? "缺卡的会走文字生图、一致性漂移——先去「角色」生成参考卡。" : ""}</p>` : ""}
      <div class="form-actions">
        <button class="generate-image-button" id="shotGenImg">生成画面</button>
        <button class="mini-button" id="shotUploadImg">上传图片</button>
        <button class="mini-button ghost" id="shotPromptPreview">查看提示词</button>
      </div>

      <div class="section-label">画面（视频）</div>
      ${shot.video_asset?.startsWith("/generated/") ? `<div class="storyboard-actions"><video class="shot-video" src="${esc(shot.video_asset)}" controls preload="metadata" playsinline></video>${assetMode(shot.video_generation)}</div>` : `<div class="asset-placeholder">还没有视频，可「生成草稿」或「上传」</div>`}
      ${candStrip(shot.video_candidates || [], shot.video_asset, "video")}
      <div class="form-actions">
        <button class="mini-button ghost" id="shotGenVid">生成草稿视频（本地 LTX）</button>
        <button class="mini-button" id="shotUploadVid">上传视频</button>
      </div>

      <div class="section-label">画面描述</div>
      <div class="form-grid">
        ${field("标题", "title", shot.title)}
        ${selectField("时长（秒）", "duration_seconds", shot.duration_seconds || 8, DURATIONS)}
        ${field("画面描述（这一镜里看到什么 / 在动什么 —— 也是生图提示）", "description", shot.description || [shot.composition, shot.action].filter(Boolean).join("。"), { textarea: true, rows: 4, full: true })}
        ${field("不要出现（负面提示，可选）", "negative_prompt", shot.negative_prompt, { textarea: true, rows: 2, full: true })}
        ${field("运动提示（图生视频用，可选）", "video_prompt", shot.video_prompt, { full: true })}
      </div>
      <div class="section-label">出镜角色</div>
      <div class="cand-chips" id="shotChars">${charChecks || `<span class="muted">先在「角色」里添加</span>`}</div>
      <div class="form-actions">
        <button class="mini-button" id="shotSave">保存分镜</button>
        <button class="mini-button danger" id="shotDelete">删除</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// DETAIL actions
// ---------------------------------------------------------------------------
function bindDetail(host) {
  const on = (id, fn) => { const n = host.querySelector(`#${id}`); if (n) n.addEventListener("click", fn); };

  // Concept
  on("conceptSave", async () => {
    const f = collect(host.querySelector("#conceptForm"));
    try { applyState(await post("/api/treatment", { treatment: { ...project().treatment, ...f } })); toast("已保存概括"); }
    catch (e) { toast(e.message, "danger"); }
  });

  // Song
  on("songUpload", async (e) => {
    const file = await pickFile("audio/*");
    if (!file) return;
    e.target.disabled = true; e.target.textContent = "上传中…";
    try {
      const [data_base64, duration_seconds] = await Promise.all([fileToBase64(file), audioDuration(file)]);
      applyState(await post("/api/song-upload", { filename: file.name, data_base64, duration_seconds, title: project().song?.title || file.name.replace(/\.[^.]+$/, "") }));
      toast("已上传歌曲");
    } catch (err) { toast(err.message, "danger"); render(); }
  });
  on("songSave", async () => {
    const f = collect(host.querySelector(".detail-card"));
    try { applyState(await post("/api/song", { title: f.title, artist: f.artist })); toast("已保存"); }
    catch (e) { toast(e.message, "danger"); }
  });

  // Cast
  on("castSave", async () => {
    const card = host.querySelector("[data-character]");
    const f = collect(card);
    const existing = (project().characters || []).find((x) => x.id === state.selectedId) || {};
    const payload = {
      id: state.selectedId, name: f.name, role: f.role, status: f.status, actor_profile: f.actor_profile,
      character_card: existing.character_card || {},
      visual: { ...(existing.visual || {}), front: f.front, side: f.side, back: f.back, wardrobe: f.wardrobe, anchors: listToArray(f.anchors), forbidden_drift: listToArray(f.forbidden_drift) },
      reference_card: { ...(existing.reference_card || {}), prompt: f.ref_prompt },
    };
    try { applyState(await post(`/api/characters/${encodeURIComponent(state.selectedId)}`, payload)); toast("已保存角色"); }
    catch (e) { toast(e.message, "danger"); }
  });
  on("castGenRef", async (e) => {
    e.target.disabled = true; e.target.textContent = "生成中…";
    try { applyState(await post("/api/character-card-image", { character_id: state.selectedId })); toast("已生成参考卡"); }
    catch (err) { toast(err.message, "danger"); render(); }
  });
  on("castDelete", async () => {
    if (!confirm("删除该角色？")) return;
    try { applyState(await post(`/api/characters/${encodeURIComponent(state.selectedId)}`, { delete: true })); state.selectedId = null; toast("已删除"); }
    catch (e) { toast(e.message, "danger"); }
  });

  // Shot
  on("shotSave", () => saveShot(host));
  on("shotGenImg", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true; e.target.textContent = "生成中…";
    try { applyState(await post("/api/storyboard-image", { shot_id: state.selectedId })); toast("已生成画面"); }
    catch (err) { toast(err.message, "danger"); render(); }
  });
  on("shotUploadImg", () => uploadShotAsset(host, "image"));
  on("shotGenVid", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true; e.target.textContent = "生成中…";
    try { applyState(await post("/api/shot-video", { shot_id: state.selectedId, mode: "draft" })); toast("已生成草稿视频"); }
    catch (err) { toast(err.message, "danger"); render(); }
  });
  on("shotUploadVid", () => uploadShotAsset(host, "video"));
  on("shotPromptPreview", async () => { await saveShot(host, true); openPromptPreview(state.selectedId); });
  on("shotDelete", async () => {
    if (!confirm("删除该分镜？")) return;
    try { applyState(await post(`/api/shots/${encodeURIComponent(state.selectedId)}`, { delete: true })); state.selectedId = null; toast("已删除"); }
    catch (e) { toast(e.message, "danger"); }
  });
  host.querySelectorAll("[data-img-active]").forEach((n) => n.addEventListener("click", async () => {
    try { applyState(await post("/api/shot-active", { shot_id: state.selectedId, kind: "image", path: n.dataset.imgActive })); } catch (e) { toast(e.message, "danger"); }
  }));
  host.querySelectorAll("[data-vid-active]").forEach((n) => n.addEventListener("click", async () => {
    try { applyState(await post("/api/shot-active", { shot_id: state.selectedId, kind: "video", path: n.dataset.vidActive })); } catch (e) { toast(e.message, "danger"); }
  }));
}

async function uploadShotAsset(host, kind) {
  await saveShot(host, true);
  const file = await pickFile(kind === "video" ? "video/*" : "image/*");
  if (!file) return;
  try {
    const data_base64 = await fileToBase64(file);
    applyState(await post("/api/shot-asset-upload", { shot_id: state.selectedId, kind, filename: file.name, data_base64 }));
    toast(kind === "video" ? "已上传视频" : "已上传图片");
  } catch (e) { toast(e.message, "danger"); }
}

async function saveShot(host, silent = false) {
  const card = host.querySelector("[data-shot]");
  if (!card) return;
  const f = collect(card);
  const existing = (project().shots || []).find((x) => x.id === state.selectedId) || {};
  const characters = [...host.querySelectorAll("#shotChars input[data-char]:checked")].map((n) => n.dataset.char);
  const payload = {
    ...existing, id: state.selectedId,
    title: f.title, duration_seconds: Number(f.duration_seconds) || 8,
    description: f.description, negative_prompt: f.negative_prompt, video_prompt: f.video_prompt,
    characters,
  };
  try {
    const res = await post(`/api/shots/${encodeURIComponent(state.selectedId)}`, payload);
    if (!silent) { applyState(res); toast("已保存分镜"); } else state.data = res.state || res;
  } catch (e) { toast(e.message, "danger"); }
}

async function newCharacter() {
  const id = `char-${Date.now()}`;
  try { applyState(await post(`/api/characters/${id}`, { id, name: "新角色", role: "", status: "draft", visual: { front: "", side: "", back: "" }, reference_card: { status: "ready_to_generate", prompt: "" } })); go("cast", id); }
  catch (e) { toast(e.message, "danger"); }
}
async function newShot() {
  const id = `shot-${Date.now()}`;
  try { applyState(await post(`/api/shots/${id}`, { id, title: "新分镜", description: "", duration_seconds: 8, characters: [] })); go("storyboard", id); }
  catch (e) { toast(e.message, "danger"); }
}

// ---------------------------------------------------------------------------
// Prompt preview — shows what the image model receives + the character cards fed in
// ---------------------------------------------------------------------------
async function openPromptPreview(shotId) {
  let data;
  try { data = await api(`/api/storyboard-prompt?shot_id=${encodeURIComponent(shotId)}`); } catch (e) { return toast(e.message, "danger"); }
  const refs = data.references || [];
  const chars = data.characters || [];
  const modeLabel = data.mode === "image-edit" ? "图生图（把角色参考卡当像素喂给模型）" : "纯文字生图（无参考卡，一致性会漂移）";
  const node = document.createElement("div");
  node.className = "modal-backdrop";
  node.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><div class="modal-title">生图预览</div><div class="modal-subtitle">${esc(data.title || shotId)} · ${esc(modeLabel)}</div></div><button class="modal-close" id="promptClose">关闭</button></div>
      <div class="modal-body">
        ${chars.length ? `<section class="modal-section"><label>出镜角色</label>${chars.map((c) => `<div class="ctx-row"><span>${esc(c.name)}</span><p>${esc(c.visual_front || "")}${c.reference_image ? "" : "（无参考卡，将漂移）"}</p></div>`).join("")}</section>` : ""}
        ${refs.length ? `<section class="modal-section"><label>实际喂给模型的参考图</label><div class="ref-grid">${refs.map((r) => `<figure><img class="ref-thumb" src="${esc(r.path)}" alt="" /><figcaption>${esc(r.name || r.kind)}</figcaption></figure>`).join("")}</div></section>` : `<section class="modal-section"><p class="muted">本镜暂无参考卡，将走纯文字生图。先在「角色」生成参考卡能显著提升一致性。</p></section>`}
        <section class="modal-section"><label>生成提示词</label><pre class="prompt-pre">${esc(data.prompt || "")}</pre></section>
        ${data.negative_prompt ? `<section class="modal-section"><label>负面提示词</label><pre class="prompt-pre">${esc(data.negative_prompt)}</pre></section>` : ""}
      </div>
    </section>`;
  document.body.appendChild(node);
  const close = () => node.remove();
  node.querySelector("#promptClose").addEventListener("click", close);
  node.addEventListener("click", (e) => { if (e.target === node) close(); });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function openSettings() {
  document.getElementById("settingsModal").classList.remove("hidden");
  document.getElementById("projectPath").textContent = state.data?.paths?.project_path || "";
  const ic = state.imageConfig || {};
  document.getElementById("imageSettingsMount").innerHTML = `
    <div class="image-config">
      <label class="field"><span>Base URL</span><input id="imgBase" value="${esc(ic.base_url || "")}" /></label>
      <label class="field"><span>Model</span><input id="imgModel" value="${esc(ic.model || "")}" /></label>
      <label class="field"><span>Size</span><input id="imgSize" value="${esc(ic.size || "")}" /></label>
      <label class="field"><span>API Key ${ic.has_api_key ? `（已配置 ${esc(ic.api_key_preview)}）` : "（未配置）"}</span><input id="imgKey" type="password" placeholder="留空保持不变" /></label>
      <div class="form-actions"><button class="mini-button" id="imgSave">保存</button></div>
    </div>`;
  document.getElementById("imgSave").addEventListener("click", async () => {
    const body = { base_url: document.getElementById("imgBase").value, model: document.getElementById("imgModel").value, size: document.getElementById("imgSize").value, api_key: document.getElementById("imgKey").value || "__KEEP__" };
    try { state.imageConfig = await post("/api/image-config", body); openSettings(); toast("已保存图像配置"); } catch (e) { toast(e.message, "danger"); }
  });
  const sc = state.songConfig || {};
  document.getElementById("songSettingsMount").innerHTML = `
    <div class="settings-row"><span>草稿后端</span><code>${esc(sc.draft_backend || "songgeneration-v2-mlx")}</code></div>
    <div class="settings-row"><span>状态</span><code>${sc.draft_ready ? "就绪" : "未接入（仅占位）"}</code></div>
    <p class="muted">创歌为后续能力，当前请直接上传 MP3。</p>`;
}

boot();
