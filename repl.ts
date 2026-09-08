import {
  Agent,
  AgentStreamEvent,
  ChatAbortedError,
  createActivityTracker,
  mcpClientManager,
  nextAgentMode,
  AGENT_MODES,
  type ListedChatModelRow,
} from 'poyraz';
import { printReplBanner } from './repl-banner.js';
import { switchAgentModeQuiet, type ReplCommandContext } from './repl-commands.js';
import { buildInputMessage, isExitCommand } from './repl-input.js';
import { ReplExitRequest, ReplLineEditor } from './repl-line-editor.js';
import { prefetchModels, refreshModels } from './repl-models.js';
import {
  createStreamOutputState,
  finalizeStreamOutput,
  handleStreamEvent,
  handleSubagentUiEvent,
} from './repl-output.js';
import { dispatchReplCommand } from './repl-router.js';
import { ReplStatusLine } from './repl-status.js';
import { ReplSubagentStatus } from './repl-subagent-status.js';
import { ReplSurface } from './repl-surface.js';
import { showModeToast } from './repl-toast.js';
import { theme } from './repl-theme.js';

type ReplContext = ReplCommandContext & {
  getModelRows: () => ListedChatModelRow[];
};

export class ChatRepl {
  private busy = false;
  private abortRequested = false;
  private tracker = createActivityTracker();
  private exiting = false;
  private modelRows: ListedChatModelRow[] = [];
  private chatAbort?: AbortController;
  private surface = new ReplSurface();
  private statusLine = new ReplStatusLine(this.surface);
  private subagentStatus = new ReplSubagentStatus();
  private unsubscribeSubagent?: () => void;
  private chatSigIntHandler?: () => void;
  private verbose = false;
  private editor: ReplLineEditor;

  constructor(private agent: Agent) {
    this.editor = new ReplLineEditor({
      surface: this.surface,
      getPrompt: () =>
        buildInputMessage(this.agent, this.subagentStatus.promptSuffix()),
      onModeCycle: () => {
        const next = nextAgentMode(this.agent.getMode());
        if (this.agent.getMode() === next) return;
        switchAgentModeQuiet(this.commandContext(), next);
        showModeToast(this.surface, AGENT_MODES[next].label);
      },
    });
  }

  private commandContext(): ReplContext {
    return {
      agent: this.agent,
      getModelRows: () => this.modelRows,
      onModelsRefreshed: () => refreshModels(this.modelRows),
      onModeChanged: () => this.editor.refreshPrompt(),
      onModelChange: () => this.editor.refreshPrompt(),
      onAuthChanged: async () => {
        const profile = this.agent.getModelProfile();
        this.agent.setModelProfile(profile);
        await refreshModels(this.modelRows);
        this.editor.refreshPrompt();
      },
      onMcpChanged: async () => {
        this.agent.removeExternalTools();
        const tools = await mcpClientManager.connectAll();
        if (Object.keys(tools).length > 0) this.agent.mergeExternalTools(tools);
      },
    };
  }

  async start(): Promise<void> {
    const mcpConnected = mcpClientManager
      .listStates()
      .filter((state) => state.status === 'connected').length;
    printReplBanner(this.agent, mcpConnected);
    void prefetchModels(this.modelRows).catch(() => {});

    this.subagentStatus.setOnChange(() => {
      if (!this.busy) this.editor.refreshPrompt();
      else this.statusLine.setSubagentLabel(this.subagentStatus.statusLabel());
    });
    this.subagentStatus.syncFromSnapshot(this.agent.getSubagentJobStatus());
    this.unsubscribeSubagent = this.agent.subscribeSubagentEvents((event) => {
      handleSubagentUiEvent(event, {
        verbose: this.verbose,
        statusLine: this.statusLine,
        surface: this.surface,
        subagentStatus: this.subagentStatus,
        showStatusLine: this.busy,
        onIdleChange: () => {
          if (!this.busy) this.editor.refreshPrompt();
        },
      });
    });

    while (!this.exiting) {
      let text: string;
      try {
        text = await this.editor.readLine();
      } catch (error: unknown) {
        if (error instanceof ReplExitRequest) {
          await this.close();
          return;
        }
        throw error;
      }

      const trimmed = text.trim();
      if (!trimmed) continue;

      this.editor.pushHistory(trimmed);

      if (isExitCommand(trimmed)) {
        await this.close();
        return;
      }

      if (trimmed.startsWith('/')) {
        await this.runCommand(trimmed);
      } else {
        await this.handleMessage(trimmed);
      }
    }
  }

  private async runCommand(text: string): Promise<void> {
    try {
      await dispatchReplCommand(text, {
        ...this.commandContext(),
        verbose: this.verbose,
        setVerbose: (value) => {
          this.verbose = value;
        },
        pauseEditor: () => this.editor.pause(),
        resumeEditor: () => this.editor.resume(),
        surface: this.surface,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.surface.writeLine(theme.error(`Error: ${message}`));
    }
  }

  private abortActiveChat(): void {
    if (!this.busy) return;
    if (this.abortRequested) {
      this.statusLine.clearParent();
      return;
    }
    this.abortRequested = true;
    this.statusLine.clearParent();
    this.agent.cancelActiveSubagent('interrupted by user');
    this.chatAbort?.abort();
  }

  private chatWithAbort(
    text: string,
    handlers: { onEvent: (event: AgentStreamEvent) => void; signal: AbortSignal }
  ) {
    const signal = handlers.signal;
    return Promise.race([
      this.agent.chat(text, handlers),
      new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new ChatAbortedError());
          return;
        }
        signal.addEventListener('abort', () => reject(new ChatAbortedError()), {
          once: true,
        });
      }),
    ]);
  }

  private enableChatInterrupt(): void {
    const onInterrupt = () => {
      if (this.busy) this.abortActiveChat();
    };
    this.chatSigIntHandler = onInterrupt;
    process.on('SIGINT', onInterrupt);
  }

  private disableChatInterrupt(): void {
    if (!this.chatSigIntHandler) return;
    process.removeListener('SIGINT', this.chatSigIntHandler);
    this.chatSigIntHandler = undefined;
  }

  private async close(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    this.unsubscribeSubagent?.();
    this.unsubscribeSubagent = undefined;
    this.subagentStatus.clear();
    this.statusLine.stopAll();
    this.surface.dispose();
    if (this.agent.getSubagentJobStatus()?.status === 'running') {
      this.agent.cancelActiveSubagent('repl exit');
    }
    this.editor.close();
    console.log(theme.meta('Goodbye.'));
    await mcpClientManager.disconnectAll().catch(() => {});
    process.exit(0);
  }

  private async handleMessage(text: string): Promise<void> {
    this.busy = true;
    this.abortRequested = false;
    this.tracker = createActivityTracker();
    this.chatAbort = new AbortController();
    this.chatAbort.signal.addEventListener(
      'abort',
      () => {
        this.statusLine.clearParent();
      },
      { once: true }
    );

    const outputState = createStreamOutputState();
    this.statusLine.setSubagentLabel(this.subagentStatus.statusLabel());
    this.enableChatInterrupt();

    try {
      const result = await this.chatWithAbort(text, {
        onEvent: (event) =>
          handleStreamEvent(event, outputState, {
            verbose: this.verbose,
            statusLine: this.statusLine,
            surface: this.surface,
            agent: this.agent,
            tracker: this.tracker,
          }),
        signal: this.chatAbort.signal,
      });

      this.statusLine.clearParent();
      const context = this.agent.getContextUsage();
      finalizeStreamOutput(
        outputState,
        this.surface,
        result.content,
        result.usage?.totalTokens,
        context.percentage
      );
    } catch (error: unknown) {
      this.statusLine.clearParent();
      if (error instanceof ChatAbortedError) {
        this.surface.writeLine(theme.warning('Reply aborted.'));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.surface.writeLine(theme.error(`Error: ${message}`));
      }
    } finally {
      this.disableChatInterrupt();
      this.statusLine.setSubagentLabel(undefined);
      this.statusLine.clearParent();
      this.chatAbort = undefined;
      this.busy = false;
      this.abortRequested = false;
    }
  }
}
