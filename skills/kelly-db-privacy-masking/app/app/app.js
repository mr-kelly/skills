import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { dbMaskingModel } from "./js/db-masking-model.js";

console.log("Database Sensitive Data Masking Desk initialized with domain model", appConfig.slug);
