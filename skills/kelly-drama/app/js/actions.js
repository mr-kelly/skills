import { api, toast } from "./api.js";
import { arr } from "./format.js";
import { t } from "./i18n.js";
import { openImageModal, openPromptModal } from "./modal.js";
import { navigateTo, syncRoute } from "./router.js";
import { isMobileLayout, setMobileDetailOpen } from "./shell.js";
import { store } from "./store.js";

// bindForm is called from every view-render function (overview.js, episodes.js,
// list-detail.js) after they rebuild the DOM, but this module needs to call
// back into render()/refreshHyperframeStatus()/shotsForEpisode() — functions
// that live in modules which themselves depend on this one (bindForm). Rather
// than a direct circular import, app.js registers the real implementations
// once every module has loaded. See frontend-modules.md in app-in-skill-creator.
const hooks = {
  render: () => {},
  refreshHyperframeStatus: async () => {},
  shotsForEpisode: () => [],
};
export function registerActionHooks(overrides) {
  Object.assign(hooks, overrides);
}

function value(form, name) {
  return form.elements[name]?.value ?? "";
}

function serializeItem(form, kind) {
  const base = { id: value(form, "id") || form.dataset.id };
  if (kind === "characters") {
    return {
      ...base,
      name: value(form, "name"),
      role: value(form, "role"),
      status: value(form, "status"),
      actor_profile: value(form, "actor_profile"),
      character_card: {
        identity: value(form, "identity"),
        motivation: value(form, "motivation"),
        wound: value(form, "wound"),
        secret: value(form, "secret"),
        arc: value(form, "arc"),
        voice: value(form, "voice"),
      },
      visual: {
        front: value(form, "front"),
        side: value(form, "side"),
        back: value(form, "back"),
        wardrobe: value(form, "wardrobe"),
        anchors: arr(value(form, "anchors")),
        forbidden_drift: arr(value(form, "forbidden_drift")),
      },
      voice_profile: {
        type: value(form, "voice_type"),
        pace: value(form, "voice_pace"),
        accent: value(form, "voice_accent"),
        signature: value(form, "voice_signature"),
        casting_reference: value(form, "voice_casting"),
        sample_script: value(form, "voice_sample"),
      },
    };
  }
  if (kind === "relationships") {
    return {
      ...base,
      from: value(form, "from"),
      to: value(form, "to"),
      type: value(form, "type"),
      public_status: value(form, "public_status"),
      hidden_truth: value(form, "hidden_truth"),
      power_dynamic: value(form, "power_dynamic"),
      emotional_temperature: value(form, "emotional_temperature"),
      conflict: value(form, "conflict"),
      evidence: arr(value(form, "evidence")),
    };
  }
  if (kind === "episodes") {
    let beats = [];
    try {
      beats = JSON.parse(value(form, "beats_json") || "[]");
    } catch {
      throw new Error("Invalid beats JSON");
    }
    return {
      ...base,
      number: Number.parseInt(value(form, "number"), 10) || 0,
      title: value(form, "title"),
      status: value(form, "status"),
      hyperframe_composition: value(form, "hyperframe_composition"),
      hyperframe_video_asset: value(form, "hyperframe_video_asset"),
      summary: value(form, "summary"),
      promise: value(form, "promise"),
      a_plot: value(form, "a_plot"),
      b_plot: value(form, "b_plot"),
      cliffhanger: value(form, "cliffhanger"),
      beats,
    };
  }
  if (kind === "shots") {
    const durRaw = value(form, "duration_seconds");
    const dur = Number.parseInt(durRaw, 10);
    const payload = {
      ...base,
      episode_id: value(form, "episode_id"),
      beat_id: value(form, "beat_id"),
      title: value(form, "title"),
      status: value(form, "status"),
      characters: arr(value(form, "characters")),
      emotion: value(form, "emotion"),
      shot_size: value(form, "shot_size"),
      camera_angle: value(form, "camera_angle"),
      camera_movement: value(form, "camera_movement"),
      lens: value(form, "lens"),
      transition_in: value(form, "transition_in"),
      transition_out: value(form, "transition_out"),
      composition: value(form, "composition"),
      camera: value(form, "camera"),
      setting: value(form, "setting"),
      lighting: value(form, "lighting"),
      action: value(form, "action"),
      prompt: value(form, "prompt"),
      video_prompt: value(form, "video_prompt"),
      negative_prompt: value(form, "negative_prompt"),
    };
    if (Number.isFinite(dur) && dur > 0) {
      payload.duration_seconds = dur;
      payload.duration_preset = `${dur}s`;
    }
    return payload;
  }
  return {
    ...base,
    kind: value(form, "kind"),
    target_id: value(form, "target_id"),
    status: value(form, "status"),
    title: value(form, "title"),
    note: value(form, "note"),
  };
}

async function saveForm(form) {
  const kind = form.dataset.kind;
  let payload;
  if (kind === "series") {
    payload = {
      title: value(form, "title"),
      genre: value(form, "genre"),
      platform: value(form, "platform"),
      format: value(form, "format"),
      tone: value(form, "tone"),
      audience: value(form, "audience"),
      hyperframe_project_path: value(form, "hyperframe_project_path"),
      logline: value(form, "logline"),
      hook_rules: arr(value(form, "hook_rules")),
      world_rules: arr(value(form, "world_rules")),
    };
    store.state = await api("/api/series", { series: payload });
  } else {
    payload = serializeItem(form, kind);
    store.state = await api(`/api/${kind}/${encodeURIComponent(payload.id)}`, payload);
    store.selectedId = payload.id;
  }
  toast(t("toast_saved"));
  syncRoute({ replace: true });
  hooks.render();
}

export function newItem() {
  const timestamp = Date.now().toString().slice(-5);
  const templates = {
    characters: {
      id: `char-new-${timestamp}`,
      name: "New character",
      role: "helper",
      status: "draft",
      character_card: {},
      visual: { anchors: [], forbidden_drift: [] },
    },
    relationships: {
      id: `rel-new-${timestamp}`,
      from: store.state.project.characters?.[0]?.id || "",
      to: store.state.project.characters?.[1]?.id || "",
      type: "new relationship",
      evidence: [],
    },
    episodes: {
      id: `ep-new-${timestamp}`,
      number: (store.state.project.episodes?.length || 0) + 1,
      title: "New episode",
      status: "draft",
      beats: [],
    },
    shots: {
      id: `shot-new-${timestamp}`,
      episode_id: store.state.project.episodes?.[0]?.id || "",
      title: "New shot",
      status: "draft",
      characters: [],
    },
    tasks: { id: `task-new-${timestamp}`, kind: "episode", status: "needs_review", title: "New task", note: "" },
  };
  const item = templates[store.view];
  store.selectedId = item.id;
  store.state.project[store.view].push(item);
  navigateTo({
    selectedId: item.id,
    episodeMode: store.view === "episodes" ? "detail" : store.episodeMode,
    episodeTab: "summary",
  });
}

export function bindForm() {
  document.querySelectorAll("[data-go]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: node.dataset.go, selectedId: null, episodeMode: "list", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-select]").forEach((node) => {
    node.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ selectedId: node.dataset.select });
    });
  });
  document.querySelectorAll("[data-episode-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({
        view: "episodes",
        selectedId: node.dataset.episodeDetail,
        episodeMode: "detail",
        episodeTab: "summary",
      });
    });
  });
  document.querySelectorAll("[data-row-episode]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({
        view: "episodes",
        selectedId: node.dataset.rowEpisode,
        episodeMode: "detail",
        episodeTab: "summary",
      });
    });
  });
  document.querySelectorAll("[data-episode-list]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: "episodes", selectedId: null, episodeMode: "list", episodeTab: "summary" });
    });
  });
  document.querySelectorAll("[data-episode-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ view: "episodes", episodeMode: "detail", episodeTab: node.dataset.episodeTab });
    });
  });
  document.querySelectorAll("[data-shot-toggle]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("[data-generate-image], [data-prompt-preview], [data-image-zoom]")) return;
      const id = node.dataset.shotToggle;
      if (store.expandedShots.has(id)) store.expandedShots.delete(id);
      else store.expandedShots.add(id);
      hooks.render();
    });
  });
  const expandAll = document.querySelector("[data-shots-expand-all]");
  if (expandAll) {
    expandAll.addEventListener("click", () => {
      const shots = hooks.shotsForEpisode(store.selectedId);
      const allOpen = shots.every((s) => store.expandedShots.has(s.id));
      shots.forEach((s) => (allOpen ? store.expandedShots.delete(s.id) : store.expandedShots.add(s.id)));
      hooks.render();
    });
  }
  document.querySelectorAll("[data-generate-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateImage;
      node.disabled = true;
      node.textContent = t("generating");
      try {
        const result = await api("/api/storyboard-image", { shot_id: shotId });
        store.state = result.state || (await api("/api/state"));
        toast(t("toast_image_generated"));
        hooks.render();
      } catch (error) {
        toast(error.message || t("generate_image_failed"));
        node.disabled = false;
        node.textContent = t("generate_image");
      }
    });
  });
  document.querySelectorAll("[data-generate-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateVideo;
      node.disabled = true;
      node.textContent = t("generating_video");
      try {
        const result = await api("/api/shot-video", { shot_id: shotId });
        store.state = result.state || (await api("/api/state"));
        toast(t("toast_video_generated"));
        hooks.render();
      } catch (error) {
        toast(error.message || t("generate_video_failed"));
        node.disabled = false;
        node.textContent = t("generate_video");
      }
    });
  });
  document.querySelectorAll("[data-generate-voice]").forEach((node) => {
    node.addEventListener("click", async () => {
      const id = node.dataset.generateVoice;
      node.disabled = true;
      node.textContent = t("generating_voice");
      try {
        const result = await api("/api/character-voice", { character_id: id });
        store.state = result.state || (await api("/api/state"));
        toast(t("toast_voice_generated"));
        hooks.render();
      } catch (error) {
        toast(error.message || t("generate_voice_failed"));
        node.disabled = false;
        node.textContent = t("generate_voice");
      }
    });
  });
  document.querySelectorAll("[data-set-voice-active]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        store.state = await api("/api/character-voice-active", {
          character_id: node.dataset.char,
          path: node.dataset.setVoiceActive,
        });
        toast(t("toast_voice_active"));
        hooks.render();
      } catch (error) {
        toast(error.message || "Failed");
      }
    });
  });
  document.querySelectorAll("[data-set-active-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        store.state = await api("/api/shot-active", {
          shot_id: node.dataset.shot,
          kind: "image",
          path: node.dataset.setActiveImage,
        });
        toast(t("toast_image_active"));
        hooks.render();
      } catch (error) {
        toast(error.message || "Failed");
      }
    });
  });
  document.querySelectorAll("[data-set-active-video]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        store.state = await api("/api/shot-active", {
          shot_id: node.dataset.shot,
          kind: "video",
          path: node.dataset.setActiveVideo,
        });
        toast(t("toast_video_active"));
        hooks.render();
      } catch (error) {
        toast(error.message || "Failed");
      }
    });
  });
  document.querySelectorAll("[data-prompt-preview]").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        const data = await api(`/api/storyboard-prompt?shot_id=${encodeURIComponent(node.dataset.promptPreview)}`);
        openPromptModal(data);
      } catch (error) {
        toast(error.message || "Could not load prompt");
      }
    });
  });
  document.querySelectorAll("[data-image-zoom]").forEach((node) => {
    node.addEventListener("click", () => openImageModal(node.dataset.imageZoom));
  });
  document.querySelectorAll("[data-hyperframe-refresh]").forEach((node) => {
    node.addEventListener("click", () => hooks.refreshHyperframeStatus());
  });
  const form = document.querySelector("form.detail-card");
  if (!form) return;
  form.addEventListener("input", () => {
    form.classList.add("is-dirty");
    const hint = form.querySelector(".save-hint");
    if (hint) hint.textContent = t("form_unsaved");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveForm(form);
  });
  const deleteButton = form.querySelector("[data-delete]");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!confirm(t("confirm_delete"))) return;
      const kind = form.dataset.kind;
      const id = form.dataset.id;
      store.state = await api(`/api/${kind}/${encodeURIComponent(id)}`, { delete: true });
      store.selectedId = null;
      toast(t("toast_deleted"));
      hooks.render();
    });
  }
}
