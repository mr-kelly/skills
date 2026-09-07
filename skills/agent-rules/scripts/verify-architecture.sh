#!/bin/bash
# Agent Rules - verify that every agent still resolves to the single source of truth.
# Exits 1 when a required link is missing or broken, 0 otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ROOT="$(resolve_root)" || exit 2
cd "$ROOT" || exit 2

errors=0
warnings=0

echo "🔍 Verifying agent alignment in $ROOT"
echo "================================================"
echo ""

# --- source of truth -------------------------------------------------------

echo "🎯 Source of truth"
if [ -L "$SOURCE_RULES" ]; then
    echo -e "  ${RED}✗${NC} $SOURCE_RULES is a symlink — it must be the real file"
    ((errors++))
elif [ ! -s "$SOURCE_RULES" ]; then
    echo -e "  ${RED}✗${NC} $SOURCE_RULES missing or empty"
    ((errors++))
else
    echo -e "  ${GREEN}✓${NC} $SOURCE_RULES ($(wc -l < "$SOURCE_RULES") lines)"
fi

if [ ! -d "$SOURCE_SKILLS" ]; then
    echo -e "  ${RED}✗${NC} $SOURCE_SKILLS/ missing"
    ((errors++))
    skill_names=()
else
    skill_names=()
    for s in "$SOURCE_SKILLS"/*/SKILL.md; do
        [ -f "$s" ] || continue
        skill_names+=("$(basename "$(dirname "$s")")")
    done
    echo -e "  ${GREEN}✓${NC} $SOURCE_SKILLS/ (${#skill_names[@]} skills)"
    if [ -L "$SOURCE_SKILLS/skills" ]; then
        echo -e "  ${RED}✗${NC} stray $SOURCE_SKILLS/skills symlink — run --fix to clean it up"
        ((errors++))
    fi
fi
echo ""

# --- links -----------------------------------------------------------------

echo "🔗 Links"
for entry in "${AGENT_LINKS[@]}"; do
    link="$(link_field "$entry" 1)"
    target="$(link_field "$entry" 2)"
    tier="$(link_field "$entry" 4)"
    agent="$(link_field "$entry" 5)"
    suffix=""
    [ "$tier" = "legacy" ] && suffix=" ${DIM}(legacy)${NC}"

    if link_is_correct "$link" "$target" && [ -e "$link" ]; then
        echo -e "  ${GREEN}✓${NC} $link → $target$suffix"
    elif [ -L "$link" ]; then
        # A link that exists but points somewhere wrong or dangling is always an error.
        echo -e "  ${RED}✗${NC} $link → $(readlink "$link") (expected $target, or target missing)"
        ((errors++))
    elif [ -e "$link" ]; then
        echo -e "  ${RED}✗${NC} $link is a real file/dir, not a link to $target"
        ((errors++))
    elif [ "$tier" = "required" ]; then
        echo -e "  ${RED}✗${NC} $link missing — $agent cannot see the source of truth"
        ((errors++))
    else
        echo -e "  ${YELLOW}⚠${NC} $link missing$suffix — fine unless you run an older $agent"
        ((warnings++))
    fi
done
echo ""

# --- reachability ----------------------------------------------------------

echo "🧪 Reachability"
if [ "${#skill_names[@]}" -gt 0 ]; then
    probe="${skill_names[0]}"
    for entry in "${AGENT_LINKS[@]}"; do
        [ "$(link_field "$entry" 3)" = "dir" ] || continue
        link="$(link_field "$entry" 1)"
        [ -L "$link" ] || continue   # absence already reported above
        if [ -f "$link/$probe/SKILL.md" ]; then
            echo -e "  ${GREEN}✓${NC} $link/$probe/SKILL.md"
        else
            echo -e "  ${RED}✗${NC} $link/$probe/SKILL.md not reachable"
            ((errors++))
        fi
    done
else
    echo -e "  ${DIM}no skills in $SOURCE_SKILLS/ yet — nothing to probe${NC}"
fi

for entry in "${AGENT_LINKS[@]}"; do
    [ "$(link_field "$entry" 3)" = "file" ] || continue
    link="$(link_field "$entry" 1)"
    [ -L "$link" ] || continue
    if [ -s "$link" ]; then
        echo -e "  ${GREEN}✓${NC} $link readable"
    else
        echo -e "  ${RED}✗${NC} $link unreadable or empty"
        ((errors++))
    fi
done
echo ""

# --- environment -----------------------------------------------------------

if [ "$(git config --get core.symlinks 2>/dev/null)" = "false" ]; then
    echo -e "  ${YELLOW}⚠${NC} git core.symlinks=false — links will be checked out as plain text files"
    echo -e "     fix with: git config core.symlinks true && git checkout -- ."
    ((warnings++))
    echo ""
fi

# --- summary ---------------------------------------------------------------

echo "================================================"
if [ "$errors" -eq 0 ] && [ "$warnings" -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed.${NC}"
elif [ "$errors" -eq 0 ]; then
    echo -e "${GREEN}✅ All required links in place${NC} ($warnings warning(s))."
else
    echo -e "${RED}❌ $errors error(s), $warnings warning(s).${NC}"
    echo ""
    echo "Repair with:"
    echo "  bash $SCRIPT_DIR/create-symlinks.sh"
fi
echo ""

[ "$errors" -eq 0 ] || exit 1
