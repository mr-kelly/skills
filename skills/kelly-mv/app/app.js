import { MESSAGES, resolveLang } from "/i18n/messages.js";
import { newCharacter, newShot, renderDetail, renderList } from "./js/workspace-views.js";

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------
// Demo mode: `/?demo=<scene>&lang=en|zh` shows deterministic mock data.
const PAGE_QUERY = new URLSearchParams(window.location.search);
const DEMO_SCENARIO = PAGE_QUERY.get("demo") || "";
const URL_LANG = PAGE_QUERY.get("lang") || "";

export const state = {
  data: null,
  imageConfig: null,
  songConfig: null,
  view: "concept",
  selectedId: null,
  search: "",
  lang: URL_LANG || localStorage.getItem("kmv_lang") || "auto",
  toast: null,
};

const VIEWS = ["concept", "song", "cast", "storyboard"];
export const DURATIONS = [4, 5, 6, 8, 10, 12];
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-mv.sidebarCollapsed";

export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function lang() {
  return resolveLang(state.lang);
}
export function t(key) {
  const l = lang();
  return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key;
}
export function secs(n) {
  const v = Math.round(Number(n) || 0);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
export function project() {
  return state.data?.project || {};
}

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}
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
export function setMobileDetailOpen(open) {
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

function withDemoParams(path) {
  if (!DEMO_SCENARIO) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("demo", DEMO_SCENARIO);
  if (URL_LANG) url.searchParams.set("lang", URL_LANG);
  return url.pathname + url.search;
}

export async function api(path, options = {}) {
  const res = await fetch(withDemoParams(path), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}
export async function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}
export function applyState(payload) {
  state.data = payload.state || payload;
  render();
}
export function toast(message, kind = "ok") {
  state.toast = { message, kind };
  render();
  setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = null;
      render();
    }
  }, 4200);
}

// File pickers / readers for uploads.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
export function audioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      resolve(audio.duration || 0);
      URL.revokeObjectURL(audio.src);
    };
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
export function go(view, id, replace = false) {
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
  if (DEMO_SCENARIO && !location.hash) {
    const demoRoutes = {
      overview: "#/concept",
      song: "#/song",
      cast: "#/cast/char-demo-dreamer",
      storyboard: "#/storyboard/shot-demo-01",
    };
    history.replaceState(null, "", demoRoutes[DEMO_SCENARIO] || "#/concept");
  }
  parseHash();
  syncResponsiveShell();
  wireChrome();
  await Promise.all([refresh(), loadImageConfig(), loadSongConfig()]);
  setInterval(pollLock, 5000);
}
async function refresh() {
  try {
    state.data = await api("/api/state");
    render();
  } catch (e) {
    console.error(e);
  }
}
async function pollLock() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
  await refresh();
}
async function loadImageConfig() {
  try {
    state.imageConfig = await api("/api/image-config");
  } catch {}
}
async function loadSongConfig() {
  try {
    state.songConfig = await api("/api/song-config");
  } catch {}
}

window.addEventListener("hashchange", () => {
  parseHash();
  render();
});

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
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderList();
  });
  document.getElementById("projectSelect").addEventListener("change", async (e) => {
    try {
      applyState(await post("/api/active-project", { project_id: e.target.value }));
    } catch (err) {
      toast(err.message, "danger");
    }
  });
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsButton").addEventListener("click", () => openSettings());
  document.getElementById("closeSettings").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  document.querySelector(".modal-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-settings-tab]");
    if (!btn) return;
    document.querySelectorAll(".modal-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document
      .querySelectorAll(".settings-panel")
      .forEach((p) => p.classList.toggle("active", p.dataset.settingsPanel === btn.dataset.settingsTab));
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
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const langSel = document.getElementById("languageSelect");
  if (langSel) {
    const labels =
      lang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of langSel.options) option.textContent = labels[option.value] || option.textContent;
  }
  const si = document.getElementById("searchInput");
  if (si) si.placeholder = t("search_placeholder");
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
}

const VIEW_TITLE_KEYS = {
  concept: ["nav_concept", "sub_concept"],
  song: ["nav_song", "sub_song"],
  cast: ["nav_cast", "sub_cast"],
  storyboard: ["nav_storyboard", "sub_storyboard"],
};

export function render() {
  if (!state.data) return;
  syncSidebar();
  const [titleKey, subKey] = VIEW_TITLE_KEYS[state.view];
  document.getElementById("viewTitle").textContent = t(titleKey);
  document.getElementById("viewSubtitle").textContent = t(subKey);
  document.getElementById("lockBanner").classList.toggle("hidden", !state.data.lock?.locked);
  document.getElementById("newItemButton").style.visibility =
    state.view === "cast" || state.view === "storyboard" ? "visible" : "hidden";
  renderToast();
  renderList();
  renderDetail();
}

function syncSidebar() {
  const data = state.data;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  const song = project().song || {};
  document.getElementById("projectTitle").textContent = song.title || t("project_unnamed");
  document.getElementById("projectMeta").textContent =
    [song.artist, song.duration_seconds ? secs(song.duration_seconds) : ""].filter(Boolean).join(" · ") ||
    t("project_meta_fallback");
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = (data.projects || [])
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === data.active_project_id ? "selected" : ""}>${esc(p.title || p.id)}</option>`,
    )
    .join("");
  document.getElementById("nextStepLabel").textContent = t(`step_${data.next_step || "review"}`);
}

function renderToast() {
  let node = document.getElementById("kmvToast");
  if (!state.toast) {
    if (node) node.remove();
    return;
  }
  if (!node) {
    node = document.createElement("div");
    node.id = "kmvToast";
    document.body.appendChild(node);
  }
  node.className = `toast ${state.toast.kind}`;
  node.textContent = state.toast.message;
}

function routeNextStep() {
  const map = {
    upload_song: "song",
    set_concept: "concept",
    add_cast: "cast",
    generate_cast_refs: "cast",
    add_shots: "storyboard",
    fill_shot_images: "storyboard",
    fill_shot_videos: "storyboard",
    review: "concept",
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
export function statusClass(status) {
  return (
    { approved: "status-approved", needs_review: "status-needs", blocked: "status-blocked" }[status] || "status-draft"
  );
}
export function matchSearch(item) {
  if (!state.search) return true;
  return JSON.stringify(item).toLowerCase().includes(state.search.toLowerCase());
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
      <div class="field"><span>API Key</span><div class="settings-row"><code>KELLY_MV_IMAGE_API_KEY</code><span>${ic.has_api_key ? "configured" : "missing"}</span></div></div>
      <div class="form-actions"><button class="mini-button" id="imgSave">保存</button></div>
    </div>`;
  document.getElementById("imgSave").addEventListener("click", async () => {
    const body = {
      base_url: document.getElementById("imgBase").value,
      model: document.getElementById("imgModel").value,
      size: document.getElementById("imgSize").value,
    };
    try {
      state.imageConfig = await post("/api/image-config", body);
      openSettings();
      toast(t("toast_concept_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  const sc = state.songConfig || {};
  document.getElementById("songSettingsMount").innerHTML = `
    <div class="settings-row"><span>${t("settings_draft_backend")}</span><code>${esc(sc.draft_backend || "songgeneration-v2-mlx")}</code></div>
    <div class="settings-row"><span>${t("settings_draft_status")}</span><code>${sc.draft_ready ? t("settings_draft_ready") : t("settings_draft_not_ready")}</code></div>
    <p class="muted">创歌为后续能力，当前请直接上传 MP3。</p>`;
}

boot();
