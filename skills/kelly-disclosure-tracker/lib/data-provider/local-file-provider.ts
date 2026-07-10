// Default provider: reads/writes the local handoff files under app/.data/. This
// is the only provider implemented today; the interface stays stable so
// `postgres`, `aitable`, `notion`, or `busabase` providers can be added later
// without changing the app server or scripts.

import {
  applyDecisions,
  readBatch,
  readConfig,
  readDecisions,
  recordDecision as recordDecisionInStore,
} from "../../app/server/store.ts";
import type { Batch, Config, ConfigResult, Decision, DecisionsFile } from "../../app/server/types.ts";
import type { DataProvider } from "./provider-interface.ts";

export class LocalFileProvider implements DataProvider {
  name = "local";

  async readBatch(): Promise<Batch> {
    const batch = await readBatch();
    const decisions = await readDecisions();
    return applyDecisions(batch, decisions);
  }

  async readDecisions(): Promise<DecisionsFile> {
    return readDecisions();
  }

  async recordDecision(itemId: string, decision: Decision): Promise<Batch> {
    return recordDecisionInStore(itemId, decision);
  }

  async readConfig(): Promise<ConfigResult> {
    return readConfig();
  }
}
