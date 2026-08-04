import {
  dialogueCps,
  hasSoundBed,
  shotIsSilent,
  shotReadiness,
  shotsForEpisode as shotsForEpisodeModel,
} from "./drama-model.js?v=0.1.0";
import { escapeHtml, statusBadge } from "./format.js";
import { t } from "./i18n.js";
import { project } from "./store.js";

// Pure readiness rules (shotIsSilent/hasSoundBed/dialogueCps/shotReadiness)
// live in drama-model.js — same rules scripts/validate_shot_readiness.mjs
// enforces — this module only re-exports them for the view code below plus
// the candidate-strip / production-sheet HTML rendering.
export { dialogueCps, hasSoundBed, shotIsSilent, shotReadiness };

export function shotsForEpisode(episodeId) {
  return shotsForEpisodeModel(project(), episodeId);
}

function audioBlock(audio) {
  if (!audio) return `<p class="muted">${t("shot_pending_audio")}</p>`;
  const dlg = (audio.dialogue || [])
    .map(
      (d) =>
        `<li><b>${escapeHtml(d.speaker || "")}</b>${d.tone ? `<span class="tag">${escapeHtml(d.tone)}</span>` : ""}：${escapeHtml(d.line || "")}</li>`,
    )
    .join("");
  return `
    ${dlg ? `<ul class="audio-lines">${dlg}</ul>` : ""}
    ${audio.narration ? `<p><span class="mini-label">${t("audio_narration")}</span>${escapeHtml(audio.narration)}</p>` : ""}
    <div class="audio-grid">
      ${audio.sfx?.length ? `<div><span class="mini-label">${t("audio_sfx")}</span>${escapeHtml((audio.sfx || []).join(", "))}</div>` : ""}
      ${audio.ambient ? `<div><span class="mini-label">${t("audio_ambient")}</span>${escapeHtml(audio.ambient)}</div>` : ""}
      ${audio.music ? `<div><span class="mini-label">${t("audio_music")}</span>${escapeHtml(audio.music)}</div>` : ""}
    </div>`;
}

function specRow(shot) {
  const specs = [
    [t("spec_shot_size"), shot.shot_size],
    [t("spec_angle"), shot.camera_angle],
    [t("spec_movement"), shot.camera_movement],
    [t("spec_lens"), shot.lens],
    [t("spec_ratio"), shot.aspect_ratio],
    [t("spec_emotion"), shot.emotion],
  ].filter(([, v]) => v);
  if (!specs.length) return shot.camera ? `<p class="muted">${escapeHtml(shot.camera)}</p>` : "";
  return `<div class="spec-row">${specs.map(([k, v]) => `<span class="spec"><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`).join("")}</div>`;
}

function candidateList(shot, kind) {
  const list = kind === "video" ? shot.video_candidates : shot.image_candidates;
  const active = kind === "video" ? shot.video_asset : shot.image_asset;
  if (Array.isArray(list) && list.length) return { list, active };
  if (active) return { list: [{ path: active }], active };
  return { list: [], active };
}

function imageCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "image");
  if (list.length < 2) return "";
  return `<div class="cand-strip">${list
    .map(
      (c, i) => `
    <button type="button" class="cand-thumb ${c.path === active ? "active" : ""}" data-set-active-image="${escapeHtml(c.assetId)}" data-shot="${escapeHtml(shot.id)}" title="v${i + 1}${c.path === active ? " (active)" : " — click to select"}">
      <img src="${escapeHtml(c.path)}" alt="" loading="lazy" />
      ${c.path === active ? `<span class="cand-pick">✓</span>` : ""}
    </button>`,
    )
    .join("")}</div>`;
}

function videoModelLabel(generation) {
  if (!generation) return "Video";
  const b = generation.backend || "";
  const model = /seedance/i.test(b) ? "Seedance" : /ltx/i.test(b) ? "LTX" : generation.model || "Video";
  const m = generation.method === "text-to-video" ? "T2V" : generation.method === "image-to-video" ? "I2V" : "";
  return m ? `${model}·${m}` : model;
}

function videoCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "video");
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list
    .map(
      (c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-active-video="${escapeHtml(c.assetId)}" data-shot="${escapeHtml(shot.id)}">v${i + 1}·${escapeHtml(videoModelLabel(c.generation))}${c.path === active ? " ✓" : ""}</button>`,
    )
    .join("")}</div>`;
}

function shotVideoBlock(shot) {
  const v = shot.video_asset || "";
  const isVideo = Boolean(v);
  const hasImage = Boolean(shot.image_asset);
  return `
    <div class="shot-video">
      ${
        isVideo
          ? `<video src="${escapeHtml(v)}" controls preload="metadata" playsinline></video><span class="img-mode-badge">${escapeHtml(videoModelLabel(shot.video_generation))}</span>`
          : `<div class="asset-placeholder">${hasImage ? t("video_pending") : t("video_pending_image")}</div>`
      }
      ${videoCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-video-button" data-generate-video="${escapeHtml(shot.id)}" ${hasImage ? "" : "disabled"}>${isVideo ? t("regenerate_video") : t("generate_video")}</button>
      </div>
    </div>`;
}

function storyboardImageBlock(shot) {
  const asset = shot.image_asset || "";
  const isGenerated = Boolean(asset);
  const mode = shot.image_generation?.mode;
  const modeBadge =
    isGenerated && mode
      ? `<span class="img-mode-badge">${mode === "image-edit" ? t("modal_mode_image_edit") : t("modal_mode_text")}</span>`
      : "";
  return `
    <div class="storyboard-image">
      ${isGenerated ? `<img src="${escapeHtml(asset)}" alt="${escapeHtml(shot.title || "Storyboard image")}" data-image-zoom="${escapeHtml(asset)}" title="Click to enlarge" />` : `<div class="asset-placeholder">${escapeHtml(asset || t("image_pending"))}</div>`}
      ${modeBadge}
      ${imageCandidateStrip(shot)}
      <div class="storyboard-actions">
        <button type="button" class="mini-button generate-image-button" data-generate-image="${escapeHtml(shot.id)}">${isGenerated ? t("regenerate_image") : t("generate_image")}</button>
        <button type="button" class="mini-button ghost" data-prompt-preview="${escapeHtml(shot.id)}">${t("view_prompt")}</button>
      </div>
    </div>`;
}

function formatSrtLine(line, index) {
  if (typeof line === "string") return line;
  return `${index + 1}\n${line.time || "00:00:00,000 --> 00:00:03,000"}\n${line.text || ""}`;
}

export function shotPreview(shot) {
  const srt = shot.srt || [];
  const r = shotReadiness(shot);
  const pendingCount = r.missing.length + (r.pacingWarn ? 1 : 0);
  const readinessChip = r.ready
    ? `<span class="ready-chip ok">${t("shot_video_ready")}</span>`
    : `<span class="ready-chip warn" title="${escapeHtml([...r.missing.map((m) => m), r.pacingWarn ? `Pace: ${r.cps.toFixed(1)} chars/s` : ""].filter(Boolean).join(", "))}">${t("shot_pending").replace("{n}", pendingCount)}</span>`;
  const cont = shot.continuity || {};
  return `
    <article class="shot-script-card">
      <div class="shot-script-head">
        <div>
          <span class="badge">${escapeHtml(shot.beat_id || "beat")}</span>
          <span class="badge">${escapeHtml(shot.duration_preset || `${shot.duration_seconds || ""}s` || "—")}</span>
          ${r.silent ? `<span class="badge soft">${t("shot_pure_visual")}</span>` : ""}
          ${readinessChip}
          <h4>${escapeHtml(shot.title || shot.id)}</h4>
        </div>
        ${statusBadge(shot.status)}
      </div>
      <div class="shot-sheet">
        <section class="sheet-block">
          <label>${t("shot_label_composition")}</label>
          <p>${escapeHtml(shot.composition || "")}</p>
          ${specRow(shot)}
          <p class="muted">${escapeHtml([shot.setting, shot.lighting].filter(Boolean).join(" · "))}</p>
        </section>
        ${shot.action ? `<section class="sheet-block"><label>${t("shot_label_action")}</label><p>${escapeHtml(shot.action)}</p></section>` : ""}
        ${shot.video_prompt ? `<section class="sheet-block"><label>${t("shot_label_video_prompt")}</label><pre class="soft-pre">${escapeHtml(shot.video_prompt)}</pre></section>` : ""}
        <section class="sheet-block">
          <label>${t("shot_label_audio")}</label>
          ${audioBlock(shot.audio)}
        </section>
        <section class="sheet-block">
          <label>${t("shot_label_srt")} ${r.silent ? "" : srt.length ? `<span class="cps ${r.pacingWarn ? "warn" : ""}">${r.cps.toFixed(1)} chars/s · ${srt.length} cues</span>` : ""}</label>
          ${
            r.silent
              ? `<p class="muted">${t("shot_pure_visual_note")}</p>`
              : `<pre>${escapeHtml(srt.length ? srt.map(formatSrtLine).join("\n\n") : t("shot_srt_pending"))}</pre>`
          }
        </section>
        ${shot.transition_in || shot.transition_out ? `<section class="sheet-block"><label>${t("shot_label_transition")}</label><p class="muted">${t("trans_in")}：${escapeHtml(shot.transition_in || "cut")} ／ ${t("trans_out")}：${escapeHtml(shot.transition_out || "cut")}</p></section>` : ""}
        ${
          cont.anchors || cont.props || cont.wardrobe
            ? `<section class="sheet-block"><label>${t("shot_label_continuity")}</label>
          ${cont.wardrobe ? `<p><span class="mini-label">${t("cont_wardrobe")}</span>${escapeHtml(cont.wardrobe)}</p>` : ""}
          ${(cont.props || []).length ? `<p><span class="mini-label">${t("cont_props")}</span>${escapeHtml((cont.props || []).join(", "))}</p>` : ""}
          ${cont.carries_from_prev ? `<p><span class="mini-label">${t("cont_carries")}</span>${escapeHtml(cont.carries_from_prev)}</p>` : ""}
          ${(cont.anchors || []).length ? `<p><span class="mini-label">${t("cont_anchors")}</span>${escapeHtml((cont.anchors || []).join("; "))}</p>` : ""}
        </section>`
            : ""
        }
        <section class="sheet-block sheet-assets">
          <div>
            <label>${t("shot_label_storyboard_image")}</label>
            ${storyboardImageBlock(shot)}
          </div>
          <div>
            <label>${t("shot_label_video")}</label>
            ${shotVideoBlock(shot)}
          </div>
        </section>
      </div>
    </article>`;
}
