# Claude Extension

Claude in your browser. Manifest V3. Side panel + popup + options + context menu + keyboard commands.

## Features

- **Side panel** with one-click actions: Summarize, Explain, Rewrite, Extract, Translate, Q&A.
- **Popup** for a quick question about the current page.
- **Options page** with API base, direct Anthropic key fallback, default model, max tokens, per-host disable list, and local history of the last 200 exchanges.
- **Context menu** (right-click): Summarize / Explain / Rewrite / Extract.
- **Keyboard commands**: `Ctrl/Cmd+E` toggles the side panel; `Ctrl/Cmd+Shift+S` summarizes the page.
- **Page reader** pulls URL + title + selection + cleaned text for every call.
- **Replace selection in place** using the content script.
- **Model picker** — all Claude models from `@claude-eco/shared` (Opus 4.6 default).
- **Two backends** — talks to the local Claude Cowork server by default; falls back to direct Anthropic API calls when a user key is set.

## Build

```bash
pnpm install
pnpm --filter claude-extension build
```

The packed extension lands in `packages/claude-extension/dist`.

## Load in Chrome

1. Visit `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/claude-extension/dist`.

## Icons

Drop `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` into `packages/claude-extension/icons/` before you build (see that folder's README).
