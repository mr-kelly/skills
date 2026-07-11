import {
  awaitingConversations,
  conversationById,
  conversationPreview,
  dateTime,
  els,
  enumLabel,
  escapeHtml,
  filteredConversations,
  flashNotice,
  isLocked,
  loadState,
  matchesQuery,
  outboxReplies,
  pendingRepliesFor,
  platformBadge,
  render,
  state,
  statusChip,
  t,
  waitingLabel,
} from "../app.js";
export function renderInbox() {
  const selected = state.route.id ? conversationById(state.route.id) : null;
  els.title.textContent = selected ? selected.title : t("inbox");
  els.subtitle.textContent = selected
    ? [enumLabel(selected.platform, "platform"), selected.channel, selected.workspace].filter(Boolean).join(" · ")
    : `${filteredConversations().length} ${t("conversationCount")} · ${awaitingConversations().length} ${t("needsReply")}`;
  const list = filteredConversations();
  els.content.innerHTML = `
    <section class="inbox">
      <div class="conv-list list-panel">
        ${
          list.length
            ? list
                .map(
                  (conversation) => `
          <a class="conv-row ${selected?.conversation_id === conversation.conversation_id ? "active" : ""}" href="#/inbox/${encodeURIComponent(conversation.conversation_id)}">
            <span class="conv-row-top">
              ${platformBadge(conversation.platform)}
              <strong class="conv-title">${escapeHtml(conversation.title)}</strong>
              ${conversation.unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ""}
              <small class="conv-time">${dateTime(conversation.last_message_at)}</small>
            </span>
            <span class="conv-row-mid">${escapeHtml([conversation.channel, conversation.workspace].filter(Boolean).join(" · "))}</span>
            <span class="conv-row-bottom">
              <span class="conv-preview">${escapeHtml(conversationPreview(conversation))}</span>
              ${conversation.awaiting_reply ? `<span class="wait-chip">${t("waited")} ${waitingLabel(conversation.last_incoming_at)}</span>` : ""}
            </span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty">${t("empty")}</div>`
        }
      </div>
      <div class="conv-detail detail-panel">
        ${selected ? conversationDetail(selected) : `<div class="empty">${t("noConversation")}</div>`}
      </div>
    </section>
  `;
  const composer = els.content.querySelector("#composer-text");
  if (composer) {
    composer.addEventListener("input", () => {
      state.drafts[selected.conversation_id] = composer.value;
    });
  }
  const note = els.content.querySelector("#composer-note");
  if (note) {
    note.addEventListener("input", () => {
      state.notes[selected.conversation_id] = note.value;
    });
  }
}

function conversationDetail(conversation) {
  const pending = pendingRepliesFor(conversation.conversation_id);
  const draft = state.drafts[conversation.conversation_id];
  const prefill =
    draft !== undefined ? draft : !pending.length && conversation.suggested_reply ? conversation.suggested_reply : "";
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(conversation.suggested_reply);
  const locked = isLocked();
  return `
    <button class="back-to-list" type="button" data-action="back">← ${t("backToList")}</button>
    <div class="conv-head">
      <div class="conv-head-copy">
        ${platformBadge(conversation.platform)}
        <span class="badge">${escapeHtml(enumLabel(conversation.kind, "kind"))}</span>
        ${conversation.channel ? `<span class="badge">${escapeHtml(conversation.channel)}</span>` : ""}
        ${conversation.workspace ? `<span class="muted">${escapeHtml(conversation.workspace)}</span>` : ""}
      </div>
      <div class="muted">${t("participants")}: ${escapeHtml((conversation.participants || []).join(", "))}</div>
    </div>
    <div class="transcript">
      ${(conversation.messages || [])
        .map(
          (message) => `
        <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
          <div class="bubble">
            <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
            <div class="bubble-text">${escapeHtml(message.text)}</div>
            ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
          </div>
        </div>
      `,
        )
        .join("")}
      ${pending
        .map(
          (reply) => `
        <div class="bubble-row out">
          <div class="bubble queued-bubble">
            <div class="bubble-meta">
              <strong>${t("reply")} #${reply.ref}</strong>
              <span class="status-chip ${escapeHtml(reply.status)}">${t("queued")} · ${escapeHtml(enumLabel(reply.status))}</span>
            </div>
            <div class="bubble-text">${escapeHtml(reply.text)}</div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="composer">
      ${showSuggestedNote ? `<div class="composer-hint">${t("agentSuggestedPrefill")}</div>` : ""}
      <textarea id="composer-text" rows="4" placeholder="${escapeHtml(t("replyPlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(prefill)}</textarea>
      <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[conversation.conversation_id] || "")}" ${locked ? "disabled" : ""}>
      <div class="composer-actions">
        <button type="button" class="primary" data-action="queue-reply" data-conversation="${escapeHtml(conversation.conversation_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
      </div>
    </div>
  `;
}

export function renderOutbox() {
  els.title.textContent = t("outbox");
  const replies = outboxReplies().filter((reply) =>
    matchesQuery([reply.text, reply.reason, reply.conversation_title, reply.platform, reply.status, `#${reply.ref}`]),
  );
  const needsReview = outboxReplies().filter((reply) => reply.status === "needs_review").length;
  els.subtitle.textContent = `${outboxReplies().length} ${t("replies")} · ${needsReview} ${enumLabel("needs_review")}`;
  const locked = isLocked();
  els.content.innerHTML = replies.length
    ? `
    <div class="outbox-list">
      ${replies
        .map((reply) => {
          const editable = reply.status !== "done";
          const value = state.edits[reply.reply_id] !== undefined ? state.edits[reply.reply_id] : reply.text;
          return `
          <article class="outbox-card" data-reply-card="${escapeHtml(reply.reply_id)}">
            <header class="outbox-head">
              <strong>${t("reply")} #${reply.ref}</strong>
              ${statusChip(reply.status)}
              ${platformBadge(reply.platform)}
              <a class="outbox-conv" href="#/inbox/${encodeURIComponent(reply.conversation_id)}">${escapeHtml(reply.conversation_title || reply.conversation_id)}</a>
              <small class="muted">${dateTime(reply.created_at)}</small>
            </header>
            ${reply.reason ? `<div class="outbox-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(reply.reason)}</div>` : ""}
            ${reply.note ? `<div class="outbox-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(reply.note)}</div>` : ""}
            ${
              editable
                ? `<textarea class="outbox-text" data-reply-text rows="4" ${locked ? "disabled" : ""}>${escapeHtml(value)}</textarea>`
                : `<div class="outbox-sent-text">${escapeHtml(reply.text)}</div>`
            }
            ${reply.decision?.comment ? `<div class="outbox-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(reply.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(reply.decision.decided_at)})</small></div>` : ""}
            ${reply.status === "approved" ? `<div class="outbox-waiting">${t("waitingForSend")}</div>` : ""}
            ${reply.execution ? `<div class="outbox-execution">${t("sentVia")} ${escapeHtml(enumLabel(reply.execution.connector, "connector"))} · ${t("target")} ${escapeHtml(reply.execution.target || "")} · ${escapeHtml(enumLabel(reply.execution.status))} ${reply.execution.executed_at ? `· ${dateTime(reply.execution.executed_at)}` : ""}</div>` : ""}
            ${
              editable
                ? `
              <div class="outbox-actions">
                <input type="text" data-reply-comment placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
                <div class="outbox-buttons">
                  <button type="button" class="primary" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                  <button type="button" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                  <button type="button" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="revise" ${locked ? "disabled" : ""}>${t("saveEdit")}</button>
                  <button type="button" class="danger" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
                </div>
              </div>
            `
                : ""
            }
          </article>
        `;
        })
        .join("")}
    </div>
  `
    : `<div class="empty">${t("noOutbox")}</div>`;
  els.content.querySelectorAll("[data-reply-text]").forEach((textarea) => {
    const card = textarea.closest("[data-reply-card]");
    textarea.addEventListener("input", () => {
      state.edits[card.dataset.replyCard] = textarea.value;
    });
  });
}

export function renderAccounts() {
  els.title.textContent = t("accounts");
  const accounts = state.snapshot?.accounts || [];
  const configAccounts = state.settings?.config_summary?.accounts || [];
  els.subtitle.textContent =
    `${accounts.length || configAccounts.length} ${t("configured") || ""}`.trim() || t("accounts");
  const rows = accounts.length
    ? accounts
    : configAccounts.map((account) => ({ ...account, unread_count: 0, conversation_count: 0, last_sync_at: "" }));
  els.content.innerHTML = rows.length
    ? `
    <div class="account-grid">
      ${rows
        .map((account) => {
          const config = configAccounts.find((item) => item.account_id === account.account_id);
          const warningsFor = (state.snapshot?.warnings || []).filter((item) => item.account_id === account.account_id);
          return `
          <div class="account-card">
            <div class="row between">
              <strong>${escapeHtml(account.display_name)}</strong>
              ${platformBadge(account.platform)}
            </div>
            <div class="muted">${escapeHtml(account.workspace || account.account_id)}</div>
            <div class="account-stats">
              <span><strong>${account.conversation_count ?? 0}</strong> ${t("conversationCount")}</span>
              <span><strong>${account.unread_count ?? 0}</strong> ${t("unread")}</span>
            </div>
            <dl class="account-meta">
              <dt>${t("connector")}</dt><dd>${escapeHtml(enumLabel(account.connector, "connector"))}</dd>
              <dt>${t("lastSync")}</dt><dd>${account.last_sync_at ? dateTime(account.last_sync_at) : "—"}</dd>
            </dl>
            ${config ? `<div class="env-ready ${config.secrets_ready ? "ok" : "missing"}">${config.secrets_ready ? t("secretsReady") : config.secret_envs.length ? t("missingSecrets") : enumLabel(account.connector, "connector")}</div>` : ""}
            ${warningsFor.map((item) => `<div class="account-warning">${escapeHtml(item.message)}</div>`).join("")}
          </div>
        `;
        })
        .join("")}
    </div>
  `
    : `<div class="empty">${t("setupNeeded")}</div>`;
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
          ${summary.sync?.cadence_minutes ? `<dt>${t("syncCadence")}</dt><dd>${escapeHtml(String(summary.sync.cadence_minutes))} ${t("minutes")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.connector, "connector"))}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog.length
            ? syncLog
                .slice(-8)
                .reverse()
                .map(
                  (entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `,
                )
                .join("")
            : `<div class="empty">—</div>`
        }
      </section>
      ${
        report
          ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || [])
            .map(
              (result) => `
            <div class="settings-account">
              <strong>${t("reply")} #${result.ref}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.connector, "connector"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
    </div>
  `;
}

export async function queueReplyAction(conversationId) {
  const text = String(
    state.drafts[conversationId] !== undefined
      ? state.drafts[conversationId]
      : els.content.querySelector("#composer-text")?.value || "",
  ).trim();
  const note = String(state.notes[conversationId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const conversation = conversationById(conversationId);
    state.demoRef += 1;
    state.outbox.replies.push({
      reply_id: `reply-demo-local-${state.demoRef}`,
      ref: outboxReplies().reduce((max, reply) => Math.max(max, reply.ref || 0), 0) + 1,
      conversation_id: conversationId,
      account_id: conversation?.account_id || "",
      platform: conversation?.platform || "",
      conversation_title: conversation?.title || "",
      text,
      note,
      reason: "Queued from the inbox composer.",
      suggested_by: "human",
      status: "needs_review",
      decision: null,
      execution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    delete state.drafts[conversationId];
    delete state.notes[conversationId];
    flashNotice(`${t("queuedNotice")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/outbox/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, text, note }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Queue failed: ${res.status}`);
    return;
  }
  delete state.drafts[conversationId];
  delete state.notes[conversationId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

export async function decideAction(replyId, action, card) {
  const comment = String(card?.querySelector("[data-reply-comment]")?.value || "").trim();
  const text = state.edits[replyId];
  if (state.settings?.demo) {
    const reply = outboxReplies().find((item) => item.reply_id === replyId);
    if (!reply) return;
    if (typeof text === "string" && text.trim()) reply.text = text.trim();
    if (action === "approve") reply.status = "approved";
    else if (action === "request_changes") reply.status = "changes_requested";
    else if (action === "block") reply.status = "blocked";
    reply.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.edits[replyId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  const res = await fetch("/api/outbox/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reply_id: replyId, action, comment, text }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Decision failed: ${res.status}`);
    return;
  }
  delete state.edits[replyId];
  await loadState();
}
