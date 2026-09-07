# Getting started

## Install

```bash
npm install -g poyraz-cli
```

Requires **Node.js 20+**. The package exposes the `poyraz` binary and depends on the [`poyraz`](https://www.npmjs.com/package/poyraz) runtime.

## First run

From a project directory:

```bash
poyraz
```

Startup prints the active **template** and **model**, then opens a REPL.

### Workspace trust

If the CLI finds a workspace root (a parent with `.git`, `package.json`, or a `data/configs` layout), and you have not decided yet, it asks whether to trust the workspace:

- **Trust** — enables file debug logs under `<project>/.poyraz/log/` and writes `<project>/.poyraz/settings.json`.
- **Do not trust** — no file logs; the choice is still saved in `settings.json`.
- **Cancel (Esc)** — treated as not trusted.

Outside a detected project, logging stays off and there is no prompt. Details: [Configuration](configuration.md).

### Auth

You need credentials for at least one provider (or a reachable Ollama host):

```text
/auth
```

Or set keys in `~/.poyraz/.env`. See [Auth](auth.md).

### Chat

Type a normal message at the prompt. Slash commands start with `/` — see [Commands](commands.md).

```text
/mode plan
Explain how auth is loaded in this repo
/mode agent
Implement the fix we discussed
```

## Useful startup variants

```bash
poyraz poyraz-2.0
poyraz --model gpt-4o-mini
poyraz poyraz-2.0 --model llama3.2
```

Template and model resolution: [CLI invocation](cli.md).

## Common issues

| Symptom | What to check |
|---------|----------------|
| `No templates found...` | Bundled templates failed to sync under `~/.poyraz/data/configs/templates`. Reinstall `poyraz` / `poyraz-cli`, or ensure the home directory is writable. |
| No models / auth errors | Run `/auth list`. Set an API key or `OLLAMA_HOST`. Confirm Ollama is running if you use local models. |
| Initialization failed | Read the error after `Initialization failed:`. Often missing templates, env, or MCP connect issues. |
| Unexpected model | Check `--model`, `DEFAULT_MODEL`, and last session prefs (`/model info`). See [CLI](cli.md). |

## Next steps

- [Commands](commands.md) — full slash reference  
- [Models and modes](models-and-modes.md) — tool access by mode  
- [MCP](mcp.md) — attach external tools  
- [Configuration](configuration.md) — env and paths  
