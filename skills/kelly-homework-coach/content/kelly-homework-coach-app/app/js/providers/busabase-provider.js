import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  assembleSnapshot,
  baseMistakeFields,
  basePaperFields,
  baseQuestionFields,
  baseReviewFields,
  buildConfigSummary,
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
  statusForAction,
} from "../homework-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// Business record writes always remain pending, including local previews.
// Resource provisioning retains its separate upstream setup workflow.
import { isStandaloneLocalRuntime } from "../runtime.js";

export { isStandaloneLocalRuntime };

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

const countStatus = (key, status) =>
  countRecords(key, [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }]);

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function updateRecord(key, existing, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: false,
  });
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

function parseSettingsPayload(row) {
  if (!row?.payload) return {};
  try {
    return JSON.parse(row.payload);
  } catch {
    return {};
  }
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const keys = ["questions", "mistakes", "papers", "reviews"];
    const [
      questionPage,
      mistakePage,
      paperPage,
      reviewPage,
      settingsPage,
      totals,
      questionDone,
      mistakeDone,
      ...reviewStatusCounts
    ] = await Promise.all([
      readPage("questions"),
      readPage("mistakes"),
      readPage("papers"),
      readPage("reviews"),
      readPage("settings"),
      Promise.all(keys.map((key) => countRecords(key))),
      countStatus("questions", "done"),
      countStatus("mistakes", "done"),
      ...["needs_review", "changes_requested", "approved", "done", "blocked"].map((status) =>
        countStatus("reviews", status),
      ),
    ]);
    const configRow = findSettingsRow(settingsPage.rows, "config");
    const configPayload = parseSettingsPayload(configRow);
    const config_summary = buildConfigSummary(configPayload);
    const questions = questionPage.rows.map(computeQuestionFromRow);
    const mistakes = mistakePage.rows.map(computeMistakeFromRow);
    const papers = paperPage.rows.map(computePaperFromRow);
    const reviews = reviewPage.rows.map(computeReviewFromRow);
    const snapshot = assembleSnapshot({
      profile: configPayload.student_profile || { display_name: "", grade: "", language: "Auto" },
      questions,
      mistakes,
      papers,
      reviews,
      mastery_score: configPayload.metrics?.mastery_score,
      questions_analyzed: configPayload.metrics?.questions_analyzed,
    });
    if (totals[0] !== null && questionDone !== null) snapshot.metrics.active_questions = totals[0] - questionDone;
    if (totals[1] !== null) snapshot.metrics.mistakes_total = totals[1];
    if (totals[1] !== null && mistakeDone !== null) snapshot.metrics.due_reviews = totals[1] - mistakeDone;
    if (totals[2] !== null) snapshot.metrics.papers_generated = totals[2];
    return {
      app: "kelly-homework-coach",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
      pagination: {
        questions: questionPage.nextCursor,
        mistakes: mistakePage.nextCursor,
        papers: paperPage.nextCursor,
        reviews: reviewPage.nextCursor,
      },
      totalCount: Object.fromEntries(keys.map((key, index) => [key, totals[index]])),
      workflowCount: reviewStatusCounts.every((value) => value !== null)
        ? Object.fromEntries(
            ["needs_review", "changes_requested", "approved", "done", "blocked"].map((status, index) => [
              status,
              reviewStatusCounts[index],
            ]),
          )
        : null,
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  // Human verdict (approve / request_changes / block / revise), written
  // directly onto the review record, and mirrored onto the target
  // question/mistake/paper's own `status` field. Ported from the retired
  // local-file DataProvider's submitReview()+updateTargetStatus(): the
  // review's decision action/comment/decided_at live on the review row,
  // while the target's status is kept in sync on its own row — there is no
  // separate decisions.json bucket.
  async getPracticeContext() {
    await ensureResources();
    return { questionsBaseId: base("questions").baseId, mistakesBaseId: base("mistakes").baseId };
  },

  async getQuestionForMistake(mistake) {
    if (!mistake?.question_id) throw new Error("这张错题卡未关联原题，请先补齐关联。");
    await ensureResources();
    const row = await findRecord("questions", "question-id", mistake.question_id);
    if (!row) throw new Error("找不到关联原题，暂不能生成完整出题请求。");
    return computeQuestionFromRow(normalizeFields(row.headCommit?.payload || row.headCommit?.fields || row.fields));
  },

  async getMistakeRequestStatus({ requestId, mistake_id } = {}) {
    if (!/^crq[a-zA-Z0-9]+$/.test(requestId || "")) throw new Error("Invalid request id");
    if (!allowedReads.has("changeRequests.get")) throw new Error("PROCEDURE_DENIED");
    await ensureResources();
    const row = await findRecord("mistakes", "mistake-id", mistake_id);
    if (!row) throw new Error("Mistake not found");
    const cr = await runtimeClient.changeRequests.get({ changeRequestId: requestId });
    if (cr.baseId !== base("mistakes").baseId || !cr.operations?.some((op) => op.targetRecordId === row.id))
      throw new Error("Request does not belong to this mistake");
    return cr.status;
  },

  async submitMistakeCause({ mistake_id, cause } = {}) {
    if (typeof mistake_id !== "string" || !mistake_id) throw new Error("Missing mistake id");
    if (typeof cause !== "string" || !cause.trim() || cause.trim().length > 2000)
      throw new Error("Cause must be 1–2000 characters");
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    await ensureResources();
    const row = await findRecord("mistakes", "mistake-id", mistake_id);
    if (!row) throw new Error("Mistake not found");
    const raw = row.headCommit?.payload || row.headCommit?.fields || row.fields || {};
    let analysis;
    try {
      analysis = typeof raw.analysis === "string" ? JSON.parse(raw.analysis) : raw.analysis || {};
    } catch {
      throw new Error("Invalid existing analysis; refusing to overwrite");
    }
    if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("Invalid analysis");
    const cr = await runtimeClient.records.changeRequest({
      recordId: row.id,
      operation: "update",
      baseCommitId: row.headCommitId,
      fields: { ...raw, analysis: JSON.stringify({ ...analysis, root_cause: cause.trim() }) },
      message: "补充既有错题卡的家长提供错因／作答过程；保留其他字段和确认状态",
      author: appConfig.appId,
      autoMerge: false,
    });
    if (cr.status !== "in_review") throw new Error("Expected pending ChangeRequest");
    return { id: cr.id, status: cr.status };
  },

  async submitReview({ review_id, action, comment = "" } = {}) {
    if (!review_id || typeof review_id !== "string") throw new Error("submitReview requires a review_id");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`Unsupported action: ${action}. Must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("reviews", "review-id", review_id);
    if (!existing) throw new Error(`Review not found: ${review_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    if (current.target_type === "paper" && current.target_id) {
      const target = await findRecord("papers", "paper-id", current.target_id);
      if (target) {
        const paper = computePaperFromRow(
          normalizeFields(target.headCommit?.payload || target.headCommit?.fields || target.fields),
        );
        const latest = paper.analysis?.attempts?.at(-1);
        if (latest)
          throw new Error(
            "Practice results require a separate review; the old paper approval cannot unlock a completed paper",
          );
      }
    }
    const now = new Date().toISOString();
    const nextStatus = statusForAction(action);

    await updateRecord(
      "reviews",
      existing,
      baseReviewFields({
        ...computeReviewFromRow(current),
        review_id,
        status: nextStatus,
        decision_action: action,
        decision_comment: String(comment || ""),
        decided_at: now,
      }),
      `Decision on review ${review_id}: ${action}`,
    );

    const targetType = current.target_type;
    const targetId = current.target_id;
    const targetBase = { question: "questions", mistake: "mistakes", paper: "papers" }[targetType];
    const targetIdField = { question: "question-id", mistake: "mistake-id", paper: "paper-id" }[targetType];
    if (targetBase && targetId) {
      const targetExisting = await findRecord(targetBase, targetIdField, targetId);
      if (targetExisting) {
        const targetCurrent = normalizeFields(
          targetExisting.headCommit?.payload || targetExisting.headCommit?.fields || targetExisting.fields,
        );
        const fieldsBuilder = { questions: baseQuestionFields, mistakes: baseMistakeFields, papers: basePaperFields }[
          targetBase
        ];
        const normalizer = {
          questions: computeQuestionFromRow,
          mistakes: computeMistakeFromRow,
          papers: computePaperFromRow,
        }[targetBase];
        await updateRecord(
          targetBase,
          targetExisting,
          fieldsBuilder({ ...normalizer(targetCurrent), status: nextStatus }),
          `Decision on review ${review_id} updates ${targetType} ${targetId}: ${nextStatus}`,
        );
      }
    }

    return { ok: true };
  },

  /**
   * Record a finished practice run onto the paper's OWN row.
   *
   * Deliberately narrow. `papers` is already documented as "one row per
   * practice paper plan **or completed-paper analysis**", and `analysis` is a
   * JSON object, so the attempt is an UPDATE to a row that exists — it reuses
   * updateRecord()/records.changeRequest and needs no create procedure and no
   * new Base. The AirApp's write surface is unchanged.
   *
   * What it does NOT write: mistake cards. Turning a wrong answer into a
   * root cause and a misconception is a judgement about a child's learning,
   * and this skill's contract is that the agent drafts those and a parent
   * approves them. The runner only reports what it can prove.
   */
  async submitPaperAttempt({ paper_id, attempt } = {}) {
    if (!paper_id || typeof paper_id !== "string") throw new Error("submitPaperAttempt requires a paper_id");
    if (!attempt || typeof attempt !== "object") throw new Error("submitPaperAttempt requires an attempt");
    await ensureResources();
    const existing = await findRecord("papers", "paper-id", paper_id);
    if (!existing) throw new Error(`Paper not found: ${paper_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const paper = computePaperFromRow(current);
    if (paper.status !== "approved") throw new Error("Paper must be approved before submission");
    const cr = await updateRecord(
      "papers",
      existing,
      basePaperFields({
        ...paper,
        status: "needs_review",
        analysis: {
          ...paper.analysis,
          strengths: [],
          review_plan: [],
          deep_notes: "",
          wrong_count: attempt.wrong_count,
          attempt,
          attempts: [...(paper.analysis.attempts || []), attempt],
        },
      }),
      `Practice result for ${paper_id}; review the new attempt separately from the old paper approval`,
    );
    if (cr.status !== "in_review") throw new Error("Expected pending result request");
    return { id: cr.id, status: cr.status };
  },

  async submitAttemptReview({ paper_id, attempted_at, verdicts, comment } = {}) {
    if (!paper_id || !attempted_at || !Array.isArray(verdicts) || !String(comment || "").trim())
      throw new Error("A specific attempt, manual marks and a parent note are required");
    await ensureResources();
    const existing = await findRecord("papers", "paper-id", paper_id);
    if (!existing) throw new Error("Paper not found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const paper = computePaperFromRow(current);
    const attempts = paper.analysis?.attempts || [];
    const attempt = attempts.at(-1);
    if (paper.status !== "needs_review" || !attempt || attempt.attempted_at !== attempted_at)
      throw new Error("Attempt is no longer current; refresh before reviewing");
    const prior = paper.analysis.attempt_reviews || [];
    if (prior.some((entry) => entry.attempted_at === attempted_at)) throw new Error("Attempt already reviewed");
    const open = attempt.results.filter((result) => result.outcome === "ungraded").map((result) => result.ref);
    if (
      verdicts.length !== open.length ||
      new Set(verdicts.map((v) => v.ref)).size !== open.length ||
      verdicts.some((v) => !open.includes(v.ref) || !["correct", "wrong"].includes(v.outcome))
    )
      throw new Error("Each open response needs one manual mark");
    const next = {
      ...paper.analysis,
      attempt_reviews: [
        ...prior,
        {
          attempted_at,
          verdicts: verdicts.map(({ ref, outcome }) => ({ ref, outcome })),
          comment: String(comment).trim().slice(0, 2000),
          reviewed_at: new Date().toISOString(),
        },
      ],
    };
    const cr = await updateRecord(
      "papers",
      existing,
      basePaperFields({ ...paper, analysis: next }),
      `Parent review of practice attempt ${attempted_at} on ${paper_id}`,
    );
    if (cr.status !== "in_review") throw new Error("Expected pending attempt review request");
    return { id: cr.id, status: cr.status };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
