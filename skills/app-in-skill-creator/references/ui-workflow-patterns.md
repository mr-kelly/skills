# UI Workflow Patterns

Use this reference when designing App-in-Skill interaction patterns: sidebar workflow navigation, human attention panels, detail actions, review notes, hash routes, Help & Settings, i18n, and approval semantics.

For layout mechanics, mobile CSS, sidebar drawer, scrim, and panel icon implementation, use `mobile-shell-layout.md`.

## Product Taste

Build a quiet local tool, not a landing page.

Good App-in-Skill surfaces feel like a small cockpit for one workflow:

- dense but calm,
- specific to the work,
- neutral surfaces,
- soft borders,
- sparse shadows,
- restrained accent color,
- transparent icon buttons,
- clear workflow state.

Avoid:

- hero sections,
- marketing copy,
- decorative gradients,
- nested cards,
- black floating mobile buttons,
- hamburger glyphs when a panel icon fits better,
- loud selected-row fills,
- heavy card shadows,
- hover states that turn every control into a primary action.

## Human Attention Panel

The first screen should reduce uncertainty. A user opening the app should not need to inspect filters, counts, and item statuses to understand what is expected of them.

Default sidebar order:

1. Brand/app name.
2. Human attention panel.
3. Divider.
4. Workflow filters/views.
5. Help/settings at the bottom.

The human attention panel should answer: "what do I need to do?"

Use task language, not data-model language:

- `Need a note or decision`
- `Ready for agent next`
- `Blocked`
- `Needs configuration`
- `Waiting on connector`

Avoid vague labels like `Pending`, `Queue`, or `Review required` without saying what action the human can take.

## Workflow Filters

Use workflow filters as primary navigation:

- `All`
- `Needs Review`
- `Approved` or `Ready for agent next`
- `Done`
- `Blocked`

Add `To approve` only when it represents a genuinely distinct human decision. Do not create a default waiting room for obvious next steps.

Show categories and risks as row/detail badges, not sidebar navigation.

Add hover tooltips for icon buttons, workflow filters, and action buttons.

## Accent Color System

Support an Apple/macOS-like accent color system for operator apps unless the app is truly read-only or visually branded. Keep it as a system accent, not a full skin: selected rows, active tabs, focus rings, links, primary workflow buttons, badges, and human-attention highlights should read from CSS variables while the app stays neutral.

Use separate tokens for display color, accessible button color, soft tints, borders, focus rings, text, and contrast. A good baseline token set is:

```css
:root {
  --accent: #007aff;
  --accent-strong: #0057b8;
  --accent-soft: #eaf3ff;
  --accent-wash: #f5f9ff;
  --accent-line: #b8d7ff;
  --accent-focus: rgba(0, 122, 255, 0.28);
  --accent-text: #064f9e;
  --accent-contrast: #ffffff;
}
```

Start from Apple-style Blue, Purple, Pink, Red, Orange, Yellow, Green, and Graphite. Deepen button and text tokens as needed for at least 4.5:1 contrast on primary buttons and selected text.

Put compact circular swatches with a selected ring/check in `Help & Settings`. Persist the selected accent in `localStorage`, keep native checkboxes/radios aligned with `accent-color`, and verify the picker wraps cleanly on phone widths without horizontal overflow.

## Detail Actions

Use the detail pane for meaningful judgment and execution preparation:

- primary detail action near the top,
- secondary actions in a compact menu,
- bulk actions only after selection,
- concise decision labels,
- immediate visual feedback after a local decision.

Do not make the user approve the same thing twice. If clicking `Approve plan` only moves an item from one waiting state into another waiting state, collapse those states.

Human clicks should be reserved for:

- judgment,
- edits,
- exceptions,
- irreversible or sensitive actions,
- explicit approvals.

## Review Notes And Drafts

Prefer one `Review note` textarea for user guidance.

Show an editable draft only when:

- a draft already exists,
- the proposed action is a reply/send/publish-style action,
- or the user requests a draft.

For review workflows where the likely next step is a reply or customer-visible artifact, include `suggested_reply` or an outline so the user can approve/edit directly instead of asking the agent to draft later.

For queues discussed back in chat, show stable per-batch row references such as `Review #1` in both list and detail. This lets the agent resolve comments like "change #2" unambiguously.

## Hash Routing

Use native hash routing for meaningful state:

```text
#/items
#/items/<id>
#/settings
#/needs-review/<id>
#/approved/<id>
```

Do not add a router dependency just to make URLs change.

Route sidebar navigation, list selection, detail tabs, settings/help panels, and other share-worthy states through one small hash router so:

- browser back/forward works,
- refresh restores the same view,
- users can copy a URL back into chat.

Use `history.replaceState` for keyboard selection or automatic route cleanup so arrow-key browsing does not flood history. Use normal hash changes for user-initiated navigation.

Prefer hash routes over `history.pushState` unless the local server intentionally implements an index.html fallback for every app path.

## Auto Refresh

Auto-refresh local files on a timer, but do not redraw while the user is actively editing a textarea or non-search input.

The app may still poll lock state during edits so the user can see when the agent is processing.

## Help And Settings

Keep setup/tutorial details out of the always-visible sidebar. Provide a small `Help & Settings` button or equivalent.

Useful tabs:

- Guide,
- Files,
- Accounts,
- Profile,
- Style,
- Knowledge,
- Language,
- Config.

Show safe summaries only. Never expose secrets or raw private file contents.

If the skill uses private config, Help & Settings should let the user confirm:

- active data provider,
- config source,
- account summaries,
- identities,
- profile,
- style choices,
- official links,
- knowledge sources,
- required env var readiness.

## Multilingual UI

Support multilingual UI chrome when the app has non-English users or mixed-language workflows.

Use `app/i18n/`, for example:

```text
app/i18n/messages.js
```

Keep translation data out of the main app logic.

Default language mode should be `Auto`, following `navigator.languages`/browser language. Also provide an explicit language selector in Help & Settings for supported languages and persist the override locally.

Keep user data and domain content untranslated unless the workflow explicitly asks for translation. For mixed-language source material, preserve the original and add translation/summary as a helper field.

## Local HTTP

Use local HTTP on `127.0.0.1`. Do not expose the app externally.

Prefer ports in the `3000-4000` range and report the actual launcher URL.

## Mobile

Mobile responsiveness is part of the default app contract, not a polish pass.

At phone widths, use:

- one-column shell,
- off-canvas sidebar drawer with scrim,
- compact mobile top bar,
- list/detail as separate full-height panes,
- sticky back-to-list in detail,
- sticky primary detail action,
- secondary actions in compact menu,
- selection-only horizontal bulk toolbar.

Verify at least one desktop viewport and a 390px-wide phone viewport before handoff. Confirm:

- sidebar drawer opens/closes,
- list rows are scannable,
- selecting a row opens detail,
- back returns to list,
- sticky actions do not cover content,
- modals fit,
- no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`).

Use `mobile-shell-layout.md` as the implementation checklist and patch template.
