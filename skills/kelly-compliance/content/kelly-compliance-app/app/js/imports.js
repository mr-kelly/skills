import { FRAMEWORK, iso } from "./domain.js";

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const text = (value, name, max = 3000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`INVALID_REPORT_FIELD: ${name}`);
  return value.trim();
};
const timestamp = (value, name) => {
  if (!iso(value)) throw new Error(`INVALID_REPORT_TIMESTAMP: ${name}`);
  return new Date(value).toISOString();
};
const stateMap = {
  PASS: "pass",
  PASSED: "pass",
  FAIL: "fail",
  FAILED: "fail",
  WARNING: "manual",
  MANUAL: "manual",
  NOT_AVAILABLE: "unknown",
  UNKNOWN: "unknown",
  pass: "pass",
  fail: "fail",
  unknown: "unknown",
  manual: "manual",
};
const status = (value) => {
  const result = stateMap[value];
  if (!result) throw new Error("UNSUPPORTED_REPORT_STATUS");
  return result;
};
const aliases = {
  iam_root_mfa_enabled: "root-mfa",
  ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22: "network-public-admin",
  s3_bucket_public_access: "storage-public",
  s3_bucket_server_side_encryption_enabled: "storage-encryption",
  cloudtrail_multi_region_enabled: "audit-logging",
  "EC2.13": "network-public-admin",
  "IAM.9": "root-mfa",
  "S3.8": "storage-public",
  "S3.4": "storage-encryption",
  "CloudTrail.1": "audit-logging",
};
const row = (input) => {
  if (!object(input)) throw new Error("INVALID_REPORT_ROW");
  const mode = input.evidenceMode || "snapshot";
  if (!["snapshot", "period"].includes(mode)) throw new Error("INVALID_EVIDENCE_MODE");
  const result = {
    key: text(input.key, "key", 500),
    title: text(input.title, "title", 500),
    provider: text(input.provider || "aws", "provider", 100),
    account: text(input.account, "account", 100),
    region: text(input.region, "region", 100),
    resourceKey: text(input.resourceKey, "resourceKey", 1000),
    resourceType: text(input.resourceType || "unknown", "resourceType", 200),
    checkId: text(input.checkId, "checkId", 250),
    status: status(input.status),
    observedAt: timestamp(input.observedAt, "observedAt"),
    evidenceMode: mode,
    sourceLocator: text(input.sourceLocator, "sourceLocator", 1000),
    summary: text(input.summary || "来源未提供额外说明。", "summary"),
    ...(input.coverageStart ? { coverageStart: timestamp(input.coverageStart, "coverageStart") } : {}),
    ...(input.coverageEnd ? { coverageEnd: timestamp(input.coverageEnd, "coverageEnd") } : {}),
  };
  if (
    mode === "period" &&
    (!result.coverageStart || !result.coverageEnd || Date.parse(result.coverageStart) > Date.parse(result.coverageEnd))
  )
    throw new Error("PERIOD_EVIDENCE_REQUIRES_REAL_INTERVAL");
  return result;
};

export const normalizeReport = (
  input,
  { format = "normalized", frameworkVersion = FRAMEWORK, scopeVersion = 1 } = {},
) => {
  if (!Number.isSafeInteger(scopeVersion) || scopeVersion < 1 || frameworkVersion !== FRAMEWORK)
    throw new Error("REPORT_MAPPING_VERSION_UNSUPPORTED");
  let rawRows;
  let producer;
  if (format === "normalized") {
    if (!object(input) || input.format !== "kelly-compliance-report@1" || !Array.isArray(input.rows))
      throw new Error("EXPECTED_KELLY_COMPLIANCE_REPORT_V1");
    if (input.frameworkVersion !== frameworkVersion || input.scopeVersion !== scopeVersion)
      throw new Error("REPORT_SCOPE_OR_FRAMEWORK_MISMATCH");
    producer = text(input.producer, "producer", 250);
    rawRows = input.rows;
  } else if (format === "prowler") {
    if (!Array.isArray(input)) throw new Error("EXPECTED_PROWLER_JSON_ARRAY");
    producer = "Prowler JSON CheckID/Status schema";
    rawRows = input.map((item) => {
      if (!object(item)) throw new Error("INVALID_PROWLER_ROW");
      const checkId = text(item.CheckID, "CheckID", 250);
      return {
        key: `${checkId}:${item.AWSAccountId || item.AccountId}:${item.Region}:${item.ResourceId}`,
        title: item.CheckTitle || checkId,
        account: item.AWSAccountId || item.AccountId,
        region: item.Region,
        resourceKey: item.ResourceId,
        resourceType: item.ResourceType || "unknown",
        checkId: aliases[checkId] || `external:${checkId}`,
        status: item.Status,
        observedAt: item.Timestamp || item.UpdatedAt,
        sourceLocator: `prowler:${checkId}`,
        summary: item.StatusExtended || item.Description || "Prowler 原始检查结果。",
        evidenceMode: "snapshot",
      };
    });
  } else if (format === "securityhub") {
    if (!object(input) || !Array.isArray(input.Findings)) throw new Error("EXPECTED_SECURITY_HUB_ASFF_FINDINGS");
    producer = "AWS Security Hub ASFF 2018-10-08";
    rawRows = input.Findings.flatMap((item) => {
      if (
        !object(item) ||
        item.SchemaVersion !== "2018-10-08" ||
        !Array.isArray(item.Resources) ||
        item.Resources.length > 20
      )
        throw new Error("UNSUPPORTED_ASFF_SCHEMA");
      const source = item.Compliance?.SecurityControlId || item.GeneratorId;
      return item.Resources.map((resource) => ({
        key: `${item.Id}:${resource.Id}`,
        title: item.Title || source,
        account: item.AwsAccountId,
        region: resource.Region || item.Region,
        resourceKey: resource.Id,
        resourceType: resource.Type,
        checkId: aliases[source] || `external:${text(source, "GeneratorId", 230)}`,
        status: item.Compliance?.Status || "UNKNOWN",
        observedAt: item.UpdatedAt || item.CreatedAt,
        sourceLocator: item.Id,
        summary: item.Description || "Security Hub 原始发现。",
        evidenceMode: "snapshot",
      }));
    });
  } else if (format === "github") {
    if (!object(input) || input.format !== "kelly-github-change-evidence@1" || !Array.isArray(input.changes))
      throw new Error("EXPECTED_GITHUB_CHANGE_EVIDENCE_V1");
    producer = "GitHub change evidence import v1";
    rawRows = input.changes.map((change) => {
      const merge = timestamp(change.mergedAt, "mergedAt");
      const deployed = timestamp(change.deployedAt, "deployedAt");
      const reviews = Array.isArray(change.reviews) ? change.reviews : [];
      const latest = new Map();
      for (const review of reviews) {
        const submitted = timestamp(review.submittedAt, "review.submittedAt");
        if (Date.parse(submitted) <= Date.parse(merge)) {
          const old = latest.get(review.reviewer);
          if (!old || Date.parse(old.submittedAt) < Date.parse(submitted)) latest.set(review.reviewer, review);
        }
      }
      const approved = [...latest.values()].some(
        (review) =>
          review.state === "APPROVED" &&
          review.commitId === change.commitId &&
          review.reviewer !== change.author &&
          !review.dismissed,
      );
      const tests =
        Array.isArray(change.checks) &&
        change.checks.length > 0 &&
        change.checks.every(
          (check) =>
            check.commitId === change.commitId &&
            check.conclusion === "success" &&
            iso(check.completedAt) &&
            Date.parse(check.completedAt) <= Date.parse(merge),
        );
      const correctOrder = Date.parse(merge) <= Date.parse(deployed);
      return {
        key: `${change.repository}:${change.number}:${change.commitId}`,
        title: `变更 #${change.number} · ${change.repository}`,
        provider: "github",
        account: change.organization,
        region: "global",
        resourceKey: `${change.repository}#${change.number}`,
        resourceType: "pull-request",
        checkId: "change-review",
        status: approved && tests && correctOrder ? "pass" : "fail",
        observedAt: deployed,
        evidenceMode: "period",
        coverageStart: merge,
        coverageEnd: deployed,
        sourceLocator: `${change.repository}/pull/${change.number}@${change.commitId}`,
        summary: `匹配提交的合并前有效审核：${approved}；合并前测试：${tests}；部署顺序：${correctOrder}。单个 PR 不证明整个审计期间。`,
      };
    });
  } else throw new Error("UNSUPPORTED_REPORT_FORMAT");
  if (!rawRows.length || rawRows.length > 500) throw new Error("REPORT_ROW_BUDGET_1_TO_500");
  const rows = rawRows.map(row);
  if (new Set(rows.map((item) => item.key)).size !== rows.length) throw new Error("DUPLICATE_REPORT_ROW_KEY");
  return { format: "kelly-compliance-report@1", producer, frameworkVersion, scopeVersion, sourceFormat: format, rows };
};

export const redact = (input) =>
  String(input ?? "")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[PRIVATE KEY REDACTED]")
    .replace(/\b((?:set-)?cookie\s*:)\s*[^\r\n]+/gi, "$1 [REDACTED]")
    .replace(
      /(["'][^"']*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[^"']*["']\s*:\s*)(["'])(.*?)\2/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=:-]+/gi, "[AUTHORIZATION REDACTED]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[\w-]*\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, "$1=[REDACTED]")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        (code >= 32 || code === 9 || code === 10 || code === 13) &&
        !(code >= 0x202a && code <= 0x202e) &&
        !(code >= 0x2066 && code <= 0x2069)
      );
    })
    .join("");
