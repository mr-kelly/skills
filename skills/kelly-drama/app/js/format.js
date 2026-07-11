import { t } from "./i18n.js";
import { project } from "./store.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function arr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function lines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

export function statusBadge(status) {
  const label =
    {
      draft: t("status_draft"),
      needs_review: t("status_needs_review"),
      changes_requested: t("status_changes_requested"),
      approved: t("status_approved"),
      done: t("status_done"),
      blocked: t("status_blocked"),
    }[status] ||
    status ||
    t("status_draft");
  return `<span class="badge status-${escapeHtml(status || "draft")}">${escapeHtml(label)}</span>`;
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function characterName(id) {
  return (project().characters || []).find((character) => character.id === id)?.name || id || "";
}

export function episodeTitle(id) {
  return (project().episodes || []).find((episode) => episode.id === id)?.title || id || "";
}

export function input(name, label, value = "", type = "text") {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" /></div>`;
}

export function textarea(name, label, value = "", full = true) {
  return `<div class="field ${full ? "full" : ""}"><label for="${name}">${label}</label><textarea id="${name}" name="${name}">${escapeHtml(value)}</textarea></div>`;
}

export function select(name, label, value, options) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
  </select></div>`;
}

export function statusSelect(value) {
  return select("status", "Status", value || "draft", [
    "draft",
    "needs_review",
    "changes_requested",
    "approved",
    "done",
    "blocked",
  ]);
}

export function characterSelect(name, label, value) {
  const options = (project().characters || []).map((character) => character.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(characterName(id))}</option>`).join("")}
  </select></div>`;
}

export function episodeSelect(name, label, value) {
  const options = (project().episodes || []).map((episode) => episode.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(episodeTitle(id))}</option>`).join("")}
  </select></div>`;
}

export function formActions() {
  return `<div class="form-actions"><button type="submit">${t("form_save")}</button><button type="button" class="danger" data-delete>${t("form_delete")}</button><span class="muted save-hint">${t("form_saved_connected")}</span></div>`;
}
