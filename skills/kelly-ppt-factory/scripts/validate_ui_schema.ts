#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/ppt_factory_snapshot.json", import.meta.url).pathname;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${path}.${key} must be a number`);
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: Record<string, unknown>;
try {
  const parsed = JSON.parse(raw);
  if (!isObject(parsed)) fail("root must be an object");
  snapshot = parsed;
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

for (const key of ["schema_version", "generated_at", "source"]) requireString(snapshot, key, "root");
for (const key of [
  "brand_profiles",
  "style_systems",
  "projects",
  "decks",
  "slide_cards",
  "qa_checks",
  "exports",
  "review_items",
  "activity_log",
  "warnings",
]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "project_count",
  "deck_count",
  "slide_count",
  "slides_needs_review",
  "slides_approved",
  "decks_generated",
  "qa_warnings",
  "avg_style_score",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}

const projectIds = new Set<string>();
(snapshot.projects as Record<string, unknown>[]).forEach((project, index) => {
  const path = `root.projects[${index}]`;
  if (!isObject(project)) fail(`${path} must be an object`);
  for (const key of ["project_id", "client_id", "title", "course", "stage", "owner", "status"])
    requireString(project, key, path);
  requireNumber(project, "ref", path);
  projectIds.add(String(project.project_id));
});

const deckIds = new Set<string>();
(snapshot.decks as Record<string, unknown>[]).forEach((deck, index) => {
  const path = `root.decks[${index}]`;
  if (!isObject(deck)) fail(`${path} must be an object`);
  for (const key of ["deck_id", "project_id", "title", "theme", "level", "audience", "status"])
    requireString(deck, key, path);
  for (const key of ["ref", "target_slide_count", "approved_slide_count", "generated_slide_count", "style_score"])
    requireNumber(deck, key, path);
  if (!projectIds.has(String(deck.project_id))) fail(`${path}.project_id does not match a project`);
  deckIds.add(String(deck.deck_id));
});

const slideIds = new Set<string>();
(snapshot.slide_cards as Record<string, unknown>[]).forEach((slide, index) => {
  const path = `root.slide_cards[${index}]`;
  if (!isObject(slide)) fail(`${path} must be an object`);
  for (const key of ["slide_id", "deck_id", "project_id", "status", "slide_type", "layout", "title", "objective"])
    requireString(slide, key, path);
  requireNumber(slide, "ref", path);
  if (!deckIds.has(String(slide.deck_id))) fail(`${path}.deck_id does not match a deck`);
  if (!isObject(slide.content)) fail(`${path}.content must be an object`);
  if (!Array.isArray(slide.style_checks)) fail(`${path}.style_checks must be an array`);
  if (!Array.isArray(slide.qa_flags)) fail(`${path}.qa_flags must be an array`);
  slideIds.add(String(slide.slide_id));
});

(snapshot.review_items as Record<string, unknown>[]).forEach((item, index) => {
  const path = `root.review_items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["review_id", "target_type", "target_id", "status", "summary", "draft_note"])
    requireString(item, key, path);
  requireNumber(item, "ref", path);
  if (!Array.isArray(item.suggestions)) fail(`${path}.suggestions must be an array`);
  if (item.target_type === "slide" && !slideIds.has(String(item.target_id))) {
    fail(`${path}.target_id does not match a slide`);
  }
  if (item.target_type === "deck" && !deckIds.has(String(item.target_id))) {
    fail(`${path}.target_id does not match a deck`);
  }
});

console.log(`OK: ${target}`);
