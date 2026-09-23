# Editorial Visual System

Use this reference for every app creation and every UI change. It owns what a
generated app *looks like*: the type, the colour families, the layout register,
and the rules that keep a recording of it legible.

`mobile-shell-layout.md` still owns the shell mechanics — grid, sidebar
collapse, drawer, scrim, breakpoints, sticky panes. `ui-workflow-patterns.md`
still owns interaction — attention panel, filters, detail actions, hash routes,
Help & Settings. Neither carries a palette any more; both defer here.

## What Changed, And Why

The previous default was a quiet Linear-style operator tool: cool grey canvas,
Apple blue, 13px body, 1px near-white hairlines, 9% status washes. It is a
perfectly good look on a 27" monitor at arm's length, and it has one specific
failure the fleet kept running into — **these apps are mostly seen as video**.
A README clip, a launch demo, a walkthrough in a deck. Encoded at 1280x720 and
watched at 720p, that style loses almost everything that carried its structure:

| The old token | What survives H.264 at 720p |
| --- | --- |
| `--text-base: 13px` body | legible only if the viewer leans in |
| `1px #ebedf0` hairline | smeared into the background; the grid disappears |
| 9% status wash | gone; every pill looks the same |
| `130ms` state transition | ~4 frames; the viewer does not see the change happen |
| `--text-3xl: 38px`, used almost nowhere | measured across 53 apps: 67% of every declared font size sat in 8–12.5px, and 13 declarations in the entire fleet were 28px or larger |

The new default fixes the legibility problem and takes the opportunity to give
the fleet a voice: **an editorial one** — magazine typography, warm paper,
strong hierarchy, rules instead of boxes. It is warmer and more feminine than
what it replaces, and it is deliberately not decorative: these are still
operator tools where someone approves things that cost money.

Nothing about the *structure* changed. Sidebar, attention panel, list/detail
split, hash routing, phone shell, and every acceptance gate are as they were.

## Three Axes

Everything is driven by tokens in `assets/editorial-theme/editorial.css`. It is
the editorial **profile** over the fleet's shared `scripts/base-ui.css`: same
token names, new values, plus the tokens base-ui has no concept of (display
serif, rule weights, the families, the registers, the second motion duration).
base-ui keeps owning the shared components — `.card`, `.button`, `.badge`,
`.eyebrow`, `.table`, `.empty-state` — and this file only re-values what they
read, so nothing is forked.

Copy it into the app as `app/styles/editorial.css`, load it **after
`base-ui.css` and before every app-owned stylesheet**, and copy
`assets/editorial-theme/check-editorial.mjs` into `scripts/check.mjs`. The
order is load-bearing, and so is the selector: base-ui declares its dark
tokens on an unlayered `html:root`, which outranks a plain `:root` in dark mode
regardless of load order — every block in the asset is therefore `html:root`.

| Axis | Attribute | Values | Who chooses |
| --- | --- | --- | --- |
| Colour family | `data-theme` on `<html>` | `ink-paper` (default), `rose-ochre`, `mauve-plum`, `coral-amber`, `sage-clay`, `ink-blush`, `graphite` | app picks a default; **operator can change it** in Help & Settings › Style |
| Layout register | `data-editorial` on `<html>` | `desk` (default), `spread`, `gallery` | app picks; operator may change it when more than one register fits the data |
| Display face | `data-display` on `<html>` | serif (default), `sans` | app picks; one attribute, no other change |
| Light/dark | automatic | `prefers-color-scheme` | the OS |

Do not re-derive a palette per app. A family is a *choice from this list*, and
that is what keeps sibling skills reading as one product instead of 179
unrelated tools. Adding an eighth family is a change to the asset, reviewed
once, not a local override in one app's stylesheet.

**The default is deliberately the quiet one.** `ink-paper` is warm neutral
paper, ink, and one restrained indigo — it has to sit on a compliance console
and a beauty-intel desk without arguing with either. The louder families are
there to be chosen, not to be the thing every app gets by default.

### Choosing a colour family

| Family | Reads as | Use when |
| --- | --- | --- |
| `ink-paper` | warm neutral paper, ink, restrained indigo | **the default**; correct for most desks, and the one that never fights a subject matter |
| `rose-ochre` | cream paper, ink, rouge, brass | a desk that should feel warm and personal — inbox, CRM, family, creators |
| `mauve-plum` | cool, restrained, fashion-magazine | brand, creative, PR, content review |
| `coral-amber` | bright, warm, energetic | growth, campaigns, launches — the strongest on camera |
| `sage-clay` | botanical, calm, earthen | wellness, food, education, family, property |
| `ink-blush` | newsprint contrast, rouge used sparingly | finance, legal, compliance — the pick when the app must not read as decorative at all |
| `graphite` | the pre-editorial neutral | an explicit opt-out for infrastructure/ops consoles. Still inherits the new type scale, rule weights, and motion |

`ink-paper`, `ink-blush`, and `graphite` exist so "editorial" never becomes a
constraint that makes a serious app look decorative. Picking one of them is a
normal choice, not a failure to apply the system.

### The primary button is the ink, not the accent

In `ink-paper` — and this is the move that makes the whole system read as
composed rather than themed — `--accent-strong` is near-ink, so the primary
button is black on paper and white on dark. A magazine's inside pages are
black and white plus **one** spot colour; the indigo is spent on selection,
links, and focus, and nothing else. A family that wants a coloured primary
button (`rose-ochre`, `coral-amber`) sets `--accent-strong` to its own accent
instead. Either way it is one token, and no component rule changes.

### Turning the serif off

`data-display="sans"` maps `--font-display` to the body stack in one line. The
scale, the rules, and the rhythm are what carry the look — the face is the
loudest marker but not the load-bearing one, and an app whose subject matter
makes a serif headline feel wrong should just switch it off rather than
abandon the system.

### Choosing a layout register

**`desk` — the default.** Editorial voice at operator density. The overview
page gets an eyebrow, one serif headline at `--display-size` (34px), a lede,
and a hairline-divided metric band. The workspace is the same list/detail split
as before, with the same row density. Recordings read well and a long queue
still scans.

**`spread`.** The overview page opens as a magazine spread: 48px serif
headline, `--space-7` margins, a `--text-lg` lede, and generous vertical
rhythm. **The lede stays one column.** A magazine sets two columns because its
body copy runs for hundreds of words; a three-line lede split across two
columns makes the reader jump back up the page mid-sentence to finish it, which
is worse than the single column it replaced. Columns are for a long-form Doc
surface, not for a page header.
The instant a row is selected the workspace returns to `desk` density. Use it
when the app has a genuine opening screen — a daily briefing, a morning
report — and specifically when the first ten seconds of a recording matter.
Do not use it for an app whose first screen *is* the queue; a spread in front
of urgent work is a door in front of a door.

**`gallery`.** The list itself becomes a card flow at `--gallery-columns`
(`auto-fill, minmax(280px, 1fr)`). Only for items that are visual and few:
drafts with covers, creatives, listings, video cuts, PPT decks. A screenful
holds roughly six cards where the list form holds fifteen, so it is the wrong
register for anything a person processes in bulk. **Never pair `gallery` with
a review queue whose normal depth is 40+ rows.**

All three collapse to `desk` rhythm below 720px. A phone is never a spread.

## Magazine Vocabulary

Six elements carry the whole look. They are cheap, and an app that uses them
consistently reads composed rather than merely recoloured.

### Eyebrow

The small uppercase line above a headline. Carries the context that used to be
crammed into the headline itself: section, date, period key, count.

```css
.eyebrow {
  font-size: var(--eyebrow-size);
  font-weight: 620;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--muted);
}
```

`OVERVIEW · TUESDAY 09:41` · `NEEDS REVIEW · 3 ITEMS` · `ISSUE 041 · INBOX DESK`.
Keep it to two segments separated by `·`. An eyebrow is not a breadcrumb.

### Headline

One per screen, serif, at `--display-size`. This is the anchor the old style
never had.

```css
.headline {
  font-family: var(--font-display);
  font-size: var(--display-size);
  line-height: var(--display-leading);
  letter-spacing: var(--tracking-display);
  color: var(--ink);
}
```

Write it as a sentence about the work, not a page name: `Three emails need your
judgment.` beats `Inbox`. Two headlines on one screen means one of them is
actually a section heading — demote it to `--text-lg` sans.

**The serif is display-only.** At `--text-md` and below it stays sans. This is
not taste: a CJK serif fallback (Songti SC / Noto Serif SC) at 15px is
materially harder to read than the sans it replaced, and these apps ship
localized copy. `check-editorial.mjs` fails the build when `--font-display`
appears in a rule that also sets a body size.

### Lede

One `--lede-size` sentence under the headline, `--ink-soft`, capped at
`--measure`. It says what the operator should do, in their language. If it is
only restating the headline, delete it — an empty lede is better than a
paraphrase.

### Rules, not boxes

The structural move that most distinguishes this system from the old one.
Regions are separated by a **rule** (`--rule-weight` in `--rule`), not by
giving everything its own bordered card. Three weights:

| Token | Use |
| --- | --- |
| `--hairline` / `--line` | inside a component: row separators, table lines |
| `--rule-weight` / `--rule` | between regions: under a headline block, between metric cells, above a footer |
| `--rule-heavy` / `--rule-strong` | exactly one per screen, under the masthead/headline. Ink-coloured. This is the line that says "magazine" |

A card is still correct for the list/detail workspace (one card containing both
panes) and for the settings modal. It is not correct for four metrics, a
headline block, or a section heading — those are rules.

### Metric band

Replaces the four bordered metric cards. A hairline-divided band, fixed
columns, no per-cell border:

```css
.metric-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));  /* or 4 — never auto-fit */
  border-block: var(--rule-weight) solid var(--rule);
}
.metric-band > * + * { border-inline-start: var(--hairline) solid var(--line); }
.metric-label { font-size: var(--text-sm); color: var(--muted); }
.metric-value {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
```

**Never `repeat(auto-fit, …)`.** With `auto-fit`, the band's height becomes a
function of how many metrics the app declares: six wrap into two rows ~217px
tall at 1280x820 and three rows at 390x844, and the list starts below the fold.
Fixed columns squeeze the cells instead, which is what you want when space runs
short. Four numbers is the ceiling, three is better, and each must be
unavailable elsewhere on the screen — the number that demands action already
sits in the sidebar attention block, and per-view counts already sit next to
their nav entry. Restating them makes the band a second navigation that cannot
be clicked.

Serif on the value is deliberate and is the one place a serif numeral earns its
keep: it is large, it is the thing the eye should land on, and `tabular-nums`
keeps the column aligned.

### Status pill

Dot, 13% wash, matching border, text — all four from one token set, so a status
can never end up half-coloured.

```css
.pill {
  border: var(--hairline) solid currentColor;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.pill.is-positive { color: var(--positive-text); background: var(--positive-soft); }
```

The border is new and is there for the camera: a wash alone loses its shape
after encoding, and twenty rows of shapeless tint is exactly the "bag of
highlighters" the old `Do Not` list warned about — the fix is the outline, not
more saturation. 13% is the ceiling in light mode; dark mode raises it to ~20%
in the asset, because a 13% tint is invisible on a dark surface.

## Camera-Ready Contract

These apps are recorded. Treat that as a first-class surface, not a
post-processing concern. `demo-recording.md` covers what to record; this covers
what the UI must do so the recording works at all.

- **Nothing load-bearing below 15px.** `--text-sm` and `--text-xs` are for
  metadata and pills. A row title, a button label, a form value, or anything
  the viewer must read during a clip is `--text-base` or larger.
- **A state change the viewer must notice runs on `--ease-state` (280ms), not
  `--ease` (130ms).** 130ms is roughly four frames at 30fps — the row simply
  teleports. Pointer feedback (hover, focus, press) stays on `--ease`, because
  slowing that down makes the app feel laggy in the hand. The distinction is
  the point of having two durations.
- **A recorded verdict gets a one-shot flash.** After a decision is persisted,
  the affected row plays a single `--ease-flash` highlight (`--accent-soft`
  fading out) before it moves queue. Without it, the most important moment in
  the whole clip — the approval landing — is invisible.
- **No 1px near-white line carries structure.** Region boundaries use
  `--rule-weight`. This is why the rule weights are tokens.
- **Design the first screen at 1280x720, not 1280x820.** 720 is the recording
  viewport, and 100 vertical pixels is the difference between "three rows
  visible" and "the list starts below the fold". Check both.
- **All motion collapses under `prefers-reduced-motion`**, which the asset
  already does by rewriting the duration tokens. Do not write a media query for
  it per component.

## Do Not

Carried forward from the old list, still true:

- Multi-coloured pastel icon tiles on metric cards; per-row generated avatar
  colours; saturated status backgrounds; a horizontal scrollbar inside a
  toolbar; a summary that wraps to a second row; decorative hero sections,
  gradients, nested cards, mock skeleton graphics presented as content, heavy
  shadows, hover states that promote every control to primary.
- **Raw identifiers anywhere a human reads.** Record ids, uuids, hashes, file
  keys: the reader can neither recognise one nor click it, so it says nothing
  while looking like content. A field storing a reference renders the
  referenced thing's *name*; when it is not loaded yet, say so rather than
  falling back to the id. A display helper's last resort is `-`, never
  `value.id` and never `JSON.stringify(value)`. **Fixtures must carry the
  shapes the real source returns** — a fixture that pre-resolves a reference
  into `{ id, name }`, or uses ids like `"p1"`, means the resolution path never
  runs and the id path never renders: the demo certifies a screen production
  will never show.
- A row's secondary line is a **chosen** set of fields, never "the 2nd through
  4th field" — that is how two reference columns became the subtitle of every
  row in a shipped app.

New, and specific to this system:

- **Serif body copy.** Display sizes only. See above.
- **Pink as decoration.** The accent owns selection, active nav, focus rings,
  links, the primary button, and the attention count — nothing else. A rouge
  border on a neutral card, a tinted sidebar, a coloured page background: each
  one costs the accent its meaning, and together they are what turns "editorial"
  into "themed".
- **A second display face.** One serif, one sans, one mono. A script or
  handwriting face reads as a greeting card, and there is no system script face
  that renders CJK anyway.
- **Pill-shaped everything.** `--radius-pill` is for status pills and avatars.
  A 999px radius on buttons, inputs, and cards is the fastest route to looking
  like a consumer toy.
- **Spread or gallery in front of urgent work.** Register is chosen for the
  data, not for the screenshot. A briefing opens as a spread; a queue opens as
  a queue.
- **A local palette override.** If a family does not fit, say which one is
  closest and what is wrong with it. Changing the asset is reviewed once for
  the whole fleet; a one-app override is invisible until the fleet is seen side
  by side.

## Acceptance

In addition to every check in `mobile-shell-layout.md`:

- `scripts/check.mjs` includes `editorialAssertions` and passes.
- Screenshot the overview and the workspace in **at least two families** (one
  of them dark) and confirm no hardcoded colour survived — a white sticky
  header over dark ink is the classic tell.
- At 1280x**720**: eyebrow, headline, lede, metric band as one row, and at
  least three list rows, without the page scrolling.
- At 390x844 and 360x740: headline drops to `--text-xl`, the band is two
  columns, no horizontal overflow.
- Record 10 seconds of one approval and watch it at 720p. The row's state
  change must be visible without prior knowledge of what to look for. This is
  the check that catches a 130ms transition where a 280ms one belonged.
