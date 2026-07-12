# CSS Modules (Cascade Layers, No Build Step)

Use this reference when a single `styles.css` has grown large enough (roughly
1500-2000+ lines) that finding the rules relevant to one screen is the
bottleneck, following the same module boundaries used for the JS split in
`frontend-modules.md`.

## This Is Organization, Not Encapsulation

Splitting `app.js` into ES modules gives each module real encapsulation:
private state, explicit exports, no accidental name collisions. Splitting
`styles.css` into multiple files gives you **none of that** — every file
still shares one global cascade, one global class namespace, and one global
specificity system. A class defined in `list-detail.css` still collides with
an identically-named class in `overview.css`. The split is purely about
finding the ~150 lines relevant to what you're editing; it does not reduce
coupling the way the JS split does. Don't oversell it as "componentizing"
CSS — there is no native CSS mechanism that gives per-file scoping without
Shadow DOM, and Shadow DOM is already ruled out (see `frontend-modules.md`)
for the same reasons: it would break the global stylesheet, global i18n via
`querySelectorAll`, and `document.activeElement` re-render guards.

## The Mechanism: `@layer` + Multiple `<link>` Tags

Plain multiple `<link>` tags have a footgun: the browser resolves same-
specificity conflicts by *document order*, so splitting one file into many
means the physical `<link>` order in `index.html` silently becomes load-
bearing — reorder two tags and a rule that used to win now loses, with no
error anywhere.

[Cascade Layers](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)
(`@layer`, supported in all evergreen browsers for years now) remove this
footgun by making precedence an explicit declaration instead of an implicit
side effect of file order. One rule: **any rule in a later-declared layer
beats any rule in an earlier-declared layer, regardless of specificity or
which file loads first.**

```css
/* layers.css — the ONLY file that decides precedence; load it first */
@layer base, components, shell, list-detail, modal, settings;
```

```css
/* list-detail.css — order relative to modal.css/settings.css no longer matters */
@layer list-detail {
  .item-card { ... }
  .item-card:hover { ... }
}
```

```html
<link rel="stylesheet" href="/styles/layers.css" />
<link rel="stylesheet" href="/styles/base.css" />
<link rel="stylesheet" href="/styles/components.css" />
<link rel="stylesheet" href="/styles/shell.css" />
<link rel="stylesheet" href="/styles/list-detail.css" />
<link rel="stylesheet" href="/styles/modal.css" />
<link rel="stylesheet" href="/styles/settings.css" />
```

Use multiple `<link>` tags, not `@import` — `@import` is discovered only
after the importing file itself is fetched and parsed, adding a network
round trip the `<link>` tags avoid (they're all discoverable the moment the
browser parses `<head>`).

Serve the split directory with the same static-route pattern already used
for `/js/*` (see `frontend-modules.md`): one route, path-traversal guard,
extension check for `.css`.

Any unlayered stylesheet loaded elsewhere (a theme override file, a demo-mode
stylesheet) keeps working exactly as before: **unlayered rules always beat
every `@layer`-declared rule**, regardless of where they sit in the document.
No changes needed to files you aren't touching.

## Do Not Reach For `@scope`

`@scope` (real per-container CSS scoping, no Shadow DOM required) looks like
the obvious next step once you're already touching cascade layers — scope
each split file to its owning container and get real isolation. It does not
work for a codebase that toggles layout/responsive state via classes on
`<body>` (`body.sidebar-collapsed .sidebar`, `body.is-locked .message-row`,
`body.mobile-detail-open .list-panel`, etc.) — and that pattern is how most
App-in-Skill frontends already drive their responsive/state-toggle behavior.

Verified directly before relying on it: wrapping a rule in
`@scope (.container) { body.is-locked .message-row { color: red; } }` fails
to match at all — computed style comes back as the unset default, not red —
while the identical selector with no `@scope` wrapper applies correctly.
`@scope` requires the **entire** selector chain to resolve inside the scope
root's subtree; a `body.<state-class>` ancestor qualifier reaches outside the
scope root and silently breaks the match. No console error, no warning — the
rule just doesn't apply. A codebase with a dozen-plus such rules (which is
typical here) would have a dozen-plus silently broken behaviors if every file
got wrapped in `@scope`.

Stick to `@layer` + multiple `<link>` only. If you're ever tempted to add
`@scope`, first grep the file being split for `body\.` — if any hits exist,
`@scope` is not safe to apply to that file.

## Designing The Module Boundaries: Verify Ownership, Don't Guess

A class's name is not proof of who owns it. Before assigning a rule to a
file, check where the class actually appears:

```bash
grep -l '"the-class-name"' app/index.html app/js/*.js
```

- Referenced by exactly one view module → that module's CSS file.
- Referenced by two or more → the shared `components.css` (or whichever
  file plays that role), even if the class name sounds specific.
- Referenced by zero → likely dead CSS from an earlier version; keep it
  (don't use a mechanical split as an excuse to also clean up unrelated
  dead code) and park it wherever is least surprising.

This catches real mistakes: a class whose *name* suggests one view can
easily turn out to already be shared by two others once you check.

## Compound Selectors That Straddle Buckets

A single rule frequently applies to multiple classes from different
buckets: `.help-paths, .settings-grid, .provider-choice-grid { ... }`. Don't
force these into one bucket by guesswork. Two options, in order of
preference:

1. **If every constituent class ends up in the same bucket's file anyway**,
   keep the rule intact, verbatim, in that file — don't split it.
2. **If constituents genuinely belong to different files**, split the rule
   by constituent, one compound-or-simple selector per destination file,
   copying the exact property list unchanged into each piece. This is safe
   under `@layer` specifically because precedence no longer depends on
   which physical file each piece ends up in — only the file's layer
   assignment does. Placing a piece in a later-declared layer than a
   conflicting rule in an earlier layer is enough; you don't need to
   preserve original physical ordering the way you would without layers.

## Trailing "Patch" Rules

Large stylesheets that grew over time often end with a tail section of
rules that re-declare an earlier selector to override just one or two
properties (a `box-shadow: none` reset, a color correction). These need
care during a split:

- Diff the trailing rule against its earlier counterpart. If it's a
  byte-identical duplicate, drop the duplicate — keep one copy.
- If it's a genuine override (same selector, different property value),
  and its constituent classes span multiple buckets, split it the same way
  as any other cross-bucket compound rule — but each split piece must land
  **after** that bucket's own base declaration of the same selector within
  that file (same-layer, same-specificity conflicts still resolve by
  source order inside one file). Appending all trailing-patch pieces at
  the end of each destination file, in their original relative order,
  reproduces the original behavior exactly.

## Verification: Computed Styles, Not Just "No Console Error"

A broken CSS split produces zero console errors and zero exceptions — the
page loads fine and looks *almost* right. The only way to catch a
misclassified rule, a dropped override, or a layer-order mistake is to
assert on actual rendered output:

- For every cross-layer override introduced by a split (compound rules,
  trailing patches), assert the computed style directly:
  `getComputedStyle(el).boxShadow`, `.gridTemplateColumns`, etc. — before
  and after toggling the relevant state class or breakpoint.
- Toggle every `body.<state>` class the split touched and confirm the
  dependent rule still changes computed style (not just that the class
  gets added).
- Re-run the full interaction surface (every view, every modal, every
  breakpoint) the same way you would after a JS split — a CSS regression
  can hide behind an element that's simply never visited in a quick
  smoke test.
