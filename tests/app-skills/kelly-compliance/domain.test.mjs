import assert from "node:assert/strict";
import test from "node:test";
import { AWS_READ_CATALOG, collectAws } from "../../../skills/kelly-compliance/lib/aws.mjs";
import { FRAMEWORK, normalizeReport, redact } from "../../../skills/kelly-compliance/lib/imports.mjs";

const program = {
  id: "fixture-program",
  fields: {
    title: "Synthetic SaaS",
    "service-description": "Synthetic service",
    owner: "Lab",
    accounts: "111111111111",
    regions: "us-east-1",
    "framework-version": FRAMEWORK,
    "scope-reference": "fixture:scope",
    "scope-version": 1,
    "period-start": "2026-10-01T00:00:00Z",
    "period-end": "2026-10-25T23:59:59Z",
    "assessment-type": "period",
    "onboarding-state": "complete",
  },
};
const authorization = {
  program,
  allowedAccounts: ["111111111111"],
  allowedRegions: ["us-east-1"],
  scopeReference: "fixture:scope",
  scopeVersion: 1,
  profile: "synthetic-only",
  commands: ["security-groups"],
  maxResources: 2,
  now: "2026-10-26T00:00:00Z",
};

test("the AWS adapter uses a finite read catalog, validates identity and preserves pagination gaps", async () => {
  const calls = [];
  const execAws = async (args) => {
    calls.push(args);
    return {
      code: 0,
      stdout: JSON.stringify(
        args[0] === "sts"
          ? { Account: "111111111111", Arn: "arn:aws:iam::111111111111:role/synthetic" }
          : {
              SecurityGroups: [
                {
                  GroupId: "sg-lab",
                  GroupName: "synthetic",
                  IpPermissions: [{ IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: "0.0.0.0/0" }] }],
                },
              ],
              NextToken: "synthetic-next-page",
            },
      ),
    };
  };
  const result = await collectAws(authorization, { execAws });
  assert.equal(result.readOnly, true);
  assert.equal(result.complete, false);
  assert.equal(result.report.rows.length, 1);
  assert.equal(result.report.rows[0].status, "fail");
  assert.equal(result.report.rows[0].evidenceMode, "snapshot");
  assert.ok(result.gaps.some((gap) => gap.includes("next-page")));
  for (const args of calls) {
    assert.ok(args.includes("--no-paginate") && args.includes("--no-cli-pager"));
    assert.ok(
      args[0] === "sts" ||
        Object.values(AWS_READ_CATALOG).some((entry) => entry[0] === args[0] && entry[1] === args[1]),
    );
  }
  const count = calls.length;
  for (const change of [
    { allowedAccounts: ["222222222222"] },
    { allowedRegions: ["eu-west-1"] },
    { scopeVersion: 2 },
    { commands: ["delete-bucket"] },
    { profile: "synthetic; touch /tmp/unsafe" },
  ])
    await assert.rejects(collectAws({ ...authorization, ...change }, { execAws }));
  assert.equal(calls.length, count);
  await assert.rejects(
    collectAws(authorization, {
      execAws: async () => ({ code: 0, stdout: JSON.stringify({ Account: "222222222222" }) }),
    }),
    /IDENTITY_OUTSIDE/,
  );
});

test("GitHub change evidence requires same-commit approval and tests before merge", () => {
  const change = {
    repository: "synthetic/repository",
    organization: "synthetic",
    number: 7,
    commitId: "commit-b",
    author: "author",
    mergedAt: "2026-10-20T10:00:00Z",
    deployedAt: "2026-10-20T11:00:00Z",
    reviews: [{ reviewer: "reviewer", state: "APPROVED", commitId: "commit-b", submittedAt: "2026-10-20T09:00:00Z" }],
    checks: [{ commitId: "commit-b", conclusion: "success", completedAt: "2026-10-20T09:30:00Z" }],
  };
  const normalize = (row) =>
    normalizeReport(
      { format: "kelly-github-change-evidence@1", changes: [row] },
      { format: "github", frameworkVersion: FRAMEWORK, scopeVersion: 1 },
    ).rows[0];
  assert.equal(normalize(change).status, "pass");
  assert.equal(normalize(change).coverageStart, "2026-10-20T10:00:00.000Z");
  for (const updates of [
    { reviews: [{ ...change.reviews[0], commitId: "commit-a" }] },
    { reviews: [{ ...change.reviews[0], submittedAt: "2026-10-20T10:01:00Z" }] },
    { reviews: [{ ...change.reviews[0], reviewer: "author" }] },
    {
      reviews: [
        ...change.reviews,
        { ...change.reviews[0], state: "CHANGES_REQUESTED", submittedAt: "2026-10-20T09:50:00Z" },
      ],
    },
    { checks: [{ ...change.checks[0], commitId: "commit-a" }] },
    { checks: [{ ...change.checks[0], completedAt: "2026-10-20T10:01:00Z" }] },
  ])
    assert.equal(normalize({ ...change, ...updates }).status, "fail");
});

test("source summaries redact secrets, authentication and credential-bearing URLs", () => {
  const output = redact(
    "password=synthetic-password Authorization: Bearer synthetic-bearer https://user:synthetic-credential@example.test/?token=synthetic-query\nCookie: session=synthetic-cookie",
  );
  for (const value of [
    "synthetic-password",
    "synthetic-bearer",
    "synthetic-credential",
    "synthetic-query",
    "synthetic-cookie",
  ])
    assert.ok(!output.includes(value), value);
});
