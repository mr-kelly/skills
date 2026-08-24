# Kelly Digital Human Schema

Use this reference when changing `kelly-digital-human`.

## Scope

`kelly-digital-human` is mostly a curated reference/comparison desk, not a
data-entry product: the project overview, personas, pipeline routes, vendor
comparison, and the QA checklist's own labels/owners/evidence are fixed
content, ported verbatim from the retired local app's demo dataset into
`content/kelly-digital-human-app/app/js/digital-human-model.js`. The retired `content/kelly-digital-human-app/server/index.ts`'s
"real" (non-demo) mode only ever read this same content from a local snapshot
file that no script ever wrote -- it always fell back to the demo shape, so
there was never a genuinely different "real" dataset to preserve.

The one genuinely dynamic piece is the human review verdict on each QA gate
check. The retired local app wrote this to a separate
`content/kelly-digital-human-app/.data/decisions.json` handoff bucket, keyed by check id. This Busabase
shape replaces that bucket with one Busabase record per decided check --
a direct field write on the decision's own row, the same pattern
`kelly-clm`'s approval queue uses. A check with no decision yet simply has no
row.

## Busabase Schema

Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-digital-human-app/app/js/providers/busabase-provider.js`,
`content/kelly-digital-human-app/app/js/digital-human-model.js`). There is no delete operation anywhere
in this skill.

### QA Decisions (`kelly-digital-human-qa-decisions`)

One row per launch-QA-check decision. Created the first time a check is
decided; updated on every later decision for the same check.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | required; one of the 8 curated check ids below |
| `action` | `action` | text | `approve` \| `request_changes` \| `block` |
| `note` | `note` | longtext | operator's review note |
| `decided-at` | `decided_at` | text | ISO timestamp, set on every decision |

## Curated Reference Content (not a Busabase resource)

`content/kelly-digital-human-app/app/js/digital-human-model.js` exports plain constants, shared verbatim
by both `providers/busabase-provider.js` and `providers/demo-provider.js`:

- `PROJECT`: name, target scene, recommended/secondary path, readiness score,
  verdict, launch goal.
- `METRICS_STATIC`: `target_latency_ms`, `current_latency_ms`,
  `lip_sync_score`, `stream_stability`. `qa_passed`/`qa_total` are NOT static
  -- `computeMetrics(checks)` derives them fresh from `QA_CHECKS`'s curated
  `status` field (replaces the retired `content/kelly-digital-human-app/server/demo.ts`'s hardcoded `6`/
  `8`, which happened to match but would go stale if the checklist changed).
- `PERSONAS`: 2 personas (`kelly-host-cn`, `brand-ip-3d`) with path,
  language, voice, look, and disclosure line.
- `PIPELINES`: 2 pipelines (`fast-2d-stream`, `custom-3d-engine`) with
  provider, input/output, latency, status, and stage list.
- `VENDORS`: 4 vendor/route comparison rows (`silicon-intelligence`,
  `tencent-zhiying`, `zego-realtime`, `ue-unity`) with integration, speed,
  control, cost, and risk.
- `QA_CHECKS`: the 8 launch QA checks (`lip-sync`, `latency`,
  `ai-disclosure`, `voice-consent`, `script-safety`, `fallback`, `privacy`,
  `mobile`) with a curated baseline `status` (`pass` or `fix`), `owner`, and
  `evidence`.
- `EVENTS`: 5 simulated stream events for the Studio view's event log.

## Decision Helpers

`content/kelly-digital-human-app/app/js/digital-human-model.js`:

- `effectiveStatus(check, decision)`: a recorded decision always wins
  (`DECISION_STATUS` maps `approve` → `approved`, `request_changes` →
  `changes_requested`, `block` → `blocked`); otherwise falls back to the
  check's curated `status` (`pass` → `approved`, anything else →
  `needs_review`). Ported verbatim from the retired `content/kelly-digital-human-app/app.js`.
- `buildDecision`/`decisionToFields`/`normalizeDecisionRow`: build, write,
  and read a decision record, mirroring `kelly-clm`'s
  `buildApproval`/`approvalToFields`/`normalizeApprovalRow`.
- `decisionsToMap(decisions)`: turns the list of Busabase decision rows into
  a sparse `check_id -> decision` map, matching the shape of the retired
  `decisions.json`'s `decisions` object.
- `buildSnapshot(checks, options)`: assembles the full snapshot object
  (`project`, `metrics`, `personas`, `pipelines`, `vendors`, `qa_checks`,
  `events`) the UI renders, merging `METRICS_STATIC` with
  `computeMetrics(checks)`.

## Demo Mode

`content/kelly-digital-human-app/app/js/providers/demo-provider.js` returns `buildSnapshot(QA_CHECKS,
...)` with an empty decisions map and a fixed `generated_at` of
`2026-07-07T09:30:00.000Z`. Matching the retired `content/kelly-digital-human-app/app.js`'s behavior, a
decision action in demo mode never applies -- it only shows the
"Demo mode: this is a read-only tour, nothing was saved." notice, so `?demo=1`
is a read-only tour rather than an interactive sandbox for this skill.
