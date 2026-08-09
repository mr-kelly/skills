import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { featureRolloutModel } from "./js/feature-rollout-model.js";

console.log("Feature Flag Canary & Guardrail Control Desk initialized with domain model", appConfig.slug);
