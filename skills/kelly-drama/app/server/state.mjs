import { PROJECT_PATH, REPORT_PATH, TASKS_PATH } from "./paths.mjs";
import { loadProject } from "./project-store.mjs";
import { lockPayload } from "./lock.mjs";

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
  const relationshipsMissingEvidence = project.relationships.filter((relationship) => !(relationship.evidence || []).length).length;
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
  const needsReview = tasks.filter((task) => ["needs_review", "changes_requested"].includes(task.status)).length
    + project.characters.filter((item) => item.status === "needs_review").length
    + project.episodes.filter((item) => item.status === "needs_review").length
    + project.shots.filter((item) => item.status === "needs_review").length;
  const approved = tasks.filter((task) => task.status === "approved").length
    + project.characters.filter((item) => item.status === "approved").length
    + project.episodes.filter((item) => item.status === "approved").length
    + project.shots.filter((item) => item.status === "approved").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  return { needs_review: needsReview, approved, blocked };
}

export async function statePayload() {
  const project = await loadProject();
  return {
    project,
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
