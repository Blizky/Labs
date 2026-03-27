#!/bin/zsh
set -e

cd "$(dirname "$0")"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

if [[ "$branch" == "HEAD" || -z "$branch" ]]; then
  branch="main"
fi

printf "Commit message: "
read -r message

if [[ -z "$message" ]]; then
  message="Update ThreadMaker"
fi

git pull --rebase origin "$branch"
git add .

if git diff --cached --quiet; then
  echo
  echo "No changes to commit."
  read -r "?Press Enter to close..."
  exit 0
fi

git commit -m "$message"
git push -u origin "$branch"

echo
read -r "?Push complete. Press Enter to close..."
