import { isTabKey, type KeypressEvent } from '@inquirer/core';

type KeyWithSequence = KeypressEvent & {
  sequence?: string;
  code?: string;
  meta?: boolean;
};

export type DetectedShell = 'powershell' | 'cmd' | 'wsl' | 'unix' | 'unknown';

export function detectShell(): DetectedShell {
  if (process.platform !== 'win32') return 'unix';
  if (process.env.WSL_DISTRO_NAME) return 'wsl';
  if (process.env.PSModulePath) return 'powershell';
  if (process.env.ComSpec?.toLowerCase().includes('cmd.exe')) return 'cmd';
  return 'unknown';
}

/**
 * Mode-cycle shortcut keys.
 * Windows Console cannot distinguish Shift+Tab from Tab (both are 0x09); any Tab cycles.
 */
export function isModeCycleKey(key: KeyWithSequence): boolean {
  if (key.sequence === '\x1b[Z' || key.code === '[Z') return true;
  if (key.shift && key.name === 'tab') return true;
  if (isTabKey(key) && !key.ctrl && !key.meta) return true;
  if (key.ctrl && key.shift && key.name === 'm') return true;
  return false;
}

export function modeCycleHint(): string {
  if (process.platform === 'win32' && detectShell() !== 'wsl') {
    return 'Tab / Shift+Tab mod (Windows) · /mode';
  }
  return 'Shift+Tab mod · /mode';
}
