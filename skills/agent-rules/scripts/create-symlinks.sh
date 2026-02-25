#!/bin/bash
# Universal Agent Skills - Create Symlinks Script

echo "🔗 Creating Universal Agent Skills Symlinks"
echo "==========================================="
echo ""

# Create skills symlinks
echo "📦 Creating skills symlinks..."
ln -sf ../.agents/skills .claude/skills
ln -sf ../.agents/skills .github/skills
ln -sf ../.agents/skills .kiro/skills
ln -sf ../.agents/skills .codex/skills
echo "  ✓ .claude/skills → ../.agents/skills"
echo "  ✓ .github/skills → ../.agents/skills"
echo "  ✓ .kiro/skills → ../.agents/skills"
echo "  ✓ .codex/skills → ../.agents/skills"
echo ""

# Create instruction symlinks
echo "📝 Creating instruction symlinks..."
ln -sf AGENTS.md CLAUDE.md
ln -sf ../AGENTS.md .github/copilot-instructions.md
ln -sf ../../AGENTS.md .cursor/rules/main.md
ln -sf ../AGENTS.md .gemini/GEMINI.md
ln -sf ../../AGENTS.md .kiro/steering/main.md
echo "  ✓ CLAUDE.md → AGENTS.md"
echo "  ✓ .github/copilot-instructions.md → ../AGENTS.md"
echo "  ✓ .cursor/rules/main.md → ../../AGENTS.md"
echo "  ✓ .gemini/GEMINI.md → ../AGENTS.md"
echo "  ✓ .kiro/steering/main.md → ../../AGENTS.md"
echo ""

echo "==========================================="
echo "✅ All symlinks created successfully!"
echo ""
echo "Single Source of Truth:"
echo "  - Rules: AGENTS.md (project root)"
echo "  - Skills: .agents/skills/"
echo ""
echo "Run verification:"
echo "  bash .agents/skills/agent-rules/scripts/verify-architecture.sh"
echo ""
