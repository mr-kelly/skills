# Mobile Shell And Split-Pane Layout

Use this reference when creating or updating an App-in-Skill UI. It captures the
shell mechanics for a workflow tool: a desktop split-pane that keeps its working
density, plus a phone-first shell that remains usable at 360-390px widths.

The visual system it carries — type, colour families, layout register, dark
mode, camera-ready rules — lives in `editorial-visual-system.md`. Read that
first.

## Layout Taste

Build the actual work surface first, not a landing page. A good App-in-Skill
reads as a small editorial desk for one workflow: composed, legible from across
a room, specific to the work, and calm.

**`editorial-visual-system.md` owns every visual token** — the type scale, the
colour families (`data-theme`), the layout register (`data-editorial`), dark
mode, the magazine vocabulary (eyebrow / headline / lede / rule / metric band /
status pill), the camera-ready rules, and the `Do Not` list. Read it before
writing a line of CSS, copy `assets/editorial-theme/editorial.css` into the app
(after `base-ui.css`, before every app-owned stylesheet), and never write a raw
colour, font size, radius, or duration into any other rule.

This file owns the mechanics that carry those tokens: shell grid, sidebar
collapse, drawer and scrim, sticky panes, breakpoints, and the modal shape.

### Polish

Cheap in code, and their absence is what makes a tool look unfinished:

- **Motion.** Pointer feedback on `--ease`; a state change the operator (or a
  viewer of the recording) must notice on `--ease-state`; a persisted verdict
  gets one `--ease-flash` highlight before its row moves queue. All of it
  collapses under `prefers-reduced-motion`, which the theme asset handles by
  rewriting the duration tokens — do not write that media query per component.
- **Scrollbars.** Thin, transparent track, `--rule` thumb, via `scrollbar-width`
  plus `::-webkit-scrollbar`. The default chrome scrollbar is wide, opaque and
  light-only; in a two-pane layout it reads as a seam through the design.
- **Focus.** A 2px `--accent` outline plus a soft `--accent-focus` `box-shadow`
  halo, not one flat outline — `box-shadow` so focus never shifts layout.
- **`::selection` and `caret-color`** read from the accent.
- **Icons**: monochrome, 16px, `stroke: currentColor`, sized by rule rather than
  per icon. A multi-coloured icon set is the fastest way to make a composed tool
  look like a toy.
- **Empty states**: icon, what is missing, and the one action that fixes it —
  never a bare line of grey text. An empty screen with no next step is where
  these tools most often strand a user.
- **Skeletons** for known-shape loads so the layout does not jump; a loading
  message for unknown-length waits.

### Composition

Structural rules; the visual ones live in `editorial-visual-system.md`.

- The page sits on `--canvas`. Regions are separated by **rules**, not by giving
  each one its own bordered card. A card is right for the list/detail workspace
  (one card containing both panes) and for the settings modal; it is wrong for a
  headline block, a metric band, or a section heading.
- The metric band uses **fixed columns** — `repeat(3, minmax(0, 1fr))` or
  `repeat(4, …)`, dropping to two at the phone breakpoint. **Never
  `repeat(auto-fit, …)`**: with `auto-fit` the band's height becomes a function
  of how many metrics the app declares, six wrap to ~217px at 1280x820 and three
  rows at 390x844, and the list starts below the fold. Fixed columns squeeze the
  cells instead, which is the behaviour you want when space runs short.
- **Internal identifiers never reach the screen.** A field that stores a
  reference renders the referenced thing's name; when it is not loaded yet, say
  so rather than falling back to the id. A display helper's last resort is `-`,
  never `value.id` and never `JSON.stringify(value)`.
- A row's secondary line is a **chosen** set of fields. Slicing "the 2nd through
  4th field" picks up whatever the schema happens to hold there — which is how
  two reference columns became the subtitle of every row in a shipped app.
- The list/detail workspace is one card containing both panes, not two floating
  panels.
- Any number that sits in a column — counts, currency, percentages — gets
  `tabular-nums`.
- Rows scan quickly; the detail pane carries the full context.
- Icon buttons stay transparent with a low-contrast icon and a subtle hover
  background.

Use workflow navigation as the primary sidebar: `All`, `Needs Review`,
`Approved`, `Done`, `Blocked`, or the domain equivalent. Show categories as
badges, not primary navigation.

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
  /* 24px, not the 18px this used to be: at 18px the monogram had to sit at
   * 8px, which is unreadable in a 720p clip and was the smallest type in the
   * whole fleet. */
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: var(--hairline) solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--ink-soft);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  line-height: 1;
}

.sidebar-toggle,
.mobile-sidebar-toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border-color: transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  box-shadow: none;
}

.sidebar-toggle {
  width: 30px;
  height: 30px;
  color: var(--muted);
}

.sidebar-toggle:hover,
.sidebar-toggle:focus-visible,
.mobile-sidebar-toggle:hover,
.mobile-sidebar-toggle:focus-visible {
  border-color: transparent;
  background: var(--surface-soft);
  color: var(--ink);
  box-shadow: none;
}

.sidebar-toggle-icon {
  position: relative;
  display: block;
  width: 17px;
  height: 15px;
  border: var(--rule-weight) solid currentColor;
  border-radius: var(--radius-xs);
  opacity: 0.82;
}

.sidebar-toggle-icon::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: var(--rule-weight);
  background: currentColor;
  opacity: 0.52;
}
```

For mobile, prefer the same quiet light control unless the app chrome is dark:

```css
.mobile-sidebar-toggle {
  width: 36px;
  height: 34px;
  color: var(--muted);
}
```

If a mobile toggle must be dark, override hover/focus so the global button hover style cannot wash it out:

```css
.mobile-sidebar-toggle,
.mobile-sidebar-toggle:hover,
.mobile-sidebar-toggle:focus-visible {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--canvas);
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
    border-bottom: var(--rule-weight) solid var(--rule);
    background: var(--surface-blur);
    backdrop-filter: blur(12px);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(84vw, 320px);
    height: 100dvh;
    overflow: auto;
    transform: translateX(-100%);
    transition: transform var(--ease-state);
    z-index: 30;
    box-shadow: none;
  }

  body.sidebar-open .sidebar {
    transform: translateX(0);
    box-shadow: var(--shadow-modal);
  }

  .sidebar-scrim {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: block;
    background: var(--scrim);
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
    border-width: 0 0 var(--rule-weight);
    border-radius: 0;
    background: var(--surface-blur);
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
- Desktop first-screen budget at `1280x820`: the metrics row is **one row**, the list shows at least
  three rows, and the page itself does not scroll vertically. Every other item on this list is about
  width; this is the one that catches a summary quietly eating the first screen. Check `390x844`
  too — two columns of four metrics is two rows there, and the list still has to be visible under
  them.
- No identifier is visible anywhere. Walk every view, open the first row in each, and assert the
  rendered text matches no id shape the app stores (`rec…`/uuid/hash). A sweep, not a spot check —
  ids surface in whichever view happens to hold a reference field.
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
