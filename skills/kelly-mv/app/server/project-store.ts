// Project store — now a thin adapter over the data provider.
//
// All fs access moved into lib/data-provider/local-file-provider.ts; this module
// keeps its original export surface so the services and hono routes call the same
// functions, but they now go through provider.* (local files or Busabase).
// normalizeProject/upsertById stay as pure re-exports from lib/common.ts.

import { normalizeProject, upsertById } from "../../lib/common.ts";
import type { Project } from "../../lib/types.ts";
import { provider } from "./provider.ts";

export { normalizeProject, upsertById };

export async function ensureProject(): Promise<void> {
  await provider.ensureProject();
}

export async function loadProject(): Promise<Project> {
  return provider.loadProject();
}

export async function saveProject(project: Project): Promise<Project> {
  return provider.saveProject(project);
}
