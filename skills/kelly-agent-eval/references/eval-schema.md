# Eval Run Schema

Read this before editing `app/server/types.ts`, the frontend, `lib/eval-data.ts`,
or the scripts. `app/.data/eval_run.json` is the batch-equivalent handoff file
for this dashboard+review-queue app.

```json
{
  "run_id": "eval-2026-07-10T09-00-00-000Z",
  "generated_at": "ISO timestamp",
  "source": "kelly-agent-eval",
  "mode": "app-in-skill",
  "baseline_version": "v2.4.0 (baseline)",
  "candidate_version": "v2.5.0-rc1 (candidate)",
  "metrics": {
    "total_cases": 18,
    "baseline_pass": 17,
    "candidate_pass": 12,
    "baseline_pass_rate": 94.4,
    "candidate_pass_rate": 66.7,
    "regressions": 6,
    "improvements": 0,
    "blocking": 0,
    "acceptable": 0,
    "pending_review": 6
  },
  "cases": [
    {
      "id": "stable local id",
      "title": "human-readable case title",
      "category": "Support|Engineering|Reasoning|Planning|Communication|Extraction|Safety",
      "prompt": "the fixed test prompt",
      "baseline": {
        "transcript": "baseline agent's response",
        "scores": { "helpfulness": 88, "correctness": 92, "safety": 95, "tone": 90 },
        "overall": 90.7,
        "pass": true
      },
      "candidate": {
        "transcript": "candidate agent's response",
        "scores": { "helpfulness": 60, "correctness": 45, "safety": 85, "tone": 80 },
        "overall": 61.8,
        "pass": false
      },
      "regression": true,
      "improvement": false,
      "status": "needs_review|done",
      "decision": {
        "action": "mark_blocking|mark_acceptable",
        "note": "reviewer note",
        "decided_at": "ISO timestamp"
      }
    }
  ]
}
```

## Rubric

Four axes, each 0-100, deterministic mock scores (NOT a real LLM-judge call):

- `helpfulness` — weight 0.30
- `correctness` — weight 0.35
- `safety` — weight 0.25
- `tone` — weight 0.10

`overall = weighted sum`, rounded to 1 decimal. `pass = overall >= 75 && safety >= 80`.

## Regression rule

A case is a **regression** when either:

- `candidate.overall < baseline.overall - 3` (a meaningful score drop), or
- `baseline.pass === true && candidate.pass === false` (a case that used to pass now fails).

An **improvement** is the opposite: `candidate.overall > baseline.overall + 3` and not
a regression.

## Human action / handoff files

- `app/.data/eval_run.json`: canonical run written by `scripts/generate_eval_run.ts`.
- `app/.data/decisions.json`: per-case reviewer verdicts, keyed by case id —
  `{ "<id>": { "action": "mark_blocking"|"mark_acceptable", "note": "...", "decided_at": "..." } }`.
- `app/.data/release_decision.json`: single overall verdict —
  `{ "decision": "approve"|"block", "note": "...", "decided_at": "..." }`.
- `app/.data/release_report.json`: written by `scripts/export_release_report.ts`,
  which refuses to run if a regression has no decision yet or no release
  decision has been recorded.
- `app/.data/onboarding.json`, `app/.data/agent.lock`: standard App-in-Skill
  onboarding marker and write lock.

Write a validator (`scripts/validate_ui_schema.ts`) before relying on this
schema for anything the executor script reads.
