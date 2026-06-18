let state = { items: [], counts: {}, batch: null, lock: { locked: false }, config_summary: {} };
let mode = "needs_review";
let repoFilter = "all";
let selectedId = null;
let refreshTimer = null;
let saveTimer = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function statusBadge(item) {
  const status = item.status || "needs_review";
  const labels = {
    needs_review: "Needs review",
    to_approve: "Ready",
    approved: "Approved",
    done: "Done",
    blocked: "Blocked",
  };
  const klass = status === "approved" || status === "done" ? "ok" : status === "blocked" ? "danger" : status === "to_approve" ? "warn" : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[status] || status)}</span>`;
}

function actionBadge(action) {
  const labels = {
    approve: "Approve",
    comment: "Comment",
    request_changes: "Request changes",
    no_action: "No action",
    needs_review: "Needs review",
    block: "Block",
  };
  const klass = action === "approve" ? "ok" : action === "request_changes" || action === "block" ? "danger" : action === "comment" ? "warn" : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[action] || action || "Review")}</span>`;
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

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts?.[name] || 0;
}

function renderCounts() {
  ["all", "needs_review", "to_approve", "approved", "done", "blocked"].forEach((name) => {
    const node = $(`count-${name}`);
    if (node) node.textContent = countFor(name);
  });
}

function modeTitle() {
  return {
    all: "All pull requests",
    needs_review: "Needs your review",
    to_approve: "Ready to approve",
    approved: "Approved",
    done: "Done",
    blocked: "Blocked",
  }[mode] || "Pull requests";
}

function renderHeader() {
  const batch = state.batch || {};
  $("batchMeta").textContent = batch.batch_id && batch.batch_id !== "empty"
    ? `${batch.batch_id} · generated ${timeAgo(batch.generated_at)} ago`
    : "No batch loaded";
  renderRepoFilter();
  $("sectionTitle").textContent = modeTitle();
  $("listCount").textContent = `${state.items.length}`;

  const onboarding = state.config_summary?.onboarding || {};
  $("setupBody").textContent = onboarding.configured
    ? `Ready as ${state.config_summary?.reviewer?.handle || "@me"}`
    : onboarding.message || "Using gh CLI defaults.";

  const approved = countFor("approved");
  const needs = countFor("needs_review") + countFor("to_approve");
  if (!state.total_cached) {
    $("nextTitle").textContent = "Next step: generate a review batch";
    $("nextBody").textContent = "Run /kelly-pr-review to fetch pull requests with gh CLI.";
  } else if (approved > 0) {
    $("nextTitle").textContent = `Next step: execute ${approved} approved review${approved === 1 ? "" : "s"}`;
    $("nextBody").textContent = "Ask /kelly-pr-review to execute approved decisions, or run the dry-run script first.";
  } else if (needs > 0) {
    $("nextTitle").textContent = `Next step: review ${needs} pull request${needs === 1 ? "" : "s"}`;
    $("nextBody").textContent = "Open each item, adjust the review body, then choose an action.";
  } else {
    $("nextTitle").textContent = "Queue is clear";
    $("nextBody").textContent = "Generate a new batch when you want to refresh GitHub state.";
  }
}

function renderRepoFilter() {
  const select = $("repoFilter");
  if (!select) return;
  const repos = state.repos || [];
  const current = repos.some((repo) => repo.repo === repoFilter) ? repoFilter : "all";
  if (current !== repoFilter) repoFilter = current;
  const options = [
    `<option value="all">All repos (${state.total_cached || 0})</option>`,
    ...repos.map((repo) => `<option value="${escapeHtml(repo.repo)}">${escapeHtml(repo.repo)} (${escapeHtml(repo.count)})</option>`),
  ].join("");
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = repoFilter;
}

function renderLock() {
  const lock = state.lock || {};
  $("lockBanner").classList.toggle("is-hidden", !lock.locked);
  $("lockMessage").textContent = lock.message || "The local files are locked for a moment.";
  document.querySelectorAll("button, textarea, input").forEach((node) => {
    if (node.id === "searchInput" || node.id === "helpButton" || node.id === "closeHelp") return;
    node.disabled = Boolean(lock.locked);
  });
}

function renderList() {
  const list = $("prList");
  if (!state.items.length) {
    list.innerHTML = `<div class="empty-detail">No pull requests in this view</div>`;
    renderDetail();
    return;
  }
  if (!selectedId || !state.items.some((item) => item.id === selectedId)) selectedId = state.items[0].id;
  list.innerHTML = state.items.map((item) => `
    <button class="pr-row ${item.id === selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
      <a class="pr-open-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="Open pull request" aria-label="Open ${escapeHtml(item.repo)} pull request ${escapeHtml(item.number)}">↗</a>
      <span>
        <div class="pr-title">${escapeHtml(item.title)}</div>
        <div class="pr-meta">${escapeHtml(item.review_ref || "")} · ${escapeHtml(item.author || "unknown")} · ${escapeHtml(item.repo)} #${escapeHtml(item.number)}</div>
      </span>
      <span>${statusBadge(item)}</span>
      <span class="changes"><span class="plus">+${escapeHtml(item.additions)}</span> <span class="minus">−${escapeHtml(item.deletions)}</span></span>
      <span class="muted">${escapeHtml(timeAgo(item.updated_at))}</span>
    </button>
  `).join("");
  list.querySelectorAll(".pr-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedId = row.dataset.id;
      renderList();
      renderDetail();
    });
  });
  list.querySelectorAll(".pr-open-button").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
  renderDetail();
}

function selectedItem() {
  return state.items.find((item) => item.id === selectedId) || null;
}

function riskHtml(item) {
  const risks = item.risk?.length ? item.risk : ["normal"];
  return risks.map((risk) => `<span class="badge ${risk === "normal" ? "" : "warn"}">${escapeHtml(risk)}</span>`).join("");
}

function filesHtml(item) {
  const files = (item.changed_files || []).slice(0, 18);
  if (!files.length) return `<span class="muted">No changed files loaded</span>`;
  const extra = item.changed_files.length > files.length ? `<span class="badge">+${item.changed_files.length - files.length} more</span>` : "";
  return `${files.map((file) => `<code>${escapeHtml(file)}</code>`).join("")}${extra}`;
}

function renderDetail() {
  const panel = $("detailPanel");
  const item = selectedItem();
  if (!item) {
    panel.innerHTML = `<div class="empty-detail">Select a pull request</div>`;
    return;
  }
  panel.innerHTML = `
    <div class="detail-head">
      <h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <div class="detail-meta">
        <span>${escapeHtml(item.repo)} #${escapeHtml(item.number)}</span>
        <span>${escapeHtml(item.author || "unknown")}</span>
        <a class="detail-open-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open PR</a>
      </div>
    </div>
    <div class="detail-body">
      <section class="section">
        <h2>Recommendation</h2>
        <div class="action-row">${actionBadge(item.proposed_action)} ${statusBadge(item)}</div>
        <p>${escapeHtml(item.reason || item.summary || "No recommendation loaded.")}</p>
      </section>
      <section class="section">
        <h2>Risk</h2>
        <div class="risk-list">${riskHtml(item)}</div>
      </section>
      <section class="section">
        <h2>Changed files</h2>
        <div class="file-list">${filesHtml(item)}</div>
      </section>
      <section class="section">
        <h2>Review body</h2>
        <textarea id="reviewBody">${escapeHtml(item.review_body || "")}</textarea>
      </section>
      <section class="section">
        <h2>Review note</h2>
        <textarea id="reviewComment" class="comment-box">${escapeHtml(item.decision?.comment || "")}</textarea>
      </section>
      ${item.patch_excerpt ? `<section class="section"><h2>Patch excerpt</h2><pre class="patch">${escapeHtml(item.patch_excerpt)}</pre></section>` : ""}
      <section class="section">
        <h2>Action</h2>
        <div class="action-row">
          <button class="primary" data-action="approve">Approve</button>
          <button data-action="comment">Comment</button>
          <button class="danger" data-action="request_changes">Request changes</button>
          <button data-action="no_action">No action</button>
          <button data-action="needs_review">Needs review</button>
          <button class="danger" data-action="block">Block</button>
        </div>
      </section>
    </div>
  `;
  $("reviewBody").addEventListener("input", scheduleSaveDetail);
  $("reviewComment").addEventListener("input", scheduleSaveDetail);
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => decide(button.dataset.action));
  });
  renderLock();
}

function scheduleSaveDetail() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDetail, 450);
}

async function saveDetail() {
  const item = selectedItem();
  if (!item) return;
  const reviewBody = $("reviewBody")?.value || "";
  const comment = $("reviewComment")?.value || "";
  item.review_body = reviewBody;
  item.decision = { ...(item.decision || {}), comment };
  await api("/api/detail", { id: item.id, review_body: reviewBody, comment });
}

async function decide(action) {
  const item = selectedItem();
  if (!item) return;
  const reviewBody = $("reviewBody")?.value || "";
  const comment = $("reviewComment")?.value || "";
  await api("/api/decision", { ids: [item.id], action, review_body: reviewBody, comment });
  toast("Decision saved");
  await loadState();
}

function helpHtml() {
  const summary = state.config_summary || {};
  const repos = (summary.repos || []).map((repo) => `<span class="badge">${escapeHtml(repo.repo)}</span>`).join(" ");
  return `
    <p>This UI only reads and writes local files. GitHub actions happen later through the skill execution script.</p>
    <dl>
      <dt>Data reader</dt><dd><code>${escapeHtml(summary.reader || "local")}</code></dd>
      <dt>Config source</dt><dd><code>${escapeHtml(summary.source || "not configured")}</code></dd>
      <dt>Batch file</dt><dd><code>${escapeHtml(state.batch_path || "")}</code></dd>
      <dt>Decision file</dt><dd><code>${escapeHtml(state.decisions_path || "")}</code></dd>
      <dt>Execution report</dt><dd><code>${escapeHtml(state.execution_report_path || "")}</code></dd>
      <dt>Reviewer</dt><dd><code>${escapeHtml(summary.reviewer?.handle || "@me")}</code></dd>
      <dt>Repositories</dt><dd>${repos || '<span class="muted">No repos configured</span>'}</dd>
    </dl>
    <p>Typical flow: generate a batch, review PRs here, then execute approved decisions. Default execution is dry-run.</p>
  `;
}

function openHelp() {
  $("helpBody").innerHTML = helpHtml();
  $("helpModal").classList.remove("is-hidden");
  $("helpModal").setAttribute("aria-hidden", "false");
}

function closeHelp() {
  $("helpModal").classList.add("is-hidden");
  $("helpModal").setAttribute("aria-hidden", "true");
}

async function loadState() {
  const q = encodeURIComponent($("searchInput")?.value || "");
  state = await api(`/api/state?mode=${encodeURIComponent(mode)}&repo=${encodeURIComponent(repoFilter)}&q=${q}`);
  renderCounts();
  renderHeader();
  renderLock();
  renderList();
}

function wire() {
  document.querySelectorAll("#filters button").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      document.querySelectorAll("#filters button").forEach((node) => node.classList.toggle("active", node === button));
      loadState().catch((error) => toast(error.message));
    });
  });
  $("searchInput").addEventListener("input", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => loadState().catch((error) => toast(error.message)), 250);
  });
  $("repoFilter").addEventListener("change", () => {
    repoFilter = $("repoFilter").value || "all";
    selectedId = null;
    loadState().catch((error) => toast(error.message));
  });
  $("reloadButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("refreshButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("helpButton").addEventListener("click", openHelp);
  $("closeHelp").addEventListener("click", closeHelp);
  $("helpModal").addEventListener("click", (event) => {
    if (event.target === $("helpModal")) closeHelp();
  });
  setInterval(() => {
    const active = document.activeElement;
    if (active && ["TEXTAREA", "INPUT"].includes(active.tagName)) return;
    loadState().catch(() => {});
  }, 5000);
}

wire();
loadState().catch((error) => toast(error.message));
