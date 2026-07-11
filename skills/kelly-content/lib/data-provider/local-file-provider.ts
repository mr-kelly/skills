// Local-file ReviewProvider: the zero-dependency default.
//
// State lives in app/.cache/ as JSON handoff files. This provider is the
// offline reference implementation of the same review model Busabase serves
// remotely, so KELLY_CONTENT_DATA_PROVIDER=local|busabase is a config switch,
// not a rewrite of the UI or scripts.

import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirs, readActiveLock, readJson, slugify, withLock, writeJson } from "../common.ts";
import { currentBatchPath, decisionsPath, exportReportPath, exportsDir } from "../paths.ts";
import type { HttpError, ProviderMeta } from "../types.ts";

const AGENT_TASKS_PATH = path.join(path.dirname(currentBatchPath), "agent_tasks.json");

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    name: "local",
    kind: "local",

    async getState() {
      const [batch, decisions, lock] = await Promise.all([
        readJson(currentBatchPath, null),
        readJson(decisionsPath, { decisions: {} }),
        readActiveLock(),
      ]);
      return {
        batch,
        decisions: decisions.decisions || {},
        lock,
        config_summary: this.configSummary(),
      };
    },

    configSummary() {
      return {
        provider: "local",
        config_source: meta.source || null,
        publishing_connectors: "disabled",
        config_paths: [
          "KELLY_CONTENT_CONFIG",
          "skills/kelly-content/config.local.json",
          "~/.config/kelly-content/config.json",
        ],
      };
    },

    async saveDecision(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload || !payload.id) {
        const error: HttpError = new Error("missing id");
        error.statusCode = 400;
        throw error;
      }
      const action = payload.action || "revise";
      const decision = {
        action,
        title: payload.title || "",
        body: payload.body || "",
        comment: payload.comment || "",
        decided_at: new Date().toISOString(),
      };
      const all = await readJson(decisionsPath, { decisions: {} });
      const decisions = all.decisions || {};
      decisions[payload.id] = decision;
      await writeJson(decisionsPath, { decisions });

      // request_changes / revise with a note is work the agent should pick up,
      // mirroring Busabase's /agent/tasks queue.
      await syncAgentTask(payload.id, decision);
      return { ok: true, decision };
    },

    async listAgentTasks() {
      const store = await readJson(AGENT_TASKS_PATH, { tasks: {} });
      return Object.values(store.tasks || {});
    },

    async confirmDirection(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload?.topic_id || !payload?.direction_id) {
        const error: HttpError = new Error("missing topic_id or direction_id");
        error.statusCode = 400;
        throw error;
      }
      const batch = await readJson(currentBatchPath, null);
      if (!batch) {
        const error: HttpError = new Error("missing batch");
        error.statusCode = 404;
        throw error;
      }
      // No automation has written real topics yet (see SKILL.md: "If a future
      // automation writes topics ... into current_batch.json, the UI should
      // prefer those explicit fields"). Until then the UI derives a temporary
      // repository view client-side and never persists it, so the topic/direction
      // ids it confirms against don't exist here. Materialize that same view
      // (sent by the client alongside the confirm request) into the batch so the
      // lookup below — and every future confirm — can resolve against real data.
      if (
        (!Array.isArray(batch.topics) || !batch.topics.length) &&
        Array.isArray(payload.topics) &&
        payload.topics.length
      ) {
        batch.topics = payload.topics;
      }
      const topic = (batch.topics || []).find((item) => item.id === payload.topic_id);
      const direction = topic?.directions?.find((item) => item.id === payload.direction_id);
      if (!topic || !direction) {
        const error: HttpError = new Error("topic or direction not found");
        error.statusCode = 404;
        throw error;
      }
      topic.status = "confirmed";
      for (const candidate of topic.directions || []) {
        candidate.status = candidate.id === direction.id ? "selected" : "ready";
      }
      batch.todos ||= [];
      const todoId = `todo-${topic.id}-${direction.id}`;
      const existing = batch.todos.find((item) => item.id === todoId);
      const todo = {
        id: todoId,
        topic_id: topic.id,
        direction_id: direction.id,
        title: direction.title,
        description: direction.description,
        subject: topic.subject || topic.title,
        status: "todo",
        assignee: "AI writer",
        source: topic.source || "local",
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, todo);
      else batch.todos.push(todo);
      await writeJson(currentBatchPath, batch);
      return { ok: true, todo };
    },

    async startTodo(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload?.id) {
        const error: HttpError = new Error("missing id");
        error.statusCode = 400;
        throw error;
      }
      const batch = await readJson(currentBatchPath, null);
      if (!batch) {
        const error: HttpError = new Error("missing batch");
        error.statusCode = 404;
        throw error;
      }
      const todo = (batch.todos || []).find((item) => item.id === payload.id);
      if (!todo) {
        const error: HttpError = new Error("todo not found");
        error.statusCode = 404;
        throw error;
      }
      for (const item of batch.todos || []) {
        if (item.status === "in_progress") item.status = "todo";
      }
      todo.status = "in_progress";
      todo.started_at = new Date().toISOString();
      todo.updated_at = todo.started_at;
      batch.main_content ||= {
        id: "main-blog",
        title: todo.title,
        status: "writing",
        hero_alt: "Editorial cover preview",
        cover_brief: "AI writer will prepare the cover and image brief after drafting starts.",
        dek: todo.description,
        html: "",
      };
      batch.main_content.title = todo.title;
      batch.main_content.status = "writing";
      batch.main_content.dek = todo.description;
      if (!batch.main_content.html || batch.main_content.html.includes("还没有开工")) {
        batch.main_content.html = `<p>${escapeHtml(todo.description)}</p><h3>Draft queue</h3><p>AI writer has started this main draft. Generate the outline, body, and media brief next.</p>`;
      }
      await writeJson(currentBatchPath, batch);
      return { ok: true, todo, main_content: batch.main_content };
    },

    async putBatch(batch) {
      await withLock("Generating content batch", async () => {
        await writeJson(currentBatchPath, batch);
      });
      return { ok: true, batch_id: batch.batch_id, count: (batch.items || []).length };
    },

    async exportApproved() {
      const batch = await readJson(currentBatchPath, null);
      if (!batch) {
        const error: HttpError = new Error("No current batch found. Generate a batch first.");
        error.statusCode = 404;
        throw error;
      }
      const decisionsFile = await readJson(decisionsPath, { decisions: {} });
      const decisionMap = decisionsFile.decisions || decisionsFile || {};
      const outDir = path.join(exportsDir, slugify(batch.batch_id));
      const exported = [];
      const skipped = [];

      await withLock("Exporting approved content", async () => {
        await ensureDirs(outDir);
        for (const item of batch.items || []) {
          // Only an explicit human decision recorded in decisions.json (written by
          // saveDecision via POST /api/decision) proves approval. A raw item.status
          // or item.decision field on the batch itself can be set by automation
          // writing current_batch.json directly (see SKILL.md) and must never be
          // trusted as a substitute for that human verdict.
          const decision = decisionMap[item.id] || {};
          if (decision.action !== "approve") {
            skipped.push({ id: item.id, reason: "not approved" });
            continue;
          }
          const title = decision.title || item.title;
          const body = decision.body || item.body;
          const filename = item.export_filename || `${slugify(item.channel)}-${slugify(title)}.md`;
          const target = path.join(outDir, filename);
          const markdown = [
            `# ${title}`,
            "",
            `Channel: ${item.channel}`,
            `Format: ${item.format || "post"}`,
            decision.comment ? `Review note: ${decision.comment}` : "",
            "",
            body,
            "",
            item.cta ? `CTA: ${item.cta}` : "",
            Array.isArray(item.hashtags) && item.hashtags.length ? `Hashtags: ${item.hashtags.join(" ")}` : "",
            item.media_brief ? `Media brief: ${item.media_brief}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          await fs.writeFile(target, `${markdown}\n`);
          exported.push({ id: item.id, file: target });
        }
        await writeJson(path.join(outDir, "batch.json"), batch);
        await writeJson(path.join(outDir, "decisions.json"), decisionsFile);
        await writeJson(exportReportPath, {
          batch_id: batch.batch_id,
          exported_at: new Date().toISOString(),
          output_dir: outDir,
          exported,
          skipped,
        });
      });
      return { exported, skipped, output_dir: outDir };
    },
  };
}

async function syncAgentTask(id, decision) {
  const queueable = decision.action === "request_changes" || (decision.action === "revise" && decision.comment.trim());
  const store = await readJson(AGENT_TASKS_PATH, { tasks: {} });
  const tasks = store.tasks || {};
  if (queueable) {
    tasks[id] = {
      item_id: id,
      trigger: decision.action === "request_changes" ? "changes_requested" : "revise_note",
      reason: decision.comment || "",
      requested_at: decision.decided_at,
    };
  } else {
    delete tasks[id];
  }
  await writeJson(AGENT_TASKS_PATH, { tasks });
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}
