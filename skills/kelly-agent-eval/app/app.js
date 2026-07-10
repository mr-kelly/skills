import { messages } from "./i18n/messages.js";

const state = {
  run: null,
  release: null,
  settings: null,
  route: parseRoute(),
  query: "",
  category: "",
  statusFilter: "all",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-agent-eval-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-eval.sidebarCollapsed";
const RUBRIC_KEYS = ["helpfulness", "correctness", "safety", "tone"];

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
  regressionFigure: document.querySelector("#regression-figure"),
  pendingReviewLine: document.querySelector("#pending-review-line"),
  countBlocking: document.querySelector("#count-blocking"),
  countRelease: document.querySelector("#count-release"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function num1(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "", query };
}

function setRoute() {
  state.route = parseRoute();
  if (state.route.query.get("status")) state.statusFilter = state.route.query.get("status");
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.run = data.run;
  state.release = data.release_decision;
  state.settings = data;
  render();
}

async function submitReview(id, action, note) {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, action, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Review failed: ${res.status}`);
  }
  const data = await res.json();
  state.run = data.run;
  state.release = data.release_decision;
  state.settings = data;
  render();
}

async function submitReleaseDecision(decision, note) {
  const res = await fetch("/api/release-decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Release decision failed: ${res.status}`);
  }
  const data = await res.json();
  state.run = data.run;
  state.release = data.release_decision;
  state.settings = data;
  render();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function isConnected() {
  return Boolean(state.run?.cases?.length);
}

function caseStatus(item) {
  if (item.decision?.action === "mark_blocking") return "blocking";
  if (item.decision?.action === "mark_acceptable") return "acceptable";
  if (item.regression) return "needs_review";
  return "pass";
}

function statusBadge(item) {
  const status = caseStatus(item);
  const label =
    status === "blocking"
      ? t("statusBlocking")
      : status === "acceptable"
        ? t("statusAcceptable")
        : status === "needs_review"
          ? t("statusNeedsReview")
          : t("statusPass");
  return `<span class="badge ${status}">${escapeHtml(label)}</span>`;
}

function renderShell() {
  applyI18n();
  const run = state.run;
  const metrics = run?.metrics || {};
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? run?.generated_at
      ? `${t("generated")} ${new Date(run.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsRun");
  if (els.regressionFigure) els.regressionFigure.textContent = metrics.regressions ?? 0;
  if (els.pendingReviewLine) els.pendingReviewLine.textContent = String(metrics.pending_review ?? 0);
  if (els.countBlocking) els.countBlocking.textContent = metrics.blocking ?? 0;
  if (els.countRelease) {
    els.countRelease.textContent = state.release?.decision ? (state.release.decision === "approve" ? "✓" : "✕") : "—";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${metrics.regressions ?? 0} ${t("regressionsCount").toLowerCase()}`
      : t("needsRun");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.getAttribute("href").replace(/^#\//, "").split("?")[0].split("/")[0];
    link.classList.toggle("active", route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "regressions") return t("regressionsTitle");
  if (view === "cases") return t("casesTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function passRatePanel() {
  const metrics = state.run?.metrics || {};
  const run = state.run;
  return `
    <div class="pass-rate-panel">
      <div class="pass-rate-card baseline">
        <div class="label">${t("baselinePassRate")} · ${escapeHtml(run.baseline_version)}</div>
        <div class="value">${num1(metrics.baseline_pass_rate)}%</div>
        <div class="pass-rate-bar"><span style="width:${metrics.baseline_pass_rate}%"></span></div>
      </div>
      <div class="pass-rate-card candidate ${metrics.candidate_pass_rate < metrics.baseline_pass_rate ? "regressed" : ""}">
        <div class="label">${t("candidatePassRate")} · ${escapeHtml(run.candidate_version)}</div>
        <div class="value">${num1(metrics.candidate_pass_rate)}%</div>
        <div class="pass-rate-bar"><span style="width:${metrics.candidate_pass_rate}%"></span></div>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><span>${t("totalCases")}</span><strong>${metrics.total_cases ?? 0}</strong></div>
      <div class="metric"><span>${t("regressionsCount")}</span><strong class="${metrics.regressions ? "negative" : ""}">${metrics.regressions ?? 0}</strong></div>
      <div class="metric"><span>${t("improvementsCount")}</span><strong class="${metrics.improvements ? "positive" : ""}">${metrics.improvements ?? 0}</strong></div>
      <div class="metric"><span>${t("pendingReview")}</span><strong>${metrics.pending_review ?? 0}</strong></div>
    </div>
  `;
}

function releasePanel() {
  const release = state.release;
  const locked = Boolean(state.settings?.lock?.owner);
  const statusText = release
    ? `${release.decision === "approve" ? t("approvedBy") : t("blockedBy")}${release.note ? ` — ${escapeHtml(release.note)}` : ""} · ${new Date(release.decided_at).toLocaleString()}`
    : t("releaseNotDecided");
  return `
    <div class="release-panel">
      <h2>${t("releaseDecision")}</h2>
      <div class="release-status ${release ? `badge ${release.decision === "approve" ? "acceptable" : "blocking"}` : "muted"}">${statusText}</div>
      <div class="release-actions">
        <textarea id="releaseNote" class="decision-note" placeholder="${escapeHtml(t("releaseNotePlaceholder"))}" ${locked ? "disabled" : ""}>${release ? escapeHtml(release.note || "") : ""}</textarea>
        <button class="approve" id="approveReleaseBtn" ${locked ? "disabled" : ""} title="${escapeHtml(t("approveRelease"))}">${t("approveRelease")}</button>
        <button class="block" id="blockReleaseBtn" ${locked ? "disabled" : ""} title="${escapeHtml(t("blockRelease"))}">${t("blockRelease")}</button>
      </div>
      <p class="muted" style="margin-top:10px">${escapeHtml(t("exportHint"))}</p>
    </div>
  `;
}

function bindReleasePanel() {
  document.querySelector("#approveReleaseBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#releaseNote")?.value || "";
    submitReleaseDecision("approve", note).catch((error) => alert(error.message));
  });
  document.querySelector("#blockReleaseBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#releaseNote")?.value || "";
    submitReleaseDecision("block", note).catch((error) => alert(error.message));
  });
}

function scoreDelta(item) {
  const delta = item.candidate.overall - item.baseline.overall;
  const sign = delta > 0 ? "+" : "";
  const cls = delta < -0.5 ? "negative" : delta > 0.5 ? "positive" : "";
  return `<span class="score-delta ${cls}">${sign}${num1(delta)}</span>`;
}

function caseRow(item) {
  return `
    <a class="case-row" href="#/cases/${encodeURIComponent(item.id)}">
      <span class="case-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.baseline.overall.toFixed(1))} → ${escapeHtml(item.candidate.overall.toFixed(1))}</span></span>
      ${scoreDelta(item)}
      <span class="badge ${item.regression ? "regression" : item.improvement ? "improvement" : ""}">${item.regression ? t("regressionsCount") : item.improvement ? t("improvementsCount") : t("statusPass")}</span>
      ${statusBadge(item)}
    </a>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.run?.generated_at
    ? `${t("generated")} ${new Date(state.run.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("needsRun")}</div>`;
    return;
  }
  const topRegressions = (state.run.cases || []).filter((c) => c.regression).slice(0, 6);
  els.content.innerHTML = `
    ${passRatePanel()}
    ${releasePanel()}
    <section class="overview-panel wide">
      <h2>${t("regressionsTitle")}</h2>
      <div class="regression-list" style="margin-top:12px">
        ${topRegressions.length ? topRegressions.map(caseRow).join("") : `<div class="empty">${t("regressionsEmpty")}</div>`}
      </div>
    </section>
  `;
  bindReleasePanel();
}

function filteredCases(onlyRegressions) {
  const query = state.query.trim().toLowerCase();
  return (state.run?.cases || []).filter((item) => {
    if (onlyRegressions && !item.regression) return false;
    if (state.category && item.category !== state.category) return false;
    if (state.statusFilter && state.statusFilter !== "all" && caseStatus(item) !== state.statusFilter) return false;
    if (!query) return true;
    return [item.title, item.category, item.prompt]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query));
  });
}

function categoryLegend() {
  const categories = [...new Set((state.run?.cases || []).map((c) => c.category))];
  return `
    <div class="category-legend">
      <button type="button" class="category-chip ${!state.category ? "active" : ""}" data-category="">${t("allCategories")}</button>
      ${categories
        .map(
          (cat) =>
            `<button type="button" class="category-chip ${state.category === cat ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function statusFilterBar() {
  const options = [
    ["all", t("filterAll")],
    ["needs_review", t("filterNeedsReview")],
    ["blocking", t("filterBlocking")],
    ["acceptable", t("filterAcceptable")],
  ];
  return `
    <div class="category-legend">
      ${options
        .map(
          ([value, label]) =>
            `<button type="button" class="category-chip ${state.statusFilter === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function renderRegressions() {
  els.title.textContent = t("regressionsTitle");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("needsRun")}</div>`;
    return;
  }
  const cases = filteredCases(true);
  els.subtitle.textContent = `${cases.length} ${t("regressionsCount").toLowerCase()}`;
  els.content.innerHTML = `
    ${statusFilterBar()}
    <div class="regression-list">
      ${cases.length ? cases.map(caseRow).join("") : `<div class="empty">${t("regressionsEmpty")}</div>`}
    </div>
  `;
  bindFilterBar();
}

function renderCases() {
  els.title.textContent = t("casesTitle");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("needsRun")}</div>`;
    return;
  }
  const cases = filteredCases(false);
  els.subtitle.textContent = `${cases.length} / ${state.run.cases.length} ${t("totalCases").toLowerCase()}`;
  els.content.innerHTML = `
    ${categoryLegend()}
    <div class="case-list">
      ${cases.length ? cases.map(caseRow).join("") : `<div class="empty">${t("empty")}</div>`}
    </div>
  `;
  bindFilterBar();
}

function bindFilterBar() {
  els.content.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.category;
      render();
    });
  });
  els.content.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.statusFilter = btn.dataset.status;
      render();
    });
  });
}

function rubricRow(key, baselineScores, candidateScores) {
  return `
    <div class="rubric-row">
      <span>${t(key)}</span>
      <span class="rubric-track">
        <span class="baseline-bar" style="width:${baselineScores[key]}%"></span>
      </span>
      <span class="num">${baselineScores[key]}</span>
    </div>
    <div class="rubric-row">
      <span></span>
      <span class="rubric-track">
        <span class="candidate-bar" style="width:${candidateScores[key]}%"></span>
      </span>
      <span class="num">${candidateScores[key]}</span>
    </div>
  `;
}

function renderCaseDetail() {
  const item = (state.run?.cases || []).find((c) => c.id === state.route.id);
  if (!item) {
    renderCases();
    return;
  }
  els.title.textContent = item.title;
  els.subtitle.textContent = `${item.category} · ${t("baseline")} ${item.baseline.overall.toFixed(1)} → ${t("candidate")} ${item.candidate.overall.toFixed(1)}`;
  const locked = Boolean(state.settings?.lock?.owner);
  const decidedNote = item.decision?.note || "";
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/cases">← ${t("back")}</a>
        <div class="overview-panel">
          <h2>${t("prompt")}</h2>
          <p style="margin:10px 0 0; white-space:pre-wrap">${escapeHtml(item.prompt)}</p>
        </div>
        <div class="overview-panel" style="margin-top:14px">
          <h2>${t("score")}</h2>
          <div class="rubric-bars">
            ${RUBRIC_KEYS.map((key) => rubricRow(key, item.baseline.scores, item.candidate.scores)).join("")}
          </div>
        </div>
        <div class="overview-panel" style="margin-top:14px">
          <h2>${t("transcriptDiff")}</h2>
          <div class="transcript-diff">
            <div class="transcript-col ${item.baseline.transcript !== item.candidate.transcript ? "diff-changed" : ""}">
              <h3>${t("baseline")} — ${item.baseline.pass ? t("pass") : t("fail")}</h3>
              <p>${escapeHtml(item.baseline.transcript)}</p>
            </div>
            <div class="transcript-col ${item.baseline.transcript !== item.candidate.transcript ? "diff-changed" : ""}">
              <h3>${t("candidate")} — ${item.candidate.pass ? t("pass") : t("fail")}</h3>
              <p>${escapeHtml(item.candidate.transcript)}</p>
            </div>
          </div>
        </div>
        ${
          item.regression
            ? `
        <div class="decision-panel">
          <h2>${t("reviewNote")}</h2>
          <textarea id="decisionNote" class="decision-note" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(decidedNote)}</textarea>
          <div class="decision-actions">
            <button class="blocking-btn" id="markBlockingBtn" ${locked ? "disabled" : ""}>${t("markBlocking")}</button>
            <button class="acceptable-btn" id="markAcceptableBtn" ${locked ? "disabled" : ""}>${t("markAcceptable")}</button>
          </div>
        </div>`
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("caseDetail")}</h2>
        <dl>
          <dt>${t("category")}</dt><dd>${escapeHtml(item.category)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(item)}</dd>
          <dt>${t("overallScore")}</dt><dd>${item.baseline.overall.toFixed(1)} → ${item.candidate.overall.toFixed(1)}</dd>
        </dl>
      </aside>
    </section>
  `;
  document.querySelector("#markBlockingBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#decisionNote")?.value.trim() || "";
    if (!note) {
      alert(t("noteRequired"));
      return;
    }
    submitReview(item.id, "mark_blocking", note).catch((error) => alert(error.message));
  });
  document.querySelector("#markAcceptableBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#decisionNote")?.value.trim() || "";
    if (!note) {
      alert(t("noteRequired"));
      return;
    }
    submitReview(item.id, "mark_acceptable", note).catch((error) => alert(error.message));
  });
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("teamName")}</dt><dd>${escapeHtml(summary.team_name || "")}</dd>
          <dt>${t("baselineVersion")}</dt><dd>${escapeHtml(summary.baseline_version || "")}</dd>
          <dt>${t("candidateVersion")}</dt><dd>${escapeHtml(summary.candidate_version || "")}</dd>
          <dt>${t("minPassRate")}</dt><dd>${escapeHtml(String(summary.release_policy?.min_candidate_pass_rate ?? ""))}%</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section id="settingsContent"></section>
    </div>
  `;
}

function warnings() {
  if (!state.settings?.lock?.owner) return "";
  return `<div class="warnings"><strong>${escapeHtml(t("locked"))}</strong></div>`;
}

function render() {
  renderShell();
  if (state.route.view === "regressions") renderRegressions();
  else if (state.route.view === "cases" && state.route.id) renderCaseDetail();
  else if (state.route.view === "cases") renderCases();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
  const lockBanner = warnings();
  if (lockBanner) els.content.insertAdjacentHTML("afterbegin", lockBanner);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.mobileRefresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-eval-language", state.lang);
  loadState().catch((error) => alert(error.message));
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
