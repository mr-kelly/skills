import { api, toast } from "./api.js";
import {
  accountEmailLabel,
  accountLabel,
  actionLabel,
  attachmentHtml,
  badge,
  escapeHtml,
  languageLabel,
  replyIdentityLabel,
  shortSender,
  tooltipAttr,
} from "./format.js";
import { t, template } from "./i18n.js";
import { setupNeeded } from "./provider.js";
import {
  applyRouteFromHash,
  hashHasSelectedMessage,
  navigateTo,
  registerRouterHooks,
  routeFor,
  syncRoute,
} from "./router.js";
import {
  applyLockState,
  attachHtmlPreviewAutoResize,
  captureScrollState,
  closeDetailActionMenu,
  isEditing,
  isLocked,
  isMobileLayout,
  pollLock,
  restoreScrollState,
  setMobileDetailOpen,
} from "./shell.js";
import { $, store } from "./store.js";

function countFor(name) {
  if (name === "all") return store.state.total_cached || 0;
  return store.state.counts[name] || 0;
}

function modeLabel(name = store.mode) {
  return t(`filter.${name}`);
}

export function renderMobileTopbar() {
  const title = $("mobileViewTitle");
  const meta = $("mobileViewMeta");
  if (!title || !meta) return;
  title.textContent =
    store.selectedId && store.mobileDetailOpen ? selectedItem()?.subject || t("empty.select_message") : modeLabel();
  meta.textContent = t("list.items", { count: store.state.items?.length || 0 });
}

export function renderCounts() {
  ["all", "needs_review", "approved", "done", "blocked"].forEach((name) => {
    const el = $(`count-${name}`);
    if (el) el.textContent = countFor(name);
  });
  const humanNeeds = $("count-human-needs_review");
  const humanApproved = $("count-human-approved");
  const humanBlocked = $("count-human-blocked");
  if (humanNeeds) humanNeeds.textContent = countFor("needs_review");
  if (humanApproved) humanApproved.textContent = countFor("approved");
  if (humanBlocked) humanBlocked.textContent = countFor("blocked");
  renderMobileTopbar();
}

export function renderBulkActions() {
  const bar = $("bulkActions");
  const selected = $("selectedCount");
  if (!bar || !selected) return;
  const count = store.checked.size;
  bar.classList.toggle("is-hidden", count === 0);
  selected.textContent = t("list.selected", { count });
  const bulkSelect = $("bulkDecisionSelect");
  if (bulkSelect) bulkSelect.value = "";
}

function decisionLabel(item) {
  const action = item.decision?.action;
  if (!action) return "";
  if (action === "review" || action === "needs_review") return badge(t("badge.review_requested"), "review");
  if (action === "draft_reply") return badge(t("badge.approved_draft"), "decided");
  if (action === "mark_read") return badge(t("badge.approved_mark_read"), "decided");
  if (action === "send_reply") return badge(t("badge.approved_send"), "decided");
  if (action === "no_action") return badge(t("badge.no_action"), "done");
  return badge(t("badge.approved_action", { action: actionLabel(action) }), "decided");
}

function executionLabel(item) {
  const execution = item.execution || {};
  if (execution.status === "executed")
    return badge(t("badge.executed", { action: actionLabel(execution.action) }), "executed");
  if (execution.status === "blocked") return badge(t("badge.blocked"), "blocked");
  return "";
}

function reviewBriefFor(item) {
  const brief = item.review_brief || {};
  const localized = brief.i18n?.[store.uiLanguage] || brief.i18n?.[brief.user_language] || brief.i18n?.en || null;
  const background =
    localized?.background ||
    brief.background ||
    t("review.background.default", {
      from: item.from || t("unknown.sender"),
      subject: item.subject || t("unknown.subject"),
      summary: item.summary || "",
    });
  const why =
    localized?.why_review ||
    (store.uiLanguage === "zh-CN" ? brief.why_review || item.reason : "") ||
    t("review.why.default");
  let recommendation =
    localized?.recommendation ||
    (store.uiLanguage === "zh-CN" ? brief.recommendation : "") ||
    t("review.recommend.default");
  const category = item.category || "";
  const risks = new Set(item.risk || []);
  if (!localized?.recommendation && !(store.uiLanguage === "zh-CN" && brief.recommendation)) {
    if (category === "money" || risks.has("money")) {
      recommendation = t("review.recommend.money");
    } else if (category === "course_feedback") {
      recommendation = t("review.recommend.course");
    } else if (category.includes("security") || risks.has("security")) {
      recommendation = t("review.recommend.security");
    } else if (category === "partnership") {
      recommendation = t("review.recommend.partnership");
    } else if (category === "customer") {
      recommendation = t("review.recommend.customer");
    } else if ((item.attachments || []).length) {
      recommendation = t("review.recommend.attachments");
    }
  }
  return { background, why, recommendation };
}

function suggestedReplyFor(item) {
  return String(item.draft || item.suggested_reply || item.review_brief?.suggested_reply || "").trim();
}

function primaryActionFor(item) {
  if (item.status === "drafted" || item.proposed_action === "send_reply" || item.decision?.action === "send_reply") {
    return {
      id: "approveSend",
      action: "approve_send",
      label: t("action.approve_send"),
      tooltip: t("detail.send.tooltip"),
    };
  }
  if (item.proposed_action === "archive") {
    return {
      id: "approveArchive",
      action: "approve_archive",
      label: t("action.approve_archive"),
      tooltip: t("detail.archive.tooltip"),
    };
  }
  if (item.proposed_action === "mark_read" || item.proposed_action === "keep_unread") {
    return {
      id: "approveRead",
      action: "approve_mark_read",
      label: t("action.approve_read"),
      tooltip: t("detail.read.tooltip"),
    };
  }
  if (item.proposed_action === "draft_reply") {
    return {
      id: "draftReply",
      action: "draft_reply",
      label: t("action.draft_reply"),
      tooltip: t("detail.draft.tooltip"),
    };
  }
  return {
    id: "approveProposed",
    action: "approve_proposed",
    label: t("action.approve_plan"),
    tooltip: t("detail.approve.tooltip"),
  };
}

function planBadge(item) {
  const action = item.proposed_action || "review";
  if (action === "review") return badge(t("action_label.review"), "review");
  return badge(t("badge.suggested", { action: actionLabel(action) }));
}

function emailBodySectionsHtml(item) {
  const original = item.body_original || item.body || "";
  const translation = item.body_translation || item.translated_body || "";
  const sourceLanguage = item.body_original_language || item.source_language || "";
  const translationLanguage =
    item.body_translation_language || item.translation_language || item.review_brief?.user_language || "";
  const originalLabel =
    sourceLanguage && sourceLanguage !== "unknown"
      ? `${t("detail.original_text")} · ${languageLabel(sourceLanguage)}`
      : t("detail.original_text");
  const translationHtml = translation
    ? `
      <div class="section-title">${escapeHtml(t("detail.translation_text"))} · ${escapeHtml(languageLabel(translationLanguage))}</div>
      <div class="body-box translated-body">${escapeHtml(translation)}</div>
    `
    : `<div class="translation-empty">${escapeHtml(t("detail.translation_empty"))}</div>`;
  return `
    <div class="section-title">${escapeHtml(originalLabel)}</div>
    <div class="body-box">${escapeHtml(original)}</div>
    ${translationHtml}
  `;
}

function reviewBriefHtml(item) {
  const needs = item.status === "needs_review" || ["needs_review", "revise", "review"].includes(item.decision?.action);
  if (!needs) return "";
  const brief = reviewBriefFor(item);
  const title = item.review_ref ? `${t("detail.suggestion")} · ${item.review_ref}` : t("detail.suggestion");
  return `
    <div class="review-advice">
      <div class="review-advice-title">${escapeHtml(title)}</div>
      <dl>
        <dt>${escapeHtml(t("detail.background"))}</dt>
        <dd>${escapeHtml(brief.background)}</dd>
        <dt>${escapeHtml(t("detail.why_review"))}</dt>
        <dd>${escapeHtml(brief.why)}</dd>
        <dt>${escapeHtml(t("detail.recommendation"))}</dt>
        <dd>${escapeHtml(brief.recommendation)}</dd>
      </dl>
    </div>
  `;
}

function rowHtml(item) {
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const checkedAttr = store.checked.has(item.id) ? "checked" : "";
  const reviewRef = item.review_ref ? `<span class="review-ref">${escapeHtml(item.review_ref)}</span>` : "";
  return `
    <div class="message-row ${store.selectedId === item.id ? "selected" : ""}" data-id="${escapeHtml(item.id)}">
      <div><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}" ${checkedAttr}></div>
      <div>
        <div class="row-top">
          <div class="sender-line">${reviewRef}<span class="sender">${escapeHtml(shortSender(item.from))}</span></div>
          <div class="date">${escapeHtml(item.uid)}</div>
        </div>
        <div class="row-account">
          <span>${escapeHtml(t("list.account"))}</span>
          <strong>${escapeHtml(accountLabel(item))}</strong>
        </div>
        <div class="subject">${escapeHtml(item.subject)}</div>
        <div class="summary">${escapeHtml(item.summary)}</div>
        <div class="badges">
          ${badge(item.status || t("badge.new"), item.status || "")}
          ${badge(item.category || t("badge.other"))}
          ${planBadge(item)}
          ${risks}
          ${decisionLabel(item)}
          ${executionLabel(item)}
        </div>
      </div>
    </div>`;
}

export function renderList() {
  if (setupNeeded()) {
    $("messageList").innerHTML = `<div class="empty-detail">${escapeHtml(t("setup.list_empty"))}</div>`;
    $("listCount").textContent = t("list.setup_required");
    return;
  }
  if (!store.selectedId || !store.state.items.some((item) => item.id === store.selectedId)) {
    if (isMobileLayout() && !hashHasSelectedMessage()) {
      store.selectedId = null;
      setMobileDetailOpen(false);
    } else {
      store.selectedId = store.state.items[0]?.id || null;
      syncRoute({ push: false });
    }
  }
  $("messageList").innerHTML =
    store.state.items.map(rowHtml).join("") || `<div class="empty-detail">${escapeHtml(t("list.no_items"))}</div>`;
  $("listCount").textContent = t("list.items", { count: store.state.items.length });
  renderMobileTopbar();
  document.querySelectorAll(".message-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (isLocked()) return;
      if (event.target.classList.contains("row-check")) return;
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ selectedId: row.dataset.id });
    });
  });
  document.querySelectorAll(".row-check").forEach((box) => {
    box.addEventListener("change", () => {
      if (isLocked()) {
        box.checked = store.checked.has(box.dataset.id);
        return;
      }
      if (box.checked) store.checked.add(box.dataset.id);
      else store.checked.delete(box.dataset.id);
      renderBulkActions();
    });
  });
  renderBulkActions();
}

export function onboardingHtml() {
  const onboarding = store.state.email_accounts?.onboarding || {};
  const missing = (onboarding.missing_env || [])
    .map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`)
    .join("");
  return `
    <div class="onboarding-card">
      <strong>${onboarding.state === "missing_secrets" ? escapeHtml(t("onboarding.add_secrets")) : escapeHtml(t("onboarding.setup"))}</strong>
      <p>${escapeHtml(onboarding.message || t("onboarding.default_message"))}</p>
      <ol>
        <li>${template(escapeHtml(t("onboarding.copy")), { path: `<code>${escapeHtml(onboarding.example_config || ".agents/skills/kelly-email/config.example.json")}</code>` })}</li>
        <li>${template(escapeHtml(t("onboarding.save_as")), { path: `<code>${escapeHtml(onboarding.recommended_config || "~/.config/kelly-email/config.json")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.fill"))}</li>
        <li>${template(escapeHtml(t("onboarding.env")), { path: `<code>${escapeHtml(onboarding.recommended_env || "~/.config/kelly-email/.env")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.test"))}</li>
      </ol>
      ${missing ? `<div class="account-envs">${missing}</div>` : ""}
    </div>
  `;
}

export function selectedItem() {
  return store.state.items.find((item) => item.id === store.selectedId);
}

export function renderDetail() {
  const backButton = `<button class="back-to-list" type="button">${escapeHtml(t("detail.back_to_list"))}</button>`;
  if (setupNeeded()) {
    $("detailPanel").innerHTML = `${backButton}<div class="empty-detail">${escapeHtml(t("setup.detail_empty"))}</div>`;
    renderMobileTopbar();
    return;
  }
  const item = selectedItem();
  if (!item) {
    $("detailPanel").innerHTML =
      `${backButton}<div class="empty-detail">${escapeHtml(t("empty.select_message"))}</div>`;
    renderMobileTopbar();
    return;
  }
  const attachments = (item.attachments || []).map(attachmentHtml).join("");
  const htmlPreview = (item.html || "").trim()
    ? `<iframe class="html-preview" sandbox srcdoc="${escapeHtml(item.html)}"></iframe>`
    : `<div class="body-box muted">${escapeHtml(t("detail.no_html"))}</div>`;
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const suggestedReply = suggestedReplyFor(item);
  const showDraft = Boolean(suggestedReply) || item.status === "drafted" || item.decision?.action === "send_reply";
  const draftSection = showDraft
    ? `
    <div class="section-title">${escapeHtml(t("detail.suggested_reply"))}</div>
    <textarea id="draftText" class="draft-box" placeholder="${escapeHtml(t("detail.suggested_reply.placeholder"))}">${escapeHtml(suggestedReply)}</textarea>
  `
    : `<textarea id="draftText" class="draft-box is-hidden">${escapeHtml(item.draft || "")}</textarea>`;
  const reviewMeta = item.review_ref
    ? `<strong>${escapeHtml(t("detail.review"))}</strong><div><span class="review-ref detail-review-ref">${escapeHtml(item.review_ref)}</span></div>`
    : "";
  const primaryAction = primaryActionFor(item);
  const menuActions = [
    ["draftReply", "draft_reply", t("action.draft_reply"), t("detail.draft.tooltip")],
    ["approveArchive", "approve_archive", t("action.approve_archive"), t("detail.archive.tooltip")],
    ["approveRead", "approve_mark_read", t("action.approve_read"), t("detail.read.tooltip")],
    ["approveSend", "approve_send", t("action.approve_send"), t("detail.send.tooltip")],
    ["markReview", "needs_review", t("action.needs_review"), t("detail.review.tooltip")],
    ["noAction", "no_action", t("action.no_action"), t("detail.no_action.tooltip")],
  ].filter(([id]) => id !== primaryAction.id);
  const actionBar = `
    <div class="detail-actions detail-actions-top">
      <div class="action-cluster">
        <button id="primaryDetailAction" class="detail-primary-action primary has-tooltip" data-tooltip="${escapeHtml(primaryAction.tooltip)}" title="${escapeHtml(primaryAction.tooltip)}">${escapeHtml(primaryAction.label)}</button>
        <button
          id="detailActionMenuToggle"
          class="detail-more-action"
          type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="${escapeHtml(t("action.more"))}"
          title="${escapeHtml(t("action.more"))}"
        >${escapeHtml(t("action.more"))}</button>
        <div id="detailActionMenu" class="detail-action-menu" role="menu">
          ${menuActions
            .map(
              ([id, action, label, tooltip], index) => `
            ${index === 4 ? `<span class="detail-action-separator" aria-hidden="true"></span>` : ""}
            <button id="${escapeHtml(id)}" type="button" role="menuitem" data-action="${escapeHtml(action)}" ${tooltipAttr(tooltip)}>${escapeHtml(label)}</button>
          `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
  $("detailPanel").innerHTML = `
    ${backButton}
    ${actionBar}
    <div class="detail-title">${escapeHtml(item.subject)}</div>
    <div class="detail-meta">
      ${reviewMeta}
      <strong>${escapeHtml(t("detail.source_account"))}</strong><div>${escapeHtml(accountLabel(item))} <span class="muted">· ${escapeHtml(accountEmailLabel(item))}</span></div>
      <strong>${escapeHtml(t("detail.reply_identity"))}</strong><div>${escapeHtml(replyIdentityLabel(item))}</div>
      <strong>${escapeHtml(t("detail.from"))}</strong><div>${escapeHtml(item.from)}</div>
      <strong>${escapeHtml(t("detail.to"))}</strong><div>${escapeHtml(item.to)}</div>
      <strong>${escapeHtml(t("detail.date"))}</strong><div>${escapeHtml(item.date)}</div>
      <strong>${escapeHtml(t("detail.status"))}</strong><div>${badge(item.status, item.status)} ${badge(item.category)} ${risks} ${decisionLabel(item)} ${executionLabel(item)}</div>
      <strong>${escapeHtml(t("detail.next"))}</strong><div>${escapeHtml(actionLabel(item.proposed_action))} · ${escapeHtml(item.reason)}</div>
    </div>
    ${reviewBriefHtml(item)}
    ${draftSection}
    <div class="section-title">${escapeHtml(t("detail.html_email"))}</div>
    ${htmlPreview}
    <div class="section-title">${escapeHtml(t("detail.attachments"))}</div>
    <div class="attachment-list">${attachments || `<span class="muted">${escapeHtml(t("detail.no_attachments"))}</span>`}</div>
    <div class="section-title">${escapeHtml(t("detail.review_note"))}</div>
    <textarea id="commentText" class="comment-box" placeholder="${escapeHtml(t("detail.comment.placeholder"))}">${escapeHtml(item.user_comment || "")}</textarea>
    <div class="detail-actions">
      <button id="saveDetail" class="has-tooltip" data-tooltip="${escapeHtml(t("detail.save.tooltip"))}" title="${escapeHtml(t("detail.save.tooltip"))}">${escapeHtml(t("action.save_note"))}</button>
    </div>
    ${emailBodySectionsHtml(item)}
  `;
  renderMobileTopbar();
  attachHtmlPreviewAutoResize();
  applyLockState();
  closeDetailActionMenu();
  $("primaryDetailAction").onclick = () => decide(primaryAction.action, [item.id]);
  $("detailActionMenuToggle").onclick = (event) => {
    event.stopPropagation();
    if (isLocked()) return toast(t("lock.processing"));
    store.openActionMenu = !store.openActionMenu;
    $("detailActionMenu").classList.toggle("is-open", store.openActionMenu);
    $("detailActionMenuToggle").setAttribute("aria-expanded", String(store.openActionMenu));
  };
  menuActions.forEach(([id, action]) => {
    const button = $(id);
    if (!button) return;
    button.onclick = () => {
      closeDetailActionMenu();
      decide(action, [item.id]);
    };
  });
  $("saveDetail").onclick = async () => {
    if (isLocked()) return toast(t("lock.processing"));
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText").value,
      suggested_reply: $("draftText").value,
      comment: $("commentText").value,
    });
    toast(t("toast.saved_detail"));
    await refresh({ preserveScroll: false });
    store.selectedId = item.id;
    renderDetail();
  };
}

export async function refresh({ preserveScroll = true } = {}) {
  if (isEditing()) return pollLock();
  applyRouteFromHash();
  const scrollState = preserveScroll ? captureScrollState() : null;
  const q = encodeURIComponent($("searchInput").value || "");
  if (store.mode === "to_approve") store.mode = "approved";
  store.state = await api(`/api/state?mode=${store.mode}&q=${q}`);
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
  if (store.routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    store.routeNeedsReplace = false;
  }
  if (scrollState) requestAnimationFrame(() => restoreScrollState(scrollState));
}

export async function decide(action, ids = null) {
  if (isLocked()) return toast(t("lock.processing"));
  const isSingleDetailAction = Array.isArray(ids) && ids.length === 1;
  const list = isSingleDetailAction ? ids : Array.from(store.checked);
  if (!list.length) return toast(t("toast.select_one"));
  const item = isSingleDetailAction ? selectedItem() : null;
  const comment = item ? $("commentText")?.value || "" : "";
  const payload = { ids: list, action };
  if (item) {
    payload.comment = comment;
    payload.draft = $("draftText")?.value || item.draft || "";
    payload.suggested_reply = $("draftText")?.value || item.suggested_reply || "";
  }
  const data = await api("/api/decision", payload);
  list.forEach((id) => store.checked.delete(id));
  toast(t("toast.saved_count", { count: data.changed.length }));
  await refresh({ preserveScroll: false });
}

// router.js needs refresh/renderList/renderDetail (registered below) and this
// module needs navigateTo/syncRoute from router.js — a real two-way edge, but
// safe in ESM since every use on both sides happens inside function bodies,
// never at module-evaluation time.
registerRouterHooks({
  refresh,
  renderList,
  renderDetail,
});
