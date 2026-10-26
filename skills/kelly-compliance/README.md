# Kelly Compliance

A Busabase workbench for SaaS cloud baselines and SOC 2 readiness: scoped programs, independent control dimensions, period-aware evidence review, accountable gaps and expiring exceptions.

Install `npx busabase-cli@0.99.1 install ./skills/kelly-compliance`, then run `node scripts/setup.mjs --apply` from the skill with your selected Busabase connection. Includes eight typed Bases, native table Views, guide, manual, private Drive and Hono/vanilla AirApp. Start without AWS credentials: import existing reports or register private evidence indexes.

Use `?demo=1` for deterministic synthetic data. Live mode uses SDK session client and ChangeRequests. Local AWS uses a finite read catalog with independent authorization and caller identity binding; it does not enable services or remediate.

A snapshot is not period operation. Each evidence dimension requires independent review, and risk acceptance never turns failures green. Outputs are preparation materials, not audit opinions or certification.

See [SKILL.md](SKILL.md), [imports](references/imports.md), [AWS reads](references/aws.md), [sources](references/sources.md). Run `pnpm check && pnpm test` plus app SDK/editorial checks.
