import { select } from '@inquirer/prompts';
import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import chalk from 'chalk';
import path from 'path';
import {
  applyWorkspaceFileLogging,
  findWorkspaceRoot,
  readWorkspaceSettings,
  writeWorkspaceSettings,
} from 'poyraz';

function isPromptCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

export async function ensureWorkspaceTrustAndLogging(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    applyWorkspaceFileLogging(null, false);
    return;
  }

  const existing = readWorkspaceSettings(workspaceRoot);
  if (existing) {
    applyWorkspaceFileLogging(workspaceRoot, existing.trusted);
    return;
  }

  try {
    const choice = await select<'trust' | 'no-trust'>({
      message: 'This workspace is not trusted. Keep debug logs under .poyraz/?',
      choices: [
        {
          name: 'Yes, trust this workspace (enable logs)',
          value: 'trust',
        },
        {
          name: 'No (no file logging)',
          value: 'no-trust',
        },
      ],
    });

    const trusted = choice === 'trust';
    writeWorkspaceSettings(workspaceRoot, { trusted });
    applyWorkspaceFileLogging(workspaceRoot, trusted);

    if (trusted) {
      console.log(chalk.gray(`Workspace logs: ${path.join(workspaceRoot, '.poyraz', 'log')}`));
    }
  } catch (error) {
    if (isPromptCancelled(error)) {
      writeWorkspaceSettings(workspaceRoot, { trusted: false });
      applyWorkspaceFileLogging(workspaceRoot, false);
      return;
    }
    throw error;
  }
}
