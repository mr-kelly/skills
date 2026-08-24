# Kelly CLM Notes

Use this reference when changing `kelly-clm`.

## Scope

`kelly-clm` is intentionally light. It is a contract operations tracker:

- contract repository
- lifecycle stage
- owner assignment
- renewal and notice dates
- obligations and milestones
- simple approval/reminder queue
- direct handoff decisions written onto the record itself

Do not turn it into a legal redline or clause-playbook product. Use `kelly-legal-contracts` for detailed legal review.

## Product Research Signals

Mainstream CLM products converge on a few stable patterns:

- **Ironclad**: request-to-contract workflows, approvals, execution, repository, and insights. Sources: <https://ironcladapp.com/> and <https://ironcladapp.com/journal/contract-management/contract-lifecycle-management>.
- **Icertis**: contract intelligence, obligation tracking, risk metadata, and business-system connections. Sources: <https://www.icertis.com/> and <https://www.icertis.com/products/platform/>.
- **Agiloft**: configurable CLM workflows, obligation management, milestones, renewals, and no-code process control. Sources: <https://www.agiloft.com/introduction-contract-lifecycle-management/> and <https://www.agiloft.com/best-practices-for-contract-lifecycle-management-clm/>.
- **DocuSign CLM**: workflow automation, document generation, repository, and e-signature adjacency. Sources: <https://www.docusign.com/products/clm> and <https://www.docusign.com/resources/solution-briefs/docusign-clm-datasheet>.

## Implementation Rule

Keep the app safer and simpler than SaaS CLM:

- The browser UI may create/edit contracts and write direct decisions
  (mark obligation done, acknowledge a renewal notice, approve/request
  changes/block an approval reminder) straight onto Busabase records.
- The browser UI must not update remote systems, initiate signature,
  contact counterparties, or mark a legal approval as complete outside the
  direct Busabase write.
- Demo screenshots must not contain private counterparties, prices, or
  contract text.

## Busabase Schema

Use this schema when reading or writing Kelly CLM's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`content/kelly-clm-app/app/js/providers/busabase-provider.js`, `content/kelly-clm-app/app/js/clm-model.js`).
There is no delete operation anywhere in this skill.

### Contracts (`kelly-clm-contracts`)

One row per contract. Created/edited directly by the operator through the browser.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `contract-id` | `contract_id` (app: `id`) | text | stable domain id, required, e.g. `ct-a1b2c3d4` |
| `name` | `name` | text | contract name |
| `counterparty` | `counterparty` | text | |
| `type` | `type` | text | e.g. `MSA`, `DPA`, `SOW`, `NDA` |
| `stage` | `stage` | text | `intake` \| `review` \| `negotiation` \| `approval` \| `signature_ready` \| `active` \| `renewal` \| `closed` |
| `owner` | `owner` | text | legal/ops owner |
| `business-owner` | `business_owner` | text | business-side owner |
| `value` | `value` | text | free-form value/price description |
| `start-date` | `start_date` | text | ISO date |
| `end-date` | `end_date` | text | ISO date |
| `renewal-date` | `renewal_date` | text | ISO date, optional |
| `notice-deadline` | `notice_deadline` | text | ISO date, optional |
| `notice-acknowledged-at` | `notice_acknowledged_at` | text | ISO timestamp, set by the Renewals view's Acknowledge action |
| `next-action` | `next_action` | longtext | |
| `risk` | `risk` | text | `low` \| `medium` \| `high` |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp, set on every edit |

### Obligations (`kelly-clm-obligations`)

One row per contract obligation/milestone. Obligations enter Busabase
through an external process (the operator or an agent workflow adding them
directly in Busabase) — the browser only ever decides `status` (mark
done/reopen), it never creates an obligation row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `obligation-id` | `obligation_id` (app: `id`) | text | stable domain id, required, e.g. `obl-a1b2c3d4` |
| `contract-id` | `contract_id` | text | FK to `contracts.contract-id` |
| `title` | `title` | text | |
| `owner` | `owner` | text | |
| `due-date` | `due_date` | text | ISO date |
| `status` | `status` | text | `open` \| `at_risk` \| `blocked` \| `done` |
| `evidence` | `evidence` | longtext | |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp, set on every status change |

### Approvals (`kelly-clm-approvals`)

One row per approval/reminder handoff linked to a contract. Like
obligations, approval rows enter Busabase externally; the browser only
records the decision.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `approval-id` | `approval_id` (app: `id`) | text | stable domain id, required, e.g. `ap-a1b2c3d4` |
| `contract-id` | `contract_id` | text | FK to `contracts.contract-id` |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `status` | `status` | text | `needs_review` \| `approved` \| `changes_requested` \| `blocked` |
| `decision-note` | `decision_note` | longtext | operator's note, written with the decision |
| `decided-at` | `decided_at` | text | ISO timestamp, set whenever `status` changes |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

Decision actions map to `status` as: `approve` → `approved`, `changes` →
`changes_requested`, `block` → `blocked`.

## Computed Rollups (never stored)

`content/kelly-clm-app/app/js/clm-model.js`'s `computeMetrics(contracts, obligations,
approvals, now)`, shared by the live Busabase read path and the offline
`?demo=1` dataset:

- `metrics.contracts`: `contracts.length`.
- `metrics.renewals_90d`: contracts whose `renewal_date` or
  `notice_deadline` falls within 90 days of `now` (`isRenewalDueSoon`,
  matching the retired `config.example.json`'s `alerts.renewal_notice_days`).
- `metrics.obligations_at_risk`: obligations with `status === "at_risk"`
  (strict — matches the retired `content/kelly-clm-app/server/demo.ts`'s inline metric).
- `metrics.approvals`: approvals with `status === "needs_review"`.

The sidebar/overview panel counts are deliberately broader than the metric
tile above, ported verbatim from the retired `content/kelly-clm-app/app.js`:
`renewalWatchCount` (any contract with either date present, regardless of
window) and `atRiskObligationsCount` (`at_risk` OR `blocked`).
