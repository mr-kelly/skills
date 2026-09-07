#!/bin/bash
# Agent Rules - self-test. Runs the scripts against throwaway projects in a temp dir.
#   bash scripts/test-agent-rules.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREATE="$SCRIPT_DIR/create-symlinks.sh"
VERIFY="$SCRIPT_DIR/verify-architecture.sh"
ENTRY="$SCRIPT_DIR/agent-rules.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0
ok()   { echo "  ok   - $1"; pass=$((pass + 1)); }
nope() { echo "  FAIL - $1"; fail=$((fail + 1)); }
check() { if [ "$1" = "$2" ]; then ok "$3"; else nope "$3 (expected '$2', got '$1')"; fi; }

new_project() {
    local dir="$TMP/$1"
    mkdir -p "$dir/.agents/skills/demo"
    printf '# rules\n' > "$dir/AGENTS.md"
    printf -- '---\nname: demo\n---\n' > "$dir/.agents/skills/demo/SKILL.md"
    git -C "$dir" init -q .
    printf '%s' "$dir"
}

echo "1. bootstrap from an empty project"
p="$(new_project bootstrap)"
out="$(cd "$p" && bash "$CREATE" 2>&1)"; rc=$?
check "$rc" 0 "create-symlinks exits 0"
[ -L "$p/CLAUDE.md" ] && [ -L "$p/.claude/skills" ] && [ -L "$p/.gemini/GEMINI.md" ] \
    && ok "creates links inside directories that did not exist" \
    || { nope "missing links after bootstrap"; echo "$out"; }
(cd "$p" && bash "$VERIFY" >/dev/null 2>&1); check "$?" 0 "verify passes after bootstrap"

echo "2. re-running does not pollute the source directory"
(cd "$p" && bash "$CREATE" >/dev/null 2>&1)
(cd "$p" && bash "$CREATE" >/dev/null 2>&1)
[ -e "$p/.agents/skills/skills" ] && nope ".agents/skills/skills was created" || ok "no self-referential link inside .agents/skills"
check "$(ls "$p/.agents/skills" | tr '\n' ' ')" "demo " "source directory still holds only real skills"

echo "3. verify reports failures through its exit code"
p="$(new_project exitcode)"
(cd "$p" && bash "$CREATE" >/dev/null 2>&1)
rm "$p/CLAUDE.md"
(cd "$p" && bash "$VERIFY" >/dev/null 2>&1); check "$?" 1 "missing required link exits 1"
p2="$(new_project exitcode-legacy)"
(cd "$p2" && bash "$CREATE" >/dev/null 2>&1)
rm "$p2/.codex/skills"
(cd "$p2" && bash "$VERIFY" >/dev/null 2>&1); check "$?" 0 "missing legacy link is only a warning"

echo "4. real files are never clobbered"
p="$(new_project realfile)"
printf 'hand written rules\n' > "$p/CLAUDE.md"
(cd "$p" && bash "$CREATE" >/dev/null 2>&1)
check "$(cat "$p/CLAUDE.md")" "hand written rules" "existing CLAUDE.md left untouched"
(cd "$p" && bash "$CREATE" --force >/dev/null 2>&1)
[ -L "$p/CLAUDE.md" ] && [ -f "$p/CLAUDE.md.bak" ] && ok "--force backs the file up and links" || nope "--force did not back up"

echo "5. operates on the project you are in, not the skill's location"
p="$(new_project cwd)"
# Match with `case` rather than piping to grep: `grep -q` exits early, which
# SIGPIPEs the writer and trips `set -o pipefail`.
out="$(cd "$p" && bash "$ENTRY" --status 2>&1)"
case "$out" in *"$p"*) ok "--status targets the \$PWD project" ;; *) nope "--status targeted the wrong root" ;; esac
sub="$p/deep/nested"; mkdir -p "$sub"
out="$(cd "$sub" && bash "$ENTRY" --status 2>&1)"
case "$out" in *"$sub"*) nope "resolved to the subdirectory instead of git toplevel" ;; *"$p"*) ok "resolves to git toplevel from a subdirectory" ;; *) nope "no root reported" ;; esac
out="$(bash "$ENTRY" --root "$p" --status 2>&1)"
case "$out" in *"$p"*) ok "--root overrides the working directory" ;; *) nope "--root ignored" ;; esac

echo "6. cleans up damage left by v4"
p="$(new_project legacy-damage)"
ln -sfn ../.agents/skills "$p/.agents/skills/skills"
(cd "$p" && bash "$VERIFY" >/dev/null 2>&1); check "$?" 1 "stray link is reported as an error"
(cd "$p" && bash "$CREATE" >/dev/null 2>&1)
[ -e "$p/.agents/skills/skills" ] && nope "stray link survived" || ok "stray link removed"

echo "7. --minimal skips legacy links"
p="$(new_project minimal)"
(cd "$p" && bash "$CREATE" --minimal >/dev/null 2>&1)
[ -L "$p/.claude/skills" ] && [ ! -e "$p/.codex/skills" ] && ok "--minimal creates required links only" || nope "--minimal wrote legacy links"
(cd "$p" && bash "$VERIFY" >/dev/null 2>&1); check "$?" 0 "--minimal layout still verifies clean"

echo ""
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
