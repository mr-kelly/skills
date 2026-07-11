#!/usr/bin/env node
import { loadProject, saveProject } from "../app/server/project-store.ts";
import {
  generateCharacterCard,
  generateStoryboardImage,
  generateVisualBackground,
} from "../lib/generation/image-service.ts";
import { generateSongDraft } from "../lib/generation/song-service.ts";
import { generateShotVideoDraft, generateShotVideoProd } from "../lib/generation/video-service.ts";

const apply = process.argv.includes("--apply");
const initial = await loadProject();
const approved = (initial.tasks || []).filter((task) => task.type === "agent_execution" && task.status === "approved");

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", operations: approved }, null, 2));
  process.exit(0);
}

for (const pending of approved) {
  const latest = await loadProject();
  const task = (latest.tasks || []).find((item) => item.id === pending.id);
  if (!task || task.status !== "approved") continue;
  const action = String(task.proposed_action || "");
  const target = String(task.target_id || "");
  const startedAt = new Date().toISOString();
  try {
    if (action === "generate_storyboard_image") await generateStoryboardImage(target);
    else if (action === "generate_shot_video") {
      if (task.mode === "prod") await generateShotVideoProd();
      else await generateShotVideoDraft(target);
    } else if (action === "generate_visual_background") await generateVisualBackground();
    else if (action === "generate_character_card") await generateCharacterCard(target);
    else if (action === "generate_song_draft") await generateSongDraft();
    else throw new Error(`Unsupported agent action: ${action}`);

    const completed = await loadProject();
    const completedTask = (completed.tasks || []).find((item) => item.id === task.id);
    if (completedTask) {
      completedTask.status = "done";
      completedTask.executed_at = new Date().toISOString();
      completedTask.execution_result = { ok: true, operation: action, target };
    }
    completed.execution_reports = [
      ...(Array.isArray(completed.execution_reports) ? completed.execution_reports : []),
      {
        task_id: task.id,
        operation: action,
        target,
        status: "done",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      },
    ];
    await saveProject(completed);
  } catch (error) {
    const failed = await loadProject();
    const failedTask = (failed.tasks || []).find((item) => item.id === task.id);
    const message = error instanceof Error ? error.message : String(error);
    if (failedTask) {
      failedTask.status = "blocked";
      failedTask.execution_result = { ok: false, operation: action, target, error: message };
    }
    failed.execution_reports = [
      ...(Array.isArray(failed.execution_reports) ? failed.execution_reports : []),
      {
        task_id: task.id,
        operation: action,
        target,
        status: "blocked",
        error: message,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      },
    ];
    await saveProject(failed);
  }
}
