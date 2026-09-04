# Kelly PMO Product Overlay

User and outcome: PMO leads and project managers keep a portfolio of programs and projects on plan, surface exceptions early, and leave every decision traceable.

App type: Operating dashboard + planner + attention queue + retrospective workspace.

Research: On demand or weekly status collection; period key is ISO week in the portfolio timezone; evidence is the latest project update, milestone movement, risk change, and decision history; repeated ingestion updates the same weekly report.

Plan: Projects and milestones are deduplicated by stable ids. Owners may adjust priority, target dates, health, and next action. Native Base views provide routine table, kanban, calendar, and gantt work; the AirApp synthesizes cross-project attention.

Action: The agent can prepare status summaries and proposed decisions. Human decisions are written to the owning Busabase record. No external message, calendar change, procurement action, or project-system mutation occurs inside the AirApp.

Retrospective: Weekly reports preserve forecast changes, decisions, lessons, and next-review dates. Improvements return as ordinary decision or milestone items rather than silently changing policy.

Human attention states: overdue milestone, blocked milestone, red/amber project, stale weekly report, decision needed, changes requested.

Agent responsibilities: normalize approved source material, upsert portfolio records idempotently, identify exceptions, draft weekly summaries and decision proposals, and re-read canonical records before any follow-up.

Product onboarding: version 2 requires portfolio name, timezone, reporting weekday, health thresholds, decision policy, resource-capacity policy, and status-freshness days in the settings Base. These fields unlock live portfolio views and status ingestion.

Native Views needed: all twelve reference tables have multiple saved native views; the project plan uses table/gallery/kanban/calendar/gantt, and supporting tables use the view types appropriate to their fields.

AirApp screens and focused actions: portfolio overview, projects list/detail, milestone plan, risk register, weekly reporting, decision queue, complete data-workspace catalog, Help & Settings.

Busabase resource map: one Folder root; sixteen focused Bases; Doc, Drive/File, Form, Whiteboard, Workflow, HTML, Skill, and AirApp supporting nodes; no Vault requirement in v2.

Delivery mode: airapp-first. The local canonical artifact is completed and tested; remote submission waits for the unavailable `$busabase` and `$busabase-app-creator` dependencies and an explicit target Space.

Guide copy in plain language: Check attention first, open the affected project, record the decision or update, then review the weekly portfolio summary.

Explicit exclusions: no external sending, scheduling, purchasing, budgeting transaction, issue-tracker mutation, automatic approval, or local-file data backend.
