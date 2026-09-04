# Kelly PMO Schema

`content/kelly-pmo-app/app/js/config.js` is the canonical machine-readable resource declaration. `scripts/sync-content.mjs` derives the package sidecars from it; do not maintain a second field list here.

## Stable Ids

- Project: `prj-<stable-source-id>`
- Milestone: `ms-<stable-source-id>`
- Risk: `risk-<stable-source-id>`
- Report: `rpt-<project-id>-<ISO-week>`
- Decision: `dec-<stable-source-id>` plus a stable numeric `ref`
- Settings: one row with `record-id: portfolio`

Agent ingestion must upsert reports by `project-id + period-key`, preserve the reviewed decision version, and never create a duplicate when the same approved source is processed twice.

## Business Tables

The v2 workspace contains sixteen Bases. The first twelve directly mirror the
reference PM database: `programs`, `project-teams`, `projects`, `reports`,
`special-tasks`, `communications`, `resources`, `functional-groups`, `glossary`,
`testing`, `requirements`, and `iterations`. `milestones`, `risks`, `decisions`,
and `settings` add delivery governance.

Every business table declares multiple saved native views where its fields
support them. `projects` carries all five types: table, gallery, kanban,
calendar, and gantt. See `native-views.json`; run
`scripts/sync-native-views.mjs --apply` only through a trusted connection after
the Bases materialize.

## Lifecycles

- Project: `proposed | planning | active | paused | complete`
- Health: `green | amber | red`
- Milestone: `not_started | in_progress | at_risk | blocked | done`
- Risk: `open | mitigating | accepted | closed`
- Decision: `needs_review | changes_requested | approved | blocked | done`

Decision actions map as `approve -> approved`, `changes -> changes_requested`, and `block -> blocked`. The human note, decider identity when available, and decision time remain on the same reviewed record. A domain approval never authorizes merging an unrelated Busabase ChangeRequest.

## Derived Signals

The browser derives active count, average loaded progress, red count, approaching milestones, open/high risks, stale reports, and decisions needing review. Exact global row counts come from `records.count`; the app never loops over every page to manufacture a global aggregate.

## Onboarding

Version 2 requires `portfolio-name`, `timezone`, `reporting-weekday`,
`decision-policy`, `resource-capacity-policy`, and `status-freshness-days` on the
Settings row. `onboarding-version: 2` and `onboarding-status: complete` are valid
only after the materialized record has all six fields. A mismatch returns to
review rather than silently accepting stale policy.

## Compatibility Limits

`busabase-package@1` in Busabase 0.16.2 serializes table views only even though
the live API supports gallery, kanban, calendar, and gantt. Package sidecars
therefore contain their table view and the trusted native-view synchronizer
materializes the remaining view types. The isolated extreme suite also records
the unified-grep naming mismatch between Busabase 0.16.2 (`docs`) and
`busabase-sdk` 0.30.1 (`nodes`).

On a fresh OSS data directory, `/api/health` can answer before the initial
PGlite migration has committed the Vault tables. Integration callers therefore
probe a real workspace route after health rather than treating health alone as
database readiness.
