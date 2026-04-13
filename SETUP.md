# Setup Guide

End-to-end install and run guide for every surface. Tested on macOS, Linux, and WSL. Should also work on native Windows with `scripts/setup.ps1` (not included — run the steps by hand).

## 0. Requirements

- **Node ≥ 20.10** (uses `--enable-source-maps`, native `fetch`, ESM JSON imports with `with { type: "json" }`).
- **pnpm ≥ 9** — auto-installed via `corepack` by `scripts/setup.sh`.
- **git** — for cloning and branching.
- **Chrome 116+** — required by the MV3 `sidePanel` API.
- **An Anthropic API key** from https://console.anthropic.com/settings/keys.

## 1. Clone & bootstrap

```bash
git clone https://github.com/MaxmilliamOkafor/claude-ecosystem.git
cd claude-ecosystem

./scripts/setup.sh       # installs pnpm if needed, installs workspaces, type-checks
cp .env.example .env     # then edit .env and paste your ANTHROPIC_API_KEY
```

`setup.sh` verifies Node ≥ 20.10, enables corepack/pnpm, runs `pnpm install`, builds `@claude-eco/shared`, and runs `pnpm -r run typecheck`.

## 2. Claude Code — the terminal CLI

```bash
pnpm --filter claude-code build
pnpm code                         # or: node packages/claude-code/dist/cli.js chat
```

Examples:
```bash
# one-shot question, uses the default model
node packages/claude-code/dist/cli.js ask "what does packages/shared export?"

# switch default model
node packages/claude-code/dist/cli.js set model claude-sonnet-4-6

# resume a past session
node packages/claude-code/dist/cli.js sessions
node packages/claude-code/dist/cli.js chat --resume <first-8-chars>
```

Inside the REPL:
```
/help     /models    /sessions    /resume <id>    /new     /memory <note>
/auto writes on     /auto shell on     /model sonnet     /log     /quit
```

## 3. Claude Cowork — the web app

```bash
pnpm cowork
# → Express API on http://127.0.0.1:5174
# → Vite web UI on http://localhost:5173
```

Production:
```bash
pnpm --filter claude-cowork build
pnpm --filter claude-cowork start
# single server on COWORK_PORT serving both /api and the React SPA
```

Config via env (set in `.env`):
- `COWORK_PORT` (default 5174)
- `COWORK_HOST` (default 127.0.0.1)
- `COWORK_SESSIONS_DIR` (default `./.sessions` — SQLite lives here)
- `ANTHROPIC_API_KEY` (required)
- `CLAUDE_MODEL` (default `claude-opus-4-6`)

## 4. Claude Extension — the browser extension

### Build once
```bash
pnpm --filter claude-extension build
# output → packages/claude-extension/dist/
```

### Watch while developing
```bash
pnpm --filter claude-extension dev     # rebuilds on change
```

### Load in Chrome
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and pick `packages/claude-extension/dist`.
4. Pin it to the toolbar.
5. Open the options page and set either:
   - **API base** = `http://127.0.0.1:5174` (if Cowork is running), **or**
   - **Anthropic API key** (for direct calls without the local server).

Icons: drop `icon-{16,32,48,128}.png` into `packages/claude-extension/icons/` before building.

## 5. Updating models

Edit `packages/shared/src/models.ts`, rebuild shared, and every surface picks up the change.

```bash
pnpm --filter @claude-eco/shared build
```

## 6. Troubleshooting

| Symptom                                                  | Fix                                                                                                      |
|----------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `ANTHROPIC_API_KEY is not set`                           | Put it in `.env` or export it in your shell.                                                             |
| Cowork loads but chat returns 500                        | Key is wrong or out of quota. Check `curl http://127.0.0.1:5174/api/health` and server logs.             |
| Extension says "Could not reach Claude Cowork"           | Start Cowork, or paste an Anthropic key into the options page.                                           |
| Chrome: "Side panel is not available"                    | Upgrade Chrome to ≥ 116.                                                                                 |
| `better-sqlite3` native build fails                      | Install your platform's build tools (Xcode CLT on macOS, `build-essential` + `python3` on Debian/Ubuntu).|
| `pnpm` command not found                                 | Run `corepack enable && corepack prepare pnpm@9.12.0 --activate`.                                        |
| Extension rejects loading: "Manifest version 2 …"        | You selected the wrong folder — load `dist/`, not the repo root.                                         |

## 7. Uninstall / reset

```bash
pnpm clean                                    # remove dist/ and node_modules/
rm -rf ~/.claude-code                         # CLI sessions + config
rm -rf packages/claude-cowork/.sessions       # Cowork SQLite DB
# then reload the extension at chrome://extensions and click Remove
```
