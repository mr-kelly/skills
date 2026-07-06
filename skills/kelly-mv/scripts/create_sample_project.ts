#!/usr/bin/env node
// Seed the workspace with the starter MV project via the data provider, so the
// same command works against local files or a remote backend.
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";
import { starterProjectPath } from "../lib/paths.ts";
import type { Project } from "../lib/types.ts";

const provider = await createProvider();
const starter = JSON.parse(await fs.readFile(starterProjectPath, "utf8")) as Project;
const saved = await provider.saveProject(starter);
console.log(`Created sample project via ${provider.name} provider: ${saved.project_id}`);
