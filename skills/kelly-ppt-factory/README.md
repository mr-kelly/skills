# Kelly PPT Factory

Kelly PPT Factory is a Busabase-backed App-in-Skill desk for producing many
style-consistent PowerPoint decks. It turns a brief, source materials, and
reference style into a managed workflow: project -> deck -> slide card ->
review -> PPTX generation -> render QA -> export.

It is designed for repeatable deck production: pitch decks, sales decks,
training materials, reports, proposals, courseware, or any workflow where
the operator wants a reusable PPT style system and a visible approval queue
before generation.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly PPT Factory overview"></td>
    <td width="50%"><img src="assets/screenshots/review.webp" alt="Kelly PPT Factory review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>PPT factory dashboard with project, deck, slide-card, QA, and style-score counters.</td>
    <td><strong>Review queue</strong><br>Slide-card and deck approvals before the agent generates or revises PPTX output.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/slides.webp" alt="Kelly PPT Factory slide cards"></td>
    <td width="50%"><img src="assets/screenshots/exports.webp" alt="Kelly PPT Factory exports"></td>
  </tr>
  <tr>
    <td><strong>Slide cards</strong><br>Storyboard-style page specs: objective, layout, copy, visual brief, interaction, style checks, and QA flags.</td>
    <td><strong>Exports</strong><br>PPTX outputs, render paths, generation status, and QA evidence for each deck.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/projects.webp" alt="Kelly PPT Factory projects"></td>
    <td width="50%"><img src="assets/screenshots/decks.webp" alt="Kelly PPT Factory decks"></td>
  </tr>
  <tr>
    <td><strong>Projects</strong><br>Deck project list with status and per-project detail — brand, dates, and slide brief.</td>
    <td><strong>Decks</strong><br>Generated decks with approval status, slide counts, and output PPTX paths.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/style.webp" alt="Kelly PPT Factory style system"></td>
  </tr>
  <tr>
    <td><strong>Style system</strong><br>Reusable deck style system — palette, headings, layout rules, and components.</td>
  </tr>
</table>

## Workflow

1. Configure the client, audience, style system, slide families, and export
   preferences.
2. Create projects and decks for each batch.
3. Draft slide cards before generating any PPTX.
4. Review slide cards and decks in the AirApp — approve / request changes /
   block / revise.
5. Generate PPTX from an approved deck with the trusted
   `scripts/generate_pptx.mjs`.
6. Render and inspect the deck for overflow, crop, contrast, and style
   drift.
7. Export final PPTX and QA records.

## Demo Mode

Run the app and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-ppt-factory/content/kelly-ppt-factory-app dev
```

Use the printed local URL, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=review&lang=en#/review
/?demo=slides&lang=en#/slides
/?demo=exports&lang=en#/exports
```

Add `lang=zh` for the Chinese UI chrome. Demo mode is fully offline and
never reads or writes Busabase.

## Busabase Data

The AirApp is Busabase-backed: projects, decks, slide cards, style systems,
QA checks, exports, and settings all live in Busabase Bases declared in
`content/kelly-ppt-factory-app/app/js/config.js` (see `references/ppt-factory-schema.md`). Resources
provision lazily on first run. There is no local file storage and no
separate provider choice.

## Trusted Scripts

```bash
node skills/kelly-ppt-factory/scripts/generate_pptx.mjs --deck=<deck_id>
node skills/kelly-ppt-factory/scripts/execute_decisions.mjs --apply
```

Generated exports live under `skills/kelly-ppt-factory/exports/` by default
and are gitignored.
