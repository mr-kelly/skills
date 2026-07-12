# Kelly Homework Coach

Kelly Homework Coach is a local App-in-Skill desk for elementary-school homework support. The agent explains photographed questions, analyzes wrong answers, turns mistakes into a review notebook, and prepares practice papers; the app gives students a gentle study surface and gives parents or teachers a review queue before anything is exported or acted on.

## What It Shows

- Student: a photo/intake surface, current question, child-friendly explanation, hint ladder, self-check, and "I understand / need another hint" controls.
- Mistakes: a review notebook grouped by topic and due date, with root cause, misconception, fix strategy, similar practice, and parent note.
- Papers: a mistake-focused paper builder and paper analysis view with difficulty mix, estimated time, wrong-question count, strengths, review plan, and deep notes.
- Review: parent/teacher queue with approve / request changes / block decisions, stable `Review #1` refs, proposed actions, and editable review notes.
- Settings: sanitized learning policy, provider state, config paths, answer policy, photo-retention policy, and language.

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
skills/kelly-homework-coach/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=student&lang=en#/student
/?demo=mistakes&lang=en#/mistakes
/?demo=papers&lang=en#/papers
/?demo=review&lang=en#/review
```

Use `lang=zh-HK` or `lang=zh-CN` for Chinese screenshots. Demo mode never reads or writes files under `app/.data/`.

## File Contract

The app reads and writes local handoff files:

- `app/.data/homework_snapshot.json`: questions, mistakes, papers, review items, metrics, and activity log.
- `app/.data/decisions.json`: parent/teacher verdicts keyed by review id.
- `app/.data/agent_tasks.json`: queued work for the agent after change requests.
- `app/.data/execution_report.json`: dry-run/apply report for local-only operations.

See `references/homework-schema.md` for the full contract and run `node scripts/validate_ui_schema.ts` before relying on a generated snapshot.

## Boundary

The app is local-only and never calls AI, uploads a child's photo, contacts a teacher, or mutates external systems. The skill performs OCR/vision reasoning, explanation drafting, mistake analysis, and paper generation, then writes handoff files for human review. Never commit student data: `config.local.json`, `.env*`, `app/.data/`, raw photos, and exports are gitignored.
