# Local Model Lab Resource And Worker Contract

## Resource Map

| Resource | Type | Stable slug | Purpose | Writers | Version |
| --- | --- | --- | --- | --- | --- |
| App root | Folder | `kelly-local-model-lab` | ownership and discovery | reviewed setup CR | 1 |
| Training examples | Base | `kelly-local-model-lab-training-examples` | reviewed prompt/ideal pairs | UI/Agent CR | 1 |
| Training runs | Base | `kelly-local-model-lab-training-runs` | immutable run input, claim, heartbeat, result | trusted Worker | 1 |
| Evaluations | Base | `kelly-local-model-lab-evaluations` | locked metrics and promotion verdict | Worker/UI CR | 1 |
| Model registry | Base | `kelly-local-model-lab-model-registry` | adapter lineage and lifecycle | trusted Agent | 1 |
| Settings | Base | `kelly-local-model-lab-settings` | onboarding, defaults, gates, preferences | UI/Agent CR | 1 |
| Model Lab Files | Drive | `kelly-local-model-lab-files` | snapshots, adapters, reports, model cards | trusted Worker | 1 |

The app declaration in `content/kelly-local-model-lab-app/app/js/config.js` is
canonical for exact field names. `scripts/sync-content.mjs` derives package
sidecars from it.

## Dataset Snapshot

Export approved records into `train.jsonl`, `valid.jsonl`, and `test.jsonl` using
MLX-LM chat messages. Deduplicate before splitting and group related examples by
source, author, customer, document, or time period so near-duplicates cannot
cross into the locked test split.

The snapshot manifest records:

- source Base id and head/version cutoff;
- ordered example ids and content hashes;
- split rule and counts;
- file SHA-256 values and aggregate snapshot hash;
- export time, exporter identity, schema version, and data-use note.

Never overwrite a snapshot. A revised example produces a new snapshot and run.

## Run Lifecycle

`ready -> in_progress -> done|failed|blocked`

A claim is valid only when the run is still `ready`, its snapshot reference and
hash match, and no live claimant exists. Record claimant, attempt, claim time,
and heartbeat. A stale claim may be recovered only through a reviewed retry that
increments attempt and reuses the same run id; it must not create duplicate
registry records or artifact names.

The Worker downloads to a temporary directory, verifies every digest, evaluates
the baseline, trains, evaluates the adapter, uploads artifacts, verifies upload
references, and only then marks `done`. Errors are sanitized and keep the last
recoverable artifact reference.

## Evaluation Contract

Use deterministic decoding and the identical locked test file for baseline and
adapter. Record per-case expected output, raw completion, parsed output, schema
errors, exact fields, and latency. Training loss is diagnostic only and never a
promotion metric.

The initial `app_spec` evaluator requires exactly:

```json
{"name":"...","category":"platform","risk":"local-write","surface":["busabase"],"app_type":"action-console"}
```

Promotion is a human verdict on one adapter evaluation. It does not silently
retire the prior active model or merge unrelated ChangeRequests.

## Smoke Fixture Boundary

`training/fixture/` is checked-in test input for the local MLX pipeline. It is
not a runtime provider, is never displayed as real Busabase readiness, and must
not be uploaded or registered as a production dataset without a fresh human
review and Busabase snapshot.
