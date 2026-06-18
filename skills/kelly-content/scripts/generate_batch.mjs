#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { isoStamp, slugify } from "../lib/common.mjs";
import { createProvider } from "../lib/data-provider/index.mjs";

const args = parseArgs(process.argv.slice(2));
const source = await readSource(args.source || args._[0] || "");
if (!source.trim()) {
  console.error("Usage: generate_batch.mjs --source <path-or-text> [--channels official_blog,xiaohongshu,wechat,newsletter,linkedin,x] [--audience text] [--cta text]");
  process.exit(1);
}

const channels = String(args.channels || "official_blog,xiaohongshu,wechat,newsletter,linkedin,x")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const commonWords = new Set(["that", "this", "with", "from", "have", "your", "about", "into", "when", "what", "will", "would", "there", "their", "they", "them", "then", "than", "and", "the", "for"]);
const title = firstHeading(source) || args.title || "Source Content";
const summary = summarize(source);
const keywords = extractKeywords(source);
const batchId = `kelly-content-${isoStamp()}`;

const items = channels.map((channel, index) => makeItem({
  channel,
  index,
  batchId,
  title,
  source,
  summary,
  keywords,
  audience: args.audience || "the intended audience",
  cta: args.cta || "Save this and revisit it when you plan your next step."
}));

const metrics = countStatuses(items);
const batch = {
  batch_id: batchId,
  generated_at: new Date().toISOString(),
  source: "kelly-content",
  mode: "app-in-skill",
  source_summary: summary,
  canonical_idea: canonicalIdea(summary),
  metrics,
  items
};

const provider = await createProvider();
const result = await provider.putBatch(batch);

console.log(
  `Generated ${items.length} drafts via "${provider.kind}" provider`
    + (provider.kind === "busabase" ? ` (${result.count} change requests created)` : ""),
);

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
  return line ? line.trim().replace(/^#+\s*/, "").slice(0, 90) : "";
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

function makeItem({ channel, index, batchId, title, summary, keywords, audience, cta }) {
  const id = `${String(index + 1).padStart(2, "0")}-${slugify(channel)}`;
  const base = {
    id,
    ref: `Review #${index + 1}`,
    channel,
    status: "to_approve",
    title: `${channelLabel(channel)}: ${title}`,
    summary,
    source_notes: [summary],
    risk: [],
    cta,
    export_filename: `${String(index + 1).padStart(2, "0")}-${slugify(channel)}.md`,
    decision: null,
    execution: { status: "pending" }
  };

  if (channel === "xiaohongshu") {
    return {
      ...base,
      format: "post",
      title_options: [
        `${title}：我会这样拆`,
        `别急着发长文，先把这件事讲清楚`,
        `适合收藏的一套内容思路`
      ],
      hook: `如果你正在把一篇长内容拆给 ${audience} 看，先抓住这一点：${canonicalIdea(summary)}`,
      body: `如果你正在把一篇长内容拆给 ${audience} 看，可以先从这条主线开始：\n\n${summary}\n\n可以这样用：\n1. 先讲清楚读者为什么现在需要它。\n2. 再给一个具体例子，不要只讲概念。\n3. 最后给一个很轻的下一步。\n\n${cta}`,
      hashtags: hashtags(["内容创作", "小红书运营", "写作", ...keywords]),
      media_brief: "5-7 page carousel: problem, key idea, 3 steps, example, CTA."
    };
  }

  if (channel === "official_blog" || channel === "official-blog" || channel === "blog") {
    return {
      ...base,
      channel: "official_blog",
      format: "article",
      title_options: [
        title,
        `${title}: a practical guide`,
        `How to think about ${title}`
      ],
      hook: canonicalIdea(summary),
      body: `# ${title}\n\n${canonicalIdea(summary)}\n\n## Overview\n\n${summary}\n\n## Why it matters\n\nThis is the canonical version for the official blog. It should preserve the full argument, source proof, examples, and internal links before social-channel adaptation.\n\n## Practical workflow\n\n1. State the reader problem clearly.\n2. Keep evidence and examples from the source.\n3. Add visuals, screenshots, or diagrams where they make the idea easier to trust.\n4. End with a clear next step.\n\n${cta}`,
      media_brief: "Hero image plus 2-3 inline diagrams or screenshots that make the source argument concrete."
    };
  }

  if (channel === "wechat") {
    return {
      ...base,
      format: "article",
      hook: `这篇文章想讨论的是：${canonicalIdea(summary)}`,
      body: `# ${title}\n\n这篇文章想讨论的是：${canonicalIdea(summary)}\n\n## 为什么重要\n\n${summary}\n\n## 可以怎么做\n\n- 保留原文里最有证据的部分。\n- 把抽象观点翻译成具体场景。\n- 让读者知道下一步能做什么。\n\n${cta}`
    };
  }

  if (channel === "newsletter") {
    return {
      ...base,
      format: "email",
      title_options: [`A useful note on ${title}`, `What I would keep from ${title}`],
      hook: `Hi,\n\nI kept coming back to one idea: ${canonicalIdea(summary)}`,
      body: `Subject: A useful note on ${title}\nPreview: ${canonicalIdea(summary)}\n\nHi,\n\nI kept coming back to one idea: ${canonicalIdea(summary)}\n\n${summary}\n\nA practical way to use this:\n\n- Keep the original argument intact.\n- Pull out one concrete example.\n- Give readers one next step.\n\n${cta}`
    };
  }

  if (channel === "linkedin") {
    return {
      ...base,
      format: "post",
      hook: canonicalIdea(summary),
      body: `${canonicalIdea(summary)}\n\nThe useful part is not just the idea itself. It is what it changes for ${audience}.\n\n${summary}\n\nA few ways to apply it:\n\n1. Start with the problem in the reader's words.\n2. Use proof from the original piece.\n3. End with one clear next step.\n\n${cta}`
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
        `5/ Next step: ${cta}`
      ].join("\n\n")
    };
  }

  return {
    ...base,
    format: "post",
    hook: canonicalIdea(summary),
    body: `${canonicalIdea(summary)}\n\n${summary}\n\n${cta}`
  };
}

function channelLabel(channel) {
  const labels = {
    official_blog: "Official Blog",
    xiaohongshu: "Xiaohongshu",
    wechat: "WeChat",
    newsletter: "Newsletter",
    linkedin: "LinkedIn",
    x: "X"
  };
  return labels[channel] || channel;
}

function hashtags(items) {
  return [...new Set(items.map((item) => `#${String(item).replace(/^#/, "").replace(/\s+/g, "")}`))]
    .filter((item) => item.length > 1)
    .slice(0, 10);
}

function countStatuses(items) {
  const metrics = { needs_review: 0, to_approve: 0, approved: 0, done: 0, blocked: 0 };
  for (const item of items) metrics[item.status] += 1;
  return metrics;
}
