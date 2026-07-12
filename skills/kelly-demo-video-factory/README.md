# Kelly Demo Video Factory

Busabase-backed pipeline for planning demo/marketing videos: idea → verified storyboard →
recording progress → post-production / HyperFrame handoff.

See [`SKILL.md`](./SKILL.md) for the full workflow, data model, and boundary rules.

Quick start:

```bash
export BUSABASE_BASE_URL=http://127.0.0.1:15419   # or your busabase-cli-configured URL
node scripts/ensure_schema.ts     # one-time, idempotent
node scripts/status.ts            # pipeline overview
node scripts/propose_video.ts references/example-outline.json   # propose (no merge)
app/start.sh                      # local review UI (read-only), http://127.0.0.1:3000+
```

Built and smoke-tested 2026-07-12 against a live local Busabase instance seeded with
three real videos (`apps/busabase-cloud` promo series) — see `references/` for the
verification workflow those videos went through.
