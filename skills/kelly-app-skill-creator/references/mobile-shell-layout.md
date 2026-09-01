# Mobile Shell And Linear-Style Layout

Use this reference when creating or updating an App-in-Skill UI. It captures the default layout pattern for quiet workflow tools: a dense desktop split-pane inspired by Linear-style product surfaces, plus a phone-first shell that remains usable at 360-390px widths.

## Layout Taste

Build the actual work surface first, not a landing page. A good App-in-Skill reads as a small
cockpit for one workflow: dense but calm, specific to the work, quiet controls, clear workflow
state.

### Token Scale

Declare these once in `:root` and never write a raw color, font size, or radius into a rule.
Retheming an app then means editing one block.

```css
:root {
  --canvas: #f6f7f8;          /* page background */
  --surface: #ffffff;         /* cards and panes */
  --surface-soft: #f4f5f7;    /* inert fills: counts, segmented track, avatars */
  --surface-hover: #fafbfb;

  --ink: #14181f;
  --ink-soft: #454c57;
  --muted: #79828f;
  --line: #ebedf0;
  --line-strong: #dcdfe4;

  --positive: #1f7a4d;
  --warning: #8a5a00;
  --danger: #b3261e;

  --radius-sm: 8px;           /* controls */
  --radius-md: 10px;
  --radius-lg: 14px;          /* cards */
  --shadow-card: 0 1px 2px rgba(16, 24, 40, 0.04);
  --shadow-modal: 0 24px 60px rgba(16, 24, 40, 0.16);

  --text-xs: 11px;  --text-sm: 12px;  --text-base: 13px;  --text-md: 14px;
  --text-lg: 16px;  --text-xl: 20px;  --text-2xl: 30px;  --text-3xl: 38px;

  /* Translucent surfaces must be tokens too -- see Dark Mode below. */
  --surface-blur: rgba(255, 255, 255, 0.94);
  --scrim: rgba(16, 24, 40, 0.34);

  /* One duration for every hover/selection change. */
  --ease: 130ms cubic-bezier(0.2, 0, 0.2, 1);

  color-scheme: light dark;
}
```

Do not introduce a size between two type steps, and do not add a third shadow.

The large steps matter as much as the small ones. Measured across the 53 existing apps in this
repo, 67% of every `font-size` declaration is 8-12.5px, only 13 declarations in the whole set are
28px or larger, 31 distinct sizes are in use, and not one app defines a size through a variable.
That is the concrete reason they read as cramped rather than composed: nothing on the page is large
enough to anchor it. Spend `--text-2xl` on metric values and `--text-3xl` on exactly one greeting
or page title. Accent tokens are
covered separately in `ui-workflow-patterns.md`; one accent per app, owning selection, active nav,
focus rings, links, and the primary button — nothing else.

Keep CJK faces in the font stack. These apps ship localized copy, and a stack without
`PingFang SC` / `Noto Sans SC` renders Chinese in a serif fallback:

```css
font-family:
  Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

### Dark Mode

Ship it. Dark is a `@media (prefers-color-scheme: dark)` block that overrides **tokens only** — not
one rule is duplicated for it. Keep `<meta name="color-scheme" content="light dark">` in the HTML so
native controls and scrollbars follow. Surfaces should be near-black, not pure black: at `#000` the
hairlines have to get brighter to stay visible, and bright hairlines read as noise.

This only works if no rule contains a raw color, and the failure mode is silent. A hardcoded
`rgba(255, 255, 255, 0.94)` on a sticky list header sat *after* the dark block in source order, won
the cascade at equal specificity, and left a white bar with invisible text in dark mode. Nothing
errors — it is only visible in a screenshot. Route every translucent surface through
`--surface-blur` / `--scrim`.

Two knobs flip direction rather than being restated as rules: a status pill's wash must rise in
dark (a 9% wash is invisible on a dark surface) and its text mix must fall (76% toward a dark ink
would be unreadable). The accent lifts too — a dark-enough accent to work on white is too dark to
sit on a dark surface.

### Polish

Cheap in code, and their absence is what makes a tool look unfinished:

- **Motion.** Hover/selection transitions on `--ease`. Snapping reads as unfinished; slower reads as
  laggy. All motion collapses under `prefers-reduced-motion`.
- **Scrollbars.** Thin, transparent track, `--line-strong` thumb, via `scrollbar-width` plus
  `::-webkit-scrollbar`. The default chrome scrollbar is wide, opaque and light-only; in a two-pane
  layout it reads as a seam through the design.
- **Focus.** A 2px accent outline plus a soft `box-shadow` halo, not one flat outline — `box-shadow`
  so focus never shifts layout.
- **`::selection` and `caret-color`** read from the accent.
- **Icons**: monochrome, 16px, `stroke: currentColor`, sized by rule rather than per icon. A
  multi-colored icon set is the fastest way to make a calm tool look like a toy.
- **Empty states**: icon, what is missing, and the one action that fixes it — never a bare line of
  grey text. An empty screen with no next step is where these tools most often strand a user.
- **Skeletons** for known-shape loads so the layout does not jump; a loading message for
  unknown-length waits.

### Composition

- The page sits on `--canvas`; content sits in white cards with a hairline `--line` border and
  `--shadow-card`. Cards separate regions; nested cards do not.
- Metrics are cards in an `auto-fit` row: label at `--text-base` muted, value at `--text-2xl` with
  `font-variant-numeric: tabular-nums`, optional trend line beneath. Two columns at 390px, not
  three — a third column clips the number.
- The list/detail workspace is one card containing both panes, not two floating panels.
- Any number that sits in a column — counts, currency, percentages — gets `tabular-nums`.
- A status pill takes its dot, a ~9% background wash, and its text color from one token, so a
  status can never end up half-colored. Keep the wash that light.
- A greeting/overview page gets a muted context line, one `--text-3xl` title, a supporting
  sentence, and the page-level actions on the right.
- Rows scan quickly; the detail pane carries the full context.
- Icon buttons stay transparent with a low-contrast icon and a subtle hover background.

### Do Not

Each of these is a specific, recurring way a generated app reads as busy rather than calm:

- Multi-colored pastel icon tiles on metric cards. Four tints across four cards is decoration that
  competes with the numbers, which are the only thing on that card worth reading.
- Per-row generated avatar colors. Keep monograms monochrome — a random hue per row fights every
  real status color sitting in the same row.
- Saturated pill backgrounds for status. A 9% wash is the ceiling; past that, twenty rows read as
  a bag of highlighters.
- A horizontal scrollbar inside a toolbar or filter strip. Let the toolbar wrap instead; a nested
  scrollbar is the most common way these layouts start looking broken at narrow widths.
- Decorative hero sections, gradients, oversized marketing typography, nested cards, mock skeleton
  graphics presented as content, black floating mobile buttons, hamburger glyphs where a panel icon
  fits better, heavy shadows, and hover states that promote every control to primary.

Use workflow navigation as the primary sidebar: `All`, `Needs Review`, `Approved`, `Done`,
`Blocked`, or the domain equivalent. Show categories as badges, not primary navigation.

## Desktop Shell

Recommended structure:

```html
<div class="app-shell">
  <aside class="sidebar" id="appSidebar">
    <div class="brand">
      <div class="brand-icon" aria-hidden="true">AI</div>
      <div class="brand-copy">
        <div class="brand-title">App Name</div>
        <div class="brand-subtitle">Workflow desk</div>
      </div>
      <button id="sidebarToggle" class="sidebar-toggle" type="button" aria-controls="appSidebar" aria-expanded="true" aria-label="Toggle sidebar">
        <span class="sidebar-toggle-icon" aria-hidden="true"></span>
      </button>
    </div>
    <section class="human-work">...</section>
    <nav class="filters">...</nav>
  </aside>
  <main class="main">
    <div class="mobile-topbar">...</div>
    <section class="content">
      <div class="list-panel">...</div>
      <aside class="detail-panel">...</aside>
    </section>
  </main>
</div>
<div id="sidebarScrim" class="sidebar-scrim" hidden></div>
```

Desktop behavior:

- Use a two-column shell: fixed-width sidebar plus flexible main area.
- For review queues, use a list/detail split: `minmax(360px, 38%) minmax(0, 1fr)` is a good starting point.
- Keep list headers and detail action bars sticky only within their scroll container.
- Collapsing the sidebar should reduce it to an icon rail without hiding the main work.
- Always include a small brand/skill icon in the sidebar's top-left brand area. Keep it visible in both expanded and collapsed sidebar states; hide only the text label when collapsed.

## Sidebar Toggle Icon

Use a panel icon instead of a hamburger. A hamburger suggests a generic menu; a panel icon better communicates sidebar collapse/expand.

```css
.brand-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  background: #f7f8fa;
  color: #475569;
  font-size: 8px;
  font-weight: 760;
  line-height: 1;
}

.sidebar-toggle,
.mobile-sidebar-toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border-color: transparent;
  border-radius: 7px;
  background: transparent;
  box-shadow: none;
}

.sidebar-toggle {
  width: 30px;
  height: 30px;
  color: #7a828f;
}

.sidebar-toggle:hover,
.sidebar-toggle:focus-visible,
.mobile-sidebar-toggle:hover,
.mobile-sidebar-toggle:focus-visible {
  border-color: transparent;
  background: #eef1f5;
  color: #2f343b;
  box-shadow: none;
}

.sidebar-toggle-icon {
  position: relative;
  display: block;
  width: 17px;
  height: 15px;
  border: 1.5px solid currentColor;
  border-radius: 4px;
  opacity: 0.82;
}

.sidebar-toggle-icon::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 1.5px;
  background: currentColor;
  opacity: 0.52;
}
```

For mobile, prefer the same quiet light control unless the app chrome is dark:

```css
.mobile-sidebar-toggle {
  width: 36px;
  height: 34px;
  color: #59616d;
}
```

If a mobile toggle must be dark, override hover/focus so the global button hover style cannot wash it out:

```css
.mobile-sidebar-toggle,
.mobile-sidebar-toggle:hover,
.mobile-sidebar-toggle:focus-visible {
  border-color: #202124;
  background: #202124;
  color: #fff;
  box-shadow: none;
}
```

## Mobile Shell

At `<=720px`, switch to a real phone shell instead of shrinking the desktop:

- One-column app shell.
- Top mobile bar with drawer button, current view or selected item title, item count, and one compact settings/help button.
- Sidebar becomes an off-canvas drawer with a scrim.
- List and detail are separate full-height panes. Selecting a row opens detail; detail has a sticky back-to-list control.
- Primary detail action stays sticky near the top. Secondary actions go into a compact menu.
- Bulk actions appear only after selection and scroll horizontally inside their own toolbar.
- All text must wrap or truncate within its container; page-level horizontal overflow is a bug.

```css
.mobile-topbar {
  display: none;
}

.sidebar-scrim,
.sidebar-scrim[hidden] {
  display: none;
}

@media (max-width: 720px) {
  html,
  body {
    height: 100%;
    overflow: hidden;
  }

  .app-shell {
    grid-template-columns: 1fr;
    height: 100dvh;
    min-height: 0;
  }

  .main {
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100dvh;
    min-height: 0;
  }

  .mobile-topbar {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-height: 52px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(84vw, 320px);
    height: 100dvh;
    overflow: auto;
    transform: translateX(-100%);
    transition: transform 0.18s ease;
    z-index: 30;
    box-shadow: none;
  }

  body.sidebar-open .sidebar {
    transform: translateX(0);
    box-shadow: 20px 0 40px rgba(15, 23, 42, 0.16);
  }

  .sidebar-scrim {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: block;
    background: rgba(15, 23, 42, 0.28);
  }

  .content {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .list-panel {
    height: 100%;
    min-height: 0;
    border-right: 0;
  }

  body.mobile-detail-open .list-panel {
    display: none;
  }

  .detail-panel {
    display: none;
  }

  body.mobile-detail-open .detail-panel {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .back-to-list {
    position: sticky;
    top: 0;
    z-index: 3;
    display: inline-flex;
    width: calc(100% + 24px);
    margin: 0 -12px 10px;
    border-width: 0 0 1px;
    border-radius: 0;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
  }

  .detail-actions-top {
    position: sticky;
    top: 41px;
    z-index: 2;
  }
}
```

## Help And Settings Modal

Settings/help screens must be mobile responsive too.

- Desktop can use a centered modal.
- Mobile should use a full-screen panel (`height: 100dvh`, no border radius).
- Modal grid needs three rows: header, tabs, body.
- Tabs should wrap into a compact grid on mobile, not rely on hidden horizontal scroll.
- Long paths, URLs, code, account ids, and config values must wrap.

The first-run setup gate (`setup-onboarding.md`) is the same shape: a bounded
dialog with `max-height` capped to the viewport, a fixed head, an internally
scrollable body, and a fixed footer for actions — not an unbounded panel
centered with `place-items: center` and no height limit. Reuse this modal's
CSS directly for the setup gate panel where practical instead of duplicating
the head/body/scroll structure under different class names.

```css
.modal {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
}

@media (max-width: 720px) {
  .modal-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .modal {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-width: 0;
    border-radius: 0;
  }

  .modal-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    overflow: visible;
    padding: 10px;
  }

  .modal-tabs button {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-body,
  .help-tab-panel,
  .settings-card {
    min-width: 0;
  }

  .modal-body pre,
  .modal-body code,
  .settings-row code,
  .settings-row a,
  .account-row code {
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}
```

## Minimal JavaScript State

Keep mobile state small and explicit:

```js
function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
}

window.addEventListener("resize", () => {
  if (!isMobileLayout()) {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
  }
});
```

## Verification Checklist

Run these checks before handing off:

- `node --check app/app.js` and any server modules.
- App validator or dry-run script, if the skill has one.
- Desktop viewport around `1280x820`: sidebar collapse works, no horizontal overflow, list/detail remain usable.
- Phone viewport around `390x844`: top bar visible, drawer opens/closes, scrim only intercepts clicks while open, list rows are scannable, selecting a row opens detail, back returns to list.
- Narrow phone viewport around `360x740`: no horizontal overflow.
- Help/settings modal: every tab fits, long paths wrap, close button is visible, `document.documentElement.scrollWidth <= window.innerWidth`.
- Hover/focus audit for dark buttons: global `button:hover` must not make icons disappear.

Useful browser assertion:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

For modal panels, also check active tab content:

```js
const panel = document.querySelector(".help-tab-panel.active");
panel.scrollWidth <= panel.clientWidth;
```
