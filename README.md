# Claude Ecosystem

A complete, production-ready Claude suite in one monorepo:

| Package                             | What it is                                                                                                   |
|-------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `packages/shared`                   | `@claude-eco/shared` — one Anthropic SDK client, canonical model list, persona prompts, logger, types.       |
| `packages/claude-code`              | Terminal coding assistant with agent mode, file I/O, shell execution, live web browsing, sessions + memory.  |
| `packages/claude-cowork`            | Chat + workspace + tasks web app. Streaming chat, autonomous multi-step agent, live browse, SQLite storage.  |
| `packages/claude-extension`         | Manifest V3 browser extension, integrated with the monorepo (uses the shared client + Cowork backend).       |
| **`claude-extension-standalone/`**  | **Self-contained version of the extension** — no monorepo deps, no Cowork needed, ships with a local-model (Ollama) backend so it works with no API key and no usage cap. See its [README](./claude-extension-standalone/README.md). |

All three surfaces share **one** model list (Opus 4.6 default, with Sonnet 4.6 and Haiku 4.5 available) and **one** Anthropic client, so switching models is seamless across the CLI, the web app, and the browser.

---

## Quick start

```bash
# 1. Install & bootstrap
./scripts/setup.sh

# 2. Add your key
cp .env.example .env
# … then edit .env and set ANTHROPIC_API_KEY

# 3. Run any surface
pnpm code          # Claude Code CLI REPL
pnpm cowork        # Claude Cowork web app (http://localhost:5173)
pnpm ext:build     # Browser extension → packages/claude-extension/dist
```

Requirements: Node ≥ 20.10, pnpm ≥ 9 (auto-installed by `setup.sh` via corepack).

---

## Layout

```
claude-ecosystem/
├── README.md                        ← you are here
├── ARCHITECTURE.md                  ← design rationale, data flow, why each piece exists
├── AUDIT.md                         ← audit of the two reference repos + what we kept / dropped / added
├── SETUP.md                         ← full install + run guide (every OS, every surface)
├── package.json                     ← pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── scripts/
│   ├── setup.sh                     ← one-shot install & verify
│   ├── dev.sh                       ← dev-mode for cowork + extension
│   └── build-all.sh                 ← production build for every package
└── packages/
    ├── shared/                      ← @claude-eco/shared
    ├── claude-code/                 ← CLI
    ├── claude-cowork/               ← web app (Express + React)
    └── claude-extension/            ← MV3 extension (Vite + CRXJS + React)
```

---

## What you get, feature by feature

### Claude Code (CLI)
- Agent loop with multi-step tool use (up to 16 steps per turn by default).
- Built-in tools: `repo_map`, `list_dir`, `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `run_shell`, `web_fetch`, `web_search`.
- Confirmation gates for writes and shell commands (togglable per-session).
- Sessions persisted to `~/.claude-code/sessions/<uuid>.json`; resume by id prefix.
- Project memory at `.claude-code-memory.md` auto-injected into the system prompt.
- Slash commands: `/model`, `/models`, `/sessions`, `/resume`, `/new`, `/memory`, `/auto`, `/log`, `/clear`, `/help`, `/quit`.
- Streaming, retry with exponential backoff, model switching at runtime.

### Claude Cowork (web app)
- Three-pane layout: sessions sidebar · chat/workspace · tasks panel.
- **Chat mode**: streaming SSE tokens into a live-updating reply.
- **Agent mode**: autonomous plan → execute loop with `add_task`, `update_task`, `list_tasks`, `browse_fetch`, `browse_search`, `finish` tools. Thoughts, tool calls, and results stream into the chat.
- Tasks: cycle status via one click, add from the right panel, auto-created by the agent.
- SQLite persistence (`sessions`, `tasks`, `logs` tables).
- REST + SSE API documented in `packages/claude-cowork/README.md`; used by the extension as a shared backend.

### Claude Extension (MV3)
- **Side panel** with presets (Summarize / Explain / Rewrite / Extract / Translate / Q&A).
- **Popup** for quick asks without opening the panel.
- **Options page** with API-base, Anthropic fallback key, default model, max-tokens, per-host disable list, local history (up to 200 entries).
- **Context menu**: Summarize / Explain / Rewrite / Extract on selections or whole pages.
- **Keyboard commands**: `Ctrl/Cmd+E` toggles the panel; `Ctrl/Cmd+Shift+S` summarizes the page.
- **Page reader** captures URL, title, selection, and a cleaned 20k-char text snapshot.
- **Replace-in-page** action lets Claude rewrite the user's current selection in the live DOM.
- Talks to Cowork by default; degrades gracefully to direct Anthropic calls when a key is configured.

---

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the shape of the system and the reasons behind the boundaries.
- [`AUDIT.md`](./AUDIT.md) — audit of the two reference repos, what we reused, and what we built from scratch.
- [`SETUP.md`](./SETUP.md) — end-to-end install and run guide for every surface.
- Each package has its own `README.md` with API, commands, and CLI usage.

---

## License

MIT — see `LICENSE` in the reference repository. This project is intended for use with the Anthropic API; obey Anthropic's usage policies.
