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
  echo "No staged changes to commit."
  exit 0
fi

git commit -m "$MESSAGE"
git push

echo "Done: committed and pushed."
