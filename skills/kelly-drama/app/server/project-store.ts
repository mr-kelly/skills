// Project-document store facade. The fs logic now lives in the data-provider
// (lib/data-provider); this module keeps the historical function API the
// services and scripts call, delegating to the selected provider.

import { normalizeProject as providerNormalize } from "../../lib/data-provider/local-file-provider.ts";
import { getProvider } from "./provider.ts";

export async function ensureProject() {
  await (await getProvider()).ensureProject();
}

export async function loadProject() {
  return (await getProvider()).loadProject();
}

export async function saveProject(project) {
  return (await getProvider()).saveProject(project);
}

// Pure helper — provider-agnostic normalization, re-exported for callers/scripts.
export const normalizeProject = providerNormalize;

export function upsertById(items, item) {
  const id = String(item.id || "");
  if (!id) throw new Error("Item id is required");
  const next = [...items];
  const index = next.findIndex((candidate) => String(candidate.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}
