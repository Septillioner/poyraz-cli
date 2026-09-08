import type { ReplSurface } from './repl-surface.js';

/**
 * Calm status label above transcript writes (no 90ms spinner redraw).
 */
export class ReplStatusLine {
  private parentLabel = '';
  private subagentLabel = '';

  constructor(private readonly surface: ReplSurface) {}

  start(label: string): void {
    this.parentLabel = label.trim();
    this.push();
  }

  setSubagentLabel(label: string | undefined): void {
    this.subagentLabel = label?.trim() ?? '';
    this.push();
  }

  clearParent(): void {
    this.parentLabel = '';
    this.push();
  }

  stop(): void {
    this.parentLabel = '';
    this.push();
  }

  stopAll(): void {
    this.parentLabel = '';
    this.subagentLabel = '';
    this.surface.clearStatus();
  }

  private composedLabel(): string {
    if (this.parentLabel && this.subagentLabel) {
      return `${this.parentLabel} · ${this.subagentLabel}`;
    }
    return this.parentLabel || this.subagentLabel;
  }

  private push(): void {
    const label = this.composedLabel();
    if (!label) {
      this.surface.clearStatus();
      return;
    }
    this.surface.setStatus(label);
  }
}
