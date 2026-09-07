import { select } from '@inquirer/prompts';
import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import { AGENT_MODES, type AgentMode } from 'poyraz';
import { switchAgentMode, type ReplCommandContext } from './repl-commands.js';
import { printField, printHint, printSection } from './repl-theme.js';

function isPickerCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

export async function runModePicker(ctx: ReplCommandContext): Promise<void> {
  try {
    const current = ctx.agent.getMode();
    const currentDef = AGENT_MODES[current];

    printSection('Mod sec');
    printField('Aktif:', `${currentDef.label} (${current})`);
    printHint('Agent: tam erisim · Plan: okuma + plan · Ask: salt-okuma · Chat: aracsiz');
    console.log();

    const selected = await select<AgentMode>({
      message: 'Mod sec',
      choices: (Object.values(AGENT_MODES) as (typeof AGENT_MODES)[AgentMode][]).map((def) => ({
        name: def.id === current ? `${def.label} (aktif)` : def.label,
        value: def.id,
        description: def.description,
      })),
    });

    if (selected && selected !== current) {
      switchAgentMode(ctx, selected);
    }
  } catch (error: unknown) {
    if (isPickerCancelled(error)) {
      printHint('Mod secimi iptal edildi.');
      return;
    }
    throw error;
  }
}
