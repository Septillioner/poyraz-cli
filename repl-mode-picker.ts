import { select } from '@inquirer/prompts';
import { AGENT_MODES, type AgentMode } from 'poyraz';
import { switchAgentMode, type ReplCommandContext } from './repl-commands.js';
import { isPanelCancelled } from './repl-panel.js';
import { printHint } from './repl-theme.js';

export async function runModePicker(ctx: ReplCommandContext): Promise<void> {
  try {
    const current = ctx.agent.getMode();
    const selected = await select<AgentMode>({
      message: `Mode (${AGENT_MODES[current].label})`,
      choices: (Object.values(AGENT_MODES) as (typeof AGENT_MODES)[AgentMode][]).map(
        (def) => ({
          name: def.id === current ? `${def.label} (active)` : def.label,
          value: def.id,
          description: def.description,
        })
      ),
    });

    if (selected) {
      switchAgentMode(ctx, selected);
    }
  } catch (error: unknown) {
    if (isPanelCancelled(error)) {
      printHint('Cancelled.');
      return;
    }
    throw error;
  }
}
