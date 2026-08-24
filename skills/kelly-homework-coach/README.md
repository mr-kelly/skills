# Kelly Homework Coach

Kelly Homework Coach is a Busabase-backed App-in-Skill desk for elementary-school homework support. The agent explains photographed or pasted questions, analyzes wrong answers, turns mistakes into a review notebook, and prepares practice papers; the AirApp gives students a gentle study surface and gives parents or teachers a review queue before anything is treated as settled.

## What It Shows

- Student: a photo/intake box (local-only filename picker plus a copy-to-chat prompt), current question, child-friendly explanation, hint ladder, self-check, and "I understand / need another hint" controls.
- Mistakes: a review notebook grouped by topic and due date, with root cause, misconception, fix strategy, similar practice, and parent note.
- Papers: a practice paper list and paper analysis view with difficulty mix, estimated time, wrong-question count, strengths, review plan, and deep notes.
- Review: parent/teacher queue with approve / request changes / block decisions, stable `Review #1` refs, proposed actions, and editable review notes — written straight onto the review record through `busabase-sdk`.
- Settings: sanitized learning policy, data provider, answer policy, and language.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/student.webp" alt="Kelly Homework Coach student desk"></td>
    <td width="50%"><img src="assets/screenshots/mistakes.webp" alt="Kelly Homework Coach mistake notebook"></td>
  </tr>
  <tr>
    <td><strong>Student desk</strong><br>Photo-based homework help with a gentle step-by-step explanation, self-check, and hint-first controls for the child.</td>
    <td><strong>Mistake notebook</strong><br>Wrong-answer cards with root cause, misconception, fix strategy, similar practice, and the next review date.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/papers.webp" alt="Kelly Homework Coach practice papers"></td>
    <td width="50%"><img src="assets/screenshots/review.webp" alt="Kelly Homework Coach parent teacher review queue"></td>
  </tr>
  <tr>
    <td><strong>Practice papers</strong><br>Mistake-focused paper plans with topic mix, estimated minutes, wrong-question analysis, strengths, and review sequence.</td>
    <td><strong>Review queue</strong><br>Parent/teacher approval desk for explanations, mistake cards, and paper exports before the agent continues.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-homework-coach/content/kelly-homework-coach-app dev
```

Then open the printed URL with one of these demo paths:

```text
/?demo=student&lang=en#/student
/?demo=mistakes&lang=en#/mistakes
/?demo=papers&lang=en#/papers
/?demo=review&lang=en#/review
```

Use `lang=zh` or `lang=zh-HK` for Chinese screenshots. Demo mode never reads or writes Busabase; demo decisions stay in the browser and are discarded on refresh.

## How A New Question/Mistake/Paper Enters The System

There is no upload API — the photo box only lets the student pick a local filename and copies a chat prompt asking the agent to analyze it. The agent does the real work in chat and then records the result with its own trusted Busabase credentials:

```bash
node skills/kelly-homework-coach/scripts/record_homework.mjs --file payload.json --apply
```

See `references/homework-schema.md` for the exact Busabase field contract, and `SKILL.md` for the full workflow.

## Review And Execution

Parent/teacher decisions write straight onto the review record. `node scripts/execute_decisions.mjs --apply` (dry run without `--apply`) then re-reads every decided review and writes an execution marker reporting the local-only operation the agent should perform next — it never exports a paper, contacts a teacher, or mutates any external system.

## Boundary

The app reads and writes its own Busabase Bases only and never calls AI, uploads a child's photo outside the current chat session, contacts a teacher, or mutates external systems. The skill performs OCR/vision reasoning, explanation drafting, mistake analysis, and paper generation, then records the result to Busabase for human review. Never write a raw photo into a Busabase field — only a short `photo_label` description. Never commit any local credential file.
