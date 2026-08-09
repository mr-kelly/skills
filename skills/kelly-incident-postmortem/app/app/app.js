import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { incidentPostmortemModel } from "./js/incident-postmortem-model.js";

console.log("Blameless Incident Postmortem & Action Desk initialized with domain model", appConfig.slug);
