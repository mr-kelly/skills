import { ACTIVE_PROJECT_PATH, PROJECT_PATH, REPORT_PATH, TASKS_PATH } from "./paths.mjs";
import { loadProject } from "./project-store.mjs";
import { lockPayload } from "./lock.mjs";
import { pathExists, readJson, writeJson } from "./utils.mjs";

function countBy(items, field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function completeness(project) {
  const song = project.song || {};
  const concept = project.treatment || {};
  const shots = project.shots || [];
  const songReady = Boolean(song.audio_asset?.startsWith("/generated/"));
  const conceptReady = Boolean(concept.summary || concept.concept);
  const charactersMissingRefs = (project.characters || [])
    .filter((character) => !character.reference_card?.image_asset?.startsWith("/generated/")).length;
  const shotsMissingDesc = shots.filter((shot) => !String(shot.description || "").trim()).length;
  const shotsMissingImage = shots.filter((shot) => !shot.image_asset?.startsWith("/generated/")).length;
  const shotsMissingVideo = shots.filter((shot) => !shot.video_asset?.startsWith("/generated/")).length;
  const shotsTotalSeconds = shots.reduce((sum, shot) => sum + num(shot.duration_seconds), 0);
  return {
    song_ready: songReady,
    concept_ready: conceptReady,
    characters_missing_refs: charactersMissingRefs,
    shots_missing_desc: shotsMissingDesc,
    shots_missing_image: shotsMissingImage,
    shots_missing_video: shotsMissingVideo,
    shots_total_seconds: Math.round(shotsTotalSeconds),
    song_duration: num(song.duration_seconds),
  };
}

function attention(project) {
  const tasks = project.tasks || [];
  const needsReview = tasks.filter((task) => ["needs_review", "changes_requested"].includes(task.status)).length
    + (project.characters || []).filter((item) => item.status === "needs_review").length
    + (project.shots || []).filter((item) => item.status === "needs_review").length;
  const approved = tasks.filter((task) => task.status === "approved").length
    + (project.characters || []).filter((item) => item.status === "approved").length
    + (project.shots || []).filter((item) => item.status === "approved").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  return { needs_review: needsReview, approved, blocked };
}

// The single most useful next step for the human.
function nextStep(project) {
  const c = completeness(project);
  if (!c.song_ready) return "upload_song";
  if (!c.concept_ready) return "set_concept";
  if ((project.characters || []).length === 0) return "add_cast";
  if (c.characters_missing_refs > 0) return "generate_cast_refs";
  if ((project.shots || []).length === 0) return "add_shots";
  if (c.shots_missing_image > 0) return "fill_shot_images";
  if (c.shots_missing_video > 0) return "fill_shot_videos";
  return "review";
}

function projectOptions(project) {
  if (project.projects?.length) return project.projects;
  return [{
    id: project.project_id,
    title: project.song?.title || "未命名 MV",
    artist: project.song?.artist || "",
    mode: project.treatment?.mode || "",
  }];
}

function activeProjectIdFor(project, activeState = {}) {
  const known = new Set(projectOptions(project).map((item) => item.id).filter(Boolean));
  if (activeState.active_project_id && known.has(activeState.active_project_id)) return activeState.active_project_id;
  return project.project_id || projectOptions(project)[0]?.id || "";
}

function viewForProject(project, activeProjectId) {
  if (!activeProjectId || activeProjectId === project.project_id) return project;
  const entry = project.library?.[activeProjectId];
  if (!entry) return project;
  return {
    ...project,
    project_id: entry.project_id || activeProjectId,
    song: entry.song || {},
    treatment: entry.treatment || {},
    characters: entry.characters || [],
    shots: entry.shots || [],
    tasks: entry.tasks || [],
  };
}

export async function setActiveProject(activeProjectId) {
  const project = await loadProject();
  const known = new Set(projectOptions(project).map((item) => item.id).filter(Boolean));
  if (!known.has(activeProjectId)) throw new Error(`Unknown project: ${activeProjectId}`);
  await writeJson(ACTIVE_PROJECT_PATH, {
    active_project_id: activeProjectId,
    updated_at: new Date().toISOString(),
  });
  return statePayload();
}

export async function statePayload() {
  const rootProject = await loadProject();
  const activeState = (await pathExists(ACTIVE_PROJECT_PATH)) ? await readJson(ACTIVE_PROJECT_PATH, {}) : {};
  const activeProjectId = activeProjectIdFor(rootProject, activeState);
  const project = viewForProject(rootProject, activeProjectId);
  return {
    app: "kelly-mv",
    project,
    projects: projectOptions(rootProject),
    active_project_id: activeProjectId,
    paths: {
      project_path: PROJECT_PATH,
      tasks_path: TASKS_PATH,
      report_path: REPORT_PATH,
    },
    counts: {
      characters: countBy(project.characters),
      shots: countBy(project.shots),
      tasks: countBy(project.tasks),
    },
    totals: {
      characters: project.characters.length,
      shots: project.shots.length,
      tasks: project.tasks.length,
    },
    completeness: completeness(project),
    attention: attention(project),
    next_step: nextStep(project),
    lock: await lockPayload(),
  };
}
