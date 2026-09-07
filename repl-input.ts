import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import chalk from 'chalk';
import { AGENT_MODES, type Agent, type AgentMode } from 'poyraz';

export function isPromptCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

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
      return chalk.magenta(label);
    case 'chat':
      return chalk.gray(label);
  }
}

function truncateModel(model: string, modeLabel: string): string {
  const max = Math.max(16, (process.stdout.columns || 80) - modeLabel.length - 8);
  if (model.length <= max) return model;
  return `${model.slice(0, max - 1)}…`;
}

export function buildInputMessage(agent: Agent): string {
  const mode = agent.getMode();
  const modeLabel = AGENT_MODES[mode].label;
  const modePart = colorizeModeLabel(mode, modeLabel);
  const model = truncateModel(agent.getModelProfile().model, modeLabel);
  const modelPart = chalk.gray(model);
  return `${chalk.gray('[')}${modePart}${chalk.gray(' · ')}${modelPart}${chalk.gray(']')}`;
}

export const replInputTheme = {
  style: {
    message: (text: string) => text,
    answer: (text: string) => chalk.white(text),
  },
};
