(() => {
  const PANEL_ID = "demoVisualsPanel";
  let visuals = [];
  let renderTimer = 0;
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function isStateUrl(input) {
    try {
      const value = typeof input === "string" ? input : input?.url ? input.url : String(input);
      const url = new URL(value, window.location.origin);
      return url.pathname === "/api/state";
    } catch {
      return false;
    }
  }

  function extractVisuals(payload) {
    const sources = [payload, payload?.snapshot, payload?.project, payload?.batch];
    for (const source of sources) {
      if (source && Array.isArray(source.demo_visuals) && source.demo_visuals.length) return source.demo_visuals;
    }
    return [];
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(
      /[&<>"]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
    );
  }

  function isDemoPage() {
    const params = new URLSearchParams(window.location.search);
    return params.has("demo") || params.has("demo_visuals");
  }

  function mountPoint() {
    return (
      document.querySelector(".detail-panel") ||
      document.querySelector(".list-panel") ||
      document.querySelector("main.main") ||
      document.querySelector("main") ||
      document.querySelector("#content") ||
      document.querySelector("#stagePanel") ||
      document.querySelector("#app") ||
      document.body
    );
  }

  function insertPanel(panel, mount) {
    if (mount.classList?.contains("detail-panel") || mount.classList?.contains("list-panel")) {
      mount.appendChild(panel);
      return;
    }
    const preferred = mount.querySelector?.(".content-title, .page-head, header, .mobile-topbar");
    if (preferred && preferred.parentElement === mount) {
      preferred.insertAdjacentElement("afterend", panel);
      return;
    }
    const before = mount.querySelector?.(".workspace, .content, #content, #stagePanel, #listPanel");
    if (before && before.parentElement === mount) {
      mount.insertBefore(panel, before);
      return;
    }
    mount.insertBefore(panel, mount.firstChild);
  }

  function visualCard(item) {
    const src = item.src || item.image || item.image_url || item.thumbnail_url || "";
    const alt = item.alt || item.title || "Demo visual";
    const title = item.title || "Demo visual";
    const caption = item.caption || "Synthetic image for the demo dataset.";
    return `<figure class="demo-visual-card"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"><figcaption><strong>${esc(title)}</strong><span>${esc(caption)}</span></figcaption></figure>`;
  }

  function render() {
    renderTimer = 0;
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
    if (!isDemoPage() || !visuals.length) return;
    const mount = mountPoint();
    if (!mount) return;
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "demo-visuals-panel";
    panel.setAttribute("aria-label", "Simulated demo images");
    panel.innerHTML = `<div class="demo-visuals-head"><div><span>Demo images</span><strong>Screenshot-safe simulated visuals</strong></div><small>mock data</small></div><div class="demo-visuals-grid">${visuals.slice(0, 3).map(visualCard).join("")}</div>`;
    insertPanel(panel, mount);
  }

  function scheduleRender() {
    if (renderTimer) window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      if (window.requestAnimationFrame) window.requestAnimationFrame(render);
      else render();
    }, 0);
  }

  function record(payload) {
    const next = extractVisuals(payload);
    if (!next.length) return;
    visuals = next;
    scheduleRender();
  }

  if (originalFetch) {
    window.fetch = (...args) =>
      originalFetch(...args).then((response) => {
        if (isStateUrl(args[0])) {
          response
            .clone()
            .json()
            .then(record)
            .catch(() => {});
        }
        return response;
      });
  }

  function fallbackLoad() {
    if (!originalFetch || !isDemoPage() || visuals.length) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("demo")) params.set("demo", "overview");
    params.set("demo_visuals", "1");
    originalFetch(`/api/state?${params.toString()}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) record(payload);
      })
      .catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    fallbackLoad();
    scheduleRender();
  });
  window.addEventListener("hashchange", scheduleRender);
})();
