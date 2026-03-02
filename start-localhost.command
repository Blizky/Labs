#!/bin/zsh
set -euo pipefail

cd "/Users/alex/Projects/GitHub/Labs"

PORT="${1:-8000}"
echo "Serving /Users/alex/Projects/GitHub/Labs at http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
python3 -m http.server "$PORT"
