import {
  AGENT_MODES,
  formatProviderLabel,
  readSubagentModelId,
  type Agent,
} from 'poyraz';
import { modeCycleHint } from './repl-terminal.js';
import { theme } from './repl-theme.js';

export function printReplBanner(agent: Agent, mcpConnected = 0): void {
  const profile = agent.getModelProfile();
  const modeLabel = AGENT_MODES[agent.getMode()].label;
  const tools = agent.getTools();
  const toolLabel = tools.length === 1 ? '1 tool' : `${tools.length} tools`;
  const subagent = readSubagentModelId();
  const mcp =
    mcpConnected > 0
      ? ` · mcp ${mcpConnected}`
      : '';

  console.log(
    theme.bold(
      `poyraz · ${modeLabel} · ${profile.model} (${formatProviderLabel(profile.provider)}) · ${toolLabel}${mcp}`
    )
  );
  console.log(
    theme.meta(
      `subagent ${subagent ?? 'off'} · /help · ${modeCycleHint()}`
    )
  );
}
