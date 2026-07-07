# PPTX Generation Workflow

Use the built-in script for a quick local PPTX draft:

```bash
node skills/kelly-scale-pptx/scripts/generate_demo_snapshot.ts
node skills/kelly-scale-pptx/scripts/validate_ui_schema.ts
node skills/kelly-scale-pptx/scripts/generate_pptx.ts --deck=deck-hello-self
```

For production-quality decks, combine this skill with the `pptx` skill:

1. Build or import the courseware snapshot.
2. Review slide cards in the App UI.
3. Use approved slide cards as the structured plan.
4. Generate PPTX with the local script or a richer `pptxgenjs` pass.
5. Render to images/PDF and inspect for text overflow, low contrast, crop issues, and style drift.
6. Record QA checks and export paths back into the snapshot.

Never skip slide-card review for large batches. The page card is the audit surface that keeps bulk output manageable.
