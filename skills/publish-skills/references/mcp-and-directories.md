# MCP servers, registries & review-gated directories

Detail + templates for **Step 7** of the publish-skills SKILL. Use when the thing you publish exposes
an **MCP server** (an app's `/api/mcp`), not just `SKILL.md` files. Reference repo:
[`busabase/skills`](https://github.com/busabase/skills) — one repo feeds the `skills` installer +
Claude Code + Codex marketplaces + the official MCP Registry.

## Repo layout (mirror busabase/skills)

```
skills/<name>/SKILL.md            the CANONICAL skill — used by `skills` / Claude Code / Buda
.claude-plugin/plugin.json        Claude Code plugin manifest (auto-discovers ./skills/)  (Step 4)
.claude-plugin/marketplace.json   Claude Code marketplace listing                          (Step 4)
.agents/plugins/marketplace.json  Codex marketplace listing (source.path → ./plugins/<name>)
plugins/<name>/.codex-plugin/plugin.json   Codex plugin manifest ("skills": "./skills/")
plugins/<name>/skills/<name>/SKILL.md      Codex needs a REAL copy inside the plugin dir
                                           (sync from the canonical skills/<name>/)
.mcp.json                         bundled MCP server (http/stdio)
server.json                       official MCP Registry entry
```

**Why Codex duplicates the skill:** verified empirically with `codex-cli` — Codex only resolves a
plugin from a `plugins/<name>/` **subdir** (root-as-plugin `path: "."` / `"./"` does not resolve), and
on install it copies **only files inside that subdir** (symlinks are not followed; a `"skills":
"../../skills/"` escape lists but is dropped on install). So the canonical skill stays at
`skills/<name>/` for the `skills` installer + Claude Code + Buda, and a synced copy lives at
`plugins/<name>/skills/<name>/` for Codex. Re-copy on every skill change:
`rsync -a --delete skills/<name>/ plugins/<name>/skills/<name>/`.

Note the **hosted MCP URL** (`https://<app>.com/api/mcp`; local default often
`http://localhost:15419/api/mcp`) and whether auth is a Bearer key. A **public HTTPS URL** is required
for the MCP Registry (remote), ChatGPT App Directory, and Anthropic Connectors — localhost won't do.

## The full landscape

| Channel | Artifact | Gate | Publish |
| --- | --- | --- | --- |
| Official MCP Registry | MCP server (metadata) | none — namespace + ownership proof, live instantly | `mcp-publisher publish` |
| Claude Code marketplace | plugin | none — decentralized git repo | user `/plugin marketplace add owner/repo` |
| Codex marketplace | plugin | none — decentralized git repo | user `codex plugin marketplace add owner/repo` |
| `skills` installer | SKILL.md | none | user `npx skills add owner/repo` |
| ChatGPT App Directory (Apps SDK) | MCP-as-app | **hard human review** | OpenAI Developer Platform |
| Anthropic Connectors directory | remote MCP | **hard human review** | submission form |
| Anthropic Desktop Extensions | `.mcpb` bundle | human review | `mcpb pack` + form |
| OpenClaw ClawHub | plugin | review — hidden until verified | `clawhub package publish org/plugin` |
| Hermes skills | SKILL.md | automated `audit` | `hermes skills publish` |

## Zero-review channel notes

**Official MCP Registry** (`registry.modelcontextprotocol.io`) is a metadata catalog, not a warehouse:
it points at your already-hosted package/URL. Preview status (schema `2025-12-11`, `/v0.1/` path) —
expect churn; moderation is reactive takedown only.

```bash
brew install mcp-publisher                         # or the release binary
mcp-publisher init                                 # scaffolds server.json
mcp-publisher login github                         # → io.github.<user>/*   (own the repo)
mcp-publisher login dns --domain <domain> --private-key <KEY>   # → com.<domain>/*  (own DNS)
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=<name>"   # verify
```

- `server.json` `name` must match the namespace you authenticated.
- Listing an **npm package** instead of a remote URL? The published `package.json` must carry
  `"mcpName": "<server name>"` to prove ownership.
- Versions are immutable — bump `version` to ship an update. Automate with a GitHub Action on `v*` tags
  using `mcp-publisher login github-oidc` (needs `permissions: id-token: write`; no stored secret).

**Codex** plugins bundle skills + apps (`.app.json`) + MCP (`.mcp.json`) inside a self-contained
`plugins/<name>/` dir (manifest `plugins/<name>/.codex-plugin/plugin.json`), listed by
`.agents/plugins/marketplace.json` and consumed via `codex plugin marketplace add <owner>/<repo>` →
`codex plugin add <name>@<marketplace>` (the install verb is `add`, not `install`). This mirrors
OpenAI's own bundled marketplaces (`openai-bundled`, etc.). OpenAI's curated Plugin Directory is **not
yet open to third-party self-serve** ("coming soon") — the git-marketplace path is how you ship now.
**`.mcp.json` key differs from Claude Code:** Codex uses `{ "<name>": {...} }` (or
`{ "mcp_servers": {...} }`); Claude Code uses `{ "mcpServers": {...} }`. Put the Codex one at
`plugins/<name>/.mcp.json` and set `"mcpServers": "./.mcp.json"` in the plugin manifest, or omit MCP
from the Codex plugin (the skill already documents `/api/mcp`).

### Codex plugin — build, verify, publish (recipe, verified with codex-cli 0.139)

1. **Scaffold** the self-contained layout (per-skill, or one bundle dir holding several skills):
   ```bash
   mkdir -p plugins/<name>/.codex-plugin plugins/<name>/skills .agents/plugins
   # write plugins/<name>/.codex-plugin/plugin.json  ("skills": "./skills/")   — template above
   # write .agents/plugins/marketplace.json  (source.path "./plugins/<name>")  — template above
   ```
2. **Sync the skill copy** into the plugin (Codex can't reach the canonical `skills/` — no symlinks, no `../`):
   ```bash
   rsync -a --delete skills/<name>/ plugins/<name>/skills/<name>/
   ```
3. **Verify locally** — add the repo as a local marketplace, install, and confirm the skill is bundled:
   ```bash
   codex plugin marketplace add ./
   codex plugin list | grep <name>                 # expect: <name>@<marketplace>  not installed
   codex plugin add <name>@<marketplace>            # the install verb is `add`
   find ~/.codex/plugins/cache/<marketplace> -name SKILL.md   # MUST list the bundled skill
   codex plugin remove <name>@<marketplace>; codex plugin marketplace remove <marketplace>   # cleanup
   ```
   If `codex plugin list` shows nothing, the marketplace file isn't at `.agents/plugins/marketplace.json`
   or the `source.path` points at `"."` instead of the `plugins/<name>` subdir. If it lists but
   `find` shows no `SKILL.md`, the skill wasn't copied *inside* the plugin dir (step 2).
4. **Publish** — commit the `plugins/` + `.agents/plugins/` tree and push. Others install with:
   ```bash
   codex plugin marketplace add <owner>/<repo>       # optionally --ref <tag>
   codex plugin add <name>@<marketplace>
   ```
   Zero review — live as soon as the repo is public. (OpenAI's *curated* Directory is separate and not
   yet self-serve.)
5. **Update** — bump `version` in `plugins/<name>/.codex-plugin/plugin.json`, re-run the step-2 rsync so
   the copy matches, commit. Existing users refresh with `codex plugin marketplace upgrade`.

## Review-gated channel checklists

Only pursue once the product has a **public HTTPS MCP server + OAuth + a privacy policy**. Human review;
SLAs are not published (plan days, not minutes). Prepare artifacts, then hand the user the submit click.

### ChatGPT App Directory (Apps SDK)
Replaced the deprecated ChatGPT plugins; apps are MCP servers.
- [ ] MCP server hosted with OAuth for authenticated services
- [ ] **Identity verification** (individual or business) for the publishing name
- [ ] **Working demo login + password with sample data** — apps that require a new-account signup to test are **rejected**
- [ ] Stable/responsive — no crashes, hangs, latency, inconsistent behavior
- [ ] Directory metadata: name, description, categories, country availability; content/privacy/data-use compliance
- Submit in the OpenAI Developer Platform dashboard; track approval there.

### Anthropic Connectors directory (remote MCP)
Any user can add an *unverified* custom connector (Settings → Connectors) with no gate; the **listed**
directory is the reviewed one.
- [ ] **Team or Enterprise** org with "Directory management access"
- [ ] Production **HTTPS** server, **streamable-HTTP or SSE** transport, **OAuth 2.0**
- [ ] **Privacy policy URL** — missing/incomplete = immediate rejection
- [ ] **You own the API/domain** — wrapping someone else's API without consent fails
- [ ] Every tool has `title` + `readOnlyHint`/`destructiveHint` annotations
- [ ] Reviewer-grade demo credentials; docs URL, support contact, icon, slug, tagline (≤55), description (≤2,000)
- Submit: `https://claude.ai/admin-settings/directory/submissions/new` (11-step form). Escalate: `mcp-review@anthropic.com`.

### Anthropic Desktop Extensions (`.mcpb`)
Local MCP server bundled as a `.mcpb` zip (renamed from `.dxt`, Nov 2025 — old `.dxt` docs are stale).
- [ ] `manifest.json` with `mcpb_version`, `name`, `version`, `server` (type node/python/binary + `entry_point` + `mcp_config`), `user_config`, `tools`, `privacy_policies`
- [ ] Built with `mcpb init` → `mcpb pack`
- [ ] Tested on **both Windows and macOS**
- Submit via the separate Desktop-Extensions form (linked from the Anthropic connectors/mcpb docs).

### OpenClaw ClawHub
- [ ] Public repo, plugin manifest, setup docs, active maintenance owner
- `clawhub package publish <org>/<plugin>` → validated, then **hidden until review + verification** finish.
- (OpenClaw's *MCP servers* have no registry — local config only; only *plugins* list on ClawHub.)

### Hermes skills
- `hermes skills publish` to a registry; `hermes skills audit` security-scans — a "dangerous" verdict
  **blocks install and cannot be `--force`-overridden**. No documented human pipeline for the curated
  `official` source beyond the automated audit.

## Templates

**`plugins/<name>/.codex-plugin/plugin.json`** (skill copy sits at `plugins/<name>/skills/<name>/`)
```json
{
  "name": "<name>",
  "version": "0.1.0",
  "description": "<one line>",
  "author": { "name": "<Org>", "url": "https://<domain>" },
  "repository": "https://github.com/<owner>/<repo>",
  "license": "MIT",
  "skills": "./skills/",
  "interface": {
    "displayName": "<Display>",
    "shortDescription": "<short>",
    "developerName": "<Org>",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://<domain>",
    "defaultPrompt": ["<starter prompt>"],
    "brandColor": "#10A37F"
  }
}
```

**`.agents/plugins/marketplace.json`** (Codex — `source.path` is relative to the repo root, and points
at the plugin **subdir**, never `"."`)
```json
{
  "name": "<name>",
  "interface": { "displayName": "<Display>" },
  "plugins": [
    {
      "name": "<name>",
      "source": { "source": "local", "path": "./plugins/<name>" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

**`.mcp.json`** (Claude Code — bundled MCP; edit `url` + add an auth header for cloud)
```json
{ "mcpServers": { "<name>": { "type": "http", "url": "https://<domain>/api/mcp" } } }
```

**`server.json`** (official MCP Registry — remote server)
```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.<domain>/<name>",
  "description": "<one line>",
  "version": "0.1.0",
  "repository": { "url": "https://github.com/<owner>/<repo>", "source": "github" },
  "websiteUrl": "https://<domain>",
  "remotes": [ { "type": "streamable-http", "url": "https://<domain>/api/mcp" } ]
}
```

## Sources

- MCP Registry: https://modelcontextprotocol.io/registry/quickstart · https://github.com/modelcontextprotocol/registry
- Codex plugins: https://developers.openai.com/codex/plugins/build · https://developers.openai.com/codex/plugins
- Claude Code plugins: https://code.claude.com/docs/en/plugin-marketplaces
- ChatGPT App Directory: https://developers.openai.com/apps-sdk/app-submission-guidelines
- Anthropic Connectors / mcpb: https://claude.com/docs/connectors/building/submission · https://claude.com/docs/connectors/building/mcpb
