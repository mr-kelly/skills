import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FRAMEWORK, iso, lines, programReady } from "../content/kelly-compliance-app/app/js/domain.js";
import { normalizeReport, redact } from "./imports.mjs";

const execute = promisify(execFile);
export const AWS_READ_CATALOG = Object.freeze({
  "security-groups": ["ec2", "describe-security-groups"],
  "audit-trails": ["cloudtrail", "describe-trails"],
  "security-hub": ["securityhub", "get-findings"],
  databases: ["rds", "describe-db-instances"],
});
export const execAws = async (args) => {
  try {
    const result = await execute("aws", args, {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off" },
    });
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: "", stderr: error instanceof Error ? error.message : "AWS_READ_FAILED", code: 1 };
  }
};
const safe = (value, name) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))
    throw new Error(`INVALID_AWS_${name}`);
  return value;
};

export const collectAws = async (
  {
    program,
    allowedAccounts,
    allowedRegions,
    scopeReference,
    scopeVersion,
    profile,
    commands = Object.keys(AWS_READ_CATALOG),
    maxResources = 500,
    now = new Date().toISOString(),
  },
  dependencies = {},
) => {
  if (!programReady(program)) throw new Error("PROGRAM_SCOPE_INCOMPLETE");
  const p = program.fields;
  if (p["is-example"]) throw new Error("EXAMPLE_PROGRAM_CANNOT_RUN_REAL_AWS");
  const accounts = lines(p.accounts);
  const regions = lines(p.regions);
  if (
    !Array.isArray(allowedAccounts) ||
    !Array.isArray(allowedRegions) ||
    accounts.some((account) => !allowedAccounts.includes(account)) ||
    regions.some((region) => !allowedRegions.includes(region))
  )
    throw new Error("AWS_TARGET_OUTSIDE_CURRENT_AUTHORIZATION");
  if (p["scope-reference"] !== scopeReference || p["scope-version"] !== scopeVersion)
    throw new Error("AWS_SCOPE_REFERENCE_OR_VERSION_MISMATCH");
  if (
    accounts.length > 2 ||
    regions.length > 5 ||
    !Number.isInteger(maxResources) ||
    maxResources < 1 ||
    maxResources > 500 ||
    !iso(now)
  )
    throw new Error("AWS_SCAN_BUDGET_INVALID");
  safe(profile, "PROFILE");
  regions.forEach((region) => safe(region, "REGION"));
  if (
    !Array.isArray(commands) ||
    !commands.length ||
    commands.length > Object.keys(AWS_READ_CATALOG).length ||
    new Set(commands).size !== commands.length ||
    commands.some((key) => !(key in AWS_READ_CATALOG))
  )
    throw new Error("AWS_COMMAND_OUTSIDE_READ_CATALOG");
  const call = dependencies.execAws || execAws;
  const common = ["--profile", profile, "--output", "json", "--no-cli-pager", "--no-paginate"];
  await dependencies.beforeRead?.();
  const identityResponse = await call(["sts", "get-caller-identity", ...common]);
  if (identityResponse.code) throw new Error("AWS_IDENTITY_UNAVAILABLE");
  let identity;
  try {
    identity = JSON.parse(identityResponse.stdout);
  } catch {
    throw new Error("AWS_IDENTITY_INVALID_JSON");
  }
  if (!accounts.includes(identity.Account) || !allowedAccounts.includes(identity.Account))
    throw new Error("AWS_IDENTITY_OUTSIDE_AUTHORIZATION");
  const rows = [];
  const gaps = [];
  if (accounts.some((account) => account !== identity.Account))
    gaps.push("当前 profile 只覆盖一个账户；其余已声明账户必须使用各自明确绑定的 profile 分批采集。");
  const add = (row) => {
    if (rows.length >= maxResources) {
      if (!gaps.includes("resource-budget-reached")) gaps.push("resource-budget-reached");
      return;
    }
    rows.push({
      ...row,
      provider: "aws",
      account: identity.Account,
      observedAt: row.observedAt || now,
      evidenceMode: "snapshot",
    });
  };
  for (const region of regions)
    for (const key of commands) {
      if (rows.length >= maxResources) {
        if (!gaps.includes("resource-budget-reached")) gaps.push("resource-budget-reached");
        break;
      }
      await dependencies.beforeRead?.();
      let response;
      try {
        response = await call([
          ...AWS_READ_CATALOG[key],
          "--region",
          region,
          ...common,
          ...(key === "security-hub" ? ["--max-results", "50"] : []),
        ]);
      } catch {
        gaps.push(`${region}/${key}:read-failed`);
        continue;
      }
      if (response.code) {
        gaps.push(
          `${region}/${key}:${/AccessDenied|Unauthorized/i.test(response.stderr || "") ? "permission-denied" : /not.*subscribed|not.*enabled|InvalidAccess/i.test(response.stderr || "") ? "service-not-configured" : "read-failed"}`,
        );
        continue;
      }
      let data;
      try {
        data = JSON.parse(response.stdout);
      } catch {
        gaps.push(`${region}/${key}:invalid-json`);
        continue;
      }
      if (data.NextToken || data.nextToken || data.Marker) gaps.push(`${region}/${key}:source-has-next-page`);
      if (key === "security-groups") {
        if (!Array.isArray(data.SecurityGroups)) {
          gaps.push(`${region}/${key}:unsupported-response`);
          continue;
        }
        for (const group of data.SecurityGroups) {
          const open = (group.IpPermissions || []).some((permission) => {
            const ports =
              permission.IpProtocol === "-1" ||
              [22, 3389, 5432, 3306].some((port) => permission.FromPort <= port && permission.ToPort >= port);
            return (
              ports &&
              [
                ...(permission.IpRanges || []).map((range) => range.CidrIp),
                ...(permission.Ipv6Ranges || []).map((range) => range.CidrIpv6),
              ].some((cidr) => cidr === "0.0.0.0/0" || cidr === "::/0")
            );
          });
          add({
            key: `${region}:sg:${group.GroupId}`,
            title: `安全组 ${group.GroupName || group.GroupId}`,
            region,
            resourceKey: group.GroupId,
            resourceType: "security-group",
            checkId: "network-public-admin",
            status: open ? "fail" : "pass",
            sourceLocator: `aws:ec2:describe-security-groups:${group.GroupId}`,
            summary: open
              ? "管理或数据库端口存在面向全网的入站规则；需按实际业务核对。"
              : "此已读取安全组未命中预置的全网管理/数据库端口规则；不代表完整网络隔离审计。",
          });
        }
      } else if (key === "audit-trails") {
        if (!Array.isArray(data.trailList)) {
          gaps.push(`${region}/${key}:unsupported-response`);
          continue;
        }
        if (!data.trailList.length)
          add({
            key: `${region}:trail:none`,
            title: "当前区域未返回审计 trail",
            region,
            resourceKey: `cloudtrail:${region}`,
            resourceType: "audit-trail",
            checkId: "audit-logging",
            status: "unknown",
            sourceLocator: "aws:cloudtrail:describe-trails",
            summary: "未返回 trail，尚不能推断组织/跨区域日志是否存在或缺失；未自动启用日志。",
          });
        for (const trail of data.trailList)
          add({
            key: `${region}:trail:${trail.TrailARN || trail.Name}`,
            title: `审计 trail ${trail.Name}`,
            region,
            resourceKey: trail.TrailARN || trail.Name,
            resourceType: "audit-trail",
            checkId: "audit-logging",
            status: "manual",
            sourceLocator: "aws:cloudtrail:describe-trails",
            summary: `当前返回 trail 配置；多区域=${trail.IsMultiRegionTrail === true}，日志验证=${trail.LogFileValidationEnabled === true}。本配方不声称已验证当前实际记录或历史期间。`,
          });
      } else if (key === "databases") {
        if (!Array.isArray(data.DBInstances)) {
          gaps.push(`${region}/${key}:unsupported-response`);
          continue;
        }
        for (const database of data.DBInstances)
          add({
            key: `${region}:db:${database.DBInstanceIdentifier}`,
            title: `数据库 ${database.DBInstanceIdentifier}`,
            region,
            resourceKey: database.DBInstanceArn || database.DBInstanceIdentifier,
            resourceType: "database",
            checkId: database.PubliclyAccessible ? "network-public-admin" : "storage-encryption",
            status: database.PubliclyAccessible || database.StorageEncrypted !== true ? "fail" : "pass",
            sourceLocator: "aws:rds:describe-db-instances",
            summary: `公开配置=${database.PubliclyAccessible === true}；存储加密=${database.StorageEncrypted === true}。未连接数据库或读取数据。`,
          });
      } else {
        try {
          const normalized = normalizeReport(data, {
            format: "securityhub",
            frameworkVersion: FRAMEWORK,
            scopeVersion,
          });
          for (const finding of normalized.rows) {
            if (finding.account !== identity.Account || finding.region !== region) {
              gaps.push(`${region}/security-hub:foreign-finding-rejected`);
              continue;
            }
            add(finding);
          }
        } catch {
          gaps.push(`${region}/security-hub:empty-or-unsupported-response`);
        }
      }
    }
  return {
    report: {
      format: "kelly-compliance-report@1",
      producer: "Kelly finite AWS read catalog v1",
      frameworkVersion: FRAMEWORK,
      scopeVersion,
      rows,
    },
    gaps: [...new Set(gaps)].map(redact),
    identity: { account: identity.Account, arn: redact(identity.Arn || "") },
    complete: gaps.length === 0,
    readOnly: true,
  };
};
