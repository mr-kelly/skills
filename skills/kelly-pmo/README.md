# Kelly PMO

Kelly PMO is a Busabase-backed project portfolio cockpit for PMO leads and project managers. It maps every table in the reference PM database, adds governance tables, and preserves the native Busabase views that make each table useful.

## What It Shows

- Portfolio overview with active-project progress, red projects, decisions, and approaching milestones.
- Project list/detail with program, owner, sponsor, target, budget, progress, risks, milestones, and latest report.
- Milestone plan, risk register, ISO-week status report feed, and stable `Decision #N` review queue.
- Twelve source-aligned business tables plus milestones, risks, decisions, and settings: 16 Bases in total.
- Saved table, gallery, kanban, calendar, and gantt views, synchronized idempotently after Base creation.
- Supporting Doc, Drive/File, Form, Whiteboard, Workflow, HTML, Skill, and AirApp node contracts.
- Responsive English/Chinese operator UI with a desktop sidebar and true phone list/detail flow.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly PMO portfolio overview"></td>
    <td width="50%"><img src="assets/screenshots/workspace.webp" alt="Kelly PMO complete data workspace"></td>
  </tr>
  <tr>
    <td><strong>Portfolio pulse</strong><br>Delivery health and human attention across the active portfolio.</td>
    <td><strong>Complete data workspace</strong><br>Twelve source-aligned tables, native views, fields, and supporting nodes.</td>
  </tr>
  <tr>
    <td><img src="assets/screenshots/projects.webp" alt="Kelly PMO project detail"></td>
    <td><img src="assets/screenshots/milestones.webp" alt="Kelly PMO milestone plan"></td>
  </tr>
  <tr>
    <td><strong>Project control</strong><br>Ownership, progress, milestones, risks, and the latest report in one split view.</td>
    <td><strong>Milestone plan</strong><br>Portfolio-wide delivery gates, due dates, progress, and evidence.</td>
  </tr>
  <tr>
    <td><img src="assets/screenshots/decisions.webp" alt="Kelly PMO decision queue"></td>
    <td><img src="assets/screenshots/mobile-workspace.webp" alt="Kelly PMO mobile workspace"></td>
  </tr>
  <tr>
    <td><strong>Decision queue</strong><br>Reviewable recommendations with stable references and explicit verdicts.</td>
    <td><strong>Phone workspace</strong><br>The complete data model remains navigable on a narrow screen.</td>
  </tr>
</table>

## Canonical App

The complete AirApp source lives in `content/kelly-pmo-app/`. Normal delivery is AirApp-first. A local server is started only for an explicitly requested preview or for automated acceptance.

```bash
pnpm --dir skills/kelly-pmo/content/kelly-pmo-app check
```

Deterministic demo routes include `?demo=overview#/overview`, `?demo=projects#/projects`, `?demo=workspace#/workspace/projects`, `?demo=reports#/reports`, and `?demo=decisions#/decisions`. Add `&lang=zh` for Chinese chrome and localized demo content.

The OSS extreme suite covers all 11 creatable Busabase node types, all five native view types, 18 field types, 1,000-record idempotent bulk writes, cursor pagination, grep, and restart persistence.

## Boundary

The AirApp reads and writes only its own Busabase records. It never sends a message, changes a calendar, purchases anything, moves money, or mutates an external project system. Any such follow-up requires a separate trusted skill and explicit authorization.
