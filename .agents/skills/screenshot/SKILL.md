---
name: screenshot
description: Capture, refresh, and publish mock-data App-in-Skill UI screenshots for this repository. Use when the user asks to add screenshots, update README UI galleries, show skill app interfaces, run demo-mode skill UIs, or avoid leaking live data while documenting app-based skills in this repo.
---

# Screenshot

## Purpose

Use this skill to document App-in-Skill browser UIs in this repository with safe, polished screenshots. Treat it as an internal maintenance workflow for this repo, not as a public marketplace skill.

## Guardrails

- Use demo mode for every screenshot. Never capture screens backed by live user data.
- Prefer English UI screenshots unless the user asks for another language.
- Preserve real app behavior where possible, but seed demo mode with mock data that is rich enough to show the workflow clearly.
- For each skill with an App UI, usually publish four screenshots. Use distinct scenarios instead of near-identical captures.
- Make the gallery tell the user's story: what problem the skill solves, when to use it, and which features the UI makes visible.
- Keep URL/query-string details out of the README gallery unless the user explicitly asks for setup instructions.
- Do not add internal-only skills to the public `skills/` marketplace list.

## Workflow

1. Identify the App-in-Skill UIs to document. In this repo, common targets are `skills/kelly-content`, `skills/kelly-email`, and `skills/kelly-pr-review`.
2. Add or update demo-mode support before screenshotting:
   - `?demo=1` should open a default mock scenario.
   - `?demo=<scenario>` should open a named mock scenario.
   - `lang=en` should force English UI for screenshot consistency.
   - API calls made by the frontend should preserve `demo` and `lang` query params.
   - Server routes should return deterministic mock data in demo mode and avoid writes to live systems.
3. Create varied scenarios for each UI. Aim for four scenes per app:
   - Overview or command-desk state that shows the whole workflow.
   - Queue, planning, or triage state that shows the incoming work.
   - Active review, editing, approval, or ready-to-send state.
   - Blocked, risk, handoff, export, or distribution state that shows the final decision boundary.
4. Start each local app server, open the demo URLs, and capture screenshots to `docs/screenshots/`.
5. Validate the screenshots visually:
   - The UI is loaded, not an error page.
   - Text is legible and in English unless requested otherwise.
   - The scenario is visually distinct from the other screenshots.
   - No personal, secret, or live account data is visible.
6. Update the README gallery as a visual showcase, not a usage manual:
   - Before screenshots, add a short value summary for the App UI set: the use cases, target workflow, and major features.
   - For each skill section, captions should explain the visible user value, not merely name UI widgets.
   - Do not bury the skill's purpose below the screenshots; readers should understand the use case before inspecting details.
7. Run lightweight verification:
   - Syntax-check edited JavaScript modules.
   - Confirm README image paths exist.
   - Search demo payloads and screenshots metadata paths for obvious secrets or real account names when practical.

## Screenshot Naming

Use descriptive lowercase filenames:

```text
docs/screenshots/<skill-name>-<scenario>.png
```

Examples:

```text
docs/screenshots/kelly-content-ui.png
docs/screenshots/kelly-content-topics.png
docs/screenshots/kelly-content-main.png
docs/screenshots/kelly-content-distribution.png
docs/screenshots/kelly-email-ui.png
docs/screenshots/kelly-email-all.png
docs/screenshots/kelly-email-review.png
docs/screenshots/kelly-email-blocked.png
docs/screenshots/kelly-pr-review-ui.png
docs/screenshots/kelly-pr-review-review.png
docs/screenshots/kelly-pr-review-ready.png
docs/screenshots/kelly-pr-review-blocked.png
```

## README Gallery Pattern

For each skill with an App UI, use four screenshots in a two-by-two table. Keep captions short, but make each caption describe the use case or feature value shown in the screenshot:

```html
<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/skill-scenario-a.png" alt="Skill scenario A"></td>
    <td width="50%"><img src="docs/screenshots/skill-scenario-b.png" alt="Skill scenario B"></td>
  </tr>
  <tr>
    <td><strong>Scenario A</strong><br>One sentence describing the visible workflow.</td>
    <td><strong>Scenario B</strong><br>One sentence describing the visible workflow.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/skill-scenario-c.png" alt="Skill scenario C"></td>
    <td><img src="docs/screenshots/skill-scenario-d.png" alt="Skill scenario D"></td>
  </tr>
  <tr>
    <td><strong>Scenario C</strong><br>One sentence describing the visible workflow.</td>
    <td><strong>Scenario D</strong><br>One sentence describing the visible workflow.</td>
  </tr>
</table>
```

Keep the surrounding README copy brief but useful. Include a short paragraph or bullets that summarize the user value, common use cases, and major features before the gallery.

## Finishing Checklist

- Demo mode works for default and named scenarios.
- Each App UI skill has four distinct screenshots unless there is a deliberate reason to use fewer.
- Screenshots live under `docs/screenshots/`.
- README shows images and captions without demo URLs.
- README explains the App UI use cases, value, and major features before the screenshot gallery.
- Internal helper skills live under `.agents/skills/`, not public `skills/`.
- The work is committed from the intended branch or worktree.
