# Kelly Local Model Lab

A Busabase-backed App-in-Skill for curating model-training data, queuing local
Apple Silicon fine-tunes, comparing locked baseline and adapter evaluations, and
registering approved LoRA adapters.

The AirApp is the review and control surface. MLX-LM runs only in a trusted local
Worker on the operator's Mac. Busabase remains the source of truth for examples,
runs, metrics, decisions, and artifact references; Drive/File holds immutable
snapshots, adapters, and reports.

## Views

- **Overview**: dataset readiness, local-run attention, pipeline, and latest gain.
- **Dataset**: list/detail review queue with stable ids, provenance, and verdicts.
- **Training runs**: exact base revision, snapshot hash, config, claim, heartbeat,
  terminal result, and artifact references.
- **Evaluations**: baseline versus adapter on locked cases with promotion verdicts.
- **Model registry**: active/candidate/retired adapters and complete lineage.

`?demo=1` is deterministic and in-memory only. It does not connect to Busabase or
claim that a model was trained. The bundled fixture exists only to smoke-test the
local MLX path.
