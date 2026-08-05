# PPTX Generation Workflow

Use the trusted skill-root script for a real PPTX draft. It reads the deck
and its slide cards from Busabase and requires the deck to already have a
genuine `approve` decision recorded through the review queue:

```bash
node skills/kelly-ppt-factory/scripts/generate_pptx.mjs --deck=deck-seed-pitch
node skills/kelly-ppt-factory/scripts/execute_decisions.mjs --apply
```

For production-quality decks, combine this skill with the `pptx` skill:

1. Create or update projects, decks, and slide cards through the AirApp (or
   an ingest process you control) writing into Busabase.
2. Review slide cards and decks in the App UI's `#/review` queue.
3. Use approved slide cards as the structured plan.
4. Generate PPTX with `scripts/generate_pptx.mjs` (real `pptxgenjs`
   generation logic) or a richer `pptx` skill pass.
5. Render to images/PDF and inspect for text overflow, low contrast, crop issues, and style drift.
6. Record QA checks (the `qaChecks` Base) and export paths (the `exports`
   Base) back into Busabase.

Never skip slide-card review for large batches. The page card is the audit surface that keeps bulk output manageable.
