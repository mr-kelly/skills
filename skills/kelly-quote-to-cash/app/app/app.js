import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { quoteToCashModel } from "./js/quote-to-cash-model.js";

console.log("Quote-to-Cash (Q2C) Deal Approval Desk initialized with domain model", appConfig.slug);
