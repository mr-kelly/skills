# Cross-Entity Disclosure Tracker (kelly-disclosure-tracker)

Cross-Entity Disclosure Tracker is a Busabase App-in-Skill review workspace
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
  add a reviewer note — written directly onto the item's own Busabase record.
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

```bash
pnpm --dir skills/kelly-disclosure-tracker/app dev
```

Use the printed URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/vehicles
/?demo=1&lang=en#/vehicles/veh-01
/?demo=1&lang=en#/flagged
/?demo=1&lang=zh#/vehicles
```

Demo mode is fully offline and never reads or writes Busabase.

## Seeding And Executing A Real (Mock) Portfolio

```bash
node scripts/generate_batch.mjs --apply     # seed 9 mock vehicles / 54 items into Busabase
node scripts/execute_decisions.mjs --apply  # write an execution marker per item (no external side effect)
```

Both scripts default to a dry run — pass `--apply` to actually write. This
writes a synthetic 9-vehicle portfolio with disclosure items across the three
roles, including a couple of pre-seeded cross-entity reconciliation
mismatches so the Flagged view is populated on first run.

## Busabase Resources

Three Bases (`vehicles`, `items`, `settings`) under one application Folder,
provisioned lazily on first run. See `references/ui-schema.md` for the full
field-slug schema.
