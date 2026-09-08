import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import type { ReplSurface } from './repl-surface.js';
import { printSection, theme } from './repl-theme.js';

export type ReplPanelHooks = {
  pauseEditor: () => void;
  resumeEditor: () => void;
  surface?: ReplSurface;
};

export function isPanelCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

/**
 * Standard pause/resume + optional section title around Inquirer panels.
 */
export async function withReplPanel<T>(
  hooks: ReplPanelHooks,
  title: string | undefined,
  run: () => Promise<T>
): Promise<T | undefined> {
  hooks.pauseEditor();
  hooks.surface?.clearStatus();
  try {
    if (title) printSection(title);
    return await run();
  } catch (error: unknown) {
    if (isPanelCancelled(error)) {
      hooks.surface?.showToast(theme.meta('Cancelled.'));
      return undefined;
    }
    throw error;
  } finally {
    hooks.resumeEditor();
  }
}
