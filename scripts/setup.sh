#!/usr/bin/env bash
# setup.sh — one-shot install & verify for the whole ecosystem.
set -euo pipefail

echo "→ Checking Node version"
node -v | awk -F. '{ if ($1+0 < 20 || ($1+0 == 20 && substr($2,1,2)+0 < 10)) { print "Node ≥ 20.10 required"; exit 1 } }'

echo "→ Ensuring pnpm is available"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm via corepack…"
  corepack enable
  corepack prepare pnpm@9.12.0 --activate
fi

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.example"
  cp .env.example .env
  echo "  Edit .env and set ANTHROPIC_API_KEY before running."
fi

echo "→ Installing workspace dependencies"
pnpm install

echo "→ Building @claude-eco/shared (the rest depends on it)"
pnpm --filter @claude-eco/shared build

echo "→ Type-checking all packages"
pnpm -r run typecheck

echo
echo "All set. Next:"
echo "  pnpm code            # launch Claude Code REPL"
echo "  pnpm cowork          # start Cowork dev server + web UI"
echo "  pnpm ext:build       # build the browser extension into packages/claude-extension/dist"
