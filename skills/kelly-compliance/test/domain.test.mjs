import assert from "node:assert/strict";
import test from "node:test";
import {
  FRAMEWORK,
  controlReadiness,
  evaluateEvidence,
  exceptionState,
} from "../content/kelly-compliance-app/app/js/domain.js";
import { collectAws } from "../lib/aws.mjs";
import { normalizeReport } from "../lib/imports.mjs";
const now = "2026-10-25T12:00:00Z";
const program = {
  id: "p",
  fields: {
    title: "SaaS",
    owner: "Owner",
    "service-description": "Production",
    accounts: "111111111111",
    regions: "us-east-1",
    "scope-reference": "AUTH",
    "scope-version": 1,
    "framework-version": FRAMEWORK,
    "onboarding-state": "complete",
    "assessment-type": "period",
    "period-start": "2026-07-01T00:00:00Z",
    "period-end": "2026-09-30T00:00:00Z",
  },
};
const control = {
  id: "c",
  fields: {
    program: ["p"],
    "program-reference": "p",
    "control-key": "backups",
    "framework-version": FRAMEWORK,
    "coverage-mode": "period",
    "design-state": "designed",
    "mapped-checks": "backup-recovery,restore-test",
    "evidence-requirements": "backup-recovery,restore-test",
  },
};
const evidence = (id, check) => ({
  id,
  fields: {
    program: ["p"],
    "program-reference": "p",
    "framework-version": FRAMEWORK,
    "scope-version": 1,
    "scope-reference": "AUTH",
    account: "111111111111",
    region: "us-east-1",
    "resource-key": "prod",
    "check-id": check,
    "requirement-key": check,
    "observed-at": "2026-09-30T00:00:00Z",
    "collected-at": "2026-10-24T00:00:00Z",
    "coverage-start": "2026-07-01T00:00:00Z",
    "coverage-end": "2026-09-30T00:00:00Z",
    "evidence-mode": "period",
    "technical-result": "pass",
    "source-locator": "private:index",
    sha256: "a".repeat(64),
  },
});
const link = (e) => ({
  id: `l-${e.id}`,
  fields: {
    program: ["p"],
    "program-reference": "p",
    control: ["c"],
    "control-reference": "c",
    evidence: [e.id],
    "evidence-reference": e.id,
    "review-state": "accepted",
    "review-note": "Actual account, resource and historic full-period records reviewed.",
    reviewer: "Owner",
  },
});
test("backup operation evidence cannot stand in for restore evidence; independent dimensions can support", () => {
  const backup = evidence("backup", "backup-recovery");
  const restore = evidence("restore", "restore-test");
  assert.notEqual(controlReadiness(program, control, [backup], [link(backup)], now).state, "supported");
  assert.equal(
    controlReadiness(program, control, [backup, restore], [link(backup), link(restore)], now).state,
    "supported",
  );
});
test("history may be collected late; impossible chronology and foreign account are rejected", () => {
  const e = evidence("e", "backup-recovery");
  assert.equal(evaluateEvidence(program, control, e, link(e), now).state, "supported");
  assert.equal(
    evaluateEvidence(program, control, { ...e, fields: { ...e.fields, account: "222222222222" } }, link(e), now).state,
    "mismatch",
  );
  assert.equal(
    evaluateEvidence(
      program,
      control,
      { ...e, fields: { ...e.fields, "collected-at": "2026-08-01T00:00:00Z" } },
      link(e),
      now,
    ).state,
    "insufficient",
  );
  assert.equal(
    evaluateEvidence(program, control, { ...e, fields: { ...e.fields, "evidence-mode": "snapshot" } }, link(e), now)
      .state,
    "insufficient",
  );
});
test("exception expiry never changes original technical failure", () => {
  const e = evidence("fail", "backup-recovery");
  e.fields["technical-result"] = "fail";
  assert.equal(evaluateEvidence(program, control, e, link(e), now).state, "fail");
  assert.equal(
    exceptionState({ fields: { status: "accepted", "expires-at": "2026-10-24T00:00:00Z" } }, now),
    "expired",
  );
});
test("normalized rows retain explicit source time and reject changed mapping version", () => {
  const input = {
    format: "kelly-compliance-report@1",
    producer: "Synthetic",
    frameworkVersion: FRAMEWORK,
    scopeVersion: 1,
    rows: [
      {
        key: "k",
        title: "test",
        account: "111111111111",
        region: "us-east-1",
        resourceKey: "sg",
        checkId: "network-public-admin",
        status: "fail",
        observedAt: "2026-09-30T00:00:00Z",
        sourceLocator: "fixture:k",
      },
    ],
  };
  assert.equal(normalizeReport(input).rows[0].status, "fail");
  assert.throws(() => normalizeReport({ ...input, scopeVersion: 2 }), /MISMATCH/);
});
test("AWS caller identity binds before catalog reads; missing permissions stay gaps", async () => {
  const calls = [];
  const execAws = async (args) => {
    calls.push(args);
    return args[0] === "sts"
      ? { code: 0, stdout: JSON.stringify({ Account: "111111111111", Arn: "arn:test" }), stderr: "" }
      : { code: 1, stdout: "", stderr: "AccessDenied" };
  };
  const result = await collectAws(
    {
      program,
      allowedAccounts: ["111111111111"],
      allowedRegions: ["us-east-1"],
      scopeReference: "AUTH",
      scopeVersion: 1,
      profile: "authorized",
      commands: ["security-groups"],
      now,
    },
    { execAws },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "sts");
  assert.equal(result.report.rows.length, 0);
  assert.match(result.gaps[0], /permission-denied/);
  assert.equal(result.complete, false);
  await assert.rejects(
    () =>
      collectAws(
        {
          program,
          allowedAccounts: ["wrong"],
          allowedRegions: ["us-east-1"],
          scopeReference: "AUTH",
          scopeVersion: 1,
          profile: "authorized",
          now,
        },
        { execAws },
      ),
    /AUTHORIZATION/,
  );
  assert.equal(calls.length, 2);
});
