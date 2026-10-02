---
title: 2026-09-23 kelly-homework-coach — First Editorial Adopter, And A Recordable Demo
---

# kelly-homework-coach — First Editorial Adopter, And A Recordable Demo

Date: 2026-09-23
Author: AI Assistant
AI Agent: Claude

## Request

> 完善，。。。做作业的那个 skill，能录个屏的质量水平。 ~/Documents/kapps 力有
> busabase-template-video skill 做录屏

Clarified in the same session: record in **zh-CN Simplified**, and adopt the
**editorial preset wholesale** rather than only patching the camera-critical
tokens.

## What Changed

`kelly-homework-coach` could not be screen-recorded, for five reasons that had
nothing to do with the capture tooling.

### 1. Demo mode swallowed every decision

`app.js` returned early with `console.info("Demo mode: decision write
skipped")`. Clicking **批准 / 请修改 / 拦下** changed nothing on screen — so the
app's single most important interaction was unreachable in the only mode a
screenshot or a recording can use, and `SKILL.md`'s "demo decisions stay in the
browser and are discarded on refresh" described something the code did not do.

Demo decisions now mutate the rendered snapshot in memory (the pattern
`kelly-products`' `postDecision()` already established) through the **same**
`statusForAction()` the Busabase provider calls, and mirror the new status onto
the target question/mistake/paper exactly as the real write does. Nothing is
persisted; a refresh restores the fixture.

### 2. The 20-second background poll threw those decisions away

Found by recording the clip and watching the sidebar counters snap back from
`3 / 2` to `4 / 1` twenty seconds after an approval. The quiet refresh exists to
pick up what the agent wrote to Busabase since the last paint; in demo mode the
provider hands back the same fixture every time, so the only thing it can do is
discard the operator's work. `loadState()` now skips a quiet refresh in demo
mode. Regression-tested with Playwright's clock API (`fast_forward("00:45")`),
and confirmed red without the guard.

### 3. The fixture had no teeth

All four review items were approvable, so a recording of the queue showed a
person clicking Approve four times. Added `q-area-blurred` / `rv-area-blurred`:
a homework photo that hides one side length, an agent that assumed `8 cm` and
explained as if it were certain, and a read confidence of `0.41` against
0.92/0.88/0.79 on the rest. It is this skill's own Safety Default — "never
present uncertain OCR/vision as certain" — made into a row a parent has to
refuse. `renderQuestion()` now flags an unverifiable answer instead of printing
an empty box, which is the provenance the reviewer acts on.

### 4. `lang=zh-CN` served Traditional

There is one `zh` bundle and `resolveLanguage()` routes every `zh-*` tag to it
— and it was Hong Kong Traditional with Cantonese phrasing (學生端, 錯題本,
圈住借位嗰一欄, 故事想教我哋咩), while the skill's own description
("小学生作业辅导", "错题本"), both repo READMEs, and the existing `kelly-support`
recording are all Simplified. One bundle cannot be both. The bundle and all 106
Chinese demo strings are now Simplified with mainland primary-school
terminology (四年级 not 小四, 练习卷 not 試卷, 作业照片 not 作業相), and the demo
profile is `zh-CN` / `Asia/Shanghai`. `zh-HK` is gone from the skill.

### 5. Raw ids, duplicated copy, untranslated headings

`add_to_mistake_book` / `export_paper_plan` / `revise_explanation` rendered
verbatim in both the row chip and the detail pane. They are the contract with
`scripts/execute_decisions.mjs`, not labels — a reader can neither recognise
one nor click it. Now mapped to sentences a parent reads. Also: the suggested
note rendered twice (once as a read-only section, again as the textarea's
prefilled value — two identical sentences stacked in the most valuable pane);
`Target` and `Items` were hardcoded English; the attention tile and the filter
rail both said "Needs Review" over two different numbers (4 vs 3); the native
`<input type="file">` rendered "Choose File / No file chosen" in browser chrome.

### The theme

First adopter of the 2026-09-21 editorial preset, which resolves both follow-up
tasks that changelog left open.

- `app/styles/editorial.css` — byte-identical copy of the asset. Family
  `sage-clay` (the one `editorial-visual-system.md` names for education),
  register `desk`, serif display.
- `app/styles.css` — rewritten. It used to open with a 25-declaration `:root`
  palette (`#f6f7fb`, `#1473e6`, `--ok/--warn/--bad/--child/--paper`) that
  outranked base-ui's tokens, so the app was hardcoded light-mode blue whatever
  loaded underneath. Every colour, size, radius and duration now reads a token.
- `accent-theme.css` / `accent-theme.js` deleted — the family *is* the accent.
- Eyebrow / headline / lede / rules / metric band, and a **Style** tab in
  Settings driving `data-theme`.
- State changes run on `--ease-state` (280ms) and a decided row plays one
  `--ease-flash` highlight. At 130ms — four frames at 30fps — the approval
  landed without the viewer seeing it.
- `scripts/check-editorial.mjs` vendored into the app and run from
  `scripts/check.mjs`, so a raw value fails the build.

## The Recording

```text
docs/demo-recordings/kelly-homework-coach/kelly-homework-coach-demo-zh-CN.mp4
```

Recipe: `skills/kelly-app-skill-creator/references/demo-recording.md` — this
repo's own convention, the same one `kelly-support`'s clip follows.
`busabase-template-video` in `~/Documents/kapps` is scoped to
`github.com/busabase/templates` (its tiering, `risk:` storyboard branching, LFS
gallery wiring and `record-walk.mjs` do not apply here), but three of its
production rules were worth taking: drive by `data-route` never by link text,
inject a visible cursor because Playwright's video has none, and trim the boot
lead-in so the clip does not open on an empty shell.

One workflow pass and one safety pass, 49.6s, against the real app:

1. 学习台 — what the child sees, and the artefact about to be judged.
2. 审核 — "有 4 件事等你判断。"
3. 审核 #1, read end to end, **批准** → the pill flips, 等你判断 4→3, 可交给 Agent 1→2.
4. 可执行 filter — proof it landed where the agent picks it up.
5. 审核 #5 — the blurred photo. Scroll the evidence: 置信度 0.41, 正确答案「不确定」.
6. **拦下** → 已拦下 0→1, and the status mirrors onto the target question.
7. 已拦下 filter — the terminal state. Cursor parked, back to 全部.

1440x900, H.264, `yuv420p`, `color_range=tv`, 30fps, no audio, `+faststart`,
2.8MB, stored through the repo's existing `docs/demo-recordings/**/*.mp4` LFS
rule (verified with `git check-attr`).

The demo-mode decision toast ("决策已记录（演示模式，不会保存）") is left in
frame. `busabase-template-video` §5 says to hide a demo disclosure, and that
rule is right for a sales film with a persistent banner in every frame — this
is a 2.4s toast in a documentation clip, and hiding it would make the clip
claim a persistence that did not happen.

## Files Affected

- `skills/kelly-homework-coach/content/kelly-homework-coach-app/app/styles/editorial.css` - new, copied asset
- `.../scripts/check-editorial.mjs` - new, copied asset
- `.../app/styles.css` - rewritten on tokens
- `.../app/index.html` - link order, `data-theme`/`data-editorial`, accent-theme dropped
- `.../app/accent-theme.css`, `.../app/accent-theme.js` - deleted
- `.../app/app.js` - demo writes, flash, eyebrow/headline/lede, metric band, action labels, Style tab, `<html lang>`
- `.../app/i18n/messages.js` - Simplified `zh`, new keys
- `.../app/js/homework-model.js` - Simplified demo content, `q-area-blurred`
- `.../app/js/providers/demo-provider.js` - `zh-CN` / `Asia/Shanghai`
- `.../scripts/check.mjs` - runs `editorialAssertions`
- `.../test/homework-model.test.mjs` - new counts, Traditional-character guard
- `skills/kelly-homework-coach/SKILL.md`, `README.md` - locale, demo contract, theme
- `skills/kelly-homework-coach/assets/screenshots/**` - 8 recaptured + thumbs
- `tests/app-skills/kelly-homework-coach/ui_test.py` - counts, decision flow, quiet-refresh regression
- `tests/editorial-theme.test.mjs` - adopter assertions
- `docs/demo-recordings/kelly-homework-coach/kelly-homework-coach-demo-zh-CN.mp4` - new (LFS)

## Breaking Changes

`lang=zh-HK` no longer resolves to Traditional content — it resolves to the
Simplified bundle, as every other `zh-*` tag already did. No API, schema, or
Busabase field changed.

## Verification

- `node scripts/check.mjs` (includes `editorialAssertions`) — OK.
- `node --test` in the app — 11/11.
- `tests/app-skills/kelly-homework-coach/{contract,local-server}.test.mjs` +
  `tests/editorial-theme.test.mjs` — 31/31. The adopter scan reads the
  filesystem rather than `git ls-files`, because an uncommitted adopter is
  exactly when a drifted copy is cheapest to catch.
- `ui_test.py::test_demo_ui` — passes, including the new decision-flow and
  quiet-refresh assertions. The quiet-refresh case was confirmed red with the
  one-line guard removed.
- Playwright sweep at 1440x900, 1280x720, 390x844 and 360x740 across all four
  routes plus Settings: no console errors, no horizontal overflow. Dark mode in
  `ink-blush` and light `coral-amber`: no hardcoded colour survived.
- 1280x720 first screen: eyebrow, headline, lede, three-cell metric band, and
  three list rows on 学习台 / four on 审核, without scrolling. Getting the third
  row took compacting the photo desk from three stacked elements to one control
  row — the stacked version cost exactly the row that did not fit.
- `ffprobe` on the clip; opening and closing frames plus a 15-frame sample read
  at full size to confirm every scripted interaction visibly landed.
- `npm run lint`, `npm run typecheck`, `node scripts/build-site.mjs` (77 pages,
  no taxonomy error), `sync-readme-skills` and `sync-marketplace` both
  "already in sync".

## Known Issue Not Touched Here

`tests/base-ui-rollout.test.mjs` fails on
`skills/kelly-followups/content/kelly-followups-app/app/styles.css`
(`color-scheme: light;`). It fails at `HEAD` too and is unrelated to this work.

## Follow-up Tasks

- Roll the editorial preset to the remaining 69 apps, or decide it stays
  opt-in. This app is the proof it works end to end; the migration cost is the
  app-owned stylesheet, not the theme.
- `scripts/accent-theme.css` is now dead for adopters but still shipped by
  every other app. Retire it per-app as they adopt.
- An English cut of the clip, if the site ever plays recordings inline.
