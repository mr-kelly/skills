#!/usr/bin/env node
import { parseArgs } from "node:util";
import { AWS_READ_CATALOG, collectAws } from "../lib/aws.mjs";
import { importReport, requireOwned } from "../lib/service.mjs";
import { connectStore } from "../lib/store.mjs";
let claimedStore;
let claimedProgram;
let claimedAssessment;
let runnerId;
try {
  const { values } = parseArgs({
    options: {
      program: { type: "string" },
      profile: { type: "string" },
      assessment: { type: "string" },
      "allow-account": { type: "string", multiple: true },
      "allow-region": { type: "string", multiple: true },
      scope: { type: "string" },
      "scope-version": { type: "string" },
      "max-resources": { type: "string", default: "500" },
      command: { type: "string", multiple: true },
      apply: { type: "boolean", default: false },
    },
  });
  if (
    !values.program ||
    !values.profile ||
    !values.scope ||
    !values["scope-version"] ||
    !values["allow-account"]?.length ||
    !values["allow-region"]?.length
  )
    throw new Error(
      "USAGE: --program ID --profile LOCAL_PROFILE --allow-account ACCOUNT --allow-region REGION --scope AUTH_REFERENCE --scope-version N [--assessment ID] [--command CATALOG_KEY] [--max-resources 500] [--apply]",
    );
  const commands = values.command || Object.keys(AWS_READ_CATALOG);
  const maxResources = Number(values["max-resources"]);
  if (!values.apply)
    console.log(
      JSON.stringify(
        {
          mode: "inspect-only",
          program: values.program,
          profile: values.profile,
          accounts: values["allow-account"],
          regions: values["allow-region"],
          scope: values.scope,
          scopeVersion: Number(values["scope-version"]),
          commands,
          maxResources,
          readOnly: true,
          action:
            "--apply binds identity, runs finite read catalog and imports sanitized results; no enable/configure/remediation operations.",
        },
        null,
        2,
      ),
    );
  else {
    const store = await connectStore();
    const program = await store.get("programs", values.program);
    if (values.assessment) {
      let a = requireOwned(await store.get("assessments", values.assessment), program.id);
      if (a.fields.status !== "requested") throw new Error("ASSESSMENT_NOT_REQUESTED");
      if (
        ["scope-reference", "scope-version", "framework-version", "assessment-type", "period-start", "period-end"].some(
          (key) => a.fields[key] !== program.fields[key],
        )
      )
        throw new Error("ASSESSMENT_SCOPE_CHANGED");
      runnerId = crypto.randomUUID();
      a = await store.update("assessments", a, {
        status: "running",
        "runner-id": runnerId,
        "started-at": new Date().toISOString(),
        "heartbeat-at": new Date().toISOString(),
      });
      claimedStore = store;
      claimedProgram = program.id;
      claimedAssessment = a.id;
    }
    const beforeRead = async () => {
      if (!claimedAssessment) return;
      const a = requireOwned(await store.get("assessments", claimedAssessment), program.id);
      const fresh = await store.get("programs", program.id);
      if (a.fields.status === "cancelled") throw new Error("ASSESSMENT_CANCELLED");
      if (a.fields.status !== "running" || a.fields["runner-id"] !== runnerId)
        throw new Error("ASSESSMENT_CLAIM_CHANGED");
      if (
        [
          "scope-reference",
          "scope-version",
          "framework-version",
          "assessment-type",
          "period-start",
          "period-end",
          "accounts",
          "regions",
        ].some((key) => fresh.fields[key] !== program.fields[key])
      )
        throw new Error("PROGRAM_SCOPE_CHANGED_DURING_RUN");
      await store.update("assessments", a, { "heartbeat-at": new Date().toISOString() });
    };
    const result = await collectAws(
      {
        program,
        profile: values.profile,
        allowedAccounts: values["allow-account"],
        allowedRegions: values["allow-region"],
        scopeReference: values.scope,
        scopeVersion: Number(values["scope-version"]),
        commands,
        maxResources,
      },
      { beforeRead },
    );
    await beforeRead();
    if (!result.report.rows.length) {
      if (claimedAssessment) {
        const a = await store.get("assessments", claimedAssessment);
        await store.update("assessments", a, {
          status: "partial",
          "finished-at": new Date().toISOString(),
          "coverage-note": `没有可导入结果；缺口：${result.gaps.join("；")}`,
        });
      }
      console.log(JSON.stringify({ status: "coverage-gap", gaps: result.gaps, rows: 0 }));
    } else {
      const imported = await importReport(store, program.id, result.report, {
        assessmentId: values.assessment,
        runnerId,
      });
      if (result.gaps.length) {
        const a = await store.get("assessments", imported.assessment.id);
        if (a.fields.status !== "cancelled")
          await store.update("assessments", a, {
            status: "partial",
            "coverage-note": `${a.fields["coverage-note"]}\n本机读取缺口：${result.gaps.join("；")}`,
          });
      }
      console.log(
        JSON.stringify({
          assessmentId: imported.assessment.id,
          status: result.gaps.length ? "partial" : imported.assessment.fields.status,
          imported: imported.imported,
          gaps: result.gaps,
          readOnly: true,
        }),
      );
    }
  }
} catch (error) {
  if (claimedStore && claimedAssessment) {
    const a = await claimedStore.get("assessments", claimedAssessment);
    if (
      a.fields.status === "running" &&
      a.fields["runner-id"] === runnerId &&
      a.fields["program-reference"] === claimedProgram
    )
      await claimedStore
        .update("assessments", a, {
          status: "failed",
          "coverage-note": "本机读取中断；保留已保存的来源，请核对任务和当前授权后显式恢复。",
        })
        .catch(() => {});
  }
  console.error(error instanceof Error ? error.message : "AWS_READ_FAILED");
  process.exitCode = 1;
}
