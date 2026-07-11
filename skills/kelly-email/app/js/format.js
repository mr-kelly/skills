import { optionalT, t } from "./i18n.js";
import { store } from "./store.js";

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function shortSender(value) {
  return (value || "").replace(/".*?"/g, "").replace(/\s+/g, " ").trim() || t("unknown.sender");
}

export function parseEmailAddresses(value) {
  const results = [];
  const pattern = /(?:"?([^"<,]*)"?\s*)?<([^<>@\s]+@[^<>\s]+)>|([^<>,\s]+@[^<>,\s]+)/g;
  let match;
  while ((match = pattern.exec(value || ""))) {
    results.push({
      name: (match[1] || "").trim(),
      address: (match[2] || match[3] || "").trim().toLowerCase(),
    });
  }
  return results;
}

export function accountForItem(item) {
  const accounts = store.state.email_accounts?.accounts || [];
  const itemAccount = item.account || item.account_id || item.mailbox_id || "";
  return (
    accounts.find((account) => account.mailbox_id === itemAccount) ||
    accounts.find(
      (account) =>
        account.primary_email &&
        String(item.to || "")
          .toLowerCase()
          .includes(String(account.primary_email).toLowerCase()),
    ) ||
    null
  );
}

export function accountLabel(item) {
  const account = accountForItem(item);
  if (!account) return item.account || item.account_id || item.mailbox_id || t("account.unknown");
  return account.display_name || account.primary_email || account.mailbox_id || t("account.unknown");
}

export function accountEmailLabel(item) {
  const account = accountForItem(item);
  return account?.primary_email || item.account || item.account_id || item.mailbox_id || t("account.unknown");
}

export function replyIdentityForItem(item) {
  const accounts = store.state.email_accounts?.accounts || [];
  const recipients = new Set(parseEmailAddresses(item.to || "").map((address) => address.address));
  const account = accountForItem(item);
  const identities = accounts.flatMap((mailbox) =>
    (mailbox.identities || []).map((identity) => ({ ...identity, mailbox })),
  );
  const direct = identities.find((entry) => recipients.has(String(entry.send_as_email || "").toLowerCase()));
  if (direct) return direct;
  const accountIdentity = (account?.identities || [])[0];
  if (accountIdentity) return { ...accountIdentity, mailbox: account };
  return identities[0] || null;
}

export function replyIdentityLabel(item) {
  const identity = replyIdentityForItem(item);
  if (!identity) return t("identity.unknown");
  const name = identity.display_name || identity.identity_id || t("identity.unknown");
  const email = identity.send_as_email || identity.reply_to || "";
  return email ? `${name} <${email}>` : name;
}

export function sizeLabel(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isImage(att) {
  return (att.content_type || "").startsWith("image/");
}

export function isPdf(att) {
  return att.content_type === "application/pdf" || /\.pdf$/i.test(att.filename || "");
}

export function attachmentHtml(att) {
  const meta = `${escapeHtml(att.content_type || "file")} ${sizeLabel(att.size)}`;
  const url = att.url ? escapeHtml(att.url) : "";
  const link = url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(t("attachment.open"))}</a>` : "";
  const preview =
    url && isImage(att)
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

export function badgeLabel(value) {
  if (!value) return "";
  const key = String(value);
  return (
    optionalT(`label.status.${key}`) ||
    optionalT(`label.category.${key}`) ||
    optionalT(`label.risk.${key}`) ||
    key.replaceAll("_", " ")
  );
}

export function badge(text, extra = "") {
  return `<span class="badge ${extra}">${escapeHtml(badgeLabel(text))}</span>`;
}

export function actionLabel(action) {
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

export function tooltipAttr(text) {
  return `class="has-tooltip" data-tooltip="${escapeHtml(text)}" title="${escapeHtml(text)}"`;
}

export function languageLabel(code) {
  if (!code || code === "unknown") return t("language.unknown");
  return t(`language.current.${code}`) || code;
}
