import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { describeRuleRequest } from "../content/kelly-appsec-app/app/js/coverage.js";
import { evaluateResponse, hash, parseJson, redact, storedCase, validateOrigin, validatePath } from "./domain.mjs";
import { relationId } from "./store.mjs";

export const policyFingerprint = (projectId, runId, revision, row, endpoint) =>
  hash({
    projectId,
    runId,
    revision,
    rule: storedCase(row),
    ruleHead: row.headCommitId,
    endpointId: endpoint.id,
    endpointHead: endpoint.headCommitId,
    method: endpoint.fields.method,
    path: endpoint.fields.path,
  });

export const planRun = async (store, authorization) => {
  const { runId, projectId, environment, revision, scope } = authorization;
  const run = await store.get("runs", runId);
  const project = await store.get("projects", projectId);
  const origin = validateOrigin(authorization.origin);
  if (
    project.fields["is-example"] ||
    relationId(run.fields.project) !== projectId ||
    run.fields["project-reference"] !== projectId
  )
    throw new Error("PROJECT_OUTSIDE_AUTHORIZATION");
  if (run.fields.mode !== "dynamic") throw new Error("USE_OFFLINE_IMPORT_FOR_SOURCE_REVIEWS");
  if (
    !scope ||
    run.fields["scope-reference"] !== scope ||
    run.fields.environment !== environment ||
    project.fields.environment !== environment ||
    run.fields["source-revision"] !== revision ||
    project.fields["source-revision"] !== revision ||
    validateOrigin(run.fields.origin) !== origin ||
    validateOrigin(project.fields.origin) !== origin
  )
    throw new Error("TARGET_SCOPE_OR_VERSION_MISMATCH");
  if (
    project.fields["onboarding-version"] !== 1 ||
    project.fields["onboarding-state"] !== "complete" ||
    !project.fields.owner ||
    !project.fields["scope-note"]
  )
    throw new Error("PROJECT_ONBOARDING_REQUIRED");
  const snapshot = parseJson(run.fields["rule-snapshot"], []);
  if (!Array.isArray(snapshot) || !snapshot.length || snapshot.length > 50)
    throw new Error("INVALID_EXPLICIT_RULE_SNAPSHOT");
  const cases = [];
  for (const entry of snapshot) {
    if (!entry || typeof entry.id !== "string" || typeof entry.headCommitId !== "string")
      throw new Error("INVALID_RULE_SNAPSHOT");
    const row = await store.get("rules", entry.id);
    if (
      row.headCommitId !== entry.headCommitId ||
      row.fields["project-reference"] !== projectId ||
      relationId(row.fields.project) !== projectId ||
      row.fields["source-revision"] !== revision
    )
      throw new Error("RULE_CHANGED_OR_OUTSIDE_PROJECT");
    const endpoint = await store.get("endpoints", relationId(row.fields.endpoint));
    if (
      endpoint.fields["project-reference"] !== projectId ||
      relationId(endpoint.fields.project) !== projectId ||
      endpoint.fields["source-revision"] !== revision ||
      row.fields["endpoint-reference"] !== endpoint.id
    )
      throw new Error("ENDPOINT_OUTSIDE_PROJECT");
    if (entry.request && JSON.stringify(entry.request) !== JSON.stringify(describeRuleRequest(row, endpoint)))
      throw new Error("RULE_REQUEST_METADATA_CHANGED");
    const rule = storedCase(row);
    const method = endpoint.fields.method;
    const endpointPath = validatePath(endpoint.fields.path);
    if (
      /[{}]/.test(endpointPath) ||
      !authorization.allowedMethods?.includes(method) ||
      !authorization.allowedPaths?.includes(endpointPath) ||
      (rule.objectId && !authorization.allowedObjectIds?.includes(rule.objectId))
    )
      throw new Error("REQUEST_OUTSIDE_LOCAL_ALLOWLIST");
    if ((rule.mutating || !["GET", "HEAD", "OPTIONS"].includes(method)) && authorization.allowMutations !== true)
      throw new Error("MUTATING_CASE_REQUIRES_EXPLICIT_LOCAL_AUTHORIZATION");
    if (rule.identity !== "anonymous" && !authorization.credentials?.[rule.identity])
      throw new Error("MISSING_LOCAL_IDENTITY_CREDENTIAL");
    cases.push({ row, endpoint, rule, method, path: endpointPath });
  }
  if (new Set(cases.map((item) => item.endpoint.id)).size > 5) throw new Error("ENDPOINT_BUDGET_EXCEEDED");
  if (new Set(snapshot.map((entry) => entry.id)).size !== snapshot.length) throw new Error("DUPLICATE_RULE_SNAPSHOT");
  for (const item of cases)
    if (
      item.rule.baselineRuleKey &&
      !cases.some((other) => other.rule.key === item.rule.baselineRuleKey && other.rule.expectation === "allow")
    )
      throw new Error("BASELINE_NOT_IN_EXPLICIT_RUN");
  let retestFinding = null;
  if (run.fields["retest-finding-reference"]) {
    retestFinding = await store.get("findings", run.fields["retest-finding-reference"]);
    if (
      retestFinding.fields["project-reference"] !== projectId ||
      relationId(retestFinding.fields.project) !== projectId ||
      retestFinding.fields["fixed-revision"] !== revision ||
      retestFinding.fields["retest-run-reference"] !== run.id ||
      retestFinding.fields["source-revision"] === revision
    )
      throw new Error("RETEST_FINDING_VERSION_MISMATCH");
    const originalCheck = await store.get("checks", relationId(retestFinding.fields.check));
    const originalRule = await store.get("rules", relationId(originalCheck.fields.rule));
    const originalEndpoint = await store.get("endpoints", relationId(originalRule.fields.endpoint));
    if (
      retestFinding.fields["check-reference"] !== originalCheck.id ||
      originalCheck.fields["rule-reference"] !== originalRule.id ||
      originalCheck.fields["endpoint-reference"] !== originalEndpoint.id ||
      relationId(originalCheck.fields.project) !== projectId ||
      relationId(originalRule.fields.project) !== projectId ||
      relationId(originalEndpoint.fields.project) !== projectId ||
      originalRule.fields["endpoint-reference"] !== originalEndpoint.id ||
      originalRule.fields["source-revision"] !== retestFinding.fields["source-revision"] ||
      originalEndpoint.fields["source-revision"] !== retestFinding.fields["source-revision"] ||
      originalCheck.fields["project-reference"] !== projectId ||
      originalRule.fields["project-reference"] !== projectId ||
      originalEndpoint.fields["project-reference"] !== projectId ||
      originalCheck.fields["source-revision"] !== retestFinding.fields["source-revision"]
    )
      throw new Error("RETEST_ORIGINAL_SCOPE_MISMATCH");
    if (
      originalCheck.fields["run-reference"] !== relationId(originalCheck.fields.run) ||
      retestFinding.fields["run-reference"] !== originalCheck.fields["run-reference"] ||
      relationId(retestFinding.fields.run) !== originalCheck.fields["run-reference"] ||
      originalCheck.fields["policy-hash"] !==
        policyFingerprint(
          projectId,
          originalCheck.fields["run-reference"],
          retestFinding.fields["source-revision"],
          originalRule,
          originalEndpoint,
        )
    )
      throw new Error("RETEST_ORIGINAL_POLICY_CHANGED_OR_UNBOUND");
    const semantic = (rule, endpoint) =>
      hash({ rule: storedCase(rule), method: endpoint.fields.method, path: endpoint.fields.path });
    const corresponding = cases.find(
      (item) =>
        item.rule.key === storedCase(originalRule).key &&
        semantic(item.row, item.endpoint) === semantic(originalRule, originalEndpoint),
    );
    if (!corresponding) throw new Error("RETEST_MUST_COVER_ORIGINAL_RULE_AND_POLICY");
    if (corresponding.rule.baselineRuleKey) {
      const baselineKey = `${projectId}:${retestFinding.fields["source-revision"]}:${corresponding.rule.baselineRuleKey}`;
      const oldBaseline = await store.page("rules", {
        valueFilters: [{ fieldSlug: "record-key", operator: "eq", value: baselineKey }],
      });
      if (oldBaseline.nextCursor || oldBaseline.records.length !== 1)
        throw new Error("RETEST_ORIGINAL_BASELINE_MISSING");
      const baseline = oldBaseline.records[0];
      const oldEndpoint = await store.get("endpoints", relationId(baseline.fields.endpoint));
      if (
        baseline.fields["project-reference"] !== projectId ||
        oldEndpoint.fields["project-reference"] !== projectId ||
        !cases.some(
          (item) =>
            item.rule.key === corresponding.rule.baselineRuleKey &&
            semantic(item.row, item.endpoint) === semantic(baseline, oldEndpoint),
        )
      )
        throw new Error("RETEST_BASELINE_POLICY_MISMATCH");
    }
  }
  return {
    run,
    project,
    retestFinding,
    cases: cases.sort((a, b) => Number(a.rule.expectation === "deny") - Number(b.rule.expectation === "deny")),
    origin,
  };
};
/** @returns {Promise<{status:number,body:unknown,text?:string,redirected?:boolean}>} */
const defaultRequest = async (url, options) => {
  const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(10000) });
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 1048576) throw new Error("RESPONSE_BUDGET_EXCEEDED");
        chunks.push(Buffer.from(next.value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  const text = Buffer.concat(chunks).toString("utf8");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { text };
  }
  return { status: response.status, body, text, redirected: response.status >= 300 && response.status < 400 };
};
export const executeRun = async (
  store,
  authorization,
  {
    request = defaultRequest,
    now = () => new Date().toISOString(),
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) => {
  const plan = await planRun(store, authorization);
  const runnerId = randomUUID();
  let run = plan.run;
  let count = Number(run.fields["request-count"] ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("INVALID_STORED_REQUEST_COUNT");
  if (
    ![run.id, plan.project.id, ...plan.cases.map((item) => item.row.id)].every((id) =>
      /^[a-zA-Z0-9_-]{1,160}$/.test(id),
    )
  )
    throw new Error("INVALID_ARTIFACT_IDENTIFIER");
  const budget = Number(authorization.requestLimit ?? 100);
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100) throw new Error("INVALID_REQUEST_BUDGET");
  if (!authorization.directory) throw new Error("PRIVATE_EVIDENCE_DIRECTORY_REQUIRED");
  await mkdir(authorization.directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(authorization.directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    throw new Error("EVIDENCE_DIRECTORY_MUST_NOT_BE_SYMLINK");
  await chmod(authorization.directory, 0o700);
  if (!["requested", "failed", "partial", "running"].includes(run.fields.status)) throw new Error("RUN_NOT_EXECUTABLE");
  if (run.fields.status !== "requested" && !authorization.resume) throw new Error("EXPLICIT_RESUME_REQUIRED");
  if (run.fields.status === "running" && Date.now() - Date.parse(run.fields["heartbeat-at"] || "") < 120000)
    throw new Error("LIVE_RUNNER_CLAIM");
  const prior = await store.page("checks", {
    valueFilters: [{ fieldSlug: "run-reference", operator: "eq", value: run.id }],
  });
  if (
    prior.nextCursor ||
    prior.records.some(
      (row) =>
        relationId(row.fields.run) !== run.id ||
        relationId(row.fields.project) !== plan.project.id ||
        row.fields["project-reference"] !== plan.project.id ||
        row.fields["source-revision"] !== authorization.revision ||
        !plan.cases.some(
          (item) =>
            item.row.id === row.fields["rule-reference"] &&
            relationId(row.fields.rule) === item.row.id &&
            relationId(row.fields.endpoint) === item.endpoint.id,
        ),
    )
  )
    throw new Error("CHECK_HISTORY_REQUIRES_REVIEW");
  run = await store.update("runs", run, {
    status: "running",
    "runner-id": runnerId,
    "claim-reference": randomUUID(),
    "heartbeat-at": now(),
    "started-at": run.fields["started-at"] || now(),
  });
  const outcomes = [];
  const successfulBaselines = new Set();
  let currentCheck;
  try {
    for (const item of plan.cases) {
      run = await store.get("runs", run.id);
      if (run.fields.status === "cancelled") return { status: "cancelled", outcomes, requestCount: count };
      if (
        run.fields["project-reference"] !== authorization.projectId ||
        relationId(run.fields.project) !== authorization.projectId ||
        run.fields["source-revision"] !== authorization.revision ||
        run.fields.environment !== authorization.environment ||
        run.fields["scope-reference"] !== authorization.scope ||
        validateOrigin(run.fields.origin) !== plan.origin ||
        hash(parseJson(run.fields["rule-snapshot"], [])) !== hash(parseJson(plan.run.fields["rule-snapshot"], [])) ||
        run.fields["retest-finding-reference"] !== plan.run.fields["retest-finding-reference"]
      )
        throw new Error("RUN_SCOPE_CHANGED_DURING_EXECUTION");
      const currentRule = await store.get("rules", item.row.id);
      const currentEndpoint = await store.get("endpoints", item.endpoint.id);
      if (
        currentRule.headCommitId !== item.row.headCommitId ||
        currentEndpoint.headCommitId !== item.endpoint.headCommitId
      )
        throw new Error("RULE_OR_ENDPOINT_CHANGED_DURING_EXECUTION");
      if (run.fields["runner-id"] !== runnerId || run.fields.status !== "running") throw new Error("RUNNER_CLAIM_LOST");
      const previous = prior.records
        .filter((row) => row.fields["rule-reference"] === item.row.id)
        .sort((a, b) => Number(b.fields.attempt) - Number(a.fields.attempt))[0];
      const policyHash = policyFingerprint(plan.project.id, run.id, authorization.revision, item.row, item.endpoint);
      if (previous?.fields.status === "completed") {
        if (previous.fields["policy-hash"] !== policyHash) throw new Error("PRIOR_POLICY_CHANGED_REQUIRES_REVIEW");
        const evidence = await store.page("evidence", {
          valueFilters: [{ fieldSlug: "check-reference", operator: "eq", value: previous.id }],
        });
        if (evidence.nextCursor || evidence.records.length !== 1) throw new Error("PRIOR_EVIDENCE_REQUIRES_REVIEW");
        const source = evidence.records[0];
        const artifact = source.fields["artifact-reference"];
        if (
          source.fields["policy-hash"] !== policyHash ||
          source.fields["project-reference"] !== plan.project.id ||
          relationId(source.fields.project) !== plan.project.id ||
          source.fields["run-reference"] !== run.id ||
          relationId(source.fields.run) !== run.id ||
          source.fields["check-reference"] !== previous.id ||
          relationId(source.fields.check) !== previous.id ||
          source.fields["source-revision"] !== authorization.revision ||
          typeof artifact !== "string" ||
          !/^[-a-zA-Z0-9_]+\.json$/.test(artifact)
        )
          throw new Error("PRIOR_EVIDENCE_SCOPE_MISMATCH");
        const artifactPath = path.join(authorization.directory, artifact);
        const info = await lstat(artifactPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 1200000) throw new Error("PRIOR_ARTIFACT_INVALID");
        const raw = await readFile(artifactPath, "utf8");
        const original = JSON.parse(raw);
        if (
          hash(raw) !== source.fields.sha256 ||
          original.policyHash !== policyHash ||
          original.ruleId !== item.row.id ||
          original.endpointId !== item.endpoint.id ||
          original.runId !== run.id ||
          original.projectId !== plan.project.id ||
          original.revision !== authorization.revision ||
          original.assessment?.result !== previous.fields.result
        )
          throw new Error("PRIOR_EVIDENCE_INTEGRITY_MISMATCH");
        if (previous.fields.result === "satisfied" && item.rule.expectation === "allow")
          successfulBaselines.add(item.rule.key);
        outcomes.push({ ruleKey: item.rule.key, result: previous.fields.result, reused: true });
        continue;
      }
      if (count >= budget) throw new Error("REQUEST_BUDGET_REACHED: remaining cases are unverified");
      const attempt = Number(previous?.fields.attempt || 0) + 1;
      const recordKey = `${run.id}:${item.row.id}:${attempt}`;
      currentCheck = await store.create(
        "checks",
        {
          title: item.row.fields.title,
          "record-key": recordKey,
          "policy-hash": policyHash,
          "project-reference": plan.project.id,
          "run-reference": run.id,
          "endpoint-reference": item.endpoint.id,
          "rule-reference": item.row.id,
          "source-revision": authorization.revision,
          identity: item.rule.identity,
          attempt,
          status: "running",
          result: "unverified",
          project: plan.project.id,
          run: run.id,
          endpoint: item.endpoint.id,
          rule: item.row.id,
        },
        recordKey,
      );
      run = await store.update("runs", run, { "heartbeat-at": now(), "request-count": ++count });
      if (count > 1) await wait(1000);
      const token = item.rule.identity === "anonymous" ? null : authorization.credentials?.[item.rule.identity];
      const response = await request(`${plan.origin}${item.path}`, {
        method: item.method,
        headers: {
          accept: "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(item.rule.requestBody === null ? {} : { "content-type": "application/json" }),
        },
        ...(item.rule.requestBody === null ? {} : { body: JSON.stringify(item.rule.requestBody) }),
      });
      const assessment = response.redirected
        ? { result: "inconclusive", summary: "目标返回重定向；未跟随，不扩大授权范围。" }
        : evaluateResponse(item.rule, {
            ...response,
            baselineSatisfied: successfulBaselines.has(item.rule.baselineRuleKey),
          });
      if (assessment.result === "satisfied" && item.rule.expectation === "allow")
        successfulBaselines.add(item.rule.key);
      const observedAt = now();
      const artifact = `${run.id}-${item.row.id}-${attempt}.json`;
      const raw = JSON.stringify(
        {
          version: 1,
          policyHash,
          runId: run.id,
          projectId: plan.project.id,
          endpointId: item.endpoint.id,
          ruleId: item.row.id,
          revision: authorization.revision,
          origin: plan.origin,
          method: item.method,
          path: item.path,
          identity: item.rule.identity,
          observedAt,
          response: { status: response.status, body: response.body },
          assessment,
        },
        null,
        2,
      );
      const file = await open(path.join(authorization.directory, artifact), "wx", 0o600);
      try {
        await file.writeFile(raw);
      } finally {
        await file.close();
      }
      const excerpt = redact({
        method: item.method,
        path: item.path,
        identity: item.rule.identity,
        status: response.status,
        response: response.body,
        assessment,
      }).slice(0, 6000);
      await store.create(
        "evidence",
        {
          title: `${item.row.fields.title} · 请求与响应`,
          "record-key": recordKey,
          "project-reference": plan.project.id,
          "run-reference": run.id,
          "check-reference": currentCheck.id,
          "source-kind": "controlled-api",
          "source-location": `${item.method} ${item.path}`,
          "source-revision": authorization.revision,
          "observed-at": observedAt,
          sha256: hash(raw),
          "policy-hash": policyHash,
          "artifact-reference": artifact,
          "redacted-excerpt": excerpt,
          "coverage-note": "仅验证本次显式规则、受控测试对象与断言；原件保留本机。",
          project: plan.project.id,
          run: run.id,
          check: currentCheck.id,
        },
        `${recordKey}:evidence`,
      );
      if (assessment.result === "violated")
        await store.create(
          "findings",
          {
            title: `${item.rule.identity} 的接口规则被违反`,
            "record-key": recordKey,
            "project-reference": plan.project.id,
            "run-reference": run.id,
            "check-reference": currentCheck.id,
            "source-revision": authorization.revision,
            severity: "high",
            conclusion: "policy-violation",
            reasoning: assessment.summary,
            limitations: "需要核对规则适用性、部署身份和业务影响；不是服务器失陷证明。",
            recommendation: "在服务端验证当前身份对对象/动作/字段的权限，并对指定版本重新执行正向与负向案例。",
            verdict: "needs-review",
            remediation: "open",
            project: plan.project.id,
            run: run.id,
            check: currentCheck.id,
          },
          `${recordKey}:finding`,
        );
      await store.update("checks", currentCheck, {
        status: "completed",
        result: assessment.result,
        "http-status": response.status,
        "observed-at": observedAt,
        summary: assessment.summary,
      });
      outcomes.push({ ruleKey: item.rule.key, result: assessment.result });
      currentCheck = null;
    }
    run = await store.get("runs", run.id);
    if (run.fields.status === "cancelled") return { status: "cancelled", outcomes, requestCount: count };
    if (run.fields["runner-id"] !== runnerId) throw new Error("RUNNER_CLAIM_LOST");
    const status = outcomes.some((outcome) => outcome.result === "inconclusive") ? "partial" : "completed";
    await store.update("runs", run, {
      status,
      "finished-at": now(),
      "heartbeat-at": now(),
      "request-count": count,
      summary: `${outcomes.length} 条显式规则完成；${outcomes.filter((outcome) => outcome.result === "violated").length} 条观察到规则违反。结果只适用于该环境、版本和断言。`,
    });
    if (run.fields["retest-finding-reference"]) {
      const finding = await store.get("findings", run.fields["retest-finding-reference"]);
      if (
        relationId(finding.fields.project) !== plan.project.id ||
        finding.fields["check-reference"] !== plan.retestFinding.fields["check-reference"] ||
        relationId(finding.fields.check) !== relationId(plan.retestFinding.fields.check) ||
        finding.fields["source-revision"] !== plan.retestFinding.fields["source-revision"] ||
        finding.fields["project-reference"] !== plan.project.id ||
        finding.fields["fixed-revision"] !== authorization.revision ||
        finding.fields["retest-run-reference"] !== run.id
      )
        throw new Error("RETEST_FINDING_VERSION_MISMATCH");
      await store.update("findings", finding, {
        remediation:
          status === "completed" && outcomes.every((outcome) => outcome.result === "satisfied")
            ? "verified-fixed"
            : "reopened",
      });
    }
    return { status, outcomes, requestCount: count };
  } catch (error) {
    if (currentCheck) {
      const row = await store.get("checks", currentCheck.id);
      await store
        .update("checks", row, {
          status: "failed",
          result: "inconclusive",
          summary: "执行或证据同步中断；保留 attempt，需显式恢复。",
        })
        .catch(() => {});
    }
    const fresh = await store.get("runs", run.id);
    if (fresh.fields.status !== "cancelled" && fresh.fields["runner-id"] === runnerId)
      await store
        .update("runs", fresh, {
          status: "failed",
          "request-count": count,
          "heartbeat-at": now(),
          summary: "任务中断；未完成的规则不代表通过。需要在当前授权下显式恢复。",
        })
        .catch(() => {});
    throw error;
  }
};
