import { randomUUID } from "node:crypto";
import { collectCheck } from "./acquisition.mjs";
import { redact } from "./analysis.mjs";
import { CHECKS, validateAlias, validateWindow } from "./catalog.mjs";
import { relationId } from "./store.mjs";

const filterRun = (id) => [{ fieldSlug: "run-reference", operator: "eq", value: id }];

export const planRun = async (store, { runId, aliases, scope, start, end }) => {
  const run = await store.get("runs", runId);
  const host = await store.get("hosts", relationId(run.fields.host));
  const allowed = new Set(aliases.map(validateAlias));
  const alias = validateAlias(host.fields["ssh-alias"]);
  if (!allowed.has(alias) || host.fields["is-example"] === true)
    throw new Error("HOST_OUTSIDE_CURRENT_SESSION_AUTHORIZATION");
  if (!scope || run.fields["scope-reference"] !== scope) throw new Error("SCOPE_REFERENCE_MISMATCH");
  const window = validateWindow(String(run.fields["window-start"]), String(run.fields["window-end"]));
  const authorized = validateWindow(start, end);
  if (Date.parse(window.start) < Date.parse(authorized.start) || Date.parse(window.end) > Date.parse(authorized.end))
    throw new Error("WINDOW_OUTSIDE_CURRENT_SESSION_AUTHORIZATION");
  if (run.fields["check-profile"] !== "intrusion-triage") throw new Error("UNKNOWN_CHECK_PROFILE");
  return { run, host, alias, window, checks: CHECKS };
};

export const executeRun = async (store, options, dependencies = {}) => {
  const plan = await planRun(store, options);
  const collector = dependencies.collector || collectCheck;
  const runnerId = dependencies.runnerId || randomUUID();
  let run = plan.run;
  if (!["requested", "running", "partial", "failed"].includes(String(run.fields.status)))
    throw new Error("RUN_NOT_EXECUTABLE");
  if (run.fields.status !== "requested" && !options.resume) throw new Error("EXPLICIT_RESUME_REQUIRED");
  if (run.fields.status === "running" && Date.now() - Date.parse(String(run.fields["heartbeat-at"] || "")) < 120000)
    throw new Error("ANOTHER_RUNNER_HAS_LIVE_CLAIM");
  const existing = await store.page("checks", { valueFilters: filterRun(run.id) });
  if (existing.records.some((row) => relationId(row.fields.run) !== run.id)) throw new Error("RUN_FILTER_NOT_HONORED");
  if (existing.nextCursor) throw new Error("TOO_MANY_CHECK_ATTEMPTS: review this run before resuming");
  // Optimistic headCommitId update is the claim. A conflict/queued write cannot execute SSH.
  run = await store.update("runs", run, {
    status: "running",
    "runner-id": runnerId,
    "claim-reference": randomUUID(),
    "heartbeat-at": new Date().toISOString(),
    "started-at": run.fields["started-at"] || new Date().toISOString(),
  });
  const outcomes = [];
  let currentCheck;
  try {
    for (const check of plan.checks) {
      run = await store.get("runs", run.id);
      if (run.fields.status === "cancelled") return { status: "cancelled", outcomes };
      if (run.fields["runner-id"] !== runnerId || run.fields.status !== "running") throw new Error("RUNNER_CLAIM_LOST");
      const previous = existing.records
        .filter((row) => row.fields["check-id"] === check.id)
        .sort((a, b) => Number(b.fields.attempt) - Number(a.fields.attempt))[0];
      if (previous && previous.fields.status === "completed") continue;
      if (previous && !options.resume) throw new Error("CHECK_ALREADY_STARTED");
      if (previous?.fields.status === "running")
        await store.update("checks", previous, {
          status: "failed",
          "coverage-note": "前次采集中断；新 attempt 保留原始记录。",
        });
      const attempt = Number(previous?.fields.attempt || 0) + 1;
      run = await store.update("runs", run, { "heartbeat-at": new Date().toISOString() });
      const recordKey = `${run.id}:${check.id}:${attempt}`;
      currentCheck = await store.create(
        "checks",
        {
          title: check.name,
          run: run.id,
          "run-reference": run.id,
          "check-id": check.id,
          attempt,
          status: "running",
          conclusion: "unassessed",
          "record-key": recordKey,
          "command-reference": `catalog@1.0.0/${check.id}`,
        },
        recordKey,
      );
      options.onProgress?.({ check: check.name, status: "running" });
      const result = await collector({
        alias: plan.alias,
        check,
        window: plan.window,
        directory: options.directory,
        runId: run.id,
        attempt,
      });
      const { analysis } = result;
      const evidenceIds = [];
      // A bounded set of redacted indicators; raw output never enters Busabase.
      const signals = analysis.signals.length
        ? analysis.signals
        : [
            {
              title: "采集范围与结果",
              source: check.id,
              line: 1,
              excerpt: analysis.summary,
              confidence: "collection-only",
              timestamp: null,
              severity: "informational",
            },
          ];
      for (const [index, signal] of signals.entries()) {
        const key = `${recordKey}:evidence:${index}`;
        const evidence = await store.create(
          "evidence",
          {
            title: signal.title,
            check: currentCheck.id,
            "check-reference": currentCheck.id,
            "record-key": key,
            "source-kind": check.kind,
            "source-locator": `${redact(signal.source)}:${signal.line}`,
            "original-time": signal.original || "",
            ...(signal.timestamp ? { "event-time": signal.timestamp } : {}),
            "time-confidence": signal.confidence,
            "collected-at": result.collectedAt,
            sha256: result.sha256,
            "artifact-reference": result.artifact,
            "redacted-excerpt": signal.excerpt,
            "redaction-note": "SHA-256 对应本机原始取证文件；摘要已脱敏。远端痕迹可能被篡改。",
          },
          key,
        );
        evidenceIds.push(evidence.id);
        if (signal.severity !== "informational") {
          const findingKey = `${recordKey}:finding:${index}`;
          await store.create(
            "findings",
            {
              title: signal.title,
              run: run.id,
              "run-reference": run.id,
              evidence: [evidence.id],
              "record-key": findingKey,
              severity: signal.severity,
              conclusion: "suspicious",
              reasoning: signal.excerpt,
              limitations: [...analysis.gaps, "规则命中为调查线索，不能单独证明成功入侵。"].join("；"),
              "next-step": "核对业务与运维基线，并关联独立的访问、执行和持久化证据。",
              verdict: "needs-review",
            },
            findingKey,
          );
        }
      }
      currentCheck = await store.update("checks", currentCheck, {
        status: analysis.status,
        conclusion: analysis.conclusion,
        summary: analysis.summary,
        "coverage-note": [
          ...analysis.gaps,
          ...(!analysis.coverageStart ? ["未测得完整事件覆盖区间；调查窗口不等于日志覆盖区间。"] : []),
        ].join("；"),
        ...(analysis.coverageStart ? { "coverage-start": analysis.coverageStart } : {}),
        ...(analysis.coverageEnd ? { "coverage-end": analysis.coverageEnd } : {}),
        "observed-at": result.collectedAt,
        "exit-code": result.code,
      });
      outcomes.push({
        checkId: check.id,
        status: analysis.status,
        gaps: analysis.gaps,
        evidenceCount: evidenceIds.length,
      });
      options.onProgress?.({ check: check.name, status: analysis.status, conclusion: analysis.conclusion });
      currentCheck = null;
      if (result.code === 255)
        throw new Error(
          "SSH_CONNECTION_REJECTED: host identity, authentication or connection failed; no further checks attempted",
        );
    }
    run = await store.get("runs", run.id);
    if (run.fields.status === "cancelled") return { status: "cancelled", outcomes };
    if (run.fields["runner-id"] !== runnerId) throw new Error("RUNNER_CLAIM_LOST");
    const all = await store.page("checks", { valueFilters: filterRun(run.id) });
    if (all.records.some((row) => relationId(row.fields.run) !== run.id)) throw new Error("RUN_FILTER_NOT_HONORED");
    const latest = new Map();
    for (const row of all.records) {
      const previous = latest.get(row.fields["check-id"]);
      if (!previous || Number(previous.fields.attempt) < Number(row.fields.attempt))
        latest.set(row.fields["check-id"], row);
    }
    if (plan.checks.some((check) => !latest.has(check.id)))
      throw new Error("READBACK_INCOMPLETE: required checks are missing");
    const incomplete = [...latest.values()].filter(
      (row) => row.fields.status !== "completed" || row.fields["coverage-note"],
    );
    const status = incomplete.length || all.nextCursor ? "partial" : "completed";
    await store.update("runs", run, {
      status,
      "finished-at": new Date().toISOString(),
      "heartbeat-at": new Date().toISOString(),
      "coverage-summary": incomplete.length
        ? `${incomplete.length} 项有采集或证据覆盖缺口，请逐项补证。`
        : "本次检查步骤已完成；不等于已排除入侵。",
    });
    return { status, outcomes };
  } catch (error) {
    // Preserve any collected evidence; do not reset a completed/cancelled run.
    if (currentCheck) {
      const fresh = await store.get("checks", currentCheck.id);
      await store
        .update("checks", fresh, {
          status: "failed",
          conclusion: "insufficient-evidence",
          "coverage-note": "采集或结果同步中断；需显式恢复，历史证据保留。",
        })
        .catch(() => {});
    }
    const fresh = await store.get("runs", run.id);
    if (fresh.fields.status !== "cancelled" && fresh.fields["runner-id"] === runnerId)
      await store
        .update("runs", fresh, {
          status: "failed",
          "coverage-summary": "检查中断；未完成项不代表通过。请检查本机受限日志或执行显式恢复。",
          "heartbeat-at": new Date().toISOString(),
        })
        .catch(() => {});
    throw error;
  }
};
