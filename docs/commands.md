# Commands

Slash commands are entered at the REPL prompt. Unknown `/…` commands suggest the closest match and point to `/help`.

Interactive panels (no subcommand):

| Command | Opens |
|---------|--------|
| `/auth` | Auth panel |
| `/model` | Searchable model picker |
| `/mode` | Mode picker |
| `/mcp` | MCP panel |

## `/help`

| Form | Behavior |
|------|----------|
| `/help` | Grouped command overview |
| `/help keys` | Keyboard contract |
| `/help model` | Model command details |
| `/help mode` | Mode command details |

Subagents use `/model subagent` (persists `SUBAGENT_MODEL`). When set, agent mode may call `delegate_task` as a **background** research job (one at a time; results auto-inject). See [Models and modes](models-and-modes.md).

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
| `/model` | Interactive searchable picker (session model) |
| `/model list` | List by provider (OpenRouter split into free / premium; up to 20 ids per group) |
| `/model info` | Current model metadata + runtime context |
| `/model info <id>` | Metadata for a model id |
| `/model info <provider> <id>` | Same, with provider token |
| `/model subagent` | Show current subagent model + picker (writes `SUBAGENT_MODEL`) |
| `/model subagent <id>` | Set subagent model id |
| `/model subagent <provider> <id>` | Set with provider hint |
| `/model subagent clear` / `unset` | Clear `SUBAGENT_MODEL` and disable `delegate_task` |
| `/model subagent show` | Print current subagent model / env path |
| `/model <id>` | Switch session model |
| `/model <provider> <id>` | Switch with provider hint (`openai`, `groq`, `gemini`, `openrouter`, `ollama`) |

For OpenRouter, a leading `free/` / `premium/` (or space form) on the model part is stripped when parsing.

Last session model is saved to session prefs. Subagent model is stored in `~/.poyraz/.env` as `SUBAGENT_MODEL` and synced into the running agent (no restart).

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

## Todos, usage, and verbosity

| Command | Alias | Behavior |
|---------|-------|----------|
| `/todo` | `/todos` | Print todo table + progress |
| `/usage` | `/stats` | Model, mode, tools, context/turns, session and last-turn tokens, API key preview |
| `/verbose on` | — | Show reasoning stream, extra tool detail, and child subagent tool traces |
| `/verbose off` | — | Quiet stream (default; still shows subagent start/done lines) |

## Exit

| Command | Notes |
|---------|--------|
| `/bye` | Preferred (shown in help / Tab) |
| `/exit`, `/quit` | Hidden aliases |
| `exit`, `quit` | Without slash |

Exiting disconnects MCP and prints a goodbye line.

## Keyboard and interrupt

| Action | Keys |
|--------|------|
| Cycle mode | **Shift+Tab** or **Alt+M**. Or `/mode` |
| Complete slash / subcommand | **Tab** (for example `/au` → `/auth`, `/model li` → `/model list`) |
| History | **↑** / **↓** |
| Clear draft | **Esc**, or **Ctrl+C** when the line is non-empty |
| Exit REPL | **Ctrl+C** twice within 2s on an empty prompt, or `/bye` |
| Abort reply | **Ctrl+C** while a response is in progress (also cancels an active background subagent) |

Related: [Getting started](getting-started.md), [CLI](cli.md).
