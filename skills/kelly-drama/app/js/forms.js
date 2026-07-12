import {
  characterName,
  characterSelect,
  episodeSelect,
  escapeHtml,
  formActions,
  input,
  lines,
  statusSelect,
  textarea,
} from "./format.js";
import { t } from "./i18n.js";
import { store } from "./store.js";

export function seriesForm(series) {
  return `
    <form class="detail-card" data-kind="series">
      <h2>${t("form_series_title")}</h2>
      <div class="form-grid">
        ${input("title", "Title", series.title)}
        ${input("genre", "Genre", series.genre)}
        ${input("platform", "Platform / format", series.platform)}
        ${input("format", "Episodes / runtime", series.format)}
        ${input("tone", "Tone", series.tone)}
        ${input("audience", "Target audience", series.audience)}
        ${input("hyperframe_project_path", "HyperFrame project path", series.hyperframe_project_path || series.hyperframe_source?.project_path || "")}
        ${textarea("logline", "One-line logline", series.logline)}
        ${textarea("hook_rules", "Hook rules (one per line)", lines(series.hook_rules))}
        ${textarea("world_rules", "World rules (one per line)", lines(series.world_rules))}
      </div>
      <div class="form-actions"><button type="submit">${t("form_series_save")}</button></div>
    </form>`;
}

function characterReferencePreview(reference) {
  return `
    <section class="character-reference">
      <div>
        <h3>${t("char_ref_title")}</h3>
        <p class="muted">${escapeHtml(reference.purpose || t("char_ref_hint"))}</p>
      </div>
      ${reference.image_asset ? `<img src="${escapeHtml(reference.image_asset)}" alt="${t("char_ref_title")}" />` : `<div class="asset-placeholder">${t("char_ref_placeholder")}</div>`}
    </section>`;
}

function voiceCandidateStrip(character) {
  const list = character.voice_candidates || [];
  const active = character.voice_reference?.asset || "";
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list
    .map(
      (c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-voice-active="${escapeHtml(c.path)}" data-char="${escapeHtml(character.id)}">v${i + 1}${c.path === active ? " ✓" : ""}</button>`,
    )
    .join("")}</div>`;
}

function characterVoicePreview(item) {
  const vp = item.voice_profile || {};
  const vr = item.voice_reference || {};
  const summary = [vp.type, vp.pace, vp.accent, vp.signature].filter(Boolean).join(" · ");
  const generated = vr.asset && vr.status === "generated";
  return `
    <section class="character-voice">
      <div class="voice-head">
        <div>
          <h3>${t("char_voice_title")}</h3>
          <p class="muted">${escapeHtml(summary || t("char_voice_hint"))}</p>
        </div>
        <span class="voice-status ${generated ? "ok" : "planned"}">${generated ? t("char_voice_generated") : t("char_voice_planned")}</span>
      </div>
      ${vp.casting_reference ? `<p class="voice-line"><span class="mini-label">${t("char_voice_casting")}</span>${escapeHtml(vp.casting_reference)}</p>` : ""}
      ${vp.sample_script ? `<p class="voice-line"><span class="mini-label">${t("char_voice_sample")}</span>${escapeHtml(vp.sample_script)}</p>` : ""}
      <div class="voice-ref">
        ${
          generated
            ? `<audio controls src="${escapeHtml(vr.asset)}"></audio>`
            : `<div class="asset-placeholder">${t("char_voice_placeholder")}</div>`
        }
        <button type="button" class="mini-button generate-voice-button" data-generate-voice="${escapeHtml(item.id)}">${generated ? t("regenerate_voice") : t("generate_voice")}</button>
      </div>
      ${voiceCandidateStrip(item)}
    </section>`;
}

function characterForm(item) {
  const card = item.character_card || {};
  const visual = item.visual || {};
  const reference = item.reference_card || {};
  const vp = item.voice_profile || {};
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || "New character")}</h2>
      ${characterReferencePreview(reference)}
      ${characterVoicePreview(item)}
      <div class="form-grid">
        ${input("id", "Character ID", item.id)}
        ${input("name", "Name", item.name)}
        ${input("role", "Dramatic function", item.role)}
        ${statusSelect(item.status)}
        ${textarea("actor_profile", "Actor / performance notes", item.actor_profile)}
        ${textarea("identity", "Identity", card.identity, false)}
        ${textarea("motivation", "Desire", card.motivation, false)}
        ${textarea("wound", "Wound", card.wound, false)}
        ${textarea("secret", "Secret", card.secret, false)}
        ${textarea("arc", "Character arc", card.arc, false)}
        ${textarea("voice", "Dialogue voice (tone baseline)", card.voice, false)}
        ${input("voice_type", "Timbre / type", vp.type)}
        ${input("voice_pace", "Pace", vp.pace)}
        ${input("voice_accent", "Accent / dialect", vp.accent)}
        ${input("voice_signature", "Signature delivery", vp.signature)}
        ${input("voice_casting", "Casting reference voice", vp.casting_reference)}
        ${textarea("voice_sample", "Audition line (voice script sample)", vp.sample_script, false)}
        ${textarea("front", "Three-view: front", visual.front, false)}
        ${textarea("side", "Three-view: side", visual.side, false)}
        ${textarea("back", "Three-view: back", visual.back, false)}
        ${textarea("wardrobe", "Wardrobe", visual.wardrobe, false)}
        ${textarea("anchors", "Consistency anchors (one per line)", lines(visual.anchors))}
        ${textarea("forbidden_drift", "Forbidden drift (one per line)", lines(visual.forbidden_drift))}
      </div>
      ${formActions()}
    </form>`;
}

function relationshipPreview(item) {
  return `<div class="relationship-node"><strong>${escapeHtml(characterName(item.from))}</strong> → <strong>${escapeHtml(characterName(item.to))}</strong><p>${escapeHtml(item.conflict || "")}</p></div>`;
}

function relationshipForm(item) {
  return `
    <form class="detail-card" data-kind="relationships" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.type || "New relationship")}</h2>
      <div class="form-grid">
        ${input("id", "Relationship ID", item.id)}
        ${characterSelect("from", "From", item.from)}
        ${characterSelect("to", "To", item.to)}
        ${input("type", "Relationship type", item.type)}
        ${input("emotional_temperature", "Emotional temperature", item.emotional_temperature)}
        ${textarea("public_status", "Public relationship", item.public_status, false)}
        ${textarea("hidden_truth", "Hidden truth", item.hidden_truth, false)}
        ${textarea("power_dynamic", "Power direction", item.power_dynamic, false)}
        ${textarea("conflict", "Current conflict", item.conflict)}
        ${textarea("evidence", "Evidence (one per line)", lines(item.evidence))}
      </div>
      ${relationshipPreview(item)}
      ${formActions()}
    </form>`;
}

function episodeForm(item) {
  return `
    <form class="detail-card" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <h2>Ep ${escapeHtml(item.number || "")} — ${escapeHtml(item.title || "")}</h2>
      <div class="form-grid">
        ${input("id", "Episode ID", item.id)}
        ${input("number", "Episode number", item.number || "", "number")}
        ${input("title", "Title", item.title)}
        ${statusSelect(item.status)}
        ${input("hyperframe_composition", "HyperFrame composition", item.hyperframe_composition || item.source_composition || "")}
        ${input("hyperframe_video_asset", "HyperFrame video asset", item.hyperframe_video_asset || item.source_video_asset || "")}
        ${textarea("promise", "Episode promise", item.promise)}
        ${textarea("a_plot", "A-plot", item.a_plot, false)}
        ${textarea("b_plot", "B-plot", item.b_plot, false)}
        ${textarea("cliffhanger", "Cliffhanger", item.cliffhanger)}
        ${textarea("beats_json", "Beats JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
      ${formActions()}
    </form>`;
}

function shotForm(item) {
  return `
    <form class="detail-card" data-kind="shots" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "New shot")}</h2>
      <div class="form-grid">
        ${input("id", "Shot ID", item.id)}
        ${episodeSelect("episode_id", "Episode", item.episode_id)}
        ${input("beat_id", "Beat ID", item.beat_id)}
        ${input("title", "Shot title", item.title)}
        ${statusSelect(item.status)}
        ${input("duration_seconds", "Duration (s — 4/5/6/8/10/12)", item.duration_seconds)}
        ${input("emotion", "Emotion", item.emotion)}
        ${input("shot_size", "Shot size", item.shot_size)}
        ${input("camera_angle", "Camera angle", item.camera_angle)}
        ${input("camera_movement", "Camera movement", item.camera_movement)}
        ${input("lens", "Lens", item.lens)}
        ${input("transition_in", "Transition in", item.transition_in)}
        ${input("transition_out", "Transition out", item.transition_out)}
        ${textarea("characters", "Characters (one ID per line)", lines(item.characters), false)}
        ${textarea("composition", "Composition (still frame)", item.composition, false)}
        ${textarea("camera", "Camera (freeform)", item.camera, false)}
        ${textarea("setting", "Setting", item.setting, false)}
        ${textarea("lighting", "Lighting", item.lighting, false)}
        ${textarea("action", "Action script (motion)", item.action, false)}
        ${textarea("prompt", "Image prompt", item.prompt)}
        ${textarea("video_prompt", "Video motion prompt", item.video_prompt)}
        ${textarea("negative_prompt", "Negative prompt", item.negative_prompt)}
      </div>
      <p class="form-note">Sound design (audio), continuity, and SRT are structured fields — preserved on save. Edit via @ai or directly in project.json.</p>
      ${formActions()}
    </form>`;
}

function taskForm(item) {
  return `
    <form class="detail-card" data-kind="tasks" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "New task")}</h2>
      <div class="form-grid">
        ${input("id", "Task ID", item.id)}
        ${input("kind", "Kind", item.kind)}
        ${input("target_id", "Target ID", item.target_id)}
        ${statusSelect(item.status)}
        ${input("title", "Title", item.title)}
        ${textarea("note", "Note / @ai request", item.note)}
      </div>
      ${formActions()}
    </form>`;
}

export function detailForm(item) {
  if (!item)
    return `<div class="detail-card"><h2>${t("form_select_or_new")}</h2><p class="muted">${t("form_select_or_new_hint")}</p></div>`;
  if (store.view === "characters") return characterForm(item);
  if (store.view === "relationships") return relationshipForm(item);
  if (store.view === "episodes") return episodeForm(item);
  if (store.view === "shots") return shotForm(item);
  if (store.view === "tasks") return taskForm(item);
  return "";
}
