# Claude Cowork

Chat + workspace + tasks + autonomous agent web app.

## Run in development

From the repo root:

```bash
pnpm install
cp .env.example .env   # and fill in ANTHROPIC_API_KEY
pnpm --filter claude-cowork dev
```

This starts:

- Express API on `http://127.0.0.1:5174` (`COWORK_PORT`)
- Vite web UI on `http://localhost:5173` with `/api` proxied to the backend

## Production build

```bash
pnpm --filter claude-cowork build
pnpm --filter claude-cowork start
```

The Express server serves the built SPA from `dist/web` and exposes the API at `/api/*`.

## API surface

| Method + path               | Purpose                                                   |
|-----------------------------|-----------------------------------------------------------|
| `GET  /api/health`          | Health check                                              |
| `GET  /api/models`          | List supported Claude models                              |
| `GET/POST /api/sessions`    | List / create sessions                                    |
| `GET/PATCH/DELETE /api/sessions/:id` | Get / update / delete a session                  |
| `GET/POST /api/tasks`       | List / create tasks (`?session_id=` filter)               |
| `PATCH/DELETE /api/tasks/:id` | Update or delete task                                   |
| `POST /api/chat`            | Streaming chat (SSE: `token`, `done`, `error`)            |
| `POST /api/chat/complete`   | One-shot non-streaming chat (used by the extension popup) |
| `POST /api/agent/run`       | Streaming autonomous agent (SSE: `step`, `thought`, `tool_call`, `tool_result`) |
| `GET  /api/browse/fetch?url=` | Server-side page fetch                                  |
| `GET  /api/browse/search?q=`  | DuckDuckGo web search                                   |

## Storage

SQLite at `./.sessions/cowork.sqlite`. Sessions, tasks, and logs live here.
