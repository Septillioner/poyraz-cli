import * as readline from 'node:readline';
import chalk from 'chalk';

/**
 * Single owner for TTY layout: transcript scrolls up; optional status sits on
 * the current row while streaming; readline owns the input row while idle.
 */
export class ReplSurface {
  private statusText = '';
  private statusVisible = false;
  private inputActive = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  beginInput(): void {
    this.clearStatusRow();
    this.inputActive = true;
  }

  endInput(): void {
    this.inputActive = false;
  }

  isInputActive(): boolean {
    return this.inputActive;
  }

  /** Write a full transcript line (clears any status row first). */
  writeLine(text: string): void {
    this.clearStatusRow();
    process.stdout.write(`${text}\n`);
    this.restoreStatusRow();
  }

  /** Write raw stream chunks without forcing a newline. */
  writeRaw(chunk: string): void {
    this.clearStatusRow();
    process.stdout.write(chunk);
  }

  /** After a raw stream ends mid-line, finish the line cleanly. */
  endRawLine(): void {
    process.stdout.write('\n');
    this.restoreStatusRow();
  }

  setStatus(label: string | undefined): void {
    const next = label?.trim() ?? '';
    if (next === this.statusText && this.statusVisible) return;
    this.clearStatusRow();
    this.statusText = next;
    if (!next || this.inputActive) {
      this.statusVisible = false;
      return;
    }
    this.renderStatus();
  }

  clearStatus(): void {
    this.clearStatusRow();
    this.statusText = '';
    this.statusVisible = false;
  }

  showToast(message: string): void {
    if (this.toastTimer !== undefined) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }
    this.clearStatusRow();
    process.stdout.write(`${chalk.gray(message)}\n`);
    this.restoreStatusRow();
  }

  dispose(): void {
    if (this.toastTimer !== undefined) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }
    this.clearStatus();
  }

  private clearStatusRow(): void {
    if (!this.statusVisible) return;
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    this.statusVisible = false;
  }

  private restoreStatusRow(): void {
    if (this.inputActive || !this.statusText) return;
    this.renderStatus();
  }

  private renderStatus(): void {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(chalk.gray(`  ${this.statusText}`));
    this.statusVisible = true;
  }
}
