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

- **Shift+Tab** on platforms that emit CSI Z / shift+tab
- **Alt+M** as a secondary shortcut (meta / Esc+m)
- Or `/mode` / `/mode <name>`

Mode changes print a short `Mode → …` toast (including keyboard cycle).

**Tab** completes slash commands and subcommands (for example `/mo` cycles `/mode` / `/model` / `/mcp`; `/model li` → `/model list`). It does not change mode.

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

## Subagent delegation

Configure a cheaper child model from the REPL:

```text
/model subagent
/model subagent gpt-4o-mini
/model subagent clear
```

That writes `SUBAGENT_MODEL` to `~/.poyraz/.env` and calls `agent.syncDelegationTool()` so `delegate_task` appears/disappears without restart. You can still set the env var manually.

When set, the parent agent in **agent** mode may call `delegate_task` to run a read-only research subagent with an isolated context. The child cannot edit files or run shell commands.

Delegation is **non-blocking**: at most one background job runs at a time; the parent continues other tools/rounds. When the child finishes, findings are injected automatically (same turn if the parent was waiting to finalize, otherwise on the next round). A second concurrent `delegate_task` is rejected. The prompt shows `subagent Ns` while a job is running; `/verbose on` also prints child tool lines (`↳ [tool] …`).

`/model subagent clear` disables `delegate_task` and cancels any active background job.

If `SUBAGENT_MODEL` is unset, `delegate_task` is not available.

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
