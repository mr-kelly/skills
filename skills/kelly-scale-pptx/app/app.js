import { messages } from "./i18n/messages.js";

const state = {
  data: null,
  route: { view: "overview", id: "" },
  query: "",
  lang: "en",
  edits: {},
};

const els = {
  title: document.getElementById("pageTitle"),
  subtitle: document.getElementById("pageSubtitle"),
  list: document.getElementById("listPanel"),
  detail: document.getElementById("detailPanel"),
  search: document.getElementById("searchInput"),
  attention: document.getElementById("attentionCount"),
  approved: document.getElementById("approvedCount"),
  ready: document.getElementById("readyCount"),
  mobileTitle: document.getElementById("mobileViewTitle"),
  mobileMeta: document.getElementById("mobileViewMeta"),
  sidebar: document.getElementById("appSidebar"),
  scrim: document.getElementById("sidebarScrim"),
  settings: document.getElementById("settingsDialog"),
  settingsContent: document.getElementById("settingsContent"),
  langSelect: document.getElementById("languageSelect"),
};

function pickLang() {
  const params = new URLSearchParams(location.search);
  const forced = params.get("lang") || localStorage.getItem("kelly-scale-pptx-language") || "auto";
  if (forced === "zh" || (forced === "auto" && navigator.language.toLowerCase().startsWith("zh"))) return "zh";
  return "en";
}

function t(key) {
  const parts = key.split(".");
  let value = messages[state.lang];
  for (const part of parts) value = value?.[part];
  if (value && typeof value === "object" && "_label" in value) return value._label;
  return value ?? key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || "overview";
  const [view = "overview", id = ""] = raw.split("/");
  state.route = { view, id: decodeURIComponent(id || "") };
}

function snapshot() {
  return state.data?.snapshot || {};
}
function projects() {
  return snapshot().projects || [];
}
function decks() {
  return snapshot().decks || [];
}
function slides() {
  return snapshot().slide_cards || [];
}
function reviews() {
  return snapshot().review_items || [];
}
function checks() {
  return snapshot().qa_checks || [];
}
function exportsList() {
  return snapshot().exports || [];
}
function styleSystems() {
  return snapshot().style_systems || [];
}

function projectById(id) {
  return projects().find((item) => item.project_id === id) || null;
}
function deckById(id) {
  return decks().find((item) => item.deck_id === id) || null;
}
function slideById(id) {
  return slides().find((item) => item.slide_id === id) || null;
}
function reviewByTarget(id) {
  return reviews().find((item) => item.target_id === id) || null;
}
function decisionFor(id) {
  const review = reviewByTarget(id) || reviews().find((item) => item.review_id === id);
  return review ? state.data?.decisions?.decisions?.[review.review_id] : null;
}
function effectiveStatus(item) {
  const decision = decisionFor(item.slide_id || item.deck_id || item.project_id || item.export_id || item.review_id);
  if (!decision) return item.status;
  if (decision.action === "approve") return "approved";
  if (decision.action === "request_changes") return "changes_requested";
  if (decision.action === "block") return "blocked";
  return item.status;
}
function statusLabel(status) {
  return t(`status.${status}`);
}
function typeLabel(type) {
  return t(`type.${type}`);
}
function statusBadge(status) {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}
function listCountMeta(count, label) {
  els.mobileMeta.textContent = `${count} ${label}`;
}
function date(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(state.lang === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function includesQuery(values) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) =>
    String(value || "")
      .toLowerCase()
      .includes(q),
  );
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.getAttribute("data-i18n"));
  });
  els.search.placeholder = t("search");
  els.langSelect.value = localStorage.getItem("kelly-scale-pptx-language") || "auto";
}

function applyDemoRoute() {
  if (location.hash) return;
  const demo = new URLSearchParams(location.search).get("demo");
  if (!demo) return;
  const scenes = new Set(["overview", "projects", "decks", "slides", "review", "style", "exports", "settings"]);
  const view = scenes.has(demo) ? demo : "overview";
  history.replaceState(null, "", `${location.pathname}${location.search}#/${view}`);
}

async function loadState() {
  state.lang = pickLang();
  applyI18n();
  const res = await fetch(`/api/state${location.search}`);
  state.data = await res.json();
  applyDemoRoute();
  updateAttention();
  render();
}

function updateAttention() {
  const needs = reviews().filter((item) =>
    ["needs_review", "changes_requested"].includes(effectiveStatus(item)),
  ).length;
  const approved = reviews().filter((item) => effectiveStatus(item) === "approved").length;
  const ready = decks().filter((item) => ["approved", "generated"].includes(effectiveStatus(item))).length;
  els.attention.textContent = String(needs);
  els.approved.textContent = String(approved);
  els.ready.textContent = String(ready);
}

function setTitle(title, subtitle = "") {
  els.title.textContent = title;
  els.subtitle.textContent = subtitle;
  els.mobileTitle.textContent = title;
}

function row({ href, active, eyebrow, title, meta, status, extra = "" }) {
  return `<a class="row ${active ? "active" : ""}" href="${href}">
    <span class="row-main"><small>${escapeHtml(eyebrow || "")}</small><strong>${escapeHtml(title || "")}</strong><em>${escapeHtml(meta || "")}</em></span>
    <span class="row-side">${status ? statusBadge(status) : ""}${extra}</span>
  </a>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderOverview() {
  const metrics = snapshot().metrics || {};
  setTitle(t("overview"), t("subtitle"));
  const reviewRows = reviews()
    .slice(0, 4)
    .map((item) => {
      const target = item.target_type === "slide" ? slideById(item.target_id) : deckById(item.target_id);
      return row({
        href: `#/review/${item.review_id}`,
        eyebrow: `${t("review")} #${item.ref}`,
        title: target?.title || item.target_id,
        meta: item.summary,
        status: effectiveStatus(item),
        active: false,
      });
    });
  els.list.innerHTML = `<div class="overview-grid">
    ${metric(t("projects"), metrics.project_count || 0)}
    ${metric(t("decks"), metrics.deck_count || 0)}
    ${metric(t("slides"), metrics.slide_count || 0)}
    ${metric(t("needsReview"), metrics.slides_needs_review || 0)}
    ${metric(t("decksGenerated"), metrics.decks_generated || 0)}
    ${metric(t("avgStyleScore"), `${metrics.avg_style_score || 0}`)}
  </div>
  <section class="panel"><h2>${t("humanQueue")}</h2><div class="rows">${reviewRows.join("")}</div></section>`;
  els.detail.innerHTML = renderStyleDetail(styleSystems()[0]);
  listCountMeta(reviews().length, t("review"));
}

function renderProjects() {
  const items = projects().filter((item) => includesQuery([item.title, item.course, item.stage, item.owner]));
  setTitle(t("projects"), `${items.length} ${t("projects")}`);
  els.list.innerHTML = `<div class="rows">${items.map((item) => row({ href: `#/projects/${item.project_id}`, active: state.route.id === item.project_id, eyebrow: `Project #${item.ref}`, title: item.title, meta: `${item.course} · ${item.deck_count} ${t("decks")} · ${item.slide_count} ${t("slides")}`, status: effectiveStatus(item) })).join("")}</div>`;
  els.detail.innerHTML = renderProjectDetail(projectById(state.route.id) || items[0]);
  listCountMeta(items.length, t("projects"));
}

function renderDecks() {
  const items = decks().filter((item) =>
    includesQuery([item.title, item.theme, item.level, projectById(item.project_id)?.title]),
  );
  setTitle(t("decks"), `${items.length} ${t("decks")}`);
  els.list.innerHTML = `<div class="rows">${items.map((item) => row({ href: `#/decks/${item.deck_id}`, active: state.route.id === item.deck_id, eyebrow: `Deck #${item.ref}`, title: item.title, meta: `${item.theme} · ${item.level} · ${item.approved_slide_count}/${item.target_slide_count} ${t("approved")}`, status: effectiveStatus(item), extra: `<small>${item.style_score}</small>` })).join("")}</div>`;
  els.detail.innerHTML = renderDeckDetail(deckById(state.route.id) || items[0]);
  listCountMeta(items.length, t("decks"));
}

function renderSlides() {
  const items = slides().filter((item) =>
    includesQuery([item.title, item.objective, item.slide_type, deckById(item.deck_id)?.title]),
  );
  setTitle(t("slideCards"), `${items.length} ${t("slideCards")}`);
  els.list.innerHTML = `<div class="rows">${items.map((item) => row({ href: `#/slides/${item.slide_id}`, active: state.route.id === item.slide_id, eyebrow: `${t("slide")} #${item.ref} · ${typeLabel(item.slide_type)}`, title: item.title, meta: `${deckById(item.deck_id)?.title || ""} · ${item.layout}`, status: effectiveStatus(item) })).join("")}</div>`;
  els.detail.innerHTML = renderSlideDetail(slideById(state.route.id) || items[0]);
  listCountMeta(items.length, t("slideCards"));
}

function renderReview() {
  const items = reviews().filter((item) => {
    const target = item.target_type === "slide" ? slideById(item.target_id) : deckById(item.target_id);
    return includesQuery([item.summary, item.draft_note, target?.title, item.target_type]);
  });
  setTitle(t("review"), `${items.length} ${t("review")}`);
  els.list.innerHTML = `<div class="rows">${items
    .map((item) => {
      const target = item.target_type === "slide" ? slideById(item.target_id) : deckById(item.target_id);
      return row({
        href: `#/review/${item.review_id}`,
        active: state.route.id === item.review_id,
        eyebrow: `${t("review")} #${item.ref} · ${item.target_type}`,
        title: target?.title || item.target_id,
        meta: item.summary,
        status: effectiveStatus(item),
      });
    })
    .join("")}</div>`;
  els.detail.innerHTML = renderReviewDetail(reviews().find((item) => item.review_id === state.route.id) || items[0]);
  attachDecisionHandlers();
  listCountMeta(items.length, t("review"));
}

function renderStyle() {
  setTitle(t("styleSystem"), `${styleSystems().length} ${t("styleSystem")}`);
  els.list.innerHTML = `<div class="rows">${styleSystems()
    .map((item) =>
      row({
        href: `#/style/${item.style_system_id}`,
        active: state.route.id === item.style_system_id,
        eyebrow: t("styleSystem"),
        title: item.name,
        meta: `${item.palette.length} ${t("palette")} · ${item.component_library.length} ${t("components")}`,
        status: "approved",
      }),
    )
    .join("")}</div>`;
  els.detail.innerHTML = renderStyleDetail(
    styleSystems().find((item) => item.style_system_id === state.route.id) || styleSystems()[0],
  );
  listCountMeta(styleSystems().length, t("styleSystem"));
}

function renderExports() {
  const items = exportsList().filter((item) =>
    includesQuery([item.path, item.qa_summary, deckById(item.deck_id)?.title]),
  );
  setTitle(t("exports"), `${items.length} ${t("exports")}`);
  els.list.innerHTML = `<div class="rows">${items.map((item) => row({ href: `#/exports/${item.export_id}`, active: state.route.id === item.export_id, eyebrow: item.format.toUpperCase(), title: deckById(item.deck_id)?.title || item.deck_id, meta: item.path, status: item.status })).join("")}</div>`;
  els.detail.innerHTML = renderExportDetail(
    exportsList().find((item) => item.export_id === state.route.id) || items[0],
  );
  listCountMeta(items.length, t("exports"));
}

function detailShell(title, body, actions = "") {
  return `<button class="back-to-list" type="button" data-back>${t("back")}</button><div class="detail-head"><div><small>${t("target")}</small><h2>${escapeHtml(title || t("noSelection"))}</h2></div>${actions}</div>${body || ""}`;
}

function renderProjectDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  const projectDecks = decks().filter((deck) => deck.project_id === item.project_id);
  return detailShell(
    item.title,
    `<dl class="facts"><dt>${t("brand")}</dt><dd>${snapshot().brand_profiles?.find((brand) => brand.client_id === item.client_id)?.name || item.client_id}</dd><dt>${t("status")}</dt><dd>${statusBadge(effectiveStatus(item))}</dd><dt>${t("decks")}</dt><dd>${item.deck_count}</dd><dt>${t("slides")}</dt><dd>${item.slide_count}</dd><dt>${t("generatedAt")}</dt><dd>${date(item.updated_at)}</dd></dl><h3>${t("decks")}</h3><div class="mini-list">${projectDecks.map((deck) => `<a href="#/decks/${deck.deck_id}">${escapeHtml(deck.title)} ${statusBadge(effectiveStatus(deck))}</a>`).join("")}</div>`,
  );
}

function renderDeckDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  const deckSlides = slides().filter((slide) => slide.deck_id === item.deck_id);
  const deckChecks = checks().filter((check) => check.target_id === item.deck_id);
  return detailShell(
    item.title,
    `<dl class="facts"><dt>${t("projects")}</dt><dd>${projectById(item.project_id)?.title || item.project_id}</dd><dt>${t("status")}</dt><dd>${statusBadge(effectiveStatus(item))}</dd><dt>${t("slides")}</dt><dd>${item.generated_slide_count}/${item.target_slide_count} ${t("generated")}</dd><dt>${t("avgStyleScore")}</dt><dd>${item.style_score}</dd><dt>PPTX</dt><dd>${escapeHtml(item.pptx_path || "")}</dd><dt>${t("renderPath")}</dt><dd>${escapeHtml(item.render_path || "")}</dd></dl><h3>${t("slideCards")}</h3><div class="mini-list">${deckSlides.map((slide) => `<a href="#/slides/${slide.slide_id}">${escapeHtml(slide.title)} ${statusBadge(effectiveStatus(slide))}</a>`).join("")}</div><h3>${t("checks")}</h3>${renderChecks(deckChecks)}`,
  );
}

function renderSlideDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  const c = item.content || {};
  const review = reviewByTarget(item.slide_id);
  const reviewLink = review ? `<a class="small-link" href="#/review/${review.review_id}">${t("review")}</a>` : "";
  return detailShell(
    item.title,
    `<dl class="facts"><dt>${t("deck")}</dt><dd>${deckById(item.deck_id)?.title || item.deck_id}</dd><dt>${t("status")}</dt><dd>${statusBadge(effectiveStatus(item))}</dd><dt>${t("layout")}</dt><dd>${escapeHtml(item.layout)}</dd><dt>${t("content")}</dt><dd>${escapeHtml(typeLabel(item.slide_type))}</dd></dl><section class="slide-preview"><h3>${escapeHtml(c.title || item.title)}</h3>${c.subtitle ? `<p>${escapeHtml(c.subtitle)}</p>` : ""}<div class="zh-line">${escapeHtml(c.chinese || "")}</div><div class="pinyin-line">${escapeHtml(c.pinyin || "")}</div><div class="en-line">${escapeHtml(c.english || "")}</div></section><h3>${t("summary")}</h3><p>${escapeHtml(item.objective)}</p>${section(t("interaction"), c.interaction)}${section(t("teacherNotes"), c.teacher_notes)}${section(t("assetBrief"), item.asset_brief)}${listSection(t("styleChecks"), item.style_checks)}${listSection(t("qaFlags"), item.qa_flags)}${reviewLink}`,
  );
}

function renderReviewDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  const target = item.target_type === "slide" ? slideById(item.target_id) : deckById(item.target_id);
  const decision = state.data?.decisions?.decisions?.[item.review_id];
  const note = state.edits[`review:${item.review_id}`] ?? decision?.comment ?? item.draft_note ?? "";
  const actions = `<div class="action-row"><button data-action="approve" data-review="${item.review_id}">${t("approve")}</button><button data-action="request_changes" data-review="${item.review_id}">${t("requestChanges")}</button><button data-action="revise" data-review="${item.review_id}">${t("saveRevision")}</button><button class="danger" data-action="block" data-review="${item.review_id}">${t("block")}</button></div>`;
  return detailShell(
    target?.title || item.target_id,
    `<dl class="facts"><dt>${t("target")}</dt><dd>${item.target_type} · ${item.target_id}</dd><dt>${t("status")}</dt><dd>${statusBadge(effectiveStatus(item))}</dd><dt>${t("summary")}</dt><dd>${escapeHtml(item.summary)}</dd></dl>${listSection(t("suggestions"), item.suggestions)}<label class="field"><span>${t("reviewNote")}</span><textarea rows="6" data-review-note="${item.review_id}" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}">${escapeHtml(note)}</textarea></label>`,
    actions,
  );
}

function renderStyleDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  return detailShell(
    item.name,
    `<h3>${t("palette")}</h3><div class="swatches">${item.palette.map((color) => `<span style="--swatch:${escapeHtml(color)}"><b></b><em>${escapeHtml(color)}</em></span>`).join("")}</div><dl class="facts"><dt>Heading</dt><dd>${escapeHtml(item.fonts?.heading || "")}</dd><dt>Body</dt><dd>${escapeHtml(item.fonts?.body || "")}</dd><dt>Chinese</dt><dd>${escapeHtml(item.fonts?.chinese || "")}</dd></dl>${listSection(t("visualRules"), item.visual_rules)}${listSection(t("layoutRules"), item.layout_rules)}${listSection(t("components"), item.component_library)}`,
  );
}

function renderExportDetail(item) {
  if (!item) return detailShell(t("noSelection"), "");
  return detailShell(
    deckById(item.deck_id)?.title || item.deck_id,
    `<dl class="facts"><dt>${t("export")}</dt><dd>${item.format.toUpperCase()}</dd><dt>${t("status")}</dt><dd>${statusBadge(item.status)}</dd><dt>PPTX</dt><dd>${escapeHtml(item.path)}</dd><dt>${t("renderPath")}</dt><dd>${escapeHtml(item.render_path || deckById(item.deck_id)?.render_path || "")}</dd><dt>${t("generatedAt")}</dt><dd>${date(item.generated_at)}</dd><dt>QA</dt><dd>${escapeHtml(item.qa_summary || "")}</dd></dl>${renderChecks(checks().filter((check) => check.target_id === item.deck_id || check.target_id === item.export_id))}`,
  );
}

function renderChecks(items) {
  if (!items.length) return `<p class="muted">${t("checks")}: 0</p>`;
  return `<div class="check-list">${items.map((item) => `<div><span class="status status-${escapeHtml(item.result)}">${escapeHtml(item.result)}</span><strong>${escapeHtml(item.rule)}</strong><p>${escapeHtml(item.evidence)}</p></div>`).join("")}</div>`;
}
function section(title, body) {
  return body ? `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>` : "";
}
function listSection(title, items = []) {
  if (!items.length) return "";
  return `<h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function settingsHtml() {
  const summary = state.data?.config_summary || {};
  return `<h2>${t("settings")}</h2><dl class="facts"><dt>${t("dataProvider")}</dt><dd>${state.data?.data_provider || ""}</dd><dt>${t("onboarding")}</dt><dd>${state.data?.onboarding?.completed ? "complete" : "pending"}</dd><dt>${t("outDir")}</dt><dd>${escapeHtml(summary.export?.out_dir || "")}</dd><dt>${t("renderDir")}</dt><dd>${escapeHtml(summary.export?.render_dir || "")}</dd><dt>${t("requireRenderQa")}</dt><dd>${String(summary.export?.require_render_qa ?? "")}</dd></dl>${listSection(
    t("brand"),
    (summary.brand_profiles || []).map((item) => `${item.name} · ${item.audience}`),
  )}${listSection(
    t("styleSystem"),
    styleSystems().map((item) => item.name),
  )}`;
}

function renderSettings() {
  els.settingsContent.innerHTML = settingsHtml();
}

function renderSettingsView() {
  setTitle(t("settings"));
  els.list.innerHTML = `<section class="panel settings-panel">${settingsHtml()}</section>`;
  els.detail.innerHTML = "";
}

function render() {
  parseRoute();
  document.body.classList.remove("mobile-detail-open");
  document
    .querySelectorAll(".filters a")
    .forEach((node) => node.classList.toggle("active", node.dataset.route === state.route.view));
  if (state.route.view === "projects") renderProjects();
  else if (state.route.view === "decks") renderDecks();
  else if (state.route.view === "slides") renderSlides();
  else if (state.route.view === "review") renderReview();
  else if (state.route.view === "style") renderStyle();
  else if (state.route.view === "exports") renderExports();
  else if (state.route.view === "settings") renderSettingsView();
  else renderOverview();
  if (state.route.id) document.body.classList.add("mobile-detail-open");
  document
    .querySelectorAll("[data-back]")
    .forEach((button) => button.addEventListener("click", () => document.body.classList.remove("mobile-detail-open")));
}

function attachDecisionHandlers() {
  document.querySelectorAll("[data-review-note]").forEach((node) => {
    node.addEventListener("input", () => {
      state.edits[`review:${node.dataset.reviewNote}`] = node.value;
    });
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reviewId = button.dataset.review;
      const note = document.querySelector(`[data-review-note="${CSS.escape(reviewId)}"]`)?.value || "";
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ review_id: reviewId, action: button.dataset.action, comment: note, draft: note }),
      });
      const body = await res.json();
      if (!res.ok) alert(body.error || "Could not save decision");
      else {
        state.data.decisions = body.decisions;
        updateAttention();
        renderReview();
      }
    });
  });
}

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
window.addEventListener("hashchange", render);

function openSidebar() {
  document.body.classList.add("sidebar-open");
  els.scrim.hidden = false;
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  els.scrim.hidden = true;
}
document.getElementById("mobileSidebarToggle").addEventListener("click", openSidebar);
document
  .getElementById("sidebarToggle")
  .addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
els.scrim.addEventListener("click", closeSidebar);
document.querySelectorAll(".filters a").forEach((node) => node.addEventListener("click", closeSidebar));
document.getElementById("settingsBtn").addEventListener("click", () => {
  renderSettings();
  els.settings.showModal();
});
document.getElementById("mobileSettingsBtn").addEventListener("click", () => {
  renderSettings();
  els.settings.showModal();
});
els.langSelect.addEventListener("change", () => {
  localStorage.setItem("kelly-scale-pptx-language", els.langSelect.value);
  state.lang = pickLang();
  applyI18n();
  render();
});

await loadState();
