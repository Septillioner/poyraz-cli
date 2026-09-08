import {
  AgentStreamEvent,
  applyStreamEvent,
  createActivityTracker,
  formatTodoTable,
  getLifecycleLabel,
  stripMarkersFromCodeEdit,
  type Agent,
  type ToolActivityView,
} from 'poyraz';
import { renderEditFrame } from './repl-edit-frame.js';
import type { ReplStatusLine } from './repl-status.js';
import type { ReplSubagentStatus } from './repl-subagent-status.js';
import type { ReplSurface } from './repl-surface.js';
import { theme } from './repl-theme.js';

export type StreamOutputOptions = {
  verbose: boolean;
  statusLine: ReplStatusLine;
  surface: ReplSurface;
  agent: Agent;
  tracker: ReturnType<typeof createActivityTracker>;
};

export type SubagentOutputOptions = {
  verbose: boolean;
  statusLine: ReplStatusLine;
  surface: ReplSurface;
  subagentStatus: ReplSubagentStatus;
  showStatusLine: boolean;
  onIdleChange?: () => void;
};

export type StreamOutputState = {
  fullResponse: string;
  isStreaming: boolean;
  isReasoningStreaming: boolean;
};

export function createStreamOutputState(): StreamOutputState {
  return {
    fullResponse: '',
    isStreaming: false,
    isReasoningStreaming: false,
  };
}

function printEditFrame(surface: ReplSurface, view: ToolActivityView): void {
  const codeEdit = view.args?.code_edit;
  const targetFile = view.args?.target_file;
  if (typeof codeEdit !== 'string' || typeof targetFile !== 'string') return;

  const code = stripMarkersFromCodeEdit(codeEdit);
  if (!code.trim()) return;

  const ranges =
    (view.resultMeta?.changed_ranges as
      | Array<{ start_line: number; lines_added: number; lines_removed: number }>
      | undefined) ?? [];
  const hasRanges = ranges.length > 0;
  const linesAdded = ranges.reduce((sum, r) => sum + r.lines_added, 0);
  const linesRemoved = ranges.reduce((sum, r) => sum + r.lines_removed, 0);

  const frame = renderEditFrame({
    filePath: targetFile,
    code,
    startLine: hasRanges ? ranges[0].start_line : 1,
    linesAdded: hasRanges ? linesAdded : undefined,
    linesRemoved: hasRanges ? linesRemoved : undefined,
  });
  for (const line of frame.split('\n')) {
    surface.writeLine(line);
  }
}

function syncSubagentStatusLine(
  statusLine: ReplStatusLine,
  subagentStatus: ReplSubagentStatus,
  showStatusLine: boolean
): void {
  if (!showStatusLine) {
    statusLine.setSubagentLabel(undefined);
    return;
  }
  statusLine.setSubagentLabel(subagentStatus.statusLabel());
}

function endReasoningStream(state: StreamOutputState, surface: ReplSurface): void {
  if (!state.isReasoningStreaming) return;
  surface.endRawLine();
  state.isReasoningStreaming = false;
}

/** Handle background subagent lifecycle/tool events (single UI path). */
export function handleSubagentUiEvent(
  event: AgentStreamEvent,
  options: SubagentOutputOptions
): boolean {
  const { verbose, statusLine, surface, subagentStatus, showStatusLine, onIdleChange } =
    options;

  switch (event.type) {
    case 'subagent.task.started': {
      statusLine.clearParent();
      surface.writeLine(
        theme.meta(
          `[subagent] ${event.model} · ${event.taskPreview || event.taskId}`
        )
      );
      subagentStatus.handleEvent(event);
      syncSubagentStatusLine(statusLine, subagentStatus, showStatusLine);
      onIdleChange?.();
      return true;
    }
    case 'subagent.task.progress': {
      subagentStatus.handleEvent(event);
      syncSubagentStatusLine(statusLine, subagentStatus, showStatusLine);
      onIdleChange?.();
      return true;
    }
    case 'subagent.tool.start': {
      if (verbose) {
        surface.writeLine(theme.meta(`  ↳ ${event.toolName}`));
      }
      return true;
    }
    case 'subagent.tool.result': {
      if (verbose) {
        const tag = event.ok ? 'ok' : 'err';
        surface.writeLine(theme.meta(`  ↳ ${tag} ${event.toolName}`));
        if (event.preview) surface.writeLine(theme.meta(`      ${event.preview}`));
      }
      return true;
    }
    case 'subagent.task.completed': {
      statusLine.clearParent();
      const tokens = event.usage.totalTokens.toLocaleString();
      const seconds = Math.max(1, Math.round(event.durationMs / 1000));
      surface.writeLine(
        theme.success(`[subagent done] ${seconds}s · ${event.model} · ${tokens} tokens`)
      );
      subagentStatus.handleEvent(event);
      syncSubagentStatusLine(statusLine, subagentStatus, showStatusLine);
      onIdleChange?.();
      return true;
    }
    case 'subagent.task.failed': {
      statusLine.clearParent();
      const seconds = Math.max(1, Math.round(event.durationMs / 1000));
      surface.writeLine(theme.error(`[subagent failed] ${seconds}s · ${event.model}`));
      surface.writeLine(theme.error(`  ${event.error}`));
      subagentStatus.handleEvent(event);
      syncSubagentStatusLine(statusLine, subagentStatus, showStatusLine);
      onIdleChange?.();
      return true;
    }
    case 'subagent.task.cancelled': {
      statusLine.clearParent();
      const seconds = Math.max(1, Math.round(event.durationMs / 1000));
      const reason = event.reason ? ` · ${event.reason}` : '';
      surface.writeLine(
        theme.warning(`[subagent cancelled] ${seconds}s · ${event.model}${reason}`)
      );
      subagentStatus.handleEvent(event);
      syncSubagentStatusLine(statusLine, subagentStatus, showStatusLine);
      onIdleChange?.();
      return true;
    }
    case 'subagent.task.injected':
      return true;
    default:
      return false;
  }
}

function isSubagentEvent(event: AgentStreamEvent): boolean {
  return event.type.startsWith('subagent.');
}

export function handleStreamEvent(
  event: AgentStreamEvent,
  state: StreamOutputState,
  options: StreamOutputOptions
): void {
  if (isSubagentEvent(event)) return;

  const { verbose, statusLine, surface, agent, tracker } = options;

  if (event.type === 'lifecycle') {
    if (event.phase === 'summarized') {
      statusLine.clearParent();
      return;
    }
    const label = getLifecycleLabel(event.phase);
    if (label) statusLine.start(label);
    return;
  }

  if (event.type === 'reasoning.delta') {
    if (!verbose) return;
    statusLine.clearParent();
    if (!state.isReasoningStreaming) {
      surface.writeRaw(theme.meta('Thinking> '));
      state.isReasoningStreaming = true;
    }
    surface.writeRaw(theme.meta(event.delta));
    return;
  }

  if (event.type === 'text.delta') {
    statusLine.clearParent();
    endReasoningStream(state, surface);
    if (!state.isStreaming) {
      surface.writeRaw(theme.agentPrefix());
      state.isStreaming = true;
    }
    state.fullResponse += event.delta;
    surface.writeRaw(event.delta);
    return;
  }

  const view = applyStreamEvent(tracker, event);
  if (!view) return;

  if (event.type === 'tool.call.start') {
    statusLine.clearParent();
    endReasoningStream(state, surface);
    if (state.isStreaming) {
      surface.endRawLine();
      state.isStreaming = false;
    }
    surface.writeLine(
      theme.tool(`[tool] ${view.label}${view.detail ? `: ${view.detail}` : ''}`)
    );
    if (verbose && view.toolName === 'edit_file' && view.args) {
      const instructions = view.args.instructions;
      if (typeof instructions === 'string' && instructions.trim()) {
        surface.writeLine(theme.meta(`  ${instructions}`));
      }
    }
    return;
  }

  if (event.type === 'tool.call.result') {
    statusLine.clearParent();
    endReasoningStream(state, surface);
    if (state.isStreaming) {
      surface.endRawLine();
      state.isStreaming = false;
    }
    const tag =
      view.status === 'error'
        ? theme.error('[error]')
        : view.status === 'blocked'
          ? theme.warning('[blocked]')
          : theme.success('[ok]');
    surface.writeLine(`${tag} ${view.label}`);
    if (view.resultPreview) surface.writeLine(theme.meta(`  ${view.resultPreview}`));
    if (view.status === 'success' && view.toolName === 'todo_write') {
      for (const line of formatTodoTable(agent.getCachedTodoSnapshot()).split('\n')) {
        surface.writeLine(theme.meta(line));
      }
    }
    if (view.status === 'success' && view.toolName === 'edit_file') {
      printEditFrame(surface, view);
    }
    if (
      verbose &&
      view.toolName === 'run_terminal_cmd' &&
      typeof view.resultMeta?.cwd === 'string'
    ) {
      surface.writeLine(theme.meta(`  cwd: ${view.resultMeta.cwd}`));
    }
  }
}

export function finalizeStreamOutput(
  state: StreamOutputState,
  surface: ReplSurface,
  content: string | undefined,
  usageTotal?: number,
  contextPercentage?: number
): void {
  if (state.isReasoningStreaming) {
    surface.endRawLine();
    state.isReasoningStreaming = false;
  }

  if (!state.isStreaming && content) {
    surface.writeLine(theme.agentPrefix() + content);
  } else if (state.isStreaming) {
    surface.endRawLine();
    state.isStreaming = false;
  }

  if (usageTotal) {
    const contextNote =
      contextPercentage !== undefined && contextPercentage >= 70
        ? theme.warning(` · context ${contextPercentage}%`)
        : '';
    surface.writeLine(theme.meta(`  (${usageTotal} tokens${contextNote})`));
  }
}
