#!/usr/bin/env node
import {
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  REPORTS_DIR,
  clearAgentLock,
  loadConfig,
  loadDotenv,
  readJson,
  utcNow,
  writeAgentLock,
  writeJson
} from "../lib/common.mjs";

function parseArgs(argv) {
  const args = { dryRun: false, allowRiskApproved: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-risk-approved") args.allowRiskApproved = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/execute_ui_decisions.mjs [--dry-run] [--allow-risk-approved]

Validate explicit App-in-Skill UI decisions from current_batch.json and decisions.json.

This zero-dependency build does not include IMAP/SMTP execution. Real mailbox
actions are blocked and reported unless an external connector handles them.`);
}

function configuredKeywords(config, riskName) {
  return config.risk_policy?.review_keywords?.[riskName] || [];
}

function hasConfiguredRisk(config, riskName, text) {
  return configuredKeywords(config, riskName).some((keyword) =>
    keyword && text.toLowerCase().includes(String(keyword).toLowerCase())
  );
}

function configuredBlockActions(config) {
  return new Set(config.risk_policy?.block_by_default || ["send_reply"]);
}

function safetyBlockReason(item, action, config) {
  if (action === "send_reply") {
    if (!String(item.draft || "").trim()) return "send_reply requires a non-empty approved draft";
    return null;
  }
  if (!["archive", "mark_read"].includes(action)) return null;
  if (!configuredBlockActions(config).has(action)) return null;

  const text = [item.from, item.subject, item.summary, String(item.body || "").slice(0, 1200)].join("\n").toLowerCase();
  const category = item.category || "";
  const risks = new Set(item.risk || []);

  if (category === "money" || risks.has("money") || hasConfiguredRisk(config, "money", text)) return "configured money cleanup block matched";
  if (category === "course_feedback" || hasConfiguredRisk(config, "course_feedback", text)) return "configured course cleanup block matched";
  if (risks.has("security") || category === "data_privacy_security" || hasConfiguredRisk(config, "security", text)) return "configured security cleanup block matched";
  if (item.attachments?.length || hasConfiguredRisk(config, "attachments", text)) return "configured attachment cleanup block matched";
  return null;
}

function mailboxMap(config) {
  return Object.fromEntries((config.mailboxes || []).map((mailbox) => [mailbox.mailbox_id, mailbox]));
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function riskTarget(routing, item) {
  const byRisk = asObject(routing.by_risk);
  for (const risk of item.risk || []) {
    const target = firstString(byRisk[risk]);
    if (target) return target;
  }
  return "";
}

function archiveTargetFolder(config, mailbox, item) {
  const globalRouting = asObject(config.archive_routing);
  const mailboxRouting = asObject(mailbox.archive_routing);
  const byCategory = {
    ...asObject(globalRouting.by_category),
    ...asObject(mailboxRouting.by_category)
  };
  return firstString(
    item.target_folder,
    item.archive_folder,
    item.execution?.target_folder,
    item.execution_override?.target_folder,
    byCategory[item.category],
    riskTarget(mailboxRouting, item),
    riskTarget(globalRouting, item),
    mailboxRouting.default_folder,
    mailbox.archive_folder,
    globalRouting.default_folder
  );
}

function identityMap(config) {
  return Object.fromEntries((config.identities || []).map((identity) => [identity.identity_id, identity]));
}

function parseAddresses(value) {
  const results = [];
  const pattern = /(?:"?([^"<,]*)"?\s*)?<([^<>@\s]+@[^<>\s]+)>|([^<>,\s]+@[^<>,\s]+)/g;
  let match;
  while ((match = pattern.exec(value || ""))) {
    results.push({ name: (match[1] || "").trim(), address: (match[2] || match[3] || "").trim() });
  }
  return results;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveIdentity(item, config) {
  const mailboxes = mailboxMap(config);
  const identities = identityMap(config);
  const recipients = new Set(parseAddresses(item.to || "").map((address) => normalizeEmail(address.address)));

  for (const identity of Object.values(identities)) {
    const sendAs = normalizeEmail(identity.send_as_email);
    const ruleAddresses = new Set((identity.use_when?.recipient_addresses || []).map(normalizeEmail));
    if (recipients.has(sendAs) || [...ruleAddresses].some((address) => recipients.has(address))) {
      const mailbox = mailboxes[identity.mailbox_id];
      if (mailbox) return { identity, mailbox };
    }
  }

  const mailbox = mailboxes[item.account];
  if (!mailbox) throw new Error(`unknown account ${item.account}`);
  const identityId = mailbox.send_identities?.[0];
  if (identityId && identities[identityId]) return { identity: identities[identityId], mailbox };
  throw new Error(`no send identity configured for ${item.account}`);
}

function executionPlan(entry) {
  const base = {
    ...entry,
    mark_read: ["archive", "mark_read", "send_reply"].includes(entry.action)
  };
  if (entry.action === "archive") {
    return {
      ...base,
      mailbox_operation: "move_to_folder",
      target_folder: entry.target_folder
    };
  }
  if (entry.action === "mark_read") {
    return {
      ...base,
      mailbox_operation: "mark_read"
    };
  }
  if (entry.action === "send_reply") {
    return {
      ...base,
      mailbox_operation: "send_reply"
    };
  }
  return base;
}

function connectorBlock(entry) {
  const plan = executionPlan(entry);
  return {
    ...plan,
    status: "blocked",
    skip_reason:
      "IMAP/SMTP execution connector is not bundled in the zero-dependency Kelly Email skill. Use an external connector to apply approved mailbox actions exactly as planned."
  };
}

function compactResult(result) {
  const item = result.item || {};
  return {
    uid: item.uid,
    account: item.account,
    from: item.from,
    subject: item.subject,
    category: item.category,
    action: result.action,
    status: result.status,
    mailbox_operation: result.mailbox_operation,
    target_folder: result.target_folder,
    mark_read: result.mark_read,
    identity: result.identity,
    send_as: result.send_as,
    skip_reason: result.skip_reason,
    error: result.error
  };
}

async function writeReport(batch, results, blocked, dryRun, allowRiskApproved) {
  const summary = {};
  for (const result of results) summary[result.status] = (summary[result.status] || 0) + 1;
  if (blocked.length) summary.blocked = blocked.length;
  const report = {
    batch_id: batch.batch_id,
    executed_at: utcNow(),
    dry_run: dryRun,
    allow_risk_approved: allowRiskApproved,
    connector: {
      status: "not_bundled",
      message: "Zero-dependency Kelly Email did not mutate mailboxes or send email."
    },
    summary,
    results: results.map(compactResult),
    blocked: blocked.map(compactResult)
  };
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const path = `${REPORTS_DIR}/${batch.batch_id}-${stamp}.json`;
  await writeJson(path, report);
  return path;
}

async function updateBatchAfterExecution(batch, results, blocked) {
  const byId = new Map((batch.items || []).map((item) => [String(item.id), item]));
  for (const result of results.filter((row) => row.status === "dry_run")) {
    const item = byId.get(String(result.item?.id));
    if (!item) continue;
    item.execution = {
      status: "dry_run",
      action: result.action,
      mailbox_operation: result.mailbox_operation,
      target_folder: result.target_folder,
      mark_read: result.mark_read,
      checked_at: utcNow()
    };
  }
  for (const result of blocked) {
    const item = byId.get(String(result.item?.id));
    if (!item) continue;
    item.execution = {
      status: "blocked",
      action: result.action,
      mailbox_operation: result.mailbox_operation,
      target_folder: result.target_folder,
      mark_read: result.mark_read,
      reason: result.skip_reason,
      checked_at: utcNow()
    };
    item.status = "needs_review";
    item.proposed_action = "review";
  }
  await writeJson(CURRENT_BATCH_PATH, batch);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  await loadDotenv();
  const config = await loadConfig();
  const mailboxes = mailboxMap(config);
  const batch = await readJson(CURRENT_BATCH_PATH);
  const decisionsPayload = await readJson(DECISIONS_PATH);
  if (decisionsPayload.batch_id !== batch.batch_id) throw new Error("decisions.json batch_id does not match current_batch.json");

  const items = new Map((batch.items || []).map((item) => [String(item.id), item]));
  const results = [];
  const blocked = [];

  for (const decisionRow of decisionsPayload.decisions || []) {
    const action = decisionRow.decision?.action;
    if (!["archive", "mark_read", "send_reply"].includes(action)) continue;
    const item = items.get(String(decisionRow.id));
    if (!item) {
      blocked.push({ item: { uid: decisionRow.uid, subject: decisionRow.subject }, action, status: "blocked", skip_reason: "item missing from batch" });
      continue;
    }
    if (decisionRow.edited_draft !== undefined) item.draft = decisionRow.edited_draft;
    if (decisionRow.decision?.comment !== undefined) item.user_comment = decisionRow.decision.comment;
    if (item.status === "executed" || item.execution?.status === "executed") continue;

    const reason = safetyBlockReason(item, action, config);
    if (reason && !(args.allowRiskApproved && ["archive", "mark_read"].includes(action))) {
      blocked.push({ item, action, status: "blocked", skip_reason: reason });
      continue;
    }
    const mailbox = mailboxes[item.account];
    if (!mailbox) {
      blocked.push({ item, action, status: "blocked", skip_reason: `unknown account ${item.account}` });
      continue;
    }

    let entry = { item, action };
    if (action === "archive") {
      const targetFolder = archiveTargetFolder(config, mailbox, item);
      if (!targetFolder) {
        blocked.push({
          item,
          action,
          status: "blocked",
          mailbox_operation: "move_to_folder",
          mark_read: true,
          skip_reason: `archive requires a target folder for account ${item.account}; configure archive_routing.default_folder or archive_routing.by_category.${item.category || "other"}`
        });
        continue;
      }
      entry = { ...entry, target_folder: targetFolder };
    }
    if (action === "send_reply") {
      try {
        const { identity } = resolveIdentity(item, config);
        entry = { ...entry, identity: identity.identity_id, send_as: identity.send_as_email };
      } catch (error) {
        blocked.push({ ...entry, status: "blocked", skip_reason: error.message });
        continue;
      }
    }
    if (args.dryRun) results.push({ ...executionPlan(entry), status: "dry_run" });
    else blocked.push(connectorBlock(entry));
  }

  if (!args.dryRun) await updateBatchAfterExecution(batch, results, blocked);
  const reportPath = await writeReport(batch, results, blocked, args.dryRun, args.allowRiskApproved);
  console.log(JSON.stringify({
    batch_id: batch.batch_id,
    dry_run: args.dryRun,
    allow_risk_approved: args.allowRiskApproved,
    executed: 0,
    dry_run_count: results.filter((result) => result.status === "dry_run").length,
    errors: results.filter((result) => result.status === "error").length,
    blocked: blocked.length,
    connector_status: "not_bundled",
    report_path: reportPath
  }, null, 2));
  return 0;
}

await writeAgentLock("/kelly-email is checking approved decisions.");
try {
  process.exitCode = await main();
} finally {
  await clearAgentLock();
}
