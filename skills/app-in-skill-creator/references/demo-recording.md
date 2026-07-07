# App Demo Recording

Use this reference when the user explicitly asks for a demo recording, walkthrough video, screen capture, or short product clip for an App-in-Skill UI. Do not create recordings by default; they are documentation assets, like screenshots, and should be generated only when requested or when an existing recording workflow is being updated.

The best demo recording shows workflow state changing, not just a static UI tour. For review-queue apps, the main story is:

```text
Needs Review -> human edit/decision -> Approved / Ready for agent next -> Done or Blocked
```

Sidebar view switching is useful when it proves that workflow story. It should not become a slow menu tour.

## Recommended Clip Shape

Aim for a short, dense clip: 20-45 seconds for README/docs, 60-90 seconds only when the workflow has several distinct surfaces.

For a review queue, record this sequence by default:

1. Open a deterministic demo URL on the main human-work view, usually `Needs Review`.
2. Pause briefly on the human-attention panel so the viewer sees what needs the operator.
3. Select one realistic item with a stable visible reference such as `Review #1`.
4. Show the detail pane: source context, risk/category badges, suggested action, and any draft.
5. Perform one meaningful human action:
   - edit or confirm a draft,
   - add a review note,
   - approve send/archive/publish/export,
   - request changes,
   - or block a risky item.
6. Show immediate local feedback: toast, badge, changed row state, or updated decision label.
7. Switch to `Approved` or the domain equivalent to show the item ready for agent execution.
8. Switch to `Done` or `Blocked` to show the post-execution or terminal state.

That is enough. The viewer should understand the loop without seeing every row, every settings tab, or every possible action.

## Sidebar Views

Do include sidebar views when they carry workflow meaning:

- `All`: quick opening context only if it differs from `Needs Review`.
- `Needs Review`: primary human work queue.
- `Approved` / `Ready for agent next`: proof that local approval was recorded.
- `Done`: proof that execution/reporting state is represented.
- `Blocked`: useful when the app has a safety story or missing-config story.

Do not spend time on empty views unless emptiness is the point. If a view is normally empty in the live app, create a deterministic demo scene for it instead of recording a blank panel.

For documentation videos, prefer one of these patterns:

- **Workflow pass:** `Needs Review -> approve -> Approved -> Done`.
- **Safety pass:** `Needs Review -> risky item -> Blocked`.
- **Operator pass:** `All -> Needs Review -> detail -> note/edit -> approve`.

Avoid clicking every sidebar item in order just to show that navigation works. A demo should feel like work getting handled.

## Approval Actions

For App-in-Skill demos, an approval action is the strongest visual proof of the pattern. Record at least one if the app supports it.

Good actions to show:

- a primary detail action, such as `Approve send`, `Approve archive`, `Publish`, or `Export`;
- a secondary action from the compact action menu, such as `Request changes`, `Mark read`, or `Block`;
- a saved review note followed by an approval;
- an editable draft change before approval.

Keep typing short. Paste or programmatically insert text if the recording script controls the browser. Long typing makes the video feel slower than the product.

Never record an action that performs a real external side effect. Demo actions must be local-only or simulated:

- Use `?demo=...` routes that return deterministic mock data.
- Demo decision endpoints should respond without writing private files or touching external systems.
- If the app cannot safely simulate mutation, use separate demo scenes such as `?demo=needs-review`, `?demo=approved`, and `?demo=done` to show the before/after states.

## Scenes And URLs

Every App-in-Skill that is likely to be recorded should expose deterministic demo URLs. Recommended shape:

```text
http://127.0.0.1:<port>/?demo=needs-review&lang=en#/needs-review/<item-id>
http://127.0.0.1:<port>/?demo=approved&lang=en#/approved/<item-id>
http://127.0.0.1:<port>/?demo=done&lang=en#/done/<item-id>
http://127.0.0.1:<port>/?demo=blocked&lang=en#/blocked/<item-id>
```

Use `lang=zh` or `lang=zh-CN` when recording Chinese documentation. UI chrome should localize, while domain content should stay realistic for the intended viewer.

Demo mode must not read or write:

- private config files,
- secret env values,
- `app/.data/` handoff files,
- live account data,
- external services.

If the demo needs to show approved or executed state, generate it from deterministic in-memory mock data or bundled non-sensitive fixtures.

## Recording Quality

Use a stable desktop viewport for the primary clip:

- 1280x720 for README/docs and GitHub previews.
- 1440x900 when dense enterprise surfaces need more room.
- 390x844 for a separate mobile shell clip, not mixed into the desktop workflow clip.

Keep the recording visually legible:

- show a visible cursor or click pulse;
- optionally spotlight the active row, note field, or approval button;
- hold important states for 0.7-1.5 seconds;
- avoid full-page scrolling unless the scroll itself explains the workflow;
- keep modals and menus open long enough to read;
- avoid tooltips covering the thing being demonstrated.

The sidebar may be collapsed/opened in a separate shell demo, but it usually should not interrupt the main workflow recording. For mobile demos, record drawer open/close, list-to-detail, sticky action, and back-to-list as a separate clip.

## Implementation Notes

Recording helpers are build/documentation tooling. Keep them out of the app runtime path.

Recommended output location:

```text
skill-name/assets/demo-recordings/<skill-name>-demo-<lang>.mp4
```

Final MP4 walkthroughs committed to the repo must be tracked by Git LFS. Add or verify an attribute such as:

```text
skills/*/assets/demo-recordings/*.mp4 filter=lfs diff=lfs merge=lfs -text
```

If Git LFS is unavailable, or the clip is only a temporary review artifact, keep the MP4 outside the repo and commit only the external path, recording recipe, or summary.

Generated raw frames, temporary browser profiles, and scratch scripts should usually be deleted before handoff unless the user asked for a reusable recording harness. If a harness is intentionally kept, put it under `scripts/` or `assets/demo-recordings/` with a clear name and make sure it never stores private data.

A robust automation script should:

- start or reuse the local app through `app/start.sh`;
- open only `127.0.0.1` demo URLs;
- use hash routes for sidebar views and selected items;
- prefer stable selectors or `data-testid` over raw coordinates;
- inject only temporary cursor/spotlight CSS into the browser page;
- capture a fixed viewport;
- encode to H.264 MP4 with `yuv420p` for broad compatibility;
- run `ffprobe` or equivalent after encoding to verify duration, size, codec, and dimensions.

The app itself should not gain a screenshot/recording dependency. Use external browser automation, Chrome DevTools Protocol, Playwright, or the available browser tool from the agent environment.

## Acceptance Checklist

Before handing off a demo recording, verify:

- The clip uses deterministic demo-safe data.
- No secret values, private account data, real customer data, or local file paths that expose sensitive context are visible.
- At least one workflow state changes or is shown across views.
- At least one human decision/edit/approval is visible for review queues.
- Sidebar views are used to clarify state, not merely clicked through.
- The final video plays locally and has expected dimensions/duration.
- Only intended final artifacts remain; raw frames and temporary browser profiles are cleaned up.
