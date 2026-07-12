# Kelly PPT Factory

Kelly PPT Factory is a local App-in-Skill desk for producing many style-consistent PowerPoint decks. It turns a brief, source materials, and reference style into a managed workflow: project -> deck -> slide card -> review -> PPTX generation -> render QA -> export.

It is designed for repeatable deck production: pitch decks, sales decks, training materials, reports, proposals, courseware, or any workflow where the operator wants a reusable PPT style system and a visible approval queue before generation.

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

1. Configure the client, audience, style system, slide families, and export preferences.
2. Create projects and decks for each batch.
3. Draft slide cards before generating any PPTX.
4. Review slide cards and decks in the local UI.
5. Generate PPTX from approved cards.
6. Render and inspect the deck for overflow, crop, contrast, and style drift.
7. Export final PPTX and QA records.

## Run Locally

```bash
skills/kelly-ppt-factory/app/start.sh
```

Demo mode is deterministic and safe for screenshots:

```text
http://127.0.0.1:3000/?demo=overview#/overview
http://127.0.0.1:3000/?demo=review#/review
http://127.0.0.1:3000/?demo=slides#/slides/slide-why-now
http://127.0.0.1:3000/?demo=exports#/exports
```

Use `lang=zh` for Chinese screenshots. Demo mode never reads or writes files under `app/.data/`.

## Commands

```bash
node skills/kelly-ppt-factory/scripts/generate_demo_snapshot.ts
node skills/kelly-ppt-factory/scripts/validate_ui_schema.ts
node skills/kelly-ppt-factory/scripts/generate_pptx.ts --deck=deck-seed-pitch
node skills/kelly-ppt-factory/scripts/execute_decisions.ts --apply
```

Generated exports live under `skills/kelly-ppt-factory/exports/` by default and are gitignored.
