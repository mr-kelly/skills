import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { shotsForVideo } from "./js/video-model.js?v=0.1.0";

const state = {
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
  qs("#page-subtitle").textContent = `${list.length} video${list.length === 1 ? "" : "s"}`;
  renderNav(list, null);
  if (list.length === 0) {
    content.innerHTML = '<div class="empty-state">No videos yet. Propose one with scripts/propose_video.mjs.</div>';
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
  qs("#sync-status").textContent = state.data ? `Busabase: ${state.data.videoCount} video(s)` : "Loading";
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
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

boot();
