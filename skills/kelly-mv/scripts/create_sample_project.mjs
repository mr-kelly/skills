#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const STARTER = path.join(SKILL_DIR, "assets", "starter-project.json");
const PROJECT = path.join(SKILL_DIR, "app", ".data", "project.json");

const project = JSON.parse(await fs.readFile(STARTER, "utf8"));
project.updated_at = new Date().toISOString();
await fs.mkdir(path.dirname(PROJECT), { recursive: true });
await fs.writeFile(PROJECT, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`Created sample project: ${PROJECT}`);
