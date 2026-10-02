# Kelly Ideas Schema

Use this schema when reading or writing Kelly Ideas's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-ideas-app/app/js/ideas-model.js`,
`content/kelly-ideas-app/app/js/providers/busabase-provider.js`).

## Ideas (`kelly-ideas-ideas`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | stable domain id, required |
| `title` | `title` | text | required |
| `one-liner` | `one_liner` | text | required to leave the `idea` rung |
| `problem` | `problem` | longtext | required to leave the `brd` rung |
| `who` | `who` | text | required to leave the `idea` rung |
| `why-now` | `why_now` | longtext | required to leave the `brd` rung |
| `stage` | `stage` | text | `idea\|brd\|mrd\|prd` |
| `status` | `status` | text | free text; `已搁置` marks it parked |
| `clarity` | `clarity` | number | **derived at read time, not trusted from the row** — see `ideas-model.js#clarityFor` |
| `open-questions` | `open_questions` | number | derived; count of open questions on this idea |
| `source` | `source` | text | where the idea came from |
| `tags` | `tags` | text | JSON array or comma-separated |
| `agent-next-action` | `agent_next_action` | longtext | |
| `notes` | `notes` | longtext | |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Documents (`kelly-ideas-documents`)

One row per idea per kind — at most three per idea (`brd`, `mrd`, `prd`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | stable domain id, required |
| `idea-id` | `idea_id` | text | required |
| `kind` | `kind` | text | `brd\|mrd\|prd` |
| `title` | `title` | text | |
| `body` | `body` | longtext | markdown |
| `status` | `status` | text | e.g. `草稿` / `已完善` |
| `version` | `version` | number | |
| `gaps` | `gaps` | longtext | JSON array of blocking document omissions; non-blocking assumptions and validation backlog stay in the document body |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Questions (`kelly-ideas-questions`)

The consultant's questions and the operator's answers — one row per question.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | stable domain id, required |
| `idea-id` | `idea_id` | text | required |
| `stage` | `stage` | text | which rung this question gates |
| `question` | `question` | longtext | required |
| `why-asking` | `why_asking` | longtext | shown under the question in the UI |
| `answer` | `answer` | longtext | |
| `status` | `status` | text | **derived from `answer`, not trusted from the row** — see `ideas-model.js#normalizeQuestionRow`: a non-empty answer is always `answered`, `skipped` stays `skipped`, everything else is `open` |
| `position` | `position` | number | display order within an idea+stage |
| `asked-at` | `asked_at` | text | ISO timestamp |
| `answered-at` | `answered_at` | text | ISO timestamp |

## The Ladder Gate

`advanceCheck` in `ideas-model.js` is the one hard rule and it is re-derived
from stored state on every advance, never trusted from the caller:

- `idea` → `brd` requires `one_liner` and `who` non-blank.
- `brd` → `mrd` requires `problem` and `why_now` non-blank.
- `mrd` → `prd` and `prd` → (terminal) have no required idea fields — MRD/PRD
  content lives in `documents`, not on the idea row.
- At every rung, no question with that `stage` may still be `open`.
- A `已搁置` idea never advances, regardless of the above.

## Settings (`kelly-ideas-settings`)

One row per `kind`, looked up by `record-id`. Used for operator profile,
language, accent, and the agent lock, following the same shape as other
App-in-Skills in this fleet.
