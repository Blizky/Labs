#!/bin/zsh
set -euo pipefail

LABS_DIR="/Users/alex/Projects/GitHub/Labs"
PORT="${1:-8000}"

echo "Serving ${LABS_DIR} at http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
python3 -m http.server "${PORT}" --directory "${LABS_DIR}"
