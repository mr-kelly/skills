# Kelly Radar Snapshot Schema

Use this schema for `app/.data/radar_snapshot.json`. Keep the shape stable so the local app, scripts, and future connectors can evolve independently. Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-radar",
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "metrics": {
    "watch_target_count": 0,
    "signal_count": 0,
    "signals_needs_review": 0,
    "questions_open": 0,
    "briefs_needs_review": 0,
    "reports_ready": 0,
    "trend_mover_count": 0,
    "opportunities_open": 0
  },
  "watchlist": [],
  "signals": [],
  "research": { "questions": [], "briefs": [], "reports": [] },
  "trends": { "movers": [], "opportunities": [] },
  "sync_log": []
}
```

## Watch Target

```json
{
  "target_id": "stable local id",
  "name": "Formora",
  "type": "competitor|category|keyword|community",
  "status": "ok|warning|stale|paused",
  "notes": "why this target is watched",
  "last_check_at": "ISO timestamp",
  "signals_7d": 0,
  "sources": [
    {
      "source_id": "stable local id",
      "kind": "pricing|changelog|landing|launch|reviews|news|hiring|community",
      "url": "public URL the agent checks",
      "method": "browser_agent|manual",
      "last_check_at": "ISO timestamp",
      "last_change_at": "ISO timestamp"
    }
  ]
}
```

Use `stale` when `last_check_at` is older than the configured cadence. `paused` targets are kept but skipped by monitoring runs.

## Signal

```json
{
  "signal_id": "stable local id",
  "target_id": "watch target id",
  "source_id": "source id on that target",
  "source_kind": "pricing|changelog|landing|launch|reviews|news|hiring|community",
  "headline": "Formora raised Pro from $12 to $15/month",
  "summary": "what changed, in 1-3 sentences",
  "why_it_matters": "agent's note on relevance and suggested angle",
  "severity": "high|medium|low",
  "detected_at": "ISO timestamp",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "proposed_action": "act|watch|ignore|needs_info",
  "handoff": {
    "operation": "handoff_content_brief|handoff_roadmap_candidate|add_watch_source|start_research",
    "target": "kelly-writer|kelly-feedback|<target_id>|<question_id>",
    "summary": "concrete next step if approved"
  },
  "diff": {
    "before_label": "Pricing page · Jun 24 crawl",
    "after_label": "Pricing page · Jul 1 crawl",
    "lines": [{ "type": "context|added|removed", "text": "Pro — $15/mo billed monthly" }]
  },
  "evidence": [{ "title": "Formora pricing page", "url": "https://…" }],
  "content_hash": "sha256 of target_id+source_id+normalized change content"
}
```

`handoff` and `diff` are optional. `content_hash` is the dedupe key: `scripts/ingest_signals.ts` skips payload signals whose hash already exists.

Triage maps onto the standard review verbs: **Act** = `approve` (queues the handoff), **Watch** = leave in `needs_review` with a note, **Ignore** = `done`, **Needs info** = `blocked` (also enqueues an agent task to collect more).

## Research Question

```json
{
  "question_id": "stable local id",
  "question": "Should we build a mobile app?",
  "status": "brief_needs_review|researching|report_ready|annotated|closed",
  "asked_at": "ISO timestamp",
  "depth": "quick|standard|deep",
  "cost_note": "rough effort estimate",
  "brief_id": "brief id or empty",
  "report_id": "report id or empty",
  "confidence": null,
  "followups": [
    { "followup_id": "id", "question": "…", "status": "queued|researching|closed", "asked_at": "ISO timestamp" }
  ]
}
```

## Research Brief

```json
{
  "brief_id": "stable local id",
  "question_id": "question id",
  "status": "needs_review|approved|changes_requested|blocked",
  "drafted_at": "ISO timestamp",
  "depth": "quick|standard|deep",
  "scope": "what is in and out of scope",
  "planned_sources": ["source descriptions"],
  "expected_deliverable": "what the report will contain",
  "notes": "optional"
}
```

The agent drafts the brief first; research starts only after Kelly approves it. Brief verdicts use the standard verbs: `approve`, `request_changes` (agent revises, brief returns to `needs_review`), `block`.

## Research Report

```json
{
  "report_id": "stable local id",
  "question_id": "question id",
  "title": "report title",
  "filed_at": "ISO timestamp",
  "summary": "executive summary",
  "confidence": 4,
  "sections": [
    { "section_id": "id", "heading": "1. …", "body": "…", "source_ids": ["src-1"] }
  ],
  "sources": [
    { "source_id": "src-1", "title": "…", "url": "https://… or local://…", "accessed_at": "ISO timestamp" }
  ],
  "annotations": [
    { "annotation_id": "id", "author": "Kelly", "at": "ISO timestamp", "section_id": "id", "text": "…" }
  ]
}
```

Citation rule enforced by `scripts/file_report.ts`: every `sections[].source_ids` entry must resolve to a `sources[].source_id`, and every source needs a non-empty `title` and `url`. `confidence` is Kelly's 0-5 rating, set through the app.

## Trend Mover

```json
{
  "mover_id": "stable local id",
  "keyword": "ai form builder",
  "source": "search|community|category",
  "volume_proxy": 9200,
  "delta_pct": 64,
  "momentum": [34, 38, 45, 52, 58, 71, 84, 100],
  "first_seen": "YYYY-MM-DD",
  "last_updated": "ISO timestamp",
  "opportunity_id": "linked opportunity id or empty"
}
```

`volume_proxy` is a relative measure (search volume estimate, upvotes, mentions), not an absolute truth. `momentum` is a small series for the sparkline, oldest first. Dedupe key for `scripts/ingest_trends.ts` is `keyword` + `source`.

## Opportunity

```json
{
  "opportunity_id": "stable local id",
  "title": "Own the 'ai form builder' comparison surface",
  "mover_ids": ["mover ids"],
  "status": "needs_review|approved|done|blocked",
  "created_at": "ISO timestamp",
  "rationale": "why this is worth acting on now",
  "proposed_next_step": {
    "operation": "handoff_content_brief|handoff_roadmap_candidate",
    "target": "kelly-writer|kelly-feedback",
    "summary": "concrete deliverable"
  }
}
```

## Companion Files

- `app/.data/decisions.json`: `{ "updated_at": "ISO", "decisions": { "<item_id>": { "kind": "signal|brief|opportunity|report", "action": "approve|watch|ignore|block|request_changes", "status": "derived workflow status", "comment": "", "confidence": 4, "decided_at": "ISO" } } }`
- `app/.data/agent_tasks.json`: `{ "updated_at": "ISO", "tasks": [{ "task_id": "", "kind": "revise_brief|collect_more_evidence|research_followup|…", "ref_id": "item id", "note": "", "created_at": "ISO", "status": "queued|in_progress|done" }] }`
- `app/.data/execution_report.json`: written by `scripts/execute_decisions.ts`; one entry per approved item with `operation`, `target`, `dry_run`, and `status`.
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "ISO", "config_version": "1" }`
- `app/.data/agent.lock`: `{ "owner": "kelly-radar", "message": "…", "started_at": "ISO" }` — the app rejects decision writes and the ingest scripts refuse to run while it exists.

## Sync Log Entry

```json
{ "at": "ISO timestamp", "actor": "kelly-radar-agent", "action": "ingest_signals|ingest_trends|file_report|execute_decisions", "detail": "short human-readable result" }
```
