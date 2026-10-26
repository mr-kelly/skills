import { readFile } from "node:fs/promises";
import { appConfig } from "../content/kelly-security-app/app/js/config.js";

// Current installation materializes child prompts but omits the root Folder
// and manual. Complete that declared metadata without replacing user additions.
export const ensureScenarioPrompts = async (client, resources) => {
  if (!resources.folder) throw new Error("APP_FOLDER_MISSING");
  const folder = await client.nodes.get({ nodeId: resources.folder.nodeId });
  const manual = folder.children.find(
    (node) =>
      node.type === "skill" && node.metadata.appId === appConfig.appId && node.metadata.resourceKey === appConfig.appId,
  );
  if (!manual) throw new Error("APP_MANUAL_MISSING: install the complete package before operating this workspace");
  const folderInfo = JSON.parse(await readFile(new URL("../content/_folder.json", import.meta.url), "utf8"));
  const manualPrompts = JSON.parse(
    await readFile(new URL("../references/skill-prompts.json", import.meta.url), "utf8"),
  );
  for (const [nodeId, declared] of [
    [resources.folder.nodeId, folderInfo.agentPrompts],
    [manual.id, manualPrompts],
  ]) {
    const current = (await client.nodes.getAgentPrompts({ nodeId })).agentPrompts || [];
    const existing = new Set(current.map((prompt) => prompt.key));
    const missing = declared.filter((prompt) => !existing.has(prompt.key));
    if (missing.length) await client.nodes.updateAgentPrompts({ nodeId, agentPrompts: [...current, ...missing] });
    const saved = (await client.nodes.getAgentPrompts({ nodeId })).agentPrompts || [];
    if (declared.some((prompt) => !saved.some((value) => value.key === prompt.key)))
      throw new Error("SCENARIO_PROMPTS_READBACK_INCOMPLETE");
  }
};
