# Auth

Poyraz CLI stores provider credentials in a **global** env file and can also pick up project `.env` files.

## Storage

| Path | Role |
|------|------|
| `~/.poyraz/.env` | Canonical store managed by `/auth` |

Do **not** commit this file or paste real keys into issues or docs. Prefer `/auth set` so values are written locally.

## Providers

| Token | Environment variable | Secret | Notes |
|-------|----------------------|--------|--------|
| `openai` | `OPENAI_API_KEY` | yes | |
| `groq` | `GROQ_API_KEY` | yes | |
| `gemini` | `GEMINI_API_KEY` | yes | |
| `openrouter` | `OPENROUTER_API_KEY` | yes | Optional headers: `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE` |
| `ollama` | `OLLAMA_HOST` | no | Default when prompting: `http://localhost:11434` |

## Load order

On startup, `loadAllEnv()`:

1. Loads `~/.poyraz/.env` into `process.env` **without** overriding variables already set in the environment.  
2. Walks from the current directory upward, loading each project `.env` **with** override (closer/deeper files can override earlier ones as the walk continues — project values win over the global file for the same key when both are loaded this way).

After `/auth` changes, the CLI reloads the global file and refreshes model lists.

## Commands

Interactive:

```text
/auth
```

Panel actions: per-provider show / set / unset, import from project `.env`, show path, exit.

CLI forms:

```text
/auth list
/auth path
/auth show openai
/auth set openai
/auth set openai sk-...your-key...
/auth unset groq
/auth import
/auth import --overwrite
/auth pull
```

`/auth import` (and `/auth pull`) copies recognized auth keys from project `.env` files into `~/.poyraz/.env`. Existing global values are skipped unless you pass `--overwrite` / `overwrite`.

## Examples

List status (values are masked):

```text
/auth list
```

Set Ollama host:

```text
/auth set ollama http://localhost:11434
```

## Related

- [Configuration](configuration.md) — full env and path reference  
- [Models and modes](models-and-modes.md) — which providers appear in `/model list`  
- Library docs on npm: [poyraz](https://www.npmjs.com/package/poyraz)  
