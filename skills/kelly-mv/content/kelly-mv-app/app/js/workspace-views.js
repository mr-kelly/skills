import {
  DURATIONS,
  esc,
  go,
  isMobileLayout,
  loadState,
  matchSearch,
  pickFile,
  project,
  render,
  secs,
  setMobileDetailOpen,
  state,
  statusClass,
  t,
  toast,
} from "../app.js";
import { listToArray, storyboardPromptPreview } from "./mv-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

export function renderList() {
  const host = document.getElementById("list");
  const countPill = document.getElementById("itemCount");
  const renderers = { concept: listConcept, song: listSong, cast: listCast, storyboard: listStoryboard };
  const { html, count } = renderers[state.view]();
  host.innerHTML = html;
  countPill.textContent = count;
  host.querySelectorAll("[data-select]").forEach((node) =>
    node.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      go(state.view, node.dataset.select, true);
    }),
  );
  host.querySelectorAll("[data-jump]").forEach((node) =>
    node.addEventListener("click", () => {
      setMobileDetailOpen(false);
      go(node.dataset.jump);
    }),
  );
}

function listConcept() {
  const c = state.data.completeness || {};
  const song = project().song || {};
  const rows = [
    [
      "song",
      t("checklist_song"),
      c.song_ready ? t("checklist_song_done").replace("{dur}", secs(song.duration_seconds)) : t("checklist_song_todo"),
      c.song_ready,
    ],
    [
      "concept",
      t("checklist_concept"),
      c.concept_ready ? t("checklist_concept_done") : t("checklist_concept_todo"),
      c.concept_ready,
    ],
    [
      "cast",
      t("checklist_cast"),
      t("checklist_cast_sub")
        .replace("{n}", (project().characters || []).length)
        .replace("{missing}", c.characters_missing_refs ?? 0),
      c.characters_missing_refs === 0 && (project().characters || []).length > 0,
    ],
    [
      "storyboard",
      t("checklist_storyboard"),
      t("checklist_storyboard_sub")
        .replace("{n}", (project().shots || []).length)
        .replace("{img}", c.shots_missing_image ?? 0)
        .replace("{vid}", c.shots_missing_video ?? 0),
      (project().shots || []).length > 0 && c.shots_missing_video === 0,
    ],
  ];
  const html = rows
    .map(
      ([view, label, sub, ok]) => `
    <div class="item-card" data-jump="${view}">
      <span class="ready-chip ${ok ? "ok" : "planned"}">${ok ? "✓" : "…"}</span>
      <div class="row-main"><div class="row-key">${esc(label)}</div><div class="table-sub">${esc(sub)}</div></div>
      <span class="row-arrow">›</span>
    </div>`,
    )
    .join("");
  return { html, count: `${rows.filter((r) => r[3]).length}/${rows.length}` };
}

function listSong() {
  const song = project().song || {};
  const html = song.audio_asset
    ? `<div class="item-card"><div class="row-main"><div class="row-key">${esc(song.title || "Song")}</div><div class="table-sub">${esc(song.artist || "")} · ${secs(song.duration_seconds)}</div></div><span class="badge ok">${t("song_uploaded_badge")}</span></div>`
    : `<div class="empty-shot">${t("song_list_empty")}</div>`;
  return { html, count: song.audio_asset ? 1 : 0 };
}

function listCast() {
  const items = (project().characters || []).filter(matchSearch);
  const html = items.length
    ? items
        .map((c) => {
          const thumb = c.reference_card?.image_asset
            ? `<img class="item-card-thumb" src="${esc(c.reference_card.image_asset)}" alt="" />`
            : `<div class="item-card-thumb thumb-empty">${t("cast_no_thumb")}</div>`;
          return `
      <div class="item-card ${c.id === state.selectedId ? "active" : ""}" data-select="${esc(c.id)}">
        ${thumb}
        <div class="row-main"><div class="row-key">${esc(c.name)}</div><div class="table-sub">${esc(c.role || "")}</div></div>
        <span class="badge ${statusClass(c.status)}">${esc(c.status || "draft")}</span>
      </div>`;
        })
        .join("")
    : `<div class="empty-shot">${t("cast_list_empty")}</div>`;
  return { html, count: items.length };
}

function listStoryboard() {
  const shots = (project().shots || []).filter(matchSearch);
  const c = state.data.completeness || {};
  const song = project().song || {};
  const hint = `<div class="mv-timeline-meta">${t("shot_timeline_meta")
    .replace("{n}", (project().shots || []).length)
    .replace(
      "{dur}",
      secs(c.shots_total_seconds),
    )}${song.duration_seconds ? t("shot_timeline_meta_song").replace("{song}", secs(song.duration_seconds)) : ""}</div>`;
  let html = hint;
  if (!shots.length) {
    html += `<div class="empty-shot">${t("shot_list_empty")}</div>`;
    return { html, count: 0 };
  }
  html += shots
    .map((shot, i) => {
      const thumb = shot.image_asset
        ? `<img class="shot-row-thumb" src="${esc(shot.image_asset)}" alt="" />`
        : `<div class="shot-row-thumb thumb-empty">${t("shot_no_image")}</div>`;
      const hasVideo = Boolean(shot.video_asset);
      return `
      <div class="shot-row ${shot.id === state.selectedId ? "active" : ""}" data-select="${esc(shot.id)}">
        <span class="shot-row-no">${i + 1}</span>
        ${thumb}
        <div class="shot-row-main">
          <div class="row-key">${esc(shot.title || shot.id)}</div>
          <div class="shot-row-meta">
            <span class="table-sub">${shot.duration_seconds || "?"}s</span>
            ${shot.image_asset ? `<span class="badge soft">${t("shot_badge_image")}</span>` : ""}
            ${hasVideo ? `<span class="badge status-done">${t("shot_badge_video")}</span>` : ""}
          </div>
        </div>
        <span class="row-arrow">›</span>
      </div>`;
    })
    .join("");
  return { html, count: (project().shots || []).length };
}

// ---------------------------------------------------------------------------
// DETAIL panel
// ---------------------------------------------------------------------------
export function renderDetail() {
  const host = document.getElementById("detail");
  const renderers = { concept: detailConcept, song: detailSong, cast: detailCast, storyboard: detailStoryboard };
  host.innerHTML = renderers[state.view]();
  bindDetail(host);
}

function field(label, name, value, opts = {}) {
  const { textarea, type = "text", placeholder = "", full } = opts;
  const control = textarea
    ? `<textarea data-field="${name}" rows="${opts.rows || 3}" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>`
    : `<input data-field="${name}" type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" />`;
  return `<label class="field ${full ? "full" : ""}"><span>${esc(label)}</span>${control}</label>`;
}
function selectField(label, name, value, options, opts = {}) {
  const opts2 = options
    .map((o) => `<option value="${esc(o)}" ${String(o) === String(value) ? "selected" : ""}>${esc(o)}</option>`)
    .join("");
  return `<label class="field ${opts.full ? "full" : ""}"><span>${esc(label)}</span><select data-field="${name}">${opts2}</select></label>`;
}
function collect(scope) {
  const out = {};
  scope.querySelectorAll("[data-field]").forEach((node) => {
    out[node.dataset.field] = node.value;
  });
  return out;
}

function detailConcept() {
  const c = project().treatment || {};
  return `
    <div class="detail-card">
      <div class="detail-head"><h3>${t("concept_title")}</h3></div>
      <div class="form-grid" id="conceptForm">
        ${field(t("concept_summary_label"), "summary", c.summary, { textarea: true, rows: 4, full: true, placeholder: t("concept_summary_placeholder") })}
        ${field(t("concept_look_label"), "look", c.look, { full: true, placeholder: t("concept_look_placeholder") })}
        ${field(t("concept_ratio_label"), "aspect_ratio", c.aspect_ratio || "16:9")}
      </div>
      <div class="form-actions"><button class="mini-button" id="conceptSave">${t("concept_save")}</button></div>
    </div>
    <div class="detail-card">
      <div class="detail-head"><h3>${t("how_to_title")}</h3></div>
      <p class="muted">${t("how_to_body")}</p>
    </div>`;
}

function detailSong() {
  const s = project().song || {};
  const has = Boolean(s.audio_asset);
  return `
    <div class="detail-card">
      <div class="detail-head"><h3>Song</h3>${s.source ? `<span class="badge soft">${esc(s.source)}</span>` : ""}</div>
      ${has ? `<audio controls src="${esc(s.audio_asset)}" style="width:100%"></audio>` : `<div class="asset-placeholder">${t("song_placeholder")}</div>`}
      <div class="form-actions"><button class="generate-image-button" id="songUpload">${has ? t("song_reupload") : t("song_upload")}</button></div>
      <div class="form-grid">
        ${field(t("song_title_label"), "title", s.title)}
        ${field(t("song_artist_label"), "artist", s.artist)}
      </div>
      <div class="form-actions"><button class="mini-button" id="songSave">${t("song_save")}</button></div>
      <p class="muted">${has ? t("song_duration_auto").replace("{dur}", secs(s.duration_seconds)) : t("song_duration_hint")}</p>
    </div>`;
}

function detailCast() {
  const c = (project().characters || []).find((x) => x.id === state.selectedId);
  if (!c) return `<div class="detail-card"><p class="muted">${t("cast_empty")}</p></div>`;
  const v = c.visual || {};
  const card = c.reference_card || {};
  const hasRef = Boolean(card.image_asset);
  return `
    <div class="detail-card" data-character="${esc(c.id)}">
      <div class="detail-head"><h3>${esc(c.name)}</h3><span class="badge ${statusClass(c.status)}">${esc(c.status || "draft")}</span></div>
      ${hasRef ? `<img class="character-reference" src="${esc(card.image_asset)}" alt="" />` : `<div class="asset-placeholder">${t("cast_no_ref")}</div>`}
      <div class="form-grid">
        ${field(t("cast_name_label"), "name", c.name)}
        ${field(t("cast_role_label"), "role", c.role)}
        ${selectField(t("cast_status_label"), "status", c.status || "draft", ["draft", "needs_review", "approved", "blocked"])}
        ${field(t("cast_profile_label"), "actor_profile", c.actor_profile, { textarea: true, rows: 2, full: true })}
        ${field(t("cast_front_label"), "front", v.front, { full: true })}
        ${field(t("cast_side_label"), "side", v.side, { full: true })}
        ${field(t("cast_back_label"), "back", v.back, { full: true })}
        ${field(t("cast_wardrobe_label"), "wardrobe", v.wardrobe, { full: true })}
        ${field(t("cast_anchors_label"), "anchors", (v.anchors || []).join(", "), { full: true })}
        ${field(t("cast_drift_label"), "forbidden_drift", (v.forbidden_drift || []).join(", "), { full: true })}
        ${field(t("cast_ref_prompt_label"), "ref_prompt", card.prompt, { textarea: true, rows: 4, full: true })}
      </div>
      <div class="form-actions">
        <button class="mini-button" id="castSave">${t("cast_save")}</button>
        <button class="generate-image-button" id="castGenRef">${t("cast_gen_ref")}</button>
        <button class="mini-button danger" id="castDelete">${t("cast_delete")}</button>
      </div>
    </div>`;
}

function assetMode(gen) {
  if (!gen) return "";
  if (gen.mode === "upload") return `<span class="img-mode-badge">${t("asset_uploaded")}</span>`;
  if (gen.mode === "image-edit") return `<span class="img-mode-badge">${t("asset_img_edit")}</span>`;
  if (gen.mode === "text-to-image") return `<span class="img-mode-badge">${t("asset_text_to_img")}</span>`;
  if (gen.mode === "draft") return `<span class="img-mode-badge">${t("asset_draft")}</span>`;
  return "";
}

// Candidates carry both the resolved display URL (`path`) and the stable
// `assetId` writes key off; the active pointer on the shot is the resolved
// URL, so match it back to a candidate's assetId for the "active" highlight.
function findAssetId(candidates, activePath) {
  return (candidates || []).find((c) => c.path === activePath)?.assetId || "";
}

function detailStoryboard() {
  const shot = (project().shots || []).find((x) => x.id === state.selectedId);
  if (!shot) return `<div class="detail-card"><p class="muted">${t("shot_empty")}</p></div>`;
  const chars = project().characters || [];
  const charChecks = chars
    .map(
      (c) =>
        `<label class="cand-chip"><input type="checkbox" data-char="${esc(c.id)}" ${(shot.characters || []).includes(c.id) ? "checked" : ""}/> ${esc(c.name)}</label>`,
    )
    .join("");
  const refChars = chars.filter((c) => (shot.characters || []).includes(c.id));
  const refReady = refChars.filter((c) => c.reference_card?.image_asset).length;

  const candStrip = (cands, activeAssetId, kind) =>
    cands.length
      ? `<div class="cand-strip">${cands
          .map(
            (cd) => `
    <div class="cand-thumb ${cd.assetId === activeAssetId ? "active" : ""}">
      ${kind === "video" ? `<video src="${esc(cd.path)}" muted></video>` : `<img src="${esc(cd.path)}" data-img-active="${esc(cd.assetId)}" alt="" />`}
      ${cd.assetId === activeAssetId ? `<span class="cand-pick">${t("shot_cand_active")}</span>` : `<button class="cand-pick" data-${kind === "video" ? "vid" : "img"}-active="${esc(cd.assetId)}">${t("shot_cand_select")}</button>`}
    </div>`,
          )
          .join("")}</div>`
      : "";

  return `
    <div class="detail-card shot-sheet" data-shot="${esc(shot.id)}">
      <div class="detail-head"><h3>${esc(shot.title || shot.id)}</h3><span class="badge soft">${shot.duration_seconds || "?"}s</span></div>

      <div class="section-label">${t("shot_section_image")}</div>
      ${shot.image_asset ? `<div class="storyboard-actions"><img class="storyboard-image" src="${esc(shot.image_asset)}" alt="" />${assetMode(shot.image_generation)}</div>` : `<div class="asset-placeholder">${t("shot_image_empty")}</div>`}
      ${candStrip(shot.image_candidates || [], findAssetId(shot.image_candidates, shot.image_asset), "image")}
      ${refChars.length ? `<p class="form-note">${t("cast_ref_note").replace("{ready}", refReady).replace("{total}", refChars.length)}${refReady < refChars.length ? ` ${t("cast_ref_note_missing")}` : ""}</p>` : ""}
      <div class="form-actions">
        <button class="generate-image-button" id="shotGenImg">${t("shot_gen_img")}</button>
        <button class="mini-button" id="shotUploadImg">${t("shot_upload_img")}</button>
        <button class="mini-button ghost" id="shotPromptPreview">${t("shot_view_prompt")}</button>
      </div>

      <div class="section-label">${t("shot_section_video")}</div>
      ${shot.video_asset ? `<div class="storyboard-actions"><video class="shot-video" src="${esc(shot.video_asset)}" controls preload="metadata" playsinline></video>${assetMode(shot.video_generation)}</div>` : `<div class="asset-placeholder">${t("shot_video_empty")}</div>`}
      ${candStrip(shot.video_candidates || [], findAssetId(shot.video_candidates, shot.video_asset), "video")}
      <div class="form-actions">
        <button class="mini-button ghost" id="shotGenVid">${t("shot_gen_vid")}</button>
        <button class="mini-button" id="shotUploadVid">${t("shot_upload_vid")}</button>
      </div>

      <div class="section-label">${t("shot_section_desc")}</div>
      <div class="form-grid">
        ${field(t("shot_title_label"), "title", shot.title)}
        ${selectField(t("shot_duration_label"), "duration_seconds", shot.duration_seconds || 8, DURATIONS)}
        ${field(t("shot_desc_label"), "description", shot.description, { textarea: true, rows: 4, full: true })}
        ${field(t("shot_neg_label"), "negative_prompt", shot.negative_prompt, { textarea: true, rows: 2, full: true })}
        ${field(t("shot_vid_prompt_label"), "video_prompt", shot.video_prompt, { full: true })}
      </div>
      <div class="section-label">${t("shot_section_chars")}</div>
      <div class="cand-chips" id="shotChars">${charChecks || `<span class="muted">${t("cast_add_cast_hint")}</span>`}</div>
      <div class="form-actions">
        <button class="mini-button" id="shotSave">${t("shot_save")}</button>
        <button class="mini-button danger" id="shotDelete">${t("shot_delete")}</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// DETAIL actions
// ---------------------------------------------------------------------------
function bindDetail(host) {
  const on = (id, fn) => {
    const n = host.querySelector(`#${id}`);
    if (n) n.addEventListener("click", fn);
  };

  // Concept
  on("conceptSave", async () => {
    const f = collect(host.querySelector("#conceptForm"));
    try {
      const provider = await getProvider();
      await provider.saveTreatment(f);
      await loadState();
      toast(t("toast_concept_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Song
  on("songUpload", async (e) => {
    const file = await pickFile("audio/*");
    if (!file) return;
    e.target.disabled = true;
    e.target.textContent = t("song_uploading");
    try {
      const provider = await getProvider();
      await provider.uploadSong(file, { title: project().song?.title || file.name.replace(/\.[^.]+$/, "") });
      await loadState();
      toast(t("toast_song_uploaded"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("songSave", async () => {
    const f = collect(host.querySelector(".detail-card"));
    try {
      const provider = await getProvider();
      await provider.saveSongMeta({ title: f.title, artist: f.artist });
      await loadState();
      toast(t("toast_song_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Cast
  on("castSave", async () => {
    const card = host.querySelector("[data-character]");
    const f = collect(card);
    const existing = (project().characters || []).find((x) => x.id === state.selectedId) || {};
    const payload = {
      id: state.selectedId,
      name: f.name,
      role: f.role,
      status: f.status,
      actor_profile: f.actor_profile,
      visual: {
        ...(existing.visual || {}),
        front: f.front,
        side: f.side,
        back: f.back,
        wardrobe: f.wardrobe,
        anchors: listToArray(f.anchors),
        forbidden_drift: listToArray(f.forbidden_drift),
      },
      reference_card: { ...(existing.reference_card || {}), prompt: f.ref_prompt },
    };
    try {
      const provider = await getProvider();
      await provider.saveCharacter(payload);
      await loadState();
      toast(t("toast_cast_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  on("castGenRef", async (e) => {
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestCharacterCardGeneration(state.selectedId);
      await loadState();
      toast(t("toast_ref_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("castDelete", async () => {
    if (!confirm(`${t("cast_delete")}?`)) return;
    try {
      const provider = await getProvider();
      await provider.deleteCharacter(state.selectedId);
      state.selectedId = null;
      await loadState();
      toast(t("toast_cast_deleted"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Shot
  on("shotSave", () => saveShot(host));
  on("shotGenImg", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestStoryboardImageGeneration(state.selectedId);
      await loadState();
      toast(t("toast_img_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("shotUploadImg", () => uploadShotAsset(host, "image"));
  on("shotGenVid", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestShotVideoGeneration(state.selectedId);
      await loadState();
      toast(t("toast_vid_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("shotUploadVid", () => uploadShotAsset(host, "video"));
  on("shotPromptPreview", async () => {
    await saveShot(host, true);
    openPromptPreview(state.selectedId);
  });
  on("shotDelete", async () => {
    if (!confirm(`${t("shot_delete")}?`)) return;
    try {
      const provider = await getProvider();
      await provider.deleteShot(state.selectedId);
      state.selectedId = null;
      await loadState();
      toast(t("toast_shot_deleted"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  host.querySelectorAll("[data-img-active]").forEach((n) =>
    n.addEventListener("click", async () => {
      try {
        const provider = await getProvider();
        await provider.setShotActive(state.selectedId, "image", n.dataset.imgActive);
        await loadState();
      } catch (e) {
        toast(e.message, "danger");
      }
    }),
  );
  host.querySelectorAll("[data-vid-active]").forEach((n) =>
    n.addEventListener("click", async () => {
      try {
        const provider = await getProvider();
        await provider.setShotActive(state.selectedId, "video", n.dataset.vidActive);
        await loadState();
      } catch (e) {
        toast(e.message, "danger");
      }
    }),
  );
}

async function uploadShotAsset(host, kind) {
  await saveShot(host, true);
  const file = await pickFile(kind === "video" ? "video/*" : "image/*");
  if (!file) return;
  try {
    const provider = await getProvider();
    await provider.uploadShotAsset(state.selectedId, kind, file);
    await loadState();
    toast(t("toast_song_uploaded"));
  } catch (e) {
    toast(e.message, "danger");
  }
}

async function saveShot(host, silent = false) {
  const card = host.querySelector("[data-shot]");
  if (!card) return;
  const f = collect(card);
  const characters = [...host.querySelectorAll("#shotChars input[data-char]:checked")].map((n) => n.dataset.char);
  const payload = {
    id: state.selectedId,
    title: f.title,
    duration_seconds: Number(f.duration_seconds) || 8,
    description: f.description,
    negative_prompt: f.negative_prompt,
    video_prompt: f.video_prompt,
    characters,
  };
  try {
    const provider = await getProvider();
    await provider.saveShot(payload);
    if (!silent) {
      await loadState();
      toast(t("toast_shot_saved"));
    }
  } catch (e) {
    toast(e.message, "danger");
  }
}

export async function newCharacter() {
  const id = `char-${Date.now()}`;
  try {
    const provider = await getProvider();
    await provider.saveCharacter({
      id,
      name: t("new_character_name"),
      role: "",
      status: "draft",
      visual: { front: "", side: "", back: "" },
      reference_card: { prompt: "" },
    });
    await loadState();
    go("cast", id);
  } catch (e) {
    toast(e.message, "danger");
  }
}
export async function newShot() {
  const id = `shot-${Date.now()}`;
  try {
    const provider = await getProvider();
    await provider.saveShot({ id, title: t("new_shot_name"), description: "", duration_seconds: 8, characters: [] });
    await loadState();
    go("storyboard", id);
  } catch (e) {
    toast(e.message, "danger");
  }
}

// ---------------------------------------------------------------------------
// Prompt preview — shows what the image model receives + the character cards
// fed in. Pure client-side computation now (no /api/storyboard-prompt round
// trip): the browser already has the full project state.
// ---------------------------------------------------------------------------
function openPromptPreview(shotId) {
  let data;
  try {
    data = storyboardPromptPreview(project(), shotId);
  } catch (e) {
    return toast(e.message, "danger");
  }
  const refs = data.references || [];
  const chars = data.characters || [];
  const modeLabel = data.mode === "image-edit" ? t("prompt_mode_img_edit") : t("prompt_mode_text");
  const node = document.createElement("div");
  node.className = "modal-backdrop";
  node.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><div class="modal-title">${t("prompt_preview_title")}</div><div class="modal-subtitle">${esc(data.title || shotId)} · ${esc(modeLabel)}</div></div><button class="modal-close" id="promptClose">${t("close")}</button></div>
      <div class="modal-body">
        ${chars.length ? `<section class="modal-section"><label>${t("prompt_label_chars")}</label>${chars.map((c) => `<div class="ctx-row"><span>${esc(c.name)}</span><p>${esc(c.visual_front || "")}${c.reference_image ? "" : t("prompt_no_ref")}</p></div>`).join("")}</section>` : ""}
        ${refs.length ? `<section class="modal-section"><label>${t("prompt_label_refs")}</label><div class="ref-grid">${refs.map((r) => `<figure><img class="ref-thumb" src="${esc(r.path)}" alt="" /><figcaption>${esc(r.name || r.kind)}</figcaption></figure>`).join("")}</div></section>` : `<section class="modal-section"><p class="muted">${t("prompt_no_ref_hint")}</p></section>`}
        <section class="modal-section"><label>${t("prompt_label_prompt")}</label><pre class="prompt-pre">${esc(data.prompt || "")}</pre></section>
        ${data.negative_prompt ? `<section class="modal-section"><label>${t("prompt_label_neg")}</label><pre class="prompt-pre">${esc(data.negative_prompt)}</pre></section>` : ""}
      </div>
    </section>`;
  document.body.appendChild(node);
  const close = () => node.remove();
  node.querySelector("#promptClose").addEventListener("click", close);
  node.addEventListener("click", (e) => {
    if (e.target === node) close();
  });
}
