---
title: 2026-09-24 kelly-homework-coach — Sit The Paper, Not Just Plan It
---

# kelly-homework-coach — Sit The Paper, Not Just Plan It

Date: 2026-09-24
Author: AI Assistant
AI Agent: Claude

## Request

> 对了，这个 skill，能基于作业，出题考我吗

The honest answer was "half". The skill already built practice papers from the
mistake notebook (`papers`, `linked_mistakes`, and a `similar_prompt` on every
mistake card), and `questions` already carried `student_answer` /
`correct_answer` / `outcome` — so a quiz round could be *recorded*. What was
missing was anywhere to actually sit one: a grep for `quiz` / `答题` /
`submit_answer` / `grade_paper` across the app returned nothing. `#/papers` had
the plan and the post-hoc analysis, no input box, no marking.

Asked which way to go, the answer was: build it, then teach it — this feeds
风变 第二期第 10 课.

## What Changed

### The runner

`#/papers/<paper_id>` → **开始做这张卷**. One question at a time: prompt, answer
box, mark, next. At the end a score and a "交给大人看" hand-off.

### Items can now carry an answer key

`papers.items` has always been a free JSON array, so a gradeable item is
`{ prompt, answer, hint, topic }` rather than a schema change. A plain string
still parses — it just cannot be marked, and the runner says so instead of
inventing an answer to mark against. `isGradeable()` needs only **one**
markable item, because a mixed paper legitimately carries open-response items
(「说说这篇短文的中心意思」); those are collected, marked `ungraded`, and reported
for a person to read.

### Marking is local, deterministic, and explainable

`gradeAnswer()` normalizes full-width digits, whitespace, a trailing period and
case, then compares exactly. No model call, no fuzzy match. The reason is not
performance: a child is told they got it wrong, so the rule has to be one you
can explain to them.

### `hint_first` is now enforced, not just documented

It was a line in Help & Settings and a Safety Default in `SKILL.md`. The runner
is the first place it actually gates anything: the first wrong answer gets the
item's `hint`, and only a second wrong attempt reveals `answer`. A hint that
contains its own answer is not a hint — the first draft's Q1 hint was
「先把 1/2 化成八分之几」against answer `1/2`, and the test now asserts this across
the whole demo dataset in both locales.

### The score is over marked items

`attempt.graded`, not `attempt.total`. 2 right / 0 wrong / 1 open used to read
「3 题里你做对了 2 题」, which tells a child they missed one when they did not.

### Handing in writes exactly one kind of row

The attempt goes onto the paper's **own** record (`analysis.attempt` +
`analysis.wrong_count`) and the paper's review row returns to `needs_review`.
`papers` is already defined as "one row per practice paper plan **or
completed-paper analysis**", so this is an update through the existing
`records.changeRequest` path — no new Base, no create procedure, no widening of
the AirApp's write surface.

**The runner never writes a mistake card.** Turning a wrong answer into a root
cause and a misconception is a judgement about a child's learning; the agent
drafts those and a parent approves them. The runner reports only what it can
prove: which items were wrong, what was given, what was expected, how many
hints were used.

So the loop closes: agent builds the paper → student sits it → app marks and
hands in → parent reviews → agent turns the misses into mistake cards.

### Two smaller fixes found by driving it

- A run owns the detail pane. The sticky action bar kept rendering the 「审核」
  nav button mid-question, offering the student a control that silently
  abandoned their run.
- `renderPaper` printed items with `esc(entry)`. Once an item became an object
  that is `[object Object]`, so the items list now renders `entry.prompt`.

## Why

The demo beat that makes this worth teaching: `paper-mixed-01`'s review sits at
`approved`, so handing in a run visibly moves 待审核 3→4 and 可执行 1→0. The
child's work lands back in front of the parent on screen, which is the course's
"AI 执行、人做判断" spine applied to something a parent actually cares about.

## Verification

- 16/16 `test/homework-model.test.mjs` (5 new: item shapes, marking tolerance,
  `isGradeable`, scoring over `graded`, and the no-hint-leaks-its-answer sweep).
- `scripts/check.mjs` including `editorialAssertions` — the runner's styles are
  token-only.
- `ui_test.py::test_demo_ui` extended with a full run: hint-before-answer
  asserted by checking `326` is absent from the first verdict and present in
  the second, the open-response item marked `is-open`, the score reading
  "You got 1 of 2 right.", and the review counters moving on hand-in.
- Playwright sweep: 1440×900, 1280×720, 390×844, 360×740 × {zh-CN, en} × every
  route **plus a live mid-run state** at each — no console errors, no
  horizontal overflow. Dark `ink-blush` and light `coral-amber` mid-run: no
  hardcoded colour survived.
- Screenshots re-captured; only the two `papers` shots changed, which is the
  expected blast radius.
