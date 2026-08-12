# Sales Outreach Schema

Schema v1 owns three Bases under the `kelly-sales-outreach` Folder. Field slugs
are stable API identifiers. `company-key` is a plain-text foreign key so all
three resources can be provisioned in one ChangeRequest.

## `sales-outreach-profile-v1`

One record. Required onboarding fields are `offer-name`, `offer-summary`, and
`onboarding-version >= 1`. Other fields can be proposed by the Agent and edited
by the operator.

| Slug | Type | Meaning |
| --- | --- | --- |
| `seller-name` | text | Person or brand shown in truthful collateral/copy. |
| `offer-name` | text | Product or service name. Required. |
| `offer-summary` | longtext | Problem, delivery, and outcome. Required. |
| `value-proposition` | longtext | Why the buyer should act. |
| `proof-points` | longtext | User-supplied, verifiable cases and metrics only. |
| `target-industries` | text | Current industry hypothesis. |
| `target-regions` | text | Geographic scope. |
| `buyer-roles` | text | Likely buyer/champion roles. |
| `ideal-customer` | longtext | Size, stage, pain, triggers, exclusions, uncertainty. |
| `research-channels` | text | Approved public discovery sources. |
| `collateral-file` | text | Optional filename under `collateral/`. |
| `from-email` | text | Seller's own sender address. |
| `smtp-vault-key` | text | Reference names only, never secret values. |
| `updated-at` | date | Profile materialization date. |
| `onboarding-version` | number | Completed onboarding contract version. |

## `sales-outreach-companies-v1`

One record per company and initial outreach thread.

| Slug | Type | Meaning |
| --- | --- | --- |
| `name`, `key` | text | Display name and stable deduplication key. |
| `website`, `source-url` | text | Canonical site and exact evidence page. |
| `industry`, `region`, `company-size` | text | Qualification dimensions. |
| `match-score` | number | 0-100 calibrated ICP score. |
| `match-reason` | longtext | Concrete fit and exclusions. |
| `pain-signals` | longtext | Observed buying/pain signals, not generic claims. |
| `email-subject`, `email-body` | text/longtext | One evidence-based plain-text first touch. |
| `status` | text | `draft`, `queued`, `sent`, or `opted-out`. |
| `sent-to` | text | Exact human-approved business address. |
| `approved-at`, `sent-at`, `opted-out-at` | date | Lifecycle evidence. |
| `evidence-type` | text | `first-party`, `public-directory`, `market-signal`, or blank. |
| `evidence-date` | date | Date the evidence was captured. |

Status transitions:

```text
draft --human approval--> queued --trusted sender success--> sent
draft|queued|sent --recorded request--> opted-out
```

`sent` and `opted-out` cannot return to `draft` through import. A bounced send
stays `queued` so the operator can review a different verified contact.

## `sales-outreach-leads-v1`

| Slug | Type | Meaning |
| --- | --- | --- |
| `email` | text | Valid public business email. Required. |
| `company-key` | text | Foreign key to company `key`. Required. |
| `contact-name` | text | Public name when available. |
| `role` | text | Buyer/champion/business function. |
| `source-url` | text | Exact public page containing the contact. Required. |
| `confidence` | text | `high`, `medium`, or `low`. |

Confidence describes provenance, not whether the person will reply:

- `high`: first-party company page or the person's official public page;
- `medium`: reputable public directory or event/association page;
- `low`: broad generic business inbox with a valid public source.

Do not store guessed patterns, private phone numbers, purchased-list provenance,
or credentials in this Base.

## Vault

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are Vault/runtime
requirements. Base records contain only the comma-separated reference names.
