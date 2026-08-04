#!/usr/bin/env node
// Trusted ingestion step. Kelly Writer's AirApp is review/decision-only (it
// only ever writes status/decision-note/decided-at onto an existing draft
// record) — it never generates content itself. This script is the process
// that reads a source (a file path or inline text), derives deterministic
// per-channel draft heuristics (ported verbatim from the retired
// scripts/generate_batch.ts's makeItem()), and writes the resulting rows
// into Busabase's `drafts` Base as new records, one per requested channel.
// The generator is a first-pass heuristic only; Codex should improve each
// draft with judgment (rewriting `body`/`hook`/`title` via a decision on the
// same record, or a fresh --apply run) before handing it to the user.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run), the same convention as
// kelly-family-fund's importer.
import fs from "node:fs/promises";
import path from "node:path";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { isoStamp, slugify } from "./lib/text.mjs";

function help() {
  console.log(`Usage: node scripts/generate_batch.mjs --source <path-or-text> [options]

Options:
  --channels <list>          Comma-separated channels (default: official_blog,xiaohongshu,wechat,newsletter,linkedin,x)
  --audience <text>          Target audience description
  --cta <text>                Call to action
  --title <text>              Fallback title if none is found in the source
  --source-draft-path <path>  Local path to the original source file, used later by
                               scripts/export_decisions.mjs to reattach referenced images
  --apply                     Write the drafts to Busabase (default is a dry run that only prints them)

Persists one Busabase "drafts" record per requested channel via
bases.createChangeRequest. Without --apply this is a dry run that only
prints what would be written.`);
}

const commonWords = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "your",
  "about",
  "into",
  "when",
  "what",
  "will",
  "would",
  "there",
  "their",
  "they",
  "them",
  "then",
  "than",
  "and",
  "the",
  "for",
]);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(part);
    }
  }
  return out;
}

async function readSource(input) {
  if (!input) return "";
  const resolved = path.resolve(input);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isFile()) return fs.readFile(resolved, "utf8");
  } catch {
    // Treat the argument as inline source text.
  }
  return input;
}

function firstHeading(text) {
  const line = text.split(/\r?\n/).find((entry) => entry.trim().replace(/^#+\s*/, "").length > 8);
  return line
    ? line
        .trim()
        .replace(/^#+\s*/, "")
        .slice(0, 90)
    : "";
}

function sentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarize(text) {
  const picked = sentences(text).slice(0, 4).join(" ");
  return (picked || text.trim()).slice(0, 700);
}

function canonicalIdea(summary) {
  return sentences(summary)[0] || summary.slice(0, 180);
}

function extractKeywords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !commonWords.has(word));
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function channelLabel(channel) {
  const labels = {
    official_blog: "Official Blog",
    xiaohongshu: "Xiaohongshu",
    wechat: "WeChat",
    newsletter: "Newsletter",
    linkedin: "LinkedIn",
    x: "X",
  };
  return labels[channel] || channel;
}

function hashtags(items) {
  return [...new Set(items.map((item) => `#${String(item).replace(/^#/, "").replace(/\s+/g, "")}`))]
    .filter((item) => item.length > 1)
    .slice(0, 10);
}

// Ported verbatim from the retired scripts/generate_batch.ts's makeItem().
function makeItem({ channel, index, batchId, title, summary, keywords, audience, cta }) {
  const id = `${String(index + 1).padStart(2, "0")}-${slugify(channel)}`;
  const base = {
    id,
    ref: index + 1,
    channel,
    status: "to_approve",
    title: `${channelLabel(channel)}: ${title}`,
    summary,
    source_notes: [summary],
    risk: [],
    cta,
    export_filename: `${String(index + 1).padStart(2, "0")}-${slugify(channel)}.md`,
  };

  if (channel === "xiaohongshu") {
    return {
      ...base,
      format: "post",
      title_options: [`${title}：我会这样拆`, "别急着发长文，先把这件事讲清楚", "适合收藏的一套内容思路"],
      hook: `如果你正在把一篇长内容拆给 ${audience} 看，先抓住这一点：${canonicalIdea(summary)}`,
      body: `如果你正在把一篇长内容拆给 ${audience} 看，可以先从这条主线开始：\n\n${summary}\n\n可以这样用：\n1. 先讲清楚读者为什么现在需要它。\n2. 再给一个具体例子，不要只讲概念。\n3. 最后给一个很轻的下一步。\n\n${cta}`,
      hashtags: hashtags(["内容创作", "小红书运营", "写作", ...keywords]),
      media_brief: "5-7 page carousel: problem, key idea, 3 steps, example, CTA.",
    };
  }

  if (channel === "official_blog" || channel === "official-blog" || channel === "blog") {
    return {
      ...base,
      channel: "official_blog",
      format: "article",
      title_options: [title, `${title}: a practical guide`, `How to think about ${title}`],
      hook: canonicalIdea(summary),
      body: `# ${title}\n\n${canonicalIdea(summary)}\n\n## Overview\n\n${summary}\n\n## Why it matters\n\nThis is the canonical version for the official blog. It should preserve the full argument, source proof, examples, and internal links before social-channel adaptation.\n\n## Practical workflow\n\n1. State the reader problem clearly.\n2. Keep evidence and examples from the source.\n3. Add visuals, screenshots, or diagrams where they make the idea easier to trust.\n4. End with a clear next step.\n\n${cta}`,
      media_brief: "Hero image plus 2-3 inline diagrams or screenshots that make the source argument concrete.",
    };
  }

  if (channel === "wechat") {
    return {
      ...base,
      format: "article",
      hook: `这篇文章想讨论的是：${canonicalIdea(summary)}`,
      body: `# ${title}\n\n这篇文章想讨论的是：${canonicalIdea(summary)}\n\n## 为什么重要\n\n${summary}\n\n## 可以怎么做\n\n- 保留原文里最有证据的部分。\n- 把抽象观点翻译成具体场景。\n- 让读者知道下一步能做什么。\n\n${cta}`,
    };
  }

  if (channel === "newsletter") {
    return {
      ...base,
      format: "email",
      title_options: [`A useful note on ${title}`, `What I would keep from ${title}`],
      hook: `Hi,\n\nI kept coming back to one idea: ${canonicalIdea(summary)}`,
      body: `Subject: A useful note on ${title}\nPreview: ${canonicalIdea(summary)}\n\nHi,\n\nI kept coming back to one idea: ${canonicalIdea(summary)}\n\n${summary}\n\nA practical way to use this:\n\n- Keep the original argument intact.\n- Pull out one concrete example.\n- Give readers one next step.\n\n${cta}`,
    };
  }

  if (channel === "linkedin") {
    return {
      ...base,
      format: "post",
      hook: canonicalIdea(summary),
      body: `${canonicalIdea(summary)}\n\nThe useful part is not just the idea itself. It is what it changes for ${audience}.\n\n${summary}\n\nA few ways to apply it:\n\n1. Start with the problem in the reader's words.\n2. Use proof from the original piece.\n3. End with one clear next step.\n\n${cta}`,
    };
  }

  if (channel === "x" || channel === "twitter") {
    return {
      ...base,
      channel: "x",
      format: "thread",
      hook: canonicalIdea(summary),
      body: [
        `1/ ${canonicalIdea(summary)}`,
        `2/ The source idea: ${summary.slice(0, 220)}`,
        "3/ The mistake is trying to copy the whole long-form piece into every platform.",
        "4/ Better: keep the promise, change the packaging, and preserve the proof.",
        `5/ Next step: ${cta}`,
      ].join("\n\n"),
    };
  }

  return {
    ...base,
    format: "post",
    hook: canonicalIdea(summary),
    body: `${canonicalIdea(summary)}\n\n${summary}\n\n${cta}`,
  };
}

function toRowFields(item, batchId, sourceDraftPath, canonicalIdeaText, sourceSummary) {
  return {
    draft_id: item.id,
    ref: item.ref,
    batch_id: batchId,
    channel: item.channel,
    format: item.format || "post",
    title: item.title,
    summary: item.summary || "",
    body: item.body || "",
    hook: item.hook || "",
    cta: item.cta || "",
    hashtags: JSON.stringify(item.hashtags || []),
    title_options: JSON.stringify(item.title_options || []),
    media_brief: item.media_brief || "",
    source_notes: JSON.stringify(item.source_notes || []),
    risk: JSON.stringify(item.risk || []),
    canonical_idea: canonicalIdeaText,
    source_summary: sourceSummary,
    source_draft_path: sourceDraftPath || "",
    export_filename: item.export_filename || "",
    status: item.status,
    created_at: new Date().toISOString(),
    decision_note: "",
    decided_at: "",
  };
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return help();
  const apply = Boolean(args.apply);

  const source = await readSource(args.source || args._[0] || "");
  if (!source.trim()) {
    help();
    process.exitCode = 1;
    return;
  }

  const channels = String(args.channels || "official_blog,xiaohongshu,wechat,newsletter,linkedin,x")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const title = firstHeading(source) || args.title || "Source Content";
  const summary = summarize(source);
  const keywords = extractKeywords(source);
  const batchId = `kelly-writer-${isoStamp()}`;
  const audience = args.audience || "the intended audience";
  const cta = args.cta || "Save this and revisit it when you plan your next step.";
  const sourceDraftPath = args["source-draft-path"] || "";

  const items = channels.map((channel, index) =>
    makeItem({ channel, index, batchId, title, summary, keywords, audience, cta }),
  );

  console.log(`Prepared ${items.length} draft(s) for batch ${batchId}.`);
  if (!apply) {
    console.log("Dry run (pass --apply to write to Busabase):");
    for (const item of items) console.log(`  ${item.channel.padEnd(14)} ${item.title}`);
    return;
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required with --apply");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Writer Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const draftsBase = resources.bases.find((base) => base.key === "drafts");

  let created = 0;
  for (const item of items) {
    const fields = toRowFields(item, batchId, sourceDraftPath, canonicalIdea(summary), summary);
    await client.bases.createChangeRequest({
      baseId: draftsBase.baseId,
      fields: toBusabaseFields(fields),
      message: `Add draft ${item.id} for batch ${batchId}`,
      submittedBy: "kelly-writer-generator",
      autoMerge: true,
    });
    created += 1;
  }

  console.log(`Wrote ${created} new draft(s) to Busabase for batch ${batchId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
