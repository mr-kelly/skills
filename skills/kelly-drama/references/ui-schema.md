# Kelly Drama UI Schema

The app stores one canonical file at `app/.data/project.json`.

## Top Level

```json
{
  "project_id": "stable id",
  "updated_at": "ISO timestamp",
  "series": {},
  "characters": [],
  "relationships": [],
  "episodes": [],
  "shots": [],
  "tasks": []
}
```

## Series

Required fields: `title`, `logline`, `genre`, `platform`, `format`, `tone`, `audience`, `hook_rules`, `world_rules`.

`hook_rules` and `world_rules` are arrays of short strings.

## Character

Required fields:

- `id`: stable id such as `char-lin-wan`.
- `name`
- `role`: protagonist, antagonist, love_interest, family, rival, helper, etc.
- `actor_profile`: casting and performance notes.
- `character_card`: motivation, wound, secret, arc, voice, status.
- `visual`: `front`, `side`, `back`, `wardrobe`, `anchors`, `forbidden_drift`.
- `status`: draft, needs_review, approved.

## Relationship

Required fields: `id`, `from`, `to`, `type`, `public_status`, `hidden_truth`, `power_dynamic`, `emotional_temperature`, `conflict`, `evidence`.

`from` and `to` must reference character ids. `evidence` may contain episode ids or freeform notes.

## Episode

Required fields: `id`, `number`, `title`, `promise`, `a_plot`, `b_plot`, `beats`, `cliffhanger`, `status`.

Each beat should include `id`, `label`, `hook`, `conflict`, `turn`, `emotion`, `canon_update`, `characters`.

`characters` should reference character ids where possible.

## Shot

Required fields: `id`, `episode_id`, `beat_id`, `title`, `characters`, `composition`, `camera`, `setting`, `lighting`, `prompt`, `negative_prompt`, `status`.

`episode_id` references an episode. `beat_id` should reference a beat in that episode. `characters` should reference character ids.

## Task

Tasks are optional. Use them for agent work or human attention:

```json
{
  "id": "task-001",
  "kind": "character|relationship|episode|shot|export",
  "target_id": "char-lin-wan",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "title": "short task title",
  "note": "human or agent note"
}
```
