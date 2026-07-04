export { loadConfig, loadConfigWithMeta, loadDotenvFiles, onboardingStatus } from "../../lib/data-provider/index.mjs";
import { onboardingStatus } from "../../lib/data-provider/index.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function safeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, val]) => typeof val === "string" || typeof val === "number" || typeof val === "boolean")
      .map(([key, val]) => [key, String(val)]),
  );
}

function publicProfile(config) {
  const profile = config.user_profile || {};
  return {
    display_name: profile.display_name || "",
    role: profile.role || "",
    company: profile.company || "",
    default_reply_as: profile.default_reply_as || "",
    languages: asArray(profile.languages).map(String),
    public_bio: profile.public_bio || "",
    contact_methods: asArray(profile.contact_methods)
      .map((method) => ({
        label: method?.label || "",
        value: method?.value || "",
      }))
      .filter((method) => method.label || method.value),
  };
}

function publicBrands(config) {
  return asArray(config.brands)
    .map((brand) => ({
      brand_id: brand?.brand_id || "",
      name: brand?.name || "",
      description: brand?.description || "",
      homepage: brand?.homepage || "",
      docs_url: brand?.docs_url || "",
      support_url: brand?.support_url || "",
      youtube_url: brand?.youtube_url || "",
    }))
    .filter((brand) => brand.name || brand.brand_id || brand.homepage);
}

function publicStyle(config) {
  const style = config.style || {};
  return {
    preset: style.preset || "",
    default_language: style.default_language || "auto",
    tone: style.tone || "",
    audience: style.audience || "",
    max_reply_words: style.max_reply_words || "",
    paragraph_style: style.paragraph_style || "",
    include_short_quote: style.include_short_quote !== false,
    signature_mode: style.signature_mode || "",
    preferred_signoff: style.preferred_signoff || "",
    reply_rules: asArray(style.reply_rules).map(String),
    cta_urls: safeStringMap(style.cta_urls),
  };
}

function publicKnowledgeBase(config) {
  const kb = config.knowledge_base || {};
  return {
    enabled: Boolean(kb.enabled),
    usage: kb.usage || "",
    facts: asArray(kb.facts).map(String),
    do_not_say: asArray(kb.do_not_say).map(String),
    sources: asArray(kb.sources)
      .map((source) => ({
        source_id: source?.source_id || "",
        type: source?.type || "",
        title: source?.title || source?.source_id || "",
        url: source?.url || "",
        path: source?.path || "",
        use_for: asArray(source?.use_for).map(String),
        enabled: source?.enabled !== false,
      }))
      .filter((source) => source.title || source.url || source.path),
  };
}

export function publicAccounts(config, source = "", onboarding = onboardingStatus(config, { source }), meta = {}) {
  const identitiesByMailbox = new Map();
  for (const identity of config.identities || []) {
    const rows = identitiesByMailbox.get(identity.mailbox_id) || [];
    rows.push({
      identity_id: identity.identity_id || "",
      send_as_email: identity.send_as_email || "",
      display_name: identity.display_name || "",
      brand_or_product: identity.brand_or_product || "",
      reply_to: identity.reply_to || "",
    });
    identitiesByMailbox.set(identity.mailbox_id, rows);
  }
  return {
    source,
    data_reader: meta.reader || onboarding.reader || "local",
    data_provider: meta.provider || "",
    onboarding,
    profile: publicProfile(config),
    brands: publicBrands(config),
    official_urls: safeStringMap(config.official_urls),
    style: publicStyle(config),
    knowledge_base: publicKnowledgeBase(config),
    accounts: (config.mailboxes || []).map((mailbox) => {
      const imapEnv = mailbox.imap?.password_env || "";
      const smtpEnv = mailbox.smtp?.password_env || "";
      return {
        mailbox_id: mailbox.mailbox_id || "",
        display_name: mailbox.display_name || mailbox.primary_email || mailbox.mailbox_id || "",
        primary_email: mailbox.primary_email || "",
        provider: mailbox.provider || "imap",
        aliases: mailbox.aliases || [],
        folders: mailbox.support_folders_or_labels || ["INBOX"],
        mailbox_group_id: mailbox.mailbox_group_id || "",
        imap_host: mailbox.imap?.host || "",
        imap_username: mailbox.imap?.username || "",
        smtp_host: mailbox.smtp?.host || "",
        smtp_username: mailbox.smtp?.username || "",
        imap_password_env: imapEnv,
        smtp_password_env: smtpEnv,
        imap_env_configured: Boolean(imapEnv && process.env[imapEnv]),
        smtp_env_configured: Boolean(smtpEnv && process.env[smtpEnv]),
        identities: identitiesByMailbox.get(mailbox.mailbox_id) || [],
      };
    }),
  };
}
