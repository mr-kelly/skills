import {
  type Lock,
  appendJsonLog,
  configSearchPaths,
  envSearchPaths,
  loadDotenvFiles,
  newId,
  readJson,
  readLock,
  writeJson,
} from "../common.ts";
import { HANDOFF_LOG_PATH, LEADS_PATH, ONBOARDING_PATH } from "../paths.ts";
import { suggestNextAction } from "../scoring.ts";
import type { Config, ConfigResult, Lead, Onboarding, Stage } from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

const SKILL_NAME = "kelly-lead-funnel";
const ENV_PREFIX = "KELLY_LEAD_FUNNEL";

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async getLeads(): Promise<Lead[]> {
    return (await readJson<Lead[]>(LEADS_PATH, [])) || [];
  }

  async getLead(id: string): Promise<Lead | undefined> {
    const leads = await this.getLeads();
    return leads.find((lead) => lead.id === id);
  }

  async saveLeads(leads: Lead[]): Promise<void> {
    await writeJson(LEADS_PATH, leads);
  }

  async moveStage(id: string, stage: Stage, reason?: string): Promise<Lead | undefined> {
    const leads = await this.getLeads();
    const lead = leads.find((item) => item.id === id);
    if (!lead) return undefined;
    const now = new Date().toISOString();
    const from = lead.stage;
    lead.stage = stage;
    lead.updated_at = now;
    lead.stage_history = [...(lead.stage_history || []), { from, to: stage, at: now, reason }];
    if (stage === "rejected" && reason) lead.rejection_reason = reason;
    if (stage !== "rejected") lead.rejection_reason = undefined;
    lead.suggested_action = suggestNextAction(lead.score, stage);
    await this.saveLeads(leads);
    await appendJsonLog(HANDOFF_LOG_PATH, {
      id: newId("evt"),
      type: "stage_change",
      lead_id: id,
      from,
      to: stage,
      reason: reason || null,
      at: now,
    });
    return lead;
  }

  async addNote(id: string, text: string, author = "operator"): Promise<Lead | undefined> {
    const leads = await this.getLeads();
    const lead = leads.find((item) => item.id === id);
    if (!lead) return undefined;
    const now = new Date().toISOString();
    const note = { id: newId("note"), text, author, created_at: now };
    lead.notes = [...(lead.notes || []), note];
    lead.updated_at = now;
    await this.saveLeads(leads);
    await appendJsonLog(HANDOFF_LOG_PATH, { id: newId("evt"), type: "note", lead_id: id, text, author, at: now });
    return lead;
  }

  async getOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async getConfig(): Promise<ConfigResult> {
    await loadDotenvFiles(envSearchPaths(ENV_PREFIX, SKILL_NAME));
    for (const file of configSearchPaths(ENV_PREFIX, SKILL_NAME)) {
      const config = await readJson<Config>(file, null);
      if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
    }
    return { config: {}, path: "", is_example: false };
  }

  async getLock(): Promise<Lock | null> {
    return readLock();
  }
}
