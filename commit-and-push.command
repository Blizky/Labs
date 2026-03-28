#!/bin/zsh
set -euo pipefail

cd "/Users/alex/Projects/GitHub/Labs"

if [[ ! -d ".git" ]]; then
  echo "Error: /Users/alex/Projects/GitHub/Labs is not a git repository."
  exit 1
fi

MESSAGE="${*:-Update site files}"
CURRENT_BRANCH="$(git branch --show-current)"

git add -A

if git diff --cached --quiet; then
  echo "No new local changes to commit."
else
  git commit -m "$MESSAGE"
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  if [[ "$(git rev-list --count '@{u}'..HEAD)" -eq 0 ]]; then
    CURRENT_HASH="$(git rev-parse --short HEAD)"
    echo "Already synced: ${CURRENT_BRANCH} at ${CURRENT_HASH}"
    exit 0
  fi
  git push
else
  git push -u origin "$CURRENT_BRANCH"
fi

CURRENT_HASH="$(git rev-parse --short HEAD)"
echo "Done: ${CURRENT_BRANCH} pushed at ${CURRENT_HASH}"
