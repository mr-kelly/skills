#!/bin/bash
# Agent Rules - main entry point.
#
# Operates on the project you are standing in (git toplevel, or $PWD outside a
# repo, or --root / $AGENT_RULES_ROOT). The skill itself normally lives outside
# that project, so its own location is never used to guess the target.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

show_help() {
    cat <<'EOF'
Agent Rules - align every AI coding agent on one source of truth

Usage:
  agent-rules.sh [options]           Create/repair links (default)
  agent-rules.sh --check [options]   Verify alignment; exit 1 if broken
  agent-rules.sh --status [options]  Print current link status, never exits 1
  agent-rules.sh --help

Options:
  --root <path>   Project to operate on (default: git toplevel, else $PWD)
  --minimal       Only create links agents still require; skip legacy ones
  --force         Move an existing real file/dir to <path>.bak instead of skipping

Environment:
  AGENT_RULES_ROOT  Same as --root

Source of truth:
  AGENTS.md         all rules
  .agents/skills/   all skills
EOF
}

MODE="fix"
PASS_ARGS=()
while [ "$#" -gt 0 ]; do
    case "$1" in
        --check|--verify) MODE="check" ;;
        --status)         MODE="status" ;;
        --fix|--align)    MODE="fix" ;;
        --help|-h)        show_help; exit 0 ;;
        --root)
            [ "$#" -ge 2 ] || { echo "--root needs a path" >&2; exit 2; }
            export AGENT_RULES_ROOT="$2"; shift ;;
        --root=*)         export AGENT_RULES_ROOT="${1#--root=}" ;;
        --minimal|--force) PASS_ARGS+=("$1") ;;
        *) echo "Unknown option: $1" >&2; echo ""; show_help; exit 2 ;;
    esac
    shift
done

ROOT="$(resolve_root)" || exit 2

case "$MODE" in
    check)
        bash "$SCRIPT_DIR/verify-architecture.sh"
        exit $?
        ;;
    fix)
        bash "$SCRIPT_DIR/create-symlinks.sh" ${PASS_ARGS+"${PASS_ARGS[@]}"} || exit $?
        echo ""
        bash "$SCRIPT_DIR/verify-architecture.sh"
        exit $?
        ;;
    status)
        cd "$ROOT" || exit 2
        echo -e "${BLUE}📊 Agent alignment — $ROOT${NC}"
        echo ""
        for entry in "${AGENT_LINKS[@]}"; do
            link="$(link_field "$entry" 1)"
            target="$(link_field "$entry" 2)"
            tier="$(link_field "$entry" 4)"
            agent="$(link_field "$entry" 5)"
            note="$(link_field "$entry" 6)"
            suffix=""
            [ "$tier" = "legacy" ] && suffix=" ${DIM}legacy — $agent $note${NC}"

            if link_is_correct "$link" "$target" && [ -e "$link" ]; then
                echo -e "  ${GREEN}✓${NC} $link → $target$suffix"
            elif [ -L "$link" ]; then
                echo -e "  ${RED}✗${NC} $link → $(readlink "$link") ${DIM}(broken or wrong target)${NC}"
            elif [ -e "$link" ]; then
                echo -e "  ${RED}✗${NC} $link ${DIM}(real file/dir, not a link)${NC}"
            elif [ "$tier" = "required" ]; then
                echo -e "  ${RED}✗${NC} $link ${DIM}(missing — $agent needs it)${NC}"
            else
                echo -e "  ${YELLOW}⚠${NC} $link ${DIM}(missing)${NC}$suffix"
            fi
        done
        echo ""
        echo "Source:"
        if [ -f "$SOURCE_RULES" ] && [ ! -L "$SOURCE_RULES" ]; then
            echo -e "  ${GREEN}✓${NC} $SOURCE_RULES"
        else
            echo -e "  ${RED}✗${NC} $SOURCE_RULES missing or is a symlink"
        fi
        if [ -d "$SOURCE_SKILLS" ]; then
            count=0
            for s in "$SOURCE_SKILLS"/*/SKILL.md; do [ -f "$s" ] && count=$((count + 1)); done
            echo -e "  ${GREEN}✓${NC} $SOURCE_SKILLS/ ($count skills)"
        else
            echo -e "  ${RED}✗${NC} $SOURCE_SKILLS/ missing"
        fi
        exit 0   # --status reports, it never fails
        ;;
esac
