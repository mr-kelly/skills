import { createBusabaseClient } from "./js/busabase-client.js";
import { appConfig } from "./js/config.js";
import { llmFineTuneModel } from "./js/llm-fine-tune-model.js";

console.log("LLM Fine-Tuning & Model Evaluation Desk initialized with domain model", appConfig.slug);
