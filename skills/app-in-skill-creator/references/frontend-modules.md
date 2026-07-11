# Frontend Modules (ESM, No Build Step)

Use this reference when a zero-build vanilla frontend's single `app.js` has
grown large enough (roughly 800-1000+ lines) that holding the whole file in
your head to make one change becomes the bottleneck, or when asked to
"componentize"/"modularize" the frontend.

## When To Split

Keep a single `app.js` for typical review queues and dashboards — most
App-in-Skills never need this. Split into modules when `app.js` has grown
past ~800-1000 lines **and** has multiple clearly separable responsibilities
(a setup gate, a list/detail workflow, a settings modal) that tend to be
edited independently. Splitting a small app "for cleanliness" adds
indirection without benefit.

## Still Zero-Build

This is native ES Modules, not a bundler. Browsers execute `import`/`export`
directly; there is no Vite/esbuild/webpack step, and this does not relax the
"no build step" rule in `runtime-architecture.md`. `index.html` keeps its
single `<script type="module" src="/app.js">`; `app.js` becomes a thin entry
point that imports sibling modules and wires them together (event listeners,
cross-module hook registration, bootstrap calls).

## Do Not Reach For Web Components / Shadow DOM

Encapsulating pieces as Custom Elements with Shadow DOM sounds like the
"native" answer to componentization, but it conflicts with three things
every App-in-Skill frontend already relies on:

- A single global stylesheet shared across the whole app (accent color
  system, badges, cards). Shadow DOM blocks global CSS from reaching inside a
  shadow root, so every component would need its own duplicated/adopted
  stylesheet — this turns a file-reorganization task into a full styling
  rewrite.
- Global i18n via `document.querySelectorAll("[data-i18n]")`. This does not
  see into shadow roots, so translation breaks for anything moved into a
  shadow-rooted component.
- `document.activeElement` guards used to avoid clobbering user input during
  a re-render (`if (document.activeElement !== input) input.value = ...`).
  Inside a shadow root, `document.activeElement` only resolves to the shadow
  host, never the focused element inside it, so every one of these guards
  would silently stop working.

Plain ES Modules exporting render functions avoid all three problems, and fit
an app that has one instance of each section (one sidebar, one list, one
detail pane, one settings modal) rather than many repeated custom-tag
instances. Custom Elements pull their weight for genuinely repeated,
independently-instantiated widgets; that is rarely what an App-in-Skill's
main screen needs.

## Directory Layout

```text
app/
├── app.js              # thin entry point: imports every module, wires event
│                        # listeners, bootstraps (applyTranslations(), wire(),
│                        # initial refresh(), timers)
├── index.html
├── styles.css
├── i18n/messages.js
└── js/
    ├── store.js         # shared mutable state
    ├── api.js            # fetch wrapper + toast
    ├── router.js         # hash routing
    ├── i18n.js            # t()/template(), language + accent theme
    ├── format.js          # escaping, badges, labels, per-item formatting
    ├── provider.js        # provider/onboarding status helpers
    ├── shell.js           # sidebar/mobile shell, lock polling
    ├── setup.js           # the setup gate/wizard
    ├── help-modal.js      # Help & Settings
    └── list-detail.js     # list + detail rendering, decide()/refresh()
```

Names and boundaries are illustrative, not mandatory — split along the
responsibility lines the app itself already has (routing, i18n, provider
status, one module per major screen/section). Keep server-side `lib/` (Node)
and browser-side `app/js/` conceptually separate even though both use ES
module syntax; a browser module must never be imported by server code or
vice versa.

A single-workflow review queue (like the layout above) mostly needs generic
infra modules plus one `list-detail.js`. An app with several distinct
top-level views needs one module per view instead, since each view has its
own render function, its own row/detail markup, and its own item-shaped
helpers:

```text
js/
├── store.js, api.js, i18n.js, format.js, router.js, shell.js   # same generic infra
├── render.js            # tiny dispatcher: render() picks which view-render fn to call
├── <top-view>.js         # one module per top-level view/screen
├── <complex-view>.js      # a view complex enough to need its own module
├── <sub-entity>.js        # an entity nested under a view, split out because
│                           # more than one view/form needs to render it
├── forms.js                # per-item-kind detail forms
├── list-detail.js           # generic list+detail workflow for the simpler item kinds
├── actions.js               # form serialization + all delegated click/submit wiring
├── modal.js                 # a modal/dialog
└── settings.js              # a settings/preferences panel
```

Design the module map by reading the whole original file first and grouping
by view/responsibility, not by mechanically slicing at a line count — two
apps of similar size can split into very differently shaped module sets
depending on how many distinct views and nested entities each one has.

## Serve The New Files

Add a static route mirroring the existing `/i18n/*` pattern — same
path-traversal guard, same `.js`-only extension check:

```ts
app.get("/js/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/js\//, ""));
  const resolved = path.resolve(APP_DIR, "js", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "js") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});
```

## Shared Mutable State: One Object, Not Many Bindings

ES Modules give importers a live, read-only view of an exported `let` — a
module that imports `{ mode }` can read updates another module makes, but
cannot itself reassign `mode` (only the exporting module can). Multiplying
that across many independently-reassigned variables (`selectedId`, `mode`,
`uiLanguage`, timers, flags) means writing a setter function for each one.

Export one mutable object instead. Every module mutates its properties
directly — that is not reassigning the imported binding, so it works with a
plain `import { store } from "./store.js"`:

```js
// store.js
export const store = {
  state: { items: [], counts: {} },
  selectedId: null,
  mode: "all",
  uiLanguage: "en",
  // ...
};
```

```js
// anywhere else
import { store } from "./store.js";
store.selectedId = item.id; // fine — mutating a property, not reassigning `store`
```

Collections (`Set`, `Map`, arrays used as queues) can live as plain
properties too (`store.checked = new Set()`) since their mutation methods
(`.add()`, `.delete()`) don't reassign the binding either.

## Circular Dependencies Are Normal Here — Don't Contort The Design To Avoid Them

A module graph organized by responsibility will have real cycles: the router
needs to call back into whichever module owns
`refresh()`/`renderList()`/`renderDetail()`, and that module needs the
router's `navigateTo()`/`syncRoute()`. This is safe in ES Modules as long as
every cross-module reference happens **inside a function body**, never at
module-evaluation time (top level) — `function` declarations are hoisted and
their exported bindings are live before the rest of the importing module's
top-level code runs, so a function in module A can safely call an imported
function from module B even while B is still finishing its own initial
evaluation, provided the actual call happens later (e.g. in response to a
click), not immediately.

For the messiest, most-central cycles (typically the router, since nearly
everything needs to navigate, and the router needs to call back into
rendering), use a small hook-registration pattern instead of a direct
circular import, so the low-level module never needs to know about the
higher-level ones by name:

```js
// router.js
const hooks = { refresh: async () => {}, renderList: () => {} };
export function registerRouterHooks(overrides) {
  Object.assign(hooks, overrides);
}
export function navigateTo(...) {
  // ... hooks.refresh(...), hooks.renderList(), etc.
}
```

```js
// list-detail.js (or app.js, the entry point)
import { registerRouterHooks } from "./router.js";
registerRouterHooks({ refresh, renderList, renderDetail });
```

Reach for this only where the cycle is genuinely tangled (multiple modules
need each other's live functions); a plain one-directional
`import { helper } from "./other.js"` is preferable whenever only one side of
a relationship actually needs the other.

Not every cycle needs the hook-registration ceremony. A plain two-module
cycle — module A calls one of B's exports, B calls one of A's exports, and
both calls happen inside functions, not at top level — works with ordinary
`import` statements on both sides; the hoisting guarantee above already
covers it. This is the common shape between a small render dispatcher and a
single view module: the view module imports the dispatcher's `render()` to
trigger a re-render after an async action completes, and the dispatcher
imports the view module's render function to dispatch to it — two plain
imports, no hooks needed.

Reach for hook-registration instead when one *low-level* module is imported
by *several* higher-level ones and needs to call back into functions spread
across those same higher-level modules — e.g. a shared click/submit-wiring
module needs a render function and an async-refresh function that each live
in different view modules, and those same view modules already import the
wiring module for its own exports. Importing all of them by name from the
low-level module would multiply inbound/outbound edges across every view
module; registering hooks once from the entry point avoids that.

## Common Mistakes When Transcribing A Monolith

Splitting a large file is mechanical work, which makes it easy to introduce
small silent regressions while moving code. Watch for these while doing it,
and check for them again when reviewing the result:

- **Duplicating instead of importing.** If the code you're moving already
  calls a shared helper (a formatting/label helper, a search-match
  predicate), keep calling it — don't re-inline the logic in the new module.
  A hand-rolled inline replacement is easy to write slightly wrong (e.g.
  skipping a translation or formatting step the shared helper applies), and
  it silently diverges from the original the next time the shared helper
  changes.
- **Importing from the wrong sibling.** Once small helpers are spread across
  several infra modules, it's easy to import a name from the wrong one. This
  fails loudly (a `SyntaxError` on missing named export) the moment a real
  browser loads the module, but does *not* fail `node --check`, which only
  validates syntax, not that imports resolve — load the page and check the
  console, don't rely on the syntax check alone.
- **Reaching for dynamic `import()` as a shortcut.** In a codebase that
  already uses static imports plus hook-registration for its real cycles,
  there is no legitimate remaining use for dynamic `import()`. A dynamic
  `import(...).then(...)` written in the middle of a function to "avoid"
  wiring up a static import is a bug waiting to surface: it turns a
  synchronous call into an asynchronous one, which can reorder execution
  relative to whatever runs immediately after it. A real instance of this:
  code that updated some state and then called a routing/sync function
  synchronously right after, transcribed as
  `import("./x.js").then(({ fn }) => fn(...))` — the call now happens one
  microtask late, after other code that assumed it had already run. Fix: add
  the static import at the top of the file and call it directly.
- **Reaching into another module's internals instead of asking it a
  question.** If the entry point needs to know whether some piece of UI
  state is active (a modal open, a panel expanded), add a small exported
  query function (`isModalOpen()`) to the module that owns that state,
  rather than having the entry point read that module's internal DOM
  structure directly. The one-line query function keeps the internal
  structure free to change later without hunting down every place that
  peeked at it directly.

## Verification Checklist

Before handing off a componentized frontend:

- `node --check --input-type=module` every new module file (plain
  `node --check` defaults to CommonJS parsing and will misreport valid ESM
  `import`/`export` syntax as an error).
- Load the app fresh in a real browser with no cached config and confirm
  zero console errors — a missing export, a typo'd import path, or an
  unregistered hook shows up immediately as a
  `SyntaxError`/`ReferenceError`/`TypeError` at load or first interaction,
  not later. This is also the only way to catch a wrong-but-existing import
  source (see above) — `node --check` won't.
- Re-run the full interaction surface end to end: every workflow filter,
  search, bulk selection and decision, every Help & Settings tab, language
  switch, accent theme switch, and the mobile viewport — a refactor with no
  behavior change should have identical, not just similar, output.
