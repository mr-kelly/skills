import { I18N } from "./i18n/messages.js";

let state = { items: [], counts: {}, batch: null, lock: { locked: false } };
let selectedId = null;
const checked = new Set();
let refreshTimer = null;
let lockTimer = null;
const LANGUAGE_STORAGE_KEY = "kelly-email.uiLanguage";
const params = new URLSearchParams(window.location.search);
const demoScenario = params.get("demo") || "";
let mode = modeForDemo(demoScenario);
const queryLanguage = params.get("lang");
let languageMode = queryLanguage || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto";
let uiLanguage = "en";

const $ = (id) => document.getElementById(id);

function template(value, params = {}) {
  return String(value || "").replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function t(key, params = {}) {
  return template(I18N[uiLanguage]?.[key] || I18N.en[key] || key, params);
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((lang) => String(lang).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  if (!["auto", "en", "zh-CN"].includes(languageMode)) languageMode = "auto";
  return languageMode === "auto" ? browserLanguage() : languageMode;
}

function applyTranslations() {
  uiLanguage = resolveLanguage();
  document.documentElement.lang = uiLanguage === "zh-CN" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-tooltip]").forEach((node) => {
    const text = t(node.dataset.i18nTooltip);
    node.dataset.tooltip = text;
    node.title = text;
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('input[name="uiLanguage"]').forEach((input) => {
    input.checked = input.value === languageMode;
  });
  renderLanguageSummary();
}

function renderLanguageSummary() {
  const node = $("languageSummary");
  if (!node) return;
  const current = t(`language.current.${uiLanguage}`);
  node.textContent = languageMode === "auto"
    ? t("language.summary.auto", { language: current })
    : t("language.summary.fixed", { language: current });
}

function setLanguageMode(value) {
  languageMode = ["auto", "en", "zh-CN"].includes(value) ? value : "auto";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  applyTranslations();
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
  toast(t("language.saved"));
}

function syncModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((node) => {
    node.classList.toggle("active", node.dataset.mode === mode);
  });
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function api(path, body = null) {
  const url = withContextParams(path);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function withContextParams(path) {
  const url = new URL(path, window.location.origin);
  for (const key of ["demo", "lang"]) {
    const value = params.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function modeForDemo(value) {
  if (value === "review") return "needs_review";
  if (["approved", "blocked", "done"].includes(value)) return value;
  return "all";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortSender(value) {
  return (value || "").replace(/".*?"/g, "").replace(/\s+/g, " ").trim() || t("unknown.sender");
}

function sizeLabel(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(att) {
  return (att.content_type || "").startsWith("image/");
}

function isPdf(att) {
  return att.content_type === "application/pdf" || /\.pdf$/i.test(att.filename || "");
}

function attachmentHtml(att) {
  const meta = `${escapeHtml(att.content_type || "file")} ${sizeLabel(att.size)}`;
  const url = att.url ? escapeHtml(att.url) : "";
  const link = url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(t("attachment.open"))}</a>` : "";
  const preview = url && isImage(att)
    ? `<img class="attachment-preview-image" src="${url}" alt="${escapeHtml(att.filename)}" />`
    : url && isPdf(att)
      ? `<iframe class="attachment-preview-pdf" src="${url}" title="${escapeHtml(att.filename)}"></iframe>`
      : "";
  return `
    <div class="attachment">
      <div class="attachment-head">
        <strong>${escapeHtml(att.filename)}</strong>
        <span class="muted">${meta}</span>
        ${link}
      </div>
      ${preview}
    </div>`;
}

function badge(text, extra = "") {
  return `<span class="badge ${extra}">${escapeHtml(text)}</span>`;
}

function actionLabel(action) {
  const labels = {
    archive: t("action_label.archive"),
    mark_read: t("action_label.mark_read"),
    send_reply: t("action_label.send_reply"),
    draft_reply: t("action_label.draft_reply"),
    keep_unread: t("action_label.keep_unread"),
    review: t("action_label.review"),
  };
  return labels[action] || action || t("action_label.review");
}

function planBadge(item) {
  const action = item.proposed_action || "review";
  if (action === "review") return badge(t("action_label.review"), "review");
  return badge(t("badge.suggested", { action: actionLabel(action) }));
}

function tooltipAttr(text) {
  return `class="has-tooltip" data-tooltip="${escapeHtml(text)}" title="${escapeHtml(text)}"`;
}

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts[name] || 0;
}

function renderCounts() {
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
}

function renderBulkActions() {
  const bar = $("bulkActions");
  const selected = $("selectedCount");
  if (!bar || !selected) return;
  const count = checked.size;
  bar.classList.toggle("is-hidden", count === 0);
  selected.textContent = t("list.selected", { count });
}

function accountsCardsHtml() {
  const payload = state.email_accounts || {};
  const onboarding = payload.onboarding || {};
  const accounts = payload.accounts || [];
  const promptCard = `
    <article class="account-help-card">
      <div>
        <strong>${escapeHtml(t("account.add_title"))}</strong>
        <p>${escapeHtml(t("account.add_body"))}</p>
      </div>
      <pre><code>/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新本地 config，但不要让我在聊天里贴密码。

/kelly-email 给 main 账号增加 alias：hello@example.com，并新增一个 outbound identity：display name 是 Founder，send_as 是 founder@example.com。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 env secret。</code></pre>
    </article>
  `;
  if (!onboarding.configured) {
    const missing = (onboarding.missing_env || []).map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`).join("");
    return `
      ${promptCard}
      <div class="onboarding-card compact">
        <strong>${onboarding.state === "missing_secrets" ? escapeHtml(t("account.secrets_missing")) : escapeHtml(t("account.setup_required"))}</strong>
        <p>${escapeHtml(onboarding.message || t("onboarding.default_message"))}</p>
        ${missing ? `<div class="account-envs">${missing}</div>` : ""}
      </div>
    `;
  }
  if (!accounts.length) {
    return `${promptCard}<div class="muted">${escapeHtml(t("account.no_accounts"))}</div>`;
  }
  const accountCards = accounts.map((account) => {
    const aliases = (account.aliases || []).map((alias) => `<span>${escapeHtml(alias)}</span>`).join("");
    const identities = (account.identities || []).map((identity) => `
      <div class="account-identity">
        <span>${escapeHtml(identity.display_name || identity.identity_id)}</span>
        <code>${escapeHtml(identity.send_as_email)}</code>
      </div>
    `).join("");
    const imapOk = account.imap_env_configured ? "ok" : "warn";
    const smtpOk = account.smtp_env_configured ? "ok" : "warn";
    return `
      <article class="account-card">
        <div class="account-card-head">
          <div>
            <strong>${escapeHtml(account.display_name)}</strong>
            <small>${escapeHtml(account.primary_email || account.mailbox_id)}</small>
          </div>
          <div class="account-envs">
            <span class="env-pill ${imapOk}" title="${escapeHtml(account.imap_password_env)}">${escapeHtml(account.imap_env_configured ? t("account.imap_ready") : t("account.imap_missing"))}</span>
            <span class="env-pill ${smtpOk}" title="${escapeHtml(account.smtp_password_env)}">${escapeHtml(account.smtp_env_configured ? t("account.smtp_ready") : t("account.smtp_missing"))}</span>
          </div>
        </div>
        <div class="account-detail">
          <div class="account-row"><span>IMAP</span><code>${escapeHtml(account.imap_host)}</code></div>
          <div class="account-row"><span>SMTP</span><code>${escapeHtml(account.smtp_host || t("account.not_set"))}</code></div>
          ${aliases ? `<div class="alias-list">${aliases}</div>` : ""}
          ${identities ? `<div class="identity-list">${identities}</div>` : ""}
        </div>
      </article>
    `;
  }).join("");
  return `${promptCard}${accountCards}`;
}

function accountSummaryHtml() {
  return accountsCardsHtml();
}

function valueOrMuted(value, fallback = t("settings.not_configured")) {
  return value ? escapeHtml(value) : `<span class="muted">${escapeHtml(fallback)}</span>`;
}

function listPills(values, empty = t("settings.not_configured")) {
  const rows = (values || []).filter(Boolean);
  if (!rows.length) return `<span class="muted">${escapeHtml(empty)}</span>`;
  return rows.map((value) => `<span class="settings-pill">${escapeHtml(value)}</span>`).join("");
}

function urlsHtml(urls = {}) {
  const rows = Object.entries(urls || {}).filter(([, value]) => value);
  if (!rows.length) return `<span class="muted">${escapeHtml(t("settings.no_urls"))}</span>`;
  return rows.map(([label, value]) => `
    <div class="settings-row">
      <span>${escapeHtml(label)}</span>
      <a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>
    </div>
  `).join("");
}

function profileSettingsHtml() {
  const payload = state.email_accounts || {};
  const profile = payload.profile || {};
  const brands = payload.brands || [];
  const contacts = (profile.contact_methods || []).map((method) => `${method.label}: ${method.value}`);
  const brandHtml = brands.length
    ? brands.map((brand) => `
      <article class="settings-card">
        <div class="settings-card-title">${escapeHtml(brand.name || brand.brand_id || t("settings.brands"))}</div>
        <p>${valueOrMuted(brand.description, t("settings.no_description"))}</p>
        <div class="settings-list">
          ${urlsHtml({
            homepage: brand.homepage,
            docs: brand.docs_url,
            support: brand.support_url,
            youtube: brand.youtube_url,
          })}
        </div>
      </article>
    `).join("")
    : `<article class="settings-card"><div class="settings-card-title">${escapeHtml(t("settings.brands"))}</div><p class="muted">${escapeHtml(t("settings.no_brands"))}</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.operator"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.name"))}</span><strong>${valueOrMuted(profile.display_name)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.role"))}</span><strong>${valueOrMuted(profile.role)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.company"))}</span><strong>${valueOrMuted(profile.company)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.reply_as"))}</span><strong>${valueOrMuted(profile.default_reply_as)}</strong></div>
      <div class="settings-pill-row">${listPills(profile.languages, t("settings.no_languages"))}</div>
      <p>${valueOrMuted(profile.public_bio, t("settings.no_bio"))}</p>
      <div class="settings-pill-row">${listPills(contacts, t("settings.no_contacts"))}</div>
    </article>
    ${brandHtml}
  `;
}

function styleSettingsHtml() {
  const payload = state.email_accounts || {};
  const style = payload.style || {};
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.voice"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.preset"))}</span><strong>${valueOrMuted(style.preset)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.language"))}</span><strong>${valueOrMuted(style.default_language, "auto")}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.tone"))}</span><strong>${valueOrMuted(style.tone)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.audience"))}</span><strong>${valueOrMuted(style.audience)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.max_words"))}</span><strong>${valueOrMuted(style.max_reply_words)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.quote"))}</span><strong>${style.include_short_quote ? escapeHtml(t("settings.short_quote")) : escapeHtml(t("settings.no_quote"))}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.signature"))}</span><strong>${valueOrMuted(style.signature_mode)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.signoff"))}</span><strong>${valueOrMuted(style.preferred_signoff)}</strong></div>
      <p>${valueOrMuted(style.paragraph_style, t("settings.no_paragraph"))}</p>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.reply_rules"))}</div>
      <div class="settings-bullets">${(style.reply_rules || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_reply_rules"))}</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.cta_urls"))}</div>
      <div class="settings-list">${urlsHtml(style.cta_urls || {})}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.official_urls"))}</div>
      <div class="settings-list">${urlsHtml(payload.official_urls || {})}</div>
    </article>
  `;
}

function knowledgeSettingsHtml() {
  const kb = state.email_accounts?.knowledge_base || {};
  const sources = kb.sources || [];
  const sourceHtml = sources.length
    ? sources.map((source) => `
      <article class="settings-card">
        <div class="settings-card-title">
          ${escapeHtml(source.title || source.source_id || "Knowledge source")}
          <span class="source-type">${escapeHtml(source.type || "source")}</span>
        </div>
        <div class="settings-list">
          ${source.url ? `<div class="settings-row"><span>${escapeHtml(t("settings.url"))}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.url)}</a></div>` : ""}
          ${source.path ? `<div class="settings-row"><span>${escapeHtml(t("settings.path"))}</span><code>${escapeHtml(source.path)}</code></div>` : ""}
          <div class="settings-pill-row">${listPills(source.use_for, t("settings.no_usage_tags"))}</div>
        </div>
      </article>
    `).join("")
    : `<article class="settings-card"><div class="settings-card-title">${escapeHtml(t("settings.sources"))}</div><p class="muted">${escapeHtml(t("settings.no_sources"))}</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.policy"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.enabled"))}</span><strong>${kb.enabled ? escapeHtml(t("settings.yes")) : escapeHtml(t("settings.no"))}</strong></div>
      <p>${valueOrMuted(kb.usage, t("settings.no_usage"))}</p>
      <div class="settings-bullets">${(kb.facts || []).map((fact) => `<div>${escapeHtml(fact)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_facts"))}</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.do_not_say"))}</div>
      <div class="settings-bullets">${(kb.do_not_say || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_forbidden"))}</span>`}</div>
    </article>
    ${sourceHtml}
  `;
}

function setHelpTab(name) {
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.helpTab === name);
  });
  document.querySelectorAll("[data-help-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.helpPanel === name);
  });
}

function openHelp() {
  const modal = $("helpModal");
  const batch = state.batch || {};
  const onboarding = state.email_accounts?.onboarding || {};
  $("helpBatchInfo").textContent = batch.batch_id
    ? t("batch.info", { id: batch.batch_id, count: state.total_cached || 0, date: batch.generated_at || "" })
    : t("batch.none");
  $("helpDataReader").textContent = `${state.email_accounts?.data_reader || "local"}${state.email_accounts?.data_provider ? ` · ${state.email_accounts.data_provider}` : ""}`;
  $("helpBatchPath").textContent = state.batch_path || t("files.no_batch");
  $("helpDecisionsPath").textContent = state.decisions_path || t("files.no_decisions");
  $("helpConfigPath").textContent = onboarding.configured ? state.email_accounts?.source || t("files.no_config") : t("files.onboarding");
  $("helpAccounts").innerHTML = accountSummaryHtml();
  $("helpProfile").innerHTML = profileSettingsHtml();
  $("helpStyle").innerHTML = styleSettingsHtml();
  $("helpKnowledge").innerHTML = knowledgeSettingsHtml();
  renderLanguageSummary();
  setHelpTab("guide");
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  const modal = $("helpModal");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

function isLocked() {
  return Boolean(state.lock && state.lock.locked);
}

function applyLockState() {
  const locked = isLocked();
  document.body.classList.toggle("is-locked", locked);
  const banner = $("lockBanner");
  if (banner) {
    banner.classList.toggle("is-hidden", !locked);
  }
  const message = $("lockMessage");
  if (message) {
    message.textContent = locked
      ? state.lock.message || t("lock.processing")
      : t("lock.default");
  }
  document.querySelectorAll("button, input, textarea").forEach((node) => {
    if (node.id === "searchInput") return;
    node.disabled = locked;
  });
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.matches("textarea")) return true;
  return active.matches("input") && active.id !== "searchInput";
}

function captureScrollState() {
  const page = document.scrollingElement || document.documentElement;
  return {
    pageTop: page?.scrollTop || 0,
    listTop: $("messageList")?.scrollTop || 0,
    detailTop: $("detailPanel")?.scrollTop || 0,
  };
}

function restoreScrollState(scrollState) {
  const page = document.scrollingElement || document.documentElement;
  if (page) page.scrollTop = scrollState.pageTop;
  const list = $("messageList");
  if (list) list.scrollTop = scrollState.listTop;
  const detail = $("detailPanel");
  if (detail) detail.scrollTop = scrollState.detailTop;
}

function decisionLabel(item) {
  const action = item.decision?.action;
  if (!action) return "";
  if (action === "review" || action === "needs_review") return badge(t("badge.review_requested"), "review");
  if (action === "draft_reply") return badge(t("badge.approved_draft"), "decided");
  if (action === "mark_read") return badge(t("badge.approved_mark_read"), "decided");
  if (action === "send_reply") return badge(t("badge.approved_send"), "decided");
  if (action === "no_action") return badge(t("badge.no_action"), "done");
  return badge(t("badge.approved_action", { action }), "decided");
}

function executionLabel(item) {
  const execution = item.execution || {};
  if (execution.status === "executed") return badge(t("badge.executed", { action: execution.action }), "executed");
  if (execution.status === "blocked") return badge(t("badge.blocked"), "blocked");
  return "";
}

function reviewBriefFor(item) {
  const brief = item.review_brief || {};
  const localized = brief.i18n?.[uiLanguage] || brief.i18n?.[brief.user_language] || brief.i18n?.en || null;
  const background = localized?.background || brief.background || t("review.background.default", {
    from: item.from || t("unknown.sender"),
    subject: item.subject || t("unknown.subject"),
    summary: item.summary || "",
  });
  const why = localized?.why_review || (uiLanguage === "zh-CN" ? brief.why_review || item.reason : "") || t("review.why.default");
  let recommendation = localized?.recommendation || (uiLanguage === "zh-CN" ? brief.recommendation : "") || t("review.recommend.default");
  const category = item.category || "";
  const risks = new Set(item.risk || []);
  if (!localized?.recommendation && !(uiLanguage === "zh-CN" && brief.recommendation)) {
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

function languageLabel(code) {
  if (!code || code === "unknown") return t("language.unknown");
  return t(`language.current.${code}`) || code;
}

function emailBodySectionsHtml(item) {
  const original = item.body_original || item.body || "";
  const translation = item.body_translation || item.translated_body || "";
  const sourceLanguage = item.body_original_language || item.source_language || "";
  const translationLanguage = item.body_translation_language || item.translation_language || item.review_brief?.user_language || "";
  const originalLabel = sourceLanguage && sourceLanguage !== "unknown"
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
  const checkedAttr = checked.has(item.id) ? "checked" : "";
  const reviewRef = item.review_ref ? `<span class="review-ref">${escapeHtml(item.review_ref)}</span>` : "";
  return `
    <div class="message-row ${selectedId === item.id ? "selected" : ""}" data-id="${escapeHtml(item.id)}">
      <div><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}" ${checkedAttr}></div>
      <div>
        <div class="row-top">
          <div class="sender-line">${reviewRef}<span class="sender">${escapeHtml(shortSender(item.from))}</span></div>
          <div class="date">${escapeHtml(item.uid)}</div>
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

function renderList() {
  if (state.email_accounts?.onboarding && !state.email_accounts.onboarding.configured) {
    $("messageList").innerHTML = onboardingHtml();
    $("listCount").textContent = t("list.setup_required");
    return;
  }
  if (!selectedId || !state.items.some((item) => item.id === selectedId)) selectedId = state.items[0]?.id || null;
  $("messageList").innerHTML = state.items.map(rowHtml).join("") || `<div class="empty-detail">${escapeHtml(t("list.no_items"))}</div>`;
  $("listCount").textContent = t("list.items", { count: state.items.length });
  document.querySelectorAll(".message-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (isLocked()) return;
      if (event.target.classList.contains("row-check")) return;
      selectedId = row.dataset.id;
      renderList();
      renderDetail();
    });
  });
  document.querySelectorAll(".row-check").forEach((box) => {
    box.addEventListener("change", () => {
      if (isLocked()) {
        box.checked = checked.has(box.dataset.id);
        return;
      }
      if (box.checked) checked.add(box.dataset.id);
      else checked.delete(box.dataset.id);
      renderBulkActions();
    });
  });
  renderBulkActions();
}

function onboardingHtml() {
  const onboarding = state.email_accounts?.onboarding || {};
      const missing = (onboarding.missing_env || []).map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`).join("");
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

function selectedItem() {
  return state.items.find((item) => item.id === selectedId);
}

function renderDetail() {
  if (state.email_accounts?.onboarding && !state.email_accounts.onboarding.configured) {
    $("detailPanel").innerHTML = onboardingHtml();
    return;
  }
  const item = selectedItem();
  if (!item) {
    $("detailPanel").innerHTML = `<div class="empty-detail">${escapeHtml(t("empty.select_message"))}</div>`;
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
  const actionBar = `
    <div class="detail-actions detail-actions-top">
      <button id="approveProposed" class="primary has-tooltip" data-tooltip="${escapeHtml(t("detail.approve.tooltip"))}" title="${escapeHtml(t("detail.approve.tooltip"))}">${escapeHtml(t("action.approve_plan"))}</button>
      <button id="draftReply" ${tooltipAttr(t("detail.draft.tooltip"))}>${escapeHtml(t("action.draft_reply"))}</button>
      <button id="approveArchive" ${tooltipAttr(t("detail.archive.tooltip"))}>${escapeHtml(t("action.approve_archive"))}</button>
      <button id="approveRead" ${tooltipAttr(t("detail.read.tooltip"))}>${escapeHtml(t("action.approve_read"))}</button>
      <button id="approveSend" ${tooltipAttr(t("detail.send.tooltip"))}>${escapeHtml(t("action.approve_send"))}</button>
      <button id="markReview" ${tooltipAttr(t("detail.review.tooltip"))}>${escapeHtml(t("action.needs_review"))}</button>
      <button id="noAction" ${tooltipAttr(t("detail.no_action.tooltip"))}>${escapeHtml(t("action.no_action"))}</button>
    </div>
  `;
  $("detailPanel").innerHTML = `
    ${actionBar}
    <div class="detail-title">${escapeHtml(item.subject)}</div>
    <div class="detail-meta">
      ${reviewMeta}
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
  applyLockState();
  $("approveProposed").onclick = () => decide("approve_proposed", [item.id]);
  $("draftReply").onclick = () => decide("draft_reply", [item.id]);
  $("approveArchive").onclick = () => decide("approve_archive", [item.id]);
  $("approveRead").onclick = () => decide("approve_mark_read", [item.id]);
  $("approveSend").onclick = () => decide("approve_send", [item.id]);
  $("markReview").onclick = () => decide("needs_review", [item.id]);
  $("noAction").onclick = () => decide("no_action", [item.id]);
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
    selectedId = item.id;
    renderDetail();
  };
}

async function refresh({ preserveScroll = true } = {}) {
  if (isEditing()) return pollLock();
  const scrollState = preserveScroll ? captureScrollState() : null;
  const q = encodeURIComponent($("searchInput").value || "");
  if (mode === "to_approve") mode = "approved";
  state = await api(`/api/state?mode=${mode}&q=${q}`);
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
  if (scrollState) requestAnimationFrame(() => restoreScrollState(scrollState));
}

async function pollLock() {
  const data = await api("/api/lock");
  state.lock = data.lock || { locked: false };
  applyLockState();
}

async function decide(action, ids = null) {
  if (isLocked()) return toast(t("lock.processing"));
  const isSingleDetailAction = Array.isArray(ids) && ids.length === 1;
  const list = isSingleDetailAction ? ids : Array.from(checked);
  if (!list.length) return toast(t("toast.select_one"));
  const item = isSingleDetailAction ? selectedItem() : null;
  const comment = item ? $("commentText")?.value || "" : "";
  if (item) {
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText")?.value || item.draft || "",
      suggested_reply: $("draftText")?.value || item.suggested_reply || "",
      comment,
    });
  }
  const data = await api("/api/decision", { ids: list, action, comment });
  list.forEach((id) => checked.delete(id));
  toast(t("toast.saved_count", { count: data.changed.length }));
  await refresh({ preserveScroll: false });
}

function wire() {
  $("helpButton").onclick = openHelp;
  $("closeHelp").onclick = closeHelp;
  $("helpModal").addEventListener("click", (event) => {
    if (event.target.id === "helpModal") closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("helpModal").classList.contains("is-hidden")) closeHelp();
  });
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.onclick = () => setHelpTab(button.dataset.helpTab);
  });
  $("approveSelected").onclick = () => decide("approve_proposed");
  $("reviewSelected").onclick = () => decide("needs_review");
  $("noActionSelected").onclick = () => decide("no_action");
  $("selectAll").onchange = (event) => {
    if (isLocked()) {
      event.target.checked = false;
      return toast(t("lock.processing"));
    }
    if (event.target.checked) state.items.forEach((item) => checked.add(item.id));
    else checked.clear();
    renderList();
    renderBulkActions();
  };
  $("searchInput").addEventListener("input", () => refresh({ preserveScroll: false }));
  document.querySelectorAll("#filters button").forEach((button) => {
    button.onclick = async () => {
      mode = button.dataset.mode;
      syncModeButtons();
      selectedId = null;
      await refresh({ preserveScroll: false });
    };
  });
  document.querySelectorAll(".human-work [data-mode]").forEach((button) => {
    button.onclick = async () => {
      mode = button.dataset.mode;
      syncModeButtons();
      selectedId = null;
      await refresh({ preserveScroll: false });
    };
  });
  document.querySelectorAll('input[name="uiLanguage"]').forEach((input) => {
    input.onchange = () => setLanguageMode(input.value);
  });
}

applyTranslations();
wire();
syncModeButtons();
refresh({ preserveScroll: false }).catch((error) => toast(error.message));
lockTimer = setInterval(() => pollLock().catch((error) => toast(error.message)), 3000);
refreshTimer = setInterval(() => refresh().catch((error) => toast(error.message)), 15000);
