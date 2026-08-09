import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { dbMigrationModel } from "./js/db-migration-model.js";

console.log("Zero-Downtime DB Schema Migration Desk initialized with domain model", appConfig.slug);
