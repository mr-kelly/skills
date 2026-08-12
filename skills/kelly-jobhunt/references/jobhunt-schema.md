# Kelly JobHunt Schema

Authoritative field slugs, status values, and Vault keys. `app/app/js/config.js`
is the executable copy — change both together, and bump `schemaVersion` in
`config.js` and `app/resource-map.json` when a field is added or renamed.

**Current: v4.** New fields must be appended after the existing ones so the
additive migration in `resource-provisioning.js` can add them to a Base created
at v1 without touching what is already there.

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
| `job-boards` | text | no | v2. Which channels `research` should search. Free text. |
| `resume-source` | longtext | no | v2. The tidied resume text `build_resume.mjs` typesets. Blank line = new block; a line ending in a colon becomes a section heading. |
| `smtp-vault-key` | text | no | v2. Comma-separated Vault **reference names**, never values. Presence is what `mailReady` reads. |
| `onboarding-version` | number | no | v4. Positive version of the product onboarding contract that has materialized. Version 1 means all four readiness fields below were saved successfully. |

`target-role`, `highlights`, `resume-file`, and `from-email` are the four
readiness requirements. Missing any of them makes the outreach queue
unactionable, so the app names them instead of defaulting them.

Before `onboarding-version` reaches the app's current version, the browser reads
only this Profile Base and presents the onboarding gate. It must not load the
Companies or Leads Bases yet. The marker is written in the same approved change
as the four readiness fields; submitting a pending ChangeRequest is not
completion, and the app keeps the gate visible until the record materializes.

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
| `evidence-type` | text | no | `official-site` \| `aggregator` \| `business-match`. Blank when unknown — never inferred. |
| `evidence-date` | date | no | When the evidence was **captured**, not when it was imported. |

### Evidence

`match-score` says how well a company fits. It cannot say whether the role is
still open, and those are different questions. A role on the company's own
careers page is a fact; the same role on an aggregator may have closed months
ago; "their business needs this" is a hypothesis worth an email but not worth
ranking above either. So the desk sorts on evidence first and score second, and
shows the capture date as an age — `37 天前` is a decision, `2026-07-06` is
arithmetic homework.

| Value | Means |
| --- | --- |
| `official-site` | The role or the need was read on the company's own site. |
| `aggregator` | Found on a job board or aggregator. May be stale; verify before sending. |
| `business-match` | No posting; the match is a judgement about what they do. |

Blank is a legitimate value and renders as 未标注 in amber, alongside anything
older than 30 days. Both mean "look again before you send", which is exactly
what an operator needs flagged. Do not guess a type to make the badge go away.

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

## Vault keys

Written by `scripts/configure_smtp.mjs`, read only by `scripts/send_emails.mjs`.
The profile stores the reference names; no Base ever stores a value.

| Key | Kind | Notes |
| --- | --- | --- |
| `SMTP_HOST` | variable | |
| `SMTP_PORT` | variable | 465 implies implicit TLS |
| `SMTP_USER` | variable | usually the sender address itself |
| `SMTP_PASS` | secret | app password / authorization code, `access.reveal: false` |

Two things about the Vault API that are easy to get wrong:

- **`PUT /vault` replaces the whole document.** It is not an upsert. Writing
  only these four keys deletes every other item on the instance, so always read
  first and merge by key (`upsertVaultItems` in `scripts/lib.mjs`).
- **`busabase-sdk` strips the Vault from its cloud client on purpose**
  (`const { vault: _localVault, ...cloudWorkbenchRoutes }`): it is a
  local/self-hosted capability, not a Cloud API surface. The scripts call
  `/api/v1/vault` directly and treat 404/403 as "this instance has no Vault",
  falling back to `SMTP_*` environment variables rather than failing.

## Limits

- **Transport pagination is owned by the provider, never declared per Base.**
  The server caps `records.list({limit})` at 100; `research` routinely produces
  more contact addresses than that. Both the browser provider and
  `scripts/lib.mjs` follow `nextCursor` to exhaustion and guard against a
  repeating cursor. A per-Base `readLimit` is rejected by `scripts/check.mjs`.
- `bases.createBulkChangeRequest` accepts no `autoMerge`; it always produces a
  pending ChangeRequest that must be reviewed and merged explicitly.
- Only `text`, `longtext`, `number`, and `date` types are used here. Richer
  types exist but buy nothing for this schema.
