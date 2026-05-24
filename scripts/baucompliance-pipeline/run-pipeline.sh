#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/daily-product-improvement-prompt.md"

if ! command -v hermes >/dev/null 2>&1; then
  echo "hermes CLI not found in PATH" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Prompt file missing: $PROMPT_FILE" >&2
  exit 1
fi

DATE_STR="${PIPELINE_DATE:-$(date +%F)}"
PROMPT_HEADER="Today is ${DATE_STR}. Execute the workflow exactly as instructed below.\n\n"
PROMPT_BODY="$(cat "$PROMPT_FILE")"

cd "$REPO_ROOT"
hermes chat -q "$PROMPT_HEADER$PROMPT_BODY" --source baucompliance-pipeline
