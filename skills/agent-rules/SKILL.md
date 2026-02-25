---
name: agent-rules
description: Align all AI coding agents to single source of truth. AGENTS.md for rules, .agents/skills/ for skills. All other files are symlinks.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
user-invocable: true
---

# Agent Rules - Single Source of Truth

Ensure all AI coding agents use the same rules and skills via symlinks.

## Quick Start

```bash
/agent-rules              # Align all agents
/agent-rules --check      # Verify alignment
/agent-rules --status     # Show current status
```

## Single Source of Truth

**Two sources only**:
1. **Rules**: `AGENTS.md` (project root) - edit here
2. **Skills**: `.agents/skills/` - edit here (SOURCE)

**Everything else is a symlink**:
- `CLAUDE.md` → `AGENTS.md`
- `.github/copilot-instructions.md` → `../AGENTS.md`
- `.cursor/rules/main.md` → `../../AGENTS.md`
- `.gemini/GEMINI.md` → `../AGENTS.md`
- `.kiro/steering/main.md` → `../../AGENTS.md`
- `.claude/skills/` → `../.agents/skills`
- `.github/skills/` → `../.agents/skills`
- `.kiro/skills/` → `../.agents/skills`
- `.codex/skills/` → `../.agents/skills`

## Architecture

```
AGENTS.md                         ← Edit rules here
.agents/skills/                   ← Edit skills here (SOURCE)

↓ All others are symlinks ↓

CLAUDE.md → AGENTS.md
.github/copilot-instructions.md → ../AGENTS.md
.cursor/rules/main.md → ../../AGENTS.md
.gemini/GEMINI.md → ../AGENTS.md
.kiro/steering/main.md → ../../AGENTS.md

.claude/skills/ → ../.agents/skills
.github/skills/ → ../.agents/skills
.kiro/skills/ → ../.agents/skills
.codex/skills/ → ../.agents/skills
```

## Supported Agents

| Agent | Skills | Instructions |
|-------|--------|--------------|
| OpenAI Codex | `.codex/skills/` → | `AGENTS.md` |
| Claude Code | `.claude/skills/` → | `CLAUDE.md` → |
| GitHub Copilot | `.github/skills/` → | `.github/copilot-instructions.md` → |
| Kiro CLI | `.kiro/skills/` → | `.kiro/steering/main.md` → |
| Cursor IDE | N/A | `.cursor/rules/main.md` → |
| Gemini CLI | N/A | `.gemini/GEMINI.md` → |

*All skills symlinks point to `.agents/skills/`*

## Usage

### Edit Rules

```bash
vim AGENTS.md    # Edit once, all agents see it
```

### Add Skill

```bash
mkdir -p .agents/skills/my-skill
vim .agents/skills/my-skill/SKILL.md
# All agents see it automatically
```

### Align All Agents

```bash
/agent-rules
```

## Critical Rules

1. ✅ **ONLY edit `AGENTS.md`** - single source for rules
2. ✅ **ONLY edit `.agents/skills/`** - single source for skills
3. ❌ **NEVER edit symlinked files** - they're just links
4. ❌ **NEVER copy files** - use symlinks only

## What About MCP Configs?

**MCP (Model Context Protocol) configs are NOT symlinked** because:
- Each agent has different config format (`.json` vs `.toml`)
- Contains agent-specific settings
- May contain sensitive info (API keys)

**MCP config locations**:
- Claude: `.claude/mcp.json`
- Kiro: `.kiro/mcp.json`
- Cursor: `.cursor/mcp.json`
- Codex: `.codex/config.toml`

**If you need to sync MCP configs**: Do it manually or create a sync script.

## Commands

```bash
/agent-rules              # Create all symlinks
/agent-rules --check      # Verify all symlinks valid
/agent-rules --status     # Show symlink status
/agent-rules --fix        # Fix broken symlinks
```

## Scripts

- `scripts/agent-rules.sh` - Main entry point
- `scripts/create-symlinks.sh` - Create symlinks
- `scripts/verify-architecture.sh` - Verify alignment

## Troubleshooting

### Symlink broken
```bash
/agent-rules --fix
```

### Skill not found
```bash
ls .agents/skills/skill-name/  # Check source exists
```

---

**Version**: 4.0  
**Last Updated**: 2026-02-20  
**Breaking Change**: Skills source moved from `.claude/skills/` to `.agents/skills/`
