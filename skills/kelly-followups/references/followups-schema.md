# Kelly Followups Schema

Use this schema when reading or writing Kelly Followups's one Busabase Base.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-followups-app/app/js/followups-model.js`,
`content/kelly-followups-app/app/js/providers/busabase-provider.js`).

## Followups (`kelly-followups-followups`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | stable domain id, required |
| `meeting` | `meeting` | text | which meeting this came out of, optional |
| `person` | `person` | text | who to follow up with, required |
| `action` | `action` | longtext | what needs doing, required |
| `due` | `due` | text | `YYYY-MM-DD`; blank means "always due today" |
| `status` | `status` | text | `pending\|done` |
| `created-at` | `created_at` | text | ISO timestamp |

## Derived, not stored

"Today" is computed at read time (`followups-model.js#isDueToday`), not a
stored flag: a pending row with no due date, or a due date on or before
today, counts as due today. A `done` row is never due, regardless of its due
date. This keeps a row's Base-side truth (`status`, `due`) as the only thing
ever written, and the "today" split always current without a background job
to recompute it.
