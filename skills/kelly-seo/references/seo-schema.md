# Kelly SEO Snapshot Schema

Use this schema for `app/.data/seo_snapshot.json` and the handoff files around it. Keep the shape stable so the local app, scripts, and the agent loop can evolve independently.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-seo",
  "range": {
    "current": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "previous": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
  },
  "metrics": {
    "site_count": 0,
    "query_count": 0,
    "page_count": 0,
    "opportunity_count": 0,
    "clicks": 0,
    "impressions": 0,
    "ctr": 0,
    "position": 0,
    "prev_clicks": 0,
    "prev_impressions": 0,
    "prev_ctr": 0,
    "prev_position": 0
  },
  "sites": [],
  "daily": [],
  "queries": [],
  "pages": [],
  "opportunities": [],
  "warnings": [],
  "ai_visibility": null,
  "geo_opportunities": [],
  "entity_signals": null
}
```

`ctr` is a fraction (0-1). `position` is the impression-weighted average position; lower is better. `prev_*` metrics cover the previous window of the same length.

The `ai_visibility`, `geo_opportunities`, and `entity_signals` fields are the GEO (Generative Engine Optimization / AI-search) half of the snapshot. They are optional so pre-GEO snapshots still validate; the validator checks their shape only when present.

## Site

```json
{
  "site_id": "stable local id",
  "property_url": "https://example-product.com/",
  "verification_type": "url_prefix|domain",
  "permission_level": "siteOwner|siteFullUser|siteRestrictedUser|unknown",
  "status": "ok|warning|error|not_configured",
  "last_sync_at": "ISO timestamp",
  "totals": { "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 },
  "previous": { "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 }
}
```

## Daily Point

One row per site per day across both windows, for the overview trend chart:

```json
{
  "date": "YYYY-MM-DD",
  "site_id": "site id",
  "clicks": 0,
  "impressions": 0,
  "ctr": 0,
  "position": 0
}
```

## Query

```json
{
  "query_id": "q-<site_id>-<slug-or-hash>",
  "site_id": "site id",
  "query": "search query text",
  "clicks": 0,
  "impressions": 0,
  "ctr": 0,
  "position": 0,
  "previous": { "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 },
  "badges": ["striking_distance", "low_ctr"],
  "top_pages": [{ "url": "https://...", "clicks": 0, "impressions": 0, "position": 0 }],
  "trend": [{ "date": "YYYY-MM-DD", "clicks": 0, "impressions": 0, "position": 0 }],
  "agent_notes": "optional agent analysis"
}
```

Badges: `striking_distance` for average position 8-15, `low_ctr` when CTR is well below the expected curve for the position. `trend` and `top_pages` may be empty when the sync did not request the extra dimensions.

## Page

```json
{
  "page_id": "p-<site_id>-<slug-or-hash>",
  "site_id": "site id",
  "url": "https://example-product.com/pricing",
  "clicks": 0,
  "impressions": 0,
  "ctr": 0,
  "position": 0,
  "previous": { "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 },
  "issues": ["canonical_mismatch", "not_indexed"],
  "top_queries": [{ "query": "text", "clicks": 0, "impressions": 0, "position": 0 }],
  "trend": [{ "date": "YYYY-MM-DD", "clicks": 0, "impressions": 0, "position": 0 }],
  "agent_notes": "optional"
}
```

## Opportunity

Agent-proposed SEO actions reviewed in `#/opportunities`. Workflow states follow the standard review model.

```json
{
  "id": "opp-<stable-id>",
  "ref": 1,
  "site_id": "site id",
  "type": "title_meta_rewrite|internal_links|content_brief|fix_page_issue",
  "title": "short human-readable action title",
  "target_page": "https://... or empty",
  "target_query": "query text or empty",
  "reason": "why this action is proposed, with metric evidence",
  "expected_impact": "estimated effect, e.g. +40 clicks/mo if CTR reaches curve",
  "draft": "editable draft: new title/meta, link plan, or content brief",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "agent_notes": "optional supporting analysis",
  "created_at": "ISO timestamp",
  "decision": {
    "action": "approve|request_changes|revise|block",
    "note": "user review note",
    "draft": "user-edited draft or null",
    "decided_at": "ISO timestamp"
  },
  "execution": {
    "status": "planned|ready_for_agent|executed|blocked|error",
    "operation": "rewrite_title|add_internal_links|create_content_brief|fix_page_issue",
    "target": "page URL or query",
    "detail": "what was or will be done",
    "executed_at": "ISO timestamp"
  }
}
```

`decision` and `execution` are `null` until they exist. `ref` is a stable per-batch number so chat can say "approve Opportunity #2".

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "site_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## AI Visibility (GEO)

Renders the `#/geo` engines × prompts matrix and the visibility trend. `null` when no GEO scan has run.

```json
{
  "brand": "invented brand name",
  "engines": ["chatgpt", "perplexity", "gemini", "claude", "copilot"],
  "score": 68,
  "prev_score": 59,
  "prompts": [
    {
      "prompt_id": "geo-<slug>",
      "prompt": "a question a user might ask an AI engine",
      "intent": "comparison|definition|how-to|alternative|...",
      "mentions": [
        {
          "engine": "chatgpt",
          "mentioned": true,
          "position": 2,
          "sentiment": "positive|neutral|negative",
          "cited_url": "https://... or empty",
          "note": ""
        }
      ],
      "trend": [{ "date": "YYYY-MM-DD", "visibility": 0.6 }]
    }
  ]
}
```

`score` (0-100) is the overall share of engine × prompt cells that cite the brand. Each prompt's `mentions` has one entry per engine; `position`/`sentiment` are `null` when `mentioned` is false. `trend.visibility` is a 0-1 share of engines mentioning us on that date.

## GEO Opportunity

Agent-proposed GEO content optimizations reviewed in `#/optimize`, gated by `geo-qa`. Same five-state workflow as SEO opportunities.

```json
{
  "id": "geo-opp-<stable-id>",
  "ref": 1,
  "type": "citable_rewrite|quotable_stats|qa_block|schema_markup",
  "title": "short human-readable action title",
  "target_page": "https://...",
  "target_prompt": "the AI-engine question this change is meant to win",
  "reason": "why this makes the page more citable, with evidence",
  "expected_impact": "estimated effect on AI-engine citations",
  "draft": "the proposed citable content / additions",
  "grounding": ["kb-style source line backing any claim in the draft"],
  "gate": {
    "verdict": "SHIP|FIX|BLOCK",
    "score": 90,
    "checks": [{ "id": "factual-grounding", "label": "Factual grounding", "result": "pass|warn|fail", "note": "..." }],
    "summary": "one-line gate summary"
  },
  "status": "needs_review|changes_requested|approved|done|blocked",
  "agent_notes": "optional supporting analysis",
  "created_at": "ISO timestamp",
  "decision": { "action": "approve|request_changes|revise|block", "note": "...", "draft": "... or null", "decided_at": "ISO" },
  "execution": { "status": "executed", "operation": "publish_geo_change", "target": "page URL", "detail": "...", "executed_at": "ISO" }
}
```

`geo-qa` (`lib/geo-qa.ts`) is a hard gate: a `BLOCK` verdict (an ungrounded/fabricated stat) forces `status: blocked` and the app rejects an approve with HTTP 422. `decision` and `execution` are `null` until they exist.

## Entity Signals (GEO)

Renders the `#/entity` readiness checklist. `null` when no entity audit has run.

```json
{
  "brand": "invented brand name",
  "score": 50,
  "signals": [
    {
      "id": "ent-<slug>",
      "label": "Wikidata entity",
      "category": "knowledge-graph|schema|consistency",
      "status": "present|partial|missing",
      "detail": "what was found",
      "fix": "agent-proposed fix when partial/missing, else empty"
    }
  ]
}
```

`score` (0-100) weights `present`=1, `partial`=0.5, `missing`=0 across the signals; it is recomputed when the user overrides a signal's status.

## Handoff Files

- `app/.data/decisions.json`: `{ "updated_at": "ISO", "decisions": { "<opportunity id>": { "action", "note", "draft", "decided_at" } } }`
- `app/.data/geo_decisions.json`: `{ "updated_at": "ISO", "decisions": { "<geo opportunity id>": { "action", "note", "draft", "decided_at" } } }` — merged onto `geo_opportunities` for `/api/state` (a `geo-qa` BLOCK still wins over an approve).
- `app/.data/entity_signals.json`: `{ "updated_at": "ISO", "signals": { "<signal id>": { "status", "note", "updated_at" } } }` — overrides folded onto `entity_signals` and the score recomputed.
- `app/.data/agent_tasks.json`: `{ "updated_at": "ISO", "tasks": [ { "id", "ref", "title", "type": "revise_opportunity", "note", "requested_at" } ] }`
- `app/.data/execution_report.json`: `{ "generated_at": "ISO", "dry_run": true, "source": "kelly-seo", "results": [ { "id", "ref", "title", "operation", "target_page", "target_query", "site_id", "status", "detail" } ] }`
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "ISO", "config_version": "1" }`
- `app/.data/agent.lock`: `{ "owner": "kelly-seo", "message": "...", "started_at": "ISO" }`

The server merges `decisions.json` and `execution_report.json` into the opportunities it returns from `/api/state`, so the UI always shows effective workflow status. The snapshot file itself stays the agent's artifact.
