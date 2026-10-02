#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "training", "fixture");
const expectedKeys = ["app_type", "category", "name", "risk", "surface"];
const categories = new Set([
  "finance",
  "invest",
  "rbf",
  "legal",
  "sales-crm",
  "comms",
  "marketing",
  "growth",
  "ecommerce",
  "industry-intel",
  "production",
  "education",
  "platform",
]);
const risks = new Set(["sandbox", "read-only", "local-write", "gated-write"]);
const appTypes = new Set([
  "research-desk",
  "review-queue",
  "planner",
  "action-console",
  "retrospective-dashboard",
  "operating-dashboard",
  "control-panel",
  "collaboration-workspace",
]);

const prompts = new Set();
const digest = createHash("sha256");
const counts = {};
for (const split of ["train", "valid", "test"]) {
  const file = path.join(root, `${split}.jsonl`);
  const source = await readFile(file, "utf8");
  digest.update(split).update(source);
  const rows = source
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (!rows.length) throw new Error(`${split}.jsonl is empty`);
  counts[split] = rows.length;
  for (const [index, row] of rows.entries()) {
    const roles = row.messages?.map((message) => message.role).join(",");
    if (roles !== "system,user,assistant") throw new Error(`${split}[${index}] has invalid roles`);
    const prompt = row.messages[1].content.trim();
    if (!prompt || prompts.has(prompt)) throw new Error(`${split}[${index}] has duplicate or empty prompt`);
    prompts.add(prompt);
    const value = JSON.parse(row.messages[2].content);
    if (Object.keys(value).sort().join(",") !== expectedKeys.join(",")) {
      throw new Error(`${split}[${index}] has invalid output keys`);
    }
    if (!categories.has(value.category) || !risks.has(value.risk) || !appTypes.has(value.app_type)) {
      throw new Error(`${split}[${index}] has invalid taxonomy value`);
    }
    if (!Array.isArray(value.surface) || value.surface.some((item) => typeof item !== "string")) {
      throw new Error(`${split}[${index}] has invalid surface`);
    }
  }
}

console.log(`MLX smoke fixture OK (${counts.train}/${counts.valid}/${counts.test}, sha256:${digest.digest("hex")})`);
