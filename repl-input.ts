import chalk from 'chalk';
import { AGENT_MODES, type Agent, type AgentMode } from 'poyraz';
import { theme } from './repl-theme.js';

export function isExitCommand(text: string): boolean {
  return (
    text === '/bye' ||
    text === '/exit' ||
    text === '/quit' ||
    text === 'exit' ||
    text === 'quit'
  );
}

function colorizeModeLabel(mode: AgentMode, label: string): string {
  switch (mode) {
    case 'plan':
      return chalk.yellow(label);
    case 'ask':
      return chalk.green(label);
    case 'agent':
      return chalk.white(label);
    case 'chat':
      return chalk.gray(label);
  }
}

function truncateModel(model: string, modeLabel: string): string {
  const max = Math.max(12, (process.stdout.columns || 80) - modeLabel.length - 10);
  if (model.length <= max) return model;
  return `${model.slice(0, max - 1)}…`;
}

export function buildInputMessage(agent: Agent, subagentSuffix?: string): string {
  const mode = agent.getMode();
  const modeLabel = AGENT_MODES[mode].label;
  const modePart = colorizeModeLabel(mode, modeLabel);
  const model = truncateModel(agent.getModelProfile().model, modeLabel);
  const base = `${theme.meta('[')}${modePart}${theme.meta('·')}${theme.meta(model)}${theme.meta(']')}`;
  if (!subagentSuffix) return base;
  return `${base} ${theme.meta(subagentSuffix)}`;
}
