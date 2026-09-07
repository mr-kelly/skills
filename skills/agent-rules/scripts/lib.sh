#!/bin/bash
# Agent Rules - shared definitions and helpers.
# Sourced by create-symlinks.sh, verify-architecture.sh and agent-rules.sh.
# Every script sources this so the link table can never drift between them.

# Colors (disabled when not writing to a terminal)
if [ -t 1 ]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; DIM='\033[2m'; NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; BLUE=''; DIM=''; NC=''
fi

SOURCE_RULES="AGENTS.md"
SOURCE_SKILLS=".agents/skills"

# Link table: link|target|kind|tier|agent|note
#
#   kind  - file | dir
#   tier  - required : the agent has no other way to find the source of truth
#           legacy   : the agent now reads AGENTS.md / .agents/skills natively,
#                      so the link is kept only for older versions
#
# Verified against vendor docs on 2026-09-07 (see SKILL.md "Agent support").
AGENT_LINKS=(
    "CLAUDE.md|AGENTS.md|file|required|Claude Code|only reads CLAUDE.md"
    ".gemini/GEMINI.md|../AGENTS.md|file|required|Gemini CLI|AGENTS.md needs context.fileName in settings.json"
    ".github/copilot-instructions.md|../AGENTS.md|file|legacy|GitHub Copilot|reads AGENTS.md natively since 2025-08"
    ".cursor/rules/main.md|../../AGENTS.md|file|legacy|Cursor|reads AGENTS.md natively"
    ".kiro/steering/main.md|../../AGENTS.md|file|legacy|Kiro|reads root AGENTS.md; may not follow symlinks"
    ".claude/skills|../.agents/skills|dir|required|Claude Code|only reads .claude/skills"
    ".kiro/skills|../.agents/skills|dir|required|Kiro|only reads .kiro/skills"
    ".github/skills|../.agents/skills|dir|legacy|GitHub Copilot|reads .agents/skills natively"
    ".codex/skills|../.agents/skills|dir|legacy|OpenAI Codex|reads .agents/skills natively"
)

link_field() { printf '%s' "$1" | cut -d'|' -f"$2"; }

# Resolve the project root: explicit override > git toplevel > current directory.
# Never derived from the script's own location — the skill is usually installed
# outside the project it operates on (~/.claude/skills, a marketplace checkout, ...).
resolve_root() {
    if [ -n "${AGENT_RULES_ROOT:-}" ]; then
        if [ ! -d "$AGENT_RULES_ROOT" ]; then
            echo "AGENT_RULES_ROOT is not a directory: $AGENT_RULES_ROOT" >&2
            return 1
        fi
        (cd "$AGENT_RULES_ROOT" && pwd)
        return 0
    fi
    local top
    if top=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ]; then
        printf '%s\n' "$top"
        return 0
    fi
    pwd
}

# True when $1 is a symlink already pointing at $2.
link_is_correct() {
    [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]
}
