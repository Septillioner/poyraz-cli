export type KeyWithSequence = {
  name?: string;
  sequence?: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export type DetectedShell = 'powershell' | 'cmd' | 'wsl' | 'unix' | 'unknown';

const CTRL_C_EXIT_WINDOW_MS = 2000;

export function getCtrlCExitWindowMs(): number {
  return CTRL_C_EXIT_WINDOW_MS;
}

export function detectShell(): DetectedShell {
  if (process.platform !== 'win32') return 'unix';
  if (process.env.WSL_DISTRO_NAME) return 'wsl';
  if (process.env.PSModulePath) return 'powershell';
  if (process.env.ComSpec?.toLowerCase().includes('cmd.exe')) return 'cmd';
  return 'unknown';
}

/**
 * Mode-cycle shortcut: Shift+Tab (CSI Z) or Alt+M (meta / Esc+m).
 * Plain Tab is reserved for slash-command autocomplete.
 */
export function isModeCycleKey(key: KeyWithSequence): boolean {
  if (key.sequence === '\x1b[Z' || key.code === '[Z') return true;
  if (key.shift && key.name === 'tab') return true;
  if (key.meta && !key.ctrl && key.name === 'm') return true;
  // Some terminals emit Esc then m / M for Alt+M.
  if (key.sequence === '\x1bm' || key.sequence === '\x1bM') return true;
  return false;
}

export function isPlainTabKey(key: KeyWithSequence): boolean {
  if (isModeCycleKey(key)) return false;
  if (key.ctrl || key.meta || key.shift) return false;
  return key.name === 'tab' || key.sequence === '\t' || key.sequence === '\x09';
}

export function isHistoryUpKey(key: KeyWithSequence): boolean {
  return key.name === 'up' && !key.ctrl && !key.meta;
}

export function isHistoryDownKey(key: KeyWithSequence): boolean {
  return key.name === 'down' && !key.ctrl && !key.meta;
}

export function isEscapeKey(key: KeyWithSequence): boolean {
  return key.name === 'escape' || key.sequence === '\x1b';
}

export function isEnterKey(key: KeyWithSequence): boolean {
  return key.name === 'return' || key.name === 'enter';
}

export function modeCycleHint(): string {
  return 'Shift+Tab / Alt+M cycle mode · Tab complete · /help';
}
