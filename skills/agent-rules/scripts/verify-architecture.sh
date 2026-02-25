#!/bin/bash
# Universal Agent Skills - Verification Script

echo "🔍 Verifying Universal Agent Skills Architecture"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0

# Check skills symlinks
echo "📦 Checking Skills Symlinks..."
for dir in .claude/skills .github/skills .kiro/skills .codex/skills; do
    if [ -L "$dir" ] && [ -e "$dir" ]; then
        target=$(readlink "$dir")
        echo -e "  ${GREEN}✓${NC} $dir → $target"
    else
        echo -e "  ${RED}✗${NC} $dir (missing or broken)"
        ((errors++))
    fi
done
echo ""

# Check instruction symlinks
echo "📝 Checking Instruction Symlinks..."
for file in CLAUDE.md .github/copilot-instructions.md .cursor/rules/main.md .gemini/GEMINI.md .kiro/steering/main.md; do
    if [ -L "$file" ] && [ -e "$file" ]; then
        target=$(readlink "$file")
        echo -e "  ${GREEN}✓${NC} $file → $target"
    else
        echo -e "  ${RED}✗${NC} $file (missing or broken)"
        ((errors++))
    fi
done
echo ""

# Check source exists
echo "🎯 Checking Source Files..."
if [ -f "AGENTS.md" ] && [ ! -L "AGENTS.md" ]; then
    echo -e "  ${GREEN}✓${NC} AGENTS.md exists (single source of truth)"
else
    echo -e "  ${RED}✗${NC} AGENTS.md missing or is a symlink"
    ((errors++))
fi

if [ -d ".agents/skills" ]; then
    skill_count=$(ls -1 .agents/skills | wc -l)
    echo -e "  ${GREEN}✓${NC} .agents/skills/ exists ($skill_count skills)"
else
    echo -e "  ${RED}✗${NC} .agents/skills/ missing"
    ((errors++))
fi
echo ""

# Test skill access
echo "🧪 Testing Skill Access..."
test_skill="agent-rules"
for agent_dir in .github .kiro .codex; do
    if [ -f "$agent_dir/skills/$test_skill/SKILL.md" ]; then
        echo -e "  ${GREEN}✓${NC} $agent_dir/skills/$test_skill/ accessible"
    else
        echo -e "  ${RED}✗${NC} $agent_dir/skills/$test_skill/ not accessible"
        ((errors++))
    fi
done
echo ""

# Test instruction access
echo "📖 Testing Instruction Access..."
for file in CLAUDE.md .github/copilot-instructions.md .cursor/rules/main.md; do
    if [ -f "$file" ] && [ -s "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file readable"
    else
        echo -e "  ${RED}✗${NC} $file not readable or empty"
        ((errors++))
    fi
done
echo ""

# Check Kiro special case
echo "⚠️  Checking Kiro Symlink..."
if [ -L ".kiro/steering/main.md" ] && [ -e ".kiro/steering/main.md" ]; then
    target=$(readlink ".kiro/steering/main.md")
    echo -e "  ${GREEN}✓${NC} .kiro/steering/main.md → $target (symlinked to AGENTS.md)"
else
    echo -e "  ${YELLOW}⚠${NC} .kiro/steering/main.md not symlinked"
fi
echo ""

# Summary
echo "================================================"
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Architecture is correctly configured."
    echo "All agents can access skills and instructions via symlinks."
else
    echo -e "${RED}❌ $errors error(s) found${NC}"
    echo ""
    echo "Run the following to recreate symlinks:"
    echo "  bash .agents/skills/agent-rules/scripts/create-symlinks.sh"
fi
echo ""
