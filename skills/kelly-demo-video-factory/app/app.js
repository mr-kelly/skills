const demoQuery = new URLSearchParams(location.search).has("demo") ? "?demo=1" : "";

function qs(sel) {
  return document.querySelector(sel);
}

async function api(path) {
  const sep = path.includes("?") ? "&" : "?";
  const url = demoQuery ? `${path}${sep}demo=1` : path;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
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

async function renderVideoList() {
  qs("#page-title").textContent = "Videos";
  const content = qs("#content");
  content.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const { videos } = await api("/api/videos");
    qs("#page-subtitle").textContent = `${videos.length} video${videos.length === 1 ? "" : "s"}`;
    renderNav(videos, null);
    if (videos.length === 0) {
      content.innerHTML = '<div class="empty-state">No videos yet. Propose one with scripts/propose_video.ts.</div>';
      return;
    }
    const rows = videos
      .map((v) => {
        const f = v.fields;
        const shotSummary =
          Object.entries(v.shots.byStatus)
            .map(([k, n]) => `${recBadge(k)} ${n}`)
            .join(" ") || "—";
        return `<tr class="clickable" data-id="${esc(v.id)}">
          <td><strong>${esc(f.title)}</strong><br><span class="muted">${esc(f.series || "")}</span></td>
          <td>${statusBadge(f.status)}</td>
          <td>${v.shots.total}</td>
          <td>${shotSummary}</td>
          <td>${esc(f.owner || "")}</td>
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
  } catch (err) {
    content.innerHTML = `<div class="error-state">Provider not ready: ${esc(err.message)}<br><span class="muted">Run <code>npm run ensure-schema</code> in the skill folder, and confirm BUSABASE_BASE_URL points at a running Busabase instance.</span></div>`;
  }
}

async function renderVideoDetail(id) {
  const content = qs("#content");
  content.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const { video, shots } = await api(`/api/videos/${encodeURIComponent(id)}`);
    const f = video.fields;
    qs("#page-title").textContent = f.title;
    qs("#page-subtitle").innerHTML = `${statusBadge(f.status)} &nbsp; owner: ${esc(f.owner || "")}`;

    const fields = [
      ["Purpose", f.purpose],
      ["Hook", f.hook],
      ["Pain point", f["pain-point"]],
      ["Concept", f.concept],
      ["HyperFrame path", f["hyperframe-path"] || "(not started)"],
      ["Final video URL", f["final-video-url"] || "(not published)"],
    ];
    const fieldCards = fields
      .map(
        ([label, value]) =>
          `<div class="field-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`,
      )
      .join("");

    const shotRows = shots
      .map((s) => {
        const sf = s.fields;
        return `<tr>
          <td>${esc(sf["shot-number"])}</td>
          <td>${esc(sf.timecode)}</td>
          <td>${esc(sf.scene)}</td>
          <td><code>${esc(sf["code-reference"] || "—")}</code></td>
          <td>${esc(sf["script-line"])}</td>
          <td>${recBadge(sf["recording-status"])}</td>
        </tr>`;
      })
      .join("");

    content.innerHTML = `
      <a class="back-link" href="#/videos">&larr; All videos</a>
      <div class="field-grid">${fieldCards}</div>
      ${f["verified-claims"] ? `<div class="section-title">Verified claims</div>${renderMarkdownTable(f["verified-claims"])}` : ""}
      <div class="section-title">Storyboard (${shots.length} shots)</div>
      <table>
        <thead><tr><th>#</th><th>Timecode</th><th>Scene</th><th>Code ref</th><th>Script line</th><th>Recording</th></tr></thead>
        <tbody>${shotRows || '<tr><td colspan="6" class="muted">No shots yet.</td></tr>'}</tbody>
      </table>
    `;
  } catch (err) {
    content.innerHTML = `<div class="error-state">${esc(err.message)}</div>`;
  }
}

function renderNav(videos, activeId) {
  const nav = qs("#videoNav");
  nav.innerHTML = videos
    .map((v) => `<a href="#/videos/${esc(v.id)}" data-id="${esc(v.id)}">${esc(v.fields.title)}</a>`)
    .join("");
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.id === activeId));
}

async function refreshNav(activeId) {
  try {
    const { videos } = await api("/api/videos");
    renderNav(videos, activeId);
  } catch {
    // nav stays empty if the provider isn't ready; main content already shows the error.
  }
}

async function route() {
  const hash = location.hash || "#/videos";
  const detailMatch = hash.match(/^#\/videos\/(.+)$/);
  document
    .querySelectorAll(".filters a")
    .forEach((a) => a.classList.toggle("active", hash.startsWith(a.getAttribute("href"))));
  if (detailMatch) {
    await renderVideoDetail(decodeURIComponent(detailMatch[1]));
    refreshNav(decodeURIComponent(detailMatch[1]));
  } else {
    await renderVideoList();
  }
}

async function refreshState() {
  try {
    const state = await api("/api/state");
    qs("#sync-status").textContent = state.ready ? `Busabase: ${state.videoCount} video(s)` : "Provider not ready";
  } catch {
    qs("#sync-status").textContent = "Offline";
  }
}

window.addEventListener("hashchange", route);
qs("#refresh").addEventListener("click", () => {
  refreshState();
  route();
});

refreshState();
route();
