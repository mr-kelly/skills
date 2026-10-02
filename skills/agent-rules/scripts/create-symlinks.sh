#!/bin/bash
# Agent Rules - create the symlinks that point every agent at the single source of truth.
#
# Usage: create-symlinks.sh [--minimal] [--force]
#   --minimal  only create links agents still require (skip legacy compatibility links)
#   --force    move an existing real file/dir aside to <path>.bak instead of skipping it

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

MINIMAL=0
FORCE=0
for arg in "$@"; do
    case "$arg" in
        --minimal) MINIMAL=1 ;;
        --force)   FORCE=1 ;;
        *) echo "create-symlinks.sh: unknown option: $arg" >&2; exit 2 ;;
    esac
done

ROOT="$(resolve_root)" || exit 2
cd "$ROOT" || exit 2

echo "🔗 Aligning agents in $ROOT"
echo "==========================================="
echo ""

created=0
updated=0
skipped=0
failed=0

# --- source of truth -------------------------------------------------------

if [ -L "$SOURCE_RULES" ]; then
    echo -e "  ${RED}✗${NC} $SOURCE_RULES is a symlink — it must be a real file"
    ((failed++))
elif [ ! -f "$SOURCE_RULES" ]; then
    printf '# Project Rules\n\nSingle source of truth for all AI coding agents.\n' > "$SOURCE_RULES"
    echo -e "  ${GREEN}+${NC} created $SOURCE_RULES (stub — fill it in)"
    ((created++))
fi

if [ ! -d "$SOURCE_SKILLS" ]; then
    mkdir -p "$SOURCE_SKILLS" && echo -e "  ${GREEN}+${NC} created $SOURCE_SKILLS/"
fi

# Older versions of this script used `ln -sf` without -n, which planted a
# self-referential `skills` link inside the source directory on every re-run.
if [ -L "$SOURCE_SKILLS/skills" ]; then
    rm -f "$SOURCE_SKILLS/skills"
    echo -e "  ${YELLOW}~${NC} removed stray $SOURCE_SKILLS/skills left by an older version"
fi

echo ""

# --- links -----------------------------------------------------------------

for entry in "${AGENT_LINKS[@]}"; do
    link="$(link_field "$entry" 1)"
    target="$(link_field "$entry" 2)"
    tier="$(link_field "$entry" 4)"
    agent="$(link_field "$entry" 5)"
    note="$(link_field "$entry" 6)"

    if [ "$MINIMAL" = "1" ] && [ "$tier" != "required" ]; then
        continue
    fi

    label="$link → $target"
    [ "$tier" = "legacy" ] && label="$label ${DIM}(legacy: $agent $note)${NC}"

    if link_is_correct "$link" "$target"; then
        echo -e "  ${GREEN}✓${NC} $label"
        continue
    fi

    # Refuse to clobber real content. `ln -sf` would silently delete it.
    if [ -e "$link" ] && [ ! -L "$link" ]; then
        resolved="$(dirname "$link")/$target"
        if [ -f "$link" ] && [ -f "$resolved" ] && cmp -s "$link" "$resolved"; then
            rm -f "$link"   # a stale copy of the source, identical content — safe
        elif [ "$FORCE" = "1" ]; then
            if [ -e "$link.bak" ]; then
                echo -e "  ${RED}✗${NC} $link is a real file and $link.bak already exists — resolve manually"
                ((failed++)); continue
            fi
            mv "$link" "$link.bak"
            echo -e "  ${YELLOW}~${NC} moved existing $link to $link.bak"
        else
            echo -e "  ${YELLOW}⊘${NC} $link exists as a real file/dir — skipped (re-run with --force to move it to $link.bak)"
            ((skipped++)); continue
        fi
    fi

    existed=0
    [ -L "$link" ] && existed=1

    mkdir -p "$(dirname "$link")"
    # -n is what keeps a directory link from being created *inside* its own target.
    if ln -sfn "$target" "$link"; then
        if [ "$existed" = "1" ]; then
            echo -e "  ${GREEN}~${NC} $label (retargeted)"
            ((updated++))
        else
            echo -e "  ${GREEN}+${NC} $label"
            ((created++))
        fi
    else
        echo -e "  ${RED}✗${NC} $label (ln failed)"
        ((failed++))
    fi
done

echo ""
echo "==========================================="
echo "created $created · retargeted $updated · skipped $skipped · failed $failed"
echo ""
echo "Single source of truth:"
echo "  - Rules:  $SOURCE_RULES"
echo "  - Skills: $SOURCE_SKILLS/"

if [ "$failed" -gt 0 ]; then
    echo ""
    echo -e "${RED}Some links could not be created.${NC}"
    exit 1
fi
if [ "$skipped" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Some paths were left alone because they hold real content.${NC}"
    exit 1
fi
echo ""
echo -e "${GREEN}✅ All links in place.${NC}"
