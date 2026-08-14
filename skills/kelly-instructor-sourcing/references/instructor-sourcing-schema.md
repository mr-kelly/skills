# Instructor Sourcing Schema

Schema v1 owns two Bases under the `kelly-instructor-sourcing` Folder. Field
slugs are stable API identifiers.

## `instructor-sourcing-criteria-v1`

One record. Required onboarding fields are `role-keywords` and
`qualify-threshold`. Other fields can be proposed by the Agent and edited by
the operator.

| Slug | Type | Meaning |
| --- | --- | --- |
| `role-keywords` | text | Search keywords hypothesis. Required. |
| `experience-filter` | text | Experience-level filter hypothesis. |
| `activity-filter` | text | Recency/activity filter hypothesis. |
| `endorsement-rubric` | longtext | Plain-language "what good looks like" for background endorsement. |
| `expertise-rubric` | longtext | Plain-language "what good looks like" for expertise depth/breadth. |
| `teaching-rubric` | longtext | Plain-language "what good looks like" for teaching-service ability. |
| `qualify-threshold` | number | Overall score required to mark a candidate `qualified`. Required. |
| `updated-at` | date | Last edit date. |
| `onboarding-version` | number | Completed onboarding contract version. |

## `instructor-sourcing-candidates-v1`

One record per candidate.

| Slug | Type | Meaning |
| --- | --- | --- |
| `name` | text | Candidate display name. Required. |
| `platform-headline` | text | Public profile headline shown on the sourcing platform. |
| `search-context` | text | Which keywords/filters surfaced this candidate. |
| `endorsement-score` | number | 0-100 background-endorsement axis score. |
| `expertise-score` | number | 0-100 expertise depth/breadth axis score. |
| `teaching-score` | number | 0-100 teaching-service ability axis score. |
| `overall-score` | number | Derived aggregate of the three axis scores. |
| `match-notes` | longtext | Evidence behind the scores, human-editable. |
| `status` | text | `screening`, `qualified`, `not-qualified`, or `connected`. |
| `wechat-added-at` | date | When a real-world WeChat add happened, recorded manually. |
| `logged-at` | date | When the record was finalized as `connected`. |

Status transitions:

```text
screening --human review--> qualified | not-qualified
qualified --human records real-world WeChat add--> connected
```

`not-qualified` and `connected` are terminal for status in v1: import and
review never move a record backward. A candidate must have all three axis
scores recorded before a `screening` → `qualified`/`not-qualified` decision,
and must have a recorded `wechat-added-at` before a `qualified` →
`connected` decision.

## What this schema does not cover

There is no email, phone, resume-file, or messaging-transcript field in
either Base, and no Vault requirement: v1 never sends a message, never stores
a messaging credential, and never automates contact with a candidate. Any
future graduation toward a live sourcing-platform or messaging connection
needs its own schema revision plus the platform's automation and
account-safety research this skill currently lacks.
