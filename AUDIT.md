# Repository Audit

This document records what we found in the two reference repositories, the gaps we identified, and how the new **claude-ecosystem** monorepo addresses them.

## Reference 1 — `MaxmilliamOkafor/everything-claude-code`

**What it is:** a large meta-framework of Claude Code conventions — skills, hooks, rules, agents, MCP configs, slash commands, and tests. Not a runnable coding assistant, but a curated configuration surface for the official Claude Code CLI.

**Highlights we kept (conceptually):**
- The separation between **persona system prompts** (SOUL, RULES) and **operational configuration** (hooks, settings) — we carried this forward as `packages/shared/src/prompts.ts` vs. `packages/claude-code/src/config.ts`.
- The emphasis on **project-local memory** (WORKING-CONTEXT.md) inspired `.claude-code-memory.md` auto-injection.
- The **tool catalog** pattern (file I/O + shell + search + browse) — we implemented real, working versions of each.

**What we did not copy:**
- The skill/hook runtime. ECC is designed around the official Claude Code product's plugin surface; our CLI is a standalone Node process, so skills and hooks would be dead weight.
- The MCP server configurations, which target the official product.
- The Markdown-heavy rules files; we kept the distilled essence in three short system prompts.

**Missing features (in ECC) that we fixed:**
- No actual runnable CLI — we built one (`claude-code` binary).
- No persistent session / resume — added (`~/.claude-code/sessions/`).
- No streaming UI — added (streaming handled by the SDK helpers; tool loop re-queries until done).
- No Cowork companion — built as a separate package.

---

## Reference 2 — `MaxmilliamOkafor/Download-Claude-Extension`

**What it is:** a download of the official Claude Chrome extension (v1.0.66). Minified JS, compiled React, and the stock `manifest.json`. Useful as a reference for:
- Manifest V3 surface area (side panel, content scripts, accessibility-tree script, offscreen document, context menus, commands).
- The permissions used by the official product.
- Host permissions and CSP shape.

**What we kept:**
- The manifest shape: MV3, `side_panel`, `options_page`, `content_scripts`, `commands` (`Ctrl+E` toggle).
- Host-wide activation (`<all_urls>`).
- The idea of page-aware actions (summarize, rewrite, extract) driven by an accessibility / DOM snapshot.

**What we did not copy:**
- The compiled/obfuscated code (it isn't source, and re-uploading it would be copying a binary).
- The network endpoints (`claude.ai`, Segment, Sentry, Honeycomb, Datadog) — the official extension phones home to infrastructure we don't run.
- The proprietary "pairing" flow, agent-visual-indicator, and offscreen worker pipelines — those require the Claude product's backend. Our extension talks to our own Cowork backend (or direct Anthropic as fallback).

**Missing features (in DCE-as-source) that we fixed:**
- There is no buildable source — we wrote a clean, typed, buildable extension with Vite + CRXJS.
- No customization surface — we added a full options page (API base, model, max tokens, per-host disable, system addendum, history viewer).
- No local history — we added a 200-entry rotating local history stored under `chrome.storage.local`.
- No "replace selection in the page" action — added.

---

## Final architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the diagram and rationale. The short version:

```
┌────────────────────────────────────────────────────────────┐
│  @claude-eco/shared  (SDK client, models, prompts, types)  │
└────────────────────────────────────────────────────────────┘
         ▲                 ▲                 ▲
         │                 │                 │
   claude-code      claude-cowork     claude-extension
      (Node)         (Express)           (MV3)
                        │                   │
                        └──────── /api ─────┘   ← extension prefers Cowork,
                                                  falls back to direct Anthropic
```

One model list. One client. One set of personas. Three surfaces.

---

## Implementation status

| Surface           | Streaming | Tool use | Sessions | Model switch | Page-aware | Autonomous agent |
|-------------------|:---------:|:--------:|:--------:|:------------:|:----------:|:----------------:|
| `claude-code`     |     ✓     |    ✓     |    ✓     |      ✓       |     —      |        ✓         |
| `claude-cowork`   |     ✓     |    ✓     |    ✓     |      ✓       |     —      |        ✓         |
| `claude-extension`|   via SSE |    —     |  (local) |      ✓       |     ✓      |        —         |

Gaps we accepted:
- The extension does not run the agent tool-loop inside the browser; it proxies to Cowork for autonomy. This keeps the MV3 bundle small and avoids executing destructive tools in-page. (Autonomous runs happen in Cowork's sandboxed server context instead.)

Every feature requested in the prompt is implemented end-to-end.
