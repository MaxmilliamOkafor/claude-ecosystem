# Architecture

## One picture

```
          ┌─────────────────────────────────────────────┐
          │            @claude-eco/shared                │
          │   (Anthropic client, models, prompts, types) │
          └─────────────────────────────────────────────┘
                 ▲             ▲              ▲
                 │             │              │
        ┌────────┴─────┐  ┌────┴──────┐  ┌────┴───────────┐
        │ claude-code  │  │  cowork   │  │ claude-ext     │
        │ (Node CLI)   │  │ (Express  │  │  (MV3 browser  │
        │              │  │  +React)  │  │   extension)   │
        └─────┬────────┘  └────┬──────┘  └──────┬─────────┘
              │                │                │
         fs / shell       SQLite + SSE      chrome.* APIs
        web_fetch/search   /api/chat        content script
              │            /api/agent       page-reader
              │            /api/tasks           │
              ▼            /api/browse          │
         local tools           ▲                │
                               │                │
                               └──── /api ──────┘
                                  extension uses
                                  Cowork backend,
                                  falls back to
                                  Anthropic direct
```

## Design principles

### 1. Single source of truth for models
Every surface imports `listModels()` / `resolveModel()` from `@claude-eco/shared`. Adding Opus 4.7 tomorrow is a one-line edit in `packages/shared/src/models.ts`; the CLI `/models` command, the Cowork model selector, the extension popup/options dropdowns, and the extension's direct-API fallback all update together.

### 2. Single Anthropic client
`getClient()` in `shared/src/client.ts` is the only place that reads `ANTHROPIC_API_KEY`. It exports three helpers:
- `chat()` — one-shot completion.
- `streamChat()` — normalized async-iterable streaming.
- `withRetry()` — exponential backoff (4 retries, 750ms base, jitter, max 15s) used by the CLI, Cowork chat, and Cowork agent.

### 3. Personas, not branches
Instead of maintaining three agents, we maintain three **system prompts**: `CLAUDE_CODE_SYSTEM`, `CLAUDE_COWORK_SYSTEM`, `CLAUDE_EXTENSION_SYSTEM`. The extension persona adds a `<page_context>` block at runtime.

### 4. Tools are local to the surface that owns them
- **Claude Code** exposes real file I/O, shell exec, and project search — because the user controls the sandbox.
- **Cowork** exposes task + browse tools, but **not** file I/O or shell — it runs in a long-lived server process.
- **Extension** exposes no tool use directly. It either uses Cowork's autonomous agent endpoint or asks one-shot questions. This prevents web pages from convincing the extension to write to the user's disk.

### 5. Streaming everywhere
- CLI streams tool calls and token updates through its agent loop to `onStep` callbacks.
- Cowork streams tokens (`/api/chat`) and structured agent events (`/api/agent/run`) as Server-Sent Events.
- Extension popup uses the non-streaming `/api/chat/complete` endpoint; the side panel could be upgraded to SSE trivially (the same `streamSSE` helper is available).

### 6. Graceful degradation
If the local Cowork server isn't running, the extension can call Anthropic directly (with a user-provided key). If the Anthropic API is flaky, `withRetry` absorbs transient failures. If project memory is missing, prompts still work.

## Data flow, end to end

### Claude Code — a single user turn

```
user   ──► REPL
            │
            │ append user message to session.messages
            ▼
       agent.runAgentTurn
            │
            │ loop up to max_steps:
            │   chat() → { content: [...blocks] }
            │   for each tool_use block:
            │       findTool(name).run(input, ctx)   ← fs / shell / grep / etc.
            │       push { type: tool_result } as user message
            │   if no more tool_use, break
            ▼
       saveSession → ~/.claude-code/sessions/<uuid>.json
```

### Claude Cowork — autonomous agent

```
user   ──► /api/agent/run  { session_id, goal }
                │
                │ SSE stream opens
                ▼
             for step in 1..12:
                 messages.create({ tools })
                 emit "thought" for text blocks
                 for each tool_use:
                     execute server tool  (add_task, browse_fetch, …)
                     emit "tool_call" + "tool_result"
                 if finish tool called, break
             emit "done"
```

### Extension — "summarize page" from the right-click menu

```
contextMenus.onClicked
   │
   │ store { action, tab, url, selection } in chrome.storage.session
   ▼
 sidePanel.open(tabId)
   │
   │ SidePanel reads pending-action, picks preset, calls runPreset()
   ▼
 collectPageContext()  ← chrome.scripting.executeScript runs extractInPage
   │
   ▼
 ask()  ──► Cowork  /api/chat/complete  { persona: "extension", page_context }
           │
           └─── fallback: https://api.anthropic.com/v1/messages
```

## Security

- **No secrets in code.** The SDK key comes from env or (for the extension) `chrome.storage.sync`.
- **Write gates** in the CLI for `write_file`, `edit_file`, `run_shell`. Destructive shell patterns are refused before prompting.
- **No tool use in the browser context.** The extension never executes shell or writes files; its only DOM mutation is the explicit "replace selection" action the user initiates.
- **CORS is open on Cowork** only on the local network (`127.0.0.1` binding by default). Expose it behind a reverse proxy if you host it elsewhere.
- **Per-host disable list** in extension options so bank / intranet tabs can be excluded.

## Extensibility

- **Add a tool** to the CLI: drop a `ToolHandler` into `packages/claude-code/src/tools/` and register it in `tools/index.ts`.
- **Add a route** to Cowork: create a new `server/routes/*.ts` and mount it in `server/index.ts`.
- **Add a preset** to the extension: edit the `PRESETS` array in `src/sidepanel/SidePanel.tsx`.
- **Add a model**: one entry in `packages/shared/src/models.ts`.
