import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { terraformAuditModel } from "./js/terraform-audit-model.js";

console.log("Terraform Infrastructure Drift & Security Desk initialized with domain model", appConfig.slug);
