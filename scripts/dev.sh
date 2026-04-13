#!/usr/bin/env bash
# dev.sh — run everything in dev mode in parallel.
set -euo pipefail

pnpm --filter @claude-eco/shared build

# shellcheck disable=SC2016
echo '→ Starting Claude Cowork (http://localhost:5173) and extension watcher'
pnpm -r --parallel --filter claude-cowork --filter claude-extension run dev
