import { escapeHtml, statusBadge } from "./format.js";
import { t } from "./i18n.js";
import { project } from "./store.js";

export function shotsForEpisode(episodeId) {
  return (project().shots || []).filter((shot) => shot.episode_id === episodeId);
}

const SHOT_READINESS_FIELDS = [
  ["composition", "Composition", (s) => s.composition],
  ["camera", "Camera spec", (s) => s.shot_size || s.camera_movement || s.camera],
  ["setting", "Setting", (s) => s.setting],
  ["lighting", "Lighting", (s) => s.lighting],
  ["action", "Action script", (s) => s.action],
  ["prompt", "Image prompt", (s) => s.prompt],
  ["video_prompt", "Video prompt", (s) => s.video_prompt],
  [
    "audio",
    "Sound design",
    (s) =>
      s.audio &&
      (s.audio.ambient ||
        (s.audio.dialogue || []).length ||
        s.audio.narration ||
        (s.audio.sfx || []).length ||
        s.audio.music),
  ],
  ["transition", "Transition", (s) => s.transition_in && s.transition_out],
  ["continuity", "Continuity anchors", (s) => s.continuity && (s.continuity.anchors || []).length],
];

export function shotIsSilent(shot) {
  if (shot.silent === true) return true;
  const a = shot.audio || {};
  return !(a.dialogue || []).length && !a.narration;
}

export function hasSoundBed(shot) {
  const a = shot.audio || {};
  return Boolean(a.ambient || (a.sfx || []).length || a.music);
}

export function dialogueCps(shot) {
  const seconds = Number(shot.duration_seconds) || 0;
  if (!seconds) return 0;
  const chars = (shot.srt || [])
    .map((l) => (typeof l === "string" ? l : l.text || ""))
    .join("")
    .replace(/\s/g, "").length;
  return chars / seconds;
}

export function shotReadiness(shot) {
  const missing = SHOT_READINESS_FIELDS.filter(([, , get]) => !get(shot)).map(([, label]) => label);
  const durOk = [4, 5, 6, 8, 10, 12].includes(Number(shot.duration_seconds));
  if (!durOk) missing.push("Duration");
  const silent = shotIsSilent(shot);
  const cps = dialogueCps(shot);
  let pacingWarn = false;
  if (silent) {
    if (!hasSoundBed(shot)) missing.push("Sound bed");
  } else {
    if (!(shot.srt || []).length) missing.push("Dialogue SRT");
    pacingWarn = cps > 8;
  }
  return { missing, cps, pacingWarn, silent, ready: missing.length === 0 && !pacingWarn };
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
  if (active?.startsWith("/generated/")) return { list: [{ path: active }], active };
  return { list: [], active };
}

function imageCandidateStrip(shot) {
  const { list, active } = candidateList(shot, "image");
  if (list.length < 2) return "";
  return `<div class="cand-strip">${list
    .map(
      (c, i) => `
    <button type="button" class="cand-thumb ${c.path === active ? "active" : ""}" data-set-active-image="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}" title="v${i + 1}${c.path === active ? " (active)" : " — click to select"}">
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
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-active-video="${escapeHtml(c.path)}" data-shot="${escapeHtml(shot.id)}">v${i + 1}·${escapeHtml(videoModelLabel(c.generation))}${c.path === active ? " ✓" : ""}</button>`,
    )
    .join("")}</div>`;
}

function shotVideoBlock(shot) {
  const v = shot.video_asset || "";
  const isVideo = v.startsWith("/generated/");
  const hasImage = (shot.image_asset || "").startsWith("/generated/");
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
  const isGenerated = asset.startsWith("/generated/");
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
