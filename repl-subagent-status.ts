import type { AgentStreamEvent, SubagentJobSnapshot } from 'poyraz';

const TICK_MS = 1000;

export type SubagentUiState = {
  taskId: string;
  model: string;
  taskPreview: string;
  startedAt: number;
  toolName?: string;
  toolDetail?: string;
  phase: 'running' | 'done';
};

/**
 * Tracks the active background subagent for prompt/status rendering.
 * Does not own stdout writing — callers drive ReplStatusLine / prompt suffix.
 */
export class ReplSubagentStatus {
  private state: SubagentUiState | undefined;
  private tick?: ReturnType<typeof setInterval>;
  private onChange?: () => void;
  private lastPromptSuffix?: string;
  private lastStatusLabel?: string;

  setOnChange(handler?: () => void): void {
    this.onChange = handler;
  }

  getState(): SubagentUiState | undefined {
    return this.state ? { ...this.state } : undefined;
  }

  isRunning(): boolean {
    return this.state?.phase === 'running';
  }

  statusLabel(): string | undefined {
    if (!this.state || this.state.phase !== 'running') return undefined;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.state.startedAt) / 1000));
    const tool = this.state.toolName ? ` · ${this.state.toolName}` : '';
    return `subagent · ${this.state.model}${tool} · ${elapsedSec}s`;
  }

  promptSuffix(): string | undefined {
    if (!this.state || this.state.phase !== 'running') return undefined;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.state.startedAt) / 1000));
    return `subagent ${elapsedSec}s`;
  }

  syncFromSnapshot(snapshot: SubagentJobSnapshot | undefined): void {
    if (!snapshot || snapshot.status !== 'running') {
      this.clear();
      return;
    }
    this.state = {
      taskId: snapshot.taskId,
      model: snapshot.model,
      taskPreview: snapshot.taskPreview,
      startedAt: snapshot.startedAt,
      phase: 'running',
    };
    this.ensureTick();
    this.emitIfChanged();
  }

  handleEvent(event: AgentStreamEvent): void {
    switch (event.type) {
      case 'subagent.task.started':
        this.state = {
          taskId: event.taskId,
          model: event.model,
          taskPreview: event.taskPreview,
          startedAt: event.startedAt,
          phase: 'running',
        };
        this.ensureTick();
        this.emitIfChanged(true);
        return;
      case 'subagent.task.progress':
        if (!this.state || this.state.taskId !== event.taskId) return;
        this.state = {
          ...this.state,
          toolName: event.toolName,
          toolDetail: event.toolDetail,
        };
        this.emitIfChanged();
        return;
      case 'subagent.task.completed':
      case 'subagent.task.failed':
      case 'subagent.task.cancelled':
        if (this.state?.taskId === event.taskId) {
          this.clear();
        }
        return;
      default:
        return;
    }
  }

  clear(): void {
    if (this.tick !== undefined) {
      clearInterval(this.tick);
      this.tick = undefined;
    }
    const had = Boolean(this.state);
    this.state = undefined;
    this.lastPromptSuffix = undefined;
    this.lastStatusLabel = undefined;
    if (had) this.onChange?.();
  }

  private emitIfChanged(force = false): void {
    const prompt = this.promptSuffix();
    const status = this.statusLabel();
    if (
      !force &&
      prompt === this.lastPromptSuffix &&
      status === this.lastStatusLabel
    ) {
      return;
    }
    this.lastPromptSuffix = prompt;
    this.lastStatusLabel = status;
    this.onChange?.();
  }

  private ensureTick(): void {
    if (this.tick !== undefined) return;
    this.tick = setInterval(() => {
      if (!this.isRunning()) {
        this.clear();
        return;
      }
      this.emitIfChanged();
    }, TICK_MS);
  }
}
