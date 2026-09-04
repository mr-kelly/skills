---
name: kelly-pmo
description: Project portfolio management office App-in-Skill for programs, projects, milestones, risks, weekly status reports, ownership, delivery health, and reviewable cross-project decisions. Use when the user invokes $kelly-pmo or /kelly-pmo, asks for PMO, 项目管理办公室, 项目群, 项目组合, 项目台账, 项目计划, 进度汇报, 里程碑, RAID/risk register, portfolio health, cross-project dependencies, stale status reports, or a decision-focused project cockpit.
license: MIT
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: kelly-pmo
    resources:
      - programs
      - project-teams
      - projects
      - reports
      - special-tasks
      - communications
      - resources
      - functional-groups
      - glossary
      - testing
      - requirements
      - iterations
      - milestones
      - risks
      - decisions
      - settings
    risk: local-write
---

# Kelly PMO

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly PMO portfolio overview"></td>
    <td width="50%"><img src="assets/screenshots/workspace.webp" alt="Kelly PMO complete data workspace"></td>
  </tr>
  <tr>
    <td><strong>Portfolio pulse</strong><br>Delivery health, approaching commitments, stale reports, and named decisions in one attention-first view.</td>
    <td><strong>Complete data workspace</strong><br>All twelve source-aligned business tables, record counts, fields, five native view types, and supporting nodes.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/projects.webp" alt="Kelly PMO project list and detail"></td>
    <td width="50%"><img src="assets/screenshots/milestones.webp" alt="Kelly PMO milestone plan"></td>
  </tr>
  <tr>
    <td><strong>Project control</strong><br>List/detail workspace connecting ownership, progress, dates, milestones, risks, and the latest weekly report.</td>
    <td><strong>Milestone plan</strong><br>Due-date pressure, evidence, progress, and close/reopen actions across the portfolio.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/decisions.webp" alt="Kelly PMO decision queue"></td>
    <td width="50%"><img src="assets/screenshots/mobile-workspace.webp" alt="Kelly PMO mobile data workspace"></td>
  </tr>
  <tr>
    <td><strong>Decision queue</strong><br>Stable Decision references with recommendation, review note, approve, request-changes, and block verdicts.</td>
    <td><strong>Phone workspace</strong><br>The same multi-table resource map and saved views in a dedicated, non-shrunken mobile detail flow.</td>
  </tr>
</table>

## Overview

Use this skill as Kelly's project portfolio cockpit. It gives PMO leads and
project managers one calm place to see program health, project ownership,
milestone pressure, open risks, weekly reporting freshness, and decisions that
need a named human verdict.

The source image defines twelve first-class business tables: Project Groups,
Project Teams, Project Plans, Status Reports, Special Tasks, Communication
Plans, Human Resources, Functional Groups, Glossary, Testing, Requirements, and
Iterations. Milestones, Risks, Decisions, and Settings complete the governance
model. Routine row work stays in native Busabase table, gallery, kanban,
calendar, and gantt Views; the AirApp synthesizes what needs attention across
projects and provides a searchable map of the complete workspace.

Default behavior is AirApp-first. Start
`pnpm --dir content/kelly-pmo-app dev` only when local preview or debugging is
explicitly requested. Demo mode is an explicit, read-only UI fixture and never
represents a successful Busabase connection.

## Mandatory Dependencies

1. Read and follow `$kelly-app-skill-creator` for product behavior, responsive
   UI, onboarding, review semantics, and the canonical app artifact.
2. Read and follow `$busabase` for connection, target Space, discovery,
   ChangeRequests, review, and merge.
3. Read and follow `$busabase-app-creator` for resource modeling, AirApp runtime,
   SDK, security, validation, sync, and deployment.
4. Run `$kelly-app-skill-creator-tests` for local, responsive, OSS, Cloud, and
   AirApp acceptance as available.

If either Busabase dependency is unavailable, preserve the local package and
stop before remote provisioning, sync, deployment, or merge. Never invent a
second data backend.

## Product Loop

### Research

Collect or receive project updates on demand or weekly. The reporting period key
is an ISO week in the configured portfolio timezone. Re-running the same period
updates the same report rather than creating a duplicate. Preserve the submitted
time, health, progress, accomplishments, next-period plan, blockers, and
decisions needed.

### Plan

Maintain stable project and milestone ids. Use native Busabase Views for routine
project tables, status kanban, milestone calendar/gantt, and risk registers. The
AirApp provides cross-project prioritization, attention, and project detail.

### Action

Human actions in the AirApp are limited to creating/updating project planning
records, closing/reopening a milestone, and recording a decision verdict on the
reviewed decision row. Every write uses Busabase ChangeRequests. No browser code
sends messages, changes calendars, purchases anything, moves money, or mutates an
external project system.

### Retrospective

Weekly reports preserve forecast movement, decisions, blockers, and lessons.
Any process improvement becomes an ordinary future decision or milestone with an
owner and review date; one outcome never silently rewrites portfolio policy.

## Resource Map

All resources live below one application Folder, `kelly-pmo`, and are declared
in `content/kelly-pmo-app/app/js/config.js` plus the template sidecars under
`content/`.

| Resource | Type | Stable slug | Purpose | Writers | Mutation path | Version |
| --- | --- | --- | --- | --- | --- | --- |
| App root | Folder | `kelly-pmo` | Ownership and discovery | reviewed setup | ChangeRequest | 2 |
| 12 reference tables | Base | `kelly-pmo-<key>` | The twelve business areas visible in the source image | operator/agent/native Views | record CR | 2 |
| Milestones / Risks | Base | `kelly-pmo-milestones`, `kelly-pmo-risks` | Delivery gates and RAID governance | operator/agent | record CR | 2 |
| Decisions / Settings | Base | `kelly-pmo-decisions`, `kelly-pmo-settings` | Review verdicts and versioned operating policy | operator/agent | record CR | 2 |
| Playbook | Doc | `kelly-pmo-playbook` | Long-form PMO operating policy | operator/agent | node content CR | 2 |
| Files | Drive/File | `kelly-pmo-files` | Source packs, evidence, exports, and attachments | trusted process | file CR | 2 |
| Intake | Form | `kelly-pmo-status-form` | Review-first weekly status intake | operator | form submission CR | 2 |
| Dependency map | Whiteboard | `kelly-pmo-dependency-map` | Cross-project dependency map | operator/agent | node content CR | 2 |
| Weekly workflow | Workflow | `kelly-pmo-weekly-workflow` | Reporting process graph | trusted operator | node content CR | 2 |
| Wallboard | HTML | `kelly-pmo-wallboard` | Read-only portfolio display artifact | trusted operator | node content CR | 2 |
| Operator instructions | Skill | `kelly-pmo-operator` | PMO-specific agent procedure | reviewed sync | file CR | 2 |
| AirApp | AirApp | `kelly-pmo-app` | Cross-resource synthesis and focused commands | reviewed sync | ChangeRequest | 2 |

`references/native-views.json` is the complete native-view declaration. The
current `busabase-package@1` format carries table views only; the trusted,
idempotent `scripts/sync-native-views.mjs` materializes gallery, kanban,
calendar, and gantt views after the Bases exist. Do not flatten those views into
the AirApp or pretend the package format installed them.

## Onboarding

Onboarding contract version `2` requires:

- `portfolio-name` in Settings;
- `timezone` in Settings;
- `reporting-weekday` in Settings;
- `decision-policy` in Settings.
- `resource-capacity-policy` in Settings;
- `status-freshness-days` in Settings.

The Settings row has `record-id: portfolio`, `onboarding-version`,
`onboarding-status`, and `completed-at`. These fields unlock live status
ingestion and portfolio actions only after the materialized record validates.
Version mismatch enters `needs_review`; omission never counts as complete.

## AirApp Views

- `#/overview`: portfolio pulse, human-attention list, active/average/red/decision
  metrics, program health, and approaching milestones.
- `#/projects` and `#/projects/<id>`: desktop list/detail workspace and separate
  phone panes with project owner, sponsor, target, budget, progress, milestones,
  risks, and latest report.
- `#/projects/new`: focused project form. It creates one project record and no
  hidden downstream work.
- `#/milestones`: due-date plan with progress and close/reopen action.
- `#/risks`: risk cards linked to the project, owner, probability, impact,
  mitigation, and next review.
- `#/reports`: weekly status feed, one row per project and ISO period key.
- `#/decisions`: stable `Decision #N` queue with approve, request-changes, block,
  and review note. A domain approval does not merge unrelated ChangeRequests.
- `#/workspace` and `#/workspace/<base-key>`: the twelve source-image tables,
  their record counts, field types, saved native views, and supporting node map.
- `#/settings`: responsive Help & Settings panel with guide, portfolio policy,
  onboarding version, and sanitized connection mode.

Demo routes use `?demo=overview`, `?demo=projects`, `?demo=milestones`,
`?demo=risks`, `?demo=reports`, `?demo=decisions`, or `?demo=workspace`. Add `lang=en` or `lang=zh`
for deterministic localized chrome and meaningful localized demo content.

## Agent Workflow

1. Confirm the target Busabase Space before inspecting or mutating resources.
2. If onboarding is incomplete, gather the six required portfolio settings one
   question at a time and materialize the Settings record through a reviewed
   ChangeRequest.
3. Normalize approved project source material into stable project, milestone,
   risk, report, and decision ids. Keep source documents outside committed files.
4. Upsert one report per `project-id + period-key`; repeated ingestion must not
   duplicate it.
5. Surface red/amber projects, blocked/at-risk milestones, high risks, stale
   reports, and `needs_review` decisions.
6. For changes requested, preserve the note, produce a revised proposal linked
   to the same decision, and return it to `needs_review` without erasing history.
7. Re-read the canonical record and version before any trusted follow-up. This
   skill itself performs no external follow-up.

## Busabase Extreme Test

`tests/app-skills/kelly-pmo/busabase-extreme.test.mjs` creates a disposable OSS
Busabase instance and isolated Folder. It exercises every currently creatable
node type (`folder`, `base`, `skill`, `drive`, `airapp`, `file`, `doc`, `form`,
`whiteboard`, `workflow`, `html`), all five native view types, eighteen field
types, a 1,000-record idempotent bulk write, cursor pagination, unified grep,
and full restart persistence. It also locks in the observed compatibility limit:
SDK 0.30.1 calls content nodes `nodes` in unified grep while Busabase 0.16.2
still accepts `docs`; the test proves the mismatch and uses the server-native
request for coverage rather than hiding it.

## Safety

- Keep persistent configuration, records, decisions, and claims in Busabase.
- Treat portfolio budgets, schedules, staffing, and status narratives as
  sensitive. Do not commit real source material or credentials.
- Scope every ChangeRequest query to this application's resource ids and the
  intended record. Never merge a Space-wide list.
- Reject stale edits through record/base commit versions.
- Do not mark a milestone done until its defined outcome/evidence exists.
- Do not infer runtime from hostname or iframe state. Use the injected runtime
  endpoint and the canonical local gateway.
- Never expose OAuth tokens, API keys, cookies, or Vault values to browser state,
  logs, demos, or screenshots.

## Completion Criteria

Finish only when the canonical `content/kelly-pmo-app/` project and package
sidecars agree; app checks and unit tests pass; desktop 1280x820 and phone
390x844/360x740 flows have no page overflow; the drawer, project detail/back,
decision action, settings panel, and hash history work; OSS provisioning and
persistence pass; and Cloud/AirApp suites are either passed or explicitly
reported unavailable.
