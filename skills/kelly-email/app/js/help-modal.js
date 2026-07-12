import { escapeHtml } from "./format.js";
import { applyAccentTheme, renderLanguageSummary, renderThemeOptions, t } from "./i18n.js";
import { providerModeLabel, providerStatus, providerStatusText } from "./provider.js";
import { syncRoute } from "./router.js";
import { $, store } from "./store.js";

function providerValue(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || t("settings.not_configured");
}

function providerPair(primary, secondary) {
  const left = String(primary || "").trim();
  const right = String(secondary || "").trim();
  if (left && right && left !== right) return `${left} / ${right}`;
  return left || right || t("settings.not_configured");
}

function accountsCardsHtml() {
  const payload = store.state.email_accounts || {};
  const onboarding = payload.onboarding || {};
  const accounts = payload.accounts || [];
  const promptCard = `
    <article class="account-help-card">
      <div>
        <strong>${escapeHtml(t("account.add_title"))}</strong>
        <p>${escapeHtml(t("account.add_body"))}</p>
      </div>
      <pre><code>/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新当前 provider config，但不要让我在聊天里贴密码。

/kelly-email 给 main 账号增加 alias：hello@example.com，并新增一个 outbound identity：display name 是 Founder，send_as 是 founder@example.com。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 secret ref 或 Vault secret。</code></pre>
    </article>
  `;
  if (!onboarding.configured) {
    const missing = (onboarding.missing_env || [])
      .map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`)
      .join("");
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
  const accountCards = accounts
    .map((account) => {
      const aliases = (account.aliases || []).map((alias) => `<span>${escapeHtml(alias)}</span>`).join("");
      const identities = (account.identities || [])
        .map(
          (identity) => `
      <div class="account-identity">
        <span>${escapeHtml(identity.display_name || identity.identity_id)}</span>
        <code>${escapeHtml(identity.send_as_email)}</code>
      </div>
    `,
        )
        .join("");
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
    })
    .join("");
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
  return rows
    .map(
      ([label, value]) => `
    <div class="settings-row">
      <span>${escapeHtml(label)}</span>
      <a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>
    </div>
  `,
    )
    .join("");
}

function profileSettingsHtml() {
  const payload = store.state.email_accounts || {};
  const profile = payload.profile || {};
  const brands = payload.brands || [];
  const contacts = (profile.contact_methods || []).map((method) => `${method.label}: ${method.value}`);
  const brandHtml = brands.length
    ? brands
        .map(
          (brand) => `
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
    `,
        )
        .join("")
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
  const payload = store.state.email_accounts || {};
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
  const kb = store.state.email_accounts?.knowledge_base || {};
  const sources = kb.sources || [];
  const sourceHtml = sources.length
    ? sources
        .map(
          (source) => `
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
    `,
        )
        .join("")
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

export function setHelpTab(name) {
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.helpTab === name);
  });
  document.querySelectorAll("[data-help-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.helpPanel === name);
  });
}

export function activeHelpTab() {
  return document.querySelector("[data-help-tab].active")?.dataset.helpTab || "guide";
}

export function isHelpOpen() {
  return !$("helpModal")?.classList.contains("is-hidden");
}

export function openHelp(tab = "guide") {
  const modal = $("helpModal");
  const batch = store.state.batch || {};
  const onboarding = store.state.email_accounts?.onboarding || {};
  const provider = providerStatus();
  const connection = provider.connection || {};
  $("helpBatchInfo").textContent = batch.batch_id
    ? t("batch.info", { id: batch.batch_id, count: store.state.total_cached || 0, date: batch.generated_at || "" })
    : t("batch.none");
  $("helpDataReader").textContent = store.state.email_accounts?.data_reader || provider.provider || "local";
  $("helpDataProvider").textContent = providerModeLabel(provider);
  $("helpProviderStatus").textContent = providerStatusText(provider);
  $("helpProviderFolder").textContent = providerValue(
    provider.folder_slug,
    connection.folder_slug,
    connection.folder_node_id,
  );
  $("helpProviderBase").textContent = providerPair(
    provider.base_id || connection.base_id,
    provider.base_slug || connection.base_slug || connection.resolved_base_id,
  );
  $("helpProviderContactsBase").textContent = providerPair(
    provider.contacts_base_id || connection.contacts_base_id,
    provider.contacts_base_slug || connection.contacts_base_slug || connection.resolved_contacts_base_id,
  );
  $("helpProviderDrive").textContent = providerPair(
    provider.drive_slug || connection.drive_slug,
    provider.drive_id || connection.drive_id || connection.drive_node_id,
  );
  $("helpBatchPath").textContent = store.state.batch_path || t("files.no_batch");
  $("helpContactsPath").textContent = store.state.contacts_path || t("files.no_contacts");
  $("helpDecisionsPath").textContent = store.state.decisions_path || t("files.no_decisions");
  $("helpConfigPath").textContent = onboarding.configured
    ? store.state.email_accounts?.source || t("files.no_config")
    : t("files.onboarding");
  $("helpAccounts").innerHTML = accountSummaryHtml();
  $("helpProfile").innerHTML = profileSettingsHtml();
  $("helpStyle").innerHTML = styleSettingsHtml();
  $("helpKnowledge").innerHTML = knowledgeSettingsHtml();
  renderLanguageSummary();
  renderThemeOptions();
  applyAccentTheme();
  setHelpTab(tab);
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  syncRoute({ push: true });
}

export function closeHelp({ skipRoute = false } = {}) {
  const modal = $("helpModal");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  if (!skipRoute) syncRoute({ push: true });
}
