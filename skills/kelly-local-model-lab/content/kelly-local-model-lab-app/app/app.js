import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const params = new URLSearchParams(location.search);
const state = {
  data: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(params.get("lang") || localStorage.getItem("kelly-local-model-lab-language") || "auto"),
  messages: { en: {}, zh: {} },
  busy: false,
  settingsTab: "guide",
};

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
  reviewCount: document.querySelector("#review-count"),
  activeRunCount: document.querySelector("#active-run-count"),
  candidateCount: document.querySelector("#candidate-count"),
  language: document.querySelector("#language"),
};

function normalizeLang(value) {
  return String(value || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : value || "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return state.messages[activeLang()]?.[key] || state.messages.en[key] || key;
}

function label(value, group = "status") {
  return state.messages[activeLang()]?.enum?.[group]?.[value] || state.messages.en.enum?.[group]?.[value] || value;
}

async function loadMessages() {
  const [en, zh] = await Promise.all([
    fetch("./i18n/en.json").then((response) => response.json()),
    fetch("./i18n/zh-CN.json").then((response) => response.json()),
  ]);
  state.messages = { en, zh };
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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

function number(value, digits = 0) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(activeLang() === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  els.sidebarScrim.hidden = !open;
}

function syncResponsive() {
  if (!isMobile()) {
    setSidebarOpen(false);
    document.body.classList.remove("mobile-detail-open");
  } else {
    document.body.classList.toggle("mobile-detail-open", state.route.view === "examples" && Boolean(state.route.id));
  }
}

function shell() {
  const snapshot = state.data?.snapshot;
  const counts = snapshot?.counts || {};
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.classList.toggle("active", node.dataset.route === state.route.view);
  });
  els.reviewCount.textContent = number(counts.needs_review);
  els.activeRunCount.textContent = number(counts.active_runs);
  els.candidateCount.textContent = number(counts.candidate_models);
  els.syncStatus.textContent = state.data?.demo ? t("demo") : t("busabase");
  els.mobileViewTitle.textContent = t(state.route.view) || t("overview");
  els.mobileViewMeta.textContent = state.data?.demo ? t("demo") : t("busabase");
  els.language.value = state.lang;
  syncResponsive();
}

async function loadState() {
  const provider = await getProvider();
  state.data = await provider.getState();
  closeConnectGate();
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.data?.demo || location.hash) return;
  const scenario = state.data.demo_scenario;
  const route =
    scenario === "dataset"
      ? "#/examples/EX-004"
      : scenario === "evaluations"
        ? "#/evaluations"
        : scenario === "registry"
          ? "#/registry"
          : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function metric(labelText, value, hint = "") {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</div>`;
}

function latestComparison() {
  return state.data?.snapshot?.comparisons?.find((item) => item.adapter && item.baseline) || null;
}

function renderOverview() {
  const snapshot = state.data.snapshot;
  const counts = snapshot.counts;
  const comparison = latestComparison();
  els.title.textContent = t("overview");
  els.subtitle.textContent = t("overviewSubtitle");
  els.content.innerHTML = `
    <div class="metrics lab-metrics">
      ${metric(t("approvedExamples"), number(counts.approved), `${counts.train}/${counts.valid}/${counts.test} train/valid/test`)}
      ${metric(t("needReview"), number(counts.needs_review), t("beforeSnapshot"))}
      ${metric(t("activeRuns"), number(counts.active_runs), t("localWorkerClaims"))}
      ${metric(t("candidateModels"), number(counts.candidate_models), t("promotionNeedsEval"))}
    </div>
    <section class="overview-grid lab-overview-grid">
      <div class="overview-panel">
        <div class="panel-heading"><h2>${escapeHtml(t("pipeline"))}</h2><span class="badge">Busabase -> MLX</span></div>
        <ol class="pipeline-list">
          <li><strong>${escapeHtml(t("curate"))}</strong><span>${escapeHtml(t("curateCopy"))}</span></li>
          <li><strong>${escapeHtml(t("snapshot"))}</strong><span>${escapeHtml(t("snapshotCopy"))}</span></li>
          <li><strong>${escapeHtml(t("train"))}</strong><span>${escapeHtml(t("trainCopy"))}</span></li>
          <li><strong>${escapeHtml(t("evaluate"))}</strong><span>${escapeHtml(t("evaluateCopy"))}</span></li>
        </ol>
      </div>
      <div class="overview-panel">
        <div class="panel-heading"><h2>${escapeHtml(t("latestComparison"))}</h2>${comparison ? `<span class="badge ${comparison.schema_delta > 0 ? "sev-info" : "sev-high"}">${comparison.schema_delta > 0 ? "+" : ""}${number(comparison.schema_delta, 1)} pp</span>` : ""}</div>
        ${
          comparison
            ? `
          <div class="comparison-bars">
            <div><span>${escapeHtml(t("baseline"))}</span><div class="bar"><i style="width:${comparison.baseline.schema_valid_pct}%"></i></div><strong>${number(comparison.baseline.schema_valid_pct, 1)}%</strong></div>
            <div><span>${escapeHtml(t("adapter"))}</span><div class="bar"><i style="width:${comparison.adapter.schema_valid_pct}%"></i></div><strong>${number(comparison.adapter.schema_valid_pct, 1)}%</strong></div>
          </div>
          <a class="text-link" href="#/evaluations">${escapeHtml(t("openEvaluation"))}</a>
        `
            : `<div class="empty">${escapeHtml(t("noEvaluation"))}</div>`
        }
      </div>
    </section>
    <section class="overview-panel wide recent-runs">
      <div class="panel-heading"><h2>${escapeHtml(t("recentRuns"))}</h2><a class="text-link" href="#/runs">${escapeHtml(t("viewAll"))}</a></div>
      ${runRows(snapshot.runs.slice(0, 4))}
    </section>`;
}

function filteredExamples() {
  const query = state.query.trim().toLowerCase();
  return state.data.snapshot.examples.filter(
    (item) =>
      !query ||
      [item.example_id, item.prompt, item.task, item.status].some((value) =>
        String(value).toLowerCase().includes(query),
      ),
  );
}

function exampleList(items) {
  return items.length
    ? items
        .map(
          (
            item,
          ) => `<a class="lab-list-row ${state.route.id === item.example_id ? "selected" : ""}" href="#/examples/${encodeURIComponent(item.example_id)}">
        <span class="row-id">${escapeHtml(item.example_id)}</span><strong>${escapeHtml(item.prompt)}</strong>
        <span class="row-meta"><span class="badge">${escapeHtml(item.split)}</span><span class="badge status-${escapeHtml(item.status)}">${escapeHtml(label(item.status))}</span></span>
      </a>`,
        )
        .join("")
    : `<div class="empty">${escapeHtml(t("noExamples"))}</div>`;
}

function exampleDetail(example) {
  if (!example)
    return `<div class="detail-empty"><strong>${escapeHtml(t("selectExample"))}</strong><span>${escapeHtml(t("selectExampleCopy"))}</span></div>`;
  return `<div class="lab-detail">
    <a class="back-to-list" href="#/examples">${escapeHtml(t("backToList"))}</a>
    <div class="detail-actions-top"><span class="badge status-${escapeHtml(example.status)}">${escapeHtml(label(example.status))}</span><span class="badge">${escapeHtml(example.split)}</span></div>
    <div class="detail-heading"><span class="row-id">${escapeHtml(example.example_id)}</span><h2>${escapeHtml(example.task)}</h2></div>
    <section><h3>${escapeHtml(t("prompt"))}</h3><div class="prompt-block">${escapeHtml(example.prompt)}</div></section>
    <section><h3>${escapeHtml(t("idealResponse"))}</h3><pre class="json-block">${escapeHtml(example.ideal_response)}</pre></section>
    <section class="provenance"><h3>${escapeHtml(t("provenance"))}</h3><dl><dt>${escapeHtml(t("source"))}</dt><dd>${escapeHtml(example.source || "-")}</dd><dt>SHA</dt><dd>${escapeHtml(example.content_hash || "-")}</dd></dl></section>
    <section class="review-box">
      <label for="review-note">${escapeHtml(t("reviewNote"))}</label>
      <textarea id="review-note" rows="3" placeholder="${escapeHtml(t("reviewPlaceholder"))}">${escapeHtml(example.review_note)}</textarea>
      <div class="review-actions">
        <button class="primary" type="button" data-example-verdict="approve" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("approve"))}</button>
        <button type="button" data-example-verdict="request_changes" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("requestChanges"))}</button>
        <button class="danger-quiet" type="button" data-example-verdict="block" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("block"))}</button>
      </div>
    </section>
  </div>`;
}

function renderExamples() {
  const items = filteredExamples();
  const selected = items.find((item) => item.example_id === state.route.id) || null;
  els.title.textContent = t("examples");
  els.subtitle.textContent = `${items.length} ${t("examples").toLowerCase()}`;
  els.content.innerHTML = `<div class="lab-split"><section class="list-panel"><div class="list-header"><strong>${escapeHtml(t("datasetQueue"))}</strong><span>${number(items.filter((item) => item.status === "needs_review").length)} ${escapeHtml(t("needReview"))}</span></div><div class="lab-list">${exampleList(items)}</div></section><aside class="detail-panel">${exampleDetail(selected)}</aside></div>`;
}

function runRows(runs) {
  if (!runs.length) return `<div class="empty">${escapeHtml(t("noRuns"))}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>${escapeHtml(t("run"))}</th><th>${escapeHtml(t("model"))}</th><th>${escapeHtml(t("method"))}</th><th>${escapeHtml(t("status"))}</th><th>${escapeHtml(t("updated"))}</th></tr></thead><tbody>${runs.map((run) => `<tr><td><strong>${escapeHtml(run.title)}</strong><small>${escapeHtml(run.run_id)}</small></td><td>${escapeHtml(run.base_model)}</td><td><span class="badge">${escapeHtml(run.method)}</span></td><td><span class="badge status-${escapeHtml(run.status)}">${escapeHtml(label(run.status))}</span>${run.error ? `<small class="error-text">${escapeHtml(run.error)}</small>` : ""}</td><td>${escapeHtml(formatTime(run.completed_at || run.heartbeat_at || run.created_at))}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderRuns() {
  els.title.textContent = t("runs");
  els.subtitle.textContent = t("runsSubtitle");
  els.content.innerHTML = `<section class="overview-panel wide"><div class="boundary-note">${escapeHtml(t("workerBoundary"))}</div>${runRows(state.data.snapshot.runs)}</section>`;
}

function comparisonCard(comparison) {
  const adapter = comparison.adapter;
  const baseline = comparison.baseline;
  if (!adapter || !baseline) return "";
  return `<article class="evaluation-card">
    <div class="panel-heading"><div><span class="row-id">${escapeHtml(comparison.run_id)}</span><h2>${escapeHtml(t("baselineVsAdapter"))}</h2></div><span class="badge status-${escapeHtml(adapter.verdict || "needs_review")}">${escapeHtml(label(adapter.verdict || "needs_review", "verdict"))}</span></div>
    <div class="eval-grid"><span></span><strong>${escapeHtml(t("baseline"))}</strong><strong>${escapeHtml(t("adapter"))}</strong><span>${escapeHtml(t("jsonValid"))}</span><b>${number(baseline.json_valid_pct, 1)}%</b><b>${number(adapter.json_valid_pct, 1)}%</b><span>${escapeHtml(t("schemaValid"))}</span><b>${number(baseline.schema_valid_pct, 1)}%</b><b>${number(adapter.schema_valid_pct, 1)}%</b><span>${escapeHtml(t("exactFields"))}</span><b>${number(baseline.exact_field_pct, 1)}%</b><b>${number(adapter.exact_field_pct, 1)}%</b></div>
    <label>${escapeHtml(t("decisionNote"))}<textarea class="evaluation-note" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}" rows="2">${escapeHtml(adapter.decision_note)}</textarea></label>
    <div class="review-actions"><button class="primary" data-evaluation-verdict="promote" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("promote"))}</button><button data-evaluation-verdict="hold" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("hold"))}</button><button class="danger-quiet" data-evaluation-verdict="reject" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("reject"))}</button></div>
  </article>`;
}

function renderEvaluations() {
  els.title.textContent = t("evaluations");
  els.subtitle.textContent = t("evaluationsSubtitle");
  els.content.innerHTML = `<div class="evaluation-list">${state.data.snapshot.comparisons.map(comparisonCard).join("") || `<div class="empty">${escapeHtml(t("noEvaluation"))}</div>`}</div>`;
}

function renderRegistry() {
  els.title.textContent = t("registry");
  els.subtitle.textContent = t("registrySubtitle");
  els.content.innerHTML = `<div class="registry-grid">${state.data.snapshot.models.map((model) => `<article class="registry-item"><div class="panel-heading"><div><span class="row-id">${escapeHtml(model.model_id)}</span><h2>${escapeHtml(model.display_name)}</h2></div><span class="badge status-${escapeHtml(model.status)}">${escapeHtml(label(model.status))}</span></div><dl><dt>${escapeHtml(t("baseModel"))}</dt><dd>${escapeHtml(model.base_model)}</dd><dt>${escapeHtml(t("trainingRun"))}</dt><dd>${escapeHtml(model.training_run_id || "-")}</dd><dt>${escapeHtml(t("adapterFile"))}</dt><dd>${escapeHtml(model.adapter_file || "-")}</dd><dt>${escapeHtml(t("registered"))}</dt><dd>${escapeHtml(formatTime(model.registered_at))}</dd></dl><p>${escapeHtml(model.notes)}</p></article>`).join("")}</div>`;
}

function settingsModal() {
  const resources = state.data.resources || {};
  const settings = state.data.snapshot.settings || {};
  const tabs = ["guide", "resources", "training"];
  const panel =
    state.settingsTab === "resources"
      ? `<dl class="settings-list"><dt>${escapeHtml(t("provider"))}</dt><dd>${escapeHtml(state.data.data_provider)}</dd><dt>${escapeHtml(t("folder"))}</dt><dd>${escapeHtml(resources.folder_id || "-")}</dd><dt>${escapeHtml(t("bases"))}</dt><dd>${escapeHtml(Object.keys(resources.base_ids || {}).join(", ") || "-")}</dd></dl>`
      : state.settingsTab === "training"
        ? `<dl class="settings-list"><dt>${escapeHtml(t("baseModel"))}</dt><dd>${escapeHtml(settings.base_model || "-")}</dd><dt>${escapeHtml(t("method"))}</dt><dd>${escapeHtml(settings.method || "-")}</dd><dt>${escapeHtml(t("worker"))}</dt><dd>${escapeHtml(settings.local_worker?.status || "not reported")}</dd></dl>`
        : `<div class="guide-copy"><p>${escapeHtml(t("guideCopy"))}</p><ol><li>${escapeHtml(t("curateCopy"))}</li><li>${escapeHtml(t("snapshotCopy"))}</li><li>${escapeHtml(t("trainCopy"))}</li><li>${escapeHtml(t("evaluateCopy"))}</li></ol></div>`;
  return `<div class="modal-backdrop" data-close-settings><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("settings"))}"><header><div><span class="row-id">Kelly</span><h2>${escapeHtml(t("settings"))}</h2></div><button type="button" data-close-settings aria-label="${escapeHtml(t("close"))}" title="${escapeHtml(t("close"))}">X</button></header><div class="modal-tabs">${tabs.map((tab) => `<button type="button" class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}">${escapeHtml(t(tab))}</button>`).join("")}</div><div class="modal-body">${panel}</div></section></div>`;
}

function renderSettings() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = t("overviewSubtitle");
  renderOverview();
  document.body.insertAdjacentHTML("beforeend", settingsModal());
}

function render() {
  if (!state.data) return;
  document.querySelector(".modal-backdrop")?.remove();
  shell();
  if (state.route.view === "examples") renderExamples();
  else if (state.route.view === "runs") renderRuns();
  else if (state.route.view === "evaluations") renderEvaluations();
  else if (state.route.view === "registry") renderRegistry();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

async function reviewExample(id, verdict) {
  const example = state.data.snapshot.examples.find((item) => item.example_id === id);
  if (!example || state.busy) return;
  state.busy = true;
  try {
    const note = document.querySelector("#review-note")?.value || "";
    const provider = await getProvider();
    await provider.reviewExample(example, verdict, note);
    await loadState();
  } finally {
    state.busy = false;
  }
}

async function decideEvaluation(id, verdict) {
  const evaluation = state.data.snapshot.evaluations.find((item) => item.evaluation_id === id);
  if (!evaluation || state.busy) return;
  state.busy = true;
  try {
    const note = document.querySelector(`.evaluation-note[data-evaluation-id="${CSS.escape(id)}"]`)?.value || "";
    const provider = await getProvider();
    await provider.decideEvaluation(evaluation, verdict, note);
    await loadState();
  } finally {
    state.busy = false;
  }
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  setSidebarOpen(false);
  render();
});
window.addEventListener("resize", syncResponsive);
els.sidebarToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
els.mobileSidebarToggle.addEventListener("click", () => setSidebarOpen(true));
els.sidebarScrim.addEventListener("click", () => setSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-local-model-lab-language", state.lang);
  render();
});
document.addEventListener("click", (event) => {
  const exampleAction = event.target.closest("[data-example-verdict]");
  if (exampleAction) reviewExample(exampleAction.dataset.exampleId, exampleAction.dataset.exampleVerdict);
  const evaluationAction = event.target.closest("[data-evaluation-verdict]");
  if (evaluationAction)
    decideEvaluation(evaluationAction.dataset.evaluationId, evaluationAction.dataset.evaluationVerdict);
  const tab = event.target.closest("[data-settings-tab]");
  if (tab) {
    state.settingsTab = tab.dataset.settingsTab;
    render();
  }
  const close = event.target.closest("[data-close-settings]");
  if (close && (close === event.target || close.tagName === "BUTTON")) location.hash = "#/overview";
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadMessages();
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

boot();
