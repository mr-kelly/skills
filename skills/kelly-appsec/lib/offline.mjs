import { hash, redact } from "./domain.mjs";
import { policyFingerprint } from "./runner.mjs";
import { relationId } from "./store.mjs";

// A local Agent can audit an authorized source tree and submit a bounded, explicit
// review document. This records the work; it never claims generic grep proved a flaw.
export const importReview = async (store, { projectId, runId, document }) => {
  const project = await store.get("projects", projectId);
  const run = await store.get("runs", runId);
  if (
    relationId(run.fields.project) !== projectId ||
    run.fields["project-reference"] !== projectId ||
    run.fields.mode !== "offline" ||
    run.fields["source-revision"] !== project.fields["source-revision"] ||
    document.sourceRevision !== run.fields["source-revision"]
  )
    throw new Error("OFFLINE_REVIEW_SCOPE_MISMATCH");
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(document.reviews) ||
    !document.reviews.length ||
    document.reviews.length > 50
  )
    throw new Error("INVALID_OFFLINE_REVIEW_DOCUMENT");
  if (JSON.stringify(document).length > 1048576 || !["requested", "partial", "failed"].includes(run.fields.status))
    throw new Error("OFFLINE_REVIEW_NOT_EXECUTABLE");
  const prepared = [];
  for (const review of document.reviews) {
    const rule = await store.get("rules", review.ruleId);
    const endpoint = await store.get("endpoints", relationId(rule.fields.endpoint));
    if (
      rule.fields["project-reference"] !== projectId ||
      endpoint.fields["project-reference"] !== projectId ||
      rule.fields["source-revision"] !== document.sourceRevision ||
      endpoint.fields["source-revision"] !== document.sourceRevision
    )
      throw new Error("OFFLINE_REVIEW_FOREIGN_RULE");
    if (
      !["candidate", "no-indicators", "unverified"].includes(review.assessment) ||
      typeof review.reasoning !== "string" ||
      !review.reasoning.trim() ||
      typeof review.location !== "string" ||
      !review.location.trim() ||
      typeof review.excerpt !== "string" ||
      review.excerpt.length > 12000
    )
      throw new Error("INVALID_OFFLINE_REVIEW");
    if (
      relationId(rule.fields.project) !== projectId ||
      relationId(endpoint.fields.project) !== projectId ||
      rule.fields["endpoint-reference"] !== endpoint.id
    )
      throw new Error("OFFLINE_REVIEW_FOREIGN_RELATION");
    prepared.push({ review, rule, endpoint });
  }
  const observedAt = document.observedAt || run.fields["started-at"] || new Date().toISOString();
  if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt)))
    throw new Error("INVALID_REVIEW_TIMESTAMP");
  if (!run.fields["started-at"]) await store.update("runs", run, { "started-at": observedAt });
  const outcomes = [];
  for (const { review, rule, endpoint } of prepared) {
    const key = `${run.id}:offline:${rule.id}:${hash(review).slice(0, 16)}`;
    const check = await store.create(
      "checks",
      {
        title: rule.fields.title,
        "record-key": key,
        "policy-hash": policyFingerprint(projectId, run.id, document.sourceRevision, rule, endpoint),
        "project-reference": projectId,
        "run-reference": run.id,
        "endpoint-reference": endpoint.id,
        "rule-reference": rule.id,
        "source-revision": document.sourceRevision,
        identity: rule.fields.identity,
        attempt: 1,
        status: "completed",
        result: review.assessment === "candidate" ? "inconclusive" : "unverified",
        summary: redact(review.reasoning),
        "observed-at": observedAt,
        project: projectId,
        run: run.id,
        endpoint: endpoint.id,
        rule: rule.id,
      },
      key,
    );
    await store.create(
      "evidence",
      {
        title: `${rule.fields.title} · 源码复核`,
        "record-key": key,
        "policy-hash": policyFingerprint(projectId, run.id, document.sourceRevision, rule, endpoint),
        "project-reference": projectId,
        "run-reference": run.id,
        "check-reference": check.id,
        "source-kind": "source-review",
        "source-location": redact(review.location),
        "source-revision": document.sourceRevision,
        "observed-at": observedAt,
        sha256: hash(review),
        "redacted-excerpt": redact(review.excerpt),
        "coverage-note": "由明确源码/离线复核提供；不代表已执行动态验证。",
        project: projectId,
        run: run.id,
        check: check.id,
      },
      `${key}:evidence`,
    );
    if (review.assessment === "candidate")
      await store.create(
        "findings",
        {
          title: `${rule.fields.title} · 源码候选问题`,
          "record-key": key,
          "project-reference": projectId,
          "run-reference": run.id,
          "check-reference": check.id,
          "source-revision": document.sourceRevision,
          severity: ["high", "medium", "low"].includes(review.severity) ? review.severity : "medium",
          conclusion: "candidate",
          reasoning: redact(review.reasoning),
          limitations: "源码/离线线索尚需追踪完整授权链或受控动态验证；不能因局部缺中间件就确认未鉴权。",
          recommendation: redact(review.recommendation || "核对全局中间件、服务层和业务策略，再准备受控复测。"),
          verdict: "needs-review",
          remediation: "open",
          project: projectId,
          run: run.id,
          check: check.id,
        },
        `${key}:finding`,
      );
    outcomes.push(check);
  }
  const fresh = await store.get("runs", run.id);
  await store.update("runs", fresh, {
    status: "partial",
    "finished-at": new Date().toISOString(),
    summary: `${outcomes.length} 条源码/离线复核已导入；动态权限行为仍未验证。`,
  });
  return { imported: outcomes.length, dynamicVerified: false };
};
