#!/bin/sh
# Structural readiness gate for a feature lane.
# Usage: sh tools/hack_ready.sh [--base branch] [-- command arg ...]

set -eu

base=${HACK_BASE_BRANCH:-hack/integration}
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base=${2:-}; shift 2 ;;
    --base=*) base=${1#--base=}; shift ;;
    --) shift; break ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) break ;;
  esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "run this command inside a feature worktree" >&2
  exit 1
}
branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
case "$branch" in
  hack/integration|main|master|'')
    echo "refusing readiness gate on integration, demo-safe, or detached branch: ${branch:-HEAD}" >&2
    exit 1
    ;;
  hack/*/*) ;;
  *) echo "expected a feature branch named hack/<owner>/<feature>; found: $branch" >&2; exit 1 ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  echo "worktree is not clean; commit or stash the lane implementation before the readiness gate" >&2
  git status --short >&2
  exit 1
fi

base_ref=$base
if git rev-parse --verify --quiet "origin/$base^{commit}" >/dev/null; then
  base_ref="origin/$base"
elif ! git rev-parse --verify --quiet "$base_ref^{commit}" >/dev/null; then
  echo "base not found: $base (fetch first or pass --base)" >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$base_ref" HEAD; then
  echo "feature branch does not contain the latest selected base: $base_ref" >&2
  echo "rebase/merge the base into this lane and resolve conflicts here" >&2
  exit 1
fi
if [ "$(git rev-list --count "$base_ref..HEAD")" -eq 0 ]; then
  echo "no feature commits found above $base_ref" >&2
  exit 1
fi

record=""
for candidate in "$root"/docs/lanes/*.md; do
  [ -f "$candidate" ] || continue
  case "$candidate" in */README.md|*/TEMPLATE.md) continue ;; esac
  if grep -Fq -- "- Branch: $branch" "$candidate"; then
    record=$candidate
    break
  fi
done
if [ -z "$record" ]; then
  echo "no lane record claims branch $branch" >&2
  exit 1
fi
if grep -Eq '<[^>]+>|path/to/owned/file-or-module' "$record"; then
  echo "lane record still contains template placeholders: ${record#"$root/"}" >&2
  grep -nE '<[^>]+>|path/to/owned/file-or-module' "$record" >&2 || true
  exit 1
fi

git diff --check "$base_ref...HEAD"
if git grep -n -E '^(<<<<<<< |=======|>>>>>>> )' -- . >/dev/null 2>&1; then
  echo "unresolved conflict marker found in tracked files" >&2
  git grep -n -E '^(<<<<<<< |=======|>>>>>>> )' -- . >&2 || true
  exit 1
fi
python3 "$root/tools/check_agent_docs.py"

if [ $# -gt 0 ]; then
  echo "Running requested verification command: $*"
  "$@"
else
  echo "No project verification command was supplied; confirm AGENTS.md fast checks ran separately."
fi

now=$(date '+%Y-%m-%d %H:%M %Z')
sed -e 's/^- State:.*/- State: READY/' -e "s#^- Updated:.*#- Updated: $now#" \
  "$record" > "$record.tmp"
mv "$record.tmp" "$record"

echo ""
echo "Lane passed the structural READY gate: $branch"
git diff --stat "$base_ref...HEAD"
echo ""
echo "Updated ${record#"$root/"} to READY. Add the actual verification result, commit this record,"
echo "push the branch, and ask for fresh-context review before entering the merge train."
