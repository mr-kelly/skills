import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { shotsForVideo } from "./js/video-model.js?v=0.1.0";

const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  data: null,
};

function qs(sel) {
  return document.querySelector(sel);
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function renderMarkdownTable(md) {
  const lines = String(md ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every((l) => l.startsWith("|"))) {
    return `<div class="value">${esc(md)}</div>`;
  }
  const cells = (line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function statusBadge(status) {
  return `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;
}

function recBadge(status) {
  return `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;
}

function videos() {
  return state.data?.videos || [];
}

function shots() {
  return state.data?.shots || [];
}

function renderVideoList() {
  qs("#page-title").textContent = "Videos";
  const content = qs("#content");
  const list = videos();
  const total = recordCountLabel("videos", list.length);
  qs("#page-subtitle").textContent = `${total} video${total === 1 ? "" : "s"}`;
  renderNav(list, null);
  if (list.length === 0) {
    content.innerHTML = `${'<div class="empty-state">No videos yet. Propose one with scripts/propose_video.mjs.</div>'}
    ${pagerControl("videos")}`;
    return;
  }
  const rows = list
    .map((v) => {
      const shotSummary =
        Object.entries(v.shots.byStatus)
          .map(([k, n]) => `${recBadge(k)} ${n}`)
          .join(" ") || "—";
      return `<tr class="clickable" data-id="${esc(v.id)}">
        <td><strong>${esc(v.title)}</strong><br><span class="muted">${esc(v.series || "")}</span></td>
        <td>${statusBadge(v.status)}</td>
        <td>${v.shots.total}</td>
        <td>${shotSummary}</td>
        <td>${esc(v.owner || "")}</td>
      </tr>`;
    })
    .join("");
  content.innerHTML = `<table>
    <thead><tr><th>Title</th><th>Status</th><th>Shots</th><th>Recording progress</th><th>Owner</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  content.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      location.hash = `#/videos/${tr.dataset.id}`;
    });
  });
}

function renderVideoDetail(id) {
  const content = qs("#content");
  const video = videos().find((v) => v.id === id);
  if (!video) {
    content.innerHTML = '<div class="error-state">Video not found.</div>';
    return;
  }
  qs("#page-title").textContent = video.title;
  qs("#page-subtitle").innerHTML = `${statusBadge(video.status)} &nbsp; owner: ${esc(video.owner || "")}`;

  const fields = [
    ["Purpose", video.purpose],
    ["Hook", video.hook],
    ["Pain point", video.pain_point],
    ["Concept", video.concept],
    ["HyperFrame path", video.hyperframe_path || "(not started)"],
    ["Final video URL", video.final_video_url || "(not published)"],
  ];
  const fieldCards = fields
    .map(
      ([label, value]) =>
        `<div class="field-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`,
    )
    .join("");

  const videoShots = shotsForVideo(shots(), video.id);
  const shotRows = videoShots
    .map(
      (s) => `<tr>
        <td>${esc(s.shot_number)}</td>
        <td>${esc(s.timecode)}</td>
        <td>${esc(s.scene)}</td>
        <td><code>${esc(s.code_reference || "—")}</code></td>
        <td>${esc(s.script_line)}</td>
        <td>${recBadge(s.recording_status)}</td>
      </tr>`,
    )
    .join("");

  content.innerHTML = `
    <a class="back-link" href="#/videos">&larr; All videos</a>
    <div class="field-grid">${fieldCards}</div>
    ${video.verified_claims ? `<div class="section-title">Verified claims</div>${renderMarkdownTable(video.verified_claims)}` : ""}
    <div class="section-title">Storyboard (${videoShots.length} shots)</div>
    <table>
      <thead><tr><th>#</th><th>Timecode</th><th>Scene</th><th>Code ref</th><th>Script line</th><th>Recording</th></tr></thead>
      <tbody>${shotRows || '<tr><td colspan="6" class="muted">No shots yet.</td></tr>'}</tbody>
    </table>
  `;
}

function renderNav(list, activeId) {
  const nav = qs("#videoNav");
  nav.innerHTML = list
    .map((v) => `<a href="#/videos/${esc(v.id)}" data-id="${esc(v.id)}">${esc(v.title)}</a>`)
    .join("");
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.id === activeId));
}

function route() {
  const hash = location.hash || "#/videos";
  const detailMatch = hash.match(/^#\/videos\/(.+)$/);
  document
    .querySelectorAll(".filters a")
    .forEach((a) => a.classList.toggle("active", hash.startsWith(a.getAttribute("href"))));
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    renderVideoDetail(id);
    renderNav(videos(), id);
  } else {
    renderVideoList();
  }
}

function renderSyncStatus() {
  qs("#sync-status").textContent = state.data
    ? `Busabase: ${recordCountLabel("videos", state.data.videoCount)} video(s)`
    : "Loading";
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.data = data;
  renderSyncStatus();
  route();
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    renderSetupRequired(error, boot);
  }
}

window.addEventListener("hashchange", route);
qs("#refresh").addEventListener("click", () => {
  loadState().catch((error) => renderSetupRequired(error, boot));
});



const PAGE_BINDINGS = {
  "videos": { key: "videos", path: "data.videos" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 100;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const binding = Object.values(PAGE_BINDINGS).find((entry) => entry.key === key);
  if (!binding) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  if (typeof render === "function") render();
  else route();
  try {
    const provider = await getProvider();
    let result;
    for (let next = state.pageCursors[key].length; next <= page; next += 1) {
      const cursor = state.pageCursors[key][next - 1];
      if (next > 1 && !cursor) return;
      result = await provider.fetchPage(key, cursor);
      state.pageCursors[key][next] = result.nextCursor;
    }
    if (!result || state.pageCursors[key].length > page + 1) {
      result = await provider.fetchPage(key, state.pageCursors[key][page - 1]);
      state.pageCursors[key][page] = result.nextCursor;
    }
    replacePageRows(binding.path, result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    if (typeof render === "function") render();
    else route();
  }
}

function pagerMessage(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  const current = state.currentPage?.[key] || 1;
  return `${loadedCount}${state.pageCursors?.[key]?.[current] ? "+" : ""}`;
}

export function pagerControl(key) {
  if (!state.pageCursors[key]) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const loading = Boolean(state.pageLoading[key]);
  const hasNext = total == null ? Boolean(state.pageCursors[key][current]) : current < total;
  if ((total === 1 || total == null) && current === 1 && !hasNext) return "";
  const pages =
    total == null
      ? []
      : total <= 7
        ? Array.from({ length: total }, (_, index) => index + 1)
        : [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort(
            (a, b) => a - b,
          );
  const items = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) items.push('<span class="pager-ellipsis">…</span>');
    items.push(`<button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`);
    previous = page;
  }
  return `<nav class="pager" aria-label="${pagerMessage("pagination", "Pagination")}">
    <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${pagerMessage("prevPage", "Prev")}</button>
    ${items.join("")}
    <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${pagerMessage("nextPage", "Next")}</button>
    ${total == null ? "" : `<span class="pager-summary">${pagerMessage("pageOf", "Page {current} of {total}").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

document.querySelector("#content")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (!button) return;
  const [key, page] = button.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
});

boot();
