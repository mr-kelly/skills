# Resource map and workflow

The canonical declaration is `content/kelly-security-app/app/js/config.js`; regenerate package
sidecars with `node scripts/sync-content.mjs`, validate drift with `--check`. Physical slugs are
prefixed; stable keys below are stamped by installation and resolved through the SDK. Never put
deployment Space/node/Base ids in the distributed config.

| Key | Contents | Main relations | Lifecycle |
| --- | --- | --- | --- |
| hosts | Human label, trusted local SSH alias, role, authorization note, last check, latest assessment. Example rows are inert. | runs.host → hosts | Unassessed until an actual investigation; no credential fields. |
| runs | One host/task/window, fixed profile, current scope reference, batch, runner claim/heartbeat and summary. | host → hosts | requested → running → completed/partial/failed/cancelled; explicit resume creates new check attempts. |
| checks | One recipe/attempt, acquisition and assessment states, measured event times, gaps and exit status. | run → runs | pending/running/completed/permission-denied/missing-data/not-applicable/failed/cancelled. |
| evidence | Redacted excerpt, source and line/event locator, original/normalized time, confidence, collection time, raw artifact hash/reference. | check → checks | Preserved by attempt; raw payload is not stored here. |
| findings | Reasoning, severity, limitations, next step, analyst verdict/reason/time. | run → runs; evidence → evidence (multiple) | needs-review → confirmed-malicious/explained-benign/needs-investigation, with history. |
| settings | Onboarding v1, owner, scope note, local-agent execution mode and evidence policy. | — | incomplete/needs-review/complete; version mismatch is not ready. |

`record-key` on checks/evidence/findings is an idempotent acquisition identity, not user copy.
`run-reference` on checks/findings and `check-reference` on evidence are exact text indexes kept
identical to their relation ids; Busabase does not support exact value filters on relation fields.
Schema version 2 declares scalar fields first and relations last to match package installation.
`run.host`/`check.run` relations scope every operation; foreign records returned by a server whose
filter contract differs are refused. The collector's independent local alias/time/scope allowlist
is still required even when all records and ChangeRequests have landed.

Each Base has a native table View and two scenario prompts referring to this skill.
The app Folder also contains an operating guide Doc, a report Drive and the installed same-name
skill manual. `content/` is the distributable package; the app source has no duplicate datastore.

Browser reads are one page of at most 50 per requested Base/action; CR summaries are at most 20
and scoped to this app. Counts/grouped counts come from server aggregation. Deep links read a
specific missing record; they do not scan preceding pages. The checklist/line timeline are scoped
to the selected run or its loaded batch; controls say when more rows exist. Full report export is
a separately requested batch operation, with a per-resource cap and visible progress.

Browser creates and edits use the SDK's AirApp record helpers and never force review, review a CR,
merge it, read Vault, or execute SSH. The viewing user's Busabase permission decides whether a
write saves or queues; a queued write leaves canonical state unchanged. The trusted local Agent
stops before SSH if a claim/progress write is queued or conflicts. Reviewer decisions cannot
substitute for the current user's authorization to access another host.
