# Claude Extension — Standalone

A **fully standalone** Chrome/Edge extension. It does **not** depend on the
Claude Cowork server or the Claude Code CLI — you can drop this folder into
its own repo, build it, and load it in the browser.

## About "no API key, no limits"

Full transparency, because this is the #1 question:

Anthropic does **not** offer a free, anonymous Claude API. To use the actual
Claude models from an extension you need **one** of:

| Mode | Needs an API key? | Limits? | Quality |
|------|-------------------|---------|---------|
| **Local model via Ollama** ← default | ❌ No | ❌ **None**, runs on your own machine | Open-source models (Llama 3.2, Qwen 2.5, Mistral, etc.) |
| **Claude.ai tab** | ❌ No (uses your existing Claude.ai login) | Yes — bound by your Claude.ai plan (Free / Pro / Max) | Real Claude, but the conversation happens on claude.ai |
| **Anthropic API** | ✅ Yes (your own key) | Your account's rate limits / quota | Real Claude, in-panel |

So: **the only mode that is genuinely "no key, zero limits" is Ollama running
a local model**, which is not a Claude model. That's a hardware reality, not a
choice. The extension ships with Ollama as the default because it's the only
setup that truly matches "never runs out, no key". The other two modes are
there for when you want real Claude.

## Install the extension

**Fast path — no build needed.** This repo ships a pre-built `dist/` folder.

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select `claude-extension-standalone/dist`.
4. Pin the extension to the toolbar.

> Select the `dist` folder, **not** `claude-extension-standalone` itself.
> The top-level folder contains TypeScript source that Chrome cannot load directly —
> that's the cause of "Could not load icon 'icons/icon-16.png'" errors.

### Rebuild from source (optional)

If you edit the code, rebuild with:

```bash
cd claude-extension-standalone
pnpm install --ignore-workspace   # or: npm install
pnpm build                        # or: npm run build
```

Then click the reload button on `chrome://extensions`.

Icons live in `icons/` (`icon-16.png`, `icon-32.png`, `icon-48.png`,
`icon-128.png`). Replace them with your own before building if you want a
different glyph.

## First run — pick your backend

Click the extension icon → **Settings** (or go to options), then pick a backend:

### A. Local model (Ollama) — default, truly unlimited

```bash
# install Ollama once:
# macOS/Linux:   curl -fsSL https://ollama.com/install.sh | sh
# or download:   https://ollama.com/download

ollama serve                    # starts the local API on 127.0.0.1:11434
ollama pull llama3.2            # one-time model download (~2 GB)
```

That's it. The extension talks to `http://127.0.0.1:11434` and runs the model
on your hardware. Everything stays on your machine. No key. No quota.

Other good Ollama models already listed in the dropdown:
- `llama3.1:8b`
- `qwen2.5:7b`
- `qwen2.5-coder:7b` (for coding tasks)
- `mistral:latest`
- `phi3:mini` (tiny, very fast)

Or add any model you've pulled via the "Add a custom Ollama model" field.

### B. Claude.ai tab — no key, uses your Claude.ai plan

Set backend to **Claude.ai tab**. When you ask something, the extension
opens `https://claude.ai/new?q=...` in a new tab with your prompt + page
context pre-filled. The conversation continues inside Claude.ai, tied to
whatever plan you're logged in with. This doesn't require an API key, but
usage is whatever your Claude.ai plan allows.

### C. Anthropic API — BYO key

Set backend to **Anthropic API**, paste your key, pick a model (Opus 4.6,
Sonnet 4.6, Haiku 4.5, etc.). Replies stream into the side panel.

## Features

- **Side panel** with presets: Summarize, Explain, Rewrite, Extract, Translate, Q&A.
- **Popup** for quick asks.
- **Options page** — backend + model picker, Ollama health check, history (200 entries), per-host disable list, system-prompt addendum.
- **Context menu** (right-click) — Summarize page, Explain selection, Rewrite selection, Extract structured data.
- **Keyboard commands** — `Ctrl/Cmd+E` toggles the side panel; `Ctrl/Cmd+Shift+S` summarizes the page.
- **Page reader** — URL + title + selection + 20k-char cleaned text snapshot injected into the system prompt.
- **Replace selection in place** — Claude's reply can overwrite the page's selected text (content script).
- **Zero-install path** — with Ollama running, everything works without signing up for anything.

## Privacy

- **Ollama mode** — nothing leaves your machine.
- **Claude.ai mode** — your prompt is URL-encoded into a new claude.ai tab. Subject to Claude.ai's privacy policy.
- **Anthropic mode** — calls go directly from your browser to `api.anthropic.com`. Subject to Anthropic's privacy policy. The "dangerous direct browser access" header is set because the extension is an untrusted origin — if you're uncomfortable with that, use a small proxy or Ollama.

## Layout

```
claude-extension-standalone/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── icons/                    ← drop PNGs here before build
├── src/
│   ├── background/service-worker.ts
│   ├── content/content-script.ts
│   ├── shared-ui/styles.css
│   ├── shared/
│   │   ├── models.ts         ← all Ollama / Claude.ai / Anthropic model entries
│   │   └── prompts.ts
│   ├── lib/
│   │   ├── api.ts            ← dispatcher for the three backends
│   │   ├── page-reader.ts
│   │   └── storage.ts
│   ├── popup/
│   ├── sidepanel/
│   └── options/
└── README.md
```

## License

MIT.
