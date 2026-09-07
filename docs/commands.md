# Commands

Slash commands are entered at the REPL prompt. Unknown `/…` commands print a hint listing known commands.

Interactive panels (no subcommand):

| Command | Opens |
|---------|--------|
| `/auth` | Auth panel |
| `/model` | Searchable model picker |
| `/mode` | Mode picker |
| `/mcp` | MCP panel |

## `/auth`

Manage credentials in `~/.poyraz/.env`. Full guide: [Auth](auth.md).

| Form | Behavior |
|------|----------|
| `/auth` | Interactive panel |
| `/auth list` | Providers + masked values + file path |
| `/auth path` | Print env file path |
| `/auth import` / `/auth pull` | Import auth keys from project `.env` walk (skip existing) |
| `/auth import --overwrite` / `/auth import overwrite` | Import and overwrite |
| `/auth show <provider>` | One provider (masked) |
| `/auth set <provider> [value]` | Set value (prompts if omitted) |
| `/auth unset <provider>` | Remove from file and process env |

Providers: `openai`, `groq`, `gemini`, `openrouter`, `ollama`.

## `/mode`

Modes: `agent`, `plan`, `ask`, `chat`. Details: [Models and modes](models-and-modes.md).

| Form | Behavior |
|------|----------|
| `/mode` | Interactive picker |
| `/mode list` | List modes + active |
| `/mode agent` \| `plan` \| `ask` \| `chat` | Switch and persist |

Switching to `agent` while todos exist prints a handoff table for the current plan.

## `/model`

| Form | Behavior |
|------|----------|
| `/model` | Interactive searchable picker |
| `/model list` | List by provider (OpenRouter split into free / premium; up to 20 ids per group) |
| `/model info` | Current model metadata + runtime context |
| `/model info <id>` | Metadata for a model id |
| `/model info <provider> <id>` | Same, with provider token |
| `/model <id>` | Switch to model |
| `/model <provider> <id>` | Switch with provider hint (`openai`, `groq`, `gemini`, `openrouter`, `ollama`) |

For OpenRouter, a leading `free/` / `premium/` (or space form) on the model part is stripped when parsing.

Last model is saved to session prefs.

## `/mcp`

Config file: `~/.poyraz/mcp.json`. Guide: [MCP](mcp.md).

| Form | Behavior |
|------|----------|
| `/mcp` | Interactive panel |
| `/mcp list` | Servers + connection status |
| `/mcp path` | Print config path |
| `/mcp reload` | Reconnect all and rematch tools |
| `/mcp add <id>` | Interactive add (stdio or http) |
| `/mcp remove <id>` | Remove server |
| `/mcp enable <id>` | Enable |
| `/mcp disable <id>` | Disable |

## Todos and usage

| Command | Alias | Behavior |
|---------|-------|----------|
| `/todo` | `/todos` | Print todo table + progress |
| `/usage` | `/stats` | Model, mode, tools, context/turns, session and last-turn tokens, API key preview |

## Exit

| Command | Notes |
|---------|--------|
| `/bye` | Preferred |
| `/exit`, `/quit` | Same |
| `exit`, `quit` | Without slash |

Exiting disconnects MCP and prints a goodbye line.

## Keyboard and interrupt

| Action | Keys |
|--------|------|
| Cycle mode | Unix/WSL: **Shift+Tab**. Windows Console: **Tab** / **Shift+Tab** or **Ctrl+Shift+M** (Tab cannot be distinguished from Shift+Tab on classic Windows Console) |
| Abort reply | **Ctrl+C** while a response is in progress |
| Cancel idle prompt | **Ctrl+C** / Esc on prompts (exits REPL when cancelling the main input) |

Related: [Getting started](getting-started.md), [CLI](cli.md).
