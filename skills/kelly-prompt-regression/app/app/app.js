import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { promptRegressionModel } from "./js/prompt-regression-model.js";

console.log("AI Prompt Regression & Cost Optimizer initialized with domain model", appConfig.slug);
