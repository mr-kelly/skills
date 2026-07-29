# Mobile Shell And Linear-Style Layout

Use this reference when creating or updating an App-in-Skill UI. It captures the default layout pattern for quiet workflow tools: a dense desktop split-pane inspired by Linear-style product surfaces, plus a phone-first shell that remains usable at 360-390px widths.

## Layout Taste

- Build the actual work surface first, not a landing page.
- Prefer a restrained, operational layout: sidebar navigation, human-attention summary, list/workspace area, detail pane, and compact actions.
- Use a neutral base palette with one accent, soft borders, low shadows, and 6-8px radii. Avoid decorative hero sections, nested cards, color-heavy gradients, and oversized marketing typography.
- Keep controls visually quiet. Icon buttons should usually be transparent with a low-contrast icon and a subtle hover background. Avoid black floating mobile buttons, hamburger glyphs, heavy button shadows, and selected states that flood whole rows with accent color.
- Keep information dense but calm. Rows should scan quickly; detail pages can carry the full context.
- Use full-width panes and bands for page structure. Reserve cards for repeated items, settings groups, dialogs, and genuinely framed tools.
- Use workflow navigation as the primary sidebar: `All`, `Needs Review`, `Approved`, `Done`, `Blocked`, or the domain equivalent. Show categories as badges, not primary navigation.

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
