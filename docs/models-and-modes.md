# Models and modes

## Modes

The active mode filters which tools the agent may use and adjusts system behavior. Cycle order: **agent → plan → ask → chat → …**

| Mode | Tools |
|------|--------|
| `agent` | All base tools (including MCP tools merged into the base set) |
| `plan` | `read_file`, `list_dir`, `glob_file_search`, `grep`, `todo_write` |
| `ask` | `read_file`, `list_dir`, `glob_file_search`, `grep` |
| `chat` | None |

Practical intent:

- **Agent** — implement and run commands until the task is done.  
- **Plan** — explore read-only, write a todo plan once per turn, do not edit or shell. Switch to agent to apply.  
- **Ask** — Q&A with read-only tools only.  
- **Chat** — plain conversation, no tools.

MCP tools are available in **agent** mode; other modes filter them out unless a tool name is on that mode’s allowlist (built-in allowlists do not include typical `mcp_*` names).

### Switching

```text
/mode
/mode list
/mode agent
/mode plan
```

Keyboard cycle (same order as above):

- **Unix / WSL:** Shift+Tab  
- **Windows Console:** Tab / Shift+Tab, or Ctrl+Shift+M  

Mode is persisted in session prefs (`lastMode`).

## Models

Providers that appear when credentials (or Ollama) are available: **ollama**, **openai**, **groq**, **gemini**, **openrouter**.

### Interactive picker

```text
/model
```

Search by namespace-style queries (for example provider-qualified ids). Empty query shows a capped list per provider; filtered results are capped as well.

### List and info

```text
/model list
/model info
/model info gpt-4o-mini
/model info openrouter openai/gpt-4o-mini
```

`/model list` groups by provider. OpenRouter rows are split into **free** and **premium** tiers (up to 20 ids shown per group).

### Direct switch

```text
/model gpt-4o-mini
/model openai gpt-4o-mini
/model openrouter free/openai/gpt-4o-mini
```

For OpenRouter, a leading `free` / `premium` token on the model part is stripped when parsing. The chosen profile is saved as `lastModelProfile`.

Startup model selection (CLI / env / prefs): [CLI invocation](cli.md).

## Usage and todos

```text
/usage
/todo
```

`/usage` (alias `/stats`) shows model, mode, tools, context window usage, turns, session and last-turn tokens. `/todo` (alias `/todos`) prints the session todo table.

## Related

- [Commands](commands.md)  
- [Auth](auth.md)  
- [MCP](mcp.md)  
