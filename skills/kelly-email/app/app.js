let state = { items: [], counts: {}, batch: null, lock: { locked: false } };
let mode = "all";
let selectedId = null;
const checked = new Set();
let refreshTimer = null;
let lockTimer = null;

const $ = (id) => document.getElementById(id);

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
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortSender(value) {
  return (value || "").replace(/".*?"/g, "").replace(/\s+/g, " ").trim() || "(unknown)";
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
  const link = url ? `<a href="${url}" target="_blank" rel="noopener">Open</a>` : "";
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
    archive: "archive",
    mark_read: "mark read",
    send_reply: "send reply",
    draft_reply: "draft reply",
    keep_unread: "keep unread",
    review: "needs review",
  };
  return labels[action] || action || "needs review";
}

function planBadge(item) {
  const action = item.proposed_action || "review";
  if (action === "review") return badge("needs review", "review");
  return badge(`suggested: ${actionLabel(action)}`);
}

function tooltipAttr(text) {
  return `class="has-tooltip" data-tooltip="${escapeHtml(text)}" title="${escapeHtml(text)}"`;
}

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts[name] || 0;
}

function renderCounts() {
  ["all", "needs_review", "to_approve", "approved", "done", "blocked"].forEach((name) => {
    const el = $(`count-${name}`);
    if (el) el.textContent = countFor(name);
  });
}

function accountsCardsHtml() {
  const payload = state.email_accounts || {};
  const onboarding = payload.onboarding || {};
  const accounts = payload.accounts || [];
  const promptCard = `
    <article class="account-help-card">
      <div>
        <strong>Add or change accounts with /kelly-email</strong>
        <p>Tell the agent what mailbox, aliases, identity, folders, and provider you want. Keep passwords in the env file only.</p>
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
        <strong>${onboarding.state === "missing_secrets" ? "Secrets missing" : "Email setup required"}</strong>
        <p>${escapeHtml(onboarding.message || "Configure email accounts before scanning mail.")}</p>
        ${missing ? `<div class="account-envs">${missing}</div>` : ""}
      </div>
    `;
  }
  if (!accounts.length) {
    return `${promptCard}<div class="muted">No accounts configured</div>`;
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
            <span class="env-pill ${imapOk}" title="${escapeHtml(account.imap_password_env)}">IMAP ${account.imap_env_configured ? "ready" : "missing"}</span>
            <span class="env-pill ${smtpOk}" title="${escapeHtml(account.smtp_password_env)}">SMTP ${account.smtp_env_configured ? "ready" : "missing"}</span>
          </div>
        </div>
        <div class="account-detail">
          <div class="account-row"><span>IMAP</span><code>${escapeHtml(account.imap_host)}</code></div>
          <div class="account-row"><span>SMTP</span><code>${escapeHtml(account.smtp_host || "not set")}</code></div>
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

function valueOrMuted(value, fallback = "Not configured") {
  return value ? escapeHtml(value) : `<span class="muted">${escapeHtml(fallback)}</span>`;
}

function listPills(values, empty = "Not configured") {
  const rows = (values || []).filter(Boolean);
  if (!rows.length) return `<span class="muted">${escapeHtml(empty)}</span>`;
  return rows.map((value) => `<span class="settings-pill">${escapeHtml(value)}</span>`).join("");
}

function urlsHtml(urls = {}) {
  const rows = Object.entries(urls || {}).filter(([, value]) => value);
  if (!rows.length) return `<span class="muted">No URLs configured</span>`;
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
        <div class="settings-card-title">${escapeHtml(brand.name || brand.brand_id || "Brand")}</div>
        <p>${valueOrMuted(brand.description, "No description")}</p>
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
    : `<article class="settings-card"><div class="settings-card-title">Brands</div><p class="muted">No brands configured</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">Operator</div>
      <div class="settings-row"><span>Name</span><strong>${valueOrMuted(profile.display_name)}</strong></div>
      <div class="settings-row"><span>Role</span><strong>${valueOrMuted(profile.role)}</strong></div>
      <div class="settings-row"><span>Company</span><strong>${valueOrMuted(profile.company)}</strong></div>
      <div class="settings-row"><span>Reply as</span><strong>${valueOrMuted(profile.default_reply_as)}</strong></div>
      <div class="settings-pill-row">${listPills(profile.languages, "No languages configured")}</div>
      <p>${valueOrMuted(profile.public_bio, "No public bio configured")}</p>
      <div class="settings-pill-row">${listPills(contacts, "No contact methods configured")}</div>
    </article>
    ${brandHtml}
  `;
}

function styleSettingsHtml() {
  const payload = state.email_accounts || {};
  const style = payload.style || {};
  return `
    <article class="settings-card">
      <div class="settings-card-title">Voice</div>
      <div class="settings-row"><span>Preset</span><strong>${valueOrMuted(style.preset)}</strong></div>
      <div class="settings-row"><span>Language</span><strong>${valueOrMuted(style.default_language, "auto")}</strong></div>
      <div class="settings-row"><span>Tone</span><strong>${valueOrMuted(style.tone)}</strong></div>
      <div class="settings-row"><span>Audience</span><strong>${valueOrMuted(style.audience)}</strong></div>
      <div class="settings-row"><span>Max words</span><strong>${valueOrMuted(style.max_reply_words)}</strong></div>
      <div class="settings-row"><span>Quote</span><strong>${style.include_short_quote ? "Short quote on reply" : "No quote by default"}</strong></div>
      <div class="settings-row"><span>Signature</span><strong>${valueOrMuted(style.signature_mode)}</strong></div>
      <div class="settings-row"><span>Signoff</span><strong>${valueOrMuted(style.preferred_signoff)}</strong></div>
      <p>${valueOrMuted(style.paragraph_style, "No paragraph style configured")}</p>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">Reply Rules</div>
      <div class="settings-bullets">${(style.reply_rules || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">No reply rules configured</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">CTA URLs</div>
      <div class="settings-list">${urlsHtml(style.cta_urls || {})}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">Official URLs</div>
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
          ${source.url ? `<div class="settings-row"><span>URL</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.url)}</a></div>` : ""}
          ${source.path ? `<div class="settings-row"><span>Path</span><code>${escapeHtml(source.path)}</code></div>` : ""}
          <div class="settings-pill-row">${listPills(source.use_for, "No usage tags")}</div>
        </div>
      </article>
    `).join("")
    : `<article class="settings-card"><div class="settings-card-title">Sources</div><p class="muted">No knowledge sources configured</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">Policy</div>
      <div class="settings-row"><span>Enabled</span><strong>${kb.enabled ? "Yes" : "No"}</strong></div>
      <p>${valueOrMuted(kb.usage, "No usage guidance configured")}</p>
      <div class="settings-bullets">${(kb.facts || []).map((fact) => `<div>${escapeHtml(fact)}</div>`).join("") || `<span class="muted">No product facts configured</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">Do Not Say</div>
      <div class="settings-bullets">${(kb.do_not_say || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">No forbidden claims configured</span>`}</div>
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
    ? `Batch ${batch.batch_id} · ${state.total_cached || 0} items · ${batch.generated_at || ""}`
    : "No batch loaded";
  $("helpDataReader").textContent = `${state.email_accounts?.data_reader || "local"}${state.email_accounts?.data_provider ? ` · ${state.email_accounts.data_provider}` : ""}`;
  $("helpBatchPath").textContent = state.batch_path || "No batch file";
  $("helpDecisionsPath").textContent = state.decisions_path || "No decisions file";
  $("helpConfigPath").textContent = onboarding.configured ? state.email_accounts?.source || "No config file" : "Onboarding required";
  $("helpAccounts").innerHTML = accountSummaryHtml();
  $("helpProfile").innerHTML = profileSettingsHtml();
  $("helpStyle").innerHTML = styleSettingsHtml();
  $("helpKnowledge").innerHTML = knowledgeSettingsHtml();
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
      ? state.lock.message || "/kelly-email is processing this batch. Editing is paused."
      : "The local files are locked for a moment.";
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

function decisionLabel(item) {
  const action = item.decision?.action;
  if (!action) return "";
  if (action === "review" || action === "needs_review") return badge("review requested", "review");
  if (action === "draft_reply") return badge("approved: draft reply", "decided");
  if (action === "mark_read") return badge("approved: mark read", "decided");
  if (action === "send_reply") return badge("approved: send", "decided");
  if (action === "no_action") return badge("no action", "done");
  return badge(`approved: ${action}`, "decided");
}

function executionLabel(item) {
  const execution = item.execution || {};
  if (execution.status === "executed") return badge(`executed: ${execution.action}`, "executed");
  if (execution.status === "blocked") return badge("blocked", "blocked");
  return "";
}

function reviewBriefFor(item) {
  const brief = item.review_brief || {};
  const background = brief.background || `${item.from || "Unknown sender"} sent "${item.subject || "(no subject)"}". ${item.summary || ""}`;
  const why = brief.why_review || item.reason || "Needs a human decision before mailbox changes.";
  let recommendation = brief.recommendation || "Read the message, then write your instruction in Review note. If it is safe cleanup, approve archive.";
  const category = item.category || "";
  const risks = new Set(item.risk || []);
  if (!brief.recommendation) {
    if (category === "money" || risks.has("money")) {
      recommendation = "Confirm whether this needs finance/payment handling. If no action is needed, approve archive; otherwise write what I should do next.";
    } else if (category === "course_feedback") {
      recommendation = "Review the student's submission or feedback first. Add a note if you want me to summarize or draft a reply.";
    } else if (category.includes("security") || risks.has("security")) {
      recommendation = "Check whether this involves account, privacy, security, or permission changes before approving cleanup.";
    } else if (category === "partnership") {
      recommendation = "Decide whether this is worth pursuing. You can ask me to draft a short reply, forward internally, or archive.";
    } else if (category === "customer") {
      recommendation = "Decide whether the sender needs a reply. Write the reply direction here and choose Draft reply.";
    } else if ((item.attachments || []).length) {
      recommendation = "Review the attachment context before cleanup. Ask me to summarize or reply if needed.";
    }
  }
  return { background, why, recommendation };
}

function suggestedReplyFor(item) {
  return String(item.draft || item.suggested_reply || item.review_brief?.suggested_reply || "").trim();
}

function reviewBriefHtml(item) {
  const needs = item.status === "needs_review" || ["needs_review", "revise", "review"].includes(item.decision?.action);
  if (!needs) return "";
  const brief = reviewBriefFor(item);
  const title = item.review_ref ? `Suggestion · ${item.review_ref}` : "Suggestion";
  return `
    <div class="review-advice">
      <div class="review-advice-title">${escapeHtml(title)}</div>
      <dl>
        <dt>Background</dt>
        <dd>${escapeHtml(brief.background)}</dd>
        <dt>Why review</dt>
        <dd>${escapeHtml(brief.why)}</dd>
        <dt>Recommended next step</dt>
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
          ${badge(item.status || "new", item.status || "")}
          ${badge(item.category || "other")}
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
    $("listCount").textContent = "Setup required";
    return;
  }
  $("messageList").innerHTML = state.items.map(rowHtml).join("") || `<div class="empty-detail">No batch items</div>`;
  $("listCount").textContent = `${state.items.length} items`;
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
    });
  });
}

function onboardingHtml() {
  const onboarding = state.email_accounts?.onboarding || {};
  const missing = (onboarding.missing_env || []).map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`).join("");
  return `
    <div class="onboarding-card">
      <strong>${onboarding.state === "missing_secrets" ? "Add missing secrets" : "Set up Kelly Email"}</strong>
      <p>${escapeHtml(onboarding.message || "Configure email accounts before generating a mail batch.")}</p>
      <ol>
        <li>Copy <code>${escapeHtml(onboarding.example_config || ".agents/skills/kelly-email/config.example.yml")}</code></li>
        <li>Save it as <code>${escapeHtml(onboarding.recommended_config || "~/.config/kelly-email/config.yml")}</code></li>
        <li>Fill mailboxes, identities, user profile, brands, official URLs, style, and knowledge sources.</li>
        <li>Put IMAP/SMTP secret values in <code>${escapeHtml(onboarding.recommended_env || "~/.config/kelly-email/.env")}</code></li>
        <li>Ask <code>/kelly-email</code> to test config, then generate a batch.</li>
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
    $("detailPanel").innerHTML = `<div class="empty-detail">Select a message</div>`;
    return;
  }
  const attachments = (item.attachments || []).map(attachmentHtml).join("");
  const htmlPreview = (item.html || "").trim()
    ? `<iframe class="html-preview" sandbox srcdoc="${escapeHtml(item.html)}"></iframe>`
    : `<div class="body-box muted">No HTML version in this message.</div>`;
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const suggestedReply = suggestedReplyFor(item);
  const showDraft = Boolean(suggestedReply) || item.status === "drafted" || item.decision?.action === "send_reply";
  const draftSection = showDraft
    ? `
    <div class="section-title">Suggested reply</div>
    <textarea id="draftText" class="draft-box" placeholder="Suggested reply for this thread. Edit it, then approve send if it is ready.">${escapeHtml(suggestedReply)}</textarea>
  `
    : `<textarea id="draftText" class="draft-box is-hidden">${escapeHtml(item.draft || "")}</textarea>`;
  const reviewMeta = item.review_ref
    ? `<strong>Review</strong><div><span class="review-ref detail-review-ref">${escapeHtml(item.review_ref)}</span></div>`
    : "";
  $("detailPanel").innerHTML = `
    <div class="detail-title">${escapeHtml(item.subject)}</div>
    <div class="detail-meta">
      ${reviewMeta}
      <strong>From</strong><div>${escapeHtml(item.from)}</div>
      <strong>To</strong><div>${escapeHtml(item.to)}</div>
      <strong>Date</strong><div>${escapeHtml(item.date)}</div>
      <strong>Status</strong><div>${badge(item.status, item.status)} ${badge(item.category)} ${risks} ${decisionLabel(item)} ${executionLabel(item)}</div>
      <strong>Next</strong><div>${escapeHtml(actionLabel(item.proposed_action))} · ${escapeHtml(item.reason)}</div>
    </div>
    ${reviewBriefHtml(item)}
    <div class="detail-actions">
      <button id="approveProposed" class="primary has-tooltip" data-tooltip="Approve the suggested plan for this message. This only writes a local decision; /kelly-email still checks safety before execution." title="Approve the suggested plan for this message. This only writes a local decision; /kelly-email still checks safety before execution.">Approve plan</button>
      <button id="draftReply" ${tooltipAttr("Ask /kelly-email to draft a reply using your Review note. This does not send email.")}>Draft reply</button>
      <button id="approveArchive" ${tooltipAttr("Approve moving this message out of Inbox into Archive when /kelly-email executes approved decisions.")}>Approve archive</button>
      <button id="approveRead" ${tooltipAttr("Approve marking this message as read while keeping it in the mailbox folder.")}>Approve mark read</button>
      <button id="approveSend" ${tooltipAttr("Approve sending the edited draft as a reply. /kelly-email will still require safe threading and final send handling.")}>Approve send</button>
      <button id="markReview" ${tooltipAttr("Keep this message for human review. No mailbox action will be taken.")}>Needs review</button>
      <button id="noAction" ${tooltipAttr("Record no action for this message in the local decision file.")}>No action</button>
    </div>
    ${draftSection}
    <div class="section-title">HTML email</div>
    ${htmlPreview}
    <div class="section-title">Attachments</div>
    <div class="attachment-list">${attachments || `<span class="muted">No attachments</span>`}</div>
    <div class="section-title">Review note</div>
    <textarea id="commentText" class="comment-box" placeholder="Type one instruction for /kelly-email. Example: ask Casper; ok to archive; draft a short reply; this is paid invoice, leave unread.">${escapeHtml(item.user_comment || "")}</textarea>
    <div class="detail-actions">
      <button id="saveDetail" class="has-tooltip" data-tooltip="Save this note to the local batch file. It does not touch email." title="Save this note to the local batch file. It does not touch email.">Save note</button>
    </div>
    <div class="section-title">Original text</div>
    <div class="body-box">${escapeHtml(item.body)}</div>
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
    if (isLocked()) return toast("/kelly-email is processing this batch. Editing is paused.");
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText").value,
      suggested_reply: $("draftText").value,
      comment: $("commentText").value,
    });
    toast("Saved to local batch file");
    await refresh();
    selectedId = item.id;
    renderDetail();
  };
}

async function refresh() {
  if (isEditing()) return pollLock();
  const q = encodeURIComponent($("searchInput").value || "");
  state = await api(`/api/state?mode=${mode}&q=${q}`);
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
}

async function pollLock() {
  const data = await api("/api/lock");
  state.lock = data.lock || { locked: false };
  applyLockState();
}

async function decide(action, ids = null) {
  if (isLocked()) return toast("/kelly-email is processing this batch. Editing is paused.");
  const list = ids && ids.length ? ids : Array.from(checked);
  if (!list.length) return toast("Select at least one message");
  const item = selectedItem();
  const comment = item && ids ? $("commentText")?.value || "" : "";
  if (item && ids) {
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText")?.value || item.draft || "",
      suggested_reply: $("draftText")?.value || item.suggested_reply || "",
      comment,
    });
  }
  const data = await api("/api/decision", { ids: list, action, comment });
  list.forEach((id) => checked.delete(id));
  toast(`Saved local decision for ${data.changed.length} item(s)`);
  await refresh();
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
      return toast("/kelly-email is processing this batch. Editing is paused.");
    }
    if (event.target.checked) state.items.forEach((item) => checked.add(item.id));
    else checked.clear();
    renderList();
  };
  $("searchInput").addEventListener("input", () => refresh());
  document.querySelectorAll("#filters button").forEach((button) => {
    button.onclick = async () => {
      document.querySelectorAll("#filters button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      mode = button.dataset.mode;
      selectedId = null;
      await refresh();
    };
  });
}

wire();
refresh().catch((error) => toast(error.message));
lockTimer = setInterval(() => pollLock().catch((error) => toast(error.message)), 3000);
refreshTimer = setInterval(() => refresh().catch((error) => toast(error.message)), 5000);
