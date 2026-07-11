#!/bin/sh
# Create an isolated feature lane: branch + sibling worktree + lane record.
# Usage: sh tools/hack_start.sh <feature> [--owner name] [--base branch] [--path directory]

set -eu

if [ $# -eq 0 ]; then
  echo "usage: sh tools/hack_start.sh <feature> [--owner name] [--base branch] [--path directory]" >&2
  exit 2
fi

slug=$1
shift
case "$slug" in
  ''|*[!a-z0-9-]*|-*|*-) echo "feature must be a lowercase kebab-case slug" >&2; exit 2 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "run this command inside a Git repository" >&2
  exit 1
}
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "$root/.git")
main_root=$(dirname -- "$common")
repo_name=$(basename -- "$main_root")

raw_owner=$(git config user.name 2>/dev/null || true)
[ -n "$raw_owner" ] || raw_owner=$(id -un 2>/dev/null || echo owner)
owner=$(printf '%s' "$raw_owner" | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//')
[ -n "$owner" ] || owner=owner
base=${HACK_BASE_BRANCH:-hack/integration}
path=""

while [ $# -gt 0 ]; do
  case "$1" in
    --owner) owner=${2:-}; shift 2 ;;
    --owner=*) owner=${1#--owner=}; shift ;;
    --base) base=${2:-}; shift 2 ;;
    --base=*) base=${1#--base=}; shift ;;
    --path) path=${2:-}; shift 2 ;;
    --path=*) path=${1#--path=}; shift ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) echo "unexpected argument: $1" >&2; exit 2 ;;
  esac
done

owner=$(printf '%s' "$owner" | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//')
[ -n "$owner" ] || { echo "owner must contain a letter or number" >&2; exit 2; }
branch="hack/$owner/$slug"
[ -n "$path" ] || path="$(dirname -- "$main_root")/$repo_name-$owner-$slug"

base_ref=$base
if git show-ref --verify --quiet "refs/remotes/origin/$base"; then
  # A fetched shared branch is the safest base for distributed teams.
  base_ref="origin/$base"
elif git show-ref --verify --quiet "refs/heads/$base"; then
  base_ref=$base
elif ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "base not found: $base" >&2
  echo "create it first (usually: git branch hack/integration main) or pass --base <branch>" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch" \
  || git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  echo "branch already exists locally or on origin: $branch" >&2
  exit 1
fi
if [ -e "$path" ]; then
  echo "worktree path already exists: $path" >&2
  exit 1
fi

git worktree add -b "$branch" "$path" "$base_ref"

template="$path/docs/lanes/TEMPLATE.md"
if [ ! -f "$template" ]; then
  echo "lane template is missing on $base_ref: docs/lanes/TEMPLATE.md" >&2
  echo "worktree was created at $path; add the record manually after installing the hackathon kit" >&2
  exit 1
fi

now=$(date '+%Y-%m-%d %H:%M %Z')
day=$(date '+%Y-%m-%d')
record="$path/docs/lanes/$day-$owner-$slug.md"
sed \
  -e "s|^# Lane: <short title>$|# Lane: $slug|" \
  -e "s#^- Owner:.*#- Owner: $owner#" \
  -e "s#^- Branch:.*#- Branch: $branch#" \
  -e "s#^- Worktree:.*#- Worktree: $path#" \
  -e "s#^- Updated:.*#- Updated: $now#" \
  "$template" > "$record"

echo ""
echo "Feature lane created"
echo "  branch:   $branch"
echo "  worktree: $path"
echo "  record:   ${record#"$path/"}"
echo ""
echo "Next: cd '$path', fill Acceptance / Claim / Contracts, commit the record, then open a draft PR."
