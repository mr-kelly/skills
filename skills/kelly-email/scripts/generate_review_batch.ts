#!/usr/bin/env node
import {
  APP_CACHE_DIR,
  ATTACHMENTS_DIR,
  CLASSIFICATION_PIPELINE_VERSION,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  SCAN_STATE_PATH,
  SKILL_DIR,
  clearAgentLock,
  ensureDirs,
  loadConfigWithMeta,
  loadDotenv,
  onboardingStatus,
  utcNow,
  writeAgentLock,
  writeJson,
} from "../lib/common.ts";

interface BatchArgs {
  reviewQuota: number;
  maxScanPerMailbox: number;
  dryRun: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): BatchArgs {
  const args: BatchArgs = { reviewQuota: 5, maxScanPerMailbox: 120, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--review-quota") args.reviewQuota = Number(argv[++i]);
    else if (arg === "--max-scan-per-mailbox") args.maxScanPerMailbox = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/generate_review_batch.mjs [--review-quota 5] [--max-scan-per-mailbox 120] [--dry-run]

Validate local Kelly Email config and prepare the local App-in-Skill batch files.

This zero-dependency build does not include an IMAP/MIME connector. It can run the
local UI and approval workflow, but mailbox scanning must be supplied by an
external connector or the agent before real email items can be reviewed.`);
}

function connectorNotice() {
  return {
    connector_required: true,
    connector: "imap",
    status: "not_bundled",
    message:
      "Kelly Email is now zero-dependency. IMAP/MIME scanning is not bundled; provide email items through an external connector or agent-generated batch before review.",
    native_node_scope: [
      "local app server",
      "config/env readiness checks",
      "batch/decision/report JSON files",
      "approval UI",
      "schema validation",
    ],
  };
}

async function writeEmptyConnectorBatch(args, configMeta) {
  await ensureDirs();
  const batchId = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 15)
    .replace(/^(\d{8})(\d{6}).*/, "kelly-email-$1-$2");
  const batch = {
    batch_id: batchId,
    generated_at: utcNow(),
    source: "kelly-email-skill",
    mode: "app-in-skill",
    connector: connectorNotice(),
    requested_scope: {
      review_quota: args.reviewQuota,
      max_scan_per_mailbox: args.maxScanPerMailbox,
      config_source: configMeta.source || "",
    },
    classification_pipeline: {
      version: CLASSIFICATION_PIPELINE_VERSION,
      stage: "connector_required",
      requires_agent_review: true,
      note: "Zero-dependency Kelly Email did not scan mail. Add email items from an external connector or agent step before approval/execution.",
    },
    items: [],
    metrics: {
      scanned: 0,
      prepared: 0,
      needs_review: 0,
      drafted: 0,
    },
  };
  await writeJson(CURRENT_BATCH_PATH, batch);
  await writeJson(DECISIONS_PATH, { batch_id: batch.batch_id, updated_at: utcNow(), decisions: [] });
  await writeJson(SCAN_STATE_PATH, {
    last_generated_batch_id: batch.batch_id,
    last_generated_at: batch.generated_at,
    connector: batch.connector,
    items: [],
  });
  return batch;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  await loadDotenv();
  const configMeta = await loadConfigWithMeta();
  const config = configMeta.config;
  const onboarding = onboardingStatus(config, configMeta);
  if (!onboarding.configured) {
    console.log(
      JSON.stringify(
        {
          onboarding_required: true,
          state: onboarding.state,
          message: onboarding.message,
          recommended_config: onboarding.recommended_config,
          recommended_env: onboarding.recommended_env,
          example_config: onboarding.example_config,
          legacy_source: onboarding.legacy_source,
          missing_env: onboarding.missing_env,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          ...connectorNotice(),
          skill_dir: SKILL_DIR,
          cache_dir: APP_CACHE_DIR,
          attachments_dir: ATTACHMENTS_DIR,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const batch = await writeEmptyConnectorBatch(args, configMeta);
  console.log(
    JSON.stringify(
      {
        batch_id: batch.batch_id,
        items: 0,
        prepared: 0,
        needs_review: 0,
        batch_path: CURRENT_BATCH_PATH,
        ...connectorNotice(),
      },
      null,
      2,
    ),
  );
  return 0;
}

await writeAgentLock("/kelly-email is preparing a local review batch.");
try {
  process.exitCode = await main();
} finally {
  await clearAgentLock();
}
