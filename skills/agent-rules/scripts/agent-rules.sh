#!/bin/bash
# Agent Rules - Main Entry Point

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

cd "$REPO_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
    echo "Agent Rules - Universal AI Agent Configuration Alignment"
    echo ""
    echo "Usage:"
    echo "  $0                    Align all agents (create symlinks)"
    echo "  $0 --check            Verify current alignment"
    echo "  $0 --fix              Fix broken symlinks"
    echo "  $0 --status           Show alignment status"
    echo "  $0 --help             Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                    # Align all agents"
    echo "  $0 --check            # Verify alignment"
    echo ""
}

case "${1:-}" in
    --check|--verify)
        echo -e "${BLUE}🔍 Verifying agent alignment...${NC}"
        bash "$SCRIPT_DIR/verify-architecture.sh"
        ;;
    --fix|--align)
        echo -e "${BLUE}🔧 Fixing agent alignment...${NC}"
        bash "$SCRIPT_DIR/create-symlinks.sh"
        echo ""
        echo -e "${GREEN}✅ Running verification...${NC}"
        bash "$SCRIPT_DIR/verify-architecture.sh"
        ;;
    --status)
        echo -e "${BLUE}📊 Agent Alignment Status${NC}"
        echo ""
        echo "Skills Symlinks:"
        for dir in .claude/skills .github/skills .kiro/skills .codex/skills; do
            if [ -L "$dir" ] && [ -e "$dir" ]; then
                target=$(readlink "$dir")
                echo -e "  ${GREEN}✓${NC} $dir → $target"
            elif [ -L "$dir" ]; then
                echo -e "  ${YELLOW}⚠${NC} $dir (broken symlink)"
            else
                echo -e "  ${YELLOW}✗${NC} $dir (not a symlink)"
            fi
        done
        echo ""
        echo "Instruction Symlinks:"
        for file in CLAUDE.md .github/copilot-instructions.md .cursor/rules/main.md .gemini/GEMINI.md .kiro/steering/main.md; do
            if [ -L "$file" ] && [ -e "$file" ]; then
                target=$(readlink "$file")
                echo -e "  ${GREEN}✓${NC} $file → $target"
            elif [ -L "$file" ]; then
                echo -e "  ${YELLOW}⚠${NC} $file (broken symlink)"
            else
                echo -e "  ${YELLOW}✗${NC} $file (not a symlink)"
            fi
        done
        echo ""
        echo "Source Files:"
        if [ -f "AGENTS.md" ] && [ ! -L "AGENTS.md" ]; then
            echo -e "  ${GREEN}✓${NC} AGENTS.md (single source of truth)"
        else
            echo -e "  ${YELLOW}✗${NC} AGENTS.md missing or is a symlink"
        fi
        if [ -d ".agents/skills" ]; then
            skill_count=$(ls -1 .agents/skills 2>/dev/null | wc -l)
            echo -e "  ${GREEN}✓${NC} .agents/skills/ ($skill_count skills)"
        else
            echo -e "  ${YELLOW}✗${NC} .agents/skills/ missing"
        fi
        ;;
    --help|-h)
        show_help
        ;;
    "")
        echo -e "${BLUE}🔗 Aligning all AI agents to .agents/${NC}"
        bash "$SCRIPT_DIR/create-symlinks.sh"
        echo ""
        echo -e "${GREEN}✅ Running verification...${NC}"
        bash "$SCRIPT_DIR/verify-architecture.sh"
        ;;
    *)
        echo "Unknown option: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
