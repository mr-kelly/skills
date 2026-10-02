# Agent Rules

Align every AI coding agent in a repo on one source of truth.

## Single Source of Truth

**Edit only these two places**:
- `AGENTS.md` — all rules
- `.agents/skills/` — all skills

Everything else is a symlink into them. Don't edit the links.

## Quick Start

```bash
/agent-rules              # create or repair links in the current project
/agent-rules --check      # verify; exit 1 when broken
/agent-rules --status     # report only
/agent-rules --minimal    # skip links agents no longer need
/agent-rules --root PATH  # target another project
```

Runs against the git toplevel of your working directory, not the skill's install
location.

## Architecture

```
AGENTS.md                 ← edit rules here
.agents/skills/           ← edit skills here

↓ symlinks ↓

CLAUDE.md                       → AGENTS.md
.gemini/GEMINI.md               → ../AGENTS.md
.github/copilot-instructions.md → ../AGENTS.md      (legacy)
.cursor/rules/main.md           → ../../AGENTS.md   (legacy)
.kiro/steering/main.md          → ../../AGENTS.md   (legacy)

.claude/skills/                 → ../.agents/skills
.kiro/skills/                   → ../.agents/skills
.github/skills/                 → ../.agents/skills (legacy)
.codex/skills/                  → ../.agents/skills (legacy)
```

**legacy** = that agent now reads `AGENTS.md` / `.agents/skills` natively; the
link only helps older versions, and `--check` downgrades it to a warning.

## Supported Agents

- Claude Code — rules `CLAUDE.md` →, skills `.claude/skills` → (both required)
- Gemini CLI — rules `.gemini/GEMINI.md` → (required)
- Kiro — rules `.kiro/steering/main.md` →, skills `.kiro/skills` → (skills required)
- GitHub Copilot — rules `.github/copilot-instructions.md` →, skills `.github/skills` →
- OpenAI Codex — rules `AGENTS.md` (native), skills `.codex/skills` →
- Cursor — rules `.cursor/rules/main.md` →

## Rules

1. ✅ Edit `AGENTS.md` for rules
2. ✅ Edit `.agents/skills/` for skills
3. ❌ Never edit a symlinked file
4. ❌ Never copy instead of linking

## MCP Configs

**Not symlinked** — each agent has its own format and may store keys:
`.claude/mcp.json`, `.kiro/mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`.

## Files

- `SKILL.md` — full documentation
- `scripts/` — alignment, verification, and self-test scripts

```bash
bash scripts/test-agent-rules.sh   # self-test
```
