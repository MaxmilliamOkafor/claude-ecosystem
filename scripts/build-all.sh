#!/usr/bin/env bash
# build-all.sh — produce production artifacts for every package.
set -euo pipefail

pnpm install --frozen-lockfile || pnpm install
pnpm --filter @claude-eco/shared build
pnpm -r --filter '!@claude-eco/shared' run build

echo
echo "Artifacts:"
echo "  packages/claude-code/dist/cli.js           → node dist/cli.js"
echo "  packages/claude-cowork/dist/               → node dist/server/index.js"
echo "  packages/claude-extension/dist/            → load as unpacked in chrome://extensions"
