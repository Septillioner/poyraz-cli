# Configuration

User-facing reference for environment variables and on-disk paths used by **poyraz-cli** (via the `poyraz` library).

## Environment variables

### Template and model

| Variable | Role |
|----------|------|
| `TEMPLATE_NAME` | Default template if no CLI positional name |
| `AGENT_NAME` | Alias for `TEMPLATE_NAME` |
| `DEFAULT_MODEL` | Preferred model when `--model` is omitted |
| `SUBAGENT_MODEL` | Cheaper model id for `delegate_task` subagents; if unset, delegation is disabled. Prefer setting via `/model subagent` |

### Providers

| Variable | Role |
|----------|------|
| `OPENAI_API_KEY` | OpenAI |
| `GROQ_API_KEY` | Groq |
| `GEMINI_API_KEY` | Gemini |
| `OPENROUTER_API_KEY` | OpenRouter |
| `OLLAMA_HOST` | Ollama base URL (not a secret key) |
| `OPENROUTER_HTTP_REFERER` | Optional OpenRouter `HTTP-Referer` header |
| `OPENROUTER_APP_TITLE` | Optional OpenRouter `X-Title` header |

Manage the common auth vars with `/auth` — see [Auth](auth.md).

### Workspace logging

| Variable | Role |
|----------|------|
| `POYRAZ_TRUST_WORKSPACE` | If `1`, `true`, or `yes` (case-insensitive), enables file logging as trusted at the library level |

Note: the CLI trust **prompt** still runs when no `settings.json` exists; this env is an override for logging trust in the library. Prefer workspace settings for a durable per-project choice.

## Global home (`~/.poyraz/`)

| Path | Purpose |
|------|---------|
| `.env` | API keys / `OLLAMA_HOST` |
| `mcp.json` | Custom MCP servers |
| `data/configs/templates/` | Synced bundled templates |
| `data/configs/session-prefs.json` | `lastModelProfile`, `lastMode` when no project `data/configs` wins |

## Per-workspace (`<project>/.poyraz/`)

Created when a workspace root is detected (parent with `.git`, `package.json`, or `data/configs`).

| Path | Purpose |
|------|---------|
| `settings.json` | `{ "trusted": boolean, "trustedAt": "…" }` |
| `log/` | Debug dumps when trusted |

Add `.poyraz/` to project `.gitignore` (do not commit logs or local trust state with secrets).

If the directory walk finds a project `data/configs`, session prefs may live under that project data dir instead of the global home (library behavior).

## Env file loading

1. `~/.poyraz/.env` — fill missing keys only (does not override existing process env).  
2. Project `.env` files from cwd upward — override into `process.env`.

## Related

- [CLI invocation](cli.md) — how template/model resolution uses these values  
- [Getting started](getting-started.md) — trust prompt  
- [MCP](mcp.md) — `mcp.json` schema  
