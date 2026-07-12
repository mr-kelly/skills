# Cross-Entity Disclosure Tracker

Cross-Entity Disclosure Tracker is a local, file-backed App-in-Skill workspace
that helps a compliance/IR team assemble and track a standardized disclosure
package per financing vehicle (fund/SPV), across three generic regulatory
roles: an onshore **origination entity**, an offshore **fund-manager entity**,
and a **listing venue**. It is a generic, brand-free tool — no real company,
regulator, or exchange is referenced anywhere in the skill or its data. It
never files anything and never calls any external system.

## What It Shows

- **Portfolio summary**: ready vs blocked vs in-progress vehicle counts, plus
  how many items are currently flagged, across the whole book.
- **Vehicle grid**: one card per financing vehicle with a progress bar and
  readiness badge.
- **Vehicle checklist**: disclosure items grouped by role (origination /
  fund-manager / listing venue), each showing its status and, when relevant,
  a cross-entity reconciliation banner.
- **Item decision panel**: mark an item verified, needs-source, or flagged, and
  add a reviewer note — written to local handoff files
  (`app/.data/decisions.json`).
- **Flagged view**: every reconciliation mismatch or reviewer-flagged
  inconsistency in one list, e.g. a figure that doesn't reconcile between the
  fund-manager's AUM statement and the listing venue's filing.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Disclosure Tracker overview"></td>
    <td width="50%"><img src="assets/screenshots/vehicle-detail.webp" alt="Disclosure Tracker vehicle detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Portfolio-level summary (ready / blocked / in-progress vehicles) plus the vehicle grid.</td>
    <td><strong>Vehicle detail</strong><br>Checklist grouped by role with a decision panel: verified, needs source, or flag inconsistent, plus a reviewer note.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/flagged.webp" alt="Disclosure Tracker flagged items"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Flagged</strong><br>Cross-entity reconciliation mismatches and reviewer-flagged inconsistencies, in one list.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-disclosure-tracker/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=1&lang=en#/vehicles
/?demo=1&lang=en#/vehicles/veh-01
/?demo=1&lang=en#/flagged
/?demo=1&lang=zh#/vehicles
```

Demo mode is fully offline and never reads or writes local handoff files.

## Seed Real Local Data

```bash
node scripts/generate_batch.ts
node scripts/validate_ui_schema.ts app/.data/current_batch.json
```

This writes 9 synthetic vehicles with disclosure items across the three roles
to `app/.data/current_batch.json` and `app/.data/decisions.json`, including a
couple of pre-seeded cross-entity reconciliation mismatches so the Flagged view
is populated on first run.

## Private Config

Copy `config.example.json` to `config.local.json` or
`~/.config/kelly-disclosure-tracker/config.json`. There are no secrets in this
skill's configuration — just the reviewer's display name and UI language
preference. Never commit `app/.data/` (reviewer decisions and notes) or
`config.local.json`.
