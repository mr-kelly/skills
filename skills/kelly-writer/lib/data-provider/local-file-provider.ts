// Local-file ReviewProvider: the zero-dependency default.
//
// State lives in app/.cache/ as JSON handoff files. This provider is the
// offline reference implementation of the same review model Busabase serves
// remotely, so KELLY_WRITER_DATA_PROVIDER=local|busabase is a config switch,
// not a rewrite of the UI or scripts.

import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirs, readActiveLock, readJson, slugify, withLock, writeJson } from "../common.ts";
import { currentBatchPath, decisionsPath, exportReportPath, exportsDir } from "../paths.ts";
import type { HttpError, ProviderMeta } from "../types.ts";
import { writeZipFile } from "../zip.ts";

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
          "KELLY_WRITER_CONFIG",
          "skills/kelly-writer/config.local.json",
          "~/.config/kelly-writer/config.json",
          "KELLY_CONTENT_CONFIG (legacy)",
          "~/.config/kelly-content/config.json (legacy)",
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

    async completeTodo(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload?.id || !payload?.main_content) {
        const error: HttpError = new Error("missing todo id or main_content");
        error.statusCode = 400;
        throw error;
      }
      const batch = await readJson(currentBatchPath, null);
      const todo = (batch?.todos || []).find((item) => item.id === payload.id);
      if (!batch || !todo) {
        const error: HttpError = new Error("todo not found");
        error.statusCode = 404;
        throw error;
      }
      if (batch.main_content && batch.main_content.source_todo_id !== todo.id) {
        const error: HttpError = new Error("Distribute the current main draft before completing another todo.");
        error.statusCode = 409;
        throw error;
      }
      const completedAt = new Date().toISOString();
      batch.main_content = {
        ...payload.main_content,
        id: payload.main_content.id || `main-${todo.id}`,
        source_todo_id: todo.id,
        title: payload.main_content.title || todo.title,
        dek: payload.main_content.dek || todo.description,
        status: "draft",
        completed_at: completedAt,
      };
      batch.todos = batch.todos.filter((item) => item.id !== todo.id);
      const topic = (batch.topics || []).find((item) => item.id === todo.topic_id);
      if (topic) topic.status = "drafted";
      batch.updated_at = completedAt;
      await writeJson(currentBatchPath, batch);
      return { ok: true, main_content: batch.main_content, completed_todo_id: todo.id };
    },

    async requestDistribution(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      const note = String(payload?.note || "").trim();
      if (!note) {
        const error: HttpError = new Error("distribution note is required");
        error.statusCode = 400;
        throw error;
      }
      const batch = await readJson(currentBatchPath, null);
      const main = batch?.main_content;
      if (!batch || !main) {
        const error: HttpError = new Error("main draft not found");
        error.statusCode = 404;
        throw error;
      }
      const requestedAt = new Date().toISOString();
      const item = {
        id: `dist-request-${Date.now()}`,
        channel: "distribution",
        status: "needs_review",
        owner: "AI writer",
        title: main.title,
        summary: note,
        body: await readableMainBody(main),
        distribution_note: note,
        source_main_id: main.id,
        source_draft_path: main.draft_path || null,
        requested_at: requestedAt,
      };
      batch.distribution ||= [];
      batch.distribution.push(item);
      batch.main_content = null;
      batch.updated_at = requestedAt;
      await writeJson(currentBatchPath, batch);
      await queueDistributionTask(item);
      return { ok: true, distribution: item };
    },

    async completeDistributionRevision(payload) {
      if (await readActiveLock()) {
        const error: HttpError = new Error("Content files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      const revision = payload?.revision || payload?.distribution;
      if (!payload?.id || !revision) {
        const error: HttpError = new Error("missing distribution id or revision");
        error.statusCode = 400;
        throw error;
      }
      if (!String(revision.title || "").trim() || !String(revision.body || "").trim()) {
        const error: HttpError = new Error("revised title and body are required");
        error.statusCode = 400;
        throw error;
      }
      const batch = await readJson(currentBatchPath, null);
      const item = (batch?.distribution || []).find((candidate) => candidate.id === payload.id);
      if (!batch || !item) {
        const error: HttpError = new Error("distribution draft not found");
        error.statusCode = 404;
        throw error;
      }
      const editableFields = [
        "title",
        "body",
        "summary",
        "channel",
        "format",
        "hook",
        "cta",
        "media_brief",
        "hashtags",
        "title_options",
        "source_notes",
        "risk",
        "export_filename",
        "source_draft_path",
      ];
      for (const field of editableFields) {
        if (field in revision) item[field] = revision[field];
      }
      const completedAt = new Date().toISOString();
      item.status = "needs_review";
      item.updated_at = completedAt;
      item.agent_revision_completed_at = completedAt;
      batch.updated_at = completedAt;
      await writeJson(currentBatchPath, batch);

      const decisionStore = await readJson(decisionsPath, { decisions: {} });
      const decisions = decisionStore.decisions || {};
      delete decisions[payload.id];
      await writeJson(decisionsPath, { decisions });

      const taskStore = await readJson(AGENT_TASKS_PATH, { tasks: {} });
      const tasks = taskStore.tasks || {};
      delete tasks[payload.id];
      await writeJson(AGENT_TASKS_PATH, { tasks });
      return { ok: true, distribution: item };
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
        const exportItems =
          Array.isArray(batch.distribution) && batch.distribution.length ? batch.distribution : batch.items || [];
        for (const item of exportItems) {
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
          const requestedFilename = item.export_filename || `${slugify(item.channel)}-${slugify(title)}.md`;
          const filename = path.basename(requestedFilename);
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
          const packaged = await packageMarkdownAssets(`${markdown}\n`, item.source_draft_path);
          await fs.writeFile(target, packaged.markdown);
          const archiveTarget = path.join(outDir, `${path.basename(filename, path.extname(filename))}.zip`);
          await writeZipFile(archiveTarget, [
            { name: path.basename(target), data: packaged.markdown },
            ...packaged.assets.map((asset) => ({ name: asset.archivePath, data: asset.data })),
          ]);
          exported.push({
            id: item.id,
            file: archiveTarget,
            markdown_file: target,
            assets: packaged.assets.map((asset) => asset.archivePath),
            missing_assets: packaged.missing,
          });
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

export async function readableMainBody(main) {
  const body = String(main?.body || "").trim();
  if (body && !looksLikeHtml(body)) return body;

  const draftBody = await readDraftBody(main?.draft_path);
  if (draftBody) return draftBody;

  if (body) return htmlToPlainText(body);
  return htmlToPlainText(main?.html || "");
}

async function readDraftBody(draftPath) {
  if (!draftPath) return "";
  try {
    return (await fs.readFile(draftPath, "utf8")).trim();
  } catch {
    return "";
  }
}

function looksLikeHtml(value) {
  return /<\/?(?:article|blockquote|br|div|figure|h[1-6]|img|li|ol|p|section|span|strong|ul)\b/i.test(value);
}

function htmlToPlainText(value) {
  return String(value || "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|figcaption|figure|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (entity) => {
      const entities = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&nbsp;": " ",
      };
      return entities[entity.toLowerCase()] || entity;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const EXPORTABLE_IMAGE_TYPES = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function packageMarkdownAssets(
  markdown,
  sourceDraftPath,
  contentRoot = process.env.KELLY_WRITER_CONTENT_ROOT || "/space/content-writer",
) {
  if (!sourceDraftPath) return { markdown, assets: [], missing: [] };

  const resolvedContentRoot = path.resolve(contentRoot);
  const source = path.resolve(sourceDraftPath);
  if (!isInside(resolvedContentRoot, source)) return { markdown, assets: [], missing: [] };
  const [projectDirectory] = path.relative(resolvedContentRoot, source).split(path.sep);
  const projectRoot = path.join(resolvedContentRoot, projectDirectory);
  const references = [...String(markdown).matchAll(MARKDOWN_IMAGE)];
  const assets = [];
  const missing = [];
  const replacements = new Map();
  const usedNames = new Set();
  const packagedTargets = new Map();

  for (const reference of references) {
    const rawTarget = reference[2];
    const imagePath = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
    if (/^(?:data:|https?:\/\/)/i.test(imagePath)) continue;

    const cleanPath = imagePath.split(/[?#]/, 1)[0];
    const target = path.resolve(path.dirname(source), cleanPath);
    const extension = path.extname(target).toLowerCase();
    if (!EXPORTABLE_IMAGE_TYPES.has(extension) || !isInside(projectRoot, target)) {
      missing.push(imagePath);
      continue;
    }

    let archivePath = packagedTargets.get(target);
    if (!archivePath) {
      const base = uniqueAssetName(path.basename(target), usedNames);
      archivePath = `images/${base}`;
      try {
        assets.push({ archivePath, data: await fs.readFile(target) });
        packagedTargets.set(target, archivePath);
      } catch {
        missing.push(imagePath);
        continue;
      }
    }
    replacements.set(rawTarget, archivePath);
  }

  const rewritten = String(markdown).replace(MARKDOWN_IMAGE, (match, alt, rawTarget) => {
    const archivePath = replacements.get(rawTarget);
    return archivePath ? `![${alt}](${archivePath})` : match;
  });
  return { markdown: rewritten, assets, missing: [...new Set(missing)] };
}

function uniqueAssetName(filename, usedNames) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = filename;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function queueDistributionTask(item) {
  const store = await readJson(AGENT_TASKS_PATH, { tasks: {} });
  const tasks = store.tasks || {};
  tasks[item.id] = {
    item_id: item.id,
    trigger: "distribution_requested",
    reason: item.distribution_note,
    requested_at: item.requested_at,
  };
  await writeJson(AGENT_TASKS_PATH, { tasks });
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
