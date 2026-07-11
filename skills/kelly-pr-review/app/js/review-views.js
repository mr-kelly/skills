import {
  $,
  actionBadge,
  api,
  escapeHtml,
  isMobileLayout,
  languageMode,
  loadState,
  navigateTo,
  renderLock,
  reviewStore,
  setLanguageMode,
  setMobileDetailOpen,
  state,
  statusBadge,
  syncRoute,
  t,
  testedBadge,
  timeAgo,
  toast,
} from "../app.js";
export function renderList() {
  const list = $("prList");
  if (!state.items.length) {
    list.innerHTML = `<div class="empty-detail">${escapeHtml(t("empty.list"))}</div>`;
    renderDetail();
    return;
  }
  if (!reviewStore.selectedId || !state.items.some((item) => item.id === reviewStore.selectedId)) {
    reviewStore.selectedId = state.items[0].id;
    syncRoute({ push: false });
  }
  list.innerHTML = state.items
    .map(
      (item) => `
    <button class="pr-row ${item.id === reviewStore.selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
      <a class="pr-open-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="${escapeHtml(t("open_pr"))}" aria-label="${escapeHtml(t("open_pr"))} ${escapeHtml(item.repo)} #${escapeHtml(item.number)}">↗</a>
      <span>
        <div class="pr-title">${escapeHtml(item.title)}</div>
        <div class="pr-meta">${escapeHtml(item.review_ref || "")} · ${escapeHtml(item.author || "unknown")} · ${escapeHtml(item.repo)} #${escapeHtml(item.number)}</div>
      </span>
      <span class="status-stack">${statusBadge(item)}${testedBadge(item)}</span>
      <span class="changes"><span class="plus">+${escapeHtml(item.additions)}</span> <span class="minus">−${escapeHtml(item.deletions)}</span></span>
      <span class="muted">${escapeHtml(timeAgo(item.updated_at))}</span>
    </button>
  `,
    )
    .join("");
  list.querySelectorAll(".pr-row").forEach((row) => {
    row.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ selectedId: row.dataset.id });
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
  return state.items.find((item) => item.id === reviewStore.selectedId) || null;
}

function riskHtml(item) {
  const risks = item.risk?.length ? item.risk : [t("normal")];
  return risks
    .map((risk) => `<span class="badge ${risk === "normal" ? "" : "warn"}">${escapeHtml(risk)}</span>`)
    .join("");
}

function filesHtml(item) {
  const files = (item.changed_files || []).slice(0, 18);
  if (!files.length) return `<span class="muted">${escapeHtml(t("no_changed_files"))}</span>`;
  const extra =
    item.changed_files.length > files.length
      ? `<span class="badge">+${item.changed_files.length - files.length} ${escapeHtml(t("more"))}</span>`
      : "";
  return `${files.map((file) => `<code>${escapeHtml(file)}</code>`).join("")}${extra}`;
}

function evidenceHtml(item) {
  const evidence = item.test_evidence || [];
  if (!evidence.length) return "";
  return `
    <div class="evidence-grid">
      ${evidence
        .map(
          (file) => `
        <a href="${escapeHtml(file.url || "")}" target="_blank" rel="noopener">
          <img src="${escapeHtml(file.url || "")}" alt="${escapeHtml(file.filename || t("tested.screenshot"))}" />
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function testSectionHtml(item) {
  if (!item.merged && item.status !== "merged") return "";
  const testedText = item.tested ? t("tested.at", { time: timeAgo(item.tested_at) }) : t("tested.not_yet");
  const mergedText = item.merged_at ? t("merged.at", { time: timeAgo(item.merged_at) }) : "";
  return `
    <section class="section tested-section">
      <h2>${escapeHtml(t("tested.title"))}</h2>
      <p>${escapeHtml(t("tested.body"))}</p>
      <textarea id="testNote" class="comment-box" placeholder="${escapeHtml(t("tested.note.placeholder"))}">${escapeHtml(item.test_note || "")}</textarea>
      <label class="upload-control">
        <span>${escapeHtml(t("tested.screenshot"))}</span>
        <input id="testEvidence" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
      </label>
      ${evidenceHtml(item)}
      <div class="tested-controls">
        <button class="${item.tested ? "" : "primary"}" data-tested="${item.tested ? "false" : "true"}">${escapeHtml(t(item.tested ? "tested.unmark" : "tested.mark"))}</button>
        <span class="muted">${escapeHtml([testedText, mergedText].filter(Boolean).join(" · "))}</span>
      </div>
    </section>
  `;
}

export function renderDetail() {
  const panel = $("detailPanel");
  const item = selectedItem();
  if (!item) {
    panel.innerHTML = `<button class="back-to-list" type="button">← ${escapeHtml(t("page.inbox"))}</button><div class="empty-detail">${escapeHtml(t("empty.detail"))}</div>`;
    return;
  }
  panel.innerHTML = `
    <button class="back-to-list" type="button">← ${escapeHtml(t("page.inbox"))}</button>
    <div class="detail-head">
      <h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <div class="detail-meta">
        <span>${escapeHtml(item.repo)} #${escapeHtml(item.number)}</span>
        <span>${escapeHtml(item.author || t("unknown"))}</span>
        <a class="detail-open-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(t("open_pr"))}</a>
      </div>
    </div>
    <div class="detail-body">
      <section class="section">
        <h2>${escapeHtml(t("recommendation"))}</h2>
        <div class="action-row">${actionBadge(item.proposed_action)} ${statusBadge(item)} ${testedBadge(item)}</div>
        <p>${escapeHtml(item.reason || item.summary || t("no.recommendation"))}</p>
      </section>
      ${testSectionHtml(item)}
      <section class="section">
        <h2>${escapeHtml(t("risk"))}</h2>
        <div class="risk-list">${riskHtml(item)}</div>
      </section>
      <section class="section">
        <h2>${escapeHtml(t("changed_files"))}</h2>
        <div class="file-list">${filesHtml(item)}</div>
      </section>
      <section class="section">
        <h2>${escapeHtml(t("review_body"))}</h2>
        <textarea id="reviewBody">${escapeHtml(item.review_body || "")}</textarea>
      </section>
      <section class="section">
        <h2>${escapeHtml(t("review_note"))}</h2>
        <textarea id="reviewComment" class="comment-box">${escapeHtml(item.decision?.comment || "")}</textarea>
      </section>
      ${item.patch_excerpt ? `<section class="section"><h2>${escapeHtml(t("patch_excerpt"))}</h2><pre class="patch">${escapeHtml(item.patch_excerpt)}</pre></section>` : ""}
      <section class="section">
        <h2>${escapeHtml(t("action"))}</h2>
        <div class="action-row">
          <button class="primary" data-action="approve">${escapeHtml(t("action.approve"))}</button>
          <button data-action="comment">${escapeHtml(t("action.comment"))}</button>
          <button class="danger" data-action="request_changes">${escapeHtml(t("action.request_changes"))}</button>
          <button data-action="no_action">${escapeHtml(t("action.no_action"))}</button>
          <button data-action="needs_review">${escapeHtml(t("action.needs_review"))}</button>
          <button class="danger" data-action="block">${escapeHtml(t("action.block"))}</button>
        </div>
      </section>
    </div>
  `;
  $("reviewBody").addEventListener("input", scheduleSaveDetail);
  $("reviewComment").addEventListener("input", scheduleSaveDetail);
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => decide(button.dataset.action));
  });
  panel.querySelector("[data-tested]")?.addEventListener("click", (event) => {
    setTestedStatus(event.currentTarget.dataset.tested === "true").catch((error) => toast(error.message));
  });
  renderLock();
}

function scheduleSaveDetail() {
  clearTimeout(reviewStore.saveTimer);
  reviewStore.saveTimer = setTimeout(saveDetail, 450);
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
  toast(t("decision.saved"));
  await loadState();
}

async function setTestedStatus(tested) {
  const item = selectedItem();
  if (!item) return;
  const note = $("testNote")?.value.trim() || "";
  const evidenceInput = $("testEvidence");
  const files = evidenceInput?.files ? Array.from(evidenceInput.files) : [];
  if (tested && !note && !files.length && !(item.test_evidence || []).length) {
    toast(t("tested.need_evidence"));
    return;
  }
  const evidence = await Promise.all(files.map(fileToPayload));
  await api("/api/tested", { id: item.id, tested, note, evidence });
  toast(t("tested.saved"));
  await loadState();
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve({
        filename: file.name,
        content_type: file.type,
        base64: result.split(",")[1] || "",
      });
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read screenshot.")));
    reader.readAsDataURL(file);
  });
}

function helpHtml() {
  const summary = state.config_summary || {};
  const repos = (summary.repos || []).map((repo) => `<span class="badge">${escapeHtml(repo.repo)}</span>`).join(" ");
  return `
    <label class="language-control" for="languageSelect">
      <span>${escapeHtml(t("language"))}</span>
      <select id="languageSelect">
        <option value="auto"${languageMode === "auto" ? " selected" : ""}>${escapeHtml(t("language.auto"))}</option>
        <option value="en"${languageMode === "en" ? " selected" : ""}>${escapeHtml(t("language.english"))}</option>
        <option value="zh-CN"${languageMode === "zh-CN" ? " selected" : ""}>${escapeHtml(t("language.chinese"))}</option>
      </select>
    </label>
    <p>${escapeHtml(t("help.body"))}</p>
    <dl>
      <dt>${escapeHtml(t("data_reader"))}</dt><dd><code>${escapeHtml(summary.reader || "local")}</code></dd>
      <dt>${escapeHtml(t("config_source"))}</dt><dd><code>${escapeHtml(summary.source || t("not_configured"))}</code></dd>
      <dt>${escapeHtml(t("batch_file"))}</dt><dd><code>${escapeHtml(state.batch_path || "")}</code></dd>
      <dt>${escapeHtml(t("decision_file"))}</dt><dd><code>${escapeHtml(state.decisions_path || "")}</code></dd>
      <dt>${escapeHtml(t("filter.tested"))}</dt><dd><code>${escapeHtml(state.tested_path || "")}</code></dd>
      <dt>${escapeHtml(t("execution_report"))}</dt><dd><code>${escapeHtml(state.execution_report_path || "")}</code></dd>
      <dt>${escapeHtml(t("reviewer"))}</dt><dd><code>${escapeHtml(summary.reviewer?.handle || "@me")}</code></dd>
      <dt>${escapeHtml(t("repositories"))}</dt><dd>${repos || `<span class="muted">${escapeHtml(t("no_repos"))}</span>`}</dd>
    </dl>
    <p>${escapeHtml(t("help.flow"))}</p>
  `;
}

export function openHelp() {
  $("helpBody").innerHTML = helpHtml();
  $("languageSelect")?.addEventListener("change", (event) => setLanguageMode(event.target.value));
  $("helpModal").classList.remove("is-hidden");
  $("helpModal").setAttribute("aria-hidden", "false");
}

export function closeHelp() {
  $("helpModal").classList.add("is-hidden");
  $("helpModal").setAttribute("aria-hidden", "true");
}
