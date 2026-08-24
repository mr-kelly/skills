#!/usr/bin/env node
// Structural sanity check for a Kelly CRM snapshot object (the shape
// content/kelly-crm-app/app/js/crm-model.js#buildSnapshot() returns). Useful before writing
// drafted records to Busabase. Usage:
//   node scripts/validate_snapshot.mjs path/to/snapshot.json
import fs from "node:fs/promises";

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);

function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const requireString = (obj, key, path) => {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
};
const requireNumber = (obj, key, path) => {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
};

export function validateSnapshot(snapshot) {
  if (!isObject(snapshot)) fail("root must be an object");
  requireString(snapshot, "schema_version", "root");
  requireString(snapshot, "generated_at", "root");
  requireString(snapshot, "source", "root");
  requireString(snapshot, "base_currency", "root");
  if (!Array.isArray(snapshot.pipeline_stages) || !snapshot.pipeline_stages.length) {
    fail("root.pipeline_stages must be a non-empty array");
  }
  if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
  for (const key of [
    "contact_count",
    "company_count",
    "deal_count",
    "open_deal_count",
    "pipeline_value",
    "weighted_pipeline_value",
    "followups_needs_review",
    "followups_due",
  ]) {
    requireNumber(snapshot.metrics, key, "root.metrics");
  }
  for (const key of ["companies", "contacts", "deals", "interactions", "followups", "warnings"]) {
    if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
  }

  const companyIds = new Set();
  for (const [index, company] of snapshot.companies.entries()) {
    const path = `root.companies[${index}]`;
    if (!isObject(company)) fail(`${path} must be an object`);
    for (const key of ["company_id", "name"]) requireString(company, key, path);
    if (companyIds.has(company.company_id)) fail(`${path}.company_id duplicates ${company.company_id}`);
    companyIds.add(company.company_id);
  }

  const contactIds = new Set();
  for (const [index, contact] of snapshot.contacts.entries()) {
    const path = `root.contacts[${index}]`;
    if (!isObject(contact)) fail(`${path} must be an object`);
    for (const key of ["contact_id", "name", "relationship"]) requireString(contact, key, path);
    if (!Array.isArray(contact.tags)) fail(`${path}.tags must be an array`);
    if (contactIds.has(contact.contact_id)) fail(`${path}.contact_id duplicates ${contact.contact_id}`);
    contactIds.add(contact.contact_id);
    if (contact.company_id && !companyIds.has(contact.company_id)) {
      fail(`${path}.company_id does not match a company: ${contact.company_id}`);
    }
  }

  const dealIds = new Set();
  for (const [index, deal] of snapshot.deals.entries()) {
    const path = `root.deals[${index}]`;
    if (!isObject(deal)) fail(`${path} must be an object`);
    for (const key of ["deal_id", "name", "company_id", "primary_contact_id", "stage", "currency", "status"]) {
      requireString(deal, key, path);
    }
    for (const key of ["amount", "probability"]) requireNumber(deal, key, path);
    if (!snapshot.pipeline_stages.includes(deal.stage)) fail(`${path}.stage is not in pipeline_stages: ${deal.stage}`);
    if (!["open", "won", "lost"].includes(deal.status)) fail(`${path}.status must be open|won|lost`);
    if (dealIds.has(deal.deal_id)) fail(`${path}.deal_id duplicates ${deal.deal_id}`);
    dealIds.add(deal.deal_id);
    if (!companyIds.has(deal.company_id)) fail(`${path}.company_id does not match a company: ${deal.company_id}`);
    if (!contactIds.has(deal.primary_contact_id)) {
      fail(`${path}.primary_contact_id does not match a contact: ${deal.primary_contact_id}`);
    }
  }

  const interactionIds = new Set();
  for (const [index, interaction] of snapshot.interactions.entries()) {
    const path = `root.interactions[${index}]`;
    if (!isObject(interaction)) fail(`${path} must be an object`);
    for (const key of ["interaction_id", "contact_id", "type", "occurred_at", "summary"]) {
      requireString(interaction, key, path);
    }
    if (interactionIds.has(interaction.interaction_id)) {
      fail(`${path}.interaction_id duplicates ${interaction.interaction_id}`);
    }
    interactionIds.add(interaction.interaction_id);
    if (!contactIds.has(interaction.contact_id)) {
      fail(`${path}.contact_id does not match a contact: ${interaction.contact_id}`);
    }
    if (interaction.deal_id && !dealIds.has(interaction.deal_id)) {
      fail(`${path}.deal_id does not match a deal: ${interaction.deal_id}`);
    }
  }

  const followupIds = new Set();
  const followupRefs = new Set();
  for (const [index, followup] of snapshot.followups.entries()) {
    const path = `root.followups[${index}]`;
    if (!isObject(followup)) fail(`${path} must be an object`);
    for (const key of ["followup_id", "contact_id", "channel_type", "reason", "status", "suggested_reply"]) {
      requireString(followup, key, path);
    }
    requireNumber(followup, "ref", path);
    if (!Array.isArray(followup.risk)) fail(`${path}.risk must be an array`);
    if (!STATUSES.has(followup.status)) fail(`${path}.status is not a workflow state: ${followup.status}`);
    if (followupIds.has(followup.followup_id)) fail(`${path}.followup_id duplicates ${followup.followup_id}`);
    followupIds.add(followup.followup_id);
    if (followupRefs.has(followup.ref)) fail(`${path}.ref duplicates #${followup.ref}`);
    followupRefs.add(followup.ref);
    if (!contactIds.has(followup.contact_id)) {
      fail(`${path}.contact_id does not match a contact: ${followup.contact_id}`);
    }
    if (followup.deal_id && !dealIds.has(followup.deal_id)) {
      fail(`${path}.deal_id does not match a deal: ${followup.deal_id}`);
    }
  }

  return true;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/validate_snapshot.mjs path/to/snapshot.json");
    process.exitCode = 1;
    return;
  }
  const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
  validateSnapshot(snapshot);
  console.log(`OK: ${file}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
