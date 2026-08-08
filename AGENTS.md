# AGENTS.md

Kelly's App-in-Skill workspace: 67 skills under `skills/`, each pairing an agent operating
procedure with a Busabase-backed local browser UI for human review and approval.

## Skill taxonomy

Every skill declares its own classification in `SKILL.md` frontmatter. **That frontmatter is the
single source of truth** — the site sections, the site filters, the README tables, and the
marketplace tags are all derived from it. Nothing is maintained in a second list.

```yaml
---
name: kelly-retail-intel
description: ...
metadata:
  category: industry-intel
  tags:
    - risk:gated-write
    - industry:retail
    - surface:busabase
---
```

Put this under `metadata:`, **not** as top-level `category:` / `tags:` keys. `gh skill publish`
validates frontmatter against the agentskills.io spec and one bad skill blocks the whole release;
`metadata` is the spec's free-form field (`--fix` only strips `metadata.github-*` install
metadata, leaving other subkeys alone). Top-level custom keys have no such guarantee.

### `category` — required, exactly one

One of these thirteen. They are mutually exclusive and decide which section a skill appears in.
Defined in `scripts/lib/skill-taxonomy.mjs`.

| id | Section | Who it serves |
| --- | --- | --- |
| `finance` | Finance & Back Office | money, ledgers, invoices, reconciliation |
| `invest` | Investing & Wealth | personal and family holdings |
| `rbf` | Revenue-Based Finance | RBF / private-credit fund workflows |
| `legal` | Legal & Contracts | law firms and in-house legal |
| `sales-crm` | Sales & Customer | sales, support, customer success |
| `comms` | Comms & Team | inboxes and team boards |
| `marketing` | Brand & Marketing | brand, content, launches |
| `growth` | Growth & Analytics | search, competitors, behaviour data |
| `ecommerce` | Cross-Border E-commerce | sourcing → listing → ads |
| `industry-intel` | Industry Intelligence | per-vertical daily intelligence cockpits |
| `production` | Production | video, decks, digital humans |
| `education` | Education & Teaching | deans, teachers, parents |
| `platform` | Agent & Dev Platform | building skills, running agents, ops |

`production` and `education` used to be one bucket ("Production & Teaching") because both involve
drafting content through a review queue. Split apart: `production` serves content producers
(drama/MV/digital-human/demo-video/PPT), `education` serves school stakeholders (lesson plans,
homework tutoring) — different audiences that only coincidentally shared a review-queue shape.

Why one flat axis and not a Gartner-style three-level tree: the nine `*-intel` skills are **one
capability applied across nine industries**. A tree forces a choice between collapsing them into a
single leaf (losing the industry) or scattering them (losing the fact that they are one product).
Two axes keep both: `category: industry-intel` plus `industry:retail`.

### `risk:` — required, exactly one tag

What the skill can do to the outside world. Rendered as a badge on every card and filterable,
because it is the thing a user actually wants to know before installing.

| value | meaning |
| --- | --- |
| `risk:sandbox` | Ships a fixed mock dataset; connects to no real account |
| `risk:read-only` | Reads real data; writes nothing anywhere |
| `risk:local-write` | Writes only its own Busabase base or local files; touches no external system |
| `risk:gated-write` | Has an outward action (send / post / dispatch / publish / commit) behind an approval gate |

Two rules when classifying a new skill:

- A `?demo=` deterministic mock mode is **not** evidence of `sandbox`. Nearly every skill has one
  for screenshots. `sandbox` means the skill never connects to a real account at all.
- `gated-write` means "there is an external side effect and a gate in front of it" — not "the app
  itself sends". In this repo the app never sends; the agent performs approved actions afterwards,
  usually by handing off to a channel skill such as `kelly-email`.

### `industry:` — optional

Only for genuinely vertical skills: `beauty` `ecommerce` `education` `family`
`financial-services` `insurance` `legal` `property-management` `real-estate` `restaurant`
`retail`.

### `surface:` — optional

External systems the skill talks to **directly, with its own credentials**. A handoff to another
skill is not a surface: `kelly-campaigns` drafts campaigns but hands sending to `kelly-email`, so
it carries `surface:busabase` only.

Currently in use: `busabase` (all but `agent-rules`, `publish-skills`,
`kelly-app-skill-creator-tests`), `gsc` `github` `webull` `a-share` `stripe` `mercury`
`airwallex` `creem` `sendgrid` `moonrouter` `byteplus-ark` `imap` `smtp` `whatsapp` `discord`
`slack` `telegram` `instagram` `messenger` `wechat` `webchat`.

## Adding a skill

1. Add `metadata.category` and a `risk:` tag to its `SKILL.md`.
2. Add a row to the skills table in `README.md` and `docs/README-zh-CN.md`.
3. `node scripts/sync-readme-skills.mjs` — regroups both tables by category.
4. `node scripts/sync-marketplace.mjs` — refreshes `.claude-plugin/marketplace.json` tags.
5. `node scripts/build-site.mjs` — rebuilds `docs/`.
6. `gh skill publish --dry-run` — confirm the spec check still passes.

`build-site.mjs` **fails the build** on a missing/unknown category, a missing/unknown risk tag, a
stale marketplace manifest, or stale README tables. CI runs it in `deploy-pages`, so forgetting to
classify a skill is a red build rather than a silent fallback bucket.

```
$ node scripts/build-site.mjs
build-site: 1 taxonomy error(s) — see AGENTS.md
  - kelly-radar: missing metadata.category in SKILL.md
```

## How it flows

```
skills/*/SKILL.md  (metadata.category + tags)     ← single source of truth
        │
        └── scripts/lib/skill-taxonomy.mjs        ← categories, labels, reader (zero-dependency)
                ├── scripts/build-site.mjs        → docs/ sections, filters, badges, ?category=&risk=&industry=
                ├── scripts/sync-readme-skills.mjs → README.md + docs/README-zh-CN.md tables
                └── scripts/sync-marketplace.mjs   → .claude-plugin/marketplace.json tags
```

Site filtering: **Categories** is single-select (`?category=`); **What it can touch** and
**Industry** are each single-select (`?risk=`, `?industry=`). All three intersect.

## Repo conventions

- This file is the canonical source per `agent-rules`' convention: `CLAUDE.md` is a symlink to
  `AGENTS.md`, not a separate file — edit `AGENTS.md`.
- Zero runtime dependencies in `scripts/` — hand-rolled parsers over adding a YAML library.
- `skills/app-in-skill-creator` and `skills/kelly-app-creator` are compatibility aliases whose
  `SKILL.md` is a **hardlink** to `kelly-app-skill-creator`'s. Editing one edits all three. The
  site gives them redirect pages, not cards.
- `npm run lint` / `npm run format` (Biome) and `npm run typecheck` (`scripts/**/*.mjs` is
  typechecked) must pass.
- `docs/TOOL_SKILLS_TAXONOMY.md` classifies a *different*, tool-level skill collection that does
  not live in this repo. It is unrelated to the taxonomy above.
