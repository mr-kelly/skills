import assert from "node:assert/strict";
import test from "node:test";
import {
  FRAMEWORK,
  controlReadiness,
  evaluateEvidence,
  exceptionState,
} from "../../../skills/kelly-compliance/content/kelly-compliance-app/app/js/domain.js";
import {
  addEvidence,
  createException,
  importReport,
  initializeControls,
  resolveIssue,
  reviewEvidenceLink,
} from "../../../skills/kelly-compliance/lib/service.mjs";
import { eq, startOss } from "../security-suite-harness/oss.mjs";

const now = "2026-10-26T12:00:00Z";
const normalized = (rows, scopeVersion = 1) => ({
  format: "kelly-compliance-report@1",
  producer: "Synthetic isolated source",
  frameworkVersion: FRAMEWORK,
  scopeVersion,
  rows,
});
const source = (changes = {}) => ({
  key: "sg-1",
  title: "Synthetic public SSH",
  provider: "aws",
  account: "111111111111",
  region: "us-east-1",
  resourceKey: "sg-test",
  resourceType: "security-group",
  checkId: "network-public-admin",
  status: "fail",
  observedAt: "2026-10-25T10:00:00Z",
  evidenceMode: "snapshot",
  sourceLocator: "fixture:sg-1",
  summary: "Synthetic public admin ingress; token=synthetic-source-secret",
  ...changes,
});

test(
  "Compliance installs, preserves provenance and reviews actual OSS evidence without audit-pass inflation",
  { timeout: 300000 },
  async (t) => {
    const lab = await startOss(t, "kelly-compliance");
    const program = await lab.store.create(
      "programs",
      {
        title: "Synthetic outbound SaaS",
        "record-key": "acceptance:program",
        "service-description": "A synthetic single-account SaaS used only for local acceptance",
        owner: "Lab owner",
        accounts: "111111111111",
        regions: "us-east-1",
        "framework-version": FRAMEWORK,
        "assessment-type": "period",
        "period-start": "2026-10-01T00:00:00Z",
        "period-end": "2026-10-25T23:59:59Z",
        "scope-reference": "fixture:saas-scope-v1",
        "scope-version": 1,
        "onboarding-state": "complete",
        "is-example": false,
      },
      "compliance-acceptance-program",
    );
    const controls = await initializeControls(lab.store, program.id);
    assert.equal(controls.length, 8);
    assert.deepEqual(
      (await initializeControls(lab.store, program.id)).map((row) => row.id),
      controls.map((row) => row.id),
    );
    const network = controls.find((row) => row.fields["control-key"] === "network");
    const operations = controls.find((row) => row.fields["control-key"] === "operations");
    let firstImport;

    await t.test("foreign account, region and stale mapping versions cause no new assessment", async () => {
      for (const row of [source({ account: "222222222222" }), source({ region: "eu-west-1" })])
        await assert.rejects(importReport(lab.store, program.id, normalized([row])), /OUTSIDE/);
      await assert.rejects(importReport(lab.store, program.id, normalized([source()], 2)), /MISMATCH/);
      assert.equal(
        (await lab.store.page("assessments", { valueFilters: eq("program-reference", program.id) })).records.length,
        0,
      );
    });

    await t.test("an import is idempotent, relations are real and source failures need human review", async () => {
      const input = normalized([
        source(),
        source({
          key: "audit-1",
          resourceKey: "trail-test",
          resourceType: "audit-trail",
          checkId: "audit-logging",
          status: "pass",
          summary: "A current logging snapshot cannot cover the audit period.",
        }),
        source({
          key: "unmapped",
          resourceKey: "unknown-test",
          checkId: "external:vendor-specific-check",
          status: "unknown",
        }),
      ]);
      firstImport = await importReport(lab.store, program.id, input, { collectedAt: now });
      assert.equal(firstImport.assessment.fields.status, "partial");
      const again = await importReport(lab.store, program.id, input, { collectedAt: now });
      assert.equal(again.assessment.id, firstImport.assessment.id);
      assert.equal(again.reused, true);
      const evidence = (await lab.store.page("evidence", { valueFilters: eq("program-reference", program.id) }))
        .records;
      const links = (await lab.store.page("evidence-links", { valueFilters: eq("program-reference", program.id) }))
        .records;
      const issues = (await lab.store.page("issues", { valueFilters: eq("program-reference", program.id) })).records;
      assert.equal(evidence.length, 3);
      assert.equal(links.length, 2);
      assert.ok(issues.some((row) => row.fields["issue-kind"] === "technical"));
      for (const row of [...evidence, ...links, ...issues]) {
        assert.equal(row.fields["program-reference"], program.id);
        assert.equal(row.fields.program, program.id);
        assert.equal(row.fields.assessment, firstImport.assessment.id);
        assert.ok(!JSON.stringify(row.fields).includes("synthetic-source-secret"));
      }
      assert.ok(links.every((row) => row.fields["review-state"] === "pending"));
      const logEvidence = evidence.find(
        (row) => row.fields["source-locator"] === "fixture:sg-1" && row.fields["technical-result"] === "pass",
      );
      const logLink = links.find((row) => row.fields["evidence-reference"] === logEvidence.id);
      assert.equal(evaluateEvidence(program, operations, logEvidence, logLink, now).state, "insufficient");
      await assert.rejects(
        reviewEvidenceLink(lab.store, program.id, logLink.id, {
          verdict: "accepted",
          note: "Current configuration only",
          reviewer: "Lab reviewer",
          now,
        }),
        /NOT_ACCEPTABLE/,
      );
      assert.equal(controlReadiness(program, operations, evidence, links, now).state, "insufficient");
    });

    await t.test("manual evidence needs a real interval, per-link review and matching scope versions", async () => {
      const input = {
        title: "Synthetic audit-log operation history",
        sourceLocator: "fixture:logging-history",
        summary: "Synthetic daily logging observations",
        observedAt: "2026-10-25T23:59:59Z",
        collectedAt: now,
        evidenceMode: "period",
        technicalResult: "manual",
        coverageStart: "2026-10-01T00:00:00Z",
        coverageEnd: "2026-10-25T23:59:59Z",
        account: "111111111111",
        region: "us-east-1",
        resourceKey: "trail-test",
        checkId: "audit-logging",
        requirementKey: "audit-logging",
      };
      await assert.rejects(
        addEvidence(lab.store, program.id, operations.id, { ...input, coverageEnd: undefined }),
        /INTERVAL/,
      );
      const { evidence, link } = await addEvidence(lab.store, program.id, operations.id, input);
      assert.equal(evaluateEvidence(program, operations, evidence, link, now).state, "pending");
      await assert.rejects(
        reviewEvidenceLink(lab.store, program.id, link.id, {
          verdict: "accepted",
          note: "",
          reviewer: "Lab reviewer",
          now,
        }),
        /REQUIRED/,
      );
      const accepted = await reviewEvidenceLink(lab.store, program.id, link.id, {
        verdict: "accepted",
        note: "Reviewed actual source coverage for this exact logging control",
        reviewer: "Lab reviewer",
        now,
      });
      assert.equal(evaluateEvidence(program, operations, evidence, accepted, now).state, "supported");
      const changed = { ...program, fields: { ...program.fields, "scope-version": 2 } };
      assert.equal(evaluateEvidence(changed, operations, evidence, accepted, now).state, "mismatch");
      for (const fields of [
        { account: "222222222222" },
        { region: "eu-west-1" },
        { "scope-reference": "fixture:other-scope" },
      ])
        assert.equal(
          evaluateEvidence(
            program,
            operations,
            { ...evidence, fields: { ...evidence.fields, ...fields } },
            accepted,
            now,
          ).state,
          "mismatch",
        );
      assert.equal(
        evaluateEvidence(
          program,
          operations,
          { ...evidence, fields: { ...evidence.fields, "retention-until": "2026-10-26T00:00:00Z" } },
          accepted,
          now,
        ).state,
        "expired",
      );
      assert.notEqual(
        evaluateEvidence(
          program,
          operations,
          { ...evidence, fields: { ...evidence.fields, "coverage-end": "2026-11-01T00:00:00Z" } },
          accepted,
          now,
        ).state,
        "supported",
      );
      const readiness = controlReadiness(program, operations, [evidence], [accepted], now);
      assert.notEqual(
        readiness.state,
        "supported",
        "Logging evidence alone does not prove incident or vulnerability response",
      );
      assert.equal(readiness.dimensions.find((dimension) => dimension.key === "audit-logging").state, "supported");
      assert.ok(readiness.dimensions.some((dimension) => dimension.state !== "supported"));
    });

    await t.test("risk acceptance expires and cannot change the technical failure or close the issue", async () => {
      const issue = (
        await lab.store.page("issues", {
          valueFilters: [...eq("program-reference", program.id), ...eq("issue-kind", "technical")],
        })
      ).records[0];
      const failed = (
        await lab.store.page("evidence", {
          valueFilters: [...eq("program-reference", program.id), ...eq("technical-result", "fail")],
        })
      ).records[0];
      const link = (await lab.store.page("evidence-links", { valueFilters: eq("evidence-reference", failed.id) }))
        .records[0];
      await assert.rejects(
        createException(lab.store, program.id, network.id, {
          reason: "",
          compensatingControls: "Synthetic restricted VPN",
          acceptedBy: "Lab owner",
          expiresAt: "2026-11-01T00:00:00Z",
          now,
        }),
        /REQUIRES/,
      );
      const exception = await createException(lab.store, program.id, network.id, {
        reason: "Temporary synthetic lab exception",
        compensatingControls: "Synthetic restricted VPN",
        acceptedBy: "Lab owner",
        expiresAt: "2026-11-01T00:00:00Z",
        issueId: issue.id,
        now,
      });
      assert.equal(exceptionState(exception, now), "accepted");
      assert.equal(exceptionState(exception, "2026-11-02T00:00:00Z"), "expired");
      assert.equal(evaluateEvidence(program, network, failed, link, now).state, "fail");
      await assert.rejects(
        resolveIssue(lab.store, program.id, issue.id, {
          evidenceId: failed.id,
          linkId: link.id,
          note: "Risk accepted",
          now,
        }),
        /NOT_SUPPORTING/,
      );
      assert.equal((await lab.store.get("issues", issue.id)).fields.status, "open");
    });

    await t.test("period fragments count only their actual intervals and cannot hide a one-day gap", async () => {
      const people = controls.find((row) => row.fields["control-key"] === "people");
      const evidenceRows = [];
      const links = [];
      const fragment = async (key, start, end) => {
        const result = await addEvidence(lab.store, program.id, people.id, {
          key,
          title: `Synthetic personnel execution ${key}`,
          sourceLocator: `fixture:people-${key}`,
          summary: "Synthetic personnel records for exactly this interval",
          observedAt: "2026-10-25T23:59:59Z",
          collectedAt: now,
          evidenceMode: "period",
          technicalResult: "manual",
          coverageStart: start,
          coverageEnd: end,
          account: "111111111111",
          region: "us-east-1",
          resourceKey: "synthetic-staff-population",
          checkId: "people-policy",
          requirementKey: "people-policy",
        });
        const accepted = await reviewEvidenceLink(lab.store, program.id, result.link.id, {
          verdict: "accepted",
          note: "Verified synthetic source for the stated period only",
          reviewer: "Lab reviewer",
          now,
        });
        evidenceRows.push(result.evidence);
        links.push(accepted);
      };
      await fragment("first", "2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z");
      await fragment("last", "2026-10-11T00:00:00Z", "2026-10-25T23:59:59Z");
      assert.equal(controlReadiness(program, people, evidenceRows, links, now).state, "partial");
      await fragment("bridge", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z");
      assert.equal(controlReadiness(program, people, evidenceRows, links, now).state, "supported");
    });

    await t.test("only newer matching resource/check evidence supersedes a historical failure", async () => {
      const issue = (
        await lab.store.page("issues", {
          valueFilters: [...eq("program-reference", program.id), ...eq("issue-kind", "technical")],
        })
      ).records[0];
      const input = {
        title: "Synthetic network remediation verification",
        sourceLocator: "fixture:network-remediation",
        summary: "Explicit repeat of the same check after the synthetic change",
        observedAt: "2026-10-25T20:00:00Z",
        collectedAt: now,
        evidenceMode: "snapshot",
        technicalResult: "pass",
        account: "111111111111",
        region: "us-east-1",
        resourceKey: "different-resource",
        checkId: "network-public-admin",
        requirementKey: "network-public-admin",
      };
      const unrelated = await addEvidence(lab.store, program.id, network.id, input);
      await reviewEvidenceLink(lab.store, program.id, unrelated.link.id, {
        verdict: "accepted",
        note: "Verified this different test resource",
        reviewer: "Lab reviewer",
        now,
      });
      await assert.rejects(
        resolveIssue(lab.store, program.id, issue.id, {
          evidenceId: unrelated.evidence.id,
          linkId: unrelated.link.id,
          note: "Unrelated asset",
          now,
        }),
        /MISMATCH/,
      );
      const matching = await addEvidence(lab.store, program.id, network.id, {
        ...input,
        resourceKey: "sg-test",
        sourceLocator: "fixture:network-remediation-sg-test",
      });
      await reviewEvidenceLink(lab.store, program.id, matching.link.id, {
        verdict: "accepted",
        note: "Verified this exact check and resource after the original observation",
        reviewer: "Lab reviewer",
        now,
      });
      const closed = await resolveIssue(lab.store, program.id, issue.id, {
        evidenceId: matching.evidence.id,
        linkId: matching.link.id,
        note: "Verified exact resource and check against newer evidence",
        now,
      });
      assert.equal(closed.fields.status, "closed");
      const evidence = (await lab.store.page("evidence", { valueFilters: eq("program-reference", program.id) }))
        .records;
      const links = (await lab.store.page("evidence-links", { valueFilters: eq("program-reference", program.id) }))
        .records;
      const readiness = controlReadiness(program, network, evidence, links, now);
      assert.notEqual(
        readiness.state,
        "supported",
        "One network check does not cover storage-public and storage-encryption dimensions",
      );
      assert.equal(
        readiness.dimensions.find((dimension) => dimension.key === "network-public-admin").state,
        "supported",
      );
      assert.ok(
        evidence.some((row) => row.fields["technical-result"] === "fail"),
        "Historical source failure remains available",
      );
    });

    await t.test("claims, cancellation and explicit resumption preserve bounded import progress", async () => {
      const input = normalized([
        source({ key: "lifecycle-a", checkId: "external:lifecycle", status: "unknown" }),
        source({ key: "lifecycle-b", checkId: "external:lifecycle", status: "unknown" }),
      ]);
      let assessmentId;
      let evidenceWrites = 0;
      const interrupted = {
        ...lab.store,
        update: async (key, row, fields) => {
          const saved = await lab.store.update(key, row, fields);
          if (key === "assessments" && fields.status === "running") assessmentId = saved.id;
          return saved;
        },
        create: async (key, fields, idempotencyKey) => {
          if (key === "evidence" && ++evidenceWrites === 2) throw new Error("SYNTHETIC_IMPORT_INTERRUPTION");
          return lab.store.create(key, fields, idempotencyKey);
        },
      };
      await assert.rejects(
        importReport(interrupted, program.id, input, { collectedAt: now }),
        /SYNTHETIC_IMPORT_INTERRUPTION/,
      );
      assert.equal((await lab.store.get("assessments", assessmentId)).fields.status, "failed");
      await assert.rejects(
        importReport(lab.store, program.id, input, { assessmentId, collectedAt: now }),
        /EXPLICIT_RESUME/,
      );
      const before = (await lab.store.page("evidence", { valueFilters: eq("assessment-reference", assessmentId) }))
        .records;
      assert.equal(before.length, 1);
      await importReport(lab.store, program.id, input, { assessmentId, collectedAt: now, resume: true });
      const after = (await lab.store.page("evidence", { valueFilters: eq("assessment-reference", assessmentId) }))
        .records;
      assert.equal(after.length, 2);
      assert.ok(after.some((row) => row.id === before[0].id && row.fields.sha256 === before[0].fields.sha256));
      await lab.store.update("assessments", await lab.store.get("assessments", assessmentId), {
        status: "running",
        "runner-id": "other-live-runner",
        "heartbeat-at": new Date().toISOString(),
      });
      await assert.rejects(
        importReport(lab.store, program.id, input, {
          assessmentId,
          collectedAt: now,
          resume: true,
          runnerId: "new-runner",
        }),
        /ALREADY_RUNNING/,
      );
      await assert.rejects(
        importReport(lab.store, program.id, normalized([source({ key: "replacement-source" })]), {
          assessmentId,
          collectedAt: now,
          resume: true,
        }),
        /DIGEST_CHANGED/,
      );

      const cancelInput = normalized(input.rows.map((row) => ({ ...row, key: `cancel-${row.key}` })));
      let cancelId;
      let cancelled = false;
      const cancelling = {
        ...lab.store,
        create: async (key, fields, idempotencyKey) => {
          const saved = await lab.store.create(key, fields, idempotencyKey);
          if (key === "resources" && !cancelled) {
            cancelled = true;
            cancelId = fields["assessment-reference"];
            await lab.store.update("assessments", await lab.store.get("assessments", cancelId), {
              status: "cancelled",
            });
          }
          return saved;
        },
      };
      const result = await importReport(cancelling, program.id, cancelInput, { collectedAt: now });
      assert.equal(result.cancelled, true);
      assert.equal(
        (await lab.store.page("resources", { valueFilters: eq("assessment-reference", cancelId) })).records.length,
        1,
      );
      assert.equal(
        (await lab.store.page("evidence", { valueFilters: eq("assessment-reference", cancelId) })).records.length,
        1,
      );

      const pendingInput = normalized(input.rows.map((row) => ({ ...row, key: `pending-${row.key}` })));
      let pendingId;
      const pending = {
        ...lab.store,
        update: async (key, row, fields) => {
          if (key === "assessments" && fields.status === "running") {
            pendingId = row.id;
            throw new Error("WRITE_PENDING");
          }
          return lab.store.update(key, row, fields);
        },
      };
      await assert.rejects(importReport(pending, program.id, pendingInput, { collectedAt: now }), /WRITE_PENDING/);
      assert.equal(
        (await lab.store.page("resources", { valueFilters: eq("assessment-reference", pendingId) })).records.length,
        0,
      );
    });

    await t.test("a real new server retains imported source hashes and review state", async () => {
      const before = (await lab.store.page("evidence", { valueFilters: eq("program-reference", program.id) })).records;
      const firstPage = await lab.store.page("evidence", {
        valueFilters: eq("program-reference", program.id),
        limit: 2,
      });
      assert.equal(firstPage.records.length, 2);
      assert.ok(firstPage.nextCursor);
      const secondPage = await lab.store.page("evidence", {
        valueFilters: eq("program-reference", program.id),
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      assert.equal(secondPage.records.length, 2);
      assert.ok(
        secondPage.records.every(
          (row) =>
            row.fields["program-reference"] === program.id && !firstPage.records.some((first) => first.id === row.id),
        ),
      );
      const connected = await lab.restart();
      const after = (await connected.page("evidence", { valueFilters: eq("program-reference", program.id) })).records;
      assert.deepEqual(
        after.map((row) => [row.id, row.fields.sha256]),
        before.map((row) => [row.id, row.fields.sha256]),
      );
      assert.equal((await connected.get("assessments", firstImport.assessment.id)).fields.status, "partial");
    });
  },
);
