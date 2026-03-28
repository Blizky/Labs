#!/bin/zsh
set -euo pipefail

cd "/Users/alex/Projects/GitHub/Labs"

if [[ ! -d ".git" ]]; then
  echo "Error: /Users/alex/Projects/GitHub/Labs is not a git repository."
  exit 1
fi

MESSAGE="${*:-Update site files}"

git add -A

if git diff --cached --quiet; then
  echo "No new local changes to commit."
else
  git commit -m "$MESSAGE"
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  if [[ "$(git rev-list --count '@{u}'..HEAD)" -eq 0 ]]; then
    echo "Nothing to push."
    exit 0
  fi
  git push
else
  CURRENT_BRANCH="$(git branch --show-current)"
  git push -u origin "$CURRENT_BRANCH"
fi

echo "Done: committed and pushed."
