import {
  bindEditorActions,
  buildRepository,
  channelInitial,
  editorStore,
  els,
  escapeAttr,
  escapeHtml,
  loadState,
  navigateTo,
  state,
  syncRoute,
  t,
  withContextParams,
} from "../app.js";
export function renderTopics(repo) {
  const selected = repo.topics.find((topic) => topic.id === editorStore.selectedTopicId) || repo.topics[0];
  editorStore.selectedTopicId = selected?.id || null;
  editorStore.selectedDirectionId = selected?.directions?.some(
    (direction) => direction.id === editorStore.selectedDirectionId,
  )
    ? editorStore.selectedDirectionId
    : getSelectedDirection(selected)?.id || selected?.directions?.[0]?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">${escapeHtml(t("subject.discovery"))}</p>
        <h2>${escapeHtml(t("topics.pool"))}</h2>
      </div>
      <button class="quietButton" title="${escapeAttr(t("refresh.subjects.title"))}">${escapeHtml(t("refresh"))}</button>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.topics.map((topic) => topicRow(topic, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? topicDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("topic", (id) => {
    navigateTo({ stage: "topics", topicId: id, directionId: null });
  });
  bindRecordSelection("direction", (id) => {
    navigateTo({ stage: "topics", directionId: id });
  });
  const confirmButton = els.stagePanel.querySelector("[data-action='confirm-direction']");
  confirmButton?.addEventListener("click", () => confirmDirection(selected?.id, editorStore.selectedDirectionId));
}

function topicRow(topic, selectedId) {
  return `
    <button class="recordRow ${topic.id === selectedId ? "selected" : ""}" data-topic="${escapeAttr(topic.id)}">
      <span class="statusDot ${topic.status}"></span>
      <strong>${escapeHtml(topic.title)}</strong>
      <small>${escapeHtml(topic.source)} · ${topic.directions?.length || 0} ${escapeHtml(t("directions"))} · ${escapeHtml(t("score"))} ${topic.score || "-"}</small>
    </button>
  `;
}

function topicDetail(topic) {
  const directions = topic.directions || [];
  const selectedDirection =
    directions.find((direction) => direction.id === editorStore.selectedDirectionId) || directions[0];
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(topic.source)}</span>
        <span class="pill">${escapeHtml(statusLabel(topic.status))}</span>
      </div>
      <button class="primaryButton" data-action="confirm-direction" title="${escapeAttr(t("confirm.direction.title"))}">${escapeHtml(t("confirm.direction"))}</button>
    </div>
    <h2>${escapeHtml(topic.title)}</h2>
    <dl class="metaGrid">
      <div><dt>${escapeHtml(t("audience"))}</dt><dd>${escapeHtml(topic.audience || "-")}</dd></div>
      <div><dt>${escapeHtml(t("score"))}</dt><dd>${escapeHtml(topic.score || "-")}</dd></div>
    </dl>
    <section class="sectionBlock">
      <h3>${escapeHtml(t("subject"))}</h3>
      <p>${escapeHtml(topic.subject || topic.title || "")}</p>
    </section>
    <div class="directionLayout">
      <div class="directionList">
        ${directions.map((direction) => directionCard(direction, selectedDirection?.id)).join("")}
      </div>
      <section class="directionPreview">
        <p class="eyebrow">${escapeHtml(t("selected.direction"))}</p>
        <h3>${escapeHtml(selectedDirection?.title || t("no.direction"))}</h3>
        <p>${escapeHtml(selectedDirection?.description || t("choose.direction"))}</p>
        <dl class="miniMeta">
          <div><dt>${escapeHtml(t("angle"))}</dt><dd>${escapeHtml(selectedDirection?.angle || "-")}</dd></div>
          <div><dt>${escapeHtml(t("status"))}</dt><dd>${escapeHtml(statusLabel(selectedDirection?.status) || "-")}</dd></div>
        </dl>
      </section>
    </div>
    <section class="sectionBlock">
      <h3>${escapeHtml(t("evidence"))}</h3>
      <p>${escapeHtml(topic.evidence || t("no.evidence"))}</p>
    </section>
  `;
}

export function renderTodos(repo) {
  const selected = repo.todos.find((todo) => todo.id === editorStore.selectedTodoId) || repo.todos[0];
  editorStore.selectedTodoId = selected?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">${escapeHtml(t("production.queue"))}</p>
        <h2>${escapeHtml(t("todos.title"))}</h2>
      </div>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.todos.map((todo) => todoRow(todo, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? todoDetail(selected) : `<p class="mutedText">${escapeHtml(t("todos.empty"))}</p>`}
      </article>
    </div>
  `;
  bindRecordSelection("todo", (id) => {
    navigateTo({ stage: "todos", todoId: id });
  });
}

function todoRow(todo, selectedId) {
  return `
    <button class="recordRow ${todo.id === selectedId ? "selected" : ""}" data-todo="${escapeAttr(todo.id)}">
      <span class="statusDot ${todo.status}"></span>
      <strong>${escapeHtml(todo.title)}</strong>
      <small>${escapeHtml(todo.statusLabel)} · ${escapeHtml(todo.assignee || t("ai.writer"))}</small>
    </button>
  `;
}

function todoDetail(todo) {
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(todo.statusLabel)}</span>
        <span class="pill">${escapeHtml(todo.source || t("local"))}</span>
      </div>
    </div>
    <h2>${escapeHtml(todo.title)}</h2>
    <p class="leadText">${escapeHtml(todo.description)}</p>
    <dl class="metaGrid">
      <div><dt>${escapeHtml(t("subject"))}</dt><dd>${escapeHtml(todo.subject || "-")}</dd></div>
      <div><dt>${escapeHtml(t("assignee"))}</dt><dd>${escapeHtml(todo.assignee || t("ai.writer"))}</dd></div>
    </dl>
    <section class="sectionBlock">
      <h3>${escapeHtml(t("next.action"))}</h3>
      <p>${escapeHtml(t("todo.next.agent"))}</p>
    </section>
  `;
}

function directionCard(direction, selectedId) {
  return `
    <button class="directionCard ${direction.id === selectedId ? "selected" : ""}" data-direction="${escapeAttr(direction.id)}">
      <span>${escapeHtml(statusLabel(direction.status || "ready"))}</span>
      <strong>${escapeHtml(direction.title)}</strong>
      <small>${escapeHtml(direction.description)}</small>
    </button>
  `;
}

export function renderMainContent(repo) {
  const main = repo.main;
  if (!main) {
    els.stagePanel.innerHTML = `<p class="mutedText">${escapeHtml(t("main.empty"))}</p>`;
    return;
  }
  const coverImage = main.cover_image || main.cover_url || "";
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">${escapeHtml(t("canonical.draft"))}</p>
        <h2>${escapeHtml(t("main.title"))}</h2>
      </div>
      <button class="primaryButton" data-action="request-distribution" title="${escapeAttr(t("distribute.title"))}">${escapeHtml(t("distribute"))}</button>
    </div>
    <article class="mainPreview">
      <div class="coverFrame ${coverImage ? "hasImage" : ""}">
        ${coverImage ? `<img class="coverImage" src="${escapeAttr(coverImage)}" alt="${escapeAttr(main.hero_alt || main.title)}">` : ""}
        <div class="coverMeta">
          <span>${escapeHtml(t("cover"))}</span>
          <strong>${escapeHtml(main.cover_brief || main.hero_alt || t("visual.brief"))}</strong>
        </div>
      </div>
      <div class="articleShell">
        <span class="pill">${escapeHtml(statusLabel(main.status || "draft"))}</span>
        <h1>${escapeHtml(main.title)}</h1>
        <p class="dek">${escapeHtml(main.dek || "")}</p>
        <div class="articleBody">${main.html || `<p>${escapeHtml(main.body || "")}</p>`}</div>
      </div>
    </article>
    <dialog class="workflowDialog" id="distributionDialog">
      <form method="dialog" id="distributionForm">
        <div class="dialogHead">
          <div>
            <p class="eyebrow">${escapeHtml(t("distribution.request"))}</p>
            <h2>${escapeHtml(t("distribution.request.title"))}</h2>
          </div>
          <button class="iconButton" value="cancel" aria-label="${escapeAttr(t("close"))}" title="${escapeAttr(t("close"))}">×</button>
        </div>
        <label>${escapeHtml(t("distribution.note"))}
          <textarea id="distributionNote" required placeholder="${escapeAttr(t("distribution.note.placeholder"))}"></textarea>
        </label>
        <div class="dialogActions">
          <button class="quietButton" value="cancel">${escapeHtml(t("cancel"))}</button>
          <button class="primaryButton" type="submit" value="submit">${escapeHtml(t("send.distribution"))}</button>
        </div>
      </form>
    </dialog>
  `;
  bindDistributionDialog();
}

export function renderDistribution(repo) {
  const selected =
    repo.distribution.find((item) => item.id === editorStore.selectedDistributionId) || repo.distribution[0];
  editorStore.selectedDistributionId = selected?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">${escapeHtml(t("channel.adaptation"))}</p>
        <h2>${escapeHtml(t("distribution.title"))}</h2>
      </div>
      <div class="toolbar">
        <button class="quietButton" title="${escapeAttr(t("validate.title"))}">${escapeHtml(t("validate"))}</button>
        <button class="primaryButton" title="${escapeAttr(t("export.title"))}">${escapeHtml(t("export"))}</button>
      </div>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.distribution.map((item) => distributionRow(item, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? distributionDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("distribution", (id) => {
    navigateTo({ stage: "distribution", distributionId: id });
  });
  bindEditorActions(selected?.id);
}

function distributionRow(item, selectedId) {
  return `
    <button class="recordRow ${item.id === selectedId ? "selected" : ""}" data-distribution="${escapeAttr(item.id)}">
      <span class="channelMark">${escapeHtml(channelInitial(item.channel))}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.channel)} · ${escapeHtml(item.readiness)}</small>
    </button>
  `;
}

function distributionDetail(item) {
  const decision = state.decisions[item.id] || {};
  const title = decision.title || item.title || "";
  const body = decision.body || item.body || "";
  const comment = decision.comment || "";
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(item.channel)}</span>
        <span class="pill">${escapeHtml(statusLabel(item.status))}</span>
      </div>
      <div class="actions">
        <button data-action="approve" title="${escapeAttr(t("approve.title"))}">${escapeHtml(t("approve"))}</button>
        <button data-action="revise" title="${escapeAttr(t("save.title"))}">${escapeHtml(t("save"))}</button>
        <button data-action="request_changes" title="${escapeAttr(t("request.changes.title"))}">${escapeHtml(t("request.changes"))}</button>
        <button data-action="block" title="${escapeAttr(t("block.title"))}">${escapeHtml(t("block"))}</button>
      </div>
    </div>
    <label>${escapeHtml(t("title"))}
      <input id="titleInput" value="${escapeAttr(title)}">
    </label>
    <label>${escapeHtml(t("draft"))}
      <textarea id="bodyInput">${escapeHtml(body)}</textarea>
    </label>
    <label>${escapeHtml(t("review.note"))}
      <textarea id="commentInput" class="note">${escapeHtml(comment)}</textarea>
    </label>
    <div class="supportGrid">
      ${item.title_options?.length ? `<section class="sectionBlock"><h3>${escapeHtml(t("title.options"))}</h3><p>${item.title_options.map(escapeHtml).join("<br>")}</p></section>` : ""}
      ${item.media_brief ? `<section class="sectionBlock"><h3>${escapeHtml(t("media.brief"))}</h3><p>${escapeHtml(item.media_brief)}</p></section>` : ""}
      ${item.distribution_note ? `<section class="sectionBlock"><h3>${escapeHtml(t("distribution.note"))}</h3><p>${escapeHtml(item.distribution_note)}</p></section>` : ""}
      ${item.hashtags?.length ? `<section class="sectionBlock"><h3>${escapeHtml(t("hashtags"))}</h3><p>${item.hashtags.map(escapeHtml).join(" ")}</p></section>` : ""}
    </div>
  `;
}

function bindRecordSelection(kind, onSelect) {
  for (const row of els.stagePanel.querySelectorAll(`[data-${kind}]`)) {
    row.addEventListener("click", () => onSelect(row.dataset[kind]));
  }
}

async function confirmDirection(topicId, directionId) {
  if (!topicId || !directionId) return;
  // The server only knows about batch.topics written by real automation. When
  // that's empty, the UI is showing a temporary client-derived view (see
  // normalizeTopics) that the server has never seen, so it can't resolve
  // topicId/directionId on its own. Send that view along so the server can
  // persist it before looking the ids up.
  const payload = { topic_id: topicId, direction_id: directionId };
  if (!Array.isArray(state.batch?.topics) || !state.batch.topics.length) {
    payload.topics = buildRepository().topics;
  }
  const response = await fetch(withContextParams("/api/confirm-direction"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    alert(`Could not create todo: ${await response.text()}`);
    return;
  }
  editorStore.activeStage = "todos";
  editorStore.selectedTodoId = null;
  syncRoute({ push: true });
  await loadState();
}

function bindDistributionDialog() {
  const dialog = els.stagePanel.querySelector("#distributionDialog");
  const form = els.stagePanel.querySelector("#distributionForm");
  els.stagePanel.querySelector("[data-action='request-distribution']")?.addEventListener("click", () => {
    dialog?.showModal();
  });
  form?.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "submit") return;
    event.preventDefault();
    const note = els.stagePanel.querySelector("#distributionNote")?.value.trim();
    if (!note) return;
    const response = await fetch(withContextParams("/api/request-distribution"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!response.ok) {
      alert(`Could not request distribution: ${await response.text()}`);
      return;
    }
    const result = await response.json();
    dialog?.close();
    editorStore.activeStage = "distribution";
    editorStore.selectedDistributionId = result.distribution?.id || null;
    syncRoute({ push: true });
    await loadState();
  });
}

export function normalizeTopic(topic) {
  const directions =
    Array.isArray(topic.directions) && topic.directions.length
      ? topic.directions
      : [
          {
            id: `${topic.id || "topic"}-direction-1`,
            title: topic.title || "Untitled direction",
            description: topic.description || topic.angle || "No description yet.",
            angle: topic.angle || "General",
            status: topic.status === "confirmed" ? "selected" : "ready",
          },
        ];
  return {
    ...topic,
    subject: topic.subject || topic.topic || topic.title,
    directions,
  };
}

export function normalizeTodo(todo) {
  const labels = {
    todo: t("status.todo"),
    queued: t("status.todo"),
    in_progress: t("status.started"),
    writing: t("status.started"),
    done: t("status.done"),
    blocked: t("status.blocked"),
  };
  return {
    ...todo,
    status: todo.status || "todo",
    statusLabel: labels[todo.status || "todo"] || todo.status || t("status.todo"),
  };
}

function statusLabel(status = "") {
  const labels = {
    todo: t("status.todo"),
    queued: t("status.todo"),
    in_progress: t("status.started"),
    writing: t("status.started"),
    done: t("status.done"),
    blocked: t("status.blocked"),
    confirmed: t("status.confirmed"),
    selected: t("status.selected"),
    approved: t("status.approved"),
    needs_review: t("status.needsReview"),
    changes_requested: t("status.changesRequested"),
    draft: t("status.draft"),
    ready: t("status.ready"),
  };
  return labels[status] || status;
}

export function getSelectedDirection(topic) {
  if (!topic?.directions?.length) return null;
  return (
    topic.directions.find((direction) => direction.status === "selected" || direction.status === "confirmed") ||
    topic.directions[0]
  );
}
