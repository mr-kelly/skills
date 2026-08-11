# Kelly JobHunt Schema

Authoritative field slugs and status values. `app/app/js/config.js` is the
executable copy — change both together, and bump `schemaVersion` in
`config.js` and `app/resource-map.json` when a field is added or renamed.

Browser code reads fields in snake_case (`match_score`) because the provider
normalizes `-` to `_` on read. Writes use the real kebab-case slugs
(`match-score`). Getting this backwards silently writes a new field instead of
updating the intended one.

## `jobhunt-profile-v1` — 求职档案

Exactly one row. Its primary field is `name`, so the row's display title in
Busabase is the job seeker's name.

| Slug | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | text | yes | Primary field. |
| `target-role` | text | yes | The main search keyword. |
| `locations` | text | no | Free text, comma or slash separated. |
| `industries` | text | no | Free text. |
| `highlights` | longtext | no | Quoted by the drafted emails. |
| `resume-file` | text | no | File name only. The PDF lives in `resume/`. |
| `from-email` | text | no | Sender address used by `send_emails.mjs`. |
| `updated-at` | date | no | |

`target-role`, `highlights`, `resume-file`, and `from-email` are the four
readiness requirements. Missing any of them makes the outreach queue
unactionable, so the app names them instead of defaulting them.

## `jobhunt-companies-v1` — 目标公司

One row per company. This is the unit of outreach and the unit of state.

| Slug | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | text | yes | Primary field. |
| `key` | text | yes | Stable domain key; `jobhunt-leads-v1.company-key` points at it. |
| `website` | text | no | |
| `source-url` | text | no | Where the company was found. |
| `industry` | text | no | |
| `match-score` | number | no | 0-100. Sorts the list; never a decision by itself. |
| `match-reason` | longtext | no | Concrete evidence, not a compliment. |
| `email-subject` | text | no | Editable in the app before approval. |
| `email-body` | longtext | no | Plain text. Editable before approval. |
| `status` | text | no | `draft` \| `queued` \| `sent`. Defaults to `draft`. |
| `sent-to` | text | no | The address actually used, written at approval. |
| `approved-at` | date | no | Written by the app. |
| `sent-at` | date | no | Written by `send_emails.mjs`. |

### Status transitions

```
draft ──(operator approves in the app)──> queued ──(send_emails.mjs --apply)──> sent
  ^                                          |
  └──────────── stays queued on SMTP failure ┘
```

`draft` is the only editable state. `queued` and `sent` render read-only so a
letter cannot be rewritten after the operator committed to it. A failed send
deliberately leaves the row `queued` rather than reverting to `draft`, so the
operator sees it in 已发送 and can retry with another address from the pool.

## `jobhunt-leads-v1` — 联系邮箱

Several rows per company. A pool of candidate addresses, not a send list.

| Slug | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | text | yes | Primary field. |
| `company-key` | text | yes | Plain text foreign key into `jobhunt-companies-v1.key`. |
| `role` | text | no | `HR 邮箱` / `招聘通用` / a named department / `通用`. |
| `source-url` | text | no | Where the address was published. Required in practice — an address with no source is a guess. |
| `confidence` | text | no | `high` \| `medium` \| `low`. Defaults to `medium`. |

Address selection: the highest-confidence address wins, except that a company
which already has `sent-to` keeps that address so the record of what was
actually sent stays truthful even if a better address is discovered later.

## Limits

- Every `readLimit` must stay ≤ 100. The Busabase server rejects
  `records.list({limit})` above 100 with `Input validation failed — limit: Too
  big`, and neither unit tests nor demo mode will catch it.
- `bases.createBulkChangeRequest` accepts no `autoMerge`; it always produces a
  pending ChangeRequest that must be reviewed and merged explicitly.
- Only `text`, `longtext`, `number`, and `date` types are used here. Richer
  types exist but buy nothing for this schema.
