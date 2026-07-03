#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "crm_snapshot.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8").catch((error) => {
    fail(`cannot read ${file}: ${error.message}`);
  });
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${error.message}`);
  }
}

const snapshot = await readJson(snapshotPath);

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
requireString(snapshot, "base_currency", "root");
if (!Array.isArray(snapshot.pipeline_stages) || !snapshot.pipeline_stages.length) fail("root.pipeline_stages must be a non-empty array");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of ["contact_count", "company_count", "deal_count", "open_deal_count", "pipeline_value", "weighted_pipeline_value", "followups_needs_review", "followups_due"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["companies", "contacts", "deals", "interactions", "followups", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const companyIds = new Set();
snapshot.companies.forEach((company, index) => {
  const path = `root.companies[${index}]`;
  if (!isObject(company)) fail(`${path} must be an object`);
  for (const key of ["company_id", "name"]) requireString(company, key, path);
  if (companyIds.has(company.company_id)) fail(`${path}.company_id duplicates ${company.company_id}`);
  companyIds.add(company.company_id);
});

const contactIds = new Set();
snapshot.contacts.forEach((contact, index) => {
  const path = `root.contacts[${index}]`;
  if (!isObject(contact)) fail(`${path} must be an object`);
  for (const key of ["contact_id", "name", "relationship"]) requireString(contact, key, path);
  if (!Array.isArray(contact.tags)) fail(`${path}.tags must be an array`);
  if (contactIds.has(contact.contact_id)) fail(`${path}.contact_id duplicates ${contact.contact_id}`);
  contactIds.add(contact.contact_id);
  if (contact.company_id && !companyIds.has(contact.company_id)) fail(`${path}.company_id does not match a company: ${contact.company_id}`);
});

const dealIds = new Set();
snapshot.deals.forEach((deal, index) => {
  const path = `root.deals[${index}]`;
  if (!isObject(deal)) fail(`${path} must be an object`);
  for (const key of ["deal_id", "name", "company_id", "primary_contact_id", "stage", "currency", "status"]) requireString(deal, key, path);
  for (const key of ["amount", "probability"]) requireNumber(deal, key, path);
  if (!snapshot.pipeline_stages.includes(deal.stage)) fail(`${path}.stage is not in pipeline_stages: ${deal.stage}`);
  if (!["open", "won", "lost"].includes(deal.status)) fail(`${path}.status must be open|won|lost`);
  if (dealIds.has(deal.deal_id)) fail(`${path}.deal_id duplicates ${deal.deal_id}`);
  dealIds.add(deal.deal_id);
  if (!companyIds.has(deal.company_id)) fail(`${path}.company_id does not match a company: ${deal.company_id}`);
  if (!contactIds.has(deal.primary_contact_id)) fail(`${path}.primary_contact_id does not match a contact: ${deal.primary_contact_id}`);
});

const interactionIds = new Set();
snapshot.interactions.forEach((interaction, index) => {
  const path = `root.interactions[${index}]`;
  if (!isObject(interaction)) fail(`${path} must be an object`);
  for (const key of ["interaction_id", "contact_id", "type", "occurred_at", "summary"]) requireString(interaction, key, path);
  if (interactionIds.has(interaction.interaction_id)) fail(`${path}.interaction_id duplicates ${interaction.interaction_id}`);
  interactionIds.add(interaction.interaction_id);
  if (!contactIds.has(interaction.contact_id)) fail(`${path}.contact_id does not match a contact: ${interaction.contact_id}`);
  if (interaction.deal_id && !dealIds.has(interaction.deal_id)) fail(`${path}.deal_id does not match a deal: ${interaction.deal_id}`);
});

const followupIds = new Set();
const followupRefs = new Set();
snapshot.followups.forEach((followup, index) => {
  const path = `root.followups[${index}]`;
  if (!isObject(followup)) fail(`${path} must be an object`);
  for (const key of ["followup_id", "contact_id", "channel_type", "reason", "status", "suggested_reply"]) requireString(followup, key, path);
  requireNumber(followup, "ref", path);
  if (!Array.isArray(followup.risk)) fail(`${path}.risk must be an array`);
  if (!STATUSES.has(followup.status)) fail(`${path}.status is not a workflow state: ${followup.status}`);
  if (followupIds.has(followup.followup_id)) fail(`${path}.followup_id duplicates ${followup.followup_id}`);
  followupIds.add(followup.followup_id);
  if (followupRefs.has(followup.ref)) fail(`${path}.ref duplicates #${followup.ref}`);
  followupRefs.add(followup.ref);
  if (!contactIds.has(followup.contact_id)) fail(`${path}.contact_id does not match a contact: ${followup.contact_id}`);
  if (followup.deal_id && !dealIds.has(followup.deal_id)) fail(`${path}.deal_id does not match a deal: ${followup.deal_id}`);
});

console.log(`OK: ${snapshotPath}`);

const decisionsExists = await fs.access(decisionsPath).then(() => true, () => false);
if (decisionsExists) {
  const decisions = await readJson(decisionsPath);
  if (!isObject(decisions)) fail("decisions root must be an object");
  if (!isObject(decisions.decisions)) fail("decisions.decisions must be an object");
  for (const [followupId, decision] of Object.entries(decisions.decisions)) {
    const path = `decisions.decisions[${followupId}]`;
    if (!isObject(decision)) fail(`${path} must be an object`);
    requireString(decision, "action", path);
    if (!ACTIONS.has(decision.action)) fail(`${path}.action is not a verdict: ${decision.action}`);
    requireString(decision, "decided_at", path);
    if (!followupIds.has(followupId)) {
      console.warn(`Warning: ${path} does not match a followup in the snapshot`);
    }
  }
  console.log(`OK: ${decisionsPath}`);
}
