# Kelly Scale PPTX Schema

Use `app/.data/courseware_snapshot.json` as the canonical handoff file between the agent, scripts, and local UI.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-scale-pptx",
  "brand_profiles": [],
  "style_systems": [],
  "projects": [],
  "decks": [],
  "slide_cards": [],
  "qa_checks": [],
  "exports": [],
  "review_items": [],
  "activity_log": [],
  "warnings": [],
  "metrics": {}
}
```

## Project -> Deck -> Slide Card

- `Project`: a client/course/theme batch, such as `Nanzhi Chinese / Beginner Chinese / Animals`.
- `Deck`: one PPTX deliverable under a project. Keep `target_slide_count`, approval counts, `style_score`, `pptx_path`, and `render_path` stable.
- `SlideCard`: the storyboard unit for one PPTX page. It must include `slide_type`, `layout`, `objective`, structured `content`, `asset_brief`, `style_checks`, and `qa_flags`.

Useful slide types: `cover`, `warmup`, `vocabulary`, `dialogue`, `image_prompt`, `practice`, `game`, `summary`.

## Review Items

Review targets may be `slide`, `deck`, or `export`:

```json
{
  "review_id": "rv-slide-name",
  "ref": 1,
  "target_type": "slide",
  "target_id": "slide-name-question",
  "status": "needs_review",
  "summary": "Slide #2 needs final wording approval.",
  "suggestions": ["Shorten pinyin line"],
  "draft_note": "Please simplify the pinyin.",
  "created_at": "ISO timestamp"
}
```

Decisions live in `app/.data/decisions.json`; `request_changes` queues `revise_slide_card` or `revise_deck_plan` in `agent_tasks.json`.

## QA

`qa_checks` are evidence records from automated or human review. Use `pass`, `warn`, `fail`, or `manual`.

Before declaring a deck complete:

1. Generate/approve all slide cards.
2. Generate PPTX.
3. Render PPTX to images/PDF via the `pptx` skill workflow.
4. Add QA records for overflow, style consistency, image crop, placeholder residue, and bilingual readability.
