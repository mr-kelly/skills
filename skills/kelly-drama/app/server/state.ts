import { lockPayload } from "./lock.ts";
import { ACTIVE_PROJECT_PATH, PROJECT_PATH, REPORT_PATH, TASKS_PATH } from "./paths.ts";
import { loadProject } from "./project-store.ts";
import { pathExists, readJson, writeJson } from "./utils.ts";

// Persisted `.data/active_project.json` shape (read via readJson with a `{}` fallback).
interface ActiveProjectState {
  active_project_id?: string;
  updated_at?: string;
}

function countBy(items, field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function completeness(project) {
  const charactersMissingViews = project.characters.filter((character) => {
    const visual = character.visual || {};
    return !visual.front || !visual.side || !visual.back;
  }).length;
  const relationshipsMissingEvidence = project.relationships.filter(
    (relationship) => !(relationship.evidence || []).length,
  ).length;
  const episodesMissingCliffhanger = project.episodes.filter((episode) => !episode.cliffhanger).length;
  const shotsMissingPrompt = project.shots.filter((shot) => !shot.prompt || !shot.negative_prompt).length;
  return {
    characters_missing_views: charactersMissingViews,
    relationships_missing_evidence: relationshipsMissingEvidence,
    episodes_missing_cliffhanger: episodesMissingCliffhanger,
    shots_missing_prompt: shotsMissingPrompt,
  };
}

function attention(project) {
  const tasks = project.tasks || [];
  const needsReview =
    tasks.filter((task) => ["needs_review", "changes_requested"].includes(task.status)).length +
    project.characters.filter((item) => item.status === "needs_review").length +
    project.episodes.filter((item) => item.status === "needs_review").length +
    project.shots.filter((item) => item.status === "needs_review").length;
  const approved =
    tasks.filter((task) => task.status === "approved").length +
    project.characters.filter((item) => item.status === "approved").length +
    project.episodes.filter((item) => item.status === "approved").length +
    project.shots.filter((item) => item.status === "approved").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  return { needs_review: needsReview, approved, blocked };
}

function projectOptions(project) {
  if (project.projects?.length) return project.projects;
  return [
    {
      id: project.project_id,
      title: project.series?.title || "未命名短剧",
      genre: project.series?.genre || "",
      format: project.series?.format || "",
    },
  ];
}

function activeProjectIdFor(project, activeState: ActiveProjectState = {}) {
  const known = new Set(
    projectOptions(project)
      .map((item) => item.id)
      .filter(Boolean),
  );
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
    series: entry.series || {},
    characters: entry.characters || [],
    relationships: entry.relationships || [],
    episodes: entry.episodes || [],
    shots: entry.shots || [],
    tasks: entry.tasks || [],
  };
}

export async function setActiveProject(activeProjectId) {
  const project = await loadProject();
  const known = new Set(
    projectOptions(project)
      .map((item) => item.id)
      .filter(Boolean),
  );
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
    app: "kelly-drama",
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
      episodes: countBy(project.episodes),
      shots: countBy(project.shots),
      tasks: countBy(project.tasks),
    },
    totals: {
      characters: project.characters.length,
      relationships: project.relationships.length,
      episodes: project.episodes.length,
      shots: project.shots.length,
      tasks: project.tasks.length,
    },
    completeness: completeness(project),
    attention: attention(project),
    lock: await lockPayload(),
  };
}
