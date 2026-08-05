# Kelly Demo Video Factory

Busabase-backed pipeline for planning demo/marketing videos: idea → verified storyboard →
recording progress → post-production / HyperFrame handoff.

See [`SKILL.md`](./SKILL.md) for the full workflow, data model, and boundary rules.

Quick start:

```bash
export BUSABASE_BASE_URL=http://127.0.0.1:15419   # or your busabase-cli-configured URL
node scripts/ensure_schema.mjs    # one-time, idempotent — also wires the bidirectional relation
node scripts/status.mjs           # pipeline overview
node scripts/propose_video.mjs references/example-outline.json   # propose (no merge)

cd app && pnpm install && pnpm run build:sdk && pnpm start   # read-only AirApp, browser-direct via OAuth
```

Built and smoke-tested 2026-07-12 against a live local Busabase instance seeded with
three real videos (`apps/busabase-cloud` promo series) — see `references/` for the
verification workflow those videos went through. Converted to the Busabase-only AirApp
shape (browser reads directly via `busabase-sdk` through a same-origin OAuth proxy,
instead of a static-credential server-side Hono API) and re-verified against a fresh
`busabase@0.11.0` OSS server, including the `select`/`relation`/`markdown`/`url`/
`attachment` field types.
