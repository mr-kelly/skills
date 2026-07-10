#!/usr/bin/env node
// Writes a deterministic mock pipeline (15-25 merchant/business leads across
// the funnel stages) to app/.data/leads.json for local development, demos,
// and screenshots. Safe to re-run; overwrites the file.

import { ensureDirs, writeJson } from "../lib/common.ts";
import { generateMockLeads } from "../lib/mock-leads.ts";
import { LEADS_PATH } from "../lib/paths.ts";

await ensureDirs();
const leads = generateMockLeads();
await writeJson(LEADS_PATH, leads);
console.log(`Wrote ${leads.length} leads to ${LEADS_PATH}`);
