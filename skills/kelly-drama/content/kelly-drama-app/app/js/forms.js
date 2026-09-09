import { characterVisualLockReady, hasThreeViewNotes } from "./drama-model.js?v=0.1.0";
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
        ${input("title", t("field_title"), series.title)}
        ${input("genre", t("field_genre"), series.genre)}
        ${input("platform", t("field_platform_format"), series.platform)}
        ${input("format", t("field_episodes_runtime"), series.format)}
        ${input("tone", t("field_tone"), series.tone)}
        ${input("audience", t("field_target_audience"), series.audience)}
        ${input("hyperframe_project_path", t("field_hyperframe_project_path"), series.hyperframe_project_path || "")}
        ${textarea("logline", t("field_logline"), series.logline)}
        ${textarea("hook_rules", t("field_hook_rules"), lines(series.hook_rules))}
        ${textarea("world_rules", t("field_world_rules"), lines(series.world_rules))}
      </div>
      <div class="form-actions"><button type="submit">${t("form_series_save")}</button></div>
    </form>`;
}

function characterReferencePreview(item) {
  const reference = item.reference_card || {};
  const generated = Boolean(reference.image_asset);
  const notesReady = hasThreeViewNotes(item);
  const locked = characterVisualLockReady(item);
  return `
    <section class="character-reference">
      <div>
        <h3>${t("char_ref_title")}</h3>
        <p class="muted">${escapeHtml(reference.purpose || t("char_ref_hint"))}</p>
        <span class="visual-lock-status ${locked ? "ok" : "pending"}">${locked ? t("char_ref_locked") : t("char_ref_lock_pending")}</span>
      </div>
      ${reference.image_asset ? `<img src="${escapeHtml(reference.image_asset)}" alt="${t("char_ref_title")}" />` : `<div class="asset-placeholder">${t("char_ref_placeholder")}</div>`}
      <div class="character-reference-actions">
        <button type="button" class="mini-button generate-card-button" data-generate-character-card="${escapeHtml(item.id)}">${generated ? t("regenerate_image") : t("generate_reference_card")}</button>
        <button type="button" class="mini-button ${locked ? "ghost" : "primary"}" data-approve-character-card="${escapeHtml(item.id)}" ${generated && notesReady ? "" : "disabled"}>${locked ? t("char_ref_locked") : t("char_ref_lock")}</button>
      </div>
      ${!notesReady ? `<p class="form-note">${t("char_ref_lock_requires_notes")}</p>` : ""}
    </section>`;
}

function voiceCandidateStrip(character) {
  const list = character.voice_candidates || [];
  const active = character.voice_reference?.asset || "";
  if (list.length < 2) return "";
  return `<div class="cand-chips">${list
    .map(
      (c, i) => `
    <button type="button" class="cand-chip ${c.path === active ? "active" : ""}" data-set-voice-active="${escapeHtml(c.assetId)}" data-char="${escapeHtml(character.id)}">v${i + 1}${c.path === active ? " ✓" : ""}</button>`,
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
  const vp = item.voice_profile || {};
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || t("new_character"))}</h2>
      ${characterReferencePreview(item)}
      ${characterVoicePreview(item)}
      <div class="form-grid">
        ${input("id", t("field_character_id"), item.id)}
        ${input("name", t("field_name"), item.name)}
        ${input("role", t("field_dramatic_function"), item.role)}
        ${statusSelect(item.status)}
        ${textarea("actor_profile", t("field_actor_notes"), item.actor_profile)}
        ${textarea("identity", t("field_identity"), card.identity, false)}
        ${textarea("motivation", t("field_desire"), card.motivation, false)}
        ${textarea("wound", t("field_wound"), card.wound, false)}
        ${textarea("secret", t("field_secret"), card.secret, false)}
        ${textarea("arc", t("field_character_arc"), card.arc, false)}
        ${textarea("voice", t("field_dialogue_voice"), card.voice, false)}
        ${input("voice_type", t("field_voice_type"), vp.type)}
        ${input("voice_pace", t("field_voice_pace"), vp.pace)}
        ${input("voice_accent", t("field_voice_accent"), vp.accent)}
        ${input("voice_signature", t("field_voice_signature"), vp.signature)}
        ${input("voice_casting", t("field_voice_casting"), vp.casting_reference)}
        ${textarea("voice_sample", t("field_voice_sample"), vp.sample_script, false)}
        ${textarea("front", t("field_view_front"), visual.front, false)}
        ${textarea("side", t("field_view_side"), visual.side, false)}
        ${textarea("back", t("field_view_back"), visual.back, false)}
        ${textarea("wardrobe", t("field_wardrobe"), visual.wardrobe, false)}
        ${textarea("anchors", t("field_consistency_anchors"), lines(visual.anchors))}
        ${textarea("forbidden_drift", t("field_forbidden_drift"), lines(visual.forbidden_drift))}
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
      <h2>${escapeHtml(item.type || t("new_relationship"))}</h2>
      <div class="form-grid">
        ${input("id", t("field_relationship_id"), item.id)}
        ${characterSelect("from", t("field_from"), item.from)}
        ${characterSelect("to", t("field_to"), item.to)}
        ${input("type", t("field_relationship_type"), item.type)}
        ${input("emotional_temperature", t("field_emotional_temperature"), item.emotional_temperature)}
        ${textarea("public_status", t("field_public_relationship"), item.public_status, false)}
        ${textarea("hidden_truth", t("field_hidden_truth"), item.hidden_truth, false)}
        ${textarea("power_dynamic", t("field_power_direction"), item.power_dynamic, false)}
        ${textarea("conflict", t("field_current_conflict"), item.conflict)}
        ${textarea("evidence", t("field_evidence"), lines(item.evidence))}
      </div>
      ${relationshipPreview(item)}
      ${formActions()}
    </form>`;
}

function episodeForm(item) {
  return `
    <form class="detail-card" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <h2>${t("episode_heading").replace("{n}", escapeHtml(item.number || ""))} — ${escapeHtml(item.title || "")}</h2>
      <div class="form-grid">
        ${input("id", t("field_episode_id"), item.id)}
        ${input("number", t("field_episode_number"), item.number || "", "number")}
        ${input("title", t("field_title"), item.title)}
        ${statusSelect(item.status)}
        ${input("hyperframe_composition", t("field_hyperframe_composition"), item.hyperframe_composition || "")}
        ${input("hyperframe_video_asset", t("field_hyperframe_video_asset"), item.hyperframe_video_asset || "")}
        ${textarea("promise", t("field_episode_promise"), item.promise)}
        ${textarea("a_plot", t("field_a_plot"), item.a_plot, false)}
        ${textarea("b_plot", t("field_b_plot"), item.b_plot, false)}
        ${textarea("cliffhanger", t("field_cliffhanger"), item.cliffhanger)}
        ${textarea("beats_json", t("field_beats_json"), JSON.stringify(item.beats || [], null, 2))}
      </div>
      ${formActions()}
    </form>`;
}

function shotForm(item) {
  return `
    <form class="detail-card" data-kind="shots" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || t("new_shot"))}</h2>
      <div class="form-grid">
        ${input("id", t("field_shot_id"), item.id)}
        ${episodeSelect("episode_id", t("field_episode"), item.episode_id)}
        ${input("beat_id", t("field_beat_id"), item.beat_id)}
        ${input("title", t("field_shot_title"), item.title)}
        ${statusSelect(item.status)}
        ${input("duration_seconds", t("field_duration"), item.duration_seconds)}
        ${input("emotion", t("field_emotion"), item.emotion)}
        ${input("shot_size", t("field_shot_size"), item.shot_size)}
        ${input("camera_angle", t("field_camera_angle"), item.camera_angle)}
        ${input("camera_movement", t("field_camera_movement"), item.camera_movement)}
        ${input("lens", t("field_lens"), item.lens)}
        ${input("transition_in", t("field_transition_in"), item.transition_in)}
        ${input("transition_out", t("field_transition_out"), item.transition_out)}
        ${textarea("characters", t("field_characters"), lines(item.characters), false)}
        ${textarea("composition", t("field_composition"), item.composition, false)}
        ${textarea("camera", t("field_camera_freeform"), item.camera, false)}
        ${textarea("setting", t("field_setting"), item.setting, false)}
        ${textarea("lighting", t("field_lighting"), item.lighting, false)}
        ${textarea("action", t("field_action_script"), item.action, false)}
        ${textarea("prompt", t("field_image_prompt"), item.prompt)}
        ${textarea("video_prompt", t("field_video_prompt"), item.video_prompt)}
        ${textarea("negative_prompt", t("field_negative_prompt"), item.negative_prompt)}
      </div>
      <p class="form-note">${t("shot_structured_fields_note")}</p>
      ${formActions()}
    </form>`;
}

function taskForm(item) {
  return `
    <form class="detail-card" data-kind="tasks" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || t("new_task"))}</h2>
      <div class="form-grid">
        ${input("id", t("field_task_id"), item.id)}
        ${input("kind", t("field_kind"), item.kind)}
        ${input("target_id", t("field_target_id"), item.target_id)}
        ${statusSelect(item.status)}
        ${input("title", t("field_title"), item.title)}
        ${textarea("note", t("field_note_ai"), item.note)}
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
