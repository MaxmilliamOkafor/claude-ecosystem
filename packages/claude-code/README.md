# Claude Code

Terminal coding assistant with agent mode, file I/O, shell execution, live web browsing, project memory, and session persistence.

## Install

From the repo root:

```bash
pnpm install
pnpm --filter claude-code build
```

Then link the binary or run it directly:

```bash
node packages/claude-code/dist/cli.js chat
# or, if linked:
claude-code chat
```

## Quick start

```bash
# set your key once
export ANTHROPIC_API_KEY=sk-ant-...

# interactive REPL in the current repo
claude-code chat

# one-shot question with agent tools
claude-code ask "find where retry logic lives and add jitter"

# switch default model
claude-code set model claude-opus-4-6

# list sessions / resume
claude-code sessions
claude-code chat --resume <id-prefix>
```

## Built-in tools (used by the agent)

| Tool          | Purpose                                        |
|---------------|------------------------------------------------|
| `repo_map`    | Tree-style overview of the project             |
| `list_dir`    | List a directory                               |
| `read_file`   | Read file contents (with optional line range)  |
| `write_file`  | Create or overwrite a file (confirmation gate) |
| `edit_file`   | Exact-string replacement (confirmation gate)   |
| `grep`        | Regex search across project                    |
| `glob`        | Find files by substring / extension            |
| `run_shell`   | Execute a shell command (confirmation gate)    |
| `web_fetch`   | Fetch + clean a web page                       |
| `web_search`  | DuckDuckGo HTML search                         |

## Slash commands

```
/help   /quit   /clear
/model <id|opus|sonnet|haiku>
/models         /sessions        /resume <id>
/new [title]    /memory <note>   /log
/auto writes|shell on|off
```

## Project memory

Claude Code reads `.claude-code-memory.md` at the project root and injects it
into the system prompt. Append to it with `/memory <note>` or edit the file
directly.
