# Runtime Architecture

Use this reference when creating or changing the local app runtime, directory layout, server, frontend stack, dependencies, or generated asset policy for an App-in-Skill.

## Default Structure

Use this structure for new App-in-Skill projects unless the domain has a concrete reason to differ:

```text
skill-name/
├── SKILL.md
├── package.json  # hono + @hono/node-server; "type":"module"; Node >=23.6
├── agents/
│   └── openai.yaml
├── assets/          # optional; include only when the skill has bundled assets
│   ├── screenshots/ # optional UI screenshots
│   └── demo-recordings/ # optional walkthrough clips; video must use Git LFS
├── app/
│   # frontend: plain vanilla .js, served directly by the browser
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── start.sh
│   ├── i18n/
│   │   └── messages.js
│   ├── server/
│   │   ├── index.ts
│   │   ├── hono.ts
│   │   ├── launcher.ts
│   │   ├── paths.ts
│   │   ├── types.ts
│   │   ├── lock.ts
│   │   ├── batch-store.ts
│   │   ├── decisions.ts
│   │   └── state.ts
│   └── .data/  # handoff files, gitignored
├── scripts/
│   ├── generate_batch.ts
│   ├── execute_decisions.ts
│   └── validate_ui_schema.ts
├── lib/
│   ├── paths.ts
│   ├── common.ts
│   └── data-provider/
│       ├── provider-interface.ts
│       ├── index.ts
│       └── local-file-provider.ts
├── references/
│   └── ui-schema.md
├── config.example.json
└── config.local.json  # gitignored
```

Keep shared runtime code in `lib/`: path constants in `lib/paths.ts`, JSON/lock/batch helpers in `lib/common.ts`, and configurable data access in `lib/data-provider/`. Keep `scripts/` as thin CLI entrypoints that import from `lib/`; do not create a parallel `scripts/lib/` tree.

## Server Runtime

Use Node.js by default for deterministic scripts and the local app server.

The app server is a Hono app:

- Base dependencies: exactly `hono` and `@hono/node-server`.
- Bootstrap in `app/server/index.ts` with `serve({ fetch: app.fetch, hostname, port })`.
- Put routes in `app/server/hono.ts`.
- Prefer `127.0.0.1` and local ports in the `3000-4000` range, starting at `3000`.
- If a port is occupied, reuse it only when the health/state response proves it is the same app; otherwise choose the next available port.
- Always report the actual URL printed by the launcher.

Hono is chosen because it is Web-standard `fetch(Request) -> Response` code. The same `app.fetch` can later run in Cloudflare Workers once the data layer is cloud-backed.

The Hono app should be platform-neutral. Handlers reach handoff files and config only through `lib/data-provider/`, not by scattering direct `node:fs` calls. Attachment/file serving that must touch the local disk should stay behind a guard and is understood to be Node-only until the provider serves it.

## TypeScript On Node

Author the Node side in TypeScript (`.ts`):

- `app/server/`, `scripts/`, and `lib/` are `.ts`.
- Run directly by Node >=23.6 native type stripping, or by bun.
- No build step for the server.
- Set `"type": "module"` and `"engines": { "node": ">=23.6" }`.
- Point package scripts and `start.sh` at the `.ts` entrypoints.
- Relative imports carry the real `.ts` extension.
- The repo `tsconfig.json` should include `allowImportingTsExtensions` plus `skills/**/*.ts`.

Use erasable-only TypeScript syntax:

- OK: type annotations, `interface`, `type`, `as`, `as const`, `satisfies`, `import type`.
- Not OK: `enum`, `namespace`, constructor parameter properties, decorators.

Put domain shapes such as snapshot, batch, item, state, and config in `app/server/types.ts`. Annotate exported function boundaries and keep `catch`/config edges honest with small interfaces or casts. CI should run `biome check` and `tsc --noEmit`.

## Frontend Runtime

The frontend stays zero-build vanilla JavaScript:

- `index.html`
- `app.js`
- `styles.css`
- `app/i18n/messages.js`

Client files are `.js`, not `.ts`; browsers cannot strip TypeScript types. Do not add a client framework or build step by default. No Vite, React, Preact JSX, wouter, esbuild, or bundler for ordinary review queues and dashboards.

The vanilla app should own:

- hash routing,
- i18n,
- auto-refresh,
- list/detail state,
- mobile shell behavior,
- Help & Settings modal,
- local file review surfaces.

If save-and-refresh during development is useful, add a small dev-only SSE live reload instead of a bundler.

## Frontend Escape Hatches

Choose the lowest tier that fits:

| Tier | Choose when the app is | Stack | Build step |
| --- | --- | --- | --- |
| Default | a dashboard, review queue, or form | vanilla `.js` | none |
| Reactive, still zero-build | string templates get unwieldy | `preact` + `htm` via ESM/import-map, optionally signals | none |
| Complex SPA exception | one skill genuinely outgrows `htm` | Preact + Vite | Vite for that skill only |
| React proper, rare | a React-only capability is required | React + Vite | Vite for that skill only |

The reason JSX is not the default is simple: JSX requires a build tool. Native type stripping strips types but does not transform JSX. A JSX client framework reintroduces the build step the server deliberately avoids and increases dependency surface for a small local operator tool.

Prefer Preact over React at the SPA tier unless there is a specific React-only need.

## Dependency Policy

Add dependencies only when the skill truly needs an external integration or specialized parser that native Node cannot reasonably provide:

- IMAP/SMTP,
- MIME email parsing,
- browser automation,
- document parsing,
- OAuth/API clients,
- database drivers,
- cloud data-provider SDKs such as Busabase.

Keep these in integration/adapter code, not in the base App UI. If the app can review local handoff files without the dependency, it must still be able to run.

Do not add by default:

- `dotenv`,
- Express,
- YAML runtime config or the `yaml` package,
- frontend build stacks,
- client routers.

Prefer JSON for runtime config and handoff files: `config.example.json`, `config.local.json`, `.env`, and files under `app/.data/`.

## Gitignore And Generated Assets

Keep these ignored by git:

- `config.local.json`
- legacy `config.local.yml`
- `*.local.json`
- legacy `*.local.yml`
- `.env.local`
- `.env`
- `app/.data/`

`.data/` is not excluded by many default `.gitignore` templates, so add it explicitly.

Screenshots and recordings are optional documentation assets, not default scaffold output. Do not create screenshots, screenshot folders, demo recordings, or galleries unless the user explicitly asks for them or existing visual assets are already part of the work.

When screenshots exist, put them in `assets/screenshots/` and reference them from that skill's own `README.md` and `SKILL.md`.

Use deterministic app screenshots:

- Capture desktop screenshots at `1440x900` by default. This is the canonical source size for README galleries and framed docs images.
- Capture phone screenshots separately at `390x844`. Do not mix desktop and phone captures in one composite image.
- Use `360x740` only as a narrow-phone verification viewport unless a dedicated narrow-phone screenshot is explicitly requested.
- Use demo-safe URLs such as `?demo=<scene>&lang=<lang>` and hash routes for the view/item being captured.
- Capture raw app UI first, then frame README/gallery PNGs with the repo framing tool. Do not screenshot an already framed image.
- Keep SVG screenshots only for intentionally hand-authored static diagrams; App UI screenshots should be PNG captures.

When walkthrough clips are intentionally part of the skill package, put final clips in `assets/demo-recordings/` and ensure MP4 files are tracked by Git LFS before staging. If LFS is unavailable or the clip is only a temporary review artifact, keep the video outside the repo and commit only lightweight docs such as the external artifact path, recording recipe, or a short summary. Clean raw frames, temporary browser profiles, and scratch scripts unless the user asked to keep a reusable recording harness.
