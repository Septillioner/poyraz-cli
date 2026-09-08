# poyraz-cli

Terminal REPL for the [poyraz](https://www.npmjs.com/package/poyraz) agent runtime. Chat with coding agents, switch modes and models, manage API keys, and attach custom MCP servers — all from your project directory.

## Requirements

- **Node.js >= 20**
- At least one model provider (API key and/or a running [Ollama](https://ollama.com) host)

## Install

```bash
npm install -g poyraz-cli
```

This installs the `poyraz` command and pulls in the `poyraz` library.

## Quick start

```bash
cd your-project
poyraz
```

1. On first launch in a project, choose whether to trust the workspace (enables local debug logs under `.poyraz/log/`).
2. Set a provider with `/auth` (or put keys in `~/.poyraz/.env` — see [Auth](docs/auth.md)).
3. Type a message, or use slash commands listed below.

```bash
poyraz poyraz-2.0          # named template
poyraz --model gpt-4o-mini # pick a model at startup
```

## Documentation

| Guide | Audience |
|-------|----------|
| [Getting started](docs/getting-started.md) | Users — install, first run, common issues |
| [CLI invocation](docs/cli.md) | Users — templates, `--model`, resolution order |
| [Commands](docs/commands.md) | Users — slash command reference |
| [Auth](docs/auth.md) | Users — providers and `~/.poyraz/.env` |
| [Models and modes](docs/models-and-modes.md) | Users — agent / plan / ask / chat, model picker |
| [MCP](docs/mcp.md) | Users — custom MCP servers |
| [Configuration](docs/configuration.md) | Users — env vars and file paths |
| [Development](docs/development.md) | Contributors — build, layout, CI |

## REPL commands (summary)

| Command | Description |
|---------|-------------|
| `/help` | Command and keyboard help |
| `/auth` | Manage API keys / Ollama host (`~/.poyraz/.env`) |
| `/model` | Interactive model picker |
| `/model subagent` | Pick/clear cheaper model for `delegate_task` |
| `/mode` | Interactive mode picker (agent / plan / ask / chat) |
| `/mcp` | Manage MCP servers (`~/.poyraz/mcp.json`) |
| `/todo` | Show session todos |
| `/usage` | Token and context usage |
| `/verbose on\|off` | Toggle detailed stream output (reasoning + child tool traces) |
| `/bye` | Exit |

Aliases still work but are hidden from help/Tab: `/todos`, `/stats`, `/exit`, `/quit`.

Bare `/auth`, `/model`, `/mode`, and `/mcp` open interactive panels. Subcommands are documented in [Commands](docs/commands.md).

**Shortcuts:** Shift+Tab or Alt+M cycles mode. Tab completes slash commands and subcommands. ↑/↓ history. Esc clears the draft. Ctrl+C clears the draft (press again within 2s to exit); while streaming it aborts the reply and cancels an active background subagent.

## Building from source

```bash
git clone <repository-url>
cd poyraz-cli
npm install
npm run build
npm start
```

See [Development](docs/development.md) for scripts, linking a local `poyraz` library, and contribution notes.

## License

[MIT](LICENSE)
