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
- Use distinct scenarios for each app instead of three near-identical screenshots.
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
3. Create varied scenarios for each UI. Aim for three scenes per app:
   - Default or overview state.
   - Active review or approval state.
   - Blocked, risk, handoff, or distribution state.
4. Start each local app server, open the demo URLs, and capture screenshots to `docs/screenshots/`.
5. Validate the screenshots visually:
   - The UI is loaded, not an error page.
   - Text is legible and in English unless requested otherwise.
   - The scenario is visually distinct from the other screenshots.
   - No personal, secret, or live account data is visible.
6. Update the README gallery as a visual showcase, not a usage manual.
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
docs/screenshots/kelly-content-topics.png
docs/screenshots/kelly-content-main.png
docs/screenshots/kelly-content-distribution.png
docs/screenshots/kelly-email-all.png
docs/screenshots/kelly-email-review.png
docs/screenshots/kelly-email-blocked.png
docs/screenshots/kelly-pr-review-review.png
docs/screenshots/kelly-pr-review-ready.png
docs/screenshots/kelly-pr-review-blocked.png
```

## README Gallery Pattern

For each skill, show screenshots first and keep captions short. Use a two-column first row and a single third screenshot row:

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
    <td></td>
  </tr>
  <tr>
    <td><strong>Scenario C</strong><br>One sentence describing the visible workflow.</td>
    <td></td>
  </tr>
</table>
```

Keep the surrounding README copy brief. A line such as "These skills include local browser UIs for review, approval, and handoff workflows." is enough.

## Finishing Checklist

- Demo mode works for default and named scenarios.
- Screenshots live under `docs/screenshots/`.
- README shows images and captions without demo URLs.
- Internal helper skills live under `.agents/skills/`, not public `skills/`.
- The work is committed from the intended branch or worktree.
