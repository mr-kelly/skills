---
name: kelly-homework-coach
description: Friendly elementary-school homework tutoring App-in-Skill. Use when the user invokes $kelly-homework-coach or /kelly-homework-coach, mentions 小学生作业辅导, homework photo tutoring, 拍照讲题, 作业答疑, 错题本, error notebook, mistake-book review, practice paper generation, exam paper analysis, parent/teacher review of AI explanations, or wants a child-friendly UI for step-by-step homework help with parent/teacher review and safety boundaries.
metadata:
  category: education
  tags:
    - risk:local-write
    - industry:education
    - surface:busabase
---

# Kelly Homework Coach

## Overview

Use this skill as a child-friendly homework coaching desk for elementary students. The agent explains photographed or pasted questions, analyzes wrong answers, turns mistakes into a review notebook, and prepares practice papers; the AirApp gives students a warm study surface and gives parents/teachers a calm Busabase-backed review desk for mistake analysis and paper planning.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, ensure Busabase resources are provisioned (the AirApp does this lazily on first run), record any newly explained question/mistake/paper with `scripts/record_homework.mjs`, and give the actual AirApp URL (or the local preview URL when local preview is explicitly requested). Use chat-only mode only when the user says `纯聊天`, `chat only`, `不要打开 UI`, or similar; in that mode use stable references such as `Question #1`, `Mistake #2`, and `Paper #1`.

## Mandatory Dependencies

1. Read and follow `$kelly-app-skill-creator` for product behavior, visual quality, responsive layout, and the complete canonical `app/` artifact.
2. Read and follow `$busabase` for connection, target Space, node discovery, ChangeRequests, review, and merge behavior.
3. Read and follow `$busabase-app-creator` for resource modeling, AirApp runtime limits, security, validation, and deployment.

If a dependency is unavailable, preserve this skill's local artifact and product contracts, stop before the unavailable Busabase operation, and report the exact missing dependency. Do not invent a second data backend.

## Boundary

- The skill may inspect uploaded homework photos, run OCR/vision reasoning through the active model, explain questions, identify mistakes, generate practice items, and record the result to this skill's own Busabase Bases via `scripts/record_homework.mjs`. It never calls a school system, uploads a child's photo anywhere outside the current chat session, contacts a teacher, or publishes/exports a paper itself.
- The AirApp reads and writes its own Busabase Bases only; it never mutates an external system. Parent/teacher review decisions (approve / request changes / block) write straight onto the review record through `busabase-sdk`.
- Child-facing output must be encouraging, step-by-step, and age-appropriate. Prefer hints and concepts over blunt answer dumping unless the user asks for the answer.
- Parent/teacher-facing analysis may be more diagnostic, but should avoid shame language. Treat the student as capable and learning.
- Student photos, names, school data, and answers are private education data. Never write a raw photo into a Busabase field — only a short `photo_label` description. Never commit any local credential file.

## Busabase Resources

Five Bases under one application Folder (`kelly-homework-coach`), declared in `app/app/js/config.js` and `app/resource-map.json`:

- `questions`: one row per homework question the agent has explained (from a photo, pasted text, or a paper) — prompt/answers, outcome, and the child-facing explanation (kid summary, steps, key concept, self check, next hint). Written by `scripts/record_homework.mjs`.
- `mistakes`: one row per mistake-book entry (stable id so repeated review updates the same card) — root cause, misconception, fix strategy, similar practice prompt, parent note.
- `papers`: one row per practice paper plan or completed-paper analysis — focus topics, linked mistakes, difficulty mix, items, and (once analyzed) wrong-question count/strengths/review plan.
- `reviews`: one row per parent/teacher review item (targets a question, mistake, or paper) — the raw review fields plus the reviewer's decision (`decision-action`/`decision-comment`/`decided-at`) and, once `scripts/execute_decisions.mjs` runs, an execution marker, all written directly onto the same row. A decision also mirrors the resulting status onto the target question/mistake/paper's own row.
- `settings`: sanitized config summary (student profile, subjects, learning policy, practice defaults, export policy — no secrets) plus the two authored aggregate metrics that cannot be recomputed from the current record lists (`mastery_score`, `questions_analyzed` — an all-time history).

Resources provision lazily through an idempotent Busabase ChangeRequest the first time the app runs in a Space; see `references/homework-schema.md` for exact field shapes.

## How A New Question/Mistake/Paper Enters The System

There is no upload API and the AirApp's photo box never uploads a file anywhere — it only lets the student pick a local filename and copies a chat prompt asking the agent to analyze it (`app/app/app.js`'s `renderPhotoBox()`/`data-copy-prompt="photo"`). The agent does the actual work in the same chat session (OCR/vision reasoning, drafting the child-facing explanation, identifying the mistake) and then calls the trusted script below with its own Busabase credentials to record the result:

```bash
node skills/kelly-homework-coach/scripts/record_homework.mjs --file payload.json --apply
```

Without `--apply` this is a dry run that only prints the planned upserts. The payload is a JSON object with optional `questions`/`mistakes`/`papers`/`reviews` arrays (see the script's header comment for the exact shape); each item is upserted by its stable id. Always include a `reviews` entry alongside a new/updated question, mistake, or paper so a parent/teacher can approve it in the app — the script itself never sets a review's decision fields (`decision-action`/`decision-comment`/`decided-at`/`execution-*`), even if a payload happens to include them; a freshly recorded review always starts `needs_review`, and re-syncing an existing review preserves whatever decision a human already made.

## Local App

Default behavior is AirApp-first — give the user the clickable AirApp URL. Start `pnpm --dir app dev` only when local preview/debugging is explicitly requested.

Required app views (hash routes):

- `#/student`: student study desk with a photo/intake box (local-only filename picker plus a copy-to-chat prompt), current question, gentle step-by-step explanation, hint ladder, and "I understand" / "I still need help" controls.
- `#/student/<question_id>`: question detail with the original prompt text, the student's answer, concept explanation, steps, self-check, and next hint.
- `#/mistakes`: mistake notebook with due-review chips, topic filters, root-cause analysis, similar practice prompt, and review history.
- `#/papers`: practice paper list, including mistake-focused settings, estimated minutes, and paper analysis (wrong-question count, strengths, review plan).
- `#/review`: parent/teacher review queue with stable refs, workflow states (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`), an editable review note, suggested actions, and approve/request-changes/block decisions — written directly onto the review record through `busabase-sdk`.
- `#/settings`: sanitized config summary, data provider, learning policy, answer-reveal rule, and language. Never exposes a secret value.

## Demo Mode

- `?demo=student`, `?demo=mistakes`, `?demo=papers`, and `?demo=review` open the deterministic offline dataset for screenshots and review (the scenario only selects which route to demo — the underlying data is always the same `demoSnapshot()`). Demo mode never reads or writes Busabase; demo decisions stay in the browser and are discarded on refresh.
- `lang=en`, `lang=zh`, or `lang=zh-HK` forces UI chrome language. Demo content is meaningfully localized when Chinese is selected.
- Deep links such as `/?demo=student&lang=zh-HK#/student` must work.

## Homework Photo Workflow

1. Ingest the student's photo or pasted problem text. If using vision/OCR, keep extracted text local unless the user explicitly approves a connector; only a short `photo_label` (e.g. "Homework photo, page 18 question 6") is ever written to Busabase, never the raw image.
2. Identify subject, grade, topic, required answer type, and whether the student's current answer is correct, wrong, or uncertain.
3. Draft a child-facing explanation: one friendly summary, 2-5 short steps, one key concept, one self-check, and a next hint. Avoid long lectures.
4. If wrong, create or update a mistake item with root cause, misconception, fix strategy, similar practice prompt, and a next review date.
5. Call `node scripts/record_homework.mjs --file payload.json --apply` with the question (and mistake, if any) plus a matching `reviews` entry, then send the user to `#/student` or `#/review`.

## Mistake Notebook Workflow

1. Group mistakes by topic, error type, and review due date; keep stable ids so repeated analysis updates the same mistake instead of duplicating it.
2. Use supportive language: "还差一步" / "try this check" rather than "careless" unless the evidence specifically supports a careless-slip label.
3. For each mistake, store a "how to fix next time" rule and a similar practice prompt. Do not store excessive raw photo content.
4. When a review's decision is `request_changes`, the linked review row's status stays `changes_requested`, which is exactly the retired app's "queued agent task" (see `pendingAgentTasks()` in `app/app/js/homework-model.js`). Redraft the explanation, mistake card, or paper plan, then re-run `scripts/record_homework.mjs` with the updated content and the same review id.

## Practice Paper And Analysis Workflow

1. Build practice papers from target subject/topic, grade, difficulty mix, and recent mistakes.
2. Generate a paper plan first: title, question count, estimated minutes, topics, linked mistakes, and answer-key policy. Parent/teacher approval is required before export.
3. After a completed paper is analyzed, list all wrong questions with topic, root cause, concept gap, and recommended review sequence.
4. Export approved papers locally only, outside this app, after review. This skill never sends anything to school systems or messaging apps.

## Review And Execution Loop

1. Send parent/teacher users to `#/review`. Decisions write straight onto the review record through `busabase-sdk` (`records.changeRequest`), with `autoMerge = isStandaloneLocalRuntime()` — local preview merges immediately, a deployed AirApp creates a pending ChangeRequest. Approving or blocking also mirrors the resulting status onto the linked question/mistake/paper's own row.
2. Before executing anything, run `node scripts/execute_decisions.mjs` for a dry run. With `--apply`, it re-reads every decided review and writes an execution marker (`execution-status`, `execution-detail`, `executed-at`) onto it, reporting the local-only operation (`add_to_mistake_book`, `mark_understood`, `queue_practice_paper`, `export_paper_plan`, `request_revision`, `block_item`) the agent should perform next, and for approve/block also sets the review's final status (`done`/`blocked`). It performs no export, filing, or external transmission.

## Safety Defaults

- Never shame the child. Avoid labels like "lazy", "stupid", or "careless" unless reframed as a fixable pattern with evidence.
- Never present uncertain OCR/vision as certain. If the photo is blurry, ask for a clearer image or parent/teacher confirmation.
- Do not generate high-stakes claims such as diagnoses, school placement decisions, or formal grades.
- Do not reveal a full answer before offering a hint path when the configured answer policy is `hint_first`.
- `scripts/execute_decisions.mjs` never invents a new automated action beyond what a review's own `proposed_action` already reports, and `scripts/record_homework.mjs` never sets a review's decision fields itself — a parent/teacher must always decide through the app.

## Useful Commands

```bash
node skills/kelly-homework-coach/scripts/record_homework.mjs --file payload.json --apply
node skills/kelly-homework-coach/scripts/execute_decisions.mjs --apply
pnpm --dir skills/kelly-homework-coach/app dev
```
