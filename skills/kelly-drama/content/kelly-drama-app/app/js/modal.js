import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";

function ensureModalHost() {
  let host = document.getElementById("modalHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "modalHost";
    document.body.appendChild(host);
  }
  return host;
}

export function closeModal() {
  const host = document.getElementById("modalHost");
  if (host) host.innerHTML = "";
}

export function isModalOpen() {
  return Boolean(document.getElementById("modalHost")?.innerHTML);
}

function mountModal(inner) {
  const host = ensureModalHost();
  host.innerHTML = `<div class="modal-overlay" data-modal-close="1"><div class="modal-card">${inner}</div></div>`;
  host.querySelectorAll("[data-modal-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target === node) closeModal();
    });
  });
  const closeBtn = host.querySelector(".modal-close-button");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
}

export function openImageModal(src) {
  if (!src) return;
  mountModal(`
    <button type="button" class="modal-close-button" aria-label="Close">${t("modal_close")}</button>
    <div class="modal-image-wrap"><img src="${escapeHtml(src)}" alt="Storyboard enlarged" /></div>`);
}

function refThumb(ref) {
  return `
    <figure class="ref-thumb">
      <img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.name)}" data-image-zoom="${escapeHtml(ref.path)}" />
      <figcaption>${escapeHtml(ref.name)}<small>${ref.kind === "character" ? "Character card" : "Background"}</small></figcaption>
    </figure>`;
}

export function openPromptModal(data) {
  const refs = data.references || [];
  const modeLabel = data.mode === "image-edit" ? t("modal_mode_image_edit") : t("modal_mode_text");
  const ctx = data.context || {};
  const contextRows = [
    ["Episode", ctx.episode_title],
    ["Logline", ctx.logline],
    ["Realism target", ctx.realism_target],
    ["Color palette", ctx.color_palette],
    ["Period detail", ctx.period_detail],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="ctx-row"><span>${escapeHtml(k)}</span><p>${escapeHtml(v)}</p></div>`)
    .join("");
  const characters = (data.characters || [])
    .map(
      (c) => `
    <div class="ctx-row"><span>${escapeHtml(c.name)}</span><p>${escapeHtml(c.visual_front || "")}${c.reference_image ? "" : t("char_no_ref")}</p></div>`,
    )
    .join("");
  mountModal(`
    <button type="button" class="modal-close-button" aria-label="Close">${t("modal_close")}</button>
    <div class="modal-head">
      <h3>${escapeHtml(data.title || t("modal_prompt_title"))}</h3>
      <div class="modal-tags">
        <span class="badge">${escapeHtml(modeLabel)}</span>
        ${data.model ? `<span class="badge">${escapeHtml(data.model)}</span>` : ""}
        ${data.size ? `<span class="badge">${escapeHtml(data.size)}</span>` : ""}
        ${data.duration ? `<span class="badge">${escapeHtml(data.duration)}</span>` : ""}
      </div>
    </div>
    <div class="modal-body">
      ${refs.length ? `<section class="modal-section"><label>${t("modal_prompt_refs_label")}</label><div class="ref-grid">${refs.map(refThumb).join("")}</div></section>` : `<section class="modal-section"><p class="muted">${t("modal_prompt_no_refs")}</p></section>`}
      <section class="modal-section"><label>${t("modal_prompt_label")}</label><pre class="prompt-pre">${escapeHtml(data.prompt || "")}</pre></section>
      ${data.negative_prompt ? `<section class="modal-section"><label>${t("modal_negative_prompt_label")}</label><pre class="prompt-pre">${escapeHtml(data.negative_prompt)}</pre></section>` : ""}
      ${characters ? `<section class="modal-section"><label>${t("modal_characters_label")}</label>${characters}</section>` : ""}
      ${contextRows ? `<section class="modal-section"><label>${t("modal_context_label")}</label>${contextRows}</section>` : ""}
    </div>`);
  document
    .getElementById("modalHost")
    .querySelectorAll("[data-image-zoom]")
    .forEach((node) => {
      node.addEventListener("click", () => openImageModal(node.dataset.imageZoom));
    });
}
