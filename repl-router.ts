import { runAuthPanel } from './repl-auth.js';
import {
  handleReplCommand,
  printSubagentModel,
  switchAgentMode,
  type ReplCommandContext,
} from './repl-commands.js';
import { printHelp, printUnknownCommand } from './repl-help.js';
import { runMcpPanel } from './repl-mcp.js';
import { runModePicker } from './repl-mode-picker.js';
import { runModelPicker, runSubagentModelPicker } from './repl-model-picker.js';
import { withReplPanel } from './repl-panel.js';
import type { ReplSurface } from './repl-surface.js';
import { theme } from './repl-theme.js';

export type ReplRouterContext = ReplCommandContext & {
  verbose: boolean;
  setVerbose: (value: boolean) => void;
  pauseEditor: () => void;
  resumeEditor: () => void;
  surface: ReplSurface;
};

function handleVerboseCommand(text: string, ctx: ReplRouterContext): boolean {
  if (text === '/verbose') {
    console.log(theme.meta(`Verbose: ${ctx.verbose ? 'on' : 'off'}`));
    console.log(theme.meta('Usage: /verbose on | off'));
    return true;
  }
  if (!text.startsWith('/verbose ')) return false;
  const arg = text.slice('/verbose '.length).trim().toLowerCase();
  if (arg === 'on') {
    ctx.setVerbose(true);
    console.log(theme.success('Verbose output enabled'));
    return true;
  }
  if (arg === 'off') {
    ctx.setVerbose(false);
    console.log(theme.success('Verbose output disabled'));
    return true;
  }
  console.log(theme.warning('Usage: /verbose on | off'));
  return true;
}

/**
 * Single entry for slash commands: panels, help, verbose, and subcommands.
 */
export async function dispatchReplCommand(
  text: string,
  ctx: ReplRouterContext
): Promise<void> {
  if (text === '/help' || text.startsWith('/help ')) {
    const topic = text === '/help' ? undefined : text.slice('/help '.length).trim();
    printHelp(topic || undefined);
    return;
  }

  if (handleVerboseCommand(text, ctx)) return;

  const panelHooks = {
    pauseEditor: ctx.pauseEditor,
    resumeEditor: ctx.resumeEditor,
    surface: ctx.surface,
  };

  if (text === '/model') {
    await withReplPanel(panelHooks, undefined, () => runModelPicker(ctx));
    return;
  }
  if (text === '/model subagent') {
    printSubagentModel();
    await withReplPanel(panelHooks, undefined, () => runSubagentModelPicker(ctx));
    return;
  }
  if (text === '/auth') {
    await withReplPanel(panelHooks, undefined, () => runAuthPanel(ctx));
    return;
  }
  if (text === '/mode') {
    await withReplPanel(panelHooks, undefined, () => runModePicker(ctx));
    return;
  }
  if (text === '/mcp') {
    await withReplPanel(panelHooks, undefined, () => runMcpPanel(ctx));
    return;
  }

  const handled = await handleReplCommand(text, ctx);
  if (!handled) {
    printUnknownCommand(text);
  }
}

export { switchAgentMode };
