import type { ReplSurface } from './repl-surface.js';
import { theme } from './repl-theme.js';

/** Short one-line feedback above the next transcript/prompt. */
export function showToast(surface: ReplSurface, message: string): void {
  surface.showToast(message);
}

export function showModeToast(surface: ReplSurface, label: string): void {
  surface.showToast(theme.success(`Mode → ${label}`));
}

export function showInfoToast(surface: ReplSurface, message: string): void {
  surface.showToast(theme.meta(message));
}
