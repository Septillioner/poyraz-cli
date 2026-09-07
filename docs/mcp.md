# MCP

Custom [Model Context Protocol](https://modelcontextprotocol.io) servers extend the agent with extra tools. The CLI connects configured servers at startup and merges their tools into the agent (usable in **agent** mode — see [Models and modes](models-and-modes.md)).

## Config file

Path: `~/.poyraz/mcp.json`

Shape:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
      "env": {
        "SOME_KEY": "value"
      }
    },
    "remote": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### stdio servers

| Field | Required | Description |
|-------|----------|-------------|
| `command` | yes | Executable (for example `npx`, `node`) |
| `args` | no | Argument list |
| `env` | no | Extra environment for the process |
| `cwd` | no | Working directory (editable in the JSON file; the interactive add flow does not prompt for it) |
| `disabled` | no | If `true`, skipped on connect |

### HTTP servers

| Field | Required | Description |
|-------|----------|-------------|
| `url` | yes | Streamable HTTP MCP endpoint |
| `headers` | no | HTTP headers (for example auth) |
| `disabled` | no | If `true`, skipped on connect |

Keep secrets out of git. Prefer home-directory `mcp.json` or inject headers from your environment when editing the file by hand.

## Commands

```text
/mcp
/mcp list
/mcp path
/mcp reload
/mcp add my-server
/mcp remove my-server
/mcp enable my-server
/mcp disable my-server
```

`/mcp` and `/mcp add <id>` use interactive prompts to choose **stdio** or **http** and fill the fields.

After add / remove / enable / disable / reload, the CLI reconnects and rematches tools on the agent.

At startup, if any tools connect successfully, the CLI prints how many servers and tools were attached.

## Related

- [Commands](commands.md)  
- [Configuration](configuration.md)  
- [Getting started](getting-started.md)  
