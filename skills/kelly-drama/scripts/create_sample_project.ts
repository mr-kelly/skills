#!/usr/bin/env node
// Seed the project document from the starter into the selected data provider
// (local .data/project.json by default, or a Busabase base when
// KELLY_DRAMA_DATA_PROVIDER=busabase). Overwrites any existing project.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../lib/data-provider/index.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const STARTER = path.join(SKILL_DIR, "assets", "starter-project.json");

const starter = JSON.parse(await fs.readFile(STARTER, "utf8"));
starter.updated_at = new Date().toISOString();

const provider = await createProvider();
const saved = await provider.saveProject(starter);
console.log(`Created sample project via ${provider.kind} provider (project_id: ${saved.project_id}).`);
