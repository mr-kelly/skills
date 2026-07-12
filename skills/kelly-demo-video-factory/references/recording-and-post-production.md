# Recording, Post-Production, and HyperFrame Handoff

## Status lifecycle

```text
idea -> needs_review -> approved -> recording -> post_production -> done
```

- `idea`: outline exists only in conversation, not yet proposed to Busabase.
- `needs_review`: proposed as a `videos` record; `verified-claims` may still be empty
  or in progress.
- `approved`: claim verification is complete (see `claim-verification.md`), storyboard
  is final, human has signed off on every shot's script line.
- `recording`: shots are being captured. Use `scripts/set_shot_status.ts <id> recorded`
  per shot as footage/screen-recordings come in; `npm run status` shows live progress
  per video (`recorded:N, pending:M, needs_reshoot:K`).
- `post_production`: all shots `recorded`; editing/subtitling/music handed off to the
  `video-editing` skill (kapps) or Remotion HyperFrame project (see below).
- `done`: final video URL filled into `videos.final-video-url`.

Move `videos.status` forward with `scripts/propose_video.ts`-style full-record updates
(see `busabase-client.ts` → `proposeRecordUpdate`) — always propose + merge explicitly,
never silently.

## Who records each shot

Each shot has no dedicated "owner" field of its own — the video-level `owner`
(`kelly` | `ai`) is the default, but real production usually mixes: Kelly records
talking-head/live-product shots, AI-generated b-roll or screen-recordings fill gaps.
When a shot needs a different owner than the video default, say so in that shot's
`note` field rather than adding a new field — keep the schema stable.

## Post-production handoff

Once every shot in a video is `recorded`:

1. Gather the recorded assets (attach them to each shot's `asset` field via
   `busabase assets upload`, or keep them in a local folder referenced by path in
   `note` if upload isn't practical for large raw footage).
2. Hand off editing to the kapps `video-editing` skill for cuts/captions/watermark/
   transitions, or directly to a Remotion **HyperFrame** project (see below) when the
   video needs programmatic composition (animated diagrams, code-reference overlays,
   data-driven scenes) rather than plain cut-and-caption editing.
3. Set `videos.status = "post_production"` while this is in flight.

## HyperFrame projects

"HyperFrame" is this repo's informal name for a Remotion video project living under
`videos/**` in the `kapps` monorepo (each has its own `design.md`, script, and Remotion
composition files) — there is **no dedicated schema/type for it** in the codebase (verified
2026-07-11), it's a convention, not an API. When a video graduates from a flat
storyboard into an actual Remotion composition:

1. Create/locate the project under `videos/<app>/<slug>/` in `kapps`.
2. Fill `videos.hyperframe-path` with that relative path (e.g.
   `videos/busabase-cloud/single-source-of-truth`) so the Busabase record and the
   actual Remotion project are cross-referenced both ways.
3. The Remotion composition's own script/`design.md` should stay the single source of
   truth for exact frame timing; the Busabase `video-shots` table stays the
   planning/review layer (timecodes there are approximate references, not frame-accurate).

## Final artifact

When rendering is done and the video is published, set `videos.final-video-url` and
`videos.status = "done"`.
