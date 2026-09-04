import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProject,
  computeMetrics,
  decisionToFields,
  milestonesWithProject,
  normalizeDecisionRow,
  normalizeProjectRow,
  projectToFields,
} from "../app/js/pmo-model.js";

test("project records round-trip through Busabase field slugs", () => {
  const project = buildProject({
    id: "prj-1",
    name: "Unified data platform",
    program: "Digital Foundation",
    status: "active",
    health: "amber",
    progress: 42,
    target_date: "2026-12-18",
  });
  const fields = projectToFields(project);
  const normalized = normalizeProjectRow(
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("-", "_"), value])),
  );
  assert.equal(normalized.id, "prj-1");
  assert.equal(normalized.name, project.name);
  assert.equal(normalized.health, "amber");
  assert.equal(normalized.progress, 42);
  assert.equal(normalized.target_date, "2026-12-18");
});

test("portfolio metrics surface active delivery and attention", () => {
  const generatedAt = "2026-09-04T09:00:00.000Z";
  const projects = [
    { id: "a", status: "active", health: "red", progress: 40, next_report_due: "2026-09-01" },
    { id: "b", status: "active", health: "green", progress: 80, next_report_due: "2026-09-05" },
    { id: "c", status: "complete", health: "green", progress: 100, next_report_due: "" },
  ];
  const milestones = [
    { status: "blocked", due_date: "2026-09-03" },
    { status: "done", due_date: "2026-09-03" },
  ];
  const risks = [
    { status: "open", impact: "high", probability: "medium" },
    { status: "closed", impact: "high", probability: "high" },
  ];
  const decisions = [{ status: "needs_review" }, { status: "approved" }];
  const metrics = computeMetrics(projects, milestones, risks, [], decisions, generatedAt);
  assert.deepEqual(metrics, {
    projects: 3,
    active: 2,
    average_progress: 60,
    red_projects: 1,
    due_milestones: 1,
    open_risks: 1,
    high_risks: 1,
    stale_reports: 1,
    decisions: 1,
    reports: 0,
  });
});

test("milestones preserve their linked project", () => {
  const rows = milestonesWithProject([{ id: "ms-1", project_id: "prj-1" }], [{ id: "prj-1", name: "Project One" }]);
  assert.equal(rows[0].project.name, "Project One");
});

test("decision record keeps stable reference and review fields", () => {
  const fields = decisionToFields({
    id: "dec-1",
    ref: 12,
    project_id: "prj-1",
    title: "Choose migration path",
    recommendation: "Stage it",
    status: "approved",
    decision_note: "Proceed",
    decided_at: "2026-09-04T09:00:00.000Z",
  });
  const row = normalizeDecisionRow(
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("-", "_"), value])),
  );
  assert.equal(row.id, "dec-1");
  assert.equal(row.ref, 12);
  assert.equal(row.status, "approved");
  assert.equal(row.decision_note, "Proceed");
});
