# CLI invocation

```bash
poyraz [template] [--model <id>]
```

There is no `--help` flag. Unknown flags that start with `-` (other than `--model`) are ignored.

## Arguments

| Argument | Meaning |
|----------|---------|
| Positional (non-`-`) | Template name (for example `poyraz-2.0`) |
| `--model <id>` | Model id at startup (exact or partial match against available models; otherwise inferred by provider heuristics) |

Examples:

```bash
poyraz
poyraz poyraz-2.0
poyraz --model gpt-4o-mini
poyraz poyraz-2.0 --model openai/gpt-4o-mini
```

## Template resolution

Order:

1. Positional CLI name  
2. Environment: `TEMPLATE_NAME` or `AGENT_NAME`  
3. Default — highest `order` among synced templates under `~/.poyraz/data/configs/templates` (ties broken by name, descending)

If no templates exist, startup fails with an error about syncing bundled templates.

Startup logs show the source: `(via CLI)`, `(via ENV)`, or `(default from library)`.

## Model resolution

Order (via the `poyraz` library’s `resolveModelProfile`):

1. `--model <id>` — match listed models (exact, then substring on id/name), else infer provider from the id and env  
2. `DEFAULT_MODEL`  
3. Last model from session prefs (`lastModelProfile`)  
4. First available provider key’s default:
   - OpenAI → `gpt-4o`
   - Groq → `llama-3.3-70b-versatile`
   - Gemini → `gemini-2.0-flash`
   - OpenRouter → `openai/gpt-4o-mini`
   - else Ollama → `llama3.2` (host from `OLLAMA_HOST` if set)

You can change the model later with `/model` (see [Models and modes](models-and-modes.md)).

## Session mode on startup

If session prefs store `lastMode`, that mode is restored after the agent is built (before the REPL starts).

## Startup sequence (overview)

1. Load env (`~/.poyraz/.env`, then project `.env` walk)  
2. Workspace trust / logging  
3. Resolve template and model  
4. Build agent from template, restore mode, `init`  
5. Connect MCP servers and merge tools  
6. Enter REPL  

Related: [Configuration](configuration.md), [MCP](mcp.md).
