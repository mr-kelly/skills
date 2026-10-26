import {
  CONTROL_TEMPLATES,
  FRAMEWORK,
  evaluateEvidence,
  iso,
  lines,
  programReady,
  ref,
  validateResolution,
} from "./domain.js";
import { normalizeReport, redact } from "./imports.js";

export const hashText = async (text) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const exact = (fieldSlug, value) => [{ fieldSlug, operator: "eq", value }];
export const programFilter = (programId) => exact("program-reference", programId);
export const requireOwned = (record, programId) => {
  if (ref(record.fields.program) !== programId || record.fields["program-reference"] !== programId)
    throw new Error("RECORD_OUTSIDE_SELECTED_PROGRAM");
  return record;
};
const list = async (store, key, programId, extra = []) => {
  const page = await store.page(key, { valueFilters: [...programFilter(programId), ...extra] });
  if (page.nextCursor) throw new Error(`BOUNDED_WORKFLOW_REQUIRES_NARROWER_SCOPE: ${key}`);
  return page.records.map((row) => requireOwned(row, programId));
};
const once = async (store, key, fields, recordKey) => {
  const page = await store.page(key, { valueFilters: exact("record-key", recordKey), limit: 2 });
  if (page.records.length > 1 || page.nextCursor) throw new Error("DUPLICATE_BUSINESS_KEY");
  if (page.records[0]) {
    const row = requireOwned(page.records[0], fields["program-reference"]);
    return row;
  }
  return store.create(key, { ...fields, "record-key": recordKey }, recordKey);
};

export const initializeControls = async (store, programId) => {
  const program = await store.get("programs", programId);
  if (!programReady(program)) throw new Error("PROGRAM_SCOPE_INCOMPLETE");
  const result = [];
  for (const template of CONTROL_TEMPLATES)
    result.push(
      await once(
        store,
        "controls",
        {
          title: template.title,
          "program-reference": programId,
          "control-key": template.key,
          "framework-version": FRAMEWORK,
          "external-reference": template.reference,
          kind: template.kind,
          "mapped-checks": template.checks.join(","),
          "evidence-requirements": template.checks.join(","),
          owner: program.fields.owner,
          frequency: template.frequency,
          "coverage-mode": template.mode,
          description: template.description,
          "design-state": "designed",
          program: programId,
        },
        `${programId}:control:${template.key}:${FRAMEWORK}`,
      ),
    );
  return result;
};

export const importReport = async (store, programId, input, options = {}) => {
  const program = await store.get("programs", programId);
  if (!programReady(program)) throw new Error("PROGRAM_SCOPE_INCOMPLETE");
  const report = normalizeReport(input, {
    format: options.format || "normalized",
    frameworkVersion: program.fields["framework-version"],
    scopeVersion: program.fields["scope-version"],
  });
  const accounts = new Set(lines(program.fields.accounts));
  const regions = new Set(lines(program.fields.regions));
  for (const row of report.rows)
    if (!accounts.has(row.account) || !regions.has(row.region))
      throw new Error("REPORT_ACCOUNT_OR_REGION_OUTSIDE_PROGRAM");
  const digest = options.sourceDigest || (await hashText(JSON.stringify(input)));
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("INVALID_SOURCE_DIGEST");
  const collectedAt = options.collectedAt || new Date().toISOString();
  if (!iso(collectedAt)) throw new Error("INVALID_COLLECTION_TIME");
  const controls = await initializeControls(store, programId);
  let assessment = options.assessmentId
    ? requireOwned(await store.get("assessments", options.assessmentId), programId)
    : await once(
        store,
        "assessments",
        {
          title: `${program.fields.title} · ${report.producer}`,
          "program-reference": programId,
          "scope-reference": program.fields["scope-reference"],
          "scope-version": program.fields["scope-version"],
          "framework-version": program.fields["framework-version"],
          "period-start": program.fields["period-start"],
          "period-end": program.fields["period-end"],
          "assessment-type": program.fields["assessment-type"],
          "source-format": report.sourceFormat,
          status: "requested",
          program: programId,
        },
        `${programId}:import:${program.fields["scope-version"]}:${digest}`,
      );
  if (
    ["scope-version", "framework-version", "scope-reference", "assessment-type", "period-start", "period-end"].some(
      (key) => assessment.fields[key] !== program.fields[key],
    )
  )
    throw new Error("ASSESSMENT_SCOPE_CHANGED");
  if (assessment.fields["source-sha256"] && assessment.fields["source-sha256"] !== digest)
    throw new Error("ASSESSMENT_SOURCE_DIGEST_CHANGED");
  if (
    assessment.fields["source-format"] &&
    assessment.fields["source-format"] !== report.sourceFormat &&
    !(
      assessment.fields["source-format"] === "aws-read-catalog" &&
      report.producer === "Kelly finite AWS read catalog v1"
    )
  )
    throw new Error("ASSESSMENT_SOURCE_FORMAT_CHANGED");
  if (assessment.fields.status === "completed" || assessment.fields.status === "partial")
    return { assessment, imported: 0, reused: true, rows: report.rows.length };
  if (assessment.fields.status === "cancelled") throw new Error("ASSESSMENT_CANCELLED");
  const runnerId = options.runnerId || crypto.randomUUID();
  if (assessment.fields.status === "running" && assessment.fields["runner-id"] !== runnerId) {
    const stale =
      iso(assessment.fields["heartbeat-at"]) &&
      Date.now() - Date.parse(assessment.fields["heartbeat-at"]) > 15 * 60 * 1000;
    if (!options.resume || !stale) throw new Error("ASSESSMENT_ALREADY_RUNNING_REVIEW_STALE_CLAIM_MANUALLY");
  }
  if (assessment.fields.status === "failed" && !options.resume)
    throw new Error("FAILED_ASSESSMENT_REQUIRES_EXPLICIT_RESUME");
  assessment = await store.update("assessments", assessment, {
    status: "running",
    "started-at": collectedAt,
    "heartbeat-at": collectedAt,
    "runner-id": runnerId,
    "source-sha256": digest,
  });
  let imported = 0;
  let unmapped = 0;
  try {
    for (const row of report.rows) {
      assessment = requireOwned(await store.get("assessments", assessment.id), programId);
      if (assessment.fields.status === "cancelled") return { assessment, imported, cancelled: true };
      if (assessment.fields.status !== "running" || assessment.fields["runner-id"] !== runnerId)
        throw new Error("ASSESSMENT_CLAIM_CHANGED");
      const key = `${assessment.id}:${row.key}`;
      await once(
        store,
        "resources",
        {
          title: redact(row.title),
          "program-reference": programId,
          "assessment-reference": assessment.id,
          provider: row.provider,
          account: row.account,
          region: row.region,
          "resource-key": redact(row.resourceKey),
          "resource-type": row.resourceType,
          "check-id": row.checkId,
          status: row.status,
          "observed-at": row.observedAt,
          summary: redact(row.summary),
          "source-locator": redact(row.sourceLocator),
          program: programId,
          assessment: assessment.id,
        },
        `${key}:resource`,
      );
      const evidence = await once(
        store,
        "evidence",
        {
          title: redact(row.title),
          "program-reference": programId,
          "assessment-reference": assessment.id,
          "framework-version": program.fields["framework-version"],
          "scope-version": program.fields["scope-version"],
          "source-kind": report.sourceFormat,
          "source-locator": redact(row.sourceLocator),
          sha256: digest,
          "scope-reference": program.fields["scope-reference"],
          account: row.account,
          region: row.region,
          "resource-key": row.resourceKey,
          "check-id": row.checkId,
          "requirement-key": row.checkId,
          "observed-at": row.observedAt,
          "collected-at": collectedAt,
          ...(row.coverageStart ? { "coverage-start": row.coverageStart } : {}),
          ...(row.coverageEnd ? { "coverage-end": row.coverageEnd } : {}),
          "evidence-mode": row.evidenceMode,
          "technical-result": row.status,
          excerpt: redact(row.summary),
          program: programId,
          assessment: assessment.id,
        },
        `${key}:evidence`,
      );
      const mapped = controls.filter((control) => lines(control.fields["mapped-checks"]).includes(row.checkId));
      if (!mapped.length) unmapped++;
      for (const control of mapped) {
        const link = await once(
          store,
          "evidence-links",
          {
            title: `${control.fields.title} · ${redact(row.title)}`,
            "program-reference": programId,
            "assessment-reference": assessment.id,
            "control-reference": control.id,
            "evidence-reference": evidence.id,
            "review-state": "pending",
            program: programId,
            assessment: assessment.id,
            control: control.id,
            evidence: evidence.id,
          },
          `${key}:${control.id}:link`,
        );
        const result = evaluateEvidence(program, control, evidence, link, collectedAt);
        if (row.status !== "pass" || ["insufficient", "mismatch", "expired"].includes(result.state))
          await once(
            store,
            "issues",
            {
              title: `${control.fields.title}：${row.status === "fail" ? "技术检查失败" : "证据需要补充"}`,
              "program-reference": programId,
              "assessment-reference": assessment.id,
              "control-reference": control.id,
              severity: row.status === "fail" ? "high" : "medium",
              "issue-kind": row.status === "fail" ? "technical" : "evidence",
              status: "open",
              owner: control.fields.owner || program.fields.owner,
              reason: `${redact(row.summary)}\n${result.reason}`,
              "verification-after": row.observedAt,
              account: row.account,
              region: row.region,
              "resource-key": row.resourceKey,
              "check-id": row.checkId,
              program: programId,
              assessment: assessment.id,
              control: control.id,
            },
            `${key}:${control.id}:issue`,
          );
      }
      imported++;
      options.onProgress?.({ imported, total: report.rows.length });
    }
    assessment = await store.get("assessments", assessment.id);
    if (assessment.fields.status !== "cancelled" && assessment.fields["runner-id"] === runnerId)
      assessment = await store.update("assessments", assessment, {
        status: unmapped || report.rows.some((row) => row.status === "unknown") ? "partial" : "completed",
        "finished-at": new Date().toISOString(),
        "heartbeat-at": new Date().toISOString(),
        "coverage-note": `${report.rows.length} 条显式来源记录；${unmapped} 条尚未映射。导入结束不代表控制就绪或审计通过，未提供的账户、资产、期间及组织控制仍未覆盖。`,
      });
    return { assessment, imported, unmapped, reused: false };
  } catch (error) {
    const fresh = await store.get("assessments", assessment.id);
    if (fresh.fields.status !== "cancelled" && fresh.fields["runner-id"] === runnerId)
      await store
        .update("assessments", fresh, {
          status: "failed",
          "coverage-note": "结果同步中断；已保存证据保留，同一来源可幂等重试。",
        })
        .catch(() => {});
    throw error;
  }
};

export const addEvidence = async (store, programId, controlId, input) => {
  const program = await store.get("programs", programId);
  const control = requireOwned(await store.get("controls", controlId), programId);
  if (
    !programReady(program) ||
    !input.title ||
    !input.sourceLocator ||
    !input.summary ||
    !iso(input.observedAt) ||
    !iso(input.collectedAt) ||
    !["snapshot", "period"].includes(input.evidenceMode) ||
    !["pass", "fail", "unknown", "manual"].includes(input.technicalResult)
  )
    throw new Error("EVIDENCE_FIELDS_INCOMPLETE");
  if (
    !lines(program.fields.accounts).includes(input.account) ||
    !lines(program.fields.regions).includes(input.region) ||
    !input.resourceKey ||
    !input.checkId ||
    !lines(control.fields["evidence-requirements"] || control.fields["mapped-checks"]).includes(
      input.requirementKey || input.checkId,
    )
  )
    throw new Error("EVIDENCE_SCOPE_AND_REQUIREMENT_REQUIRED");
  if (
    input.evidenceMode === "period" &&
    (!iso(input.coverageStart) ||
      !iso(input.coverageEnd) ||
      Date.parse(input.coverageStart) > Date.parse(input.coverageEnd))
  )
    throw new Error("PERIOD_EVIDENCE_REQUIRES_REAL_INTERVAL");
  const key = input.key || (await hashText(JSON.stringify(input)));
  const evidence = await once(
    store,
    "evidence",
    {
      title: redact(input.title),
      "program-reference": programId,
      "framework-version": program.fields["framework-version"],
      "scope-version": program.fields["scope-version"],
      "scope-reference": program.fields["scope-reference"],
      account: input.account,
      region: input.region,
      "resource-key": redact(input.resourceKey),
      "check-id": input.checkId,
      "requirement-key": input.requirementKey || input.checkId,
      "source-kind": "manual",
      "source-locator": redact(input.sourceLocator),
      sha256: /^[a-f0-9]{64}$/.test(input.sha256 || "") ? input.sha256 : await hashText(input.summary),
      "observed-at": input.observedAt,
      "collected-at": input.collectedAt,
      ...(input.coverageStart ? { "coverage-start": input.coverageStart } : {}),
      ...(input.coverageEnd ? { "coverage-end": input.coverageEnd } : {}),
      ...(input.retentionUntil ? { "retention-until": input.retentionUntil } : {}),
      "evidence-mode": input.evidenceMode,
      "technical-result": input.technicalResult,
      excerpt: redact(input.summary),
      program: programId,
    },
    `${programId}:manual:${key}`,
  );
  const link = await once(
    store,
    "evidence-links",
    {
      title: `${control.fields.title} · ${evidence.fields.title}`,
      "program-reference": programId,
      "control-reference": control.id,
      "evidence-reference": evidence.id,
      "review-state": "pending",
      program: programId,
      control: control.id,
      evidence: evidence.id,
    },
    `${programId}:manual:${key}:${control.id}:link`,
  );
  return { evidence, link };
};

export const reviewEvidenceLink = async (
  store,
  programId,
  linkId,
  { verdict, note, reviewer, now = new Date().toISOString() },
) => {
  const program = await store.get("programs", programId);
  const link = requireOwned(await store.get("evidence-links", linkId), programId);
  if (!["accepted", "rejected"].includes(verdict) || !String(note || "").trim() || !String(reviewer || "").trim())
    throw new Error("REVIEW_REASON_AND_REVIEWER_REQUIRED");
  const control = requireOwned(await store.get("controls", ref(link.fields.control)), programId);
  const evidence = requireOwned(await store.get("evidence", ref(link.fields.evidence)), programId);
  const proposed = { ...link, fields: { ...link.fields, "review-state": verdict, "review-note": note, reviewer } };
  const result = evaluateEvidence(program, control, evidence, proposed, now);
  if (verdict === "accepted" && !["supported", "partial"].includes(result.state))
    throw new Error(`EVIDENCE_NOT_ACCEPTABLE: ${result.reason}`);
  return store.update("evidence-links", link, {
    "review-state": verdict,
    "review-note": redact(note),
    reviewer: redact(reviewer),
    "reviewed-at": now,
  });
};

export const resolveIssue = async (
  store,
  programId,
  issueId,
  { evidenceId, linkId, note, now = new Date().toISOString() },
) => {
  const program = await store.get("programs", programId);
  const issue = requireOwned(await store.get("issues", issueId), programId);
  const evidence = requireOwned(await store.get("evidence", evidenceId), programId);
  const link = requireOwned(await store.get("evidence-links", linkId), programId);
  const control = requireOwned(await store.get("controls", ref(issue.fields.control)), programId);
  validateResolution(program, control, issue, evidence, link, note, now);
  return store.update("issues", issue, {
    status: "closed",
    "resolution-note": redact(note),
    "verified-evidence-reference": evidence.id,
    "verified-evidence": evidence.id,
  });
};

export const createException = async (store, programId, controlId, input) => {
  const control = requireOwned(await store.get("controls", controlId), programId);
  if (
    !input.reason?.trim() ||
    !input.compensatingControls?.trim() ||
    !input.acceptedBy?.trim() ||
    !iso(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.now || new Date().toISOString())
  )
    throw new Error("EXCEPTION_REQUIRES_REASON_COMPENSATION_OWNER_AND_FUTURE_EXPIRY");
  const issue = input.issueId ? requireOwned(await store.get("issues", input.issueId), programId) : null;
  if (issue && ref(issue.fields.control) !== control.id) throw new Error("EXCEPTION_ISSUE_CONTROL_MISMATCH");
  const key = await hashText(JSON.stringify(input));
  return once(
    store,
    "exceptions",
    {
      title: `${control.fields.title} · 风险接受`,
      "program-reference": programId,
      "control-reference": control.id,
      ...(issue ? { "issue-reference": issue.id, issue: issue.id } : {}),
      reason: redact(input.reason),
      "compensating-controls": redact(input.compensatingControls),
      "accepted-by": redact(input.acceptedBy),
      "expires-at": input.expiresAt,
      status: "accepted",
      program: programId,
      control: control.id,
    },
    `${programId}:exception:${key}`,
  );
};

export const programRows = list;
