import * as readline from 'node:readline';
import { emitKeypressEvents } from 'node:readline';
import {
  completeAtCursor,
} from './repl-autocomplete.js';
import type { ReplSurface } from './repl-surface.js';
import {
  getCtrlCExitWindowMs,
  isEscapeKey,
  isHistoryDownKey,
  isHistoryUpKey,
  isModeCycleKey,
  isPlainTabKey,
  type KeyWithSequence,
} from './repl-terminal.js';
import { theme } from './repl-theme.js';

const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';
const PASTE_START = 'paste-start';
const PASTE_END = 'paste-end';
const MAX_HISTORY = 200;
const PROMPT_REFRESH_DEBOUNCE_MS = 80;

export class ReplExitRequest extends Error {
  constructor() {
    super('REPL exit requested');
    this.name = 'ReplExitRequest';
  }
}

type ReadlineInternals = readline.Interface & {
  line: string;
  cursor: number;
  _refreshLine?: () => void;
};

type PasteState = {
  active: boolean;
  buffer: string;
  preLine: string;
  preCursor: number;
  lastWasReturn: boolean;
};

export type ReplLineEditorOptions = {
  getPrompt: () => string;
  onModeCycle: () => void;
  surface: ReplSurface;
};

function createPasteState(): PasteState {
  return { active: false, buffer: '', preLine: '', preCursor: 0, lastWasReturn: false };
}

function appendPastedKey(state: PasteState, key: KeyWithSequence): void {
  if (key.name === 'return') {
    state.buffer += '\n';
    state.lastWasReturn = true;
    return;
  }
  if (key.name === 'enter') {
    if (state.lastWasReturn) {
      state.lastWasReturn = false;
      return;
    }
    state.buffer += '\n';
    return;
  }
  state.lastWasReturn = false;
  if (key.name === 'tab' || key.sequence === '\t') return;
  state.buffer += key.sequence ?? '';
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

/**
 * Session-scoped line editor. One readline interface for the whole REPL session.
 * Nested Inquirer panels must call pause()/resume() around their lifetime.
 */
export class ReplLineEditor {
  private readonly rl: ReadlineInternals;
  private readonly history: string[] = [];
  private historyIndex = -1;
  private historyDraft = '';
  private lastCompletion?: string;
  private lastCtrlCAt = 0;
  private paste = createPasteState();
  private paused = false;
  private reading = false;
  private resolveLine?: (value: string) => void;
  private rejectLine?: (error: Error) => void;
  private lineListener?: (value: string) => void;
  private keyHandler?: (input: string, key: KeyWithSequence) => void;
  private closed = false;
  private bracketedPasteEnabled = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private lastRenderedPrompt = '';

  constructor(private readonly options: ReplLineEditorOptions) {
    emitKeypressEvents(process.stdin);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 0,
      // Swallow Tab so readline never inserts a literal tab character.
      completer: (line: string) => [[], line],
    }) as ReadlineInternals;

    this.rl.on('SIGINT', () => {
      if (this.paused || !this.reading) return;
      this.handleCtrlC();
    });

    this.rl.on('close', () => {
      this.disableBracketedPaste();
      if (this.reading && this.rejectLine) {
        this.rejectLine(new ReplExitRequest());
        this.clearPending();
      }
    });
  }

  pause(): void {
    this.paused = true;
    this.detachKeypress();
    this.rl.pause();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  resume(): void {
    this.paused = false;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    this.rl.resume();
  }

  /** Re-apply getPrompt() while a line is being edited (debounced). */
  refreshPrompt(): void {
    if (!this.reading || this.paused) return;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refreshPromptNow();
    }, PROMPT_REFRESH_DEBOUNCE_MS);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.detachKeypress();
    this.disableBracketedPaste();
    this.rl.close();
  }

  async readLine(): Promise<string> {
    if (this.closed) throw new ReplExitRequest();
    if (this.reading) {
      throw new Error('ReplLineEditor.readLine is already waiting for input');
    }

    this.reading = true;
    this.options.surface.beginInput();
    this.lastCompletion = undefined;
    this.historyIndex = -1;
    this.historyDraft = '';
    this.paste = createPasteState();
    this.enableBracketedPaste();
    this.setLine('', 0);
    this.renderPrompt(true);
    this.attachKeypress();

    return new Promise<string>((resolve, reject) => {
      this.resolveLine = resolve;
      this.rejectLine = reject;

      this.lineListener = (value: string) => {
        this.finishSubmit(value);
      };
      this.rl.once('line', this.lineListener);
    });
  }

  private finishSubmit(value: string): void {
    const cleaned = value.replace(/\t/g, '');
    this.detachKeypress();
    this.reading = false;
    this.options.surface.endInput();
    const resolve = this.resolveLine;
    this.clearPending();
    resolve?.(cleaned);
  }

  private clearPending(): void {
    if (this.lineListener) {
      this.rl.off('line', this.lineListener);
      this.lineListener = undefined;
    }
    this.resolveLine = undefined;
    this.rejectLine = undefined;
  }

  private renderPrompt(force = false): void {
    const prompt = `${this.options.getPrompt()} `;
    if (!force && prompt === this.lastRenderedPrompt) return;
    this.lastRenderedPrompt = prompt;
    this.rl.setPrompt(prompt);
    this.rl.prompt(true);
  }

  private refreshPromptNow(): void {
    if (!this.reading || this.paused) return;
    const line = this.rl.line ?? '';
    const cursor = this.rl.cursor ?? line.length;
    this.renderPrompt();
    this.setLine(line, cursor);
  }

  private setLine(text: string, cursor: number): void {
    this.rl.line = text;
    this.rl.cursor = Math.max(0, Math.min(cursor, text.length));
    this.rl._refreshLine?.();
  }

  private currentLine(): string {
    return (this.rl.line ?? '').replace(/\t/g, '');
  }

  private attachKeypress(): void {
    this.detachKeypress();
    this.keyHandler = (_input, key) => {
      if (this.paused || !this.reading) return;
      this.handleKeypress(key);
    };
    process.stdin.on('keypress', this.keyHandler);
  }

  private detachKeypress(): void {
    if (!this.keyHandler) return;
    process.stdin.off('keypress', this.keyHandler);
    this.keyHandler = undefined;
  }

  private handleKeypress(key: KeyWithSequence): void {
    if (!key) return;

    if (key.name === PASTE_START) {
      this.paste.active = true;
      this.paste.buffer = '';
      this.paste.preLine = this.currentLine();
      this.paste.preCursor = this.rl.cursor ?? this.paste.preLine.length;
      this.paste.lastWasReturn = false;
      return;
    }

    if (this.paste.active) {
      if (key.name === PASTE_END) {
        const head = this.paste.preLine.slice(0, this.paste.preCursor);
        const tail = this.paste.preLine.slice(this.paste.preCursor);
        const next = head + this.paste.buffer + tail;
        const lines = countLines(this.paste.buffer);
        this.setLine(next, head.length + this.paste.buffer.length);
        this.paste = createPasteState();
        this.lastCompletion = undefined;
        if (lines > 1) {
          this.options.surface.showToast(theme.meta(`Pasted ${lines} lines`));
          this.refreshPromptNow();
        }
        return;
      }
      appendPastedKey(this.paste, key);
      return;
    }

    if (isModeCycleKey(key)) {
      const line = this.currentLine();
      const cursor = this.rl.cursor ?? line.length;
      this.options.onModeCycle();
      this.renderPrompt(true);
      this.setLine(line, cursor);
      this.lastCompletion = undefined;
      return;
    }

    if (isPlainTabKey(key) || this.currentLine().includes('\t')) {
      this.applyTabCompletion();
      return;
    }

    if (isEscapeKey(key)) {
      this.clearDraft();
      return;
    }

    if (isHistoryUpKey(key)) {
      this.historyUp();
      return;
    }

    if (isHistoryDownKey(key)) {
      this.historyDown();
      return;
    }

    setImmediate(() => {
      if (!this.reading || this.paused) return;
      if (this.currentLine().includes('\t')) {
        this.applyTabCompletion();
      } else {
        this.lastCompletion = undefined;
      }
    });
  }

  private applyTabCompletion(): void {
    const line = this.currentLine();
    const cursor = this.rl.cursor ?? line.length;
    const result = completeAtCursor(line, cursor, undefined, this.lastCompletion);
    if (!result) {
      this.setLine(line, cursor);
      return;
    }
    this.setLine(result.line, result.cursor);
    this.lastCompletion = result.applied;
    if (result.matches && result.matches.length > 1) {
      const shown = result.matches.slice(0, 4).join(' · ');
      const more = result.matches.length > 4 ? ` · +${result.matches.length - 4}` : '';
      this.options.surface.showToast(theme.meta(`Tab: ${shown}${more}`));
      this.refreshPromptNow();
    }
  }

  private clearDraft(): void {
    this.setLine('', 0);
    this.historyIndex = -1;
    this.historyDraft = '';
    this.lastCompletion = undefined;
    this.lastCtrlCAt = 0;
  }

  private handleCtrlC(): void {
    const line = this.currentLine();
    if (line.length > 0) {
      this.clearDraft();
      return;
    }

    const now = Date.now();
    if (now - this.lastCtrlCAt <= getCtrlCExitWindowMs()) {
      this.detachKeypress();
      this.reading = false;
      this.options.surface.endInput();
      const reject = this.rejectLine;
      this.clearPending();
      reject?.(new ReplExitRequest());
      return;
    }

    this.lastCtrlCAt = now;
    this.options.surface.showToast(theme.meta('Ctrl+C again to exit'));
    this.refreshPromptNow();
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.historyDraft = this.currentLine();
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    } else {
      return;
    }
    const entry = this.history[this.historyIndex] ?? '';
    this.setLine(entry, entry.length);
    this.lastCompletion = undefined;
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      const entry = this.history[this.historyIndex] ?? '';
      this.setLine(entry, entry.length);
    } else {
      this.historyIndex = -1;
      this.setLine(this.historyDraft, this.historyDraft.length);
      this.historyDraft = '';
    }
    this.lastCompletion = undefined;
  }

  pushHistory(entry: string): void {
    const trimmed = entry.trim();
    if (!trimmed) return;
    if (this.history[this.history.length - 1] === trimmed) return;
    this.history.push(trimmed);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  private enableBracketedPaste(): void {
    if (!process.stdout.isTTY || this.bracketedPasteEnabled) return;
    process.stdout.write(ENABLE_BRACKETED_PASTE);
    this.bracketedPasteEnabled = true;
  }

  private disableBracketedPaste(): void {
    if (!this.bracketedPasteEnabled) return;
    process.stdout.write(DISABLE_BRACKETED_PASTE);
    this.bracketedPasteEnabled = false;
  }
}
