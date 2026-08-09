import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { k8sCostModel } from "./js/k8s-cost-model.js";

console.log("Kubernetes Pod Cost & Right-Sizing Desk initialized with domain model", appConfig.slug);
