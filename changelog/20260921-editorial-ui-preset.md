---
title: 2026-09-21 Editorial UI Preset For App-in-Skill
---

# Editorial UI Preset For App-in-Skill

Date: 2026-09-21
Author: AI Assistant
AI Agent: Claude

## Request

> 关于 ~/Documents/kelly-skills 里的 skill，kelly-app-skill-creator，的预设 UI 风格,
> 杂志风格，女性化，更好看，更适合录屏

Clarified in the same session: do not pin a single look — make it a system the
app and the operator can choose from ("给我选择题" / "可能可以多种"). Then, after
the first pass: "感觉变化比较大…… 我希望就是主题是好看一点，通用一点，大方一点",
which moved the DEFAULT back to neutral while keeping the louder families.

## What Changed

`kelly-app-skill-creator`'s default visual preset moves from the quiet
Linear-style operator tool (cool grey, Apple blue, 13px body, 1px hairlines,
9% status washes) to an editorial one: magazine typography, warm paper,
structure carried by rules rather than boxes.

It is a system, not a look. Three independent axes, all driven by tokens:

- **Seven colour families** (`data-theme`): `ink-paper` (default),
  `rose-ochre`, `mauve-plum`, `coral-amber`, `sage-clay`, `ink-blush`,
  `graphite`. The default is deliberately the quiet one — warm neutral paper,
  ink, one restrained indigo, and a **near-ink primary button**, so it sits on
  a compliance console and a beauty-intel desk without arguing with either. A
  magazine's inside pages are black and white plus one spot colour; that is
  where the "big and generous rather than decorated" reading comes from. The
  louder families are chosen, never inherited.
- **A serif switch** (`data-display="sans"`): one attribute maps the display
  face to the body stack. The scale, the rules, and the rhythm carry the look;
  the face is the loudest marker but not the load-bearing one.
- **Three layout registers** (`data-editorial`): `desk` (default — editorial
  voice at operator density), `spread` (overview opens as a magazine spread),
  `gallery` (list becomes a card flow). All three collapse to desk rhythm below
  720px.
- **Light/dark**, automatic, token-only overrides per family. In dark,
  `ink-paper`'s primary button flips to a near-white fill with dark type — the
  same "it is the ink" rule, inverted.

New files:

- `skills/kelly-app-skill-creator/assets/editorial-theme/editorial.css` — the
  copied theme asset. It is a **profile over the fleet's shared
  `scripts/base-ui.css`**, not a fork: same token names, new values, plus the
  tokens base-ui has no concept of (display serif, rule weights, families,
  registers, the second motion duration). base-ui keeps owning the shared
  components.
- `.../check-editorial.mjs` — build assertions, copied into each app's
  `scripts/check.mjs`.
- `.../preview.html` — the reference implementation of the magazine vocabulary.
- `references/editorial-visual-system.md` — the new visual contract.
- `tests/editorial-theme.test.mjs` — 13 red/green cases over the assertions.

Rewritten: `mobile-shell-layout.md` (now shell mechanics only; its own example
CSS no longer contains raw colours or sizes), `ui-workflow-patterns.md`
(Product Taste, and the accent picker becomes Family / Register / Accent),
`SKILL.md` (Reference Map, Mandatory UI Contract, Completion Criteria),
`demo-recording.md` (a camera-ready precondition section), both READMEs.

## Why

The old preset is good on a monitor and loses most of its structure as video,
which is how these apps are mostly seen. At 1280x720 encoded and watched at
720p: 13px body needs the viewer to lean in, 1px `#ebedf0` hairlines smear into
the background, a 9% status wash disappears, and a 130ms state transition is
about four frames — the approval lands without the viewer seeing it happen.

Measured across the 53 apps in the repo at the time: 67% of every `font-size`
declaration sat in 8–12.5px, 31 distinct sizes were in use, only 13
declarations in the whole set were 28px or larger, and not one app defined a
size through a variable. Nothing on the page was large enough to anchor it.

## Files Affected

- `skills/kelly-app-skill-creator/assets/editorial-theme/{editorial.css,check-editorial.mjs,preview.html}` - new
- `skills/kelly-app-skill-creator/references/editorial-visual-system.md` - new
- `skills/kelly-app-skill-creator/references/{mobile-shell-layout,ui-workflow-patterns,demo-recording}.md` - rewritten sections
- `skills/kelly-app-skill-creator/SKILL.md` - reference map, UI contract, completion criteria
- `skills/kelly-app-skill-creator/README.md`, `README_CN.md` - contract summary
- `tests/editorial-theme.test.mjs` - new

## Breaking Changes

None to existing apps. Nothing was rolled out: `scripts/base-ui.css` and the 70
apps carrying it are untouched. The preset governs apps this skill creates or
updates from here.

## Verification

- `node --test tests/editorial-theme.test.mjs` — 13/13. Each assertion was
  confirmed to go red on its own violation before the suite was kept; the first
  run failed the *clean* case and passed a real ordering violation, which is
  how two bugs in the assertions were found (a `\s*` before a negative
  lookahead let `font-size: var(--text-base)` match as raw, and the load-order
  check never verified base-ui came first).
- Cascade coexistence read from computed style with both `base-ui.css` and
  `editorial.css` linked, in both colour schemes: editorial wins every token in
  light *and* dark. This is why every block is `html:root` — base-ui declares
  its dark tokens on an unlayered `html:root` (0,1,1), which outranks a plain
  `:root` regardless of load order.
- 15 Playwright screenshots at deviceScaleFactor 2: seven families at
  1280x720, two dark, `spread`, `gallery`, 390x844, plus the serif/sans and
  default-family comparison that drove the second pass. `scrollWidth <= innerWidth` holds
  in all 11.
- Screenshots caught three real defects, now fixed: the two-column lede broke
  reading order on a three-line paragraph; the phone downshift covered only the
  two richer registers, so the default 34px headline wrapped to two lines at
  390px and pushed the queue off the first screen; the reference page's list
  pane did not scroll.
- `npx biome check` clean on all changed files; `npx tsc -p tsconfig.json` exit
  0; `node scripts/build-site.mjs` rebuilt 77 pages without a taxonomy error.

## Follow-up Tasks

- Decide whether the editorial profile should move into the shared
  `scripts/base-ui.css` + rollout mechanism so existing apps can opt in. Not
  done here: a straight rollout would change every app's body size from 13px to
  15px, and those layouts were built against 13px.
- `scripts/accent-theme.css` (the eight Apple accents) overlaps the family
  picker. Apps on the new preset should take their accent from the family; the
  old picker is not yet retired.
