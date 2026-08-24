# Kelly CLM

Kelly CLM is a lightweight, Busabase-backed App-in-Skill contract lifecycle
desk. It tracks contract inventory, lifecycle stage, owners, obligations,
renewal notices, and approval reminders — all read and written directly
through `busabase-sdk` from the browser, with no local-file data layer.

It is deliberately separate from `kelly-legal-contracts`: use this for
contract operations and reminders, not detailed clause review or redline
strategy.

## What It Shows

- Overview: lifecycle pipeline, metrics, upcoming renewals, and at-risk obligations.
- Contracts: searchable contract inventory with owner, stage, value, and dates; create and edit directly.
- Obligations: due dates, owners, status, and evidence notes, with a mark-done/reopen action.
- Renewals: notice deadlines and renewal windows, with a renewal-notice acknowledge action.
- Approvals: approve / request-changes / block reminders, written directly onto the approval record.

## Local Preview

```bash
pnpm --dir skills/kelly-clm/content/kelly-clm-app dev
```

Open the printed URL, then use:

```text
/?demo=1#/overview
/?demo=1#/contracts
/?demo=1#/obligations
/?demo=1#/renewals
/?demo=1#/approvals
```

Add `&lang=zh` for Chinese UI screenshots.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly CLM overview"></td>
    <td width="50%"><img src="assets/screenshots/contracts.webp" alt="Kelly CLM contract inventory"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Lifecycle dashboard with stage pipeline, upcoming renewals, and at-risk obligations.</td>
    <td><strong>Contracts</strong><br>Simple contract inventory with owner, counterparty, stage, value, and dates.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/obligations.webp" alt="Kelly CLM obligations"></td>
    <td width="50%"><img src="assets/screenshots/renewals.webp" alt="Kelly CLM renewals"></td>
  </tr>
  <tr>
    <td><strong>Obligations</strong><br>Owner-assigned obligation tracker with due dates and status.</td>
    <td><strong>Renewals</strong><br>Renewal board with notice deadlines and simple follow-up actions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/approvals.webp" alt="Kelly CLM approvals"></td>
  </tr>
  <tr>
    <td><strong>Approvals</strong><br>Approval queue for renewal notices and obligation owners, with approve / request-changes / block.</td>
  </tr>
</table>

## Boundary

The app never updates an external CLM, starts e-signature, contacts
counterparties, signs contracts, accepts terms, or provides legal advice.
Approval buttons write the decision directly onto the approval's own
Busabase record; any external action must happen through the user or a
separate explicitly approved connector.
